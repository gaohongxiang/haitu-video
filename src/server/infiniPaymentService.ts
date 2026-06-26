import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { DatabaseHandle } from "./db/client.js";
import { WalletRechargeOrderStore, normalizeCurrency, type WalletRechargeOrder } from "./walletRechargeOrderStore.js";
import { WalletStore } from "./walletStore.js";

const infiniProductionApiBaseUrl = "https://openapi.infini.money";
const infiniSandboxApiBaseUrl = "https://openapi-sandbox.infini.money";
const webhookSignatureToleranceSeconds = 1200;

export interface InfiniPaymentConfig {
  keyId: string;
  secretKey: string;
  webhookSecret: string;
  apiBaseUrl: string;
  currency: string;
  appUrl: string;
  merchantAlias: string;
}

export interface InfiniCreateOrderResponse {
  order_id: string;
  request_id?: string;
  checkout_url: string;
  client_reference?: string;
  expires_at?: number;
}

interface InfiniCreateOrderResponseBody extends Partial<InfiniCreateOrderResponse> {
  checkoutUrl?: string;
  data?: Partial<InfiniCreateOrderResponse> & {
    checkoutUrl?: string;
  };
  error?: { message?: string };
  message?: string;
}

export interface InfiniOrderStatus {
  orderId: string;
  clientReference?: string;
  amount?: string | number;
  currency?: string;
  status?: string;
  amountConfirmed?: string | number;
  amountConfirming?: string | number;
  raw: Record<string, unknown>;
}

interface InfiniOrderStatusResponseBody {
  code?: number;
  data?: Record<string, unknown>;
  error?: { message?: string };
  message?: string;
}

export interface InfiniWebhookEvent {
  id: string;
  type: string;
  orderId?: string;
  clientReference?: string;
  amount?: string | number;
  currency?: string;
  status?: string;
  amountConfirmed?: string | number;
  amountConfirming?: string | number;
  raw: Record<string, unknown>;
}

export function infiniPaymentConfigFromEnv(env: NodeJS.ProcessEnv = process.env): InfiniPaymentConfig {
  const keyId = normalizeEnvText(env.INFINI_PUBLIC_KEY) || normalizeEnvText(env.INFINI_KEY_ID);
  const secretKey = normalizeEnvText(env.INFINI_PRIVATE_KEY) || normalizeEnvText(env.INFINI_SECRET_KEY);
  const webhookSecret = normalizeEnvText(env.INFINI_WEBHOOK_SECRET);
  if (!keyId) {
    throw new Error("请先配置 INFINI_PUBLIC_KEY。");
  }
  if (!secretKey) {
    throw new Error("请先配置 INFINI_PRIVATE_KEY。");
  }
  if (!webhookSecret) {
    throw new Error("请先配置 INFINI_WEBHOOK_SECRET。");
  }
  return {
    keyId,
    secretKey,
    webhookSecret,
    apiBaseUrl: normalizeInfiniApiBaseUrl(env),
    currency: normalizeCurrency(env.INFINI_CURRENCY ?? "hkd"),
    appUrl: normalizeAppUrl(env.HAITU_PUBLIC_BASE_URL ?? env.BETTER_AUTH_URL),
    merchantAlias: normalizeEnvText(env.INFINI_MERCHANT_ALIAS) || "Haitu"
  };
}

export async function createInfiniCheckoutRechargeSession(input: {
  order: WalletRechargeOrder;
  config: InfiniPaymentConfig;
  fetchImpl?: typeof fetch;
}): Promise<InfiniCreateOrderResponse> {
  const fetcher = input.fetchImpl ?? fetch;
  const path = "/v1/acquiring/order";
  const body = JSON.stringify({
    amount: input.order.amountCny.toFixed(2),
    request_id: input.order.id,
    client_reference: input.order.id,
    order_desc: "Haitu 余额充值",
    expires_in: 3600,
    merchant_alias: input.config.merchantAlias,
    success_url: `${input.config.appUrl}/?section=wallet&payment=infini-success&orderId=${encodeURIComponent(input.order.id)}`,
    failure_url: `${input.config.appUrl}/?section=wallet&payment=infini-cancel&orderId=${encodeURIComponent(input.order.id)}`,
    pay_methods: [1],
    currency: input.order.currency.toUpperCase()
  });
  let response: Response;
  try {
    response = await fetcher(`${input.config.apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        ...infiniSignedHeaders({
          keyId: input.config.keyId,
          secretKey: input.config.secretKey,
          method: "POST",
          path,
          body
        }),
        "content-type": "application/json"
      },
      body
    });
  } catch (error) {
    throw new Error(`Infini 支付订单请求失败，请稍后重试。原因: ${errorMessage(error)}`);
  }
  const responseBody = await response.json().catch(() => ({})) as InfiniCreateOrderResponseBody;
  if (!response.ok) {
    throw new Error(responseBody.error?.message ?? responseBody.message ?? "创建 Infini 支付订单失败。");
  }
  const orderResponse = normalizeInfiniCreateOrderResponse(responseBody);
  if (!orderResponse.order_id || !orderResponse.checkout_url) {
    console.warn("Infini checkout response missing payment link", {
      topLevelKeys: Object.keys(responseBody),
      dataKeys: isPlainObject(responseBody.data) ? Object.keys(responseBody.data) : undefined
    });
    throw new Error("Infini 未返回可用的支付链接。");
  }
  return {
    order_id: orderResponse.order_id,
    request_id: orderResponse.request_id,
    checkout_url: orderResponse.checkout_url,
    client_reference: orderResponse.client_reference,
    expires_at: orderResponse.expires_at
  };
}

export async function queryInfiniCheckoutRechargeOrder(input: {
  orderId: string;
  config: InfiniPaymentConfig;
  fetchImpl?: typeof fetch;
}): Promise<InfiniOrderStatus> {
  const fetcher = input.fetchImpl ?? fetch;
  const path = `/v1/acquiring/order?order_id=${encodeURIComponent(input.orderId)}`;
  let response: Response;
  try {
    response = await fetcher(`${input.config.apiBaseUrl}${path}`, {
      method: "GET",
      headers: infiniSignedHeaders({
        keyId: input.config.keyId,
        secretKey: input.config.secretKey,
        method: "GET",
        path
      })
    });
  } catch (error) {
    throw new Error(`Infini 订单状态查询失败，请稍后重试。原因: ${errorMessage(error)}`);
  }
  const responseBody = await response.json().catch(() => ({})) as InfiniOrderStatusResponseBody;
  if (!response.ok || (typeof responseBody.code === "number" && responseBody.code !== 0)) {
    throw new Error(responseBody.error?.message ?? responseBody.message ?? "查询 Infini 订单状态失败。");
  }
  const orderStatus = normalizeInfiniOrderStatus(responseBody);
  if (!orderStatus.orderId) {
    throw new Error("Infini 未返回有效订单状态。");
  }
  return orderStatus as InfiniOrderStatus;
}

export async function syncInfiniCheckoutRechargeOrder(input: {
  orderId: string;
  config: InfiniPaymentConfig;
  handle: DatabaseHandle;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): Promise<{ synced: boolean; order: WalletRechargeOrder }> {
  const orderStore = new WalletRechargeOrderStore({
    handle: input.handle,
    now: input.now
  });
  const order = orderStore.getById(input.orderId);
  if (order.provider !== "infini") {
    throw new Error("该充值订单不是 Infini 订单。");
  }
  if (!order.providerSessionId) {
    throw new Error("Infini 充值订单缺少平台订单号。");
  }
  if (order.status !== "pending") {
    return {
      synced: false,
      order
    };
  }
  const status = await queryInfiniCheckoutRechargeOrder({
    orderId: order.providerSessionId,
    config: input.config,
    fetchImpl: input.fetchImpl
  });
  if (status.clientReference && status.clientReference !== order.id) {
    throw new Error("Infini 订单归属不匹配。");
  }
  if (isInfiniExpiredStatus(status.status)) {
    const expiredOrder = orderStore.markExpired("infini", order.providerSessionId) ?? orderStore.getById(order.id);
    return {
      synced: false,
      order: expiredOrder
    };
  }
  if (!isInfiniPaidStatus(status.status)) {
    return {
      synced: false,
      order: orderStore.getById(order.id)
    };
  }
  const eventId = `infini-sync-${status.orderId}-${normalizeOptionalText(status.raw.updated_at) ?? "latest"}`;
  const syncPaidOrder = input.handle.sqlite.transaction(() => {
    const currentOrder = orderStore.getById(order.id);
    if (currentOrder.status === "paid") {
      return {
        synced: false,
        order: currentOrder
      };
    }
    const isFirstSyncEvent = orderStore.recordWebhookEvent({
      provider: "infini",
      eventId,
      eventType: "order.sync.paid",
      payload: {
        ...status.raw,
        sync_source: "order_status_query"
      }
    });
    if (!isFirstSyncEvent) {
      return {
        synced: false,
        order: orderStore.getById(order.id)
      };
    }
    handleInfiniOrderCompleted({
      event: {
        id: eventId,
        type: "order.completed",
        orderId: status.orderId,
        clientReference: status.clientReference,
        amount: status.amount,
        currency: status.currency,
        status: status.status,
        amountConfirmed: status.amountConfirmed,
        amountConfirming: status.amountConfirming,
        raw: status.raw
      },
      orderStore,
      handle: input.handle,
      now: input.now
    });
    return {
      synced: true,
      order: orderStore.getById(order.id)
    };
  });
  return syncPaidOrder();
}

function normalizeInfiniCreateOrderResponse(responseBody: InfiniCreateOrderResponseBody): Partial<InfiniCreateOrderResponse> {
  const body = responseBody.data ?? responseBody;
  return {
    order_id: body.order_id,
    request_id: body.request_id,
    checkout_url: body.checkout_url ?? body.checkoutUrl,
    client_reference: body.client_reference,
    expires_at: body.expires_at
  };
}

function normalizeInfiniOrderStatus(responseBody: InfiniOrderStatusResponseBody): Partial<InfiniOrderStatus> {
  const body = isPlainObject(responseBody.data) ? responseBody.data : responseBody as Record<string, unknown>;
  return {
    orderId: normalizeOptionalText(body.order_id),
    clientReference: normalizeOptionalText(body.client_reference),
    amount: normalizeOptionalAmount(body.order_amount) ?? normalizeOptionalAmount(body.amount),
    currency: normalizeOptionalText(body.order_currency) ?? normalizeOptionalText(body.currency),
    status: normalizeOptionalText(body.status),
    amountConfirmed: normalizeOptionalAmount(body.amount_confirmed),
    amountConfirming: normalizeOptionalAmount(body.amount_confirming),
    raw: body
  };
}

function isInfiniPaidStatus(status: string | undefined): boolean {
  const normalized = normalizeOptionalText(status)?.toLowerCase();
  return normalized === "paid" || normalized === "completed" || normalized === "succeeded";
}

function isInfiniExpiredStatus(status: string | undefined): boolean {
  const normalized = normalizeOptionalText(status)?.toLowerCase();
  return normalized === "expired" || normalized === "cancelled" || normalized === "canceled";
}

export function infiniSignedHeaders(input: {
  keyId: string;
  secretKey: string;
  method: string;
  path: string;
  body?: string;
  date?: string;
}): Record<string, string> {
  const date = input.date ?? new Date().toUTCString();
  const signingString = `${input.keyId}\n${input.method.toUpperCase()} ${input.path}\ndate: ${date}\n`;
  const signature = createHmac("sha256", input.secretKey)
    .update(signingString)
    .digest("base64");
  const headers: Record<string, string> = {
    Date: date,
    Authorization: `Signature keyId="${input.keyId}",algorithm="hmac-sha256",headers="@request-target date",signature="${signature}"`
  };
  if (input.body !== undefined) {
    headers.Digest = `SHA-256=${createHash("sha256").update(input.body, "utf8").digest("base64")}`;
  }
  return headers;
}

export function constructInfiniWebhookEvent(input: {
  rawBody: string;
  headers: Headers;
  webhookSecret: string;
  now?: () => Date;
}): InfiniWebhookEvent {
  const eventId = input.headers.get("x-webhook-event-id")?.trim();
  const timestamp = input.headers.get("x-webhook-timestamp")?.trim();
  const signature = input.headers.get("x-webhook-signature")?.trim();
  if (!eventId) {
    throw new Error("缺少 Infini webhook 事件 ID。");
  }
  if (!timestamp || !signature) {
    throw new Error("缺少 Infini webhook 签名。");
  }
  assertWebhookTimestampWithinTolerance({
    timestamp,
    now: input.now,
    providerLabel: "Infini webhook"
  });
  const expected = createHmac("sha256", input.webhookSecret)
    .update(`${timestamp}.${eventId}.${input.rawBody}`)
    .digest("hex");
  if (!safeEqualSignature(signature, expected)) {
    throw new Error("Infini webhook 签名校验失败。");
  }
  const parsed = JSON.parse(input.rawBody) as Record<string, unknown>;
  const eventType = typeof parsed.event === "string" ? parsed.event : "";
  if (!eventType) {
    throw new Error("Infini webhook 事件格式无效。");
  }
  return {
    id: eventId,
    type: eventType,
    orderId: normalizeOptionalText(parsed.order_id),
    clientReference: normalizeOptionalText(parsed.client_reference),
    amount: parsed.amount as string | number | undefined,
    currency: normalizeOptionalText(parsed.currency),
    status: normalizeOptionalText(parsed.status),
    amountConfirmed: parsed.amount_confirmed as string | number | undefined,
    amountConfirming: parsed.amount_confirming as string | number | undefined,
    raw: parsed
  };
}

export function handleInfiniWebhookEvent(input: {
  event: InfiniWebhookEvent;
  handle: DatabaseHandle;
  now?: () => Date;
}): { received: true; duplicate?: true } {
  const orderStore = new WalletRechargeOrderStore({
    handle: input.handle,
    now: input.now
  });
  const processEvent = input.handle.sqlite.transaction(() => {
    const isFirstDelivery = orderStore.recordWebhookEvent({
      provider: "infini",
      eventId: input.event.id,
      eventType: input.event.type,
      payload: input.event.raw
    });
    if (!isFirstDelivery) {
      return { received: true as const, duplicate: true as const };
    }
    if (input.event.type === "order.completed" || input.event.status === "paid") {
      handleInfiniOrderCompleted({
        event: input.event,
        orderStore,
        handle: input.handle,
        now: input.now
      });
    } else if (input.event.type === "order.late_payment") {
      if (input.event.orderId) {
        orderStore.markFailedByProviderSession("infini", input.event.orderId, "Infini 订单超时后收到付款，请后台人工确认");
      }
    } else if (input.event.type === "order.expired" || input.event.status === "expired") {
      if (input.event.orderId) {
        orderStore.markExpired("infini", input.event.orderId);
      }
    }
    return { received: true as const };
  });
  return processEvent();
}

function handleInfiniOrderCompleted(input: {
  event: InfiniWebhookEvent;
  orderStore: WalletRechargeOrderStore;
  handle: DatabaseHandle;
  now?: () => Date;
}): void {
  if (!input.event.orderId) {
    throw new Error("Infini webhook 缺少 order_id。");
  }
  const order = input.orderStore.findByProviderSessionId("infini", input.event.orderId);
  if (!order) {
    throw new Error("Infini 充值订单不存在。");
  }
  const amountCents = decimalAmountToCents(input.event.amount);
  if (!Number.isFinite(amountCents) || amountCents !== order.amountCents) {
    throw new Error("Infini 充值金额不匹配。");
  }
  const currency = normalizeCurrency(input.event.currency);
  if (currency !== order.currency) {
    throw new Error("Infini 充值币种不匹配。");
  }
  if (order.status === "paid") {
    return;
  }
  if (order.status !== "pending") {
    throw new Error("Infini 充值订单状态不允许入账。");
  }
  const walletStore = new WalletStore({
    handle: input.handle,
    workspaceId: order.workspaceId,
    now: input.now
  });
  walletStore.topUp({
    amountCny: order.creditCny,
    description: "Infini 数字货币充值到账",
    metadata: {
      provider: "infini",
      rechargeOrderId: order.id,
      infiniOrderId: input.event.orderId,
      currency: order.currency,
      amountCents: order.amountCents,
      amountConfirmed: input.event.amountConfirmed,
      amountConfirming: input.event.amountConfirming
    }
  });
  input.orderStore.markPaid({
    orderId: order.id,
    providerPaymentIntentId: input.event.orderId
  });
}

function normalizeInfiniApiBaseUrl(env: NodeJS.ProcessEnv): string {
  const explicit = normalizeEnvText(env.INFINI_API_BASE_URL);
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }
  return normalizeEnvText(env.INFINI_ENV).toLowerCase() === "production"
    ? infiniProductionApiBaseUrl
    : infiniSandboxApiBaseUrl;
}

function normalizeAppUrl(value: unknown): string {
  const text = normalizeEnvText(value);
  if (!text) {
    throw new Error("请先配置 BETTER_AUTH_URL 或 HAITU_PUBLIC_BASE_URL。");
  }
  return text.replace(/\/+$/, "");
}

function normalizeOptionalText(value: unknown): string | undefined {
  const text = normalizeEnvText(value);
  return text || undefined;
}

function normalizeOptionalAmount(value: unknown): string | number | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function normalizeEnvText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeEqualSignature(actual: string, expected: string): boolean {
  const normalizedActual = actual.startsWith("sha256=") ? actual.slice("sha256=".length) : actual;
  const actualBuffer = Buffer.from(normalizedActual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function decimalAmountToCents(value: string | number | undefined): number {
  if (typeof value !== "string" && typeof value !== "number") {
    return Number.NaN;
  }
  const text = String(value).trim();
  const match = /^([0-9]+)(?:\.([0-9]{1,2}))?$/.exec(text);
  if (!match) {
    return Number.NaN;
  }
  const whole = Number(match[1]);
  const decimal = (match[2] ?? "").padEnd(2, "0");
  const cents = whole * 100 + Number(decimal);
  return Number.isSafeInteger(cents) ? cents : Number.NaN;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
