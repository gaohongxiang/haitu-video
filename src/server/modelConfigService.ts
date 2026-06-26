import { createImageProvider } from "../providers/imageProviderFactory.js";
import {
  catalogEntryForModel,
  defaultCatalogEntryForVendor,
  defaultVideoModelId,
  type ModelProviderId
} from "../providers/modelCatalog.js";
import { discoverAvailableModels, type DiscoveredModel } from "../providers/modelDiscovery.js";
import { imageModelName, textModelName } from "../providers/openaiCompatibleTextProvider.js";
import { createTextProvider } from "../providers/textProviderFactory.js";
import { VolcengineUsageClient } from "../providers/volcengine/usageClient.js";
import {
  modelProviderStatus,
  type ModelConfigStore
} from "./modelConfigStore.js";
import { effectiveProviderConfigForTest } from "./modelConfigTestSelection.js";

export interface ModelConfigRequest {
  configId?: string;
  apiKey?: string;
  name?: string;
  vendor?: string;
  priority?: number;
  baseUrl?: string;
  model?: string | string[];
  apiMode?: string;
  enabled?: boolean;
  taskScopes?: Array<"product_import" | "storyboard">;
  tags?: string[];
}

export interface ProviderConfigTestRequest extends ModelConfigRequest {}

export interface ProviderModelDiscoveryResponse {
  ok: true;
  provider: ModelProviderId;
  models: DiscoveredModel[];
}

export interface ModelConfigKeyRevealResponse {
  ok: true;
  provider: ModelProviderId;
  configId: string;
  apiKey: string;
  keyPreview?: string;
}

export function platformModelConfigInput(providerId: ModelProviderId, input: ModelConfigRequest): ModelConfigRequest & { apiOwner: "platform" } {
  const selectedModel = normalizeModelSelection(input.model);
  const vendor = normalizeText(input.vendor)
    ?? (selectedModel ? catalogEntryForModel(providerId, selectedModel)?.vendor : undefined)
    ?? defaultCatalogEntryForVendor(providerId, defaultPlatformVendor(providerId)).vendor;
  const catalogEntry = selectedModel
    ? catalogEntryForModel(providerId, selectedModel) ?? defaultCatalogEntryForVendor(providerId, vendor)
    : defaultCatalogEntryForVendor(providerId, vendor);
  return {
    ...input,
    apiOwner: "platform",
    name: normalizeText(input.name) ?? platformModelName(providerId, vendor),
    vendor,
    baseUrl: normalizeText(input.baseUrl) ?? catalogEntry.baseUrl,
    model: input.model ?? catalogEntry.modelId,
    apiMode: normalizeText(input.apiMode) ?? catalogEntry.apiMode,
    enabled: input.enabled ?? true,
    priority: input.priority,
    tags: input.tags ?? ["平台托管"]
  };
}

export async function testProviderConfig(
  provider: ModelProviderId,
  options: {
    modelConfigStore: ModelConfigStore;
    fetchImpl?: typeof fetch;
    input: ProviderConfigTestRequest;
  }
): Promise<{
  ok: true;
  provider: ModelProviderId;
  model: string;
  message: string;
}> {
  const config = await effectiveProviderConfigForTest(provider, {
    modelConfigStore: options.modelConfigStore,
    input: options.input
  });
  if (!config.apiKey) {
    throw new Error("请先填写 API Key，或保存一个带 Key 的配置后再测试。");
  }
  const fetchImpl = withProviderConfigTestTimeout(options.fetchImpl);
  if (provider === "openai-compatible-text") {
    await createTextProvider({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      apiMode: config.apiMode,
      fetchImpl
    }).generateJson<{ ok: boolean }>({
      system: "Return only compact JSON.",
      user: "Return {\"ok\":true}.",
      temperature: 0
    });
    return {
      ok: true,
      provider,
      model: config.model ?? textModelName(),
      message: "文本模型连通性测试成功。"
    };
  }
  if (provider === "openai-compatible-image") {
    await createImageProvider({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      fetchImpl
    }).generateImages({
      prompt: "A small plain white square product test image, no text.",
      count: 1
    });
    return {
      ok: true,
      provider,
      model: config.model ?? imageModelName(),
      message: "图片模型连通性测试成功。"
    };
  }
  await new VolcengineUsageClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    fetchImpl
  }).listTasks({
    pageSize: 1,
    model: config.model
  });
  return {
    ok: true,
    provider,
    model: config.model ?? defaultVideoModelId(),
    message: "视频模型只读连通性测试成功，未创建视频任务。"
  };
}

export async function refreshProviderModels(
  provider: ModelProviderId,
  options: {
    modelConfigStore: ModelConfigStore;
    fetchImpl?: typeof fetch;
    input: ProviderConfigTestRequest;
  }
): Promise<ProviderModelDiscoveryResponse> {
  const config = await effectiveProviderConfigForTest(provider, {
    modelConfigStore: options.modelConfigStore,
    input: options.input
  });
  return {
    ok: true,
    provider,
    models: await discoverAvailableModels(provider, {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      fetchImpl: withProviderConfigTestTimeout(options.fetchImpl)
    })
  };
}

export async function revealProviderConfigKey(
  provider: ModelProviderId,
  options: {
    modelConfigStore: ModelConfigStore;
    configId?: string;
  }
): Promise<ModelConfigKeyRevealResponse> {
  const configId = normalizeText(options.configId);
  if (!configId) {
    throw new Error("configId is required to reveal a model API key.");
  }
  const config = await options.modelConfigStore.getConfig(provider, configId);
  if (!config?.apiKey) {
    throw new Error("Model API key is not available for this configuration.");
  }
  return {
    ok: true,
    provider,
    configId: config.configId,
    apiKey: config.apiKey,
    keyPreview: modelProviderStatus(provider, {
      apiKey: config.apiKey,
      configId: config.configId
    }).keyPreview
  };
}

function defaultPlatformVendor(providerId: ModelProviderId): string {
  if (providerId === "volcengine-seedance") return "volcengine";
  return "openai";
}

function platformModelName(providerId: ModelProviderId, vendor: string): string {
  if (providerId === "openai-compatible-text") return `${vendor} 文本`;
  if (providerId === "openai-compatible-image") return `${vendor} 图片`;
  return `${vendor} 视频`;
}

function withProviderConfigTestTimeout(fetchImpl: typeof fetch | undefined): typeof fetch {
  const sourceFetch = fetchImpl ?? fetch;
  const timeoutMs = numberFromEnv(process.env.PROVIDER_CONFIG_TEST_TIMEOUT_MS, 20_000);
  return (async (input, init) => {
    return Promise.race([
      sourceFetch(input, init),
      new Promise<Response>((_, reject) => {
        setTimeout(() => reject(new Error("模型测试超时，请检查 Base URL、网络或服务商状态。")), timeoutMs);
      })
    ]);
  }) as typeof fetch;
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
