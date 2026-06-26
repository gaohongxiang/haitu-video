import { normalizeFinalVideoLanguage } from "../core/videoLanguage.js";
import type { ConsoleSettings } from "./consoleSettings.js";
import type { VideoJobRecord, VideoJobRequest } from "./consoleVideoJobTypes.js";

export function createQueuedVideoJobRecord(input: {
  id: string;
  workspaceId: string;
  request: VideoJobRequest;
  settings: ConsoleSettings;
  outDir: string;
  createdAt: string;
  expiresAt: string;
}): VideoJobRecord {
  const { id, workspaceId, request, settings, outDir, createdAt, expiresAt } = input;
  const provider = request.provider ?? settings.defaultProvider;
  return {
    id,
    workspaceId,
    status: "queued",
    productPath: request.productPath,
    provider,
    providerModelConfigId: request.providerModelConfigId,
    providerModel: request.providerModel,
    durationSeconds: request.duration ?? settings.defaultDurationSeconds,
    resolution: request.resolution,
    template: request.template ?? settings.defaultTemplate,
    finalLanguage: normalizeFinalVideoLanguage(request.finalLanguage ?? settings.defaultLanguage),
    cta: request.cta ?? settings.defaultCta,
    scriptLines: sanitizeLines(request.scriptLines),
    storyboardLines: sanitizeLines(request.storyboardLines),
    confirmPaid: request.confirmPaid ?? provider !== "mock",
    apiBillingMode: request.apiBillingMode,
    platformFeeCny: request.platformFeeCny,
    upstreamEstimatedCostCny: request.upstreamEstimatedCostCny,
    walletReservationId: request.walletReservationId,
    reuseManifest: request.reuseManifest,
    outDir,
    createdAt,
    updatedAt: createdAt,
    expiresAt
  };
}

function sanitizeLines(lines?: string[]): string[] | undefined {
  const cleaned = (lines ?? []).map((line) => line.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}
