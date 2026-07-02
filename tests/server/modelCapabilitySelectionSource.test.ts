import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const selectionPath = "src/server/modelConfigSelection.ts";
const runtimePath = "src/server/consoleServerRuntime.ts";
const workspaceRuntimePath = "src/server/consoleWorkspaceRuntime.ts";
const routesPath = "src/server/walletModelRoutes.ts";
const modelConfigRoutesPath = "src/server/modelConfigRoutes.ts";
const lifecyclePath = "src/server/consoleLifecycleService.ts";

describe("model capability selection source", () => {
  it("selects model configs by capability and preference without bundles", async () => {
    const source = await readFile(selectionPath, "utf8");

    expect(source).toContain('export type ModelCapability = "text" | "image" | "video";');
    expect(source).toContain("export async function selectModelConfig");
    expect(source).toContain("capability: ModelCapability");
    expect(source).toContain("modelServicePreferenceStore");
    expect(source).toContain("requestedConfigId");
    expect(source).toContain("providerIdForCapability");
    expect(source).toContain("preferenceConfigIdForCapability");
    expect(source).not.toContain("ModelBundle");
    expect(source).not.toContain("modelBundleStore");
    expect(source).not.toContain("bundleConfigSelector");
    expect(source).not.toContain("selectedBundleConfigId");
    expect(source).not.toContain("当前模型组合");
  });

  it("does not provision or expose model bundles at runtime", async () => {
    const runtimeSource = await readFile(runtimePath, "utf8");
    const workspaceRuntimeSource = await readFile(workspaceRuntimePath, "utf8");
    const lifecycleSource = await readFile(lifecyclePath, "utf8");
    const routesSource = await readFile(routesPath, "utf8");
    const modelConfigRoutesSource = await readFile(modelConfigRoutesPath, "utf8");

    expect(runtimeSource).not.toContain("ModelBundleStore");
    expect(runtimeSource).not.toContain("ensurePlatformBundlesForAllWorkspaces");
    expect(runtimeSource).not.toContain("modelBundleStore");
    expect(workspaceRuntimeSource).not.toContain("ModelBundleStore");
    expect(workspaceRuntimeSource).not.toContain("modelBundleStore");
    expect(lifecycleSource).not.toContain("ensurePlatformBundlesForAllWorkspaces");
    expect(lifecycleSource).not.toContain("platformModelProvisioning");
    expect(routesSource).not.toContain("/api/model-bundles");
    expect(routesSource).not.toContain("ModelBundle");
    expect(routesSource).not.toContain("assertModelBundle");
    expect(modelConfigRoutesSource).not.toContain("ensurePlatformBundlesForAllWorkspaces");
  });
});
