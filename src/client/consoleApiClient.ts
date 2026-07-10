export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  return readJsonResponse<T>(response);
}

class ConsoleApiResponseError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ConsoleApiResponseError";
  }
}

async function getJsonWithSignal<T>(path: string, signal: AbortSignal): Promise<T> {
  try {
    const response = await fetch(path, { signal });
    return await readJsonResponse<T>(response);
  } catch (error) {
    if (error instanceof ConsoleApiResponseError && error.status === 401) {
      throw error;
    }
    throw new Error(`控制台初始化接口失败 ${path}: ${fetchErrorMessage(error)}`);
  }
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return readJsonResponse<T>(response);
}

export async function postJsonWithSignal<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal
  });
  return readJsonResponse<T>(response);
}

export async function putJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return readJsonResponse<T>(response);
}

export async function deleteJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: "DELETE"
  });
  return readJsonResponse<T>(response);
}

export interface ConsoleSnapshotTypes {
  productsResponse: unknown;
  reportsResponse: unknown;
  ledgerResponse: unknown;
  qcSummaryResponse: unknown;
  videoAssetsResponse: unknown;
  storageBackupResponse: unknown;
  localBackupsResponse: unknown;
  auditLogResponse: unknown;
  providerConfigResponse: unknown;
  settingsResponse: unknown;
  videoJobsResponse: unknown;
  walletResponse: unknown;
  walletRechargeOrdersResponse: unknown;
  paymentMethodsResponse: unknown;
  modelPricingCatalogResponse: unknown;
  modelServicePreferenceResponse: unknown;
}

export type ConsolePrimarySnapshotTypes = Pick<
  ConsoleSnapshotTypes,
  | "productsResponse"
  | "providerConfigResponse"
  | "settingsResponse"
  | "videoJobsResponse"
  | "walletResponse"
  | "walletRechargeOrdersResponse"
  | "paymentMethodsResponse"
  | "modelPricingCatalogResponse"
  | "modelServicePreferenceResponse"
>;

export type ConsoleSecondarySnapshotTypes = Pick<
  ConsoleSnapshotTypes,
  | "reportsResponse"
  | "ledgerResponse"
  | "qcSummaryResponse"
  | "videoAssetsResponse"
  | "storageBackupResponse"
  | "localBackupsResponse"
  | "auditLogResponse"
>;

export type ConsolePollingSnapshotTypes = Pick<
  ConsoleSnapshotTypes,
  | "videoJobsResponse"
  | "walletResponse"
>;

export const consolePrimarySnapshotPaths = [
  "/api/products",
  "/api/provider-config",
  "/api/settings",
  "/api/video-jobs",
  "/api/wallet",
  "/api/wallet/recharge-orders",
  "/api/payment-methods",
  "/api/model-pricing-catalog",
  "/api/model-service-preference"
] as const;

export const consoleSecondarySnapshotPaths = [
  "/api/reports",
  "/api/job-ledger",
  "/api/qc-summary",
  "/api/video-assets",
  "/api/storage-backup",
  "/api/backups",
  "/api/audit-log"
] as const;

export const consolePollingSnapshotPaths = [
  "/api/video-jobs",
  "/api/wallet"
] as const;

export async function fetchConsoleSnapshotPrimary<T extends ConsolePrimarySnapshotTypes>(): Promise<T> {
  const consoleSnapshotRequestTimeoutMs = 8000;
  const signal = AbortSignal.timeout(consoleSnapshotRequestTimeoutMs);
  const [
    productsResponse,
    providerConfigResponse,
    settingsResponse,
    videoJobsResponse,
    walletResponse,
    walletRechargeOrdersResponse,
    paymentMethodsResponse,
    modelPricingCatalogResponse,
    modelServicePreferenceResponse
  ] = await Promise.all([
    getJsonWithSignal<T["productsResponse"]>("/api/products", signal),
    getJsonWithSignal<T["providerConfigResponse"]>("/api/provider-config", signal),
    getJsonWithSignal<T["settingsResponse"]>("/api/settings", signal),
    getJsonWithSignal<T["videoJobsResponse"]>("/api/video-jobs", signal),
    getJsonWithSignal<T["walletResponse"]>("/api/wallet", signal),
    getJsonWithSignal<T["walletRechargeOrdersResponse"]>("/api/wallet/recharge-orders", signal),
    getJsonWithSignal<T["paymentMethodsResponse"]>("/api/payment-methods", signal),
    getJsonWithSignal<T["modelPricingCatalogResponse"]>("/api/model-pricing-catalog", signal),
    getJsonWithSignal<T["modelServicePreferenceResponse"]>("/api/model-service-preference", signal)
  ]);
  return {
    productsResponse,
    providerConfigResponse,
    settingsResponse,
    videoJobsResponse,
    walletResponse,
    walletRechargeOrdersResponse,
    paymentMethodsResponse,
    modelPricingCatalogResponse,
    modelServicePreferenceResponse
  } as T;
}

export async function fetchConsoleSnapshotPolling<T extends ConsolePollingSnapshotTypes>(): Promise<T> {
  const consoleSnapshotRequestTimeoutMs = 8000;
  const signal = AbortSignal.timeout(consoleSnapshotRequestTimeoutMs);
  const [
    videoJobsResponse,
    walletResponse
  ] = await Promise.all([
    getJsonWithSignal<T["videoJobsResponse"]>("/api/video-jobs", signal),
    getJsonWithSignal<T["walletResponse"]>("/api/wallet", signal)
  ]);
  return {
    videoJobsResponse,
    walletResponse
  } as T;
}

export async function fetchConsoleSnapshotSecondary<T extends ConsoleSecondarySnapshotTypes>(): Promise<T> {
  const consoleSnapshotRequestTimeoutMs = 8000;
  const signal = AbortSignal.timeout(consoleSnapshotRequestTimeoutMs);
  const [
    reportsResponse,
    ledgerResponse,
    qcSummaryResponse,
    videoAssetsResponse,
    storageBackupResponse,
    localBackupsResponse,
    auditLogResponse
  ] = await Promise.all([
    getJsonWithSignal<T["reportsResponse"]>("/api/reports", signal),
    getJsonWithSignal<T["ledgerResponse"]>("/api/job-ledger", signal),
    getJsonWithSignal<T["qcSummaryResponse"]>("/api/qc-summary", signal),
    getJsonWithSignal<T["videoAssetsResponse"]>("/api/video-assets", signal),
    getJsonWithSignal<T["storageBackupResponse"]>("/api/storage-backup", signal),
    getJsonWithSignal<T["localBackupsResponse"]>("/api/backups", signal),
    getJsonWithSignal<T["auditLogResponse"]>("/api/audit-log", signal)
  ]);
  return {
    reportsResponse,
    ledgerResponse,
    qcSummaryResponse,
    videoAssetsResponse,
    storageBackupResponse,
    localBackupsResponse,
    auditLogResponse
  } as T;
}

export async function fetchConsoleSnapshot<T extends ConsoleSnapshotTypes>(): Promise<T> {
  const [primary, secondary] = await Promise.all([
    fetchConsoleSnapshotPrimary<ConsolePrimarySnapshotTypes>(),
    fetchConsoleSnapshotSecondary<ConsoleSecondarySnapshotTypes>()
  ]);
  return {
    ...primary,
    ...secondary
  } as T;
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) {
    throw new ConsoleApiResponseError(body.error || `HTTP ${response.status}`, response.status);
  }
  return body as T;
}

function fetchErrorMessage(error: unknown): string {
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return "请求超时";
  }
  return error instanceof Error ? error.message : String(error);
}
