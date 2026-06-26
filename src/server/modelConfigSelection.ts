import type { VideoProviderName } from "../providers/providerFactory.js";
import type { ModelProviderId } from "../providers/modelCatalog.js";
import type { ModelBundle, ModelBundleStore } from "./modelBundleStore.js";
import type { ModelConfigStore, ModelStoredConfig } from "./modelConfigStore.js";
import type { ModelServicePreferenceStore } from "./modelServicePreferenceStore.js";

interface ModelSelectionStores {
  modelConfigStore: ModelConfigStore;
  platformModelConfigStore?: ModelConfigStore;
  modelBundleStore?: ModelBundleStore;
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
    providerId: "volcengine-seedance",
    modelConfigStore: input.modelConfigStore,
    platformModelConfigStore: input.platformModelConfigStore,
    modelBundleStore: input.modelBundleStore,
    modelServicePreferenceStore: input.modelServicePreferenceStore,
    bundleConfigSelector: (bundle) => bundle.videoModelConfigId,
    configId: requestedConfigId
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
  providerModelConfigId?: string
): Promise<void> {
  if (!provider || provider === "mock") {
    return;
  }
  const config = await selectedVideoModelConfig({
    modelConfigStore,
    platformModelConfigStore,
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
    modelBundleStore: input.modelBundleStore,
    modelServicePreferenceStore: input.modelServicePreferenceStore,
    provider: input.provider,
    providerModelConfigId: input.body.providerModelConfigId
  });
  if (!config.apiKey) {
    throw new Error("请先配置视频模型，再生成视频。");
  }
  return {
    providerModelConfigId: config.configId,
    providerModel: input.body.providerModel ?? config.model,
    config
  };
}

export async function selectModelConfig(input: ModelSelectionStores & {
  providerId: ModelProviderId;
  bundleConfigSelector?: (bundle: ModelBundle) => string | undefined;
  configId?: string;
}): Promise<ModelStoredConfig | undefined> {
  if (input.configId && input.configId !== "auto") {
    return await input.modelConfigStore.getConfigById(input.providerId, input.configId)
      ?? await input.platformModelConfigStore?.getConfigById(input.providerId, input.configId);
  }
  const bundleConfigId = selectedBundleConfigId({
    modelBundleStore: input.modelBundleStore,
    modelServicePreferenceStore: input.modelServicePreferenceStore,
    selector: input.bundleConfigSelector
  });
  if (bundleConfigId) {
    return await input.modelConfigStore.getConfigById(input.providerId, bundleConfigId)
      ?? await input.platformModelConfigStore?.getConfigById(input.providerId, bundleConfigId);
  }
  return await input.modelConfigStore.getConfig(input.providerId)
    ?? await input.platformModelConfigStore?.getConfig(input.providerId);
}

function selectedBundleConfigId(input: {
  modelBundleStore?: ModelBundleStore;
  modelServicePreferenceStore?: ModelServicePreferenceStore;
  selector?: (bundle: ModelBundle) => string | undefined;
}): string | undefined {
  if (!input.modelBundleStore || !input.modelServicePreferenceStore || !input.selector) {
    return undefined;
  }
  const preference = input.modelServicePreferenceStore.get();
  const selectedBundleId = preference.serviceMode === "platform" ? preference.platformBundleId : preference.byokBundleId;
  const bundles = input.modelBundleStore.list();
  const selectedBundle = selectedBundleId
    ? bundles.find((bundle) => bundle.bundleId === selectedBundleId)
    : bundles.find((bundle) => bundle.apiOwner === preference.serviceMode && isSelectableBundle(bundle));
  if (!selectedBundle || selectedBundle.apiOwner !== preference.serviceMode) {
    return undefined;
  }
  const configId = normalizeText(input.selector(selectedBundle));
  if (!configId || configId === "auto") {
    throw new Error("当前模型组合未配置完整，请先补全后再创作。");
  }
  return configId;
}

function normalizeText(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function isSelectableBundle(bundle: ModelBundle): boolean {
  return bundle.enabled
    && Boolean(normalizeText(bundle.textModelConfigId))
    && normalizeText(bundle.textModelConfigId) !== "auto"
    && Boolean(normalizeText(bundle.imageModelConfigId))
    && normalizeText(bundle.imageModelConfigId) !== "auto"
    && Boolean(normalizeText(bundle.videoModelConfigId))
    && normalizeText(bundle.videoModelConfigId) !== "auto";
}
