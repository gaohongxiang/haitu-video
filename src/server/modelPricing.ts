import {
  modelPricingEntryForModel,
  officialModelPricingUpdatedAt,
  providerForModelPricingEntry,
  type ImagePricingRule,
  type ModelPricingEntry,
  type ModelPricingSource,
  type TextTokenPricingRule,
  type VideoPricingResolution,
  type VideoTokenPricingRule
} from "../modelPricing/officialModelPricingCatalog.js";
import type { VideoAspectRatio, VideoResolution } from "../providers/types.js";
import { videoPixelArea } from "../providers/videoGeometry.js";

export interface ModelPriceEstimate {
  unitCostCny: number;
  estimatedCostCny: number;
  source: ModelPricingSource;
}

export interface TextTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
}

export type ModelPricingSnapshot =
  | TextModelPricingSnapshot
  | ImageModelPricingSnapshot
  | VideoModelPricingSnapshot
  | FallbackModelPricingSnapshot;

export interface BaseModelPricingSnapshot {
  catalogVersion: string;
  model: string | undefined;
  requestedModel?: string;
  providerId?: string;
  currency: "CNY" | "USD";
  source: ModelPricingSource;
  sourceUrl?: string;
}

export interface TextModelPricingSnapshot extends BaseModelPricingSnapshot {
  kind: "text";
  unit: "text_tokens_1m";
  inputPriceCnyPerMillion: number;
  outputPriceCnyPerMillion: number;
  cachedInputPriceCnyPerMillion?: number;
  fallbackPriceCnyPerCall?: number;
  textUsage?: TextTokenUsage;
  exchangeRate?: {
    from: "USD";
    to: "CNY";
    rate: number;
  };
}

export interface ImageModelPricingSnapshot extends BaseModelPricingSnapshot {
  kind: "image";
  unit: "image" | "image_tokens_1m";
  unitPriceCny?: number;
  imagePriceCnyPerImage?: number;
  inputPriceCnyPerMillion?: number;
  outputPriceCnyPerMillion?: number;
  cachedInputPriceCnyPerMillion?: number;
  units?: number;
}

export interface VideoModelPricingSnapshot extends BaseModelPricingSnapshot {
  kind: "video";
  unit: "video_tokens_1m";
  unitPriceCny: number;
  resolution?: VideoResolution;
  aspectRatio?: VideoAspectRatio;
  totalTokens?: number;
}

export interface FallbackModelPricingSnapshot extends BaseModelPricingSnapshot {
  kind: "text" | "image" | "video";
  unit: "call" | "image" | "video_tokens_1m";
  unitPriceCny: number;
}

export type ModelPricingSnapshotInput =
  | {
      kind: "text";
      model?: string;
      textUsage?: TextTokenUsage;
      catalog?: readonly ModelPricingEntry[];
      catalogVersion?: string;
    }
  | {
      kind: "image";
      model?: string;
      units?: number;
      catalog?: readonly ModelPricingEntry[];
      catalogVersion?: string;
    }
  | {
      kind: "video";
      model?: string;
      resolution?: VideoResolution;
      aspectRatio?: VideoAspectRatio;
      totalTokens?: number;
      catalog?: readonly ModelPricingEntry[];
      catalogVersion?: string;
    };

const defaultVideoTokenPriceCnyPerMillion = 37;
const defaultImagePriceCnyPerImage = 0.3;
const defaultTextPriceCnyPerCall = 0.02;
const seedanceOutputFrameRate = 24;

export function videoTokenPriceCnyPerMillion(model: string | undefined, resolution?: VideoResolution): number {
  return videoTokenPriceCnyPerMillionFromCatalog(model, resolution);
}

function videoTokenPriceCnyPerMillionFromCatalog(
  model: string | undefined,
  resolution?: VideoResolution,
  catalog?: readonly ModelPricingEntry[]
): number {
  const rule = videoPricingRuleForEntry(pricingEntryForModel(model, catalog));
  if (!rule) {
    return defaultVideoTokenPriceCnyPerMillion;
  }
  if (rule.videoTokenPriceCnyPerMillionByResolution) {
    return rule.videoTokenPriceCnyPerMillionByResolution[videoPricingResolution(resolution)]
      ?? rule.videoTokenPriceCnyPerMillion
      ?? defaultVideoTokenPriceCnyPerMillion;
  }
  return rule.videoTokenPriceCnyPerMillion ?? defaultVideoTokenPriceCnyPerMillion;
}

export function estimateVideoTokens(input: {
  durationSeconds: number;
  resolution?: VideoResolution;
  aspectRatio?: VideoAspectRatio;
}): { low: number; expected: number; high: number } {
  const pixelArea = videoPixelArea({
    resolution: input.resolution,
    aspectRatio: input.aspectRatio
  });
  const expected = Math.round(Math.max(0, input.durationSeconds) * pixelArea * seedanceOutputFrameRate / 1024);
  return {
    low: roundToThousand(expected * 0.75),
    expected,
    high: roundToThousand(expected * 1.35)
  };
}

export function estimateVideoUpstreamCostCny(input: {
  model?: string;
  resolution?: VideoResolution;
  aspectRatio?: VideoAspectRatio;
  totalTokens: number;
  catalog?: readonly ModelPricingEntry[];
}): number {
  return roundMoney((Math.max(0, input.totalTokens) / 1_000_000) * videoTokenPriceCnyPerMillionFromCatalog(input.model, input.resolution, input.catalog));
}

export function estimateImageUpstreamCostCny(model: string | undefined, images: number, catalog?: readonly ModelPricingEntry[]): number {
  return roundMoney(imagePriceCnyPerImage(model, catalog) * Math.max(1, images));
}

export function estimateTextUpstreamCostCny(model: string | undefined, callsOrUsage: number | TextTokenUsage, catalog?: readonly ModelPricingEntry[]): number {
  if (typeof callsOrUsage === "number") {
    return roundMoney(fallbackTextPriceCnyPerCall(model, catalog) * Math.max(1, callsOrUsage));
  }
  const usageCost = estimateTextTokenUsageCostCny(model, callsOrUsage, catalog);
  if (usageCost !== undefined) {
    return usageCost;
  }
  return estimateTextUpstreamCostCny(model, 1, catalog);
}

export function modelPricingSnapshotForUsage(input: ModelPricingSnapshotInput): ModelPricingSnapshot {
  const entry = pricingEntryForModel(input.model, input.catalog);
  const provider = providerForModelPricingEntry(entry);
  const requestedModel = input.model;
  const catalogVersion = input.catalogVersion ?? officialModelPricingUpdatedAt;
  if (input.kind === "video") {
    const rule = videoPricingRuleForEntry(entry);
    const unitPriceCny = videoTokenPriceCnyPerMillionFromCatalog(input.model, input.resolution, input.catalog);
    return {
      catalogVersion,
      kind: "video",
      model: entry?.model ?? requestedModel,
      requestedModel,
      providerId: provider?.id,
      currency: rule?.currency ?? "CNY",
      unit: "video_tokens_1m",
      unitPriceCny,
      resolution: input.resolution,
      aspectRatio: input.aspectRatio,
      totalTokens: input.totalTokens,
      source: rule ? "official_snapshot" : "fallback",
      sourceUrl: entry?.sourceUrl
    };
  }
  if (input.kind === "image") {
    const rule = imagePricingRuleForEntry(entry);
    const unitPriceCny = imagePriceCnyPerImage(input.model, input.catalog);
    return {
      catalogVersion,
      kind: "image",
      model: entry?.model ?? requestedModel,
      requestedModel,
      providerId: provider?.id,
      currency: rule?.currency ?? "CNY",
      unit: rule?.unit ?? "image",
      unitPriceCny,
      imagePriceCnyPerImage: rule?.imagePriceCnyPerImage ?? unitPriceCny,
      inputPriceCnyPerMillion: rule?.inputPriceCnyPerMillion,
      outputPriceCnyPerMillion: rule?.outputPriceCnyPerMillion,
      cachedInputPriceCnyPerMillion: rule?.cachedInputPriceCnyPerMillion,
      units: input.units,
      source: rule ? "official_snapshot" : "fallback",
      sourceUrl: entry?.sourceUrl
    };
  }
  const rule = textPricingRuleForEntry(entry);
  if (!rule) {
    return {
      catalogVersion,
      kind: "text",
      model: entry?.model ?? requestedModel,
      requestedModel,
      providerId: provider?.id,
      currency: "CNY",
      unit: "call",
      unitPriceCny: defaultTextPriceCnyPerCall,
      source: "fallback",
      sourceUrl: entry?.sourceUrl
    };
  }
  return {
    catalogVersion,
    kind: "text",
    model: entry?.model ?? requestedModel,
    requestedModel,
    providerId: provider?.id,
    currency: rule.currency,
    unit: rule.unit,
    inputPriceCnyPerMillion: rule.inputPriceCnyPerMillion,
    outputPriceCnyPerMillion: rule.outputPriceCnyPerMillion,
    cachedInputPriceCnyPerMillion: rule.cachedInputPriceCnyPerMillion,
    fallbackPriceCnyPerCall: rule.fallbackPriceCnyPerCall,
    textUsage: input.textUsage,
    exchangeRate: rule.exchangeRate,
    source: "official_snapshot",
    sourceUrl: entry?.sourceUrl
  };
}

function imagePriceCnyPerImage(model: string | undefined, catalog?: readonly ModelPricingEntry[]): number {
  return imagePricingRuleForEntry(pricingEntryForModel(model, catalog))?.imagePriceCnyPerImage ?? defaultImagePriceCnyPerImage;
}

function fallbackTextPriceCnyPerCall(model: string | undefined, catalog?: readonly ModelPricingEntry[]): number {
  return textPricingRuleForEntry(pricingEntryForModel(model, catalog))?.fallbackPriceCnyPerCall ?? defaultTextPriceCnyPerCall;
}

function estimateTextTokenUsageCostCny(model: string | undefined, usage: TextTokenUsage, catalog?: readonly ModelPricingEntry[]): number | undefined {
  const totalTokens = positiveNumber(usage.totalTokens);
  const inputTokens = positiveNumber(usage.inputTokens);
  const outputTokens = positiveNumber(usage.outputTokens);
  const cachedInputTokens = positiveNumber(usage.cachedInputTokens);
  if (totalTokens === undefined && inputTokens === undefined && outputTokens === undefined) {
    return undefined;
  }
  const price = textPricingRuleForEntry(pricingEntryForModel(model, catalog));
  if (!price) {
    return undefined;
  }
  const billableCachedInputTokens = Math.min(cachedInputTokens ?? 0, inputTokens ?? 0);
  const billableInputTokens = inputTokens === undefined
    ? Math.max(0, (totalTokens ?? 0) - (outputTokens ?? 0))
    : Math.max(0, inputTokens - billableCachedInputTokens);
  const billableOutputTokens = outputTokens ?? Math.max(0, (totalTokens ?? 0) - (inputTokens ?? 0));
  return roundMoney(
    (billableInputTokens / 1_000_000) * price.inputPriceCnyPerMillion +
    (billableCachedInputTokens / 1_000_000) * (price.cachedInputPriceCnyPerMillion ?? price.inputPriceCnyPerMillion) +
    (billableOutputTokens / 1_000_000) * price.outputPriceCnyPerMillion
  );
}

function pricingEntryForModel(model: string | undefined, catalog?: readonly ModelPricingEntry[]): ModelPricingEntry | undefined {
  if (!catalog) {
    return modelPricingEntryForModel(model);
  }
  const normalized = normalizeModel(model);
  if (!normalized) {
    return undefined;
  }
  return catalog.find((entry) => {
    return normalizeModel(entry.model) === normalized
      || Boolean(entry.aliases?.some((alias) => normalizeModel(alias) === normalized));
  }) ?? modelPricingEntryForModel(model);
}

function textPricingRuleForEntry(entry: ModelPricingEntry | undefined): TextTokenPricingRule | undefined {
  return entry?.settlement?.kind === "text" ? entry.settlement : undefined;
}

function imagePricingRuleForEntry(entry: ModelPricingEntry | undefined): ImagePricingRule | undefined {
  return entry?.settlement?.kind === "image" ? entry.settlement : undefined;
}

function videoPricingRuleForEntry(entry: ModelPricingEntry | undefined): VideoTokenPricingRule | undefined {
  return entry?.settlement?.kind === "video" ? entry.settlement : undefined;
}

function videoPricingResolution(resolution: VideoResolution | undefined): VideoPricingResolution {
  return resolution ?? "480p";
}

function positiveNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizeModel(model: string | undefined): string | undefined {
  const normalized = model?.trim().toLowerCase();
  return normalized || undefined;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundToThousand(value: number): number {
  return Math.round(value / 1000) * 1000;
}
