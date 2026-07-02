import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const runtimePath = "src/server/consoleServerRuntime.ts";

describe("console server runtime source boundaries", () => {
  it("keeps default workspace dependency construction out of the HTTP server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");

    await expect(access(runtimePath)).resolves.toBeUndefined();
    expect(consoleServerSource).toContain("createConsoleServerRuntime(");
    expect(consoleServerSource).not.toContain('from "./storagePaths.js"');
    expect(consoleServerSource).not.toContain('from "./auth/betterAuthStore.js"');
    expect(consoleServerSource).not.toContain('from "./modelBundleStore.js"');
    expect(consoleServerSource).not.toContain('from "./modelServicePreferenceStore.js"');
    expect(consoleServerSource).not.toContain('from "./reviewStore.js"');
    expect(consoleServerSource).not.toContain('from "./consoleSettings.js"');
    expect(consoleServerSource).not.toContain('from "./auditLog.js"');
    expect(consoleServerSource).not.toContain("new FileReviewStore(");
    expect(consoleServerSource).not.toContain("new FileConsoleSettingsStore(");
    expect(consoleServerSource).not.toContain("new PublicAssetTokenStore(");
    expect(consoleServerSource).not.toContain("new BetterAuthConsoleAuthStore(");
    expect(consoleServerSource).not.toContain("new LocalVideoJobQueue(");
    expect(consoleServerSource).not.toContain("new ModelBundleStore(");
    expect(consoleServerSource).not.toContain("new ModelServicePreferenceStore(");
    expect(consoleServerSource).not.toContain("createModelConfigStore(");
    expect(consoleServerSource).not.toContain("createConfiguredMakeVideoPipeline(");
    expect(consoleServerSource).not.toContain("createReferenceImageUrlResolver(");
    expect(consoleServerSource).not.toContain("getStorageRoots(");
    expect(consoleServerSource).not.toContain("getWorkspacePaths(");
    expect(consoleServerSource).not.toContain("resolveDataDir(");
    expect(consoleServerSource).not.toContain("ensurePlatformBundlesForAllWorkspaces(");
    expect(consoleServerSource).not.toContain("startVideoRetentionCleanup(");
  });

  it("centralizes default workspace stores, queues, and lifecycle startup without model bundles", async () => {
    const runtimeSource = await readFile(runtimePath, "utf8");

    expect(runtimeSource).toContain("export function createConsoleServerRuntime(");
    expect(runtimeSource).toContain("resolveDataDir(");
    expect(runtimeSource).toContain("getStorageRoots(");
    expect(runtimeSource).toContain("getWorkspacePaths(");
    expect(runtimeSource).toContain("new FileReviewStore(");
    expect(runtimeSource).toContain("new SqliteConsoleSettingsStore(");
    expect(runtimeSource).not.toContain("new FileConsoleSettingsStore(");
    expect(runtimeSource).toContain("new PublicAssetTokenStore(");
    expect(runtimeSource).toContain("new BetterAuthConsoleAuthStore(");
    expect(runtimeSource).toContain("new LocalVideoJobQueue(");
    expect(runtimeSource).not.toContain("new ModelBundleStore(");
    expect(runtimeSource).toContain("new ModelServicePreferenceStore(");
    expect(runtimeSource).toContain("createModelConfigStore(");
    expect(runtimeSource).toContain("createConfiguredMakeVideoPipeline(");
    expect(runtimeSource).toContain("createReferenceImageUrlResolver(");
    expect(runtimeSource).not.toContain("ensurePlatformBundlesForAllWorkspaces(");
    expect(runtimeSource).toContain("startVideoRetentionCleanup(");
  });
});
