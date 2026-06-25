import {
  catalogEntryForModel,
  defaultCatalogEntryForVendor,
  type ModelProviderId
} from "../providers/modelCatalog.js";
import type { TextModelApiMode } from "../providers/textProviderTypes.js";
import type { ModelBundleStore } from "./modelBundleStore.js";
import type { ModelConfigStore, ModelStoredConfig } from "./modelConfigStore.js";
import type { ModelServicePreferenceStore } from "./modelServicePreferenceStore.js";

export const platformQualityBundleId = "platform-quality-bundle";
export const platformLowCostBundleId = "platform-low-cost-bundle";

const stalePlatformBundleIds = ["platform-default-bundle", "platform-fast-bundle", "platform-custom-bundle"];
const managedPlatformBundleIds = [
  ...stalePlatformBundleIds,
  platformQualityBundleId,
  platformLowCostBundleId
];

type ProviderEnvKey =
  | "HAITU_PLATFORM_OPENAI_API_KEY"
  | "HAITU_PLATFORM_DEEPSEEK_API_KEY"
  | "HAITU_PLATFORM_DOUBAO_API_KEY"
  | "HAITU_PLATFORM_GEMINI_API_KEY"
  | "HAITU_PLATFORM_VOLCENGINE_API_KEY";

interface PlatformModelDefinition {
  providerId: ModelProviderId;
  vendor: string;
  defaultModel?: string;
  envKey: ProviderEnvKey;
  defaultModelEnvKey: string;
  label: string;
  priority: number;
}

const platformTextDefinitions: PlatformModelDefinition[] = [
  {
    providerId: "openai-compatible-text",
    vendor: "openai",
    envKey: "HAITU_PLATFORM_OPENAI_API_KEY",
    defaultModelEnvKey: "HAITU_PLATFORM_OPENAI_TEXT_MODEL",
    label: "OpenAI 文本",
    priority: 100
  },
  {
    providerId: "openai-compatible-text",
    vendor: "deepseek",
    envKey: "HAITU_PLATFORM_DEEPSEEK_API_KEY",
    defaultModelEnvKey: "HAITU_PLATFORM_DEEPSEEK_TEXT_MODEL",
    label: "DeepSeek 文本",
    priority: 90
  },
  {
    providerId: "openai-compatible-text",
    vendor: "doubao",
    envKey: "HAITU_PLATFORM_DOUBAO_API_KEY",
    defaultModelEnvKey: "HAITU_PLATFORM_DOUBAO_TEXT_MODEL",
    label: "豆包文本",
    priority: 80
  }
];

const platformImageDefinitions: PlatformModelDefinition[] = [
  {
    providerId: "openai-compatible-image",
    vendor: "openai",
    envKey: "HAITU_PLATFORM_OPENAI_API_KEY",
    defaultModelEnvKey: "HAITU_PLATFORM_OPENAI_IMAGE_MODEL",
    label: "OpenAI 图片",
    priority: 100
  },
  {
    providerId: "openai-compatible-image",
    vendor: "gemini",
    envKey: "HAITU_PLATFORM_GEMINI_API_KEY",
    defaultModelEnvKey: "HAITU_PLATFORM_GEMINI_IMAGE_MODEL",
    label: "Gemini 图片",
    priority: 90
  }
];

const platformVideoDefinitions: PlatformModelDefinition[] = [
  {
    providerId: "volcengine-seedance",
    vendor: "volcengine",
    envKey: "HAITU_PLATFORM_VOLCENGINE_API_KEY",
    defaultModelEnvKey: "HAITU_PLATFORM_VOLCENGINE_VIDEO_MODEL",
    label: "Seedance 视频",
    priority: 100
  }
];

export async function ensurePlatformModelProvisioning(input: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  platformModelConfigStore: ModelConfigStore;
  modelBundleStore: ModelBundleStore;
  modelServicePreferenceStore: ModelServicePreferenceStore;
}): Promise<void> {
  const env = input.env ?? process.env;
  await Promise.all([
    ensureAvailablePlatformConfigs(platformTextDefinitions, env, input.platformModelConfigStore, env.HAITU_PLATFORM_DEFAULT_TEXT_MODEL),
    ensureAvailablePlatformConfigs(platformImageDefinitions, env, input.platformModelConfigStore, env.HAITU_PLATFORM_DEFAULT_IMAGE_MODEL),
    ensureAvailablePlatformConfigs(platformVideoDefinitions, env, input.platformModelConfigStore, env.HAITU_PLATFORM_DEFAULT_VIDEO_MODEL)
  ]);
  await ensurePlatformBundles({
    platformModelConfigStore: input.platformModelConfigStore,
    modelBundleStore: input.modelBundleStore,
    modelServicePreferenceStore: input.modelServicePreferenceStore,
    preferredTextModel: env.HAITU_PLATFORM_DEFAULT_TEXT_MODEL,
    preferredImageModel: env.HAITU_PLATFORM_DEFAULT_IMAGE_MODEL,
    preferredVideoModel: env.HAITU_PLATFORM_DEFAULT_VIDEO_MODEL
  });
}

export async function ensurePlatformBundles(input: {
  platformModelConfigStore: ModelConfigStore;
  modelBundleStore: ModelBundleStore;
  modelServicePreferenceStore: ModelServicePreferenceStore;
  preferredTextModel?: string;
  preferredImageModel?: string;
  preferredVideoModel?: string;
}): Promise<void> {
  const [textConfigs, imageConfigs, videoConfigs] = await Promise.all([
    input.platformModelConfigStore.listConfigs("openai-compatible-text"),
    input.platformModelConfigStore.listConfigs("openai-compatible-image"),
    input.platformModelConfigStore.listConfigs("volcengine-seedance")
  ]);
  const platformTextConfigs = textConfigs.filter(isEnabledPlatformConfig);
  const platformImageConfigs = imageConfigs.filter(isEnabledPlatformConfig);
  const platformVideoConfigs = videoConfigs.filter(isEnabledPlatformConfig);
  const textConfig = preferredPlatformConfig(platformTextConfigs, input.preferredTextModel) ?? platformTextConfigs[0];
  const imageConfig = preferredPlatformConfig(platformImageConfigs, input.preferredImageModel) ?? platformImageConfigs[0];
  const videoConfig = preferredPlatformConfig(platformVideoConfigs, input.preferredVideoModel) ?? platformVideoConfigs[0];

  if (!textConfig && !imageConfig && !videoConfig) {
    clearManagedPlatformBundles(input);
    return;
  }

  deletePlatformBundles(input, stalePlatformBundleIds);
  upsertPlatformBundle(input.modelBundleStore, {
    bundleId: platformQualityBundleId,
    label: "高质量",
    textConfig: qualityPlatformConfig(platformTextConfigs) ?? textConfig,
    imageConfig: qualityPlatformConfig(platformImageConfigs) ?? imageConfig,
    videoConfig: qualityPlatformConfig(platformVideoConfigs) ?? videoConfig,
    priority: 100
  });
  upsertPlatformBundle(input.modelBundleStore, {
    bundleId: platformLowCostBundleId,
    label: "低成本",
    textConfig: lowCostPlatformConfig(platformTextConfigs) ?? textConfig,
    imageConfig: lowCostPlatformConfig(platformImageConfigs) ?? imageConfig,
    videoConfig: lowCostPlatformConfig(platformVideoConfigs) ?? videoConfig,
    priority: 90
  });
  const preference = input.modelServicePreferenceStore.get();
  if (!preference.platformBundleId) {
    input.modelServicePreferenceStore.set({
      platformBundleId: platformQualityBundleId
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

async function ensureAvailablePlatformConfigs(
  definitions: PlatformModelDefinition[],
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  store: ModelConfigStore,
  preferredModel?: string
): Promise<void> {
  const preferredCatalogEntry = catalogEntryForAnyDefinition(definitions, preferredModel);
  const orderedDefinitions = preferredCatalogEntry
    ? [
      ...definitions.filter((definition) => definition.vendor === preferredCatalogEntry.vendor),
      ...definitions.filter((definition) => definition.vendor !== preferredCatalogEntry.vendor)
    ]
    : definitions;
  for (const definition of orderedDefinitions) {
    const apiKey = normalizeEnvText(env[definition.envKey]);
    if (!apiKey) {
      continue;
    }
    const model = preferredModelForDefinition(definition, preferredModel)
      ?? normalizeEnvText(env[definition.defaultModelEnvKey])
      ?? defaultCatalogEntryForVendor(definition.providerId, definition.vendor).modelId;
    const catalogEntry = catalogEntryForModel(definition.providerId, model);
    const normalizedModel = catalogEntry?.modelId ?? model;
    await store.set(definition.providerId, {
      configId: platformConfigId(definition.providerId, definition.vendor, normalizedModel),
      apiKey,
      apiOwner: "platform",
      name: definition.label,
      vendor: definition.vendor,
      baseUrl: catalogEntry?.baseUrl,
      model: normalizedModel,
      apiMode: catalogEntry?.apiMode as TextModelApiMode | undefined,
      enabled: true,
      priority: definition.priority,
      tags: ["平台托管"]
    });
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

function isEnabledPlatformConfig(config: ModelStoredConfig): boolean {
  return config.apiOwner === "platform" && config.enabled;
}

function preferredPlatformConfig(configs: ModelStoredConfig[], preferredModel?: string): ModelStoredConfig | undefined {
  const normalized = normalizeEnvText(preferredModel)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return configs.find((config) => config.model.toLowerCase() === normalized || config.label.toLowerCase() === normalized);
}

function lowCostPlatformConfig(configs: ModelStoredConfig[]): ModelStoredConfig | undefined {
  return configs.find((config) => hasAny(config, ["低成本", "快速", "fast", "flash", "low", "lite"]));
}

function qualityPlatformConfig(configs: ModelStoredConfig[]): ModelStoredConfig | undefined {
  return configs.find((config) => hasAny(config, ["高质量", "quality", "pro", "gpt", "openai"]));
}

function hasAny(config: ModelStoredConfig, needles: string[]): boolean {
  const catalogEntry = catalogEntryForModel(config.providerId, config.model);
  const text = [
    config.vendor,
    config.model,
    config.label,
    ...(config.tags ?? []),
    catalogEntry?.vendor,
    catalogEntry?.label,
    ...(catalogEntry?.tags ?? []),
    ...(catalogEntry?.capabilities ?? [])
  ].join(" ").toLowerCase();
  return needles.some((needle) => text.includes(needle.toLowerCase()));
}

function normalizeEnvText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function platformConfigId(providerId: ModelProviderId, vendor: string, model: string): string {
  return `platform-${providerId}-${vendor}-${model}`.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase();
}

function catalogEntryForAnyDefinition(definitions: PlatformModelDefinition[], model: string | undefined) {
  for (const definition of definitions) {
    const entry = catalogEntryForModel(definition.providerId, model);
    if (entry) {
      return entry;
    }
  }
  return undefined;
}

function preferredModelForDefinition(definition: PlatformModelDefinition, model: string | undefined): string | undefined {
  const normalized = normalizeEnvText(model);
  if (!normalized) {
    return undefined;
  }
  const entry = catalogEntryForModel(definition.providerId, normalized);
  return entry?.vendor === definition.vendor ? entry.modelId : undefined;
}
