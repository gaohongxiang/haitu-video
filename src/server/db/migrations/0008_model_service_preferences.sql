CREATE TABLE IF NOT EXISTS model_service_preferences (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  service_mode TEXT NOT NULL DEFAULT 'byok',
  text_model_config_id TEXT,
  image_model_config_id TEXT,
  video_model_config_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
