export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  return readJsonResponse<T>(response);
}

async function getJsonWithSignal<T>(path: string, signal: AbortSignal): Promise<T> {
  try {
    const response = await fetch(path, { signal });
    return await readJsonResponse<T>(response);
  } catch (error) {
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
  paymentMethodsResponse: unknown;
  modelPricingCatalogResponse: unknown;
  modelServicePreferenceResponse: unknown;
}

export async function fetchConsoleSnapshot<T extends ConsoleSnapshotTypes>(): Promise<T> {
  const consoleSnapshotRequestTimeoutMs = 8000;
  const signal = AbortSignal.timeout(consoleSnapshotRequestTimeoutMs);
  const [
    productsResponse,
    reportsResponse,
    ledgerResponse,
    qcSummaryResponse,
    videoAssetsResponse,
    storageBackupResponse,
    localBackupsResponse,
    auditLogResponse,
    providerConfigResponse,
    settingsResponse,
    videoJobsResponse,
    walletResponse,
    paymentMethodsResponse,
    modelPricingCatalogResponse,
    modelServicePreferenceResponse
  ] = await Promise.all([
    getJsonWithSignal<T["productsResponse"]>("/api/products", signal),
    getJsonWithSignal<T["reportsResponse"]>("/api/reports", signal),
    getJsonWithSignal<T["ledgerResponse"]>("/api/job-ledger", signal),
    getJsonWithSignal<T["qcSummaryResponse"]>("/api/qc-summary", signal),
    getJsonWithSignal<T["videoAssetsResponse"]>("/api/video-assets", signal),
    getJsonWithSignal<T["storageBackupResponse"]>("/api/storage-backup", signal),
    getJsonWithSignal<T["localBackupsResponse"]>("/api/backups", signal),
    getJsonWithSignal<T["auditLogResponse"]>("/api/audit-log", signal),
    getJsonWithSignal<T["providerConfigResponse"]>("/api/provider-config", signal),
    getJsonWithSignal<T["settingsResponse"]>("/api/settings", signal),
    getJsonWithSignal<T["videoJobsResponse"]>("/api/video-jobs", signal),
    getJsonWithSignal<T["walletResponse"]>("/api/wallet", signal),
    getJsonWithSignal<T["paymentMethodsResponse"]>("/api/payment-methods", signal),
    getJsonWithSignal<T["modelPricingCatalogResponse"]>("/api/model-pricing-catalog", signal),
    getJsonWithSignal<T["modelServicePreferenceResponse"]>("/api/model-service-preference", signal)
  ]);
  return {
    productsResponse,
    reportsResponse,
    ledgerResponse,
    qcSummaryResponse,
    videoAssetsResponse,
    storageBackupResponse,
    localBackupsResponse,
    auditLogResponse,
    providerConfigResponse,
    settingsResponse,
    videoJobsResponse,
    walletResponse,
    paymentMethodsResponse,
    modelPricingCatalogResponse,
    modelServicePreferenceResponse
  } as T;
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return body as T;
}

function fetchErrorMessage(error: unknown): string {
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return "请求超时";
  }
  return error instanceof Error ? error.message : String(error);
}
