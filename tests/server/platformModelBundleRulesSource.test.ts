import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const servicePath = "src/server/platformModelProvisioning.ts";
const rulesPath = "src/server/platformModelBundleRules.ts";

describe("platform model bundle rules source boundaries", () => {
  it("keeps platform bundle selection rules outside the provisioning service", async () => {
    const serviceSource = await readFile(servicePath, "utf8");

    await expect(access(rulesPath)).resolves.toBeUndefined();
    expect(serviceSource).toContain('from "./platformModelBundleRules.js"');
    expect(serviceSource).not.toContain('from "./platformModelDefinitions.js"');
    expect(serviceSource).not.toContain("function isEnabledPlatformConfig(");
    expect(serviceSource).not.toContain("function preferredPlatformConfig(");
    expect(serviceSource).not.toContain("function lowCostPlatformConfig(");
    expect(serviceSource).not.toContain("function qualityPlatformConfig(");
    expect(serviceSource).not.toContain("const platformTextDefinitions");
    expect(serviceSource).not.toContain("async function ensureAvailablePlatformConfigs(");
  });

  it("centralizes managed platform bundle ids and config selection helpers", async () => {
    const rulesSource = await readFile(rulesPath, "utf8");

    expect(rulesSource).toContain("export const platformQualityBundleId");
    expect(rulesSource).toContain("export const platformLowCostBundleId");
    expect(rulesSource).toContain("export const stalePlatformBundleIds");
    expect(rulesSource).toContain("export const managedPlatformBundleIds");
    expect(rulesSource).toContain("export function isEnabledPlatformConfig(");
    expect(rulesSource).toContain("export function preferredPlatformConfig(");
    expect(rulesSource).toContain("export function lowCostPlatformConfig(");
    expect(rulesSource).toContain("export function qualityPlatformConfig(");
    expect(rulesSource).toContain("export function normalizeOptionalText(");
    expect(rulesSource).not.toContain("HAITU_PLATFORM_");
  });
});
