CREATE TABLE IF NOT EXISTS model_credentials (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model_kind TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  key_preview TEXT NOT NULL,
  name TEXT,
  vendor TEXT,
  base_url TEXT,
  api_mode TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, credential_id)
);

CREATE TABLE IF NOT EXISTS model_variants (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model_kind TEXT NOT NULL,
  config_id TEXT NOT NULL,
  label TEXT NOT NULL,
  model TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  task_scopes_json TEXT,
  tags_json TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  variant_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, config_id),
  UNIQUE (workspace_id, credential_id, model),
  FOREIGN KEY (workspace_id, credential_id)
    REFERENCES model_credentials(workspace_id, credential_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS model_credentials_workspace_id_idx ON model_credentials(workspace_id);
CREATE INDEX IF NOT EXISTS model_credentials_provider_idx ON model_credentials(workspace_id, provider_id);
CREATE INDEX IF NOT EXISTS model_variants_workspace_id_idx ON model_variants(workspace_id);
CREATE INDEX IF NOT EXISTS model_variants_provider_idx ON model_variants(workspace_id, provider_id);
CREATE INDEX IF NOT EXISTS model_variants_credential_idx ON model_variants(workspace_id, credential_id);
