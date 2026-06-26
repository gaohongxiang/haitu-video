CREATE TABLE IF NOT EXISTS wallet_recharge_orders (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_session_id TEXT,
  provider_payment_intent_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  credit_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  checkout_url TEXT,
  failure_reason TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  expires_at TEXT,
  UNIQUE (provider, provider_session_id)
);

CREATE INDEX IF NOT EXISTS wallet_recharge_orders_workspace_id_idx ON wallet_recharge_orders(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS wallet_recharge_orders_status_idx ON wallet_recharge_orders(workspace_id, status);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  payload_json TEXT
);
