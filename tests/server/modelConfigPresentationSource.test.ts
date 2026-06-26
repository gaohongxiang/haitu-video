import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const routesPath = "src/server/modelConfigRoutes.ts";
const presentationPath = "src/server/modelConfigPresentation.ts";

describe("model config presentation source boundaries", () => {
  it("centralizes provider config ledger and admin presentation builders", async () => {
    const routesSource = await readFile(routesPath, "utf8");
    const presentationSource = await readFile(presentationPath, "utf8");

    await expect(access(presentationPath)).resolves.toBeUndefined();
    expect(routesSource).toContain('from "./modelConfigPresentation.js"');
    expect(presentationSource).toContain("export async function buildProviderConfig(");
    expect(presentationSource).toContain("export async function buildPlatformModelAdminConfig(");
    expect(presentationSource).toContain("function buildTextModelConfigs(");
    expect(presentationSource).toContain("function buildImageModelConfigs(");
    expect(presentationSource).toContain("function buildVideoModelConfigs(");
    expect(presentationSource).toContain("interface ProviderConfigLedger");
    expect(presentationSource).toContain("interface PlatformModelAdminConfigResponse");
  });
});
