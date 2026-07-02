import type { DatabaseHandle } from "./db/client.js";

export type ModelServiceMode = "platform" | "byok";

export interface ModelServicePreference {
  workspaceId: string;
  serviceMode: ModelServiceMode;
  textModelConfigId?: string;
  imageModelConfigId?: string;
  videoModelConfigId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelServicePreferenceInput {
  serviceMode?: ModelServiceMode;
  textModelConfigId?: string | null;
  imageModelConfigId?: string | null;
  videoModelConfigId?: string | null;
}

interface ModelServicePreferenceRow {
  workspace_id: string;
  service_mode: string;
  text_model_config_id: string | null;
  image_model_config_id: string | null;
  video_model_config_id: string | null;
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
    const textModelConfigId = Object.hasOwn(input, "textModelConfigId")
      ? normalizeText(input.textModelConfigId)
      : previous.textModelConfigId;
    const imageModelConfigId = Object.hasOwn(input, "imageModelConfigId")
      ? normalizeText(input.imageModelConfigId)
      : previous.imageModelConfigId;
    const videoModelConfigId = Object.hasOwn(input, "videoModelConfigId")
      ? normalizeText(input.videoModelConfigId)
      : previous.videoModelConfigId;
    this.input.handle.sqlite.prepare(`
      INSERT INTO model_service_preferences (
        workspace_id,
        service_mode,
        text_model_config_id,
        image_model_config_id,
        video_model_config_id,
        created_at,
        updated_at
      ) VALUES (
        @workspaceId,
        @serviceMode,
        @textModelConfigId,
        @imageModelConfigId,
        @videoModelConfigId,
        @createdAt,
        @updatedAt
      )
      ON CONFLICT(workspace_id) DO UPDATE SET
        service_mode = excluded.service_mode,
        text_model_config_id = excluded.text_model_config_id,
        image_model_config_id = excluded.image_model_config_id,
        video_model_config_id = excluded.video_model_config_id,
        updated_at = excluded.updated_at
    `).run({
      workspaceId: this.input.workspaceId,
      serviceMode,
      textModelConfigId: textModelConfigId ?? null,
      imageModelConfigId: imageModelConfigId ?? null,
      videoModelConfigId: videoModelConfigId ?? null,
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
    textModelConfigId: row.text_model_config_id ?? undefined,
    imageModelConfigId: row.image_model_config_id ?? undefined,
    videoModelConfigId: row.video_model_config_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
