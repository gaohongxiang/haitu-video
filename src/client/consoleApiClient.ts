export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  return readJsonResponse<T>(response);
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
  modelBundlesResponse: unknown;
  modelServicePreferenceResponse: unknown;
}

export async function fetchConsoleSnapshot<T extends ConsoleSnapshotTypes>(): Promise<T> {
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
    modelBundlesResponse,
    modelServicePreferenceResponse
  ] = await Promise.all([
    getJson<T["productsResponse"]>("/api/products"),
    getJson<T["reportsResponse"]>("/api/reports"),
    getJson<T["ledgerResponse"]>("/api/job-ledger"),
    getJson<T["qcSummaryResponse"]>("/api/qc-summary"),
    getJson<T["videoAssetsResponse"]>("/api/video-assets"),
    getJson<T["storageBackupResponse"]>("/api/storage-backup"),
    getJson<T["localBackupsResponse"]>("/api/backups"),
    getJson<T["auditLogResponse"]>("/api/audit-log"),
    getJson<T["providerConfigResponse"]>("/api/provider-config"),
    getJson<T["settingsResponse"]>("/api/settings"),
    getJson<T["videoJobsResponse"]>("/api/video-jobs"),
    getJson<T["walletResponse"]>("/api/wallet"),
    getJson<T["paymentMethodsResponse"]>("/api/payment-methods"),
    getJson<T["modelBundlesResponse"]>("/api/model-bundles"),
    getJson<T["modelServicePreferenceResponse"]>("/api/model-service-preference")
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
    modelBundlesResponse,
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
