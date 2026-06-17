import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import type { DatabaseHandle } from "./client.js";
import { decryptSecret, encryptSecret } from "./crypto.js";
import {
  type ApiProviderId,
  maskSecret,
  providerKeyStatus,
  type ProviderKeyStatus,
  type ProviderKeyStore,
  type ProviderModelConfigInput,
  type ProviderStoredConfig
} from "../providerKeyStore.js";

interface ProviderKeyFile {
  providers?: Record<string, ProviderStoredConfig | ProviderStoredConfig[]>;
}

interface ProviderKeyRow {
  id: string;
  workspace_id: string;
  provider: string;
  config_id: string;
  encrypted_key: string;
  key_preview: string;
  name: string | null;
  vendor: string | null;
  priority: number;
  base_url: string | null;
  model: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export class SqliteProviderKeyStore implements ProviderKeyStore {
  constructor(
    private readonly input: {
      handle: DatabaseHandle;
      secretKey: string;
      workspaceId: string;
      legacyFilePath?: string;
    }
  ) {}

  migrateLegacyFile(): void {
    if (!this.input.legacyFilePath) {
      return;
    }
    const file = this.readLegacyFile();
    const providers = file.providers ?? {};
    for (const [provider, value] of Object.entries(providers)) {
      const configs = Array.isArray(value) ? value : [value];
      for (const config of configs) {
        const configId = normalizeText(config.configId) ?? "default";
        if (this.findRow(provider as ApiProviderId, configId)) {
          continue;
        }
        this.upsertConfig(provider as ApiProviderId, {
          ...config,
          configId
        });
      }
    }
  }

  async get(provider: ApiProviderId): Promise<string | undefined> {
    if (provider === "mock") {
      return undefined;
    }
    const config = await this.getConfig(provider);
    return normalizeSecret(config.apiKey);
  }

  async getConfig(provider: ApiProviderId): Promise<ProviderStoredConfig> {
    const configs = await this.listConfigs(provider);
    return configs.find((item) => item.enabled !== false) ?? {};
  }

  async listConfigs(provider: ApiProviderId): Promise<ProviderStoredConfig[]> {
    const rows = this.input.handle.sqlite.prepare(`
      SELECT *
      FROM provider_keys
      WHERE workspace_id = ? AND provider = ?
      ORDER BY priority DESC, updated_at DESC, created_at DESC
    `).all(this.input.workspaceId, provider) as ProviderKeyRow[];
    return rows.map((row) => ({
      configId: row.config_id,
      apiKey: decryptSecret(row.encrypted_key, this.input.secretKey),
      name: row.name ?? undefined,
      vendor: row.vendor ?? undefined,
      priority: row.priority,
      baseUrl: row.base_url ?? undefined,
      model: row.model ?? undefined,
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  async set(provider: ApiProviderId, input: string | ProviderModelConfigInput): Promise<ProviderKeyStatus> {
    if (provider === "mock") {
      throw new Error("Mock provider does not accept API keys.");
    }
    const config = this.upsertConfig(provider, typeof input === "string" ? { apiKey: input } : input);
    return providerKeyStatus(provider, {
      localKey: config.apiKey,
      configId: config.configId
    });
  }

  async delete(provider: ApiProviderId, configId?: string): Promise<ProviderKeyStatus> {
    const normalizedConfigId = normalizeText(configId);
    if (normalizedConfigId) {
      this.input.handle.sqlite.prepare(`
        DELETE FROM provider_keys
        WHERE workspace_id = ? AND provider = ? AND config_id = ?
      `).run(this.input.workspaceId, provider, normalizedConfigId);
    } else {
      this.input.handle.sqlite.prepare(`
        DELETE FROM provider_keys
        WHERE workspace_id = ? AND provider = ?
      `).run(this.input.workspaceId, provider);
    }
    return providerKeyStatus(provider);
  }

  private upsertConfig(provider: ApiProviderId, input: ProviderModelConfigInput): ProviderStoredConfig {
    const requestedConfigId = normalizeText(input.configId);
    const previous = requestedConfigId ? this.findRow(provider, requestedConfigId) : undefined;
    const secret = normalizeSecret(input.apiKey) ?? (previous ? decryptSecret(previous.encrypted_key, this.input.secretKey) : undefined);
    if (!secret) {
      throw new Error("Provider API key is required.");
    }
    const now = new Date().toISOString();
    const configId = previous?.config_id ?? requestedConfigId ?? createConfigId(provider);
    const nextConfig: ProviderStoredConfig = {
      configId,
      apiKey: secret,
      name: normalizeText(input.name) ?? previous?.name ?? undefined,
      vendor: normalizeText(input.vendor) ?? previous?.vendor ?? undefined,
      priority: normalizePriority(input.priority) ?? previous?.priority ?? 0,
      baseUrl: normalizeUrl(input.baseUrl) ?? previous?.base_url ?? undefined,
      model: normalizeText(input.model) ?? previous?.model ?? undefined,
      enabled: normalizeEnabled(input.enabled) ?? Boolean(previous?.enabled ?? 1),
      createdAt: previous?.created_at ?? now,
      updatedAt: now
    };
    this.input.handle.sqlite.prepare(`
      INSERT INTO provider_keys (
        id,
        workspace_id,
        provider,
        config_id,
        encrypted_key,
        key_preview,
        name,
        vendor,
        priority,
        base_url,
        model,
        enabled,
        created_at,
        updated_at
      ) VALUES (
        @id,
        @workspaceId,
        @provider,
        @configId,
        @encryptedKey,
        @keyPreview,
        @name,
        @vendor,
        @priority,
        @baseUrl,
        @model,
        @enabled,
        @createdAt,
        @updatedAt
      )
      ON CONFLICT(workspace_id, provider, config_id) DO UPDATE SET
        encrypted_key = excluded.encrypted_key,
        key_preview = excluded.key_preview,
        name = excluded.name,
        vendor = excluded.vendor,
        priority = excluded.priority,
        base_url = excluded.base_url,
        model = excluded.model,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at
    `).run({
      id: previous?.id ?? randomUUID(),
      workspaceId: this.input.workspaceId,
      provider,
      configId,
      encryptedKey: encryptSecret(secret, this.input.secretKey),
      keyPreview: maskSecret(secret),
      name: nextConfig.name ?? null,
      vendor: nextConfig.vendor ?? null,
      priority: nextConfig.priority ?? 0,
      baseUrl: nextConfig.baseUrl ?? null,
      model: nextConfig.model ?? null,
      enabled: nextConfig.enabled === false ? 0 : 1,
      createdAt: nextConfig.createdAt,
      updatedAt: nextConfig.updatedAt
    });
    return nextConfig;
  }

  private findRow(provider: ApiProviderId, configId: string): ProviderKeyRow | undefined {
    return this.input.handle.sqlite.prepare(`
      SELECT *
      FROM provider_keys
      WHERE workspace_id = ? AND provider = ? AND config_id = ?
    `).get(this.input.workspaceId, provider, configId) as ProviderKeyRow | undefined;
  }

  private readLegacyFile(): ProviderKeyFile {
    try {
      return JSON.parse(readFileSync(this.input.legacyFilePath ?? "", "utf8")) as ProviderKeyFile;
    } catch (error) {
      if (isMissingFileError(error)) {
        return {};
      }
      throw error;
    }
  }
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

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
