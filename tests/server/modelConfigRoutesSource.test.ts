import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const requestHandlerPath = "src/server/consoleRequestHandler.ts";
const apiRoutesPath = "src/server/consoleApiRoutes.ts";
const routesPath = "src/server/modelConfigRoutes.ts";

describe("model config routes source boundaries", () => {
  it("keeps model provider config routing out of the console server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const requestHandlerSource = await readFile(requestHandlerPath, "utf8");
    const apiRoutesSource = await readFile(apiRoutesPath, "utf8");

    await expect(access(routesPath)).resolves.toBeUndefined();
    expect(consoleServerSource).toContain("createConsoleRequestHandler(");
    expect(consoleServerSource).not.toContain("handleConsoleApiRoutes(");
    expect(requestHandlerSource).toContain("handleConsoleApiRoutes(");
    expect(consoleServerSource).not.toContain('from "./modelConfigRoutes.js"');
    expect(apiRoutesSource).toContain('from "./modelConfigRoutes.js"');
    expect(apiRoutesSource).toContain("handleModelConfigRoutes(");
    expect(consoleServerSource).not.toContain('url.pathname === "/api/provider-config"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/platform/model-configs"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/admin/platform-model-configs"');
    expect(consoleServerSource).not.toContain("const platformModelConfigMatch");
    expect(consoleServerSource).not.toContain("const providerModelsMatch");
    expect(consoleServerSource).not.toContain("const modelConfigTestMatch");
    expect(consoleServerSource).not.toContain("const modelConfigMatch");
    expect(consoleServerSource).not.toContain("function parseModelProviderId(");
  });

  it("centralizes provider config, platform config, test, discovery, and key routes", async () => {
    const routesSource = await readFile(routesPath, "utf8");

    expect(routesSource).toContain("export async function handleModelConfigRoutes(");
    expect(routesSource).toContain('url.pathname === "/api/provider-config"');
    expect(routesSource).toContain('url.pathname === "/api/platform/model-configs"');
    expect(routesSource).toContain('url.pathname === "/api/admin/platform-model-configs"');
    expect(routesSource).toContain("/^\\/api\\/admin\\/platform-model-configs\\/");
    expect(routesSource).toContain("platformModelConfigMatch");
    expect(routesSource).toContain("providerModelsMatch");
    expect(routesSource).toContain("modelConfigTestMatch");
    expect(routesSource).toContain("modelConfigMatch");
    expect(routesSource).toContain("parseModelProviderId");
    expect(routesSource).toContain("buildProviderConfig");
    expect(routesSource).not.toContain("ensurePlatformBundles");
  });
});
