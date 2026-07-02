import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const runtimePath = "src/server/consoleServerRuntime.ts";
const servicePath = "src/server/consoleLifecycleService.ts";

describe("console lifecycle service source boundaries", () => {
  it("keeps database bootstrap and retention cleanup out of the HTTP server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const runtimeSource = await readFile(runtimePath, "utf8");

    await expect(access(servicePath)).resolves.toBeUndefined();
    expect(consoleServerSource).toContain('from "./consoleServerRuntime.js"');
    expect(consoleServerSource).not.toContain('from "./consoleLifecycleService.js"');
    expect(consoleServerSource).not.toContain("startVideoRetentionCleanup(");
    expect(runtimeSource).toContain('from "./consoleLifecycleService.js"');
    expect(runtimeSource).toContain("startVideoRetentionCleanup(");
    expect(consoleServerSource).not.toContain("function createDatabaseHandle(");
    expect(consoleServerSource).not.toContain("function retentionWorkspaceIds(");
    expect(consoleServerSource).not.toContain("const ensurePlatformBundlesForAllWorkspaces");
    expect(consoleServerSource).not.toContain('from "./videoRetention.js"');
    expect(consoleServerSource).not.toContain("const runVideoRetentionCleanup");
    expect(consoleServerSource).not.toContain("cleanupExpiredVideos(");
    expect(consoleServerSource).not.toContain("setInterval(() =>");
    expect(consoleServerSource).not.toContain('action: "video_retention.cleanup_failed"');
    expect(consoleServerSource).not.toContain("runMigrations(handle)");
    expect(consoleServerSource).not.toContain("ensureDefaultWorkspace(handle)");
  });

  it("centralizes database bootstrap, workspace listing, and retention cleanup", async () => {
    const serviceSource = await readFile(servicePath, "utf8");

    expect(serviceSource).toContain("export function createConsoleDatabaseHandle(");
    expect(serviceSource).toContain("export function listWorkspaceIds(");
    expect(serviceSource).not.toContain("export async function ensurePlatformBundlesForAllWorkspaces(");
    expect(serviceSource).toContain("export function startVideoRetentionCleanup(");
    expect(serviceSource).toContain("openDatabase");
    expect(serviceSource).toContain("runMigrations");
    expect(serviceSource).toContain("ensureDefaultWorkspace");
    expect(serviceSource).not.toContain("ensurePlatformBundles");
    expect(serviceSource).not.toContain("ensurePlatformModelProvisioning");
    expect(serviceSource).toContain("cleanupExpiredVideos");
    expect(serviceSource).toContain('action: "video_retention.cleanup_failed"');
  });
});
