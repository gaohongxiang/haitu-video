CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  title TEXT,
  product_json_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, sku)
);

CREATE TABLE IF NOT EXISTS product_assets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'file',
  storage_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS storyboards (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  style TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  script TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS video_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  model TEXT,
  language TEXT,
  duration_seconds INTEGER,
  output_count INTEGER,
  job_dir TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS video_assets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES video_jobs(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'file',
  storage_path TEXT NOT NULL,
  size_bytes INTEGER,
  expires_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS provider_keys (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  config_id TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  key_preview TEXT NOT NULL,
  name TEXT,
  vendor TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  base_url TEXT,
  model TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, provider, config_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS workspace_members_user_id_idx ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS products_workspace_id_idx ON products(workspace_id);
CREATE INDEX IF NOT EXISTS product_assets_workspace_id_idx ON product_assets(workspace_id);
CREATE INDEX IF NOT EXISTS product_assets_product_id_idx ON product_assets(product_id);
CREATE INDEX IF NOT EXISTS storyboards_workspace_id_idx ON storyboards(workspace_id);
CREATE INDEX IF NOT EXISTS storyboards_product_id_idx ON storyboards(product_id);
CREATE INDEX IF NOT EXISTS video_jobs_workspace_id_idx ON video_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS video_jobs_product_id_idx ON video_jobs(product_id);
CREATE INDEX IF NOT EXISTS video_assets_workspace_id_idx ON video_assets(workspace_id);
CREATE INDEX IF NOT EXISTS video_assets_job_id_idx ON video_assets(job_id);
CREATE INDEX IF NOT EXISTS provider_keys_workspace_id_idx ON provider_keys(workspace_id);
CREATE INDEX IF NOT EXISTS audit_logs_workspace_id_idx ON audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS audit_logs_actor_user_id_idx ON audit_logs(actor_user_id);
