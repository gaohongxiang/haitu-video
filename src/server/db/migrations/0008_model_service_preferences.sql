ALTER TABLE model_bundles ADD COLUMN api_owner TEXT NOT NULL DEFAULT 'byok';

CREATE TABLE IF NOT EXISTS model_service_preferences (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  service_mode TEXT NOT NULL DEFAULT 'byok',
  platform_bundle_id TEXT,
  byok_bundle_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
