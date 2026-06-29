import type { MakeVideoReport } from "../pipeline/makeVideoPipeline.js";
import type { BillingPolicyStore } from "./billingPolicyStore.js";
import type { VideoJobRecord, VideoJobRequest } from "./consoleVideoJobTypes.js";
import { estimateVideoUpstreamCostCny } from "./modelPricing.js";

export function completedVideoJobPatch(input: {
  record: VideoJobRecord;
  report: MakeVideoReport;
  hashtags?: string[];
  completedAt: string;
  mediaUrlForPath: (path: string) => string;
  billingPolicyStore?: BillingPolicyStore;
}): Partial<VideoJobRecord> {
  const upstreamActualCostCny = input.record.apiBillingMode === "platform"
    ? videoUpstreamCostFromReport(input.record, input.report) ?? input.record.upstreamEstimatedCostCny
    : 0;
  return {
    status: "completed",
    productSku: input.report.productSku,
    reportPath: input.report.reportPath,
    reportUrl: input.mediaUrlForPath(input.report.reportPath),
    rawOutputPath: input.report.raw.outputPath,
    rawOutputUrl: input.mediaUrlForPath(input.report.raw.outputPath),
    finalOutputPath: input.report.final?.outputPath,
    finalVideoUrl: input.report.final?.outputPath ? input.mediaUrlForPath(input.report.final.outputPath) : undefined,
    finalManifestPath: input.report.final?.manifestPath,
    finalManifestUrl: input.report.final?.manifestPath ? input.mediaUrlForPath(input.report.final.manifestPath) : undefined,
    subtitlePath: input.report.final?.subtitlePath,
    subtitleUrl: input.report.final?.subtitlePath ? input.mediaUrlForPath(input.report.final.subtitlePath) : undefined,
    hashtags: input.hashtags,
    totalTokens: input.report.billing?.totalTokens ?? input.report.usage?.totalTokens,
    estimatedCostCny: input.report.billing?.estimatedCostCny,
    upstreamEstimatedCostCny: upstreamActualCostCny,
    providerTaskId: input.report.raw.taskId,
    recoverableRawManifestPath: input.report.raw.manifestPath,
    providerVideoUrl: undefined,
    canRecoverDownload: false,
    error: undefined,
    errorDetails: undefined,
    completedAt: input.completedAt
  };
}

function videoUpstreamCostFromReport(record: VideoJobRecord, report: MakeVideoReport): number | undefined {
  const totalTokens = report.billing?.totalTokens ?? report.usage?.totalTokens;
  if (totalTokens === undefined) {
    return report.billing?.estimatedCostCny;
  }
  return estimateVideoUpstreamCostCny({
    model: record.providerModel,
    resolution: record.resolution,
    aspectRatio: record.aspectRatio,
    totalTokens
  });
}

export function queuedRetryVideoJobPatch(input: {
  confirmPaid?: boolean;
  apiBillingMode?: VideoJobRequest["apiBillingMode"];
  platformFeeCny?: number;
  upstreamEstimatedCostCny?: number;
  walletReservationId?: string;
  expiresAt: string;
}): Partial<VideoJobRecord> {
  return {
    status: "queued",
    confirmPaid: input.confirmPaid ?? false,
    apiBillingMode: input.apiBillingMode,
    platformFeeCny: input.platformFeeCny,
    upstreamEstimatedCostCny: input.upstreamEstimatedCostCny,
    walletReservationId: input.walletReservationId,
    ...resetGeneratedResultFields(),
    canRecoverDownload: undefined,
    expiresAt: input.expiresAt
  };
}

export function queuedRecoverDownloadVideoJobPatch(input: {
  reuseManifest?: string;
  expiresAt: string;
}): Partial<VideoJobRecord> {
  return {
    status: "queued",
    confirmPaid: false,
    reuseManifest: input.reuseManifest,
    ...resetGeneratedResultFields(),
    canRecoverDownload: false,
    expiresAt: input.expiresAt
  };
}

function resetGeneratedResultFields(): Partial<VideoJobRecord> {
  return {
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
    totalTokens: undefined,
    estimatedCostCny: undefined,
    error: undefined,
    errorDetails: undefined,
    startedAt: undefined,
    completedAt: undefined
  };
}
