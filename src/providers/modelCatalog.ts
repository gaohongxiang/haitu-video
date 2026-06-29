import {
  officialModelPricingCatalog,
  type ModelCatalogMetadata,
  type ModelPricingEntry
} from "../modelPricing/officialModelPricingCatalog.js";
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

export const modelCatalogEntries = officialModelPricingCatalog
  .flatMap((entry) => entry.catalog ? [modelCatalogEntryFromUnifiedCatalog(entry.catalog)] : [])
  .sort((left, right) => right.priority - left.priority) as readonly ModelCatalogEntry[];

function modelCatalogEntryFromUnifiedCatalog(metadata: ModelCatalogMetadata): ModelCatalogEntry {
  return {
    catalogId: `${metadata.providerId}-${metadata.modelId}`,
    providerId: metadata.providerId,
    modelKind: modelKindForCatalogProvider(metadata.providerId),
    vendor: metadata.vendor,
    label: metadata.label,
    modelId: metadata.modelId,
    baseUrl: metadata.baseUrl,
    apiMode: metadata.apiMode as TextModelApiMode | undefined,
    priority: metadata.priority,
    enabledByDefault: metadata.enabledByDefault,
    capabilities: [...metadata.capabilities],
    taskScopes: metadata.taskScopes ? [...metadata.taskScopes] : undefined,
    tags: [...metadata.tags],
    docsUrl: metadata.docsUrl ?? "",
    source: metadata.source
  };
}

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

export function pricedCatalogEntryForModel(providerId: ModelProviderId, modelId?: string): ModelPricingEntry | undefined {
  const normalized = normalizeModelId(modelId);
  if (!normalized) {
    return undefined;
  }
  const catalog: readonly ModelPricingEntry[] = officialModelPricingCatalog;
  return catalog.find((entry) =>
    entry.catalog?.providerId === providerId
    && entry.settlement
    && (
      normalizeModelId(entry.catalog.modelId) === normalized
      || normalizeModelId(entry.catalog.label) === normalized
      || normalizeModelId(entry.model) === normalized
      || Boolean(entry.aliases?.some((alias) => normalizeModelId(alias) === normalized))
    )
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
  const resolved = models.map((model) => {
    const entry = pricedCatalogEntryForModel(providerId, model);
    if (!entry?.catalog) {
      throw new Error(`模型版本不在统一模型目录中，不能保存：${model}`);
    }
    return entry.catalog.modelId;
  });
  return resolved.length > 0 ? resolved : [defaultCatalogEntryForProvider(providerId).modelId];
}

function modelKindForCatalogProvider(providerId: ModelProviderId): ModelKind {
  if (providerId === "openai-compatible-text") return "text";
  if (providerId === "openai-compatible-image") return "image";
  return "video";
}
