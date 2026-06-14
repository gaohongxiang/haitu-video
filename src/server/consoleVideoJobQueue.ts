import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { ScriptTemplate } from "../core/scriptGenerator.js";
import { normalizeFinalVideoLanguage, type FinalVideoLanguage } from "../core/videoLanguage.js";
import { runMakeVideoPipeline, type MakeVideoReport } from "../pipeline/makeVideoPipeline.js";
import type { VideoProviderName } from "../providers/providerFactory.js";
import { FileConsoleSettingsStore } from "./consoleSettings.js";

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
  totalTokens?: number;
  estimatedCostCny?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface LocalVideoJobQueueOptions {
  rootDir: string;
  outputsDir: string;
  workspaceId?: string;
  settingsStore: FileConsoleSettingsStore;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  runMakeVideoPipeline?: typeof runMakeVideoPipeline;
}

export class LocalVideoJobQueue {
  private sequence = 0;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: LocalVideoJobQueueOptions) {}

  async enqueue(request: VideoJobRequest): Promise<VideoJobRecord> {
    const settings = await this.options.settingsStore.read();
    const createdAt = this.nowIso();
    const id = this.nextId(createdAt);
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
    return this.enqueue({
      productPath: record.productPath,
      outDirName: `retry-${record.id}`,
      provider: record.provider,
      providerModel: record.providerModel,
      duration: record.durationSeconds,
      template: record.template,
      finalLanguage: record.finalLanguage,
      cta: record.cta,
      scriptLines: record.scriptLines,
      storyboardLines: record.storyboardLines,
      confirmPaid: options.confirmPaid ?? false,
      reuseManifest: record.reuseManifest
    });
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
        fetchImpl: this.options.fetchImpl
      });
      if ((await this.read(id)).status === "canceled") {
        await this.removeGeneratedOutputs(record.outDir);
        return;
      }
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
        totalTokens: report.billing?.totalTokens ?? report.usage?.totalTokens,
        estimatedCostCny: report.billing?.estimatedCostCny,
        completedAt: this.nowIso()
      });
    } catch (error) {
      if ((await this.read(id)).status === "canceled") {
        await this.removeGeneratedOutputs(record.outDir);
        return;
      }
      await this.update(record, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
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
  }

  private nextId(createdAt: string): string {
    this.sequence += 1;
    return `job-${createdAt.replace(/\D/g, "")}-${String(this.sequence).padStart(3, "0")}`;
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
