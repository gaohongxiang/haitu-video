import type { VideoJobRecord } from "./consoleVideoJobTypes.js";
import type { BillingPolicyStore } from "./billingPolicyStore.js";
import {
  persistRecoverableDownloadFailure
} from "./consoleRecoverableDownload.js";
import {
  isDownloadRecoveryRun,
  readableVideoJobError,
  serializeVideoJobError
} from "./consoleVideoJobError.js";

export async function failedVideoJobPatch(input: {
  record: VideoJobRecord;
  error: unknown;
  completedAt: string;
  reportUrlForPath: (path: string) => string;
  billingPolicyStore?: BillingPolicyStore;
}): Promise<Partial<VideoJobRecord>> {
  const errorDetails = {
    ...serializeVideoJobError(input.error),
    ...(isDownloadRecoveryRun(input.record)
      ? {
          providerPhase: "download-output",
          providerTaskId: input.record.providerTaskId,
          recoverableRawManifestPath: input.record.reuseManifest
        }
      : {})
  };
  const recoverable = await persistRecoverableDownloadFailure({
    record: input.record,
    error: input.error,
    errorDetails,
    reportUrlForPath: input.reportUrlForPath,
    billingPolicyStore: input.billingPolicyStore
  });
  const mergedErrorDetails = {
    ...errorDetails,
    providerTaskId: recoverable.providerTaskId ?? errorDetails.providerTaskId,
    providerVideoUrl: recoverable.providerVideoUrl ?? errorDetails.providerVideoUrl,
    recoverableRawManifestPath: recoverable.recoverableRawManifestPath ?? errorDetails.recoverableRawManifestPath
  };
  return {
    status: "failed",
    error: readableVideoJobError(mergedErrorDetails),
    errorDetails: mergedErrorDetails,
    ...(isDownloadRecoveryRun(input.record)
      ? {
          providerTaskId: input.record.providerTaskId,
          recoverableRawManifestPath: input.record.reuseManifest,
          canRecoverDownload: true
        }
      : {}),
    ...recoverable,
    completedAt: input.completedAt
  };
}
