import type { ProviderConfigItem } from "./components/modelServiceConfig.js";
import { modelLabelForId } from "../providers/modelCatalog.js";

export const platformQualityBundleId = "platform-quality-bundle";
export const platformLowCostBundleId = "platform-low-cost-bundle";

export type ModelConfigChoice = "auto" | string;
export type ModelSchemeChoice = "" | `bundle:${string}`;

export interface ModelBundleItem {
  bundleId: string;
  apiOwner: "platform" | "byok";
  label: string;
  description?: string;
  textModelConfigId?: string;
  imageModelConfigId?: string;
  videoModelConfigId?: string;
  enabled: boolean;
  priority: number;
}

export interface ModelSchemeOption {
  id: ModelSchemeChoice;
  label: string;
  apiOwner?: ModelBundleItem["apiOwner"];
  bundleId?: string;
}

export interface ModelServicePreference {
  serviceMode: "platform" | "byok";
  platformBundleId?: string | null;
  byokBundleId?: string | null;
}

export type ModelBundleSaveInput = Partial<ModelBundleItem> & {
  apiOwner: ModelBundleItem["apiOwner"];
  label: string;
  statusText?: string;
  activate?: boolean;
};

export function configuredModelOptions(models: ProviderConfigItem[]): ModelConfigChoice[] {
  return ["auto", ...models.map((model) => model.configId).filter((configId): configId is string => Boolean(configId))];
}

export function bundleModelLabel(models: ProviderConfigItem[], configId?: string): string {
  const model = models.find((item) => item.configId === configId);
  return model ? modelLabelForId(model.id, model.model) : "自动";
}

export function modelConfigChoiceLabel(value: ModelConfigChoice, models: ProviderConfigItem[]): string {
  if (value === "auto") {
    return "自动推荐";
  }
  const model = models.find((item) => item.configId === value);
  if (!model) {
    return "已删除模型";
  }
  return modelLabelForId(model.id, model.model);
}

export function platformConfiguredModels(models: ProviderConfigItem[]): ProviderConfigItem[] {
  return models.filter((model) => model.apiOwner === "platform" && model.configured && model.enabled !== false && Boolean(model.configId));
}

export function byokConfiguredModels(models: ProviderConfigItem[]): ProviderConfigItem[] {
  return models.filter((model) => model.apiOwner !== "platform" && model.configured && model.enabled !== false && Boolean(model.configId));
}

export function ownerModelsForGroup(models: ProviderConfigItem[], apiOwner: ModelServicePreference["serviceMode"]): ProviderConfigItem[] {
  return models.filter((model) => apiOwner === "platform" ? model.apiOwner === "platform" : model.apiOwner !== "platform");
}

export function isCompleteModelBundle(bundle: ModelBundleItem): boolean {
  return Boolean(bundle.textModelConfigId && bundle.imageModelConfigId && bundle.videoModelConfigId);
}

export function isPlatformPresetBundle(bundle: ModelBundleItem): boolean {
  return bundle.bundleId === platformQualityBundleId || bundle.bundleId === platformLowCostBundleId;
}

export function buildModelSchemeOptions(input: {
  platformBundles: ModelBundleItem[];
  byokBundles: ModelBundleItem[];
}): ModelSchemeOption[] {
  const platformOptions = [...input.platformBundles].sort(comparePlatformModelBundles).map((bundle) => ({
    id: modelSchemeIdForBundle(bundle.bundleId),
    label: modelSchemeBundleLabel(bundle),
    apiOwner: "platform" as const,
    bundleId: bundle.bundleId
  }));
  const byokOptions = [...input.byokBundles].sort(compareCustomModelBundles).map((bundle) => ({
    id: modelSchemeIdForBundle(bundle.bundleId),
    label: modelSchemeBundleLabel(bundle),
    apiOwner: "byok" as const,
    bundleId: bundle.bundleId
  }));
  return [...platformOptions, ...byokOptions];
}

export function sortSelectableModelBundles(bundles: ModelBundleItem[]): ModelBundleItem[] {
  const platformBundles = bundles
    .filter((bundle) => bundle.apiOwner === "platform")
    .sort(comparePlatformModelBundles);
  const byokBundles = bundles
    .filter((bundle) => bundle.apiOwner === "byok")
    .sort(compareCustomModelBundles);
  return [...platformBundles, ...byokBundles];
}

export function modelSchemeBundleLabel(bundle: ModelBundleItem): string {
  if (bundle.apiOwner === "platform") {
    if (bundle.bundleId === platformQualityBundleId) return "平台 · 高质量";
    if (bundle.bundleId === platformLowCostBundleId) return "平台 · 低成本";
    return `平台 · ${bundle.label}`;
  }
  return `自带 · ${bundle.label}`;
}

export function modelSchemeIdForBundle(bundleId: string): ModelSchemeChoice {
  return `bundle:${bundleId}`;
}

export function bundleIdFromModelSchemeId(value: ModelSchemeChoice): string | undefined {
  return value.startsWith("bundle:") ? value.slice("bundle:".length) : undefined;
}

export function modelSchemeChoiceLabel(value: ModelSchemeChoice, options: ModelSchemeOption[]): string {
  return options.find((option) => option.id === value)?.label ?? options[0]?.label ?? "未选择";
}

export function modelSchemeOwner(value: ModelSchemeChoice, options: ModelSchemeOption[]): ModelServicePreference["serviceMode"] | undefined {
  return options.find((option) => option.id === value)?.apiOwner;
}

export function modelSchemeOptionExists(value: ModelSchemeChoice, options: ModelSchemeOption[]): boolean {
  return options.some((option) => option.id === value);
}

export function modelSchemeSummary(input: {
  schemeId: ModelSchemeChoice;
  options: ModelSchemeOption[];
  textModels: ProviderConfigItem[];
  imageModels: ProviderConfigItem[];
  videoModels: ProviderConfigItem[];
  selectedTextModelConfigId: ModelConfigChoice;
  selectedImageModelConfigId: ModelConfigChoice;
  selectedVideoModelConfigId: ModelConfigChoice;
}): string {
  const label = modelSchemeChoiceLabel(input.schemeId, input.options);
  return [
    `当前：${label}`,
    [
      `文本 ${modelConfigChoiceLabel(input.selectedTextModelConfigId, input.textModels)}`,
      `图片 ${modelConfigChoiceLabel(input.selectedImageModelConfigId, input.imageModels)}`,
      `视频 ${modelConfigChoiceLabel(input.selectedVideoModelConfigId, input.videoModels)}`
    ].join(" · ")
  ].join("｜");
}

export function bundleModelConfigIds(bundle: ModelBundleItem): Required<Pick<ModelBundleItem, "textModelConfigId" | "imageModelConfigId" | "videoModelConfigId">> {
  return {
    textModelConfigId: bundle.textModelConfigId ?? "auto",
    imageModelConfigId: bundle.imageModelConfigId ?? "auto",
    videoModelConfigId: bundle.videoModelConfigId ?? "auto"
  };
}

export function modelConfigChoiceExists(value: ModelConfigChoice, models: ProviderConfigItem[]): boolean {
  return value === "auto" || models.some((model) => model.configId === value);
}

export function bundleIdForPreference(bundles: ModelBundleItem[], preferredBundleId?: string | null): string | undefined {
  if (preferredBundleId && bundles.some((bundle) => bundle.bundleId === preferredBundleId && bundle.enabled)) {
    return preferredBundleId;
  }
  return bundles.find((bundle) => bundle.enabled)?.bundleId;
}

export function nextModelBundleLabel(bundles: ModelBundleItem[]): string {
  const usedIndexes = new Set(
    bundles
      .map((bundle) => bundle.label.match(/^新增组合(\d+)$/)?.[1])
      .filter((value): value is string => Boolean(value))
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
  );
  if (usedIndexes.size === 0) {
    return "新增组合1";
  }
  let index = 1;
  while (usedIndexes.has(index)) {
    index += 1;
  }
  return `新增组合${index}`;
}

export function compareCustomModelBundles(left: ModelBundleItem, right: ModelBundleItem): number {
  return numberedModelBundleLabelIndex(left.label) - numberedModelBundleLabelIndex(right.label)
    || compareModelBundles(left, right);
}

export function comparePlatformModelBundles(left: ModelBundleItem, right: ModelBundleItem): number {
  const leftPreset = isPlatformPresetBundle(left);
  const rightPreset = isPlatformPresetBundle(right);
  if (leftPreset !== rightPreset) {
    return leftPreset ? -1 : 1;
  }
  return leftPreset
    ? platformPresetRank(left.bundleId) - platformPresetRank(right.bundleId) || compareModelBundles(left, right)
    : compareCustomModelBundles(left, right);
}

export function normalizeModelBundleItem(bundle: ModelBundleItem): ModelBundleItem {
  return {
    ...bundle,
    apiOwner: bundle.apiOwner === "platform" ? "platform" : "byok"
  };
}

export function compareModelBundles(left: ModelBundleItem, right: ModelBundleItem): number {
  return Number(right.enabled) - Number(left.enabled)
    || right.priority - left.priority
    || left.label.localeCompare(right.label);
}

function numberedModelBundleLabelIndex(label: string): number {
  const parsed = Number(label.match(/^新增组合(\d+)$/)?.[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.MAX_SAFE_INTEGER;
}

function platformPresetRank(bundleId: string): number {
  if (bundleId === platformQualityBundleId) return 1;
  if (bundleId === platformLowCostBundleId) return 2;
  return Number.MAX_SAFE_INTEGER;
}
