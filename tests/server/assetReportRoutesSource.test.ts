import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const requestHandlerPath = "src/server/consoleRequestHandler.ts";
const apiRoutesPath = "src/server/consoleApiRoutes.ts";
const routesPath = "src/server/assetReportRoutes.ts";

describe("asset and report routes source boundaries", () => {
  it("keeps report, ledger, asset, backup, and audit-log routing out of the console server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const requestHandlerSource = await readFile(requestHandlerPath, "utf8");
    const apiRoutesSource = await readFile(apiRoutesPath, "utf8");

    await expect(access(routesPath)).resolves.toBeUndefined();
    expect(consoleServerSource).toContain("createConsoleRequestHandler(");
    expect(consoleServerSource).not.toContain("handleConsoleApiRoutes(");
    expect(requestHandlerSource).toContain("handleConsoleApiRoutes(");
    expect(consoleServerSource).not.toContain('from "./assetReportRoutes.js"');
    expect(apiRoutesSource).toContain('from "./assetReportRoutes.js"');
    expect(apiRoutesSource).toContain("handleAssetReportRoutes(");
    expect(consoleServerSource).not.toContain('url.pathname === "/api/reports"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/job-ledger"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/qc-summary"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/video-assets"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/storage-backup"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/backups"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/audit-log"');
    expect(consoleServerSource).not.toContain("const deleteJobLedgerMatch");
  });

  it("centralizes report, ledger, asset, backup, and audit-log API routes", async () => {
    const routesSource = await readFile(routesPath, "utf8");

    expect(routesSource).toContain("export async function handleAssetReportRoutes(");
    expect(routesSource).toContain('url.pathname === "/api/reports"');
    expect(routesSource).toContain('url.pathname === "/api/job-ledger"');
    expect(routesSource).toContain('url.pathname === "/api/qc-summary"');
    expect(routesSource).toContain('url.pathname === "/api/video-assets"');
    expect(routesSource).toContain('url.pathname === "/api/storage-backup"');
    expect(routesSource).toContain('url.pathname === "/api/backups"');
    expect(routesSource).toContain('url.pathname === "/api/audit-log"');
    expect(routesSource).toContain("deleteJobLedgerMatch");
    expect(routesSource).toContain("deleteVideoAsset");
    expect(routesSource).toContain("buildStorageBackupReport");
  });
});
