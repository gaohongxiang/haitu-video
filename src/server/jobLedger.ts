import { readFile, readdir, rm, stat } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

import { normalizeJapaneseHashtags } from "../core/japaneseHashtags.js";
import type { MakeVideoReport } from "../pipeline/makeVideoPipeline.js";
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

export interface JobContentReviewSnapshot {
  available: boolean;
  scriptVoiceover?: string;
  subtitleLines: string[];
  cta?: string;
  hashtags: string[];
  promptPreview?: string;
  rawManifestUrl?: string;
  finalManifestUrl?: string;
  subtitleUrl?: string;
  missingReason?: string;
}

export interface JobLedgerSummary {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  paidJobs: number;
  mockJobs: number;
  totalTokens: number;
  estimatedCostCny: number;
  finalVideos: number;
  reusedRawManifests: number;
  recoveredRawOutputs: number;
}

export interface ReviewProgressSummary {
  totalVersions: number;
  reviewedVersions: number;
  unreviewedVersions: number;
  publishableVersions: number;
  needsEditVersions: number;
  rejectedVersions: number;
  usableVersions: number;
  usableTarget: number;
  usableRemaining: number;
  averageScore: number;
}

export interface InternalValidationSummary {
  targetUsableVideos: number;
  usableVideos: number;
  publishableVideos: number;
  needsEditVideos: number;
  rejectedVideos: number;
  totalVideos: number;
  reviewedVideos: number;
  usableRate: number;
  totalEstimatedCostCny: number;
  paidEstimatedCostCny: number;
  costPerUsableVideoCny: number;
  remainingUsableVideos: number;
}

export interface ProductVersionGroup {
  productSku: string;
  jobCount: number;
  completedJobs: number;
  paidJobs: number;
  mockJobs: number;
  reviewedJobs: number;
  unreviewedJobs: number;
  publishableJobs: number;
  needsEditJobs: number;
  rejectedJobs: number;
  usableJobs: number;
  readyForInternalValidation: boolean;
  totalTokens: number;
  estimatedCostCny: number;
  finalVideos: number;
  latestJobId: string;
  bestPreviewJobId?: string;
  selectedFinalJobId?: string;
  selectedFinalNote?: string;
  jobs: JobLedgerRow[];
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

async function buildContentReviewSnapshot(input: {
  rawManifestPath?: string;
  finalManifestPath?: string;
  finalSubtitlePath?: string;
}): Promise<JobContentReviewSnapshot> {
  const links = {
    rawManifestUrl: input.rawManifestPath ? mediaUrl(input.rawManifestPath) : undefined,
    finalManifestUrl: input.finalManifestPath ? mediaUrl(input.finalManifestPath) : undefined,
    subtitleUrl: input.finalSubtitlePath ? mediaUrl(input.finalSubtitlePath) : undefined
  };
  if (!input.rawManifestPath) {
    return {
      available: false,
      subtitleLines: [],
      hashtags: [],
      ...links,
      missingReason: "raw manifest 缺失，无法读取脚本和 prompt"
    };
  }
  try {
    const manifest = JSON.parse(await readFile(input.rawManifestPath, "utf8")) as {
      script?: {
        voiceover?: unknown;
        subtitleLines?: unknown;
        cta?: unknown;
      };
      hashtags?: unknown;
      prompt?: unknown;
    };
    const scriptVoiceover = asText(manifest.script?.voiceover);
    const subtitleLines = Array.isArray(manifest.script?.subtitleLines)
      ? manifest.script.subtitleLines.map((line) => asText(line)).filter(isNonEmptyString)
      : [];
    const promptPreview = truncateText(asText(manifest.prompt), 320);
    const cta = asText(manifest.script?.cta);
    return {
      available: Boolean(scriptVoiceover || subtitleLines.length || promptPreview),
      scriptVoiceover,
      subtitleLines,
      cta,
      hashtags: normalizeJapaneseHashtags(manifest.hashtags),
      promptPreview,
      ...links,
      missingReason: undefined
    };
  } catch {
    return {
      available: false,
      subtitleLines: [],
      hashtags: [],
      ...links,
      missingReason: `raw manifest 无法读取: ${input.rawManifestPath}`
    };
  }
}

function summarizeJobs(jobs: JobLedgerRow[]): JobLedgerSummary {
  return {
    totalJobs: jobs.length,
    completedJobs: jobs.filter((job) => job.status === "completed").length,
    failedJobs: jobs.filter((job) => job.status === "failed").length,
    paidJobs: jobs.filter((job) => job.provider !== undefined && job.provider !== "mock").length,
    mockJobs: jobs.filter((job) => job.provider === "mock").length,
    totalTokens: jobs.reduce((sum, job) => sum + job.totalTokens, 0),
    estimatedCostCny: roundCny(jobs.reduce((sum, job) => sum + job.estimatedCostCny, 0)),
    finalVideos: jobs.filter((job) => job.hasFinalVideo).length,
    reusedRawManifests: jobs.filter((job) => job.reusedRawManifest).length,
    recoveredRawOutputs: jobs.filter((job) => job.recoveredRawOutput).length
  };
}

function summarizeReviewProgress(jobs: JobLedgerRow[]): ReviewProgressSummary {
  const reviewedJobs = jobs.filter((job) => job.manualReview !== undefined);
  const publishableVersions = reviewedJobs.filter((job) => job.manualReview?.decision === "publishable").length;
  const needsEditVersions = reviewedJobs.filter((job) => job.manualReview?.decision === "needs-edit").length;
  const rejectedVersions = reviewedJobs.filter((job) => job.manualReview?.decision === "rejected").length;
  const usableVersions = publishableVersions + needsEditVersions;
  const usableTarget = 20;
  return {
    totalVersions: jobs.length,
    reviewedVersions: reviewedJobs.length,
    unreviewedVersions: jobs.length - reviewedJobs.length,
    publishableVersions,
    needsEditVersions,
    rejectedVersions,
    usableVersions,
    usableTarget,
    usableRemaining: Math.max(0, usableTarget - usableVersions),
    averageScore: roundCny(
      reviewedJobs.reduce((sum, job) => sum + (job.manualReview?.score ?? 0), 0) /
        Math.max(1, reviewedJobs.length)
    )
  };
}

function summarizeInternalValidation(jobs: JobLedgerRow[]): InternalValidationSummary {
  const reviewedJobs = jobs.filter((job) => job.manualReview !== undefined);
  const publishableVideos = reviewedJobs.filter((job) => job.manualReview?.decision === "publishable").length;
  const needsEditVideos = reviewedJobs.filter((job) => job.manualReview?.decision === "needs-edit").length;
  const rejectedVideos = reviewedJobs.filter((job) => job.manualReview?.decision === "rejected").length;
  const usableVideos = publishableVideos + needsEditVideos;
  const targetUsableVideos = 20;
  const totalEstimatedCostCny = roundCny(jobs.reduce((sum, job) => sum + job.estimatedCostCny, 0));
  return {
    targetUsableVideos,
    usableVideos,
    publishableVideos,
    needsEditVideos,
    rejectedVideos,
    totalVideos: jobs.length,
    reviewedVideos: reviewedJobs.length,
    usableRate: roundCny(usableVideos / Math.max(1, jobs.length)),
    totalEstimatedCostCny,
    paidEstimatedCostCny: roundCny(
      jobs
        .filter((job) => job.provider !== undefined && job.provider !== "mock")
        .reduce((sum, job) => sum + job.estimatedCostCny, 0)
    ),
    costPerUsableVideoCny: roundCny(totalEstimatedCostCny / Math.max(1, usableVideos)),
    remainingUsableVideos: Math.max(0, targetUsableVideos - usableVideos)
  };
}

function groupProducts(jobs: JobLedgerRow[], reviewState: ReviewState | undefined): ProductVersionGroup[] {
  const groups = new Map<string, JobLedgerRow[]>();
  for (const job of jobs) {
    const productSku = job.productSku ?? "unknown";
    groups.set(productSku, [...(groups.get(productSku) ?? []), job]);
  }
  return Array.from(groups.entries())
    .map(([productSku, productJobs]) => toProductGroup(productSku, productJobs, reviewState))
    .sort(
      (left, right) =>
        right.estimatedCostCny - left.estimatedCostCny ||
        right.jobCount - left.jobCount ||
        left.productSku.localeCompare(right.productSku)
    );
}

function toProductGroup(
  productSku: string,
  jobs: JobLedgerRow[],
  reviewState: ReviewState | undefined
): ProductVersionGroup {
  const sortedJobs = [...jobs].sort(
    (left, right) =>
      right.estimatedCostCny - left.estimatedCostCny || left.id.localeCompare(right.id)
  );
  const bestPreviewJob = sortedJobs.find((job) => job.hasFinalVideo);
  const productReview = reviewState?.products[productSku];
  const reviewedJobs = sortedJobs.filter((job) => job.manualReview !== undefined).length;
  const publishableJobs = sortedJobs.filter((job) => job.manualReview?.decision === "publishable").length;
  const needsEditJobs = sortedJobs.filter((job) => job.manualReview?.decision === "needs-edit").length;
  const rejectedJobs = sortedJobs.filter((job) => job.manualReview?.decision === "rejected").length;
  const usableJobs = publishableJobs + needsEditJobs;
  return {
    productSku,
    jobCount: sortedJobs.length,
    completedJobs: sortedJobs.filter((job) => job.status === "completed").length,
    paidJobs: sortedJobs.filter((job) => job.provider !== undefined && job.provider !== "mock").length,
    mockJobs: sortedJobs.filter((job) => job.provider === "mock").length,
    reviewedJobs,
    unreviewedJobs: sortedJobs.length - reviewedJobs,
    publishableJobs,
    needsEditJobs,
    rejectedJobs,
    usableJobs,
    readyForInternalValidation: sortedJobs.length >= 3,
    totalTokens: sortedJobs.reduce((sum, job) => sum + job.totalTokens, 0),
    estimatedCostCny: roundCny(sortedJobs.reduce((sum, job) => sum + job.estimatedCostCny, 0)),
    finalVideos: sortedJobs.filter((job) => job.hasFinalVideo).length,
    latestJobId: sortedJobs[0]?.id ?? "",
    bestPreviewJobId: bestPreviewJob?.id,
    selectedFinalJobId: productReview?.selectedFinalJobId,
    selectedFinalNote: productReview?.note,
    jobs: sortedJobs
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

function roundCny(value: number): number {
  return Math.round(value * 100) / 100;
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

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function truncateText(value: string | undefined, maxLength: number): string | undefined {
  if (!value || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}
