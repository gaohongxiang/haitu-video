import type { ProviderConfigItem } from "./components/modelServiceConfig.js";
import { modelLabelForId } from "../providers/modelCatalog.js";
import type { AppLocale } from "../i18n/config.js";
import { appText } from "../i18n/appText.js";

export type ModelConfigChoice = "auto" | string;
export type ModelCapability = "text" | "image" | "video";

export interface ModelServicePreference {
  serviceMode: "platform" | "byok";
  textModelConfigId?: ModelConfigChoice | null;
  imageModelConfigId?: ModelConfigChoice | null;
  videoModelConfigId?: ModelConfigChoice | null;
}

export function configuredModelOptions(models: ProviderConfigItem[]): ModelConfigChoice[] {
  return models.map((model) => model.configId).filter((configId): configId is string => Boolean(configId));
}

export function effectiveModelConfigChoice(value: ModelConfigChoice | null | undefined, models: ProviderConfigItem[]): ModelConfigChoice {
  const options = configuredModelOptions(models);
  if (value && value !== "auto" && options.includes(value)) {
    return value;
  }
  return options[0] ?? "auto";
}

export function modelConfigChoiceLabel(value: ModelConfigChoice, models: ProviderConfigItem[], locale?: AppLocale): string {
  const effectiveValue = effectiveModelConfigChoice(value, models);
  const effectiveModel = models.find((item) => item.configId === effectiveValue);
  if (!effectiveModel) {
    return appText(value && value !== "auto" ? "videoStudio.models.deleted" : "videoStudio.models.unselected", locale);
  }
  return modelLabelForId(effectiveModel.id, effectiveModel.model);
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

export function modelsForOwnerAndCapability(
  ledger: {
    textModels: ProviderConfigItem[];
    imageModels: ProviderConfigItem[];
    videoModels: ProviderConfigItem[];
  },
  apiOwner: ModelServicePreference["serviceMode"],
  capability: ModelCapability
): ProviderConfigItem[] {
  const models = capability === "text"
    ? ledger.textModels
    : capability === "image"
      ? ledger.imageModels
      : ledger.videoModels;
  return apiOwner === "platform" ? platformConfiguredModels(models) : byokConfiguredModels(models);
}

export function modelConfigChoiceExists(value: ModelConfigChoice | null | undefined, models: ProviderConfigItem[]): boolean {
  return !value || value === "auto" || models.some((model) => model.configId === value);
}
