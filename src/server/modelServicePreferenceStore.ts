import type { DatabaseHandle } from "./db/client.js";

export type ModelServiceMode = "platform" | "byok";

export interface ModelServicePreference {
  workspaceId: string;
  serviceMode: ModelServiceMode;
  platformBundleId?: string;
  byokBundleId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelServicePreferenceInput {
  serviceMode?: ModelServiceMode;
  platformBundleId?: string | null;
  byokBundleId?: string | null;
}

interface ModelServicePreferenceRow {
  workspace_id: string;
  service_mode: string;
  platform_bundle_id: string | null;
  byok_bundle_id: string | null;
  created_at: string;
  updated_at: string;
}

export class ModelServicePreferenceStore {
  constructor(
    private readonly input: {
      handle: DatabaseHandle;
      workspaceId: string;
      now?: () => Date;
    }
  ) {}

  get(): ModelServicePreference {
    const row = this.input.handle.sqlite.prepare(`
      SELECT *
      FROM model_service_preferences
      WHERE workspace_id = ?
      LIMIT 1
    `).get(this.input.workspaceId) as ModelServicePreferenceRow | undefined;
    if (row) {
      return preferenceFromRow(row);
    }
    const now = this.nowIso();
    return {
      workspaceId: this.input.workspaceId,
      serviceMode: "byok",
      createdAt: now,
      updatedAt: now
    };
  }

  set(input: ModelServicePreferenceInput): ModelServicePreference {
    const previous = this.get();
    const now = this.nowIso();
    const serviceMode = normalizeServiceMode(input.serviceMode ?? previous.serviceMode);
    const platformBundleId = Object.hasOwn(input, "platformBundleId")
      ? normalizeText(input.platformBundleId)
      : previous.platformBundleId;
    const byokBundleId = Object.hasOwn(input, "byokBundleId")
      ? normalizeText(input.byokBundleId)
      : previous.byokBundleId;
    this.input.handle.sqlite.prepare(`
      INSERT INTO model_service_preferences (
        workspace_id,
        service_mode,
        platform_bundle_id,
        byok_bundle_id,
        created_at,
        updated_at
      ) VALUES (
        @workspaceId,
        @serviceMode,
        @platformBundleId,
        @byokBundleId,
        @createdAt,
        @updatedAt
      )
      ON CONFLICT(workspace_id) DO UPDATE SET
        service_mode = excluded.service_mode,
        platform_bundle_id = excluded.platform_bundle_id,
        byok_bundle_id = excluded.byok_bundle_id,
        updated_at = excluded.updated_at
    `).run({
      workspaceId: this.input.workspaceId,
      serviceMode,
      platformBundleId: platformBundleId ?? null,
      byokBundleId: byokBundleId ?? null,
      createdAt: previous.createdAt,
      updatedAt: now
    });
    return this.get();
  }

  private nowIso(): string {
    return (this.input.now ?? (() => new Date()))().toISOString();
  }
}

export function normalizeServiceMode(value: unknown): ModelServiceMode {
  return value === "platform" ? "platform" : "byok";
}

function preferenceFromRow(row: ModelServicePreferenceRow): ModelServicePreference {
  return {
    workspaceId: row.workspace_id,
    serviceMode: normalizeServiceMode(row.service_mode),
    platformBundleId: row.platform_bundle_id ?? undefined,
    byokBundleId: row.byok_bundle_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
