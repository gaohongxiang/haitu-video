import { estimateCny } from "../pipeline/makeVideoPipeline.js";
import type { VideoProviderName } from "../providers/providerFactory.js";
import type { ModelBundleStore } from "./modelBundleStore.js";
import type { ModelConfigStore, ModelStoredConfig } from "./modelConfigStore.js";
import type { ModelServicePreferenceStore } from "./modelServicePreferenceStore.js";
import type { VideoJobRecord, VideoJobRequest } from "./consoleVideoJobTypes.js";
import { WalletStore } from "./walletStore.js";
import { assertVideoModelConfigured, resolveVideoRequestModel } from "./modelConfigSelection.js";

interface VideoJobReader {
  get(id: string): Promise<VideoJobRecord>;
}

export function reserveVideoJobBilling(input: {
  walletStore: WalletStore;
  provider: VideoProviderName | undefined;
  modelConfig?: Partial<ModelStoredConfig>;
  durationSeconds: number;
}): Pick<VideoJobRequest, "apiBillingMode" | "platformFeeCny" | "upstreamEstimatedCostCny" | "walletReservationId"> {
  if (!input.provider || input.provider === "mock") {
    return {};
  }
  const apiBillingMode = input.modelConfig?.apiOwner === "platform" ? "platform" : "byok";
  const platformFeeCny = platformFeeCnyPerVideo();
  const upstreamEstimatedCostCny = apiBillingMode === "platform" ? estimatedVideoUpstreamCostCny(input.durationSeconds) : 0;
  const reserveAmountCny = roundMoney(platformFeeCny + upstreamEstimatedCostCny);
  const reservation = input.walletStore.reserve({
    amountCny: reserveAmountCny,
    description: "视频生成预扣",
    metadata: {
      apiBillingMode,
      platformFeeCny,
      upstreamEstimatedCostCny
    }
  });
  return {
    apiBillingMode,
    platformFeeCny,
    upstreamEstimatedCostCny,
    walletReservationId: reservation.reservationId
  };
}

export async function reserveRetryVideoJobBilling(input: {
  record: VideoJobRecord;
  walletStore: WalletStore;
  modelConfigStore: ModelConfigStore;
  platformModelConfigStore?: ModelConfigStore;
  modelBundleStore?: ModelBundleStore;
  modelServicePreferenceStore?: ModelServicePreferenceStore;
}): Promise<Pick<VideoJobRequest, "apiBillingMode" | "platformFeeCny" | "upstreamEstimatedCostCny" | "walletReservationId">> {
  if (!input.record.provider || input.record.provider === "mock") {
    return {};
  }
  const videoModel = await resolveVideoRequestModel({
    modelConfigStore: input.modelConfigStore,
    platformModelConfigStore: input.platformModelConfigStore,
    modelBundleStore: input.modelBundleStore,
    modelServicePreferenceStore: input.modelServicePreferenceStore,
    provider: input.record.provider,
    body: {
      providerModelConfigId: input.record.providerModelConfigId,
      providerModel: input.record.providerModel
    }
  });
  return reserveVideoJobBilling({
    walletStore: input.walletStore,
    provider: input.record.provider,
    modelConfig: videoModel.config,
    durationSeconds: input.record.durationSeconds ?? 8
  });
}

export async function assertRetryVideoJobAllowed(input: {
  jobId: string;
  confirmPaid?: boolean;
  videoJobQueue: VideoJobReader;
  modelConfigStore: ModelConfigStore;
  platformModelConfigStore?: ModelConfigStore;
}): Promise<VideoJobRecord> {
  const record = await input.videoJobQueue.get(input.jobId);
  if (record.provider && record.provider !== "mock" && input.confirmPaid !== true) {
    throw new Error("Retrying a paid video job requires confirmPaid: true.");
  }
  await assertVideoModelConfigured(input.modelConfigStore, input.platformModelConfigStore, record.provider, record.providerModelConfigId);
  return record;
}

export function estimateVideoTokens(durationSeconds: number): { low: number; expected: number; high: number } {
  const expected = Math.round((80770 / 8) * durationSeconds);
  return {
    low: roundToThousand(expected * 0.75),
    expected: roundToTen(expected),
    high: roundToThousand(expected * 1.35)
  };
}

export function estimateVideoCostCny(durationSeconds: number): number {
  const tokenPriceCnyPerMillion = Number(process.env.SEEDANCE_TOKEN_PRICE_CNY_PER_MILLION ?? 37);
  return estimateCny(estimateVideoTokens(durationSeconds).expected, tokenPriceCnyPerMillion);
}

function platformFeeCnyPerVideo(): number {
  return roundMoney(numberFromEnv(process.env.HAITU_PLATFORM_FEE_CNY_PER_VIDEO, 1));
}

function estimatedVideoUpstreamCostCny(durationSeconds: number): number {
  const tokenPriceCnyPerMillion = Number(process.env.SEEDANCE_TOKEN_PRICE_CNY_PER_MILLION ?? 37);
  return estimateCny(estimateVideoTokens(durationSeconds).expected, tokenPriceCnyPerMillion);
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundToThousand(value: number): number {
  return Math.round(value / 1000) * 1000;
}

function roundToTen(value: number): number {
  return Math.round(value / 10) * 10;
}
