import { estimateCny } from "../pipeline/makeVideoPipeline.js";
import type { VideoProviderName } from "../providers/providerFactory.js";
import type { VideoAspectRatio, VideoResolution } from "../providers/types.js";
import type { ModelPricingEntry } from "../modelPricing/officialModelPricingCatalog.js";
import type { BillingPolicyStore } from "./billingPolicyStore.js";
import type { ModelConfigStore, ModelStoredConfig } from "./modelConfigStore.js";
import type { ModelServicePreferenceStore } from "./modelServicePreferenceStore.js";
import type { VideoJobRecord, VideoJobRequest } from "./consoleVideoJobTypes.js";
import { WalletStore } from "./walletStore.js";
import { assertVideoModelConfigured, resolveVideoRequestModel } from "./modelConfigSelection.js";
import {
  estimateVideoUpstreamCostCny as estimateModelVideoUpstreamCostCny,
  estimateVideoTokens as estimateModelVideoTokens,
  modelPricingSnapshotForUsage,
  type ModelPricingSnapshot,
  videoTokenPriceCnyPerMillion
} from "./modelPricing.js";

interface VideoJobReader {
  get(id: string): Promise<VideoJobRecord>;
}

export interface VideoJobBillingPlan {
  apiBillingMode?: "platform" | "byok";
  platformFeeCny?: number;
  upstreamEstimatedCostCny?: number;
  reserveAmountCny: number;
  billingCatalogVersion?: string;
  billingPriceSnapshot?: ModelPricingSnapshot;
}

export function estimateVideoJobBilling(input: {
  provider: VideoProviderName | undefined;
  modelConfig?: Partial<ModelStoredConfig>;
  durationSeconds: number;
  resolution?: VideoResolution;
  aspectRatio?: VideoAspectRatio;
  billingPolicyStore: BillingPolicyStore;
  modelPricingCatalog?: readonly ModelPricingEntry[];
  modelPricingCatalogVersion?: string;
}): VideoJobBillingPlan {
  if (!input.provider || input.provider === "mock") {
    return {
      reserveAmountCny: 0
    };
  }
  const apiBillingMode = input.modelConfig?.apiOwner === "platform" ? "platform" : "byok";
  const videoRule = input.billingPolicyStore.getRule("video");
  const platformFeeCny = videoRule.serviceFeeCny;
  const upstreamEstimatedCostCny = apiBillingMode === "platform"
    ? estimatedVideoUpstreamCostCny(input.durationSeconds, input.modelConfig?.model, input.resolution, input.aspectRatio, input.modelPricingCatalog)
    : 0;
  const estimatedTokens = estimateVideoTokens(input.durationSeconds, input.resolution, input.aspectRatio).expected;
  const billingPriceSnapshot = modelPricingSnapshotForUsage({
    kind: "video",
    model: input.modelConfig?.model,
    resolution: input.resolution,
    aspectRatio: input.aspectRatio,
    totalTokens: estimatedTokens,
    catalog: input.modelPricingCatalog,
    catalogVersion: input.modelPricingCatalogVersion
  });
  return {
    apiBillingMode,
    platformFeeCny,
    upstreamEstimatedCostCny,
    reserveAmountCny: roundMoney(platformFeeCny + upstreamEstimatedCostCny),
    billingCatalogVersion: billingPriceSnapshot.catalogVersion,
    billingPriceSnapshot
  };
}

export function reserveVideoJobBilling(input: {
  walletStore: WalletStore;
  provider: VideoProviderName | undefined;
  modelConfig?: Partial<ModelStoredConfig>;
  durationSeconds: number;
  resolution?: VideoResolution;
  aspectRatio?: VideoAspectRatio;
  billingPolicyStore: BillingPolicyStore;
  modelPricingCatalog?: readonly ModelPricingEntry[];
  modelPricingCatalogVersion?: string;
}): Pick<VideoJobRequest, "apiBillingMode" | "platformFeeCny" | "upstreamEstimatedCostCny" | "walletReservationId" | "billingCatalogVersion" | "billingPriceSnapshot"> {
  const plan = estimateVideoJobBilling(input);
  if (!plan.apiBillingMode) {
    return {};
  }
  const reservation = input.walletStore.reserve({
    amountCny: plan.reserveAmountCny,
    description: "视频生成预扣",
    metadata: {
      apiBillingMode: plan.apiBillingMode,
      platformFeeCny: plan.platformFeeCny,
      upstreamEstimatedCostCny: plan.upstreamEstimatedCostCny,
      priceSnapshot: plan.billingPriceSnapshot
    }
  });
  return {
    apiBillingMode: plan.apiBillingMode,
    platformFeeCny: plan.platformFeeCny,
    upstreamEstimatedCostCny: plan.upstreamEstimatedCostCny,
    walletReservationId: reservation.reservationId,
    billingCatalogVersion: plan.billingCatalogVersion,
    billingPriceSnapshot: plan.billingPriceSnapshot
  };
}

export async function reserveRetryVideoJobBilling(input: {
  record: VideoJobRecord;
  walletStore: WalletStore;
  modelConfigStore: ModelConfigStore;
  platformModelConfigStore?: ModelConfigStore;
  modelServicePreferenceStore?: ModelServicePreferenceStore;
  billingPolicyStore: BillingPolicyStore;
  modelPricingCatalog?: readonly ModelPricingEntry[];
  modelPricingCatalogVersion?: string;
}): Promise<Pick<VideoJobRequest, "apiBillingMode" | "platformFeeCny" | "upstreamEstimatedCostCny" | "walletReservationId" | "billingCatalogVersion" | "billingPriceSnapshot">> {
  if (!input.record.provider || input.record.provider === "mock") {
    return {};
  }
  const videoModel = await resolveVideoRequestModel({
    modelConfigStore: input.modelConfigStore,
    platformModelConfigStore: input.platformModelConfigStore,
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
    durationSeconds: input.record.durationSeconds ?? 8,
    resolution: input.record.resolution,
    aspectRatio: input.record.aspectRatio,
    billingPolicyStore: input.billingPolicyStore,
    modelPricingCatalog: input.modelPricingCatalog,
    modelPricingCatalogVersion: input.modelPricingCatalogVersion
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

export function estimateVideoTokens(durationSeconds: number, resolution?: VideoResolution, aspectRatio?: VideoAspectRatio): { low: number; expected: number; high: number } {
  return estimateModelVideoTokens({ durationSeconds, resolution, aspectRatio });
}

export function estimateVideoCostCny(durationSeconds: number): number {
  return estimatedVideoUpstreamCostCny(durationSeconds);
}

export function estimatedVideoUpstreamCostCny(
  durationSeconds: number,
  model?: string,
  resolution?: VideoResolution,
  aspectRatio?: VideoAspectRatio,
  modelPricingCatalog?: readonly ModelPricingEntry[]
): number {
  return estimateModelVideoUpstreamCostCny({
    model,
    resolution,
    aspectRatio,
    totalTokens: estimateVideoTokens(durationSeconds, resolution, aspectRatio).expected,
    catalog: modelPricingCatalog
  });
}

export function tokenPriceCnyPerMillionForVideoModel(model?: string, resolution?: VideoResolution, modelPricingCatalog?: readonly ModelPricingEntry[]): number {
  return modelPricingCatalog
    ? estimateModelVideoUpstreamCostCny({
        model,
        resolution,
        totalTokens: 1_000_000,
        catalog: modelPricingCatalog
      })
    : videoTokenPriceCnyPerMillion(model, resolution);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
