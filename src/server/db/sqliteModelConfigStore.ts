import { randomUUID } from "node:crypto";

import type { DatabaseHandle } from "./client.js";
import { decryptSecret, encryptSecret } from "./crypto.js";
import type { ModelKind, ModelProviderId } from "../../providers/modelCatalog.js";
import {
  createModelConfigId,
  createModelCredentialId,
  labelForProviderModelVariant,
  maskedModelProviderStatus,
  modelKindForProvider,
  modelsFromInput,
  normalizeModelConfigInput,
  parseModelTaskScopes,
  stringifyOptionalArray,
  type ModelConfigInput,
  type ModelConfigStore,
  type ModelStoredConfig,
  type ModelTaskScope
} from "../modelConfigStore.js";
import { defaultCatalogEntryForProvider } from "../../providers/modelCatalog.js";
import { inferTextModelApiMode } from "../../providers/textProviderFactory.js";

interface ModelCredentialRow {
  id: string;
  workspace_id: string;
  credential_id: string;
  provider_id: ModelProviderId;
  model_kind: ModelKind;
  api_owner: "platform" | "byok";
  encrypted_key: string;
  key_preview: string;
  name: string | null;
  vendor: string | null;
  base_url: string | null;
  api_mode: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

interface ModelVariantRow {
  id: string;
  workspace_id: string;
  credential_id: string;
  provider_id: ModelProviderId;
  model_kind: ModelKind;
  api_owner: "platform" | "byok";
  config_id: string;
  label: string;
  model: string;
  priority: number;
  task_scopes_json: string | null;
  tags_json: string | null;
  enabled: number;
  variant_order: number;
  created_at: string;
  updated_at: string;
}

interface JoinedModelRow extends ModelVariantRow {
  encrypted_key: string;
  key_preview: string;
  name: string | null;
  vendor: string | null;
  base_url: string | null;
  api_mode: string | null;
  credential_enabled: number;
}

export class SqliteModelConfigStore implements ModelConfigStore {
  constructor(
    private readonly input: {
      handle: DatabaseHandle;
      secretKey: string;
      workspaceId: string;
    }
  ) {}

  async listConfigs(providerId: ModelProviderId): Promise<ModelStoredConfig[]> {
    const rows = this.input.handle.sqlite.prepare(`
      SELECT
        variant.*,
        credential.encrypted_key,
        credential.key_preview,
        credential.name,
        credential.vendor,
        credential.base_url,
        credential.api_mode,
        credential.enabled AS credential_enabled
      FROM model_variants AS variant
      INNER JOIN model_credentials AS credential
        ON credential.workspace_id = variant.workspace_id
        AND credential.credential_id = variant.credential_id
      WHERE variant.workspace_id = ? AND variant.provider_id = ?
      ORDER BY variant.priority DESC, variant.variant_order ASC, variant.updated_at DESC, variant.created_at DESC
    `).all(this.input.workspaceId, providerId) as JoinedModelRow[];
    return rows.map((row) => this.configFromJoinedRow(row));
  }

  async getConfig(providerId: ModelProviderId, configId?: string): Promise<ModelStoredConfig | undefined> {
    const normalizedConfigId = normalizeText(configId);
    if (normalizedConfigId && normalizedConfigId !== "auto") {
      const row = this.findJoinedRowByConfigId(providerId, normalizedConfigId);
      return row ? this.configFromJoinedRow(row) : undefined;
    }
    const row = this.input.handle.sqlite.prepare(`
      SELECT
        variant.*,
        credential.encrypted_key,
        credential.key_preview,
        credential.name,
        credential.vendor,
        credential.base_url,
        credential.api_mode,
        credential.enabled AS credential_enabled
      FROM model_variants AS variant
      INNER JOIN model_credentials AS credential
        ON credential.workspace_id = variant.workspace_id
        AND credential.credential_id = variant.credential_id
      WHERE variant.workspace_id = ?
        AND variant.provider_id = ?
        AND variant.enabled = 1
        AND credential.enabled = 1
      ORDER BY variant.priority DESC, variant.variant_order ASC, variant.updated_at DESC, variant.created_at DESC
      LIMIT 1
    `).get(this.input.workspaceId, providerId) as JoinedModelRow | undefined;
    return row ? this.configFromJoinedRow(row) : undefined;
  }

  async getConfigById(providerId: ModelProviderId, configId: string): Promise<ModelStoredConfig | undefined> {
    const row = this.findJoinedRowByConfigId(providerId, configId);
    return row ? this.configFromJoinedRow(row) : undefined;
  }

  async set(providerId: ModelProviderId, input: ModelConfigInput): Promise<ReturnType<typeof maskedModelProviderStatus>> {
    const normalized = normalizeModelConfigInput(input);
    const requestedConfigId = normalizeText(input.configId);
    const previousVariant = requestedConfigId ? this.findVariantByConfigId(providerId, requestedConfigId) : undefined;
    const previousCredential = previousVariant ? this.findCredential(previousVariant.credential_id) : undefined;
    const credentialId = previousCredential?.credential_id ?? createModelCredentialId();
    const secret = normalized.apiKey ?? (previousCredential ? decryptSecret(previousCredential.encrypted_key, this.input.secretKey) : undefined);
    if (!secret) {
      throw new Error("Provider API key is required.");
    }

    const now = new Date().toISOString();
    const models = input.model === undefined
      ? previousVariant ? [previousVariant.model] : modelsFromInput(undefined, providerId)
      : modelsFromInput(input.model, providerId);
    const catalogDefault = defaultCatalogEntryForProvider(providerId);
    const name = normalized.name ?? previousCredential?.name ?? undefined;
    const vendor = normalized.vendor ?? previousCredential?.vendor ?? catalogDefault.vendor;
    const apiOwner = normalized.apiOwner ?? previousCredential?.api_owner ?? "byok";
    const baseUrl = normalized.baseUrl ?? previousCredential?.base_url ?? catalogDefault.baseUrl;
    const apiMode = effectiveApiMode({
      providerId,
      input,
      normalizedApiMode: normalized.apiMode,
      previousCredential,
      previousVariant,
      baseUrl,
      model: models[0],
      catalogApiMode: catalogDefault.apiMode
    });
    const modelKind = modelKindForProvider(providerId);
    const credentialEnabled = typeof input.enabled === "boolean"
      ? input.enabled
      : previousCredential ? Boolean(previousCredential.enabled) : true;
    const previousVariantCount = previousCredential ? this.countVariants(credentialId) : 0;
    const labelModelCount = Math.max(models.length, previousVariantCount || models.length);

    this.input.handle.sqlite.prepare(`
      INSERT INTO model_credentials (
        id,
        workspace_id,
        credential_id,
        provider_id,
        model_kind,
        api_owner,
        encrypted_key,
        key_preview,
        name,
        vendor,
        base_url,
        api_mode,
        enabled,
        created_at,
        updated_at
      ) VALUES (
        @id,
        @workspaceId,
        @credentialId,
        @providerId,
        @modelKind,
        @apiOwner,
        @encryptedKey,
        @keyPreview,
        @name,
        @vendor,
        @baseUrl,
        @apiMode,
        @enabled,
        @createdAt,
        @updatedAt
      )
      ON CONFLICT(workspace_id, credential_id) DO UPDATE SET
        provider_id = excluded.provider_id,
        model_kind = excluded.model_kind,
        api_owner = excluded.api_owner,
        encrypted_key = excluded.encrypted_key,
        key_preview = excluded.key_preview,
        name = excluded.name,
        vendor = excluded.vendor,
        base_url = excluded.base_url,
        api_mode = excluded.api_mode,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at
    `).run({
      id: previousCredential?.id ?? randomUUID(),
      workspaceId: this.input.workspaceId,
      credentialId,
      providerId,
      modelKind,
      apiOwner,
      encryptedKey: encryptSecret(secret, this.input.secretKey),
      keyPreview: maskedModelProviderStatus(providerId, secret).keyPreview,
      name: name ?? null,
      vendor: vendor ?? null,
      baseUrl: baseUrl ?? null,
      apiMode: apiMode ?? null,
      enabled: credentialEnabled ? 1 : 0,
      createdAt: previousCredential?.created_at ?? now,
      updatedAt: now
    });

    const savedConfigIds: string[] = [];
    models.forEach((model, index) => {
      const existingForModel = this.findVariantByCredentialAndModel(credentialId, model);
      const existingVariant = index === 0 ? previousVariant ?? existingForModel : existingForModel;
      const configId = existingVariant?.config_id ?? (index === 0 && requestedConfigId ? requestedConfigId : createModelConfigId());
      savedConfigIds.push(configId);
      this.upsertVariant({
        previous: existingVariant,
        providerId,
        modelKind,
        apiOwner,
        credentialId,
        configId,
        model,
        label: labelForProviderModelVariant({
          providerId,
          name,
          model,
          modelCount: labelModelCount
        }),
        priority: input.priority === undefined ? existingVariant?.priority ?? 0 : normalized.priority,
        taskScopes: normalized.taskScopes ?? parseModelTaskScopes(existingVariant?.task_scopes_json),
        tags: normalized.tags ?? parseGenericStringArray(existingVariant?.tags_json),
        enabled: typeof input.enabled === "boolean" ? input.enabled : existingVariant ? Boolean(existingVariant.enabled) : true,
        variantOrder: index,
        now
      });
    });

    if (input.model !== undefined) {
      this.deleteVariantsNotInModels(credentialId, models);
    }

    return maskedModelProviderStatus(providerId, secret, savedConfigIds[0]);
  }

  async delete(providerId: ModelProviderId, configId?: string): Promise<ReturnType<typeof maskedModelProviderStatus>> {
    const normalizedConfigId = normalizeText(configId);
    if (!normalizedConfigId) {
      this.input.handle.sqlite.prepare(`
        DELETE FROM model_credentials
        WHERE workspace_id = ? AND provider_id = ?
      `).run(this.input.workspaceId, providerId);
      return maskedModelProviderStatus(providerId, undefined);
    }
    const variant = this.findVariantByConfigId(providerId, normalizedConfigId);
    if (variant) {
      this.input.handle.sqlite.prepare(`
        DELETE FROM model_credentials
        WHERE workspace_id = ? AND credential_id = ?
      `).run(this.input.workspaceId, variant.credential_id);
    } else {
      this.input.handle.sqlite.prepare(`
        DELETE FROM model_variants
        WHERE workspace_id = ? AND provider_id = ? AND config_id = ?
      `).run(this.input.workspaceId, providerId, normalizedConfigId);
    }
    return maskedModelProviderStatus(providerId, undefined, normalizedConfigId);
  }

  private upsertVariant(input: {
    previous?: ModelVariantRow;
    providerId: ModelProviderId;
    modelKind: ModelKind;
    apiOwner: "platform" | "byok";
    credentialId: string;
    configId: string;
    label: string;
    model: string;
    priority: number;
    taskScopes?: ModelTaskScope[];
    tags?: string[];
    enabled: boolean;
    variantOrder: number;
    now: string;
  }): void {
    this.input.handle.sqlite.prepare(`
      INSERT INTO model_variants (
        id,
        workspace_id,
        credential_id,
        provider_id,
        model_kind,
        api_owner,
        config_id,
        label,
        model,
        priority,
        task_scopes_json,
        tags_json,
        enabled,
        variant_order,
        created_at,
        updated_at
      ) VALUES (
        @id,
        @workspaceId,
        @credentialId,
        @providerId,
        @modelKind,
        @apiOwner,
        @configId,
        @label,
        @model,
        @priority,
        @taskScopesJson,
        @tagsJson,
        @enabled,
        @variantOrder,
        @createdAt,
        @updatedAt
      )
      ON CONFLICT(workspace_id, config_id) DO UPDATE SET
        credential_id = excluded.credential_id,
        provider_id = excluded.provider_id,
        model_kind = excluded.model_kind,
        api_owner = excluded.api_owner,
        label = excluded.label,
        model = excluded.model,
        priority = excluded.priority,
        task_scopes_json = excluded.task_scopes_json,
        tags_json = excluded.tags_json,
        enabled = excluded.enabled,
        variant_order = excluded.variant_order,
        updated_at = excluded.updated_at
    `).run({
      id: input.previous?.id ?? randomUUID(),
      workspaceId: this.input.workspaceId,
      credentialId: input.credentialId,
      providerId: input.providerId,
      modelKind: input.modelKind,
      apiOwner: input.apiOwner,
      configId: input.configId,
      label: input.label,
      model: input.model,
      priority: input.priority,
      taskScopesJson: stringifyOptionalArray(input.taskScopes),
      tagsJson: stringifyOptionalArray(input.tags),
      enabled: input.enabled ? 1 : 0,
      variantOrder: input.variantOrder,
      createdAt: input.previous?.created_at ?? input.now,
      updatedAt: input.now
    });
  }

  private configFromJoinedRow(row: JoinedModelRow): ModelStoredConfig {
    return {
      credentialId: row.credential_id,
      configId: row.config_id,
      providerId: row.provider_id,
      modelKind: row.model_kind,
      apiOwner: row.api_owner ?? "byok",
      apiKey: decryptSecret(row.encrypted_key, this.input.secretKey),
      label: row.label,
      name: row.name ?? undefined,
      vendor: row.vendor ?? undefined,
      priority: row.priority,
      baseUrl: row.base_url ?? undefined,
      model: row.model,
      apiMode: row.api_mode ?? undefined,
      enabled: Boolean(row.enabled) && Boolean(row.credential_enabled),
      taskScopes: parseModelTaskScopes(row.task_scopes_json),
      tags: parseGenericStringArray(row.tags_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private findCredential(credentialId: string): ModelCredentialRow | undefined {
    return this.input.handle.sqlite.prepare(`
      SELECT *
      FROM model_credentials
      WHERE workspace_id = ? AND credential_id = ?
    `).get(this.input.workspaceId, credentialId) as ModelCredentialRow | undefined;
  }

  private findVariantByConfigId(providerId: ModelProviderId, configId: string): ModelVariantRow | undefined {
    return this.input.handle.sqlite.prepare(`
      SELECT *
      FROM model_variants
      WHERE workspace_id = ? AND provider_id = ? AND config_id = ?
    `).get(this.input.workspaceId, providerId, configId) as ModelVariantRow | undefined;
  }

  private findVariantByCredentialAndModel(credentialId: string, model: string): ModelVariantRow | undefined {
    return this.input.handle.sqlite.prepare(`
      SELECT *
      FROM model_variants
      WHERE workspace_id = ? AND credential_id = ? AND model = ?
    `).get(this.input.workspaceId, credentialId, model) as ModelVariantRow | undefined;
  }

  private findJoinedRowByConfigId(providerId: ModelProviderId, configId: string): JoinedModelRow | undefined {
    return this.input.handle.sqlite.prepare(`
      SELECT
        variant.*,
        credential.encrypted_key,
        credential.key_preview,
        credential.name,
        credential.vendor,
        credential.base_url,
        credential.api_mode,
        credential.enabled AS credential_enabled
      FROM model_variants AS variant
      INNER JOIN model_credentials AS credential
        ON credential.workspace_id = variant.workspace_id
        AND credential.credential_id = variant.credential_id
      WHERE variant.workspace_id = ? AND variant.provider_id = ? AND variant.config_id = ?
      LIMIT 1
    `).get(this.input.workspaceId, providerId, configId) as JoinedModelRow | undefined;
  }

  private countVariants(credentialId: string): number {
    const row = this.input.handle.sqlite.prepare(`
      SELECT COUNT(*) AS count
      FROM model_variants
      WHERE workspace_id = ? AND credential_id = ?
    `).get(this.input.workspaceId, credentialId) as { count: number };
    return row.count;
  }

  private deleteVariantsNotInModels(credentialId: string, models: string[]): void {
    const placeholders = models.map(() => "?").join(", ");
    this.input.handle.sqlite.prepare(`
      DELETE FROM model_variants
      WHERE workspace_id = ?
        AND credential_id = ?
        AND model NOT IN (${placeholders})
    `).run(this.input.workspaceId, credentialId, ...models);
  }
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function effectiveApiMode(input: {
  providerId: ModelProviderId;
  input: ModelConfigInput;
  normalizedApiMode?: string;
  previousCredential?: ModelCredentialRow;
  previousVariant?: ModelVariantRow;
  baseUrl?: string;
  model?: string;
  catalogApiMode?: string;
}): string | undefined {
  if (input.providerId !== "openai-compatible-text") {
    return undefined;
  }
  if (input.normalizedApiMode) {
    return input.normalizedApiMode;
  }
  const changedBaseUrl = input.input.baseUrl !== undefined && input.baseUrl !== (input.previousCredential?.base_url ?? undefined);
  const changedModel = input.input.model !== undefined && input.model !== (input.previousVariant?.model ?? undefined);
  if (!input.previousCredential || changedBaseUrl || changedModel) {
    return inferTextModelApiMode({
      baseUrl: input.baseUrl,
      model: input.model
    });
  }
  return input.previousCredential.api_mode ?? input.catalogApiMode;
}

function parseGenericStringArray(value: string | null | undefined): string[] | undefined {
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
    return items.length > 0 ? Array.from(new Set(items)) : undefined;
  } catch {
    return undefined;
  }
}
