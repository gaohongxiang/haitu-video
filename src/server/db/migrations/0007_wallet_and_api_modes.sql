ALTER TABLE model_credentials ADD COLUMN api_owner TEXT NOT NULL DEFAULT 'byok';
ALTER TABLE model_variants ADD COLUMN api_owner TEXT NOT NULL DEFAULT 'byok';

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  balance_after_cents INTEGER NOT NULL,
  reserved_after_cents INTEGER NOT NULL,
  reservation_id TEXT,
  job_id TEXT,
  description TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS wallet_transactions_workspace_id_idx ON wallet_transactions(workspace_id);
CREATE INDEX IF NOT EXISTS wallet_transactions_reservation_idx ON wallet_transactions(workspace_id, reservation_id);
CREATE INDEX IF NOT EXISTS wallet_transactions_job_idx ON wallet_transactions(workspace_id, job_id);
