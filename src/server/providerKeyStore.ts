import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

import type { VideoProviderName } from "../providers/providerFactory.js";

export type ApiProviderId = VideoProviderName | "openai-compatible-text" | "openai-compatible-image";
export type ProviderKeySource =
  | "SEEDANCE_API_KEY"
  | "ARK_API_KEY"
  | "TEXT_MODEL_API_KEY"
  | "IMAGE_MODEL_API_KEY"
  | "OPENAI_API_KEY"
  | "LOCAL_BYOK";

export interface ProviderKeyStatus {
  id: ApiProviderId;
  configId?: string;
  configured: boolean;
  keySource?: ProviderKeySource;
  keyPreview?: string;
}

export interface ProviderModelConfigInput {
  configId?: string;
  apiKey?: string;
  name?: string;
  vendor?: string;
  priority?: number;
  baseUrl?: string;
  model?: string;
  enabled?: boolean;
}

export interface ProviderStoredConfig {
  configId?: string;
  apiKey?: string;
  name?: string;
  vendor?: string;
  priority?: number;
  baseUrl?: string;
  model?: string;
  enabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface ProviderKeyFile {
  providers?: Record<string, ProviderStoredConfig | ProviderStoredConfig[]>;
}

export class FileProviderKeyStore {
  constructor(private readonly path: string) {}

  async get(provider: ApiProviderId): Promise<string | undefined> {
    if (provider === "mock") {
      return undefined;
    }
    const config = await this.getConfig(provider);
    return normalizeSecret(config.apiKey);
  }

  async getConfig(provider: ApiProviderId): Promise<ProviderStoredConfig> {
    const configs = await this.listConfigs(provider);
    const config = configs.find((item) => item.enabled !== false) ?? {};
    return {
      ...config,
      apiKey: normalizeSecret(config.apiKey)
    };
  }

  async listConfigs(provider: ApiProviderId): Promise<ProviderStoredConfig[]> {
    const file = await this.read();
    return sortedConfigs(storedConfigs(file, provider)).map((config) => ({
      ...config,
      configId: config.configId ?? provider,
      apiKey: normalizeSecret(config.apiKey),
      enabled: config.enabled ?? true
    }));
  }

  async set(provider: ApiProviderId, input: string | ProviderModelConfigInput): Promise<ProviderKeyStatus> {
    if (provider === "mock") {
      throw new Error("Mock provider does not accept API keys.");
    }
    const nextInput = typeof input === "string" ? { apiKey: input } : input;
    const file = await this.read();
    const configs = storedConfigs(file, provider);
    const requestedConfigId = normalizeText(nextInput.configId);
    const previousIndex = requestedConfigId
      ? configs.findIndex((config) => config.configId === requestedConfigId)
      : -1;
    const previous = previousIndex >= 0 ? configs[previousIndex] : undefined;
    const secret = normalizeSecret(nextInput.apiKey) ?? normalizeSecret(previous?.apiKey);
    if (!secret) {
      throw new Error("Provider API key is required.");
    }
    const now = new Date().toISOString();
    const nextConfig: ProviderStoredConfig = {
      ...(previous ?? {}),
      configId: previous?.configId ?? requestedConfigId ?? createConfigId(provider),
      name: normalizeText(nextInput.name) ?? previous?.name,
      vendor: normalizeText(nextInput.vendor) ?? previous?.vendor,
      priority: normalizePriority(nextInput.priority) ?? previous?.priority ?? 0,
      baseUrl: normalizeUrl(nextInput.baseUrl) ?? previous?.baseUrl,
      model: normalizeText(nextInput.model) ?? previous?.model,
      enabled: normalizeEnabled(nextInput.enabled) ?? previous?.enabled ?? true,
      apiKey: secret,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now
    };
    const nextConfigs = previousIndex >= 0
      ? configs.map((config, index) => index === previousIndex ? nextConfig : config)
      : [...configs, nextConfig];
    const next: ProviderKeyFile = {
      providers: {
        ...(file.providers ?? {}),
        [provider]: sortedConfigs(nextConfigs)
      }
    };
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(next, null, 2), "utf8");
    return providerKeyStatus(provider, {
      localKey: secret,
      configId: nextConfig.configId
    });
  }

  async delete(provider: ApiProviderId, configId?: string): Promise<ProviderKeyStatus> {
    const file = await this.read();
    const providers = { ...(file.providers ?? {}) };
    const normalizedConfigId = normalizeText(configId);
    if (normalizedConfigId) {
      const remaining = storedConfigs(file, provider).filter((config) => config.configId !== normalizedConfigId);
      if (remaining.length > 0) {
        providers[provider] = sortedConfigs(remaining);
      } else {
        delete providers[provider];
      }
    } else {
      delete providers[provider];
    }
    if (Object.keys(providers).length === 0) {
      await rm(this.path, { force: true });
    } else {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path, JSON.stringify({ providers }, null, 2), "utf8");
    }
    return providerKeyStatus(provider);
  }

  private async read(): Promise<ProviderKeyFile> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as ProviderKeyFile;
    } catch (error) {
      if (isMissingFileError(error)) {
        return {};
      }
      throw error;
    }
  }
}

export function resolveProviderApiKey(input: {
  provider: VideoProviderName;
  localKey?: string;
}): string | undefined {
  if (input.provider === "mock") {
    return undefined;
  }
  return input.localKey ?? process.env.SEEDANCE_API_KEY ?? process.env.ARK_API_KEY;
}

export function resolveTextModelApiKey(input: {
  localKey?: string;
} = {}): string | undefined {
  return input.localKey ?? process.env.TEXT_MODEL_API_KEY ?? process.env.OPENAI_API_KEY;
}

export function resolveImageModelApiKey(input: {
  localKey?: string;
} = {}): string | undefined {
  return input.localKey ?? process.env.IMAGE_MODEL_API_KEY ?? process.env.OPENAI_API_KEY;
}

export function providerKeyStatus(
  provider: ApiProviderId,
  input: {
    localKey?: string;
    configId?: string;
  } = {}
): ProviderKeyStatus {
  if (provider === "openai-compatible-text") {
    return textModelKeyStatus(input);
  }
  if (provider === "openai-compatible-image") {
    return imageModelKeyStatus(input);
  }
  const seedanceKey = process.env.SEEDANCE_API_KEY;
  const arkKey = process.env.ARK_API_KEY;
  const keySource: ProviderKeySource | undefined = input.localKey
    ? "LOCAL_BYOK"
    : seedanceKey
      ? "SEEDANCE_API_KEY"
      : arkKey
        ? "ARK_API_KEY"
        : undefined;
  const keyValue = input.localKey ?? seedanceKey ?? arkKey;
  return {
    id: provider,
    configId: input.configId,
    configured: Boolean(keyValue),
    keySource,
    keyPreview: maskSecret(keyValue)
  };
}

function textModelKeyStatus(input: { localKey?: string; configId?: string }): ProviderKeyStatus {
  const textKey = process.env.TEXT_MODEL_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;
  const keySource: ProviderKeySource | undefined = input.localKey
    ? "LOCAL_BYOK"
    : textKey
      ? "TEXT_MODEL_API_KEY"
      : openAiKey
        ? "OPENAI_API_KEY"
        : undefined;
  const keyValue = input.localKey ?? textKey ?? openAiKey;
  return {
    id: "openai-compatible-text",
    configId: input.configId,
    configured: Boolean(keyValue),
    keySource,
    keyPreview: maskSecret(keyValue)
  };
}

function imageModelKeyStatus(input: { localKey?: string; configId?: string }): ProviderKeyStatus {
  const imageKey = process.env.IMAGE_MODEL_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;
  const keySource: ProviderKeySource | undefined = input.localKey
    ? "LOCAL_BYOK"
    : imageKey
      ? "IMAGE_MODEL_API_KEY"
      : openAiKey
        ? "OPENAI_API_KEY"
        : undefined;
  const keyValue = input.localKey ?? imageKey ?? openAiKey;
  return {
    id: "openai-compatible-image",
    configId: input.configId,
    configured: Boolean(keyValue),
    keySource,
    keyPreview: maskSecret(keyValue)
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

function normalizeSecret(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function createConfigId(provider: ApiProviderId): string {
  return `${provider}-${randomUUID()}`;
}

function storedConfigs(file: ProviderKeyFile, provider: ApiProviderId): ProviderStoredConfig[] {
  const value = file.providers?.[provider];
  if (!value) {
    return [];
  }
  const configs = Array.isArray(value) ? value : [value];
  return configs.map((config, index) => ({
    ...config,
    configId: config.configId ?? (configs.length === 1 ? provider : `${provider}-${index + 1}`),
    enabled: config.enabled ?? true
  }));
}

function sortedConfigs(configs: ProviderStoredConfig[]): ProviderStoredConfig[] {
  return [...configs].sort((left, right) => {
    const priorityDiff = (right.priority ?? 0) - (left.priority ?? 0);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return String(right.updatedAt ?? right.createdAt ?? "").localeCompare(String(left.updatedAt ?? left.createdAt ?? ""));
  });
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
