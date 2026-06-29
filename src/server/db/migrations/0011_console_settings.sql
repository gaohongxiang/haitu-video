CREATE TABLE IF NOT EXISTS console_settings (
  id TEXT PRIMARY KEY,
  default_language TEXT NOT NULL,
  default_duration_seconds INTEGER NOT NULL,
  default_template TEXT NOT NULL,
  enabled_templates_json TEXT NOT NULL,
  default_cta TEXT NOT NULL,
  default_provider TEXT NOT NULL,
  max_estimated_cost_cents_per_video INTEGER NOT NULL,
  test_credit_balance_cents INTEGER NOT NULL,
  forbidden_words_json TEXT NOT NULL,
  exaggeration_rules_json TEXT NOT NULL,
  payment_methods_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
