import type { DatabaseHandle } from "./db/client.js";
import { centsToCny, cnyToCents } from "./walletLedger.js";

export type BillingUsageKind = "text" | "image" | "video";
export type BillingPolicyMode = "metered_generation";

export interface BillingPolicy {
  policyId: string;
  mode: BillingPolicyMode;
  label: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BillingPriceRule {
  ruleId: string;
  policyId: string;
  usageKind: BillingUsageKind;
  serviceFeeCny: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BillingPolicySettings {
  policy: BillingPolicy;
  rules: BillingPriceRule[];
}

export interface BillingPriceRuleUpdate {
  usageKind?: unknown;
  serviceFeeCny?: unknown;
  enabled?: unknown;
}

interface BillingPolicyRow {
  id: string;
  mode: string;
  label: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

interface BillingPriceRuleRow {
  id: string;
  policy_id: string;
  usage_kind: string;
  service_fee_cents: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

const meteredPolicyId = "metered-generation";

const defaultRules: Array<{
  usageKind: BillingUsageKind;
  serviceFeeCny: number;
}> = [
  {
    usageKind: "text",
    serviceFeeCny: 0.2
  },
  {
    usageKind: "image",
    serviceFeeCny: 0.3
  },
  {
    usageKind: "video",
    serviceFeeCny: 1
  }
];

export class BillingPolicyStore {
  constructor(
    private readonly input: {
      handle: DatabaseHandle;
      now?: () => Date;
    }
  ) {}

  getSettings(): BillingPolicySettings {
    this.ensureDefaults();
    const policy = this.findPolicy();
    if (!policy) {
      throw new Error("计费策略初始化失败。");
    }
    return {
      policy: billingPolicyFromRow(policy),
      rules: this.listRules().map(billingPriceRuleFromRow)
    };
  }

  getRule(usageKind: BillingUsageKind): BillingPriceRule {
    const rule = this.getSettings().rules.find((item) => item.usageKind === usageKind && item.enabled);
    if (!rule) {
      throw new Error(`计费规则未启用：${usageKind}`);
    }
    return rule;
  }

  updateSettings(input: {
    rules?: BillingPriceRuleUpdate[];
  }): BillingPolicySettings {
    this.ensureDefaults();
    const updates = new Map(
      (input.rules ?? [])
        .map(normalizeRuleUpdate)
        .filter((rule): rule is NormalizedRuleUpdate => rule !== undefined)
        .map((rule) => [rule.usageKind, rule])
    );
    const now = this.nowIso();
    const updateRule = this.input.handle.sqlite.prepare(`
      UPDATE billing_price_rules
      SET
        service_fee_cents = @serviceFeeCents,
        enabled = @enabled,
        updated_at = @updatedAt
      WHERE policy_id = @policyId AND usage_kind = @usageKind
    `);
    const transaction = this.input.handle.sqlite.transaction(() => {
      for (const fallback of defaultRules) {
        const update = updates.get(fallback.usageKind);
        if (!update) {
          continue;
        }
        updateRule.run({
          policyId: meteredPolicyId,
          usageKind: update.usageKind,
          serviceFeeCents: cnyToCents(update.serviceFeeCny),
          enabled: update.enabled ? 1 : 0,
          updatedAt: now
        });
      }
    });
    transaction();
    return this.getSettings();
  }

  private ensureDefaults(): void {
    const now = this.nowIso();
    const transaction = this.input.handle.sqlite.transaction(() => {
      this.input.handle.sqlite.prepare(`
        INSERT INTO billing_policies (
          id,
          mode,
          label,
          enabled,
          created_at,
          updated_at
        ) VALUES (
          @id,
          'metered_generation',
          '按次生成计费',
          1,
          @now,
          @now
        )
        ON CONFLICT(id) DO NOTHING
      `).run({
        id: meteredPolicyId,
        now
      });
      const insertRule = this.input.handle.sqlite.prepare(`
        INSERT INTO billing_price_rules (
          id,
          policy_id,
          usage_kind,
          service_fee_cents,
          enabled,
          created_at,
          updated_at
        ) VALUES (
          @id,
          @policyId,
          @usageKind,
          @serviceFeeCents,
          1,
          @now,
          @now
        )
        ON CONFLICT(policy_id, usage_kind) DO NOTHING
      `);
      for (const rule of defaultRules) {
        insertRule.run({
          id: `${meteredPolicyId}:${rule.usageKind}`,
          policyId: meteredPolicyId,
          usageKind: rule.usageKind,
          serviceFeeCents: cnyToCents(rule.serviceFeeCny),
          now
        });
      }
    });
    transaction();
  }

  private findPolicy(): BillingPolicyRow | undefined {
    return this.input.handle.sqlite.prepare(`
      SELECT *
      FROM billing_policies
      WHERE id = ?
      LIMIT 1
    `).get(meteredPolicyId) as BillingPolicyRow | undefined;
  }

  private listRules(): BillingPriceRuleRow[] {
    return this.input.handle.sqlite.prepare(`
      SELECT *
      FROM billing_price_rules
      WHERE policy_id = ?
      ORDER BY
        CASE usage_kind
          WHEN 'text' THEN 0
          WHEN 'image' THEN 1
          WHEN 'video' THEN 2
          ELSE 3
        END ASC
    `).all(meteredPolicyId) as BillingPriceRuleRow[];
  }

  private nowIso(): string {
    return (this.input.now ?? (() => new Date()))().toISOString();
  }
}

interface NormalizedRuleUpdate {
  usageKind: BillingUsageKind;
  serviceFeeCny: number;
  enabled: boolean;
}

function normalizeRuleUpdate(input: BillingPriceRuleUpdate): NormalizedRuleUpdate | undefined {
  if (!isBillingUsageKind(input.usageKind)) {
    return undefined;
  }
  const fallback = defaultRules.find((rule) => rule.usageKind === input.usageKind);
  if (!fallback) {
    return undefined;
  }
  return {
    usageKind: input.usageKind,
    serviceFeeCny: normalizeMoney(input.serviceFeeCny, fallback.serviceFeeCny),
    enabled: typeof input.enabled === "boolean" ? input.enabled : true
  };
}

function billingPolicyFromRow(row: BillingPolicyRow): BillingPolicy {
  return {
    policyId: row.id,
    mode: "metered_generation",
    label: row.label,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function billingPriceRuleFromRow(row: BillingPriceRuleRow): BillingPriceRule {
  return {
    ruleId: row.id,
    policyId: row.policy_id,
    usageKind: normalizeUsageKind(row.usage_kind),
    serviceFeeCny: centsToCny(row.service_fee_cents),
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeUsageKind(value: string): BillingUsageKind {
  if (isBillingUsageKind(value)) {
    return value;
  }
  throw new Error(`Unknown billing usage kind: ${value}`);
}

function isBillingUsageKind(value: unknown): value is BillingUsageKind {
  return value === "text" || value === "image" || value === "video";
}

function normalizeMoney(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100000) {
    return fallback;
  }
  return Math.round(parsed * 100) / 100;
}
