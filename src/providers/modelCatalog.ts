import type { VideoProviderName } from "./providerFactory.js";
import type { TextModelApiMode } from "./textProviderTypes.js";

export type ModelKind = "text" | "image" | "video";
export type ModelProviderId = "openai-compatible-text" | "openai-compatible-image" | "volcengine-seedance";
export type RuntimeProviderId = ModelProviderId | VideoProviderName;

export interface ModelCatalogEntry {
  catalogId: string;
  providerId: ModelProviderId;
  modelKind: ModelKind;
  vendor: string;
  label: string;
  modelId: string;
  baseUrl: string;
  apiMode?: TextModelApiMode;
  priority: number;
  enabledByDefault: boolean;
  capabilities: string[];
  taskScopes?: string[];
  tags: string[];
  docsUrl: string;
  source: "official_docs" | "provider_models_api" | "manual";
}

export interface ModelCatalogVendor {
  value: string;
  label: string;
  providerId: ModelProviderId;
  priority: number;
}

export const modelCatalogEntries = [
  {
    catalogId: "openai-gpt-5-5-text",
    providerId: "openai-compatible-text",
    modelKind: "text",
    vendor: "openai",
    label: "gpt-5.5",
    modelId: "gpt-5.5",
    baseUrl: "https://api.openai.com",
    apiMode: "responses_stream",
    priority: 100,
    enabledByDefault: true,
    capabilities: ["商品整理", "脚本分镜"],
    taskScopes: ["product_import", "storyboard"],
    tags: ["高质量", "推荐"],
    docsUrl: "https://platform.openai.com/docs/models",
    source: "official_docs"
  },
  {
    catalogId: "deepseek-v4-pro-text",
    providerId: "openai-compatible-text",
    modelKind: "text",
    vendor: "deepseek",
    label: "deepseek-v4-pro",
    modelId: "deepseek-v4-pro",
    baseUrl: "https://api.deepseek.com",
    apiMode: "chat_completions",
    priority: 80,
    enabledByDefault: false,
    capabilities: ["商品整理", "脚本分镜"],
    taskScopes: ["product_import", "storyboard"],
    tags: ["高质量"],
    docsUrl: "https://api-docs.deepseek.com/api/list-models",
    source: "official_docs"
  },
  {
    catalogId: "deepseek-v4-flash-text",
    providerId: "openai-compatible-text",
    modelKind: "text",
    vendor: "deepseek",
    label: "deepseek-v4-flash",
    modelId: "deepseek-v4-flash",
    baseUrl: "https://api.deepseek.com",
    apiMode: "chat_completions",
    priority: 70,
    enabledByDefault: false,
    capabilities: ["商品整理", "脚本分镜"],
    taskScopes: ["product_import", "storyboard"],
    tags: ["快速", "低成本"],
    docsUrl: "https://api-docs.deepseek.com/news/news260424",
    source: "official_docs"
  },
  {
    catalogId: "doubao-seed-2-pro-text",
    providerId: "openai-compatible-text",
    modelKind: "text",
    vendor: "doubao",
    label: "doubao-seed-2.0-pro",
    modelId: "doubao-seed-2-0-pro-260215",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    apiMode: "chat_completions",
    priority: 75,
    enabledByDefault: false,
    capabilities: ["商品整理", "脚本分镜"],
    taskScopes: ["product_import", "storyboard"],
    tags: ["高质量", "多模态"],
    docsUrl: "https://www.volcengine.com/docs/82379/1330310",
    source: "official_docs"
  },
  {
    catalogId: "openai-gpt-image-2",
    providerId: "openai-compatible-image",
    modelKind: "image",
    vendor: "openai",
    label: "gpt-image-2",
    modelId: "gpt-image-2",
    baseUrl: "https://api.openai.com",
    priority: 100,
    enabledByDefault: true,
    capabilities: ["商品图生成", "素材图生成"],
    tags: ["高质量", "推荐"],
    docsUrl: "https://developers.openai.com/api/docs/models/gpt-image-2",
    source: "official_docs"
  },
  {
    catalogId: "gemini-3-pro-image",
    providerId: "openai-compatible-image",
    modelKind: "image",
    vendor: "gemini",
    label: "gemini-3-pro-image",
    modelId: "gemini-3-pro-image-preview",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    priority: 90,
    enabledByDefault: false,
    capabilities: ["商品图生成", "素材图生成"],
    tags: ["高质量"],
    docsUrl: "https://ai.google.dev/gemini-api/docs/image-generation",
    source: "official_docs"
  },
  {
    catalogId: "gemini-2-5-flash-image",
    providerId: "openai-compatible-image",
    modelKind: "image",
    vendor: "gemini",
    label: "gemini-2.5-flash-image",
    modelId: "gemini-2.5-flash-image",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    priority: 80,
    enabledByDefault: false,
    capabilities: ["商品图生成", "素材图生成"],
    tags: ["快速"],
    docsUrl: "https://ai.google.dev/gemini-api/docs/image-generation",
    source: "official_docs"
  },
  {
    catalogId: "seedance-2-fast-video",
    providerId: "volcengine-seedance",
    modelKind: "video",
    vendor: "volcengine",
    label: "seedance-2.0-fast",
    modelId: "doubao-seedance-2-0-fast-260128",
    baseUrl: "https://ark.cn-beijing.volces.com",
    priority: 100,
    enabledByDefault: true,
    capabilities: ["视频生成"],
    tags: ["快速", "推荐"],
    docsUrl: "https://www.volcengine.com/docs/82379/2291680",
    source: "official_docs"
  },
  {
    catalogId: "seedance-2-video",
    providerId: "volcengine-seedance",
    modelKind: "video",
    vendor: "volcengine",
    label: "seedance-2.0",
    modelId: "doubao-seedance-2-0-260128",
    baseUrl: "https://ark.cn-beijing.volces.com",
    priority: 90,
    enabledByDefault: false,
    capabilities: ["视频生成"],
    tags: ["高质量"],
    docsUrl: "https://www.volcengine.com/docs/82379/2291680",
    source: "official_docs"
  }
] as const satisfies readonly ModelCatalogEntry[];

export function catalogEntriesForProvider(providerId: ModelProviderId): ModelCatalogEntry[] {
  return modelCatalogEntries
    .filter((entry) => entry.providerId === providerId)
    .sort((left, right) => right.priority - left.priority);
}

export function catalogEntriesForVendor(providerId: ModelProviderId, vendor: string): ModelCatalogEntry[] {
  const normalizedVendor = vendor.trim().toLowerCase();
  return catalogEntriesForProvider(providerId).filter((entry) => entry.vendor.toLowerCase() === normalizedVendor);
}

export function catalogVendorsForProvider(providerId: ModelProviderId): ModelCatalogVendor[] {
  const byVendor = new Map<string, ModelCatalogVendor>();
  for (const entry of catalogEntriesForProvider(providerId)) {
    const normalizedVendor = entry.vendor.toLowerCase();
    const existing = byVendor.get(normalizedVendor);
    if (!existing || entry.priority > existing.priority) {
      byVendor.set(normalizedVendor, {
        value: entry.vendor,
        label: entry.vendor,
        providerId,
        priority: entry.priority
      });
    }
  }
  return Array.from(byVendor.values()).sort((left, right) => right.priority - left.priority);
}

export function defaultCatalogEntryForVendor(providerId: ModelProviderId, vendor: string): ModelCatalogEntry {
  const entries = catalogEntriesForVendor(providerId, vendor);
  const entry = entries.find((item) => item.enabledByDefault) ?? entries[0];
  if (!entry) {
    throw new Error(`No model catalog entries for provider/vendor: ${providerId}/${vendor}`);
  }
  return entry;
}

export function catalogEntriesForKind(modelKind: ModelKind): ModelCatalogEntry[] {
  return modelCatalogEntries
    .filter((entry) => entry.modelKind === modelKind)
    .sort((left, right) => right.priority - left.priority);
}

export function defaultCatalogEntryForProvider(providerId: ModelProviderId): ModelCatalogEntry {
  const entries = catalogEntriesForProvider(providerId);
  const entry = entries.find((item) => item.enabledByDefault) ?? entries[0];
  if (!entry) {
    throw new Error(`No model catalog entries for provider: ${providerId}`);
  }
  return entry;
}

export function defaultBaseUrlForProvider(providerId: ModelProviderId): string {
  return defaultCatalogEntryForProvider(providerId).baseUrl;
}

export function defaultModelIdForProvider(providerId: ModelProviderId): string {
  return defaultCatalogEntryForProvider(providerId).modelId;
}

export function defaultTextModelBaseUrl(): string {
  return defaultBaseUrlForProvider("openai-compatible-text");
}

export function defaultTextModelId(): string {
  return defaultModelIdForProvider("openai-compatible-text");
}

export function defaultImageModelBaseUrl(): string {
  return defaultBaseUrlForProvider("openai-compatible-image");
}

export function defaultImageModelId(): string {
  return defaultModelIdForProvider("openai-compatible-image");
}

export function defaultVideoModelBaseUrl(): string {
  return defaultBaseUrlForProvider("volcengine-seedance");
}

export function defaultVideoModelId(): string {
  return defaultModelIdForProvider("volcengine-seedance");
}

export function catalogEntryForModel(providerId: ModelProviderId, modelId?: string): ModelCatalogEntry | undefined {
  const normalized = normalizeModelId(modelId);
  if (!normalized) {
    return undefined;
  }
  return catalogEntriesForProvider(providerId).find((entry) =>
    normalizeModelId(entry.modelId) === normalized || normalizeModelId(entry.label) === normalized
  );
}

export function visibleModelLabel(entry: Pick<ModelCatalogEntry, "label" | "modelId"> | undefined): string {
  return entry?.label || entry?.modelId || "-";
}

export function modelLabelForId(providerId: ModelProviderId, modelId?: string): string {
  return catalogEntryForModel(providerId, modelId)?.label ?? modelId ?? "-";
}

export function normalizeModelProviderId(value: string): ModelProviderId {
  if (value === "openai-compatible-text" || value === "openai-compatible-image" || value === "volcengine-seedance") {
    return value;
  }
  throw new Error(`Unknown model provider: ${value}`);
}

export function normalizeModelId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : undefined;
}

export function splitModelIds(value: unknown): string[] {
  const models = Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
    : typeof value === "string"
      ? value.split(/[,\n]+/).map((item) => item.trim()).filter(Boolean)
      : [];
  return Array.from(new Set(models));
}

export function modelIdsFromInput(value: unknown, providerId: ModelProviderId): string[] {
  const models = splitModelIds(value);
  const resolved = models.map((model) => catalogEntryForModel(providerId, model)?.modelId ?? model);
  return resolved.length > 0 ? resolved : [defaultCatalogEntryForProvider(providerId).modelId];
}
