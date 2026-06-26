import type { FileAuditLog } from "./auditLog.js";
import { jsonResponse } from "./consoleHttpService.js";
import type { FileConsoleSettingsStore } from "./consoleSettings.js";
import type { ConsoleRequestContext } from "./consoleWorkspaceRuntime.js";
import {
  assertPaymentMethodCanCreateRechargeOrder
} from "./paymentMethodService.js";
import {
  createStripeCheckoutRechargeSession,
  stripePaymentConfigFromEnv
} from "./stripePaymentService.js";
import {
  createInfiniCheckoutRechargeSession,
  infiniPaymentConfigFromEnv,
  syncInfiniCheckoutRechargeOrder
} from "./infiniPaymentService.js";
import { WalletRechargeOrderStore } from "./walletRechargeOrderStore.js";
import {
  assertModelBundleConfigsExist,
  assertModelServicePreferenceBundlesExist
} from "./modelBundleValidationService.js";
import type { ModelBundleInput } from "./modelBundleStore.js";
import {
  normalizeServiceMode,
  type ModelServicePreference
} from "./modelServicePreferenceStore.js";
import { ensurePlatformBundles } from "./platformModelProvisioning.js";

interface WalletTopUpRequest {
  amountCny?: number;
  description?: string;
}

interface WalletRechargeOrderRequest {
  amountCny?: number;
  paymentMethodId?: string;
}

export async function handleWalletModelRoutes(input: {
  request: Request;
  url: URL;
  requestContext: ConsoleRequestContext;
  settingsStore: FileConsoleSettingsStore;
  auditLog: FileAuditLog;
  fetchImpl?: typeof fetch;
}): Promise<Response | undefined> {
  const { request, url, requestContext, settingsStore, auditLog, fetchImpl } = input;

  if (request.method === "GET" && url.pathname === "/api/wallet") {
    return jsonResponse(requestContext.walletStore.getSummary());
  }
  if (request.method === "POST" && url.pathname === "/api/wallet/top-up") {
    const body = (await request.json()) as WalletTopUpRequest;
    const wallet = requestContext.walletStore.topUp({
      amountCny: Number(body.amountCny),
      description: normalizeText(body.description) ?? "充值"
    });
    await auditLog.append({
      action: "wallet.top_up",
      metadata: {
        workspaceId: requestContext.workspaceId,
        amountCny: body.amountCny
      }
    });
    return jsonResponse({ wallet });
  }
  if (request.method === "POST" && url.pathname === "/api/wallet/recharge-orders") {
    const body = (await request.json()) as WalletRechargeOrderRequest;
    const paymentMethod = await assertPaymentMethodCanCreateRechargeOrder({
      settingsStore,
      paymentMethodId: body.paymentMethodId
    });
    const currency = paymentMethod.id === "stripe"
      ? stripePaymentConfigFromEnv().currency
      : infiniPaymentConfigFromEnv().currency;
    const orderStore = new WalletRechargeOrderStore({
      handle: requestContext.databaseHandle
    });
    const order = orderStore.createPending({
      workspaceId: requestContext.workspaceId,
      amountCny: Number(body.amountCny),
      currency,
      provider: paymentMethod.id,
      metadata: {
        provider: paymentMethod.id
      }
    });
    let providerSessionId: string;
    let providerPaymentIntentId: string | undefined;
    let checkoutUrl: string;
    let expiresAt: string | undefined;
    try {
      if (paymentMethod.id === "stripe") {
        const config = stripePaymentConfigFromEnv();
        const session = await createStripeCheckoutRechargeSession({
          order,
          config,
          fetchImpl
        });
        providerSessionId = session.id;
        providerPaymentIntentId = session.payment_intent ?? undefined;
        checkoutUrl = session.url;
        expiresAt = session.expires_at ? new Date(session.expires_at * 1000).toISOString() : undefined;
      } else {
        const config = infiniPaymentConfigFromEnv();
        const session = await createInfiniCheckoutRechargeSession({
          order,
          config,
          fetchImpl
        });
        providerSessionId = session.order_id;
        providerPaymentIntentId = session.order_id;
        checkoutUrl = session.checkout_url;
        expiresAt = session.expires_at ? new Date(session.expires_at * 1000).toISOString() : undefined;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      orderStore.markFailedById(order.id, message);
      throw error;
    }
    const savedOrder = orderStore.attachProviderSession({
      orderId: order.id,
      providerSessionId,
      providerPaymentIntentId,
      checkoutUrl,
      expiresAt
    });
    await auditLog.append({
      action: "wallet.recharge_order.created",
      target: savedOrder.id,
      metadata: {
        workspaceId: requestContext.workspaceId,
        provider: savedOrder.provider,
        providerSessionId: savedOrder.providerSessionId,
        amountCny: savedOrder.amountCny,
        currency: savedOrder.currency
      }
    });
    return jsonResponse({
      order: savedOrder,
      checkoutUrl
    });
  }
  const rechargeSyncMatch = url.pathname.match(/^\/api\/wallet\/recharge-orders\/([^/]+)\/sync$/);
  if (request.method === "POST" && rechargeSyncMatch) {
    const orderId = decodeURIComponent(rechargeSyncMatch[1] ?? "");
    const orderStore = new WalletRechargeOrderStore({
      handle: requestContext.databaseHandle
    });
    const existingOrder = orderStore.getById(orderId);
    if (existingOrder.workspaceId !== requestContext.workspaceId) {
      return jsonResponse({ error: "充值订单不存在。" }, 404);
    }
    const result = await syncInfiniCheckoutRechargeOrder({
      orderId,
      config: infiniPaymentConfigFromEnv(),
      handle: requestContext.databaseHandle,
      fetchImpl
    });
    await auditLog.append({
      action: "wallet.recharge_order.synced",
      target: result.order.id,
      metadata: {
        workspaceId: requestContext.workspaceId,
        provider: result.order.provider,
        providerSessionId: result.order.providerSessionId,
        amountCny: result.order.amountCny,
        status: result.order.status,
        synced: result.synced
      }
    });
    return jsonResponse({
      ...result,
      wallet: requestContext.walletStore.getSummary()
    });
  }
  if (request.method === "GET" && url.pathname === "/api/model-bundles") {
    await ensureMissingPlatformBundles(requestContext);
    return jsonResponse({
      bundles: requestContext.modelBundleStore.list()
    });
  }
  if (request.method === "GET" && url.pathname === "/api/model-service-preference") {
    return jsonResponse({
      preference: requestContext.modelServicePreferenceStore.get()
    });
  }
  if (request.method === "PUT" && url.pathname === "/api/model-service-preference") {
    const input = (await request.json()) as Partial<ModelServicePreference>;
    await assertModelServicePreferenceBundlesExist(input, requestContext.modelBundleStore);
    const preference = requestContext.modelServicePreferenceStore.set({
      serviceMode: normalizeServiceMode(input.serviceMode),
      platformBundleId: input.platformBundleId,
      byokBundleId: input.byokBundleId
    });
    await auditLog.append({
      action: "model_service_preference.saved",
      metadata: {
        workspaceId: requestContext.workspaceId,
        serviceMode: preference.serviceMode,
        platformBundleId: preference.platformBundleId,
        byokBundleId: preference.byokBundleId
      }
    });
    return jsonResponse({ preference });
  }
  if (request.method === "PUT" && url.pathname === "/api/model-bundles") {
    const input = (await request.json()) as ModelBundleInput;
    await assertModelBundleConfigsExist(input, {
      modelConfigStore: requestContext.modelConfigStore,
      platformModelConfigStore: requestContext.platformModelConfigStore
    });
    const bundle = requestContext.modelBundleStore.set(input);
    await auditLog.append({
      action: "model_bundle.saved",
      target: bundle.bundleId,
      metadata: {
        label: bundle.label
      }
    });
    return jsonResponse({ bundle });
  }
  const modelBundleMatch = url.pathname.match(/^\/api\/model-bundles\/([^/]+)$/);
  if (modelBundleMatch && request.method === "DELETE") {
    const bundleId = decodeURIComponent(modelBundleMatch[1] ?? "");
    requestContext.modelBundleStore.delete(bundleId);
    await auditLog.append({
      action: "model_bundle.deleted",
      target: bundleId
    });
    return jsonResponse({ ok: true });
  }
  return undefined;
}

async function ensureMissingPlatformBundles(requestContext: ConsoleRequestContext): Promise<void> {
  const existingPlatformBundle = requestContext.modelBundleStore.list().some((bundle) => bundle.apiOwner === "platform");
  if (existingPlatformBundle) {
    return;
  }
  await ensurePlatformBundles({
    platformModelConfigStore: requestContext.platformModelConfigStore,
    modelBundleStore: requestContext.modelBundleStore,
    modelServicePreferenceStore: requestContext.modelServicePreferenceStore
  });
}

function normalizeText(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}
