import { createImageProvider, type ImageProvider } from "../providers/imageProviderFactory.js";
import { createTextProvider } from "../providers/textProviderFactory.js";
import type { TextProvider } from "../providers/textProviderTypes.js";
import type { ModelConfigStore, ModelStoredConfig } from "./modelConfigStore.js";
import { selectModelConfig } from "./modelConfigSelection.js";
import type { ModelServicePreferenceStore } from "./modelServicePreferenceStore.js";

export async function createTextModelProvider(input: {
  modelConfigStore: ModelConfigStore;
  platformModelConfigStore?: ModelConfigStore;
  modelServicePreferenceStore?: ModelServicePreferenceStore;
  textModelConfigId?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ provider: TextProvider; config: Partial<ModelStoredConfig> }> {
  const requestedConfigId = normalizeText(input.textModelConfigId);
  const textConfig = await selectModelConfig({
    modelConfigStore: input.modelConfigStore,
    platformModelConfigStore: input.platformModelConfigStore,
    modelServicePreferenceStore: input.modelServicePreferenceStore,
    capability: "text",
    requestedConfigId
  });
  if (requestedConfigId && requestedConfigId !== "auto" && !textConfig) {
    throw new Error("所选文本模型配置不存在或已被删除。");
  }
  const config: Partial<ModelStoredConfig> = textConfig ?? {};
  return {
    provider: createTextProvider({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      apiMode: config.apiMode,
      fetchImpl: input.fetchImpl
    }),
    config
  };
}

export async function createImageModelProvider(input: {
  modelConfigStore: ModelConfigStore;
  platformModelConfigStore?: ModelConfigStore;
  modelServicePreferenceStore?: ModelServicePreferenceStore;
  imageModelConfigId?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ provider: ImageProvider; config: Partial<ModelStoredConfig> }> {
  const requestedConfigId = normalizeText(input.imageModelConfigId);
  const config = await selectModelConfig({
    modelConfigStore: input.modelConfigStore,
    platformModelConfigStore: input.platformModelConfigStore,
    modelServicePreferenceStore: input.modelServicePreferenceStore,
    capability: "image",
    requestedConfigId
  });
  if (requestedConfigId && requestedConfigId !== "auto" && !config) {
    throw new Error("所选图片模型配置不存在或已被删除。");
  }
  return {
    provider: createImageProvider({
      apiKey: config?.apiKey,
      baseUrl: config?.baseUrl,
      model: config?.model,
      fetchImpl: input.fetchImpl
    }),
    config: config ?? {}
  };
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
