import { randomUUID } from "node:crypto";

import type { DatabaseHandle } from "./db/client.js";

export interface ModelBundle {
  bundleId: string;
  workspaceId: string;
  apiOwner: ModelBundleApiOwner;
  label: string;
  description?: string;
  textModelConfigId?: string;
  imageModelConfigId?: string;
  videoModelConfigId?: string;
  enabled: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface ModelBundleInput {
  bundleId?: string;
  apiOwner?: ModelBundleApiOwner;
  label?: string;
  description?: string;
  textModelConfigId?: string;
  imageModelConfigId?: string;
  videoModelConfigId?: string;
  enabled?: boolean;
  priority?: number;
}

interface ModelBundleRow {
  bundle_id: string;
  workspace_id: string;
  api_owner: ModelBundleApiOwner;
  label: string;
  description: string | null;
  text_model_config_id: string | null;
  image_model_config_id: string | null;
  video_model_config_id: string | null;
  enabled: number;
  priority: number;
  created_at: string;
  updated_at: string;
}

export type ModelBundleApiOwner = "platform" | "byok";

export class ModelBundleStore {
  constructor(
    private readonly input: {
      handle: DatabaseHandle;
      workspaceId: string;
      now?: () => Date;
    }
  ) {}

  list(): ModelBundle[] {
    const rows = this.input.handle.sqlite.prepare(`
      SELECT *
      FROM model_bundles
      WHERE workspace_id = ?
      ORDER BY
        enabled DESC,
        CASE bundle_id
          WHEN 'platform-low-cost-bundle' THEN 0
          WHEN 'platform-quality-bundle' THEN 1
          ELSE 2
        END ASC,
        updated_at DESC
    `).all(this.input.workspaceId) as ModelBundleRow[];
    return rows.map(modelBundleFromRow);
  }

  set(input: ModelBundleInput): ModelBundle {
    const label = normalizeRequiredLabel(input.label);
    const bundleId = normalizeText(input.bundleId) ?? `model-bundle-${randomUUID()}`;
    const previous = this.find(bundleId);
    const now = this.nowIso();
    this.input.handle.sqlite.prepare(`
      INSERT INTO model_bundles (
        id,
        workspace_id,
        bundle_id,
        api_owner,
        label,
        description,
        text_model_config_id,
        image_model_config_id,
        video_model_config_id,
        enabled,
        priority,
        created_at,
        updated_at
      ) VALUES (
        @id,
        @workspaceId,
        @bundleId,
        @apiOwner,
        @label,
        @description,
        @textModelConfigId,
        @imageModelConfigId,
        @videoModelConfigId,
        @enabled,
        @priority,
        @createdAt,
        @updatedAt
      )
      ON CONFLICT(workspace_id, bundle_id) DO UPDATE SET
        api_owner = excluded.api_owner,
        label = excluded.label,
        description = excluded.description,
        text_model_config_id = excluded.text_model_config_id,
        image_model_config_id = excluded.image_model_config_id,
        video_model_config_id = excluded.video_model_config_id,
        enabled = excluded.enabled,
        priority = excluded.priority,
        updated_at = excluded.updated_at
    `).run({
      id: previous ? `model-bundle-row-${bundleId}` : randomUUID(),
      workspaceId: this.input.workspaceId,
      bundleId,
      apiOwner: normalizeApiOwner(input.apiOwner),
      label,
      description: normalizeText(input.description) ?? null,
      textModelConfigId: normalizeText(input.textModelConfigId) ?? null,
      imageModelConfigId: normalizeText(input.imageModelConfigId) ?? null,
      videoModelConfigId: normalizeText(input.videoModelConfigId) ?? null,
      enabled: input.enabled === false ? 0 : 1,
      priority: normalizePriority(input.priority),
      createdAt: previous?.created_at ?? now,
      updatedAt: now
    });
    const saved = this.find(bundleId);
    if (!saved) {
      throw new Error("Model bundle was not saved.");
    }
    return modelBundleFromRow(saved);
  }

  delete(bundleId: string): void {
    const normalized = normalizeText(bundleId);
    if (!normalized) {
      throw new Error("bundleId is required.");
    }
    this.input.handle.sqlite.prepare(`
      DELETE FROM model_bundles
      WHERE workspace_id = ? AND bundle_id = ?
    `).run(this.input.workspaceId, normalized);
  }

  private find(bundleId: string): ModelBundleRow | undefined {
    return this.input.handle.sqlite.prepare(`
      SELECT *
      FROM model_bundles
      WHERE workspace_id = ? AND bundle_id = ?
      LIMIT 1
    `).get(this.input.workspaceId, bundleId) as ModelBundleRow | undefined;
  }

  private nowIso(): string {
    return (this.input.now ?? (() => new Date()))().toISOString();
  }
}

function modelBundleFromRow(row: ModelBundleRow): ModelBundle {
  return {
    bundleId: row.bundle_id,
    workspaceId: row.workspace_id,
    apiOwner: row.api_owner === "platform" ? "platform" : "byok",
    label: row.label,
    description: row.description ?? undefined,
    textModelConfigId: row.text_model_config_id ?? undefined,
    imageModelConfigId: row.image_model_config_id ?? undefined,
    videoModelConfigId: row.video_model_config_id ?? undefined,
    enabled: Boolean(row.enabled),
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeRequiredLabel(value: unknown): string {
  const label = normalizeText(value);
  if (!label) {
    throw new Error("组合名称不能为空。");
  }
  return label;
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizePriority(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function normalizeApiOwner(value: unknown): ModelBundleApiOwner {
  return value === "platform" ? "platform" : "byok";
}
