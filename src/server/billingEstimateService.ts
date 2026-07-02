import type { BillingPolicyStore, BillingUsageKind } from "./billingPolicyStore.js";
import type { VideoAspectRatio, VideoResolution } from "../providers/types.js";
import { normalizeVideoAspectRatio } from "../providers/videoGeometry.js";
import {
  estimateImageUpstreamCostCny,
  estimateTextUpstreamCostCny
} from "./modelPricing.js";
import type { ModelPricingEntry } from "../modelPricing/officialModelPricingCatalog.js";
import type { ModelConfigStore, ModelStoredConfig } from "./modelConfigStore.js";
import { selectModelConfig } from "./modelConfigSelection.js";
import type { ModelServicePreferenceStore } from "./modelServicePreferenceStore.js";
import { estimatedVideoUpstreamCostCny } from "./videoJobBilling.js";

export interface BillingEstimatesRequest {
  textModelConfigId?: string;
  imageModelConfigId?: string;
  videoModelConfigId?: string;
  referenceImageCount?: number;
  videoDurationSeconds?: number;
  videoResolution?: VideoResolution;
  videoAspectRatio?: VideoAspectRatio;
  videoCount?: number;
}

export interface BillingActionEstimate {
  usageKind: BillingUsageKind;
  apiBillingMode: "platform" | "byok";
  units: number;
  serviceFeeCny: number;
  upstreamEstimatedCostCny: number;
  walletEstimatedChargeCny: number;
  model?: string;
}

export interface BillingEstimatesResponse {
  estimates: {
    organizeProduct: BillingActionEstimate;
    storyboard: BillingActionEstimate;
    referenceImages: BillingActionEstimate;
    video: BillingActionEstimate;
  };
}

export async function estimateBillingActions(input: {
  billingPolicyStore: BillingPolicyStore;
  modelConfigStore: ModelConfigStore;
  platformModelConfigStore?: ModelConfigStore;
  modelServicePreferenceStore?: ModelServicePreferenceStore;
  modelPricingCatalog?: readonly ModelPricingEntry[];
  input: BillingEstimatesRequest;
}): Promise<BillingEstimatesResponse> {
  const [textModel, imageModel, videoModel] = await Promise.all([
    selectModelConfig({
      modelConfigStore: input.modelConfigStore,
      platformModelConfigStore: input.platformModelConfigStore,
      modelServicePreferenceStore: input.modelServicePreferenceStore,
      capability: "text",
      requestedConfigId: normalizeConfigId(input.input.textModelConfigId)
    }),
    selectModelConfig({
      modelConfigStore: input.modelConfigStore,
      platformModelConfigStore: input.platformModelConfigStore,
      modelServicePreferenceStore: input.modelServicePreferenceStore,
      capability: "image",
      requestedConfigId: normalizeConfigId(input.input.imageModelConfigId)
    }),
    selectModelConfig({
      modelConfigStore: input.modelConfigStore,
      platformModelConfigStore: input.platformModelConfigStore,
      modelServicePreferenceStore: input.modelServicePreferenceStore,
      capability: "video",
      requestedConfigId: normalizeConfigId(input.input.videoModelConfigId)
    })
  ]);
  const referenceImageCount = clampInteger(input.input.referenceImageCount, 1, 4, 1);
  const videoDurationSeconds = clampInteger(input.input.videoDurationSeconds, 4, 15, 10);
  const videoResolution = normalizeVideoResolution(input.input.videoResolution);
  const videoAspectRatio = normalizeVideoAspectRatio(input.input.videoAspectRatio);
  const videoCount = clampInteger(input.input.videoCount, 1, 5, 1);

  return {
    estimates: {
      organizeProduct: estimateTextAction({
        billingPolicyStore: input.billingPolicyStore,
        modelConfig: textModel,
        units: 1,
        modelPricingCatalog: input.modelPricingCatalog
      }),
      storyboard: estimateTextAction({
        billingPolicyStore: input.billingPolicyStore,
        modelConfig: textModel,
        units: 1,
        modelPricingCatalog: input.modelPricingCatalog
      }),
      referenceImages: estimateImageAction({
        billingPolicyStore: input.billingPolicyStore,
        modelConfig: imageModel,
        units: referenceImageCount,
        modelPricingCatalog: input.modelPricingCatalog
      }),
      video: estimateVideoAction({
        billingPolicyStore: input.billingPolicyStore,
        modelConfig: videoModel,
        durationSeconds: videoDurationSeconds,
        resolution: videoResolution,
        aspectRatio: videoAspectRatio,
        units: videoCount,
        modelPricingCatalog: input.modelPricingCatalog
      })
    }
  };
}

function estimateTextAction(input: {
  billingPolicyStore: BillingPolicyStore;
  modelConfig?: Partial<ModelStoredConfig>;
  units: number;
  modelPricingCatalog?: readonly ModelPricingEntry[];
}): BillingActionEstimate {
  return estimateAction({
    billingPolicyStore: input.billingPolicyStore,
    usageKind: "text",
    modelConfig: input.modelConfig,
    units: input.units,
    upstreamCost: (model, units) => estimateTextUpstreamCostCny(model, units, input.modelPricingCatalog)
  });
}

function estimateImageAction(input: {
  billingPolicyStore: BillingPolicyStore;
  modelConfig?: Partial<ModelStoredConfig>;
  units: number;
  modelPricingCatalog?: readonly ModelPricingEntry[];
}): BillingActionEstimate {
  return estimateAction({
    billingPolicyStore: input.billingPolicyStore,
    usageKind: "image",
    modelConfig: input.modelConfig,
    units: input.units,
    upstreamCost: (model, units) => estimateImageUpstreamCostCny(model, units, input.modelPricingCatalog)
  });
}

function estimateVideoAction(input: {
  billingPolicyStore: BillingPolicyStore;
  modelConfig?: Partial<ModelStoredConfig>;
  durationSeconds: number;
  resolution: VideoResolution;
  aspectRatio: VideoAspectRatio;
  units: number;
  modelPricingCatalog?: readonly ModelPricingEntry[];
}): BillingActionEstimate {
  return estimateAction({
    billingPolicyStore: input.billingPolicyStore,
    usageKind: "video",
    modelConfig: input.modelConfig,
    units: input.units,
    upstreamCost: (model, units) => roundMoney(estimatedVideoUpstreamCostCny(input.durationSeconds, model, input.resolution, input.aspectRatio, input.modelPricingCatalog) * units)
  });
}

function estimateAction(input: {
  billingPolicyStore: BillingPolicyStore;
  usageKind: BillingUsageKind;
  modelConfig?: Partial<ModelStoredConfig>;
  units: number;
  upstreamCost: (model: string | undefined, units: number) => number;
}): BillingActionEstimate {
  const rule = input.billingPolicyStore.getRule(input.usageKind);
  const units = Math.max(1, input.units);
  const apiBillingMode = input.modelConfig?.apiOwner === "platform" ? "platform" : "byok";
  const serviceFeeCny = roundMoney(rule.serviceFeeCny * units);
  const upstreamEstimatedCostCny = input.upstreamCost(input.modelConfig?.model, units);
  return {
    usageKind: input.usageKind,
    apiBillingMode,
    units,
    serviceFeeCny,
    upstreamEstimatedCostCny,
    walletEstimatedChargeCny: roundMoney(serviceFeeCny + (apiBillingMode === "platform" ? upstreamEstimatedCostCny : 0)),
    model: input.modelConfig?.model
  };
}

function normalizeConfigId(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeVideoResolution(value: unknown): VideoResolution {
  if (value === "720p" || value === "1080p" || value === "4k") {
    return value;
  }
  return "480p";
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
