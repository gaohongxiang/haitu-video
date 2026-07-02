import type { VideoProviderName } from "../providers/providerFactory.js";
import type { ModelProviderId } from "../providers/modelCatalog.js";
import type { ModelConfigStore, ModelStoredConfig } from "./modelConfigStore.js";
import type { ModelServicePreference, ModelServicePreferenceStore } from "./modelServicePreferenceStore.js";

export type ModelCapability = "text" | "image" | "video";

interface ModelSelectionStores {
  modelConfigStore: ModelConfigStore;
  platformModelConfigStore?: ModelConfigStore;
  modelServicePreferenceStore?: ModelServicePreferenceStore;
}

export async function selectedVideoModelConfig(input: ModelSelectionStores & {
  provider: VideoProviderName;
  providerModelConfigId?: string;
}): Promise<Partial<ModelStoredConfig>> {
  if (input.provider === "mock") {
    return {};
  }
  const requestedConfigId = normalizeText(input.providerModelConfigId);
  const config = await selectModelConfig({
    modelConfigStore: input.modelConfigStore,
    platformModelConfigStore: input.platformModelConfigStore,
    modelServicePreferenceStore: input.modelServicePreferenceStore,
    capability: "video",
    requestedConfigId
  });
  if (requestedConfigId && requestedConfigId !== "auto" && !config) {
    throw new Error("所选视频模型配置不存在或已被删除。");
  }
  return config ?? {};
}

export async function assertVideoModelConfigured(
  modelConfigStore: ModelConfigStore,
  platformModelConfigStore: ModelConfigStore | undefined,
  provider: VideoProviderName | undefined,
  providerModelConfigId?: string,
  modelServicePreferenceStore?: ModelServicePreferenceStore
): Promise<void> {
  if (!provider || provider === "mock") {
    return;
  }
  const config = await selectedVideoModelConfig({
    modelConfigStore,
    platformModelConfigStore,
    modelServicePreferenceStore,
    provider,
    providerModelConfigId
  });
  if (!config.apiKey) {
    throw new Error("请先配置视频模型，再生成视频。");
  }
}

export async function resolveVideoRequestModel(input: ModelSelectionStores & {
  provider: VideoProviderName | undefined;
  body: {
    providerModelConfigId?: string;
    providerModel?: string;
  };
}): Promise<{
  providerModelConfigId?: string;
  providerModel?: string;
  config?: Partial<ModelStoredConfig>;
}> {
  if (!input.provider || input.provider === "mock") {
    return {
      providerModel: input.body.providerModel
    };
  }
  const config = await selectedVideoModelConfig({
    modelConfigStore: input.modelConfigStore,
    platformModelConfigStore: input.platformModelConfigStore,
    modelServicePreferenceStore: input.modelServicePreferenceStore,
    provider: input.provider,
    providerModelConfigId: input.body.providerModelConfigId
  });
  if (!config.apiKey) {
    throw new Error("请先配置视频模型，再生成视频。");
  }
  return {
    providerModelConfigId: config.configId,
    providerModel: config.model,
    config
  };
}

export async function selectModelConfig(input: ModelSelectionStores & {
  capability: ModelCapability;
  requestedConfigId?: string;
}): Promise<ModelStoredConfig | undefined> {
  const providerId = providerIdForCapability(input.capability);
  const requestedConfigId = normalizeText(input.requestedConfigId);
  if (requestedConfigId && requestedConfigId !== "auto") {
    return await input.modelConfigStore.getConfigById(providerId, requestedConfigId)
      ?? await input.platformModelConfigStore?.getConfigById(providerId, requestedConfigId);
  }
  const preference = input.modelServicePreferenceStore?.get();
  const preferenceConfigId = preferenceConfigIdForCapability(preference, input.capability);
  if (preferenceConfigId && preferenceConfigId !== "auto") {
    return await input.modelConfigStore.getConfigById(providerId, preferenceConfigId)
      ?? await input.platformModelConfigStore?.getConfigById(providerId, preferenceConfigId);
  }
  if (preference?.serviceMode === "platform") {
    return await input.platformModelConfigStore?.getConfig(providerId);
  }
  return await input.modelConfigStore.getConfig(providerId);
}

export function providerIdForCapability(capability: ModelCapability): ModelProviderId {
  if (capability === "text") {
    return "openai-compatible-text";
  }
  if (capability === "image") {
    return "openai-compatible-image";
  }
  return "volcengine-seedance";
}

export function preferenceConfigIdForCapability(
  preference: ModelServicePreference | undefined,
  capability: ModelCapability
): string | undefined {
  if (!preference) {
    return undefined;
  }
  if (capability === "text") {
    return normalizeText(preference.textModelConfigId);
  }
  if (capability === "image") {
    return normalizeText(preference.imageModelConfigId);
  }
  return normalizeText(preference.videoModelConfigId);
}

function normalizeText(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}
