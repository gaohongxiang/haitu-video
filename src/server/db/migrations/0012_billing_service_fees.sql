CREATE TABLE IF NOT EXISTS billing_price_rules_next (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES billing_policies(id) ON DELETE CASCADE,
  usage_kind TEXT NOT NULL,
  service_fee_cents INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR REPLACE INTO billing_price_rules_next (
  id,
  policy_id,
  usage_kind,
  service_fee_cents,
  enabled,
  created_at,
  updated_at
)
SELECT
  id,
  policy_id,
  usage_kind,
  service_fee_cents,
  enabled,
  created_at,
  updated_at
FROM billing_price_rules;

DROP TABLE billing_price_rules;

ALTER TABLE billing_price_rules_next RENAME TO billing_price_rules;

CREATE UNIQUE INDEX IF NOT EXISTS billing_price_rules_policy_kind_unique ON billing_price_rules(policy_id, usage_kind);
CREATE INDEX IF NOT EXISTS billing_price_rules_policy_idx ON billing_price_rules(policy_id, enabled);
