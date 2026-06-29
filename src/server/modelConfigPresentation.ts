import {
  catalogEntryForModel,
  defaultVideoModelBaseUrl,
  defaultVideoModelId,
  type ModelProviderId
} from "../providers/modelCatalog.js";
import { imageModelBaseUrl, imageModelName, textModelBaseUrl, textModelName } from "../providers/openaiCompatibleTextProvider.js";
import { inferTextModelApiMode } from "../providers/textProviderFactory.js";
import type { VideoResolution } from "../providers/types.js";
import {
  modelProviderStatus,
  type ApiOwner,
  type ModelConfigStore,
  type ModelProviderKeySource,
  type ModelStoredConfig
} from "./modelConfigStore.js";
import { tokenPriceCnyPerMillionForVideoModel } from "./videoJobBilling.js";

export interface ProviderConfigItem {
  id: ModelProviderId;
  configId?: string;
  credentialId?: string;
  label: string;
  providerLabel?: string;
  apiOwner?: ApiOwner;
  configured: boolean;
  keySource?: ModelProviderKeySource;
  keyPreview?: string;
  baseUrl: string;
  model: string;
  apiMode?: string;
  capabilities: string[];
  modelKind: "text" | "image" | "video";
  enabled?: boolean;
  taskScopes?: string[];
  tags?: string[];
}

export interface VideoProviderConfigItem extends ProviderConfigItem {
  id: "volcengine-seedance";
  modelKind: "video";
  resolution: VideoResolution;
  tokenPriceCnyPerMillion: number;
  estimatedCostCnyPerSecond: number;
  watermark: boolean;
  docsUrl: string;
}

export interface ProviderConfigLedger {
  textModels: ProviderConfigItem[];
  imageModels: ProviderConfigItem[];
  videoModels: VideoProviderConfigItem[];
  providers: VideoProviderConfigItem[];
  runtime: {
    textConfigured: boolean;
    imageConfigured: boolean;
    videoConfigured: boolean;
  };
}

export interface ModelServiceAdminConfigItem {
  id: ModelProviderId;
  configId?: string;
  label: string;
  vendor?: string;
  model: string;
  baseUrl?: string;
  apiMode?: string;
  configured: boolean;
  keyPreview?: string;
  apiOwner: "platform";
  enabled?: boolean;
}

export interface ModelServiceAdminConfigResponse {
  textModels: ModelServiceAdminConfigItem[];
  imageModels: ModelServiceAdminConfigItem[];
  videoModels: ModelServiceAdminConfigItem[];
}

export async function buildProviderConfig(input: {
  modelConfigStore: ModelConfigStore;
  platformModelConfigStore?: ModelConfigStore;
}): Promise<ProviderConfigLedger> {
  const textStoredConfigs = (await input.modelConfigStore.listConfigs("openai-compatible-text")).filter((config) => config.apiOwner !== "platform");
  const imageStoredConfigs = (await input.modelConfigStore.listConfigs("openai-compatible-image")).filter((config) => config.apiOwner !== "platform");
  const videoStoredConfigs = (await input.modelConfigStore.listConfigs("volcengine-seedance")).filter((config) => config.apiOwner !== "platform");
  const platformTextConfigs = input.platformModelConfigStore && input.platformModelConfigStore !== input.modelConfigStore
    ? await input.platformModelConfigStore.listConfigs("openai-compatible-text")
    : (await input.modelConfigStore.listConfigs("openai-compatible-text")).filter((config) => config.apiOwner === "platform");
  const platformImageConfigs = input.platformModelConfigStore && input.platformModelConfigStore !== input.modelConfigStore
    ? await input.platformModelConfigStore.listConfigs("openai-compatible-image")
    : (await input.modelConfigStore.listConfigs("openai-compatible-image")).filter((config) => config.apiOwner === "platform");
  const platformVideoConfigs = input.platformModelConfigStore && input.platformModelConfigStore !== input.modelConfigStore
    ? await input.platformModelConfigStore.listConfigs("volcengine-seedance")
    : (await input.modelConfigStore.listConfigs("volcengine-seedance")).filter((config) => config.apiOwner === "platform");
  const allTextConfigs = [...textStoredConfigs, ...platformTextConfigs];
  const allImageConfigs = [...imageStoredConfigs, ...platformImageConfigs];
  const allVideoConfigs = [...videoStoredConfigs, ...platformVideoConfigs];
  const videoModels = buildVideoModelConfigs(allVideoConfigs);
  return {
    textModels: buildTextModelConfigs(allTextConfigs),
    imageModels: buildImageModelConfigs(allImageConfigs),
    videoModels,
    providers: videoModels,
    runtime: {
      textConfigured: allTextConfigs.some((config) => Boolean(config.apiKey) && config.enabled),
      imageConfigured: allImageConfigs.some((config) => Boolean(config.apiKey) && config.enabled),
      videoConfigured: allVideoConfigs.some((config) => Boolean(config.apiKey) && config.enabled)
    }
  };
}

export async function buildModelServiceAdminConfig(store: ModelConfigStore): Promise<ModelServiceAdminConfigResponse> {
  const [textModels, imageModels, videoModels] = await Promise.all([
    store.listConfigs("openai-compatible-text"),
    store.listConfigs("openai-compatible-image"),
    store.listConfigs("volcengine-seedance")
  ]);
  return {
    textModels: textModels.filter(isPlatformStoredConfig).map(modelServiceAdminConfigItem),
    imageModels: imageModels.filter(isPlatformStoredConfig).map(modelServiceAdminConfigItem),
    videoModels: videoModels.filter(isPlatformStoredConfig).map(modelServiceAdminConfigItem)
  };
}

function isPlatformStoredConfig(config: ModelStoredConfig): boolean {
  return config.apiOwner === "platform";
}

function modelServiceAdminConfigItem(config: ModelStoredConfig): ModelServiceAdminConfigItem {
  return {
    id: config.providerId,
    configId: config.configId,
    label: config.label,
    vendor: config.vendor,
    model: config.model,
    baseUrl: config.baseUrl,
    apiMode: config.apiMode,
    configured: Boolean(config.apiKey) && config.enabled,
    keyPreview: modelProviderStatus(config.providerId, {
      apiKey: config.apiKey,
      configId: config.configId
    }).keyPreview,
    apiOwner: "platform",
    enabled: config.enabled
  };
}

function buildTextModelConfigs(configs: ModelStoredConfig[]): ProviderConfigItem[] {
  if (configs.length === 0) {
    return [];
  }
  return configs.map((config) => {
    const keyStatus = modelProviderStatus("openai-compatible-text", {
      apiKey: config.apiKey,
      configId: config.configId
    });
    return {
      id: "openai-compatible-text",
      credentialId: config.credentialId,
      configId: config.configId,
      label: config.label,
      providerLabel: config.vendor ?? "OpenAI 兼容",
      apiOwner: config.apiOwner,
      configured: keyStatus.configured,
      keySource: keyStatus.keySource,
      keyPreview: keyStatus.keyPreview,
      baseUrl: config.baseUrl ?? textModelBaseUrl(),
      model: config.model ?? textModelName(),
      apiMode: inferTextModelApiMode({
        apiMode: config.apiMode,
        baseUrl: config.baseUrl ?? textModelBaseUrl(),
        model: config.model ?? textModelName()
      }),
      capabilities: ["商品整理", "脚本分镜"],
      modelKind: "text" as const,
      enabled: config.enabled,
      taskScopes: config.taskScopes,
      tags: config.tags
    };
  });
}

function buildImageModelConfigs(configs: ModelStoredConfig[]): ProviderConfigItem[] {
  if (configs.length === 0) {
    return [];
  }
  return configs.map((config) => {
    const keyStatus = modelProviderStatus("openai-compatible-image", {
      apiKey: config.apiKey,
      configId: config.configId
    });
    return {
      id: "openai-compatible-image",
      credentialId: config.credentialId,
      configId: config.configId,
      label: config.label,
      providerLabel: config.vendor ?? "OpenAI 兼容",
      apiOwner: config.apiOwner,
      configured: keyStatus.configured,
      keySource: keyStatus.keySource,
      keyPreview: keyStatus.keyPreview,
      baseUrl: config.baseUrl ?? imageModelBaseUrl(),
      model: config.model ?? imageModelName(),
      capabilities: ["商品图生成", "素材图生成"],
      modelKind: "image" as const,
      enabled: config.enabled,
      taskScopes: config.taskScopes,
      tags: config.tags
    };
  });
}

function buildVideoModelConfigs(configs: ModelStoredConfig[]): VideoProviderConfigItem[] {
  return configs.map((config) => {
    const model = config.model ?? defaultVideoModelId();
    const catalogEntry = catalogEntryForModel("volcengine-seedance", model);
    const resolution = seedanceResolutionFromEnv(process.env.SEEDANCE_RESOLUTION);
    const tokenPriceCnyPerMillion = tokenPriceCnyPerMillionForVideoModel(model, resolution);
    const keyStatus = modelProviderStatus("volcengine-seedance", {
      apiKey: config.apiKey,
      configId: config.configId
    });
    return {
      id: "volcengine-seedance",
      credentialId: config.credentialId,
      configId: config.configId ?? "volcengine-seedance",
      label: config.label ?? catalogEntry?.label ?? "视频模型",
      providerLabel: config.vendor ?? "火山引擎 Seedance",
      apiOwner: config.apiOwner,
      configured: keyStatus.configured,
      keySource: keyStatus.keySource,
      keyPreview: keyStatus.keyPreview,
      baseUrl: config.baseUrl ?? defaultVideoModelBaseUrl(),
      model,
      capabilities: ["视频生成"],
      modelKind: "video" as const,
      resolution,
      tokenPriceCnyPerMillion,
      estimatedCostCnyPerSecond: numberFromEnv(process.env.SEEDANCE_ESTIMATED_COST_CNY_PER_SECOND, 0.8),
      watermark: booleanFromEnv(process.env.SEEDANCE_WATERMARK ?? "false"),
      docsUrl: catalogEntry?.docsUrl ?? "https://www.volcengine.com/docs/82379/1541595?lang=zh",
      enabled: config.enabled,
      taskScopes: config.taskScopes,
      tags: config.tags
    };
  });
}

function seedanceResolutionFromEnv(value: string | undefined): VideoResolution {
  if (value === "720p" || value === "1080p" || value === "4k") {
    return value;
  }
  return "480p";
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanFromEnv(value: string): boolean {
  return ["1", "true", "yes"].includes(value.toLowerCase());
}
