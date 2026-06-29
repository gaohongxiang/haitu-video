import type { FileAuditLog } from "./auditLog.js";
import {
  adjustAdminWallet,
  listAdminRechargeOrders,
  listAdminWalletTransactions,
  listAdminWallets,
  type AdminWalletAdjustmentRequest
} from "./adminBilling.js";
import {
  getAdminBillingSettings,
  saveAdminBillingSettings,
  type BillingSettingsUpdateRequest
} from "./adminBillingSettings.js";
import {
  buildAdminModelPricingCatalog,
  buildAdminModelPricingDraftDiff,
  publishAdminModelPricingDraft,
  saveAdminModelPricingDraft,
  type AdminModelPricingDraftRequest,
  type AdminModelPricingPublishRequest
} from "./adminModelPricingCatalog.js";
import {
  buildAdminContentSummary,
  listAdminContentProducts,
  listAdminContentVideoJobs
} from "./adminContent.js";
import { buildAdminOverview, buildAdminUserDetail } from "./adminDashboard.js";
import { getAdminSiteSettings } from "./adminSiteSettings.js";
import type { ConsoleAuthStore } from "./consoleAuth.js";
import { jsonResponse } from "./consoleHttpService.js";
import type { ConsoleSettingsStore } from "./consoleSettings.js";
import type { DatabaseHandle } from "./db/client.js";
import {
  listAdminPaymentMethods,
  saveAdminPaymentMethods,
  type PaymentMethodUpdateRequest
} from "./paymentMethodService.js";
import { ModelPricingCatalogStore } from "./modelPricingCatalogStore.js";

export async function handleAuthAdminRoutes(input: {
  request: Request;
  url: URL;
  authStore: ConsoleAuthStore;
  settingsStore: ConsoleSettingsStore;
  databaseHandle: DatabaseHandle;
  auditLog: FileAuditLog;
  now?: () => Date;
}): Promise<Response | undefined> {
  const {
    request,
    url,
    authStore,
    settingsStore,
    databaseHandle,
    auditLog,
    now
  } = input;

  if (request.method === "GET" && url.pathname === "/api/auth/session") {
    return jsonResponse(await authStore.sessionStatus(request));
  }
  if (request.method === "POST" && url.pathname === "/api/auth/enter") {
    const response = await authStore.enter(await request.json());
    await auditLog.append({
      action: response.ok ? "auth.enter" : "auth.enter_failed",
      metadata: {
        status: response.status
      }
    });
    return response;
  }
  if (request.method === "POST" && url.pathname === "/api/auth/verify-email") {
    const response = await authStore.verifyEmail(await request.json());
    await auditLog.append({
      action: response.ok ? "auth.email_verified" : "auth.email_verification_failed",
      metadata: {
        status: response.status
      }
    });
    return response;
  }
  if (request.method === "POST" && url.pathname === "/api/auth/request-password-reset") {
    const response = await authStore.requestPasswordReset(await request.json());
    await auditLog.append({
      action: response.ok ? "auth.password_reset_requested" : "auth.password_reset_request_failed",
      metadata: {
        status: response.status
      }
    });
    return response;
  }
  if (request.method === "POST" && url.pathname === "/api/auth/reset-password") {
    const response = await authStore.resetPassword(await request.json());
    await auditLog.append({
      action: response.ok ? "auth.password_reset" : "auth.password_reset_failed",
      metadata: {
        status: response.status
      }
    });
    return response;
  }
  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const response = await authStore.logout(request);
    await auditLog.append({
      action: "auth.logout"
    });
    return response;
  }
  if (request.method === "GET" && url.pathname === "/api/admin/overview") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    return jsonResponse(buildAdminOverview(databaseHandle, now?.() ?? new Date()));
  }
  if (request.method === "GET" && url.pathname === "/api/admin/payment-methods") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    return jsonResponse(await listAdminPaymentMethods({ settingsStore }));
  }
  if (request.method === "PUT" && url.pathname === "/api/admin/payment-methods") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    const result = await saveAdminPaymentMethods({
      settingsStore,
      request: await request.json() as PaymentMethodUpdateRequest
    });
    await auditLog.append({
      action: "admin.payment_methods.saved",
      metadata: {
        enabledMethods: result.methods.filter((method) => method.enabled).map((method) => method.id)
      }
    });
    return jsonResponse(result);
  }
  if (request.method === "GET" && url.pathname === "/api/admin/billing-settings") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    return jsonResponse(getAdminBillingSettings({
      handle: databaseHandle,
      now
    }));
  }
  if (request.method === "PUT" && url.pathname === "/api/admin/billing-settings") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    const body = await request.json() as BillingSettingsUpdateRequest;
    const result = saveAdminBillingSettings({
      handle: databaseHandle,
      request: body,
      now
    });
    await auditLog.append({
      action: "admin.billing_settings.saved",
      metadata: {
        rules: result.settings.rules.map((rule) => ({
          usageKind: rule.usageKind,
          serviceFeeCny: rule.serviceFeeCny
        }))
      }
    });
    return jsonResponse(result);
  }
  if (request.method === "GET" && url.pathname === "/api/admin/model-pricing-catalog") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    return jsonResponse(buildAdminModelPricingCatalog({
      store: new ModelPricingCatalogStore({ handle: databaseHandle, now })
    }));
  }
  if (request.method === "PUT" && url.pathname === "/api/admin/model-pricing-catalog/draft") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    const admin = await authStore.resolveAdminUser(request);
    const result = saveAdminModelPricingDraft({
      store: new ModelPricingCatalogStore({ handle: databaseHandle, now }),
      adminEmail: admin.email,
      request: await request.json() as AdminModelPricingDraftRequest
    });
    await auditLog.append({
      actor: admin.email,
      action: "admin.model_pricing_catalog.draft_saved",
      metadata: result.draft
    });
    return jsonResponse(result);
  }
  const modelPricingDiffMatch = url.pathname.match(/^\/api\/admin\/model-pricing-catalog\/draft\/([^/]+)\/diff$/);
  if (request.method === "GET" && modelPricingDiffMatch) {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    return jsonResponse(buildAdminModelPricingDraftDiff({
      store: new ModelPricingCatalogStore({ handle: databaseHandle, now }),
      draftId: decodeURIComponent(modelPricingDiffMatch[1] ?? "")
    }));
  }
  if (request.method === "POST" && url.pathname === "/api/admin/model-pricing-catalog/publish") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    const admin = await authStore.resolveAdminUser(request);
    const result = publishAdminModelPricingDraft({
      store: new ModelPricingCatalogStore({ handle: databaseHandle, now }),
      adminEmail: admin.email,
      request: await request.json() as AdminModelPricingPublishRequest
    });
    await auditLog.append({
      actor: admin.email,
      action: "admin.model_pricing_catalog.published",
      metadata: {
        version: result.active.version,
        source: result.active.source,
        entryCount: result.active.entries.length
      }
    });
    return jsonResponse(result);
  }
  if (request.method === "GET" && url.pathname === "/api/admin/wallets") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    return jsonResponse(listAdminWallets(databaseHandle));
  }
  if (request.method === "GET" && url.pathname === "/api/admin/wallet-transactions") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    return jsonResponse(listAdminWalletTransactions({
      handle: databaseHandle,
      workspaceId: optionalSearchParam(url, "workspaceId"),
      type: optionalSearchParam(url, "type"),
      limit: numberSearchParam(url, "limit")
    }));
  }
  if (request.method === "GET" && url.pathname === "/api/admin/recharge-orders") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    return jsonResponse(listAdminRechargeOrders({
      handle: databaseHandle,
      workspaceId: optionalSearchParam(url, "workspaceId"),
      status: optionalSearchParam(url, "status"),
      provider: optionalSearchParam(url, "provider"),
      limit: numberSearchParam(url, "limit")
    }));
  }
  if (request.method === "GET" && url.pathname === "/api/admin/content/summary") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    return jsonResponse(buildAdminContentSummary(databaseHandle));
  }
  if (request.method === "GET" && url.pathname === "/api/admin/content/products") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    return jsonResponse(listAdminContentProducts({
      handle: databaseHandle,
      workspaceId: optionalSearchParam(url, "workspaceId"),
      limit: numberSearchParam(url, "limit")
    }));
  }
  if (request.method === "GET" && url.pathname === "/api/admin/content/video-jobs") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    return jsonResponse(listAdminContentVideoJobs({
      handle: databaseHandle,
      workspaceId: optionalSearchParam(url, "workspaceId"),
      status: optionalSearchParam(url, "status"),
      limit: numberSearchParam(url, "limit")
    }));
  }
  if (request.method === "GET" && url.pathname === "/api/admin/site-settings") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    return jsonResponse(await getAdminSiteSettings({
      handle: databaseHandle,
      settingsStore,
      now
    }));
  }
  if (request.method === "POST" && url.pathname === "/api/admin/wallet-adjustments") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    const admin = await authStore.resolveAdminUser(request);
    const body = await request.json() as AdminWalletAdjustmentRequest;
    const result = adjustAdminWallet({
      handle: databaseHandle,
      request: body,
      adminUserId: admin.userId,
      adminEmail: admin.email,
      now
    });
    await auditLog.append({
      actor: admin.email,
      action: "admin.wallet_adjustment",
      target: body.workspaceId,
      metadata: {
        workspaceId: body.workspaceId,
        amountCny: body.amountCny,
        reason: body.reason
      }
    });
    return jsonResponse(result);
  }
  const adminUserMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (request.method === "GET" && adminUserMatch) {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    return jsonResponse(buildAdminUserDetail(databaseHandle, decodeURIComponent(adminUserMatch[1] ?? "")));
  }
  return undefined;
}

function optionalSearchParam(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key)?.trim();
  return value || undefined;
}

function numberSearchParam(url: URL, key: string): number | undefined {
  const value = optionalSearchParam(url, key);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
