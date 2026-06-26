import { readFile, readdir, rm, stat } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

import type { MakeVideoReport } from "../pipeline/makeVideoPipeline.js";
import {
  buildContentReviewSnapshot,
  type JobContentReviewSnapshot
} from "./jobLedgerContentReview.js";
import {
  groupProducts,
  summarizeInternalValidation,
  summarizeJobs,
  summarizeReviewProgress,
  type InternalValidationSummary,
  type JobLedgerSummary,
  type ProductVersionGroup,
  type ReviewProgressSummary
} from "./jobLedgerSummary.js";
import type { ManualVersionReview, ReviewState } from "./reviewStore.js";

export interface JobLedgerRow {
  id: string;
  reportPath: string;
  productSku?: string;
  provider?: string;
  providerModel?: string;
  status?: string;
  durationSeconds?: number;
  taskId?: string;
  totalTokens: number;
  estimatedCostCny: number;
  totalCost?: MakeVideoReport["totalCost"];
  hasFinalVideo: boolean;
  finalOutputPath?: string;
  finalVideoUrl?: string;
  expiresAt?: string;
  expired?: boolean;
  finalSubtitlePath?: string;
  finalManifestPath?: string;
  rawManifestPath?: string;
  reusedRawManifest: boolean;
  recoveredRawOutput: boolean;
  selectedFinal: boolean;
  error?: string;
  errorDetails?: JobLedgerErrorDetails;
  manualReview?: ManualVersionReview;
  contentReview: JobContentReviewSnapshot;
}

export interface JobLedgerErrorDetails {
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

export interface JobLedger {
  summary: JobLedgerSummary;
  reviewSummary: ReviewProgressSummary;
  internalValidationSummary: InternalValidationSummary;
  jobs: JobLedgerRow[];
  products: ProductVersionGroup[];
}

export interface BuildJobLedgerOptions {
  reviewState?: ReviewState;
}

export async function buildJobLedger(
  outputsDir: string,
  options: BuildJobLedgerOptions = {}
): Promise<JobLedger> {
  const reportPaths = await listNamedFiles(outputsDir, "make-video-report.json");
  return buildJobLedgerFromReports(reportPaths, options);
}

export async function buildJobLedgerFromReports(
  reportPaths: string[],
  options: BuildJobLedgerOptions = {}
): Promise<JobLedger> {
  const jobs = [];
  for (const reportPath of reportPaths) {
    const report = JSON.parse(await readFile(reportPath, "utf8")) as Partial<MakeVideoReport>;
    jobs.push(await toLedgerRow(reportPath, report, options.reviewState));
  }
  jobs.sort(
    (left, right) =>
      right.estimatedCostCny - left.estimatedCostCny || left.id.localeCompare(right.id)
  );
  return {
    summary: summarizeJobs(jobs),
    reviewSummary: summarizeReviewProgress(jobs),
    internalValidationSummary: summarizeInternalValidation(jobs),
    jobs,
    products: groupProducts(jobs, options.reviewState)
  };
}

export async function deleteJobLedgerEntry(
  outputsDir: string,
  jobId: string
): Promise<{ deleted: true; jobId: string; path: string }> {
  const safeJobId = sanitizeJobId(jobId);
  const targetDir = join(outputsDir, safeJobId);
  const relativePath = relative(outputsDir, targetDir);
  if (!relativePath || relativePath.startsWith("..")) {
    throw new Error("Job history path must stay inside outputs.");
  }
  await stat(join(targetDir, "make-video-report.json"));
  await rm(targetDir, { recursive: true, force: true });
  return {
    deleted: true,
    jobId: safeJobId,
    path: targetDir
  };
}

async function toLedgerRow(
  reportPath: string,
  report: Partial<MakeVideoReport>,
  reviewState: ReviewState | undefined
): Promise<JobLedgerRow> {
  const id = basename(dirname(reportPath));
  const productSku = report.productSku;
  const productReview = productSku ? reviewState?.products[productSku] : undefined;
  const selectedFinalJobId = productReview?.selectedFinalJobId;
  const rawManifestPath = report.raw?.manifestPath;
  const finalManifestPath = report.final?.manifestPath;
  const finalSubtitlePath = report.final?.subtitlePath;
  const jobMetadata = await readJobMetadata(reportPath);
  const expired = jobMetadata.expired === true;
  const expiresAt = typeof jobMetadata.expiresAt === "string" ? jobMetadata.expiresAt : undefined;
  const finalOutputPath = report.final?.outputPath;
  const providerModel = typeof jobMetadata.providerModel === "string" ? jobMetadata.providerModel : undefined;
  const error = typeof jobMetadata.error === "string" ? jobMetadata.error : undefined;
  const errorDetails = parseJobLedgerErrorDetails(jobMetadata.errorDetails);
  return {
    id,
    reportPath,
    productSku,
    provider: report.provider,
    providerModel,
    status: report.status,
    durationSeconds: report.durationSeconds,
    taskId: report.raw?.taskId,
    totalTokens: report.billing?.totalTokens ?? 0,
    estimatedCostCny: report.billing?.estimatedCostCny ?? 0,
    totalCost: report.totalCost,
    hasFinalVideo: finalOutputPath !== undefined && !expired,
    finalOutputPath,
    finalVideoUrl: finalOutputPath && !expired ? mediaUrl(finalOutputPath) : undefined,
    expiresAt,
    expired,
    finalSubtitlePath,
    finalManifestPath,
    rawManifestPath,
    reusedRawManifest: report.reusedRawManifest ?? false,
    recoveredRawOutput: report.recoveredRawOutput ?? false,
    selectedFinal: selectedFinalJobId === id,
    error,
    errorDetails,
    manualReview: productReview?.versionReviews?.[id],
    contentReview: await buildContentReviewSnapshot({
      rawManifestPath,
      finalManifestPath,
      finalSubtitlePath
    })
  };
}

async function readJobMetadata(reportPath: string): Promise<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(await readFile(join(dirname(reportPath), "job.json"), "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function parseJobLedgerErrorDetails(value: unknown): JobLedgerErrorDetails | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const input = value as Record<string, unknown>;
  if (typeof input.message !== "string" || !input.message) {
    return undefined;
  }
  return {
    message: input.message,
    name: typeof input.name === "string" ? input.name : undefined,
    causeMessage: typeof input.causeMessage === "string" ? input.causeMessage : undefined,
    causeCode: typeof input.causeCode === "string" ? input.causeCode : undefined,
    providerPhase: typeof input.providerPhase === "string" ? input.providerPhase : undefined,
    providerName: typeof input.providerName === "string" ? input.providerName : undefined,
    providerModel: typeof input.providerModel === "string" ? input.providerModel : undefined,
    referenceImageCount: typeof input.referenceImageCount === "number" ? input.referenceImageCount : undefined,
    usedTemporaryAssetUrls: typeof input.usedTemporaryAssetUrls === "boolean" ? input.usedTemporaryAssetUrls : undefined,
    providerTaskId: typeof input.providerTaskId === "string" ? input.providerTaskId : undefined,
    providerVideoUrl: typeof input.providerVideoUrl === "string" ? input.providerVideoUrl : undefined,
    recoverableRawManifestPath: typeof input.recoverableRawManifestPath === "string" ? input.recoverableRawManifestPath : undefined
  };
}

async function listNamedFiles(root: string, fileName: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && entry.name === fileName) {
        found.push(path);
      }
    }
  }
  await walk(root);
  return found;
}

function mediaUrl(path: string): string {
  return `/media?path=${encodeURIComponent(path)}`;
}

function sanitizeJobId(value: string): string {
  const cleaned = value.trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(cleaned)) {
    throw new Error("Invalid job history id.");
  }
  return cleaned;
}
