CREATE TABLE IF NOT EXISTS billing_policies (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  label TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_price_rules (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES billing_policies(id) ON DELETE CASCADE,
  usage_kind TEXT NOT NULL,
  service_fee_cents INTEGER NOT NULL,
  upstream_unit_cost_cents INTEGER NOT NULL,
  upstream_unit_kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_price_rules_policy_kind_unique ON billing_price_rules(policy_id, usage_kind);
CREATE INDEX IF NOT EXISTS billing_price_rules_policy_idx ON billing_price_rules(policy_id, enabled);
