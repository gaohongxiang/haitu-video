import type { ProviderConfigItem } from "./components/modelServiceConfig.js";
import { modelLabelForId } from "../providers/modelCatalog.js";
import type { AppLocale } from "../i18n/config.js";
import { appText } from "../i18n/appText.js";

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

export type ModelBundleSaveInput = Partial<Omit<ModelBundleItem, "priority">> & {
  apiOwner: ModelBundleItem["apiOwner"];
  label: string;
  statusText?: string;
  activate?: boolean;
};

export function configuredModelOptions(models: ProviderConfigItem[]): ModelConfigChoice[] {
  return ["auto", ...models.map((model) => model.configId).filter((configId): configId is string => Boolean(configId))];
}

export function bundleModelLabel(models: ProviderConfigItem[], configId?: string, locale?: AppLocale): string {
  const model = models.find((item) => item.configId === configId);
  return model ? modelLabelForId(model.id, model.model) : appText("settings.bundles.autoModel", locale);
}

export function modelConfigChoiceLabel(value: ModelConfigChoice, models: ProviderConfigItem[], locale?: AppLocale): string {
  if (value === "auto") {
    return appText("videoStudio.models.auto", locale);
  }
  const model = models.find((item) => item.configId === value);
  if (!model) {
    return appText("videoStudio.models.deleted", locale);
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
  return Boolean(
    normalizeBundleConfigId(bundle.textModelConfigId)
    && normalizeBundleConfigId(bundle.imageModelConfigId)
    && normalizeBundleConfigId(bundle.videoModelConfigId)
  );
}

export function isSelectableModelBundle(bundle: ModelBundleItem): boolean {
  return bundle.enabled && isCompleteModelBundle(bundle);
}

export function isPlatformPresetBundle(bundle: ModelBundleItem): boolean {
  return bundle.bundleId === platformQualityBundleId || bundle.bundleId === platformLowCostBundleId;
}

export function buildModelSchemeOptions(input: {
  platformBundles: ModelBundleItem[];
  byokBundles: ModelBundleItem[];
}): ModelSchemeOption[] {
  const platformOptions = sortPlatformModelBundlesForDisplay(input.platformBundles.filter(isSelectableModelBundle)).map((bundle) => ({
    id: modelSchemeIdForBundle(bundle.bundleId),
    label: modelSchemeBundleLabel(bundle),
    apiOwner: "platform" as const,
    bundleId: bundle.bundleId
  }));
  const byokOptions = sortByokModelBundlesForDisplay(input.byokBundles.filter(isSelectableModelBundle)).map((bundle) => ({
    id: modelSchemeIdForBundle(bundle.bundleId),
    label: modelSchemeBundleLabel(bundle),
    apiOwner: "byok" as const,
    bundleId: bundle.bundleId
  }));
  return [...platformOptions, ...byokOptions];
}

export function sortSelectableModelBundles(bundles: ModelBundleItem[]): ModelBundleItem[] {
  const platformBundles = sortPlatformModelBundlesForDisplay(
    bundles.filter((bundle) => bundle.apiOwner === "platform" && isSelectableModelBundle(bundle))
  );
  const byokBundles = sortByokModelBundlesForDisplay(
    bundles.filter((bundle) => bundle.apiOwner === "byok" && isSelectableModelBundle(bundle))
  );
  return [...platformBundles, ...byokBundles];
}

export function modelSchemeBundleLabel(bundle: ModelBundleItem, locale?: AppLocale): string {
  return localizedModelSchemeBundleLabel(bundle, locale);
}

export function localizedModelSchemeBundleLabel(bundle: ModelBundleItem, locale?: AppLocale): string {
  if (bundle.apiOwner === "platform") {
    if (bundle.bundleId === platformQualityBundleId) return appText("videoStudio.models.platformQuality", locale);
    if (bundle.bundleId === platformLowCostBundleId) return appText("videoStudio.models.platformLowCost", locale);
    return appText("videoStudio.models.platformCustom", locale, { label: bundle.label });
  }
  return appText("videoStudio.models.byokCustom", locale, { label: bundle.label });
}

export function modelSchemeIdForBundle(bundleId: string): ModelSchemeChoice {
  return `bundle:${bundleId}`;
}

export function bundleIdFromModelSchemeId(value: ModelSchemeChoice): string | undefined {
  return value.startsWith("bundle:") ? value.slice("bundle:".length) : undefined;
}

export function modelSchemeChoiceLabel(value: ModelSchemeChoice, options: ModelSchemeOption[], locale?: AppLocale): string {
  return options.find((option) => option.id === value)?.label ?? options[0]?.label ?? appText("videoStudio.models.unselected", locale);
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
  locale?: AppLocale;
}): string {
  const label = modelSchemeChoiceLabel(input.schemeId, input.options, input.locale);
  return [
    appText("videoStudio.models.current", input.locale, { label }),
    [
      appText("videoStudio.models.textModel", input.locale, { model: modelConfigChoiceLabel(input.selectedTextModelConfigId, input.textModels, input.locale) }),
      appText("videoStudio.models.imageModel", input.locale, { model: modelConfigChoiceLabel(input.selectedImageModelConfigId, input.imageModels, input.locale) }),
      appText("videoStudio.models.videoModel", input.locale, { model: modelConfigChoiceLabel(input.selectedVideoModelConfigId, input.videoModels, input.locale) })
    ].join(" · ")
  ].join(" | ");
}

export function bundleModelConfigIds(bundle: ModelBundleItem, locale?: AppLocale): Required<Pick<ModelBundleItem, "textModelConfigId" | "imageModelConfigId" | "videoModelConfigId">> {
  const textModelConfigId = normalizeBundleConfigId(bundle.textModelConfigId);
  const imageModelConfigId = normalizeBundleConfigId(bundle.imageModelConfigId);
  const videoModelConfigId = normalizeBundleConfigId(bundle.videoModelConfigId);
  if (!textModelConfigId || !imageModelConfigId || !videoModelConfigId) {
    throw new Error(appText("status.bundleIncomplete", locale));
  }
  return {
    textModelConfigId,
    imageModelConfigId,
    videoModelConfigId
  };
}

export function modelConfigChoiceExists(value: ModelConfigChoice, models: ProviderConfigItem[]): boolean {
  return value === "auto" || models.some((model) => model.configId === value);
}

export function bundleIdForPreference(bundles: ModelBundleItem[], preferredBundleId?: string | null): string | undefined {
  if (preferredBundleId && bundles.some((bundle) => bundle.bundleId === preferredBundleId && isSelectableModelBundle(bundle))) {
    return preferredBundleId;
  }
  return bundles.find(isSelectableModelBundle)?.bundleId;
}

export function nextModelBundleLabel(bundles: ModelBundleItem[], locale?: AppLocale): string {
  const usedIndexes = new Set(
    bundles
      .map((bundle) => numberedModelBundleLabelIndex(bundle.label))
      .filter((value) => Number.isFinite(value) && value > 0 && value < Number.MAX_SAFE_INTEGER)
  );
  let index = 1;
  while (usedIndexes.has(index)) {
    index += 1;
  }
  return appText("settings.bundles.newIndexed", locale, { index });
}

function extractNumberedModelBundleLabelIndex(label: string): string | undefined {
  return [
    label.match(/^新增组合(\d+)$/)?.[1],
    label.match(/^New Bundle\s*(\d+)$/i)?.[1]
  ]
      .filter((value): value is string => Boolean(value))
      [0];
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
  return leftPreset ? 0 : compareCustomModelBundles(left, right);
}

export function sortPlatformModelBundlesForDisplay(bundles: ModelBundleItem[]): ModelBundleItem[] {
  return bundles
    .map((bundle, index) => ({ bundle, index }))
    .sort((left, right) => {
      const leftPreset = isPlatformPresetBundle(left.bundle);
      const rightPreset = isPlatformPresetBundle(right.bundle);
      if (leftPreset !== rightPreset) {
        return leftPreset ? -1 : 1;
      }
      if (leftPreset && rightPreset) {
        return platformPresetDisplayRank(left.bundle) - platformPresetDisplayRank(right.bundle);
      }
      return compareCustomModelBundles(left.bundle, right.bundle);
    })
    .map((item) => item.bundle);
}

export function sortByokModelBundlesForDisplay(bundles: ModelBundleItem[]): ModelBundleItem[] {
  return [...bundles].sort(compareCustomModelBundles);
}

export function normalizeModelBundleItem(bundle: ModelBundleItem): ModelBundleItem {
  return {
    ...bundle,
    apiOwner: bundle.apiOwner === "platform" ? "platform" : "byok"
  };
}

export function compareModelBundles(left: ModelBundleItem, right: ModelBundleItem): number {
  return Number(right.enabled) - Number(left.enabled)
    || left.label.localeCompare(right.label);
}

function normalizeBundleConfigId(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text !== "auto" ? text : undefined;
}

function numberedModelBundleLabelIndex(label: string): number {
  const parsed = Number(extractNumberedModelBundleLabelIndex(label));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.MAX_SAFE_INTEGER;
}

function platformPresetDisplayRank(bundle: ModelBundleItem): number {
  if (bundle.bundleId === platformLowCostBundleId) return 0;
  if (bundle.bundleId === platformQualityBundleId) return 1;
  return 2;
}
