import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const routesPath = "src/server/modelConfigRoutes.ts";
const servicePath = "src/server/modelConfigService.ts";
const testSelectionPath = "src/server/modelConfigTestSelection.ts";

describe("model config service source boundaries", () => {
  it("keeps model config presentation, testing, discovery, and key reveal helpers behind the route layer", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const routesSource = await readFile(routesPath, "utf8");

    await expect(access(servicePath)).resolves.toBeUndefined();
    await expect(access(testSelectionPath)).resolves.toBeUndefined();
    expect(consoleServerSource).not.toContain('from "./modelConfigService.js"');
    expect(routesSource).toContain('from "./modelConfigService.js"');
    expect(consoleServerSource).not.toContain("async function buildProviderConfig(");
    expect(consoleServerSource).not.toContain("async function buildPlatformModelAdminConfig(");
    expect(consoleServerSource).not.toContain("function platformModelConfigInput(");
    expect(consoleServerSource).not.toContain("async function testProviderConfig(");
    expect(consoleServerSource).not.toContain("async function refreshProviderModels(");
    expect(consoleServerSource).not.toContain("async function revealProviderConfigKey(");
    expect(consoleServerSource).not.toContain("function buildTextModelConfigs(");
    expect(consoleServerSource).not.toContain("function buildImageModelConfigs(");
    expect(consoleServerSource).not.toContain("function buildVideoModelConfigs(");
    expect(consoleServerSource).not.toContain("function effectiveProviderConfigForTest(");
  });

  it("keeps model config provider testing, discovery, and key reveal in the service module", async () => {
    const serviceSource = await readFile(servicePath, "utf8");

    expect(serviceSource).not.toContain("export async function buildProviderConfig(");
    expect(serviceSource).not.toContain("export async function buildPlatformModelAdminConfig(");
    expect(serviceSource).not.toContain("function buildTextModelConfigs(");
    expect(serviceSource).not.toContain("function buildImageModelConfigs(");
    expect(serviceSource).not.toContain("function buildVideoModelConfigs(");
    expect(serviceSource).toContain("export function platformModelConfigInput(");
    expect(serviceSource).toContain("export async function testProviderConfig(");
    expect(serviceSource).toContain("export async function refreshProviderModels(");
    expect(serviceSource).toContain("export async function revealProviderConfigKey(");
    expect(serviceSource).toContain('from "./modelConfigTestSelection.js"');
    expect(serviceSource).not.toContain("async function effectiveProviderConfigForTest(");
    expect(serviceSource).not.toContain("function effectiveTextModelApiModeForTest(");
  });

  it("centralizes provider test config selection and text API mode inference", async () => {
    const selectionSource = await readFile(testSelectionPath, "utf8");

    expect(selectionSource).toContain("export async function effectiveProviderConfigForTest(");
    expect(selectionSource).toContain("function effectiveTextModelApiModeForTest(");
    expect(selectionSource).toContain("inferTextModelApiMode");
    expect(selectionSource).toContain("normalizeTextModelApiMode");
  });
});
