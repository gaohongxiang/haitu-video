import { readableVideoProviderError } from "../core/videoProviderErrors.js";
import type { VideoJobErrorDetails, VideoJobRecord } from "./consoleVideoJobTypes.js";

export function isDownloadRecoveryRun(record: VideoJobRecord): boolean {
  return record.confirmPaid === false &&
    record.provider === "volcengine-seedance" &&
    Boolean(record.reuseManifest && record.providerTaskId);
}

export function serializeVideoJobError(error: unknown): VideoJobErrorDetails {
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

export function readableVideoJobError(details: VideoJobErrorDetails): string {
  return readableVideoProviderError(details);
}
