import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { normalizeJapaneseHashtags } from "../core/japaneseHashtags.js";
import type { ScriptTemplate } from "../core/scriptGenerator.js";
import { normalizeFinalVideoLanguage, type FinalVideoLanguage } from "../core/videoLanguage.js";
import { runMakeVideoPipeline, type MakeVideoReport } from "../pipeline/makeVideoPipeline.js";
import type { VideoProviderName } from "../providers/providerFactory.js";
import type { ReferenceImageUrlResolver } from "../providers/types.js";
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
        completedAt: this.nowIso()
      });
    } catch (error) {
      if ((await this.read(id)).status === "canceled") {
        await this.removeGeneratedOutputs(record.outDir);
        return;
      }
      const errorDetails = serializeJobError(error);
      await this.update(record, {
        status: "failed",
        error: readableJobError(errorDetails),
        errorDetails,
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
    if (record.status !== "completed" || !record.reportPath) {
      return record;
    }
    if (record.reportUrl && (record.finalVideoUrl || record.rawOutputUrl)) {
      return record;
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
        estimatedCostCny: record.estimatedCostCny ?? report.billing?.estimatedCostCny
      };
    } catch {
      return {
        ...record,
        reportUrl: record.reportUrl ?? mediaUrl(record.reportPath)
      };
    }
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
    usedTemporaryAssetUrls: typeof err.usedTemporaryAssetUrls === "boolean" ? err.usedTemporaryAssetUrls : undefined
  };
}

function readableJobError(details: VideoJobErrorDetails): string {
  const message = details.message;
  if (
    message.includes("InputImageSensitiveContentDetected.PrivacyInformation") ||
    message.includes("input image may contain real person")
  ) {
    return "参考图里可能包含真人、人脸或隐私信息，视频平台已拒绝生成。请移除含人物或人脸的参考图，保留纯商品图后重试。";
  }
  if (message.includes("fetch failed") && details.providerPhase === "create-task") {
    return "视频平台请求超时或网络连接失败，请稍后重试；如果连续失败，请检查视频模型配置和参考图链接。";
  }
  return message;
}
