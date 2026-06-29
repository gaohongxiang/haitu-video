import { createHmac, timingSafeEqual } from "node:crypto";

import type { DatabaseHandle } from "./db/client.js";
import { WalletRechargeOrderStore, normalizeCurrency, type WalletRechargeOrder } from "./walletRechargeOrderStore.js";
import { WalletStore } from "./walletStore.js";

const stripeApiBaseUrl = "https://api.stripe.com/v1";
const webhookSignatureToleranceSeconds = 300;

export interface StripeCheckoutSession {
  id: string;
  url: string;
  payment_intent?: string | null;
  expires_at?: number | null;
}

export interface StripePaymentConfig {
  secretKey: string;
  webhookSecret: string;
  currency: string;
  appUrl: string;
}

export interface StripeEvent {
  id: string;
  type: string;
  data?: {
    object?: unknown;
  };
}

interface StripeCheckoutSessionEventObject {
  id?: string;
  payment_status?: string;
  amount_total?: number;
  currency?: string;
  payment_intent?: string | null;
}

interface StripePaymentIntentEventObject {
  id?: string;
  last_payment_error?: {
    message?: string;
  };
}

export function stripePaymentConfigFromEnv(env: NodeJS.ProcessEnv = process.env): StripePaymentConfig {
  const secretKey = normalizeEnvText(env.STRIPE_SECRET_KEY);
  const webhookSecret = normalizeEnvText(env.STRIPE_WEBHOOK_SECRET);
  if (!secretKey) {
    throw new Error("请先配置 STRIPE_SECRET_KEY。");
  }
  if (!webhookSecret) {
    throw new Error("请先配置 STRIPE_WEBHOOK_SECRET。");
  }
  return {
    secretKey,
    webhookSecret,
    currency: normalizeCurrency(env.STRIPE_CURRENCY ?? "hkd"),
    appUrl: normalizeAppUrl(env.HAITU_PUBLIC_BASE_URL ?? env.BETTER_AUTH_URL)
  };
}

export async function createStripeCheckoutRechargeSession(input: {
  order: WalletRechargeOrder;
  config: StripePaymentConfig;
  fetchImpl?: typeof fetch;
}): Promise<StripeCheckoutSession> {
  const fetcher = input.fetchImpl ?? fetch;
  const successUrl = `${input.config.appUrl}/console?section=wallet&payment=stripe-success&orderId=${encodeURIComponent(input.order.id)}`;
  const cancelUrl = `${input.config.appUrl}/console?section=wallet&payment=stripe-cancel&orderId=${encodeURIComponent(input.order.id)}`;
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("currency", input.order.paymentCurrency);
  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl);
  params.set("client_reference_id", input.order.id);
  params.set("metadata[walletRechargeOrderId]", input.order.id);
  params.set("metadata[workspaceId]", input.order.workspaceId);
  params.set("metadata[walletCreditCents]", String(input.order.creditCents));
  params.set("metadata[walletCurrency]", input.order.walletCurrency);
  params.set("metadata[paymentCurrency]", input.order.paymentCurrency);
  params.set("metadata[paymentAmountCents]", String(input.order.paymentAmountCents));
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", input.order.paymentCurrency);
  params.set("line_items[0][price_data][unit_amount]", String(input.order.paymentAmountCents));
  params.set("line_items[0][price_data][product_data][name]", "嗨兔 AI 余额充值");
  params.set("line_items[0][price_data][product_data][description]", `到账余额 ${input.order.creditCny.toFixed(2)}`);
  let response: Response;
  try {
    response = await fetcher(`${stripeApiBaseUrl}/checkout/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.config.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": input.order.id
      },
      body: params.toString()
    });
  } catch (error) {
    throw new Error(`Stripe 支付订单请求失败，请稍后重试。原因: ${errorMessage(error)}`);
  }
  const body = await response.json().catch(() => ({})) as Partial<StripeCheckoutSession> & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(body.error?.message ?? "创建 Stripe 支付订单失败。");
  }
  if (!body.id || !body.url) {
    throw new Error("Stripe 未返回可用的支付链接。");
  }
  return {
    id: body.id,
    url: body.url,
    payment_intent: body.payment_intent ?? undefined,
    expires_at: body.expires_at ?? undefined
  };
}

export function constructStripeWebhookEvent(input: {
  rawBody: string;
  signatureHeader: string | null;
  webhookSecret: string;
  now?: () => Date;
}): StripeEvent {
  if (!input.signatureHeader) {
    throw new Error("缺少 Stripe webhook 签名。");
  }
  const timestamp = stripeSignaturePart(input.signatureHeader, "t");
  const signatures = stripeSignatureParts(input.signatureHeader, "v1");
  if (!timestamp || signatures.length === 0) {
    throw new Error("Stripe webhook 签名格式无效。");
  }
  assertWebhookTimestampWithinTolerance({
    timestamp,
    now: input.now,
    providerLabel: "Stripe webhook"
  });
  const signedPayload = `${timestamp}.${input.rawBody}`;
  const expected = createHmac("sha256", input.webhookSecret)
    .update(signedPayload)
    .digest("hex");
  if (!signatures.some((signature) => safeEqualHex(signature, expected))) {
    throw new Error("Stripe webhook 签名校验失败。");
  }
  const parsed = JSON.parse(input.rawBody) as Partial<StripeEvent>;
  if (!parsed.id || !parsed.type) {
    throw new Error("Stripe webhook 事件格式无效。");
  }
  return {
    id: parsed.id,
    type: parsed.type,
    data: parsed.data
  };
}

export function handleStripeWebhookEvent(input: {
  event: StripeEvent;
  handle: DatabaseHandle;
  now?: () => Date;
}): { received: true; duplicate?: true } {
  const orderStore = new WalletRechargeOrderStore({
    handle: input.handle,
    now: input.now
  });
  const processEvent = input.handle.sqlite.transaction(() => {
    const isFirstDelivery = orderStore.recordWebhookEvent({
      provider: "stripe",
      eventId: input.event.id,
      eventType: input.event.type,
      payload: input.event
    });
    if (!isFirstDelivery) {
      return { received: true as const, duplicate: true as const };
    }
    if (input.event.type === "checkout.session.completed") {
      const session = stripeCheckoutSessionObject(input.event);
      if (session.payment_status && session.payment_status !== "paid") {
        return { received: true as const };
      }
      handleCheckoutCompleted({
        event: input.event,
        orderStore,
        handle: input.handle,
        now: input.now
      });
    } else if (input.event.type === "checkout.session.async_payment_succeeded") {
      handleCheckoutCompleted({
        event: input.event,
        orderStore,
        handle: input.handle,
        now: input.now
      });
    } else if (input.event.type === "checkout.session.async_payment_failed") {
      const session = stripeCheckoutSessionObject(input.event);
      if (session.id) {
        orderStore.markFailedByProviderSession("stripe", session.id, "Stripe 异步支付失败");
      }
    } else if (input.event.type === "checkout.session.expired") {
      const session = stripeCheckoutSessionObject(input.event);
      if (session.id) {
        orderStore.markExpired("stripe", session.id);
      }
    } else if (input.event.type === "payment_intent.payment_failed") {
      const intent = stripePaymentIntentObject(input.event);
      if (intent.id) {
        orderStore.markFailedByPaymentIntent("stripe", intent.id, intent.last_payment_error?.message ?? "Stripe 支付失败");
      }
    }
    return { received: true as const };
  });
  return processEvent();
}

function handleCheckoutCompleted(input: {
  event: StripeEvent;
  orderStore: WalletRechargeOrderStore;
  handle: DatabaseHandle;
  now?: () => Date;
}): void {
  const session = stripeCheckoutSessionObject(input.event);
  if (!session.id) {
    throw new Error("Stripe checkout session 缺少 id。");
  }
  if (session.payment_status && session.payment_status !== "paid") {
    throw new Error("Stripe checkout session 尚未支付成功。");
  }
  const order = input.orderStore.findByProviderSessionId("stripe", session.id);
  if (!order) {
    throw new Error("Stripe 充值订单不存在。");
  }
  const amountTotal = Number(session.amount_total);
  if (amountTotal !== order.paymentAmountCents) {
    throw new Error("Stripe 充值金额不匹配。");
  }
  const currency = normalizeCurrency(session.currency);
  if (currency !== order.paymentCurrency) {
    throw new Error("Stripe 充值币种不匹配。");
  }
  if (order.status === "paid") {
    return;
  }
  if (order.status !== "pending") {
    throw new Error("Stripe 充值订单状态不允许入账。");
  }
  const walletStore = new WalletStore({
    handle: input.handle,
    workspaceId: order.workspaceId,
    now: input.now
  });
  walletStore.topUp({
    amountCny: order.creditCny,
    description: "Stripe 充值到账",
    metadata: {
      provider: "stripe",
      rechargeOrderId: order.id,
      stripeSessionId: session.id,
      stripePaymentIntentId: session.payment_intent ?? undefined,
      walletCurrency: order.walletCurrency,
      creditCents: order.creditCents,
      paymentCurrency: order.paymentCurrency,
      paymentAmountCents: order.paymentAmountCents,
      fxRateSnapshot: order.fxRateSnapshot
    }
  });
  input.orderStore.markPaid({
    orderId: order.id,
    providerPaymentIntentId: session.payment_intent ?? undefined
  });
}

function stripeCheckoutSessionObject(event: StripeEvent): StripeCheckoutSessionEventObject {
  const value = event.data?.object;
  return value && typeof value === "object" ? value as StripeCheckoutSessionEventObject : {};
}

function stripePaymentIntentObject(event: StripeEvent): StripePaymentIntentEventObject {
  const value = event.data?.object;
  return value && typeof value === "object" ? value as StripePaymentIntentEventObject : {};
}

function normalizeAppUrl(value: unknown): string {
  const text = normalizeEnvText(value);
  if (!text) {
    throw new Error("请先配置 BETTER_AUTH_URL 或 HAITU_PUBLIC_BASE_URL。");
  }
  return text.replace(/\/+$/, "");
}

function normalizeEnvText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stripeSignaturePart(header: string, key: string): string | undefined {
  return stripeSignatureParts(header, key)[0];
}

function stripeSignatureParts(header: string, key: string): string[] {
  return header
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${key}=`))
    .map((part) => part.slice(key.length + 1))
    .filter(Boolean);
}

function safeEqualHex(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function assertWebhookTimestampWithinTolerance(input: {
  timestamp: string;
  now?: () => Date;
  providerLabel: string;
}): void {
  if (!/^\d+$/.test(input.timestamp)) {
    throw new Error(`${input.providerLabel} 签名时间无效。`);
  }
  const timestampSeconds = Number(input.timestamp);
  const nowSeconds = Math.floor((input.now ?? (() => new Date()))().getTime() / 1000);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > webhookSignatureToleranceSeconds) {
    throw new Error(`${input.providerLabel} 签名时间超出允许范围。`);
  }
}
