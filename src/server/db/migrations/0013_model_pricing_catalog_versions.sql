CREATE TABLE IF NOT EXISTS model_pricing_catalog_versions (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('published', 'archived')),
  catalog_json TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('admin')),
  created_by TEXT,
  created_at TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS model_pricing_catalog_active_unique
ON model_pricing_catalog_versions(status)
WHERE status = 'published';

CREATE TABLE IF NOT EXISTS model_pricing_catalog_drafts (
  id TEXT PRIMARY KEY,
  base_version_id TEXT REFERENCES model_pricing_catalog_versions(id) ON DELETE SET NULL,
  version TEXT NOT NULL,
  catalog_json TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS model_pricing_catalog_drafts_updated_idx
ON model_pricing_catalog_drafts(updated_at);
