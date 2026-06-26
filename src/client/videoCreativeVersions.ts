import { isActiveVideoJobStatus } from "./videoJobRefresh.js";

export type VideoJobStatus = "queued" | "running" | "completed" | "failed" | "canceled";

export interface ProductIdentity {
  path: string;
  sku: string;
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

export interface LedgerJob {
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
  hasFinalVideo: boolean;
  finalVideoUrl?: string;
  expiresAt?: string;
  expired?: boolean;
  rawManifestPath?: string;
  selectedFinal: boolean;
  error?: string;
  errorDetails?: VideoJobErrorDetails;
  qc?: unknown;
  contentReview: JobContentReviewSnapshot;
}

export interface ProductGroup {
  productSku: string;
  jobCount: number;
  completedJobs: number;
  paidJobs: number;
  mockJobs: number;
  reviewedJobs?: number;
  unreviewedJobs?: number;
  publishableJobs?: number;
  needsEditJobs?: number;
  rejectedJobs?: number;
  usableJobs?: number;
  readyForInternalValidation?: boolean;
  totalTokens: number;
  estimatedCostCny: number;
  finalVideos: number;
  latestJobId: string;
  bestPreviewJobId?: string;
  selectedFinalJobId?: string;
  selectedFinalNote?: string;
  jobs: LedgerJob[];
}

export interface Ledger {
  summary: {
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
  };
  jobs: LedgerJob[];
  products: ProductGroup[];
}

export interface VideoJob {
  id: string;
  status: VideoJobStatus;
  productPath: string;
  productSku?: string;
  provider?: string;
  providerModel?: string;
  durationSeconds?: number;
  template?: string;
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
  startedAt?: string;
  completedAt?: string;
  expiresAt?: string;
  expired?: boolean;
}

export interface CreativeVersionItem {
  id: string;
  status?: string;
  provider?: string;
  providerModel?: string;
  durationSeconds?: number;
  selectedFinal: boolean;
  hasFinalVideo: boolean;
  finalVideoUrl?: string;
  createdAt?: string;
  completedAt?: string;
  expiresAt?: string;
  expired?: boolean;
  hashtags?: string[];
  source: "video-job" | "ledger";
  videoJob?: VideoJob;
}

export function removeLedgerJob(ledger: Ledger, jobId: string): Ledger {
  const jobs = ledger.jobs.filter((job) => job.id !== jobId);
  return {
    ...ledger,
    jobs,
    products: ledger.products
      .map((product) => {
        const productJobs = product.jobs.filter((job) => job.id !== jobId);
        return {
          ...product,
          jobs: productJobs,
          jobCount: productJobs.length
        };
      })
      .filter((product) => product.jobs.length > 0)
  };
}

export function mergeLedgerJobs(...jobGroups: LedgerJob[][]): LedgerJob[] {
  const byId = new Map<string, LedgerJob>();
  for (const jobs of jobGroups) {
    for (const job of jobs) {
      if (!byId.has(job.id)) {
        byId.set(job.id, job);
      }
    }
  }
  return Array.from(byId.values());
}

export function mergeVideoJobs(nextJobs: VideoJob[], currentJobs: VideoJob[]): VideoJob[] {
  const byId = new Map<string, VideoJob>();
  for (const job of [...nextJobs, ...currentJobs]) {
    if (!byId.has(job.id)) {
      byId.set(job.id, job);
    }
  }
  return Array.from(byId.values()).sort((left, right) => videoJobSortTime(right) - videoJobSortTime(left));
}

export function buildLatestCreativeJobs(input: {
  actionProduct: ProductIdentity;
  ledgerJobs: LedgerJob[];
  videoJobs: VideoJob[];
}): CreativeVersionItem[] {
  const matchingVideoJobs = input.videoJobs
    .filter((job) => isVideoJobForProduct(job, input.actionProduct));
  const productVideoJobs = matchingVideoJobs
    .filter((job) => job.status !== "canceled")
    .map(videoJobToCreativeVersion);
  const videoJobIds = new Set(productVideoJobs.map((job) => job.id));
  const ledgerVersions = input.ledgerJobs
    .filter((job) => !videoJobIds.has(job.id))
    .map(ledgerJobToCreativeVersion);
  return [...productVideoJobs, ...ledgerVersions]
    .sort((left, right) => creativeVersionSortTime(right) - creativeVersionSortTime(left));
}

export function videoJobToCreativeVersion(job: VideoJob): CreativeVersionItem {
  return {
    id: job.id,
    status: job.status,
    provider: job.provider,
    providerModel: job.providerModel,
    durationSeconds: job.durationSeconds,
    selectedFinal: false,
    hasFinalVideo: hasPlayableVideo(job),
    finalVideoUrl: job.finalVideoUrl,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    expiresAt: job.expiresAt,
    expired: job.expired,
    hashtags: job.hashtags,
    source: "video-job",
    videoJob: job
  };
}

export function ledgerJobToCreativeVersion(job: LedgerJob): CreativeVersionItem {
  const createdAt = createdAtFromReportPath(job.reportPath);
  const status = isVideoJobStatus(job.status) ? job.status : "failed";
  return {
    id: job.id,
    status: job.status,
    provider: job.provider,
    providerModel: job.providerModel,
    durationSeconds: job.durationSeconds,
    selectedFinal: job.selectedFinal,
    hasFinalVideo: hasPlayableVideo(job),
    finalVideoUrl: job.finalVideoUrl,
    createdAt,
    expiresAt: job.expiresAt,
    expired: job.expired,
    hashtags: job.contentReview.hashtags,
    source: "ledger",
    videoJob: job.error || job.errorDetails
      ? {
          id: job.id,
          status,
          productPath: "",
          productSku: job.productSku,
          provider: job.provider,
          providerModel: job.providerModel,
          durationSeconds: job.durationSeconds,
          confirmPaid: job.provider !== undefined && job.provider !== "mock",
          outDir: "",
          error: job.error,
          errorDetails: job.errorDetails,
          createdAt: createdAt ?? "",
          updatedAt: createdAt ?? "",
          completedAt: createdAt,
          expiresAt: job.expiresAt,
          expired: job.expired
        }
      : undefined
  };
}

export function isVideoJobStatus(value: string | undefined): value is VideoJobStatus {
  return value === "queued" || value === "running" || value === "completed" || value === "failed" || value === "canceled";
}

export function isVideoJobForProduct(job: VideoJob, product: ProductIdentity): boolean {
  return job.productSku === product.sku || job.productPath === product.path;
}

export function isActiveCreativeVersion(job: CreativeVersionItem): boolean {
  return isActiveVideoJobStatus(job.status);
}

export function hasPlayableVideo(job: { finalVideoUrl?: string; finalOutputPath?: string; expiresAt?: string; expired?: boolean }): boolean {
  return !isExpiredVideo(job) && Boolean(job.finalVideoUrl || job.finalOutputPath);
}

export function isExpiredVideo(job: { expiresAt?: string; expired?: boolean }): boolean {
  if (job.expired) return true;
  if (!job.expiresAt) return false;
  const expiresAt = Date.parse(job.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

export function creativeVersionSortTime(job: CreativeVersionItem): number {
  return job.createdAt ? Date.parse(job.createdAt) || 0 : 0;
}

export function videoJobSortTime(job: VideoJob): number {
  return Date.parse(job.createdAt) || 0;
}

function createdAtFromReportPath(path?: string): string | undefined {
  if (!path) {
    return undefined;
  }
  const match = path.match(/console-(\d{13})/);
  if (!match) {
    return undefined;
  }
  const date = new Date(Number(match[1]));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
