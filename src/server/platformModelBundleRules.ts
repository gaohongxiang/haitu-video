import {
  catalogEntryForModel
} from "../providers/modelCatalog.js";
import type { ModelStoredConfig } from "./modelConfigStore.js";

export const platformQualityBundleId = "platform-quality-bundle";
export const platformLowCostBundleId = "platform-low-cost-bundle";

export const stalePlatformBundleIds = ["platform-default-bundle", "platform-fast-bundle", "platform-custom-bundle"];
export const managedPlatformBundleIds = [
  ...stalePlatformBundleIds,
  platformQualityBundleId,
  platformLowCostBundleId
];

export function isEnabledPlatformConfig(config: ModelStoredConfig): boolean {
  return config.apiOwner === "platform" && config.enabled;
}

export function preferredPlatformConfig(configs: ModelStoredConfig[], preferredModel?: string): ModelStoredConfig | undefined {
  const normalized = normalizeOptionalText(preferredModel)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return configs.find((config) => config.model.toLowerCase() === normalized || config.label.toLowerCase() === normalized);
}

export function lowCostPlatformConfig(configs: ModelStoredConfig[]): ModelStoredConfig | undefined {
  return configs.find((config) => hasAny(config, ["低成本", "快速", "fast", "flash", "low", "lite"]));
}

export function qualityPlatformConfig(configs: ModelStoredConfig[]): ModelStoredConfig | undefined {
  return configs.find((config) => hasAny(config, ["高质量", "quality", "pro", "gpt", "openai"]));
}

export function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hasAny(config: ModelStoredConfig, needles: string[]): boolean {
  const catalogEntry = catalogEntryForModel(config.providerId, config.model);
  const text = [
    config.vendor,
    config.model,
    config.label,
    ...(config.tags ?? []),
    catalogEntry?.vendor,
    catalogEntry?.label,
    ...(catalogEntry?.tags ?? []),
    ...(catalogEntry?.capabilities ?? [])
  ].join(" ").toLowerCase();
  return needles.some((needle) => text.includes(needle.toLowerCase()));
}
