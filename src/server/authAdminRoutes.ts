import type { FileAuditLog } from "./auditLog.js";
import {
  adjustAdminWallet,
  listAdminWallets,
  type AdminWalletAdjustmentRequest
} from "./adminBilling.js";
import { buildAdminOverview, buildAdminUserDetail } from "./adminDashboard.js";
import type { ConsoleAuthStore } from "./consoleAuth.js";
import { jsonResponse } from "./consoleHttpService.js";
import type { FileConsoleSettingsStore } from "./consoleSettings.js";
import type { DatabaseHandle } from "./db/client.js";
import {
  listAdminPaymentMethods,
  saveAdminPaymentMethods,
  type PaymentMethodUpdateRequest
} from "./paymentMethodService.js";

export async function handleAuthAdminRoutes(input: {
  request: Request;
  url: URL;
  authStore: ConsoleAuthStore;
  settingsStore: FileConsoleSettingsStore;
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
  if (request.method === "GET" && url.pathname === "/api/admin/wallets") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    return jsonResponse(listAdminWallets(databaseHandle));
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
