CREATE TABLE IF NOT EXISTS traffic_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  event_name TEXT NOT NULL,
  path TEXT NOT NULL,
  canonical_path TEXT NOT NULL,
  locale TEXT,
  page_type TEXT NOT NULL,
  source_group TEXT NOT NULL,
  referrer_host TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  session_hash TEXT,
  user_id TEXT,
  workspace_id TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS traffic_events_occurred_at_idx
  ON traffic_events (occurred_at);

CREATE INDEX IF NOT EXISTS traffic_events_name_time_idx
  ON traffic_events (event_name, occurred_at);

CREATE INDEX IF NOT EXISTS traffic_events_page_time_idx
  ON traffic_events (canonical_path, occurred_at);

CREATE INDEX IF NOT EXISTS traffic_events_source_time_idx
  ON traffic_events (source_group, occurred_at);

CREATE TABLE IF NOT EXISTS traffic_daily_metrics (
  id TEXT PRIMARY KEY,
  metric_date TEXT NOT NULL,
  provider TEXT NOT NULL,
  dataset TEXT NOT NULL,
  dimension_json TEXT NOT NULL,
  metric_json TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS traffic_daily_metrics_unique_idx
  ON traffic_daily_metrics (metric_date, provider, dataset, dimension_json);

CREATE INDEX IF NOT EXISTS traffic_daily_metrics_provider_date_idx
  ON traffic_daily_metrics (provider, metric_date);

CREATE TABLE IF NOT EXISTS indexing_submissions (
  id TEXT PRIMARY KEY,
  submitted_at TEXT NOT NULL,
  provider TEXT NOT NULL,
  submission_type TEXT NOT NULL,
  url TEXT NOT NULL,
  payload_hash TEXT,
  status_code INTEGER,
  response_excerpt TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS indexing_submissions_submitted_at_idx
  ON indexing_submissions (submitted_at);

CREATE INDEX IF NOT EXISTS indexing_submissions_provider_time_idx
  ON indexing_submissions (provider, submitted_at);
