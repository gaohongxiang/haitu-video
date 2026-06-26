import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const routesPath = "src/server/assetReportRoutes.ts";
const videoAssetStorageServicePath = "src/server/videoAssetStorageService.ts";
const videoAssetLedgerPath = "src/server/videoAssetLedger.ts";
const storageBackupServicePath = "src/server/storageBackupService.ts";
const localBackupArchivePath = "src/server/localBackupArchiveService.ts";

describe("video asset storage service source boundaries", () => {
  it("keeps video asset and backup workflows behind the route layer", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const routesSource = await readFile(routesPath, "utf8");

    await expect(access(videoAssetStorageServicePath)).resolves.toBeUndefined();
    expect(consoleServerSource).not.toContain('from "./videoAssetStorageService.js"');
    expect(routesSource).toContain('from "./videoAssetStorageService.js"');
    expect(consoleServerSource).not.toContain("async function deleteVideoAsset(");
    expect(consoleServerSource).not.toContain("async function listVideoAssets(");
    expect(consoleServerSource).not.toContain("async function buildStorageBackupReport(");
    expect(consoleServerSource).not.toContain("async function createLocalBackup(");
    expect(consoleServerSource).not.toContain("async function listLocalBackups(");
    expect(consoleServerSource).not.toContain("async function summarizeStorageScope(");
    expect(consoleServerSource).not.toContain("async function videoAssetCandidatesFromReports(");
    expect(consoleServerSource).not.toContain("async function videoAssetCandidatesFromPublishPackages(");
  });

  it("keeps video asset storage as a narrow compatibility facade over asset and backup modules", async () => {
    const serviceSource = await readFile(videoAssetStorageServicePath, "utf8");

    expect(serviceSource).toContain("deleteVideoAsset");
    expect(serviceSource).toContain("listVideoAssets");
    expect(serviceSource).toContain("buildStorageBackupReport");
    expect(serviceSource).toContain("createLocalBackup");
    expect(serviceSource).toContain("listLocalBackups");
    expect(serviceSource).toContain('from "./videoAssetLedger.js"');
    expect(serviceSource).toContain('from "./storageBackupService.js"');
    expect(serviceSource).not.toContain("listPublishPackages");
    expect(serviceSource).not.toContain("getStorageRoots");
    expect(serviceSource).not.toContain("getWorkspacePaths");
    expect(serviceSource).not.toContain("function runCommand(");
    expect(serviceSource).not.toContain("function summarizeStorageScope(");
    expect(serviceSource).not.toContain("async function videoAssetCandidatesFromReports(");
  });

  it("centralizes video asset listing and deletion internals in the asset ledger module", async () => {
    const ledgerSource = await readFile(videoAssetLedgerPath, "utf8");

    await expect(access(videoAssetLedgerPath)).resolves.toBeUndefined();
    expect(ledgerSource).toContain("export async function deleteVideoAsset(");
    expect(ledgerSource).toContain("export async function listVideoAssets(");
    expect(ledgerSource).toContain("listPublishPackages");
    expect(ledgerSource).toContain("async function videoAssetCandidatesFromReports(");
    expect(ledgerSource).toContain("function summarizeVideoAssets(");
  });

  it("centralizes storage backup reporting and local archive creation in the backup service", async () => {
    const backupSource = await readFile(storageBackupServicePath, "utf8");

    await expect(access(storageBackupServicePath)).resolves.toBeUndefined();
    await expect(access(localBackupArchivePath)).resolves.toBeUndefined();
    expect(backupSource).toContain("export async function buildStorageBackupReport(");
    expect(backupSource).toContain('from "./localBackupArchiveService.js"');
    expect(backupSource).not.toContain("export async function createLocalBackup(");
    expect(backupSource).not.toContain("export async function listLocalBackups(");
    expect(backupSource).toContain("getStorageRoots");
    expect(backupSource).toContain("getWorkspacePaths");
    expect(backupSource).not.toContain("function runCommand(");
    expect(backupSource).not.toContain("function backupFileName(");
    expect(backupSource).toContain("function summarizeStorageScope(");
  });

  it("centralizes local backup archive creation and listing in the archive service", async () => {
    const archiveSource = await readFile(localBackupArchivePath, "utf8");

    expect(archiveSource).toContain("export async function createLocalBackup(");
    expect(archiveSource).toContain("export async function listLocalBackups(");
    expect(archiveSource).toContain("function runCommand(");
    expect(archiveSource).toContain("function backupFileName(");
    expect(archiveSource).toContain("function toLocalBackupItem(");
  });
});
