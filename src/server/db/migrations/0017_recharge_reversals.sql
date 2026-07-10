ALTER TABLE wallet_recharge_orders ADD COLUMN reversed_credit_cents INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS wallet_recharge_orders_payment_intent_idx
ON wallet_recharge_orders(provider, provider_payment_intent_id);
