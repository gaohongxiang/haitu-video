import type { ModelBundleStore } from "./modelBundleStore.js";
import type { ModelConfigStore, ModelStoredConfig } from "./modelConfigStore.js";
import type { ModelServicePreferenceStore } from "./modelServicePreferenceStore.js";
import {
  isEnabledPlatformConfig,
  lowCostPlatformConfig,
  managedPlatformBundleIds,
  platformLowCostBundleId,
  platformQualityBundleId,
  qualityPlatformConfig,
  stalePlatformBundleIds
} from "./platformModelBundleRules.js";

export { platformLowCostBundleId, platformQualityBundleId } from "./platformModelBundleRules.js";

export async function ensurePlatformBundles(input: {
  platformModelConfigStore: ModelConfigStore;
  modelBundleStore: ModelBundleStore;
  modelServicePreferenceStore: ModelServicePreferenceStore;
}): Promise<void> {
  const [textConfigs, imageConfigs, videoConfigs] = await Promise.all([
    input.platformModelConfigStore.listConfigs("openai-compatible-text"),
    input.platformModelConfigStore.listConfigs("openai-compatible-image"),
    input.platformModelConfigStore.listConfigs("volcengine-seedance")
  ]);
  const platformTextConfigs = textConfigs.filter(isEnabledPlatformConfig);
  const platformImageConfigs = imageConfigs.filter(isEnabledPlatformConfig);
  const platformVideoConfigs = videoConfigs.filter(isEnabledPlatformConfig);
  const textConfig = platformTextConfigs[0];
  const imageConfig = platformImageConfigs[0];
  const videoConfig = platformVideoConfigs[0];

  if (!textConfig && !imageConfig && !videoConfig) {
    clearManagedPlatformBundles(input);
    return;
  }

  deletePlatformBundles(input, stalePlatformBundleIds);
  upsertPlatformBundle(input.modelBundleStore, {
    bundleId: platformLowCostBundleId,
    label: "低成本",
    textConfig: lowCostPlatformConfig(platformTextConfigs) ?? textConfig,
    imageConfig: lowCostPlatformConfig(platformImageConfigs) ?? imageConfig,
    videoConfig: lowCostPlatformConfig(platformVideoConfigs) ?? videoConfig,
    priority: 100
  });
  upsertPlatformBundle(input.modelBundleStore, {
    bundleId: platformQualityBundleId,
    label: "高质量",
    textConfig: qualityPlatformConfig(platformTextConfigs) ?? textConfig,
    imageConfig: qualityPlatformConfig(platformImageConfigs) ?? imageConfig,
    videoConfig: qualityPlatformConfig(platformVideoConfigs) ?? videoConfig,
    priority: 90
  });
  const preference = input.modelServicePreferenceStore.get();
  if (!preference.platformBundleId) {
    input.modelServicePreferenceStore.set({
      platformBundleId: platformLowCostBundleId
    });
  }
}

function clearManagedPlatformBundles(input: {
  modelBundleStore: ModelBundleStore;
  modelServicePreferenceStore: ModelServicePreferenceStore;
}): void {
  deletePlatformBundles(input, managedPlatformBundleIds);
  const preference = input.modelServicePreferenceStore.get();
  if (preference.platformBundleId && managedPlatformBundleIds.includes(preference.platformBundleId)) {
    input.modelServicePreferenceStore.set({
      platformBundleId: undefined
    });
  }
}

function deletePlatformBundles(input: { modelBundleStore: ModelBundleStore }, bundleIds: string[]): void {
  for (const bundleId of bundleIds) {
    input.modelBundleStore.delete(bundleId);
  }
}

function upsertPlatformBundle(store: ModelBundleStore, input: {
  bundleId: string;
  label: string;
  description?: string;
  textConfig?: ModelStoredConfig;
  imageConfig?: ModelStoredConfig;
  videoConfig?: ModelStoredConfig;
  priority: number;
}): void {
  if (!input.textConfig && !input.imageConfig && !input.videoConfig) {
    return;
  }
  store.set({
    bundleId: input.bundleId,
    apiOwner: "platform",
    label: input.label,
    description: input.description,
    textModelConfigId: input.textConfig?.configId,
    imageModelConfigId: input.imageConfig?.configId,
    videoModelConfigId: input.videoConfig?.configId,
    enabled: true,
    priority: input.priority
  });
}
