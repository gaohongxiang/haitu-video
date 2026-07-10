import { runMakeVideoPipeline, type MakeVideoReport } from "../pipeline/makeVideoPipeline.js";
import type { ModelPricingEntry } from "../modelPricing/officialModelPricingCatalog.js";
import type { ReferenceImageUrlResolver } from "../providers/types.js";
import type { BillingPolicyStore } from "./billingPolicyStore.js";
import type { ModelPricingCatalogContext } from "./modelPricingCatalogContext.js";
import type { ConsoleSettingsStore } from "./consoleSettings.js";
import {
  canRecoverVideoJobDownload
} from "./consoleVideoJobRecord.js";
import { removeGeneratedVideoJobOutputs } from "./consoleVideoJobCleanup.js";
import { completeVideoJob } from "./consoleVideoJobCompletion.js";
import { failedVideoJobPatch } from "./consoleVideoJobFailure.js";
import { createQueuedVideoJobRecord } from "./consoleVideoJobRecordFactory.js";
import { createMakeVideoPipelineInput } from "./consoleVideoJobPipelineInput.js";
import { createVideoJobRestartPlan } from "./consoleVideoJobRestartPlan.js";
import { LocalVideoJobStore } from "./consoleVideoJobStore.js";
import {
  queuedRecoverDownloadVideoJobPatch,
  queuedRetryVideoJobPatch
} from "./consoleVideoJobStatePatch.js";
import {
  captureVideoJobWalletCharge,
  releaseVideoJobWalletReservation
} from "./consoleVideoJobPersistence.js";
import { recordTrafficEvent } from "./adminTraffic.js";
import type { VideoJobRecord, VideoJobRequest } from "./consoleVideoJobTypes.js";
import type { DatabaseHandle } from "./db/client.js";
import { tokenPriceCnyPerMillionForVideoModel } from "./videoJobBilling.js";

export interface LocalVideoJobQueueOptions {
  rootDir: string;
  outputsDir: string;
  workspaceId?: string;
  settingsStore: ConsoleSettingsStore;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  runMakeVideoPipeline?: typeof runMakeVideoPipeline;
  referenceImageUrlResolver?: ReferenceImageUrlResolver;
  databaseHandle?: DatabaseHandle;
  billingPolicyStore?: BillingPolicyStore;
  modelPricingCatalog?: readonly ModelPricingEntry[];
  getModelPricingCatalogContext?: () => ModelPricingCatalogContext;
}

export class LocalVideoJobQueue {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly store: LocalVideoJobStore;

  constructor(private readonly options: LocalVideoJobQueueOptions) {
    this.store = new LocalVideoJobStore({
      outputsDir: options.outputsDir,
      workspaceId: options.workspaceId,
      databaseHandle: options.databaseHandle,
      mediaUrlForPath: mediaUrl
    });
  }

  async enqueue(request: VideoJobRequest): Promise<VideoJobRecord> {
    const settings = await this.options.settingsStore.read();
    const createdAt = this.nowIso();
    const id = await this.store.nextId(createdAt);
    const outDir = this.store.outputDirFor(request.outDirName ?? id);
    const record = createQueuedVideoJobRecord({
      id,
      workspaceId: this.options.workspaceId ?? "default",
      request,
      settings,
      outDir,
      createdAt,
      expiresAt: this.expiresAtIso(createdAt)
    });
    await this.store.write(record);
    this.safeRecordTrafficEvent({
      eventName: "creative_job_created",
      record,
      occurredAt: createdAt
    });
    this.chain = this.chain.then(() => this.run(record.id)).catch(() => undefined);
    return record;
  }

  async get(id: string): Promise<VideoJobRecord> {
    return this.store.read(id);
  }

  async cancel(id: string): Promise<VideoJobRecord> {
    const record = await this.store.read(id);
    if (record.status === "canceled") {
      return record;
    }
    const canceled = await this.update(record, {
      status: "canceled",
      completedAt: this.nowIso()
    });
    releaseVideoJobWalletReservation({
      databaseHandle: this.options.databaseHandle,
      workspaceId: this.options.workspaceId,
      now: this.options.now,
      record
    });
    return canceled;
  }

  async retry(
    id: string,
    options: {
      confirmPaid?: boolean;
      apiBillingMode?: VideoJobRequest["apiBillingMode"];
      platformFeeCny?: number;
      upstreamEstimatedCostCny?: number;
      walletReservationId?: string;
    } = {}
  ): Promise<VideoJobRecord> {
    const record = await this.store.read(id);
    if (record.status !== "failed") {
      throw new Error(`Can retry only failed local video jobs. Job ${id} is ${record.status}.`);
    }
    const retried = await this.update(record, queuedRetryVideoJobPatch({
      ...options,
      expiresAt: this.expiresAtIso(this.nowIso())
    }));
    this.chain = this.chain.then(() => this.run(retried.id)).catch(() => undefined);
    return retried;
  }

  async recoverDownload(id: string, options: { walletReservationId?: string } = {}): Promise<VideoJobRecord> {
    const record = await this.store.read(id);
    if (!canRecoverVideoJobDownload(record)) {
      throw new Error(`Can recover only video jobs that already generated a provider video but failed while downloading. Job ${id} cannot be recovered.`);
    }
    const queued = await this.update(record, queuedRecoverDownloadVideoJobPatch({
      reuseManifest: record.recoverableRawManifestPath,
      walletReservationId: options.walletReservationId ?? record.walletReservationId,
      expiresAt: this.expiresAtIso(this.nowIso())
    }));
    this.chain = this.chain.then(() => this.run(queued.id)).catch(() => undefined);
    return queued;
  }

  async list(): Promise<VideoJobRecord[]> {
    return this.store.list();
  }

  async startSavedJobs(): Promise<VideoJobRecord[]> {
    const records = await this.list();
    const plan = createVideoJobRestartPlan({
      records,
      completedAt: this.nowIso()
    });
    for (const item of plan.failRunningJobs) {
      await this.update(item.record, item.patch);
      releaseVideoJobWalletReservation({
        databaseHandle: this.options.databaseHandle,
        workspaceId: this.options.workspaceId,
        now: this.options.now,
        record: item.record
      });
    }
    for (const id of plan.resumeQueuedJobIds) {
      this.chain = this.chain.then(() => this.run(id)).catch(() => undefined);
    }
    return this.list();
  }

  async waitForIdle(id: string): Promise<VideoJobRecord> {
    await this.chain;
    return this.store.read(id);
  }

  private async run(id: string): Promise<void> {
    let record = await this.store.read(id);
    if (record.status === "canceled") {
      return;
    }
    record = await this.update(record, {
      status: "running",
      startedAt: this.nowIso()
    });
    try {
      const runPipeline = this.options.runMakeVideoPipeline ?? runMakeVideoPipeline;
      const modelPricingCatalogContext = this.currentModelPricingCatalogContext();
      const modelPricingCatalog = modelPricingCatalogContext?.catalog;
      const report = await runPipeline(createMakeVideoPipelineInput({
        record,
        fetchImpl: this.options.fetchImpl,
        referenceImageUrlResolver: this.options.referenceImageUrlResolver,
        tokenPriceCnyPerMillion: tokenPriceCnyPerMillionForVideoModel(record.providerModel, record.resolution, modelPricingCatalog),
        onProviderTaskCreated: async (providerTaskId) => {
          record = await this.update(record, { providerTaskId });
        }
      }));
      if ((await this.store.read(id)).status === "canceled") {
        await removeGeneratedVideoJobOutputs(record.outDir);
        return;
      }
      const completedPatch = await completeVideoJob({
        record,
        report,
        completedAt: this.nowIso(),
        mediaUrlForPath: mediaUrl,
        databaseHandle: this.options.databaseHandle,
        workspaceId: this.options.workspaceId,
        now: this.options.now,
        billingPolicyStore: this.options.billingPolicyStore,
        modelPricingCatalog,
        modelPricingCatalogVersion: record.billingCatalogVersion ?? modelPricingCatalogContext?.version
      });
      const completedRecord = await this.update(record, completedPatch);
      record = completedRecord;
      captureVideoJobWalletCharge({
        databaseHandle: this.options.databaseHandle,
        workspaceId: this.options.workspaceId,
        now: this.options.now,
        billingPolicyStore: this.options.billingPolicyStore,
        modelPricingCatalog,
        modelPricingCatalogVersion: record.billingCatalogVersion ?? modelPricingCatalogContext?.version,
        record: completedRecord
      });
      this.safeRecordTrafficEvent({
        eventName: "creative_job_completed",
        record: completedRecord,
        occurredAt: completedRecord.completedAt ?? completedRecord.updatedAt
      });
    } catch (error) {
      if ((await this.store.read(id)).status === "canceled") {
        await removeGeneratedVideoJobOutputs(record.outDir);
        return;
      }
      const failed = await this.update(record, await failedVideoJobPatch({
        record,
        error,
        completedAt: this.nowIso(),
        reportUrlForPath: mediaUrl,
        billingPolicyStore: this.options.billingPolicyStore
      }));
      if (!failed.canRecoverDownload) {
        releaseVideoJobWalletReservation({
          databaseHandle: this.options.databaseHandle,
          workspaceId: this.options.workspaceId,
          now: this.options.now,
          record
        });
      }
    }
  }

  private async update(
    record: VideoJobRecord,
    patch: Partial<VideoJobRecord>
  ): Promise<VideoJobRecord> {
    const next = {
      ...record,
      ...patch,
      updatedAt: this.nowIso()
    };
    await this.store.write(next);
    return next;
  }

  private nowIso(): string {
    return (this.options.now ?? (() => new Date()))().toISOString();
  }

  private currentModelPricingCatalogContext(): ModelPricingCatalogContext | undefined {
    const context = this.options.getModelPricingCatalogContext?.();
    if (context) {
      return context;
    }
    if (!this.options.modelPricingCatalog) {
      return undefined;
    }
    return {
      catalog: this.options.modelPricingCatalog,
      version: "",
      source: "built_in"
    };
  }

  private expiresAtIso(createdAt: string): string {
    return new Date(Date.parse(createdAt) + 24 * 60 * 60 * 1000).toISOString();
  }

  private safeRecordTrafficEvent(input: {
    eventName: "creative_job_created" | "creative_job_completed";
    record: VideoJobRecord;
    occurredAt: string;
  }): void {
    if (!this.options.databaseHandle) {
      return;
    }
    try {
      recordTrafficEvent({
        handle: this.options.databaseHandle,
        eventName: input.eventName,
        path: "/console/video",
        workspaceId: input.record.workspaceId ?? this.options.workspaceId,
        occurredAt: new Date(input.occurredAt),
        metadata: {
          jobId: input.record.id,
          productSku: input.record.productSku,
          provider: input.record.provider,
          model: input.record.providerModel,
          status: input.record.status
        }
      });
    } catch {
      // Analytics must not block video generation.
    }
  }
}

function mediaUrl(path: string): string {
  return `/media?path=${encodeURIComponent(path)}`;
}
