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

interface StripePaymentIntentDetailsResponse {
  id?: string;
  latest_charge?: string | StripeChargeDetails | null;
  error?: { message?: string };
}

interface StripeChargeDetails {
  id?: string;
  payment_method?: string | null;
  payment_method_details?: StripePaymentMethodDetails | null;
}

interface StripePaymentMethodDetails {
  type?: string;
  card?: {
    brand?: string;
    last4?: string;
    wallet?: {
      type?: string;
    } | null;
  };
}

interface StripeResolvedPaymentMethod {
  provider: "stripe";
  type: string;
  label: string;
  stripeChargeId?: string;
  stripePaymentMethodId?: string;
  cardBrand?: string;
  cardLast4?: string;
  cardWallet?: string;
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
    currency: normalizeCurrency(normalizeEnvText(env.STRIPE_CURRENCY) || "cny"),
    appUrl: normalizeAppUrl(env.HAITU_PUBLIC_BASE_URL ?? env.BETTER_AUTH_URL)
  };
}

export async function createStripeCheckoutRechargeSession(input: {
  order: WalletRechargeOrder;
  config: StripePaymentConfig;
  checkoutExpiresInSeconds: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
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
  params.set("line_items[0][price_data][product_data][description]", `到账金额 ${input.order.creditCny.toFixed(2)}`);
  params.set("expires_at", String(Math.floor((input.now ?? (() => new Date()))().getTime() / 1000) + input.checkoutExpiresInSeconds));
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
  if (!body.expires_at) {
    throw new Error("Stripe 未返回订单过期时间。");
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

export async function handleStripeWebhookEvent(input: {
  event: StripeEvent;
  config: StripePaymentConfig;
  handle: DatabaseHandle;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): Promise<{ received: true; duplicate?: true }> {
  const paymentMethod = await resolveStripePaymentMethodForEvent({
    event: input.event,
    config: input.config,
    fetchImpl: input.fetchImpl
  });
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
        paymentMethod,
        now: input.now
      });
    } else if (input.event.type === "checkout.session.async_payment_succeeded") {
      handleCheckoutCompleted({
        event: input.event,
        orderStore,
        handle: input.handle,
        paymentMethod,
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
  paymentMethod?: StripeResolvedPaymentMethod;
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
  const paymentMetadata = {
    paymentMethodProvider: input.paymentMethod?.provider,
    paymentMethodType: input.paymentMethod?.type,
    paymentMethodLabel: input.paymentMethod?.label,
    stripePaymentMethodId: input.paymentMethod?.stripePaymentMethodId,
    cardBrand: input.paymentMethod?.cardBrand,
    cardLast4: input.paymentMethod?.cardLast4,
    cardWallet: input.paymentMethod?.cardWallet
  };
  walletStore.topUp({
    amountCny: order.creditCny,
    description: stripeRechargeDescription(input.paymentMethod),
    metadata: {
      provider: "stripe",
      rechargeOrderId: order.id,
      stripeSessionId: session.id,
      stripePaymentIntentId: session.payment_intent ?? undefined,
      stripeChargeId: input.paymentMethod?.stripeChargeId,
      walletCurrency: order.walletCurrency,
      creditCents: order.creditCents,
      paymentCurrency: order.paymentCurrency,
      paymentAmountCents: order.paymentAmountCents,
      fxRateSnapshot: order.fxRateSnapshot,
      ...paymentMetadata
    }
  });
  input.orderStore.markPaid({
    orderId: order.id,
    providerPaymentIntentId: session.payment_intent ?? undefined,
    metadata: {
      stripeSessionId: session.id,
      stripePaymentIntentId: session.payment_intent ?? undefined,
      stripeChargeId: input.paymentMethod?.stripeChargeId,
      ...paymentMetadata
    }
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

async function resolveStripePaymentMethodForEvent(input: {
  event: StripeEvent;
  config: StripePaymentConfig;
  fetchImpl?: typeof fetch;
}): Promise<StripeResolvedPaymentMethod | undefined> {
  if (input.event.type !== "checkout.session.completed" && input.event.type !== "checkout.session.async_payment_succeeded") {
    return undefined;
  }
  const session = stripeCheckoutSessionObject(input.event);
  if (input.event.type === "checkout.session.completed" && session.payment_status && session.payment_status !== "paid") {
    return undefined;
  }
  const paymentIntentId = normalizeOptionalText(session.payment_intent);
  if (!paymentIntentId) {
    return undefined;
  }
  try {
    const intent = await retrieveStripePaymentIntentDetails({
      paymentIntentId,
      config: input.config,
      fetchImpl: input.fetchImpl
    });
    return stripePaymentMethodFromIntent(intent);
  } catch {
    return undefined;
  }
}

async function retrieveStripePaymentIntentDetails(input: {
  paymentIntentId: string;
  config: StripePaymentConfig;
  fetchImpl?: typeof fetch;
}): Promise<StripePaymentIntentDetailsResponse> {
  const fetcher = input.fetchImpl ?? fetch;
  const params = new URLSearchParams();
  params.append("expand[]", "latest_charge");
  const response = await fetcher(`${stripeApiBaseUrl}/payment_intents/${encodeURIComponent(input.paymentIntentId)}?${params.toString()}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${input.config.secretKey}`
    }
  });
  const body = await response.json().catch(() => ({})) as StripePaymentIntentDetailsResponse;
  if (!response.ok) {
    throw new Error(body.error?.message ?? "查询 Stripe 支付方式失败。");
  }
  return body;
}

function stripePaymentMethodFromIntent(intent: StripePaymentIntentDetailsResponse): StripeResolvedPaymentMethod | undefined {
  const charge = isPlainObject(intent.latest_charge) ? intent.latest_charge as StripeChargeDetails : undefined;
  const details = charge?.payment_method_details ?? undefined;
  const type = normalizeOptionalText(details?.type);
  if (!type) {
    return undefined;
  }
  const cardBrand = normalizeOptionalText(details?.card?.brand);
  const cardLast4 = normalizeOptionalText(details?.card?.last4);
  const cardWallet = normalizeOptionalText(details?.card?.wallet?.type);
  return {
    provider: "stripe",
    type,
    label: stripePaymentMethodLabel({
      type,
      cardBrand,
      cardLast4,
      cardWallet
    }),
    stripeChargeId: normalizeOptionalText(charge?.id),
    stripePaymentMethodId: normalizeOptionalText(charge?.payment_method),
    cardBrand,
    cardLast4,
    cardWallet
  };
}

function stripeRechargeDescription(paymentMethod: StripeResolvedPaymentMethod | undefined): string {
  return paymentMethod?.label ? `Stripe ${paymentMethod.label} 充值到账` : "Stripe 充值到账";
}

function stripePaymentMethodLabel(input: {
  type: string;
  cardBrand?: string;
  cardLast4?: string;
  cardWallet?: string;
}): string {
  if (input.type === "card") {
    const parts = [
      stripeWalletLabel(input.cardWallet),
      stripeCardBrandLabel(input.cardBrand) ?? "银行卡",
      input.cardLast4 ? `尾号 ${input.cardLast4}` : undefined
    ].filter(Boolean);
    return parts.join(" ");
  }
  return stripePaymentTypeLabel(input.type);
}

function stripePaymentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    alipay: "支付宝",
    wechat_pay: "微信支付",
    link: "Link",
    paypal: "PayPal",
    cashapp: "Cash App Pay",
    customer_balance: "余额支付",
    us_bank_account: "银行账户",
    card: "银行卡"
  };
  return labels[type] ?? type;
}

function stripeCardBrandLabel(brand: string | undefined): string | undefined {
  if (!brand) {
    return undefined;
  }
  const labels: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "American Express",
    discover: "Discover",
    diners: "Diners Club",
    jcb: "JCB",
    unionpay: "UnionPay"
  };
  return labels[brand.toLowerCase()] ?? brand;
}

function stripeWalletLabel(wallet: string | undefined): string | undefined {
  if (!wallet) {
    return undefined;
  }
  const labels: Record<string, string> = {
    apple_pay: "Apple Pay",
    google_pay: "Google Pay",
    samsung_pay: "Samsung Pay",
    link: "Link"
  };
  return labels[wallet.toLowerCase()] ?? wallet;
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

function normalizeOptionalText(value: unknown): string | undefined {
  const text = normalizeEnvText(value);
  return text || undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
