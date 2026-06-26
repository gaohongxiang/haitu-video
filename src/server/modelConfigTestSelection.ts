import type { ModelProviderId } from "../providers/modelCatalog.js";
import {
  inferTextModelApiMode,
  normalizeTextModelApiMode
} from "../providers/textProviderFactory.js";
import type {
  ModelConfigStore,
  ModelStoredConfig
} from "./modelConfigStore.js";

export interface ProviderConfigTestSelectionRequest {
  configId?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string | string[];
  apiMode?: string;
}

export async function effectiveProviderConfigForTest(
  provider: ModelProviderId,
  options: {
    modelConfigStore: ModelConfigStore;
    input: ProviderConfigTestSelectionRequest;
  }
): Promise<Partial<ModelStoredConfig> & Pick<ProviderConfigTestSelectionRequest, "apiKey" | "baseUrl" | "model" | "apiMode">> {
  const input = options.input;
  const saved = normalizeText(input.configId)
    ? await options.modelConfigStore.getConfig(provider, input.configId)
    : undefined;
  const savedConfig: Partial<ModelStoredConfig> = saved ?? {};
  const baseUrl = normalizeText(input.baseUrl) ?? savedConfig.baseUrl;
  const model = normalizeModelSelection(input.model) ?? savedConfig.model;
  const apiMode = provider === "openai-compatible-text"
    ? effectiveTextModelApiModeForTest(input, savedConfig, baseUrl, model)
    : normalizeTextModelApiMode(input.apiMode) ?? savedConfig.apiMode;
  return {
    apiKey: normalizeText(input.apiKey) ?? savedConfig.apiKey,
    baseUrl,
    model,
    apiMode
  };
}

function effectiveTextModelApiModeForTest(
  input: ProviderConfigTestSelectionRequest,
  savedConfig: Partial<Pick<ModelStoredConfig, "baseUrl" | "model" | "apiMode">>,
  baseUrl?: string,
  model?: string
): string | undefined {
  const explicit = normalizeTextModelApiMode(input.apiMode);
  if (explicit) {
    return explicit;
  }
  const changedBaseUrl = input.baseUrl !== undefined && normalizeText(input.baseUrl) !== savedConfig.baseUrl;
  const changedModel = input.model !== undefined && normalizeModelSelection(input.model) !== savedConfig.model;
  if (changedBaseUrl || changedModel) {
    return inferTextModelApiMode({ baseUrl, model });
  }
  return savedConfig.apiMode;
}

function normalizeText(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function normalizeModelSelection(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value.find((item) => typeof item === "string" && item.trim())?.trim();
  }
  return normalizeText(value);
}
