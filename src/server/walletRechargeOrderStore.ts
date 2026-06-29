import { randomUUID } from "node:crypto";

import type { DatabaseHandle } from "./db/client.js";
import { centsToCny, cnyToCents } from "./walletLedger.js";
import type { RechargeFxRateSnapshot } from "./rechargePaymentAmount.js";

export type WalletRechargeOrderStatus = "pending" | "paid" | "expired" | "failed";
export type WalletRechargeProvider = "stripe" | "infini";

export interface WalletRechargeOrder {
  id: string;
  workspaceId: string;
  provider: WalletRechargeProvider;
  providerSessionId?: string;
  providerPaymentIntentId?: string;
  paymentAmount: number;
  paymentAmountCents: number;
  paymentCurrency: string;
  walletCurrency: "cny";
  creditCny: number;
  creditCents: number;
  fxRateSnapshot?: RechargeFxRateSnapshot;
  status: WalletRechargeOrderStatus;
  checkoutUrl?: string;
  failureReason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  expiresAt?: string;
}

interface WalletRechargeOrderRow {
  id: string;
  workspace_id: string;
  provider: WalletRechargeProvider;
  provider_session_id: string | null;
  provider_payment_intent_id: string | null;
  amount_cents: number;
  currency: string;
  credit_cents: number;
  status: WalletRechargeOrderStatus;
  checkout_url: string | null;
  failure_reason: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  expires_at: string | null;
}

export class WalletRechargeOrderStore {
  constructor(
    private readonly input: {
      handle: DatabaseHandle;
      now?: () => Date;
    }
  ) {}

  createPending(input: {
    workspaceId: string;
    creditCny: number;
    paymentCurrency: string;
    paymentAmountCents: number;
    fxRateSnapshot?: RechargeFxRateSnapshot;
    provider?: WalletRechargeProvider;
    metadata?: Record<string, unknown>;
  }): WalletRechargeOrder {
    const creditCents = cnyToCents(Number(input.creditCny));
    if (!Number.isFinite(creditCents) || creditCents <= 0) {
      throw new Error("充值金额必须大于 0。");
    }
    const paymentAmountCents = Math.round(Number(input.paymentAmountCents));
    if (!Number.isFinite(paymentAmountCents) || paymentAmountCents <= 0) {
      throw new Error("充值支付金额必须大于 0。");
    }
    const paymentCurrency = normalizeCurrency(input.paymentCurrency);
    const now = this.nowIso();
    const id = `wallet-recharge-${randomUUID()}`;
    const metadata = rechargeOrderMetadata({
      metadata: input.metadata,
      walletCurrency: "cny",
      paymentCurrency,
      paymentAmountCents,
      creditCents,
      fxRateSnapshot: input.fxRateSnapshot
    });
    this.input.handle.sqlite.prepare(`
      INSERT INTO wallet_recharge_orders (
        id,
        workspace_id,
        provider,
        amount_cents,
        currency,
        credit_cents,
        status,
        metadata_json,
        created_at,
        updated_at
      ) VALUES (
        @id,
        @workspaceId,
        @provider,
        @amountCents,
        @currency,
        @creditCents,
        'pending',
        @metadataJson,
        @createdAt,
        @updatedAt
      )
    `).run({
      id,
      workspaceId: input.workspaceId,
      provider: input.provider ?? "stripe",
      amountCents: paymentAmountCents,
      currency: paymentCurrency,
      creditCents,
      metadataJson: JSON.stringify(metadata),
      createdAt: now,
      updatedAt: now
    });
    return this.getById(id);
  }

  attachProviderSession(input: {
    orderId: string;
    providerSessionId: string;
    providerPaymentIntentId?: string;
    checkoutUrl: string;
    expiresAt?: string;
  }): WalletRechargeOrder {
    this.input.handle.sqlite.prepare(`
      UPDATE wallet_recharge_orders
      SET provider_session_id = @providerSessionId,
        provider_payment_intent_id = @providerPaymentIntentId,
        checkout_url = @checkoutUrl,
        expires_at = @expiresAt,
        updated_at = @updatedAt
      WHERE id = @orderId
    `).run({
      orderId: input.orderId,
      providerSessionId: input.providerSessionId,
      providerPaymentIntentId: input.providerPaymentIntentId ?? null,
      checkoutUrl: input.checkoutUrl,
      expiresAt: input.expiresAt ?? null,
      updatedAt: this.nowIso()
    });
    return this.getById(input.orderId);
  }

  findByProviderSessionId(provider: WalletRechargeProvider, providerSessionId: string): WalletRechargeOrder | undefined {
    const row = this.input.handle.sqlite.prepare(`
      SELECT *
      FROM wallet_recharge_orders
      WHERE provider = ? AND provider_session_id = ?
      LIMIT 1
    `).get(provider, providerSessionId) as WalletRechargeOrderRow | undefined;
    return row ? walletRechargeOrderFromRow(row) : undefined;
  }

  markPaid(input: {
    orderId: string;
    providerPaymentIntentId?: string;
  }): WalletRechargeOrder {
    const now = this.nowIso();
    this.input.handle.sqlite.prepare(`
      UPDATE wallet_recharge_orders
      SET status = 'paid',
        provider_payment_intent_id = COALESCE(@providerPaymentIntentId, provider_payment_intent_id),
        completed_at = COALESCE(completed_at, @completedAt),
        updated_at = @updatedAt
      WHERE id = @orderId
    `).run({
      orderId: input.orderId,
      providerPaymentIntentId: input.providerPaymentIntentId ?? null,
      completedAt: now,
      updatedAt: now
    });
    return this.getById(input.orderId);
  }

  markExpired(provider: WalletRechargeProvider, providerSessionId: string): WalletRechargeOrder | undefined {
    const now = this.nowIso();
    this.input.handle.sqlite.prepare(`
      UPDATE wallet_recharge_orders
      SET status = CASE WHEN status = 'pending' THEN 'expired' ELSE status END,
        updated_at = @updatedAt
      WHERE provider = @provider AND provider_session_id = @providerSessionId
    `).run({
      provider,
      providerSessionId,
      updatedAt: now
    });
    return this.findByProviderSessionId(provider, providerSessionId);
  }

  markFailedByPaymentIntent(provider: WalletRechargeProvider, paymentIntentId: string, reason: string): void {
    this.input.handle.sqlite.prepare(`
      UPDATE wallet_recharge_orders
      SET status = CASE WHEN status = 'pending' THEN 'failed' ELSE status END,
        failure_reason = @failureReason,
        updated_at = @updatedAt
      WHERE provider = @provider AND provider_payment_intent_id = @paymentIntentId
    `).run({
      provider,
      paymentIntentId,
      failureReason: reason,
      updatedAt: this.nowIso()
    });
  }

  markFailedByProviderSession(provider: WalletRechargeProvider, providerSessionId: string, reason: string): void {
    this.input.handle.sqlite.prepare(`
      UPDATE wallet_recharge_orders
      SET status = CASE WHEN status = 'pending' THEN 'failed' ELSE status END,
        failure_reason = @failureReason,
        updated_at = @updatedAt
      WHERE provider = @provider AND provider_session_id = @providerSessionId
    `).run({
      provider,
      providerSessionId,
      failureReason: reason,
      updatedAt: this.nowIso()
    });
  }

  markFailedById(orderId: string, reason: string): void {
    this.input.handle.sqlite.prepare(`
      UPDATE wallet_recharge_orders
      SET status = CASE WHEN status = 'pending' THEN 'failed' ELSE status END,
        failure_reason = @failureReason,
        updated_at = @updatedAt
      WHERE id = @orderId
    `).run({
      orderId,
      failureReason: reason,
      updatedAt: this.nowIso()
    });
  }

  recordWebhookEvent(input: {
    provider: WalletRechargeProvider;
    eventId: string;
    eventType: string;
    payload: unknown;
  }): boolean {
    const idempotencyKey = `${input.provider}:${input.eventId}`;
    try {
      this.input.handle.sqlite.prepare(`
        INSERT INTO payment_webhook_events (
          id,
          provider,
          event_type,
          processed_at,
          payload_json
        ) VALUES (
          @id,
          @provider,
          @eventType,
          @processedAt,
          @payloadJson
        )
      `).run({
        id: idempotencyKey,
        provider: input.provider,
        eventType: input.eventType,
        processedAt: this.nowIso(),
        payloadJson: JSON.stringify(input.payload)
      });
      return true;
    } catch (error) {
      if (isSqliteConstraint(error)) {
        return false;
      }
      throw error;
    }
  }

  getById(orderId: string): WalletRechargeOrder {
    const row = this.input.handle.sqlite.prepare(`
      SELECT *
      FROM wallet_recharge_orders
      WHERE id = ?
      LIMIT 1
    `).get(orderId) as WalletRechargeOrderRow | undefined;
    if (!row) {
      throw new Error("充值订单不存在。");
    }
    return walletRechargeOrderFromRow(row);
  }

  private nowIso(): string {
    return (this.input.now ?? (() => new Date()))().toISOString();
  }
}

export function walletRechargeOrderFromRow(row: WalletRechargeOrderRow): WalletRechargeOrder {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    provider: row.provider,
    providerSessionId: row.provider_session_id ?? undefined,
    providerPaymentIntentId: row.provider_payment_intent_id ?? undefined,
    paymentAmount: centsToCny(row.amount_cents),
    paymentAmountCents: row.amount_cents,
    paymentCurrency: row.currency,
    walletCurrency: "cny",
    creditCny: centsToCny(row.credit_cents),
    creditCents: row.credit_cents,
    fxRateSnapshot: fxRateSnapshotFromMetadata(row.metadata_json),
    status: row.status,
    checkoutUrl: row.checkout_url ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    metadata: parseMetadata(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    expiresAt: row.expires_at ?? undefined
  };
}

function rechargeOrderMetadata(input: {
  metadata?: Record<string, unknown>;
  walletCurrency: "cny";
  paymentCurrency: string;
  paymentAmountCents: number;
  creditCents: number;
  fxRateSnapshot?: RechargeFxRateSnapshot;
}): Record<string, unknown> {
  return {
    ...(input.metadata ?? {}),
    walletCurrency: input.walletCurrency,
    paymentCurrency: input.paymentCurrency,
    paymentAmountCents: input.paymentAmountCents,
    creditCents: input.creditCents,
    fxRateSnapshot: input.fxRateSnapshot
  };
}

function fxRateSnapshotFromMetadata(metadataJson: string | null): RechargeFxRateSnapshot | undefined {
  const metadata = parseMetadata(metadataJson);
  const snapshot = metadata?.fxRateSnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return undefined;
  }
  const record = snapshot as Partial<RechargeFxRateSnapshot>;
  return record.from === "cny" && typeof record.to === "string" && typeof record.rate === "number"
    ? {
        from: "cny",
        to: record.to,
        rate: record.rate
      }
    : undefined;
}

export function normalizeCurrency(value: unknown): string {
  const currency = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[a-z]{3}$/.test(currency)) {
    throw new Error("充值币种配置无效。");
  }
  return currency;
}

function parseMetadata(value: string | null): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function isSqliteConstraint(error: unknown): boolean {
  return error instanceof Error && "code" in error && String(error.code).startsWith("SQLITE_CONSTRAINT");
}
