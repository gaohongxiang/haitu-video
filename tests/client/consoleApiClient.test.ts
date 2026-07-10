import { afterEach, describe, expect, it, vi } from "vitest";

import {
  consolePrimarySnapshotPaths,
  consolePollingSnapshotPaths,
  consoleSecondarySnapshotPaths,
  fetchConsoleSnapshot,
  fetchConsoleSnapshotPrimary,
  fetchConsoleSnapshotPolling,
  fetchConsoleSnapshotSecondary
} from "../../src/client/consoleApiClient.js";

function jsonResponse(path: string): Response {
  return new Response(JSON.stringify(responseBodyForPath(path)), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function responseBodyForPath(path: string): unknown {
  switch (path) {
    case "/api/products":
      return { products: [] };
    case "/api/reports":
      return { reports: [] };
    case "/api/job-ledger":
      return { summary: {}, jobs: [], products: [] };
    case "/api/qc-summary":
      return { summary: {}, items: [] };
    case "/api/video-assets":
      return { summary: {}, assets: [] };
    case "/api/storage-backup":
      return { summary: {}, scopes: [], backupCommands: [], notes: [] };
    case "/api/backups":
      return { summary: {}, backups: [] };
    case "/api/audit-log":
      return { summary: {}, events: [] };
    case "/api/provider-config":
      return { providers: [], textModels: [], imageModels: [], videoModels: [], runtime: {} };
    case "/api/settings":
      return { settings: {} };
    case "/api/video-jobs":
      return { jobs: [] };
    case "/api/wallet":
      return { balanceCny: 0, reservedCny: 0, availableCny: 0, transactions: [] };
    case "/api/wallet/recharge-orders":
      return { orders: [] };
    case "/api/payment-methods":
      return { methods: [] };
    case "/api/model-pricing-catalog":
      return { active: { version: "", source: "built_in", entries: [] } };
    case "/api/model-service-preference":
      return { preference: { serviceMode: "byok" } };
    default:
      throw new Error(`Unexpected path: ${path}`);
  }
}

function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    return jsonResponse(path);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("console API snapshots", () => {
  it("preserves authentication failures so an expired session returns to the login screen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "content-type": "application/json" }
    })));

    await expect(fetchConsoleSnapshotPrimary()).rejects.toThrow("Authentication required");
  });

  it("loads only first-screen data for the primary console snapshot", async () => {
    const fetchMock = stubFetch();

    const snapshot = await fetchConsoleSnapshotPrimary();

    expect(snapshot).toHaveProperty("productsResponse");
    expect(snapshot).toHaveProperty("providerConfigResponse");
    expect(snapshot).toHaveProperty("walletResponse");
    expect(snapshot).not.toHaveProperty("reportsResponse");
    expect(snapshot).not.toHaveProperty("storageBackupResponse");
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual(consolePrimarySnapshotPaths);
    expect(consolePrimarySnapshotPaths).not.toContain("/api/reports");
    expect(consolePrimarySnapshotPaths).not.toContain("/api/job-ledger");
    expect(consolePrimarySnapshotPaths).not.toContain("/api/qc-summary");
    expect(consolePrimarySnapshotPaths).not.toContain("/api/video-assets");
    expect(consolePrimarySnapshotPaths).not.toContain("/api/storage-backup");
    expect(consolePrimarySnapshotPaths).not.toContain("/api/backups");
    expect(consolePrimarySnapshotPaths).not.toContain("/api/audit-log");
  });

  it("keeps dashboard, ledger, storage, and audit data in the secondary snapshot", async () => {
    const fetchMock = stubFetch();

    const snapshot = await fetchConsoleSnapshotSecondary();

    expect(snapshot).toHaveProperty("reportsResponse");
    expect(snapshot).toHaveProperty("ledgerResponse");
    expect(snapshot).toHaveProperty("auditLogResponse");
    expect(snapshot).not.toHaveProperty("productsResponse");
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual(consoleSecondarySnapshotPaths);
    expect(consoleSecondarySnapshotPaths).toEqual([
      "/api/reports",
      "/api/job-ledger",
      "/api/qc-summary",
      "/api/video-assets",
      "/api/storage-backup",
      "/api/backups",
      "/api/audit-log"
    ]);
  });

  it("polls only task status and wallet balance while jobs are active", async () => {
    const fetchMock = stubFetch();

    const snapshot = await fetchConsoleSnapshotPolling();

    expect(snapshot).toHaveProperty("videoJobsResponse");
    expect(snapshot).toHaveProperty("walletResponse");
    expect(snapshot).not.toHaveProperty("productsResponse");
    expect(snapshot).not.toHaveProperty("providerConfigResponse");
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual(consolePollingSnapshotPaths);
    expect(consolePollingSnapshotPaths).toEqual([
      "/api/video-jobs",
      "/api/wallet"
    ]);
  });

  it("still supports fetching the full console snapshot for refreshes that need every panel", async () => {
    const fetchMock = stubFetch();

    const snapshot = await fetchConsoleSnapshot();

    expect(snapshot).toHaveProperty("productsResponse");
    expect(snapshot).toHaveProperty("reportsResponse");
    expect(snapshot).toHaveProperty("auditLogResponse");
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      ...consolePrimarySnapshotPaths,
      ...consoleSecondarySnapshotPaths
    ]);
  });
});
