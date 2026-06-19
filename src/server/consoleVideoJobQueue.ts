import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { generateJapaneseHashtags, normalizeJapaneseHashtags } from "../core/japaneseHashtags.js";
import { parseProductFacts } from "../core/productFacts.js";
import { generateVideoPrompt } from "../core/promptGenerator.js";
import type { ScriptTemplate } from "../core/scriptGenerator.js";
import { generateJapaneseAdScript } from "../core/scriptGenerator.js";
import { normalizeFinalVideoLanguage, type FinalVideoLanguage } from "../core/videoLanguage.js";
import { maxSeedanceReferenceImages, readableVideoProviderError } from "../core/videoProviderErrors.js";
import { estimateCny, runMakeVideoPipeline, type MakeVideoReport } from "../pipeline/makeVideoPipeline.js";
import type { ProductJobManifest } from "../pipeline/runProductJob.js";
import { runBasicQc } from "../qc/basicQc.js";
import type { VideoProviderName } from "../providers/providerFactory.js";
import type { MoneyAmount, ReferenceImageUrlResolver, VideoOutput, VideoProviderResult } from "../providers/types.js";
import { FileConsoleSettingsStore } from "./consoleSettings.js";
import type { DatabaseHandle } from "./db/client.js";

export interface VideoJobRequest {
  productPath: string;
  outDirName?: string;
  provider?: VideoProviderName;
  providerModel?: string;
  duration?: number;
  template?: ScriptTemplate;
  finalLanguage?: FinalVideoLanguage;
  cta?: string;
  scriptLines?: string[];
  storyboardLines?: string[];
  confirmPaid?: boolean;
  reuseManifest?: string;
}

export interface VideoJobRecord {
  id: string;
  workspaceId?: string;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  productPath: string;
  productSku?: string;
  provider?: VideoProviderName;
  providerModel?: string;
  durationSeconds?: number;
  template?: ScriptTemplate;
  finalLanguage?: FinalVideoLanguage;
  cta?: string;
  scriptLines?: string[];
  storyboardLines?: string[];
  confirmPaid: boolean;
  reuseManifest?: string;
  outDir: string;
  reportPath?: string;
  reportUrl?: string;
  rawOutputPath?: string;
  rawOutputUrl?: string;
  finalOutputPath?: string;
  finalVideoUrl?: string;
  finalManifestPath?: string;
  finalManifestUrl?: string;
  subtitlePath?: string;
  subtitleUrl?: string;
  hashtags?: string[];
  providerTaskId?: string;
  recoverableRawManifestPath?: string;
  providerVideoUrl?: string;
  canRecoverDownload?: boolean;
  totalTokens?: number;
  estimatedCostCny?: number;
  error?: string;
  errorDetails?: VideoJobErrorDetails;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface VideoJobErrorDetails {
  message: string;
  name?: string;
  causeMessage?: string;
  causeCode?: string;
  providerPhase?: string;
  providerName?: string;
  providerModel?: string;
  referenceImageCount?: number;
  usedTemporaryAssetUrls?: boolean;
  providerTaskId?: string;
  providerVideoUrl?: string;
  recoverableRawManifestPath?: string;
}

export interface LocalVideoJobQueueOptions {
  rootDir: string;
  outputsDir: string;
  workspaceId?: string;
  settingsStore: FileConsoleSettingsStore;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  runMakeVideoPipeline?: typeof runMakeVideoPipeline;
  referenceImageUrlResolver?: ReferenceImageUrlResolver;
  databaseHandle?: DatabaseHandle;
}

export class LocalVideoJobQueue {
  private sequence = 0;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: LocalVideoJobQueueOptions) {}

  async enqueue(request: VideoJobRequest): Promise<VideoJobRecord> {
    const settings = await this.options.settingsStore.read();
    const createdAt = this.nowIso();
    const id = await this.nextId(createdAt);
    const provider = request.provider ?? settings.defaultProvider;
    const durationSeconds = request.duration ?? settings.defaultDurationSeconds;
    const template = request.template ?? settings.defaultTemplate;
    const finalLanguage = normalizeFinalVideoLanguage(request.finalLanguage ?? settings.defaultLanguage);
    const cta = request.cta ?? settings.defaultCta;
    const outDir = join(this.options.outputsDir, sanitizePathSegment(request.outDirName ?? id));
    const record: VideoJobRecord = {
      id,
      workspaceId: this.options.workspaceId ?? "default",
      status: "queued",
      productPath: request.productPath,
      provider,
      providerModel: request.providerModel,
      durationSeconds,
      template,
      finalLanguage,
      cta,
      scriptLines: sanitizeLines(request.scriptLines),
      storyboardLines: sanitizeLines(request.storyboardLines),
      confirmPaid: request.confirmPaid ?? provider !== "mock",
      reuseManifest: request.reuseManifest,
      outDir,
      createdAt,
      updatedAt: createdAt,
      expiresAt: this.expiresAtIso(createdAt)
    };
    await this.write(record);
    this.chain = this.chain.then(() => this.run(record.id)).catch(() => undefined);
    return record;
  }

  async get(id: string): Promise<VideoJobRecord> {
    return this.read(id);
  }

  async cancel(id: string): Promise<VideoJobRecord> {
    const record = await this.read(id);
    if (record.status === "canceled") {
      return record;
    }
    return this.update(record, {
      status: "canceled",
      completedAt: this.nowIso()
    });
  }

  async retry(
    id: string,
    options: {
      confirmPaid?: boolean;
    } = {}
  ): Promise<VideoJobRecord> {
    const record = await this.read(id);
    if (record.status !== "failed") {
      throw new Error(`Can retry only failed local video jobs. Job ${id} is ${record.status}.`);
    }
    const retried = await this.update(record, {
      status: "queued",
      confirmPaid: options.confirmPaid ?? false,
      reportPath: undefined,
      reportUrl: undefined,
      rawOutputPath: undefined,
      rawOutputUrl: undefined,
      finalOutputPath: undefined,
      finalVideoUrl: undefined,
      finalManifestPath: undefined,
      finalManifestUrl: undefined,
      subtitlePath: undefined,
      subtitleUrl: undefined,
      hashtags: undefined,
      providerTaskId: undefined,
      recoverableRawManifestPath: undefined,
      providerVideoUrl: undefined,
      canRecoverDownload: undefined,
      totalTokens: undefined,
      estimatedCostCny: undefined,
      error: undefined,
      errorDetails: undefined,
      startedAt: undefined,
      completedAt: undefined,
      expiresAt: this.expiresAtIso(this.nowIso())
    });
    this.chain = this.chain.then(() => this.run(retried.id)).catch(() => undefined);
    return retried;
  }

  async recoverDownload(id: string): Promise<VideoJobRecord> {
    const record = await this.read(id);
    if (!this.canRecoverDownload(record)) {
      throw new Error(`Can recover only video jobs that already generated a provider video but failed while downloading. Job ${id} cannot be recovered.`);
    }
    const queued = await this.update(record, {
      status: "queued",
      confirmPaid: false,
      reuseManifest: record.recoverableRawManifestPath,
      rawOutputPath: undefined,
      rawOutputUrl: undefined,
      finalOutputPath: undefined,
      finalVideoUrl: undefined,
      finalManifestPath: undefined,
      finalManifestUrl: undefined,
      subtitlePath: undefined,
      subtitleUrl: undefined,
      canRecoverDownload: false,
      error: undefined,
      errorDetails: undefined,
      startedAt: undefined,
      completedAt: undefined,
      expiresAt: this.expiresAtIso(this.nowIso())
    });
    this.chain = this.chain.then(() => this.run(queued.id)).catch(() => undefined);
    return queued;
  }

  async list(): Promise<VideoJobRecord[]> {
    const dir = this.jobsDir();
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const records: VideoJobRecord[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          records.push(await this.read(entry.name));
        } catch {
          // Ignore non-job directories such as publish packages.
        }
      }
    }
    return records.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }

  async startSavedJobs(): Promise<VideoJobRecord[]> {
    const records = await this.list();
    const queued = records
      .filter((record) => record.status === "queued")
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
    const running = records.filter((record) => record.status === "running");
    for (const record of running) {
      await this.update(record, {
        status: "failed",
        error: "Job was interrupted by a server restart before completion.",
        completedAt: this.nowIso()
      });
    }
    for (const record of queued) {
      this.chain = this.chain.then(() => this.run(record.id)).catch(() => undefined);
    }
    return this.list();
  }

  async waitForIdle(id: string): Promise<VideoJobRecord> {
    await this.chain;
    return this.read(id);
  }

  private async run(id: string): Promise<void> {
    let record = await this.read(id);
    if (record.status === "canceled") {
      return;
    }
    record = await this.update(record, {
      status: "running",
      startedAt: this.nowIso()
    });
    try {
      const runPipeline = this.options.runMakeVideoPipeline ?? runMakeVideoPipeline;
      const report = await runPipeline({
        productPath: record.productPath,
        outDir: record.outDir,
        providerName: record.provider ?? "mock",
        providerModel: record.providerModel,
        durationSeconds: record.durationSeconds ?? 8,
        template: record.template ?? "scene",
        finalLanguage: record.finalLanguage,
        cta: record.cta ?? "今すぐチェック",
        scriptLines: record.scriptLines,
        storyboardLines: record.storyboardLines,
        confirmPaid: record.confirmPaid,
        reuseManifestPath: record.reuseManifest,
        fetchImpl: this.options.fetchImpl,
        referenceImageUrlResolver: this.options.referenceImageUrlResolver
      });
      if ((await this.read(id)).status === "canceled") {
        await this.removeGeneratedOutputs(record.outDir);
        return;
      }
      const hashtags = await readHashtagsFromRawManifest(report.raw.manifestPath);
      await this.update(record, {
        status: "completed",
        productSku: report.productSku,
        reportPath: report.reportPath,
        reportUrl: mediaUrl(report.reportPath),
        rawOutputPath: report.raw.outputPath,
        rawOutputUrl: mediaUrl(report.raw.outputPath),
        finalOutputPath: report.final?.outputPath,
        finalVideoUrl: report.final?.outputPath ? mediaUrl(report.final.outputPath) : undefined,
        finalManifestPath: report.final?.manifestPath,
        finalManifestUrl: report.final?.manifestPath ? mediaUrl(report.final.manifestPath) : undefined,
        subtitlePath: report.final?.subtitlePath,
        subtitleUrl: report.final?.subtitlePath ? mediaUrl(report.final.subtitlePath) : undefined,
        hashtags,
        totalTokens: report.billing?.totalTokens ?? report.usage?.totalTokens,
        estimatedCostCny: report.billing?.estimatedCostCny,
        providerTaskId: report.raw.taskId,
        recoverableRawManifestPath: report.raw.manifestPath,
        providerVideoUrl: undefined,
        canRecoverDownload: false,
        error: undefined,
        errorDetails: undefined,
        completedAt: this.nowIso()
      });
    } catch (error) {
      if ((await this.read(id)).status === "canceled") {
        await this.removeGeneratedOutputs(record.outDir);
        return;
      }
      const errorDetails = {
        ...serializeJobError(error),
        ...(isDownloadRecoveryRun(record)
          ? {
              providerPhase: "download-output",
              providerTaskId: record.providerTaskId,
              recoverableRawManifestPath: record.reuseManifest
            }
          : {})
      };
      const recoverable = await this.persistRecoverableDownloadFailure(record, error, errorDetails);
      const mergedErrorDetails = {
        ...errorDetails,
        providerTaskId: recoverable.providerTaskId ?? errorDetails.providerTaskId,
        providerVideoUrl: recoverable.providerVideoUrl ?? errorDetails.providerVideoUrl,
        recoverableRawManifestPath: recoverable.recoverableRawManifestPath ?? errorDetails.recoverableRawManifestPath
      };
      await this.update(record, {
        status: "failed",
        error: readableJobError(mergedErrorDetails),
        errorDetails: mergedErrorDetails,
        ...(isDownloadRecoveryRun(record)
          ? {
              providerTaskId: record.providerTaskId,
              recoverableRawManifestPath: record.reuseManifest,
              canRecoverDownload: true
            }
          : {}),
        ...recoverable,
        completedAt: this.nowIso()
      });
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
    await this.write(next);
    return next;
  }

  private async read(id: string): Promise<VideoJobRecord> {
    const record = JSON.parse(await readFile(this.pathFor(id), "utf8")) as VideoJobRecord;
    return this.hydrateResultFields(record);
  }

  private async write(record: VideoJobRecord): Promise<void> {
    await mkdir(dirname(this.pathFor(record.id)), { recursive: true });
    const path = this.pathFor(record.id);
    const tempPath = `${path}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(tempPath, JSON.stringify(record, null, 2), "utf8");
    await rename(tempPath, path);
    this.upsertDatabaseJob(record);
  }

  private async nextId(createdAt: string): Promise<string> {
    const timestamp = createdAt.replace(/\D/g, "");
    while (true) {
      this.sequence += 1;
      const id = `job-${timestamp}-${String(this.sequence).padStart(3, "0")}`;
      if (!(await this.jobExists(id))) {
        return id;
      }
    }
  }

  private nowIso(): string {
    return (this.options.now ?? (() => new Date()))().toISOString();
  }

  private jobsDir(): string {
    return this.options.outputsDir;
  }

  private pathFor(id: string): string {
    return join(this.jobsDir(), sanitizePathSegment(id), "job.json");
  }

  private async jobExists(id: string): Promise<boolean> {
    try {
      await access(dirname(this.pathFor(id)));
      return true;
    } catch {
      return false;
    }
  }

  private async removeGeneratedOutputs(outDir: string): Promise<void> {
    await Promise.all([
      rm(join(outDir, "raw"), { recursive: true, force: true }),
      rm(join(outDir, "final"), { recursive: true, force: true }),
      rm(join(outDir, "make-video-report.json"), { force: true })
    ]);
  }

  private expiresAtIso(createdAt: string): string {
    return new Date(Date.parse(createdAt) + 24 * 60 * 60 * 1000).toISOString();
  }

  private async hydrateResultFields(record: VideoJobRecord): Promise<VideoJobRecord> {
    if (!record.reportPath) {
      return record;
    }
    if (record.reportUrl && (record.finalVideoUrl || record.rawOutputUrl)) {
      return {
        ...record,
        canRecoverDownload: record.canRecoverDownload ?? this.canRecoverDownload(record)
      };
    }
    try {
      const report = JSON.parse(await readFile(record.reportPath, "utf8")) as Partial<MakeVideoReport>;
      return {
        ...record,
        productSku: record.productSku ?? report.productSku,
        reportUrl: record.reportUrl ?? mediaUrl(record.reportPath),
        rawOutputPath: record.rawOutputPath ?? report.raw?.outputPath,
        rawOutputUrl: record.rawOutputUrl ?? (report.raw?.outputPath ? mediaUrl(report.raw.outputPath) : undefined),
        finalOutputPath: record.finalOutputPath ?? report.final?.outputPath,
        finalVideoUrl: record.finalVideoUrl ?? (report.final?.outputPath ? mediaUrl(report.final.outputPath) : undefined),
        finalManifestPath: record.finalManifestPath ?? report.final?.manifestPath,
        finalManifestUrl: record.finalManifestUrl ?? (report.final?.manifestPath ? mediaUrl(report.final.manifestPath) : undefined),
        subtitlePath: record.subtitlePath ?? report.final?.subtitlePath,
        subtitleUrl: record.subtitleUrl ?? (report.final?.subtitlePath ? mediaUrl(report.final.subtitlePath) : undefined),
        hashtags: record.hashtags ?? await readHashtagsFromRawManifest(report.raw?.manifestPath),
        totalTokens: record.totalTokens ?? report.billing?.totalTokens ?? report.usage?.totalTokens,
        estimatedCostCny: record.estimatedCostCny ?? report.billing?.estimatedCostCny,
        providerTaskId: record.providerTaskId ?? report.raw?.taskId,
        recoverableRawManifestPath: record.recoverableRawManifestPath ?? report.raw?.manifestPath,
        canRecoverDownload: record.canRecoverDownload ?? this.canRecoverDownload({
          ...record,
          recoverableRawManifestPath: record.recoverableRawManifestPath ?? report.raw?.manifestPath
        })
      };
    } catch {
      return {
        ...record,
        reportUrl: record.reportUrl ?? mediaUrl(record.reportPath),
        canRecoverDownload: record.canRecoverDownload ?? this.canRecoverDownload(record)
      };
    }
  }

  private canRecoverDownload(record: Pick<VideoJobRecord, "status" | "provider" | "recoverableRawManifestPath" | "providerTaskId" | "errorDetails">): boolean {
    return record.status === "failed" &&
      record.provider === "volcengine-seedance" &&
      record.errorDetails?.providerPhase === "download-output" &&
      Boolean(record.recoverableRawManifestPath && record.providerTaskId);
  }

  private async persistRecoverableDownloadFailure(
    record: VideoJobRecord,
    error: unknown,
    errorDetails: VideoJobErrorDetails
  ): Promise<Partial<VideoJobRecord>> {
    const partial = extractRecoverableDownloadFailure(error);
    if (!partial || errorDetails.providerPhase !== "download-output") {
      return {};
    }
    const product = parseProductFacts(JSON.parse(await readFile(record.productPath, "utf8")) as unknown);
    const rawManifestPath = join(record.outDir, "raw", product.sku, "v1", "manifest.json");
    const providerTaskId = partial.providerTaskId;
    const tokenPriceCnyPerMillion = Number(process.env.SEEDANCE_TOKEN_PRICE_CNY_PER_MILLION ?? 37);
    const totalTokens = partial.usage?.totalTokens ?? partial.usage?.completionTokens;
    const billing = totalTokens === undefined
      ? undefined
      : {
          tokenPriceCnyPerMillion,
          totalTokens,
          estimatedCostCny: estimateCny(totalTokens, tokenPriceCnyPerMillion)
        };
    const rawManifest = await buildRecoverableRawManifest({
      record,
      product,
      partial,
      manifestPath: rawManifestPath
    });
    await mkdir(dirname(rawManifestPath), { recursive: true });
    await writeFile(rawManifestPath, JSON.stringify(rawManifest, null, 2), "utf8");
    const reportPath = join(record.outDir, "make-video-report.json");
    const failedReport: MakeVideoReport = {
      type: "haitu_make_video_report",
      status: "failed" as MakeVideoReport["status"],
      productSku: rawManifest.product.sku,
      provider: record.provider ?? "volcengine-seedance",
      durationSeconds: record.durationSeconds ?? partial.output.durationSeconds,
      paidRequestConfirmed: record.confirmPaid,
      raw: {
        manifestPath: rawManifest.paths.manifest,
        outputPath: rawManifest.output.path,
        taskId: providerTaskId
      },
      usage: partial.usage,
      billing,
      totalCost: rawManifest.cost.total,
      reusedRawManifest: false,
      recoveredRawOutput: false,
      reportPath
    };
    await mkdir(record.outDir, { recursive: true });
    await writeFile(reportPath, JSON.stringify(failedReport, null, 2), "utf8");
    return {
      productSku: rawManifest.product.sku,
      reportPath,
      reportUrl: mediaUrl(reportPath),
      providerTaskId,
      recoverableRawManifestPath: rawManifest.paths.manifest,
      providerVideoUrl: partial.providerVideoUrl,
      canRecoverDownload: true,
      totalTokens: billing?.totalTokens ?? partial.usage?.totalTokens ?? partial.usage?.completionTokens,
      estimatedCostCny: billing?.estimatedCostCny
    };
  }

  private upsertDatabaseJob(record: VideoJobRecord): void {
    const handle = this.options.databaseHandle;
    if (!handle) {
      return;
    }
    handle.sqlite.prepare(`
      INSERT INTO video_jobs (
        id,
        workspace_id,
        product_id,
        status,
        model,
        language,
        duration_seconds,
        output_count,
        job_dir,
        created_at,
        completed_at,
        expires_at
      ) VALUES (
        @id,
        @workspaceId,
        (SELECT id FROM products WHERE workspace_id = @workspaceId AND product_json_path = @productPath),
        @status,
        @model,
        @language,
        @durationSeconds,
        @outputCount,
        @jobDir,
        @createdAt,
        @completedAt,
        @expiresAt
      )
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        product_id = excluded.product_id,
        status = excluded.status,
        model = excluded.model,
        language = excluded.language,
        duration_seconds = excluded.duration_seconds,
        output_count = excluded.output_count,
        job_dir = excluded.job_dir,
        completed_at = excluded.completed_at,
        expires_at = excluded.expires_at
    `).run({
      id: record.id,
      workspaceId: record.workspaceId ?? this.options.workspaceId ?? "default",
      status: record.status,
      model: record.providerModel ?? record.provider ?? null,
      language: record.finalLanguage ?? null,
      durationSeconds: record.durationSeconds ?? null,
      outputCount: record.finalOutputPath ? 1 : 0,
      jobDir: record.outDir,
      productPath: record.productPath,
      createdAt: record.createdAt,
      completedAt: record.completedAt ?? null,
      expiresAt: record.expiresAt ?? null
    });
    this.upsertDatabaseAsset(record, record.rawOutputPath, "raw");
    this.upsertDatabaseAsset(record, record.finalOutputPath, "final");
  }

  private upsertDatabaseAsset(record: VideoJobRecord, storagePath: string | undefined, kind: "raw" | "final"): void {
    const handle = this.options.databaseHandle;
    if (!handle || !storagePath) {
      return;
    }
    handle.sqlite.prepare(`
      INSERT INTO video_assets (
        id,
        workspace_id,
        job_id,
        status,
        storage_provider,
        storage_path,
        expires_at
      ) VALUES (
        @id,
        @workspaceId,
        @jobId,
        @status,
        'file',
        @storagePath,
        @expiresAt
      )
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        job_id = excluded.job_id,
        status = excluded.status,
        storage_path = excluded.storage_path,
        expires_at = excluded.expires_at,
        deleted_at = NULL
    `).run({
      id: `${record.id}:${kind}`,
      workspaceId: record.workspaceId ?? this.options.workspaceId ?? "default",
      jobId: record.id,
      status: record.status === "completed" ? "available" : record.status,
      storagePath,
      expiresAt: record.expiresAt ?? null
    });
  }
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "job";
}

function sanitizeLines(lines?: string[]): string[] | undefined {
  const cleaned = (lines ?? []).map((line) => line.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}

function isDownloadRecoveryRun(record: VideoJobRecord): boolean {
  return record.confirmPaid === false &&
    record.provider === "volcengine-seedance" &&
    Boolean(record.reuseManifest && record.providerTaskId);
}

interface RecoverableDownloadFailure {
  providerTaskId: string;
  providerVideoUrl: string;
  output: VideoOutput;
  usage?: VideoProviderResult["usage"];
  cost: MoneyAmount;
  rawResponse: Record<string, unknown>;
}

function extractRecoverableDownloadFailure(error: unknown): RecoverableDownloadFailure | undefined {
  const value = error as Partial<RecoverableDownloadFailure> | undefined;
  if (
    !value ||
    typeof value.providerTaskId !== "string" ||
    typeof value.providerVideoUrl !== "string" ||
    !isVideoOutput(value.output) ||
    !isMoneyAmount(value.cost) ||
    !value.rawResponse ||
    typeof value.rawResponse !== "object" ||
    Array.isArray(value.rawResponse)
  ) {
    return undefined;
  }
  return {
    providerTaskId: value.providerTaskId,
    providerVideoUrl: value.providerVideoUrl,
    output: value.output,
    usage: value.usage,
    cost: value.cost,
    rawResponse: value.rawResponse
  };
}

async function buildRecoverableRawManifest(input: {
  record: VideoJobRecord;
  product: ReturnType<typeof parseProductFacts>;
  partial: RecoverableDownloadFailure;
  manifestPath: string;
}): Promise<ProductJobManifest> {
  const durationSeconds = input.record.durationSeconds ?? input.partial.output.durationSeconds;
  const template = input.record.template ?? "scene";
  const finalLanguage = normalizeFinalVideoLanguage(input.record.finalLanguage);
  const generationProduct = {
    ...input.product,
    reference_images: input.product.reference_images.slice(0, maxSeedanceReferenceImages)
  };
  const script = generateJapaneseAdScript(input.product, {
    cta: input.record.cta ?? "今すぐチェック",
    template,
    scriptLines: input.record.scriptLines,
    finalLanguage
  });
  const prompt = generateVideoPrompt(generationProduct, {
    durationSeconds,
    aspectRatio: "9:16",
    template,
    storyboardLines: input.record.storyboardLines,
    finalLanguage
  });
  const jobId = `${input.product.sku}-v1`;
  const qc = runBasicQc({
    product: input.product,
    script,
    output: input.partial.output,
    targetDurationSeconds: durationSeconds
  });
  const hashtags = generateJapaneseHashtags({
    product: input.product,
    script,
    variantKey: jobId
  });
  return {
    jobId,
    status: "completed",
    product: {
      sku: input.product.sku,
      title_ja: input.product.title_ja,
      category: input.product.category,
      materials: input.product.materials,
      verified_selling_points: input.product.verified_selling_points,
      usage_scenes: input.product.usage_scenes
    },
    version: 1,
    provider: {
      name: "volcengine-seedance",
      model: input.record.providerModel ?? "volcengine-seedance",
      taskId: input.partial.providerTaskId
    },
    script,
    prompt,
    output: input.partial.output,
    usage: input.partial.usage,
    qc,
    cost: {
      provider: input.partial.cost,
      total: input.partial.cost
    },
    hashtags,
    paths: {
      outputDir: dirname(input.manifestPath),
      manifest: input.manifestPath
    }
  };
}

function isVideoOutput(value: unknown): value is VideoOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const output = value as Partial<VideoOutput>;
  return (
    typeof output.path === "string" &&
    typeof output.width === "number" &&
    typeof output.height === "number" &&
    typeof output.durationSeconds === "number" &&
    output.mimeType === "video/mp4"
  );
}

function isMoneyAmount(value: unknown): value is MoneyAmount {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const amount = value as Partial<MoneyAmount>;
  return (
    typeof amount.amount === "number" &&
    (amount.currency === "USD" || amount.currency === "JPY" || amount.currency === "CNY")
  );
}

function mediaUrl(path: string): string {
  return `/media?path=${encodeURIComponent(path)}`;
}

async function readHashtagsFromRawManifest(manifestPath: string | undefined): Promise<string[] | undefined> {
  if (!manifestPath) {
    return undefined;
  }
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { hashtags?: unknown };
    const hashtags = normalizeJapaneseHashtags(manifest.hashtags);
    return hashtags.length > 0 ? hashtags : undefined;
  } catch {
    return undefined;
  }
}

function serializeJobError(error: unknown): VideoJobErrorDetails {
  const err = error as {
    message?: unknown;
    name?: unknown;
    cause?: {
      message?: unknown;
      code?: unknown;
    };
    providerPhase?: unknown;
    providerName?: unknown;
    providerModel?: unknown;
    referenceImageCount?: unknown;
    usedTemporaryAssetUrls?: unknown;
    providerTaskId?: unknown;
    providerVideoUrl?: unknown;
    recoverableRawManifestPath?: unknown;
  };
  return {
    message: typeof err.message === "string" ? err.message : String(error),
    name: typeof err.name === "string" ? err.name : undefined,
    causeMessage: typeof err.cause?.message === "string" ? err.cause.message : undefined,
    causeCode: typeof err.cause?.code === "string" ? err.cause.code : undefined,
    providerPhase: typeof err.providerPhase === "string" ? err.providerPhase : undefined,
    providerName: typeof err.providerName === "string" ? err.providerName : undefined,
    providerModel: typeof err.providerModel === "string" ? err.providerModel : undefined,
    referenceImageCount: typeof err.referenceImageCount === "number" ? err.referenceImageCount : undefined,
    usedTemporaryAssetUrls: typeof err.usedTemporaryAssetUrls === "boolean" ? err.usedTemporaryAssetUrls : undefined,
    providerTaskId: typeof err.providerTaskId === "string" ? err.providerTaskId : undefined,
    providerVideoUrl: typeof err.providerVideoUrl === "string" ? err.providerVideoUrl : undefined,
    recoverableRawManifestPath: typeof err.recoverableRawManifestPath === "string" ? err.recoverableRawManifestPath : undefined
  };
}

function readableJobError(details: VideoJobErrorDetails): string {
  return readableVideoProviderError(details);
}
