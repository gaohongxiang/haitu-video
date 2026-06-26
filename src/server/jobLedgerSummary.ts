import type { JobLedgerRow } from "./jobLedger.js";
import type { ReviewState } from "./reviewStore.js";

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

export function summarizeJobs(jobs: JobLedgerRow[]): JobLedgerSummary {
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

export function summarizeReviewProgress(jobs: JobLedgerRow[]): ReviewProgressSummary {
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

export function summarizeInternalValidation(jobs: JobLedgerRow[]): InternalValidationSummary {
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

export function groupProducts(jobs: JobLedgerRow[], reviewState: ReviewState | undefined): ProductVersionGroup[] {
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

function roundCny(value: number): number {
  return Math.round(value * 100) / 100;
}
