import { randomUUID } from "node:crypto";

import {
  defaultCatalogEntryForProvider,
  modelIdsFromInput,
  splitModelIds,
  type ModelKind,
  type ModelProviderId
} from "../providers/modelCatalog.js";
import { normalizeTextModelApiMode } from "../providers/textProviderFactory.js";

export type ModelTaskScope = "product_import" | "storyboard";
export type ModelProviderKeySource = "LOCAL_BYOK";

export interface ModelProviderStatus {
  id: ModelProviderId;
  configId?: string;
  configured: boolean;
  keySource?: ModelProviderKeySource;
  keyPreview?: string;
}

export interface ModelConfigInput {
  configId?: string;
  apiKey?: string;
  name?: string;
  vendor?: string;
  apiOwner?: ApiOwner;
  priority?: number;
  baseUrl?: string;
  model?: string | string[];
  apiMode?: string;
  enabled?: boolean;
  taskScopes?: ModelTaskScope[];
  tags?: string[];
}

export interface ModelStoredConfig {
  credentialId: string;
  configId: string;
  providerId: ModelProviderId;
  modelKind: ModelKind;
  apiOwner: ApiOwner;
  apiKey?: string;
  label: string;
  name?: string;
  vendor?: string;
  priority: number;
  baseUrl?: string;
  model: string;
  apiMode?: string;
  enabled: boolean;
  taskScopes?: ModelTaskScope[];
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ModelConfigStore {
  listConfigs(providerId: ModelProviderId): Promise<ModelStoredConfig[]>;
  getConfig(providerId: ModelProviderId, configId?: string): Promise<ModelStoredConfig | undefined>;
  getConfigById(providerId: ModelProviderId, configId: string): Promise<ModelStoredConfig | undefined>;
  set(providerId: ModelProviderId, input: ModelConfigInput): Promise<ModelProviderStatus>;
  delete(providerId: ModelProviderId, configId?: string): Promise<ModelProviderStatus>;
}

export type ApiOwner = "platform" | "byok";

export function normalizeModelConfigInput(input: ModelConfigInput): Required<Pick<ModelConfigInput, "priority" | "enabled">> & Omit<ModelConfigInput, "priority" | "enabled"> {
  return {
    ...input,
    configId: normalizeText(input.configId),
    apiKey: normalizeSecret(input.apiKey),
    name: normalizeText(input.name),
    vendor: normalizeText(input.vendor),
    apiOwner: normalizeApiOwner(input.apiOwner),
    priority: normalizePriority(input.priority) ?? 0,
    baseUrl: normalizeUrl(input.baseUrl),
    model: typeof input.model === "string" || Array.isArray(input.model) ? input.model : undefined,
    apiMode: normalizeTextModelApiMode(input.apiMode),
    enabled: normalizeEnabled(input.enabled) ?? true,
    taskScopes: normalizeTaskScopes(input.taskScopes),
    tags: normalizeTags(input.tags)
  };
}

export function modelProviderStatus(
  providerId: ModelProviderId,
  input: {
    apiKey?: string;
    configId?: string;
  } = {}
): ModelProviderStatus {
  if (providerId === "openai-compatible-text") {
    return textModelProviderStatus(input);
  }
  if (providerId === "openai-compatible-image") {
    return imageModelProviderStatus(input);
  }
  return videoModelProviderStatus(input);
}

export function labelForModelVariant(input: {
  name?: string;
  model: string;
  modelCount: number;
}): string {
  if (!input.name) {
    return defaultCatalogEntryForProvider("openai-compatible-text").label;
  }
  return input.name;
}

export function labelForProviderModelVariant(input: {
  providerId: ModelProviderId;
  name?: string;
  model: string;
  modelCount: number;
}): string {
  if (!input.name) {
    return defaultCatalogEntryForProvider(input.providerId).label;
  }
  return input.name;
}

export function createModelCredentialId(): string {
  return `model-credential-${randomUUID()}`;
}

export function createModelConfigId(): string {
  return `model-config-${randomUUID()}`;
}

export function maskedModelProviderStatus(providerId: ModelProviderId, apiKey: string | undefined, configId?: string): ModelProviderStatus {
  const status = modelProviderStatus(providerId, { apiKey, configId });
  return {
    ...status,
    keyPreview: status.keyPreview ?? maskSecret(apiKey)
  };
}

export function maskSecret(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  if (value.length <= 8) {
    return "****";
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function modelsFromInput(value: unknown, providerId: ModelProviderId): string[] {
  return modelIdsFromInput(value, providerId);
}

export function modelKindForProvider(providerId: ModelProviderId): ModelKind {
  if (providerId === "openai-compatible-text") return "text";
  if (providerId === "openai-compatible-image") return "image";
  return "video";
}

const taskScopes = new Set<ModelTaskScope>(["product_import", "storyboard"]);

export function parseModelTaskScopes(value: string | null | undefined): ModelTaskScope[] | undefined {
  return parseJsonStringArray(value, taskScopes);
}

function normalizeSecret(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function textModelProviderStatus(input: { apiKey?: string; configId?: string }): ModelProviderStatus {
  const keyValue = input.apiKey;
  return {
    id: "openai-compatible-text",
    configId: input.configId,
    configured: Boolean(keyValue),
    keySource: keyValue ? "LOCAL_BYOK" : undefined,
    keyPreview: maskSecret(keyValue)
  };
}

function imageModelProviderStatus(input: { apiKey?: string; configId?: string }): ModelProviderStatus {
  const keyValue = input.apiKey;
  return {
    id: "openai-compatible-image",
    configId: input.configId,
    configured: Boolean(keyValue),
    keySource: keyValue ? "LOCAL_BYOK" : undefined,
    keyPreview: maskSecret(keyValue)
  };
}

function videoModelProviderStatus(input: { apiKey?: string; configId?: string }): ModelProviderStatus {
  const keyValue = input.apiKey;
  return {
    id: "volcengine-seedance",
    configId: input.configId,
    configured: Boolean(keyValue),
    keySource: keyValue ? "LOCAL_BYOK" : undefined,
    keyPreview: maskSecret(keyValue)
  };
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeUrl(value: unknown): string | undefined {
  const normalized = normalizeText(value);
  return normalized?.replace(/\/+$/, "");
}

function normalizePriority(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.max(0, Math.floor(parsed));
}

function normalizeEnabled(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeApiOwner(value: unknown): ApiOwner | undefined {
  return value === "platform" || value === "byok" ? value : undefined;
}

function normalizeTaskScopes(value: ModelTaskScope[] | undefined): ModelTaskScope[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const scopes = value.filter((item): item is ModelTaskScope => taskScopes.has(item));
  return scopes.length > 0 ? Array.from(new Set(scopes)) : undefined;
}

function normalizeTags(value: string[] | undefined): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const tags = value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean);
  return tags.length > 0 ? Array.from(new Set(tags)) : undefined;
}

export function parseJsonStringArray<T extends string>(value: string | null | undefined, allowed?: Set<T>): T[] | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return undefined;
    }
    const items = parsed
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
    const filtered: T[] = allowed ? items.filter((item): item is T => allowed.has(item as T)) : items as T[];
    return filtered.length > 0 ? Array.from(new Set(filtered)) : undefined;
  } catch {
    return undefined;
  }
}

export function stringifyOptionalArray(value: string[] | undefined): string | null {
  return value && value.length > 0 ? JSON.stringify(Array.from(new Set(value))) : null;
}
