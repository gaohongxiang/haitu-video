import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const requestHandlerPath = "src/server/consoleRequestHandler.ts";
const apiRoutesPath = "src/server/consoleApiRoutes.ts";
const routesPath = "src/server/walletModelRoutes.ts";

describe("wallet and model preference routes source boundaries", () => {
  it("keeps wallet and model preference routing out of the console server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const requestHandlerSource = await readFile(requestHandlerPath, "utf8");
    const apiRoutesSource = await readFile(apiRoutesPath, "utf8");

    await expect(access(routesPath)).resolves.toBeUndefined();
    expect(consoleServerSource).toContain("createConsoleRequestHandler(");
    expect(consoleServerSource).not.toContain("handleConsoleApiRoutes(");
    expect(requestHandlerSource).toContain("handleConsoleApiRoutes(");
    expect(consoleServerSource).not.toContain('from "./walletModelRoutes.js"');
    expect(apiRoutesSource).toContain('from "./walletModelRoutes.js"');
    expect(apiRoutesSource).toContain("handleWalletModelRoutes(");
    expect(consoleServerSource).not.toContain('url.pathname === "/api/wallet"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/wallet/top-up"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/wallet/recharge-orders"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/model-bundles"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/model-service-preference"');
    expect(consoleServerSource).not.toContain("const modelBundleMatch");
  });

  it("centralizes wallet and type-based model service preference API routes", async () => {
    const routesSource = await readFile(routesPath, "utf8");

    expect(routesSource).toContain("export async function handleWalletModelRoutes(");
    expect(routesSource).toContain('url.pathname === "/api/wallet"');
    expect(routesSource).not.toContain('url.pathname === "/api/wallet/top-up"');
    expect(routesSource).not.toContain("WalletTopUpRequest");
    expect(routesSource).not.toContain("wallet.top_up");
    expect(routesSource).toContain('url.pathname === "/api/wallet/recharge-orders"');
    expect(routesSource).toContain('url.pathname === "/api/model-service-preference"');
    expect(routesSource).toContain("textModelConfigId: input.textModelConfigId");
    expect(routesSource).toContain("imageModelConfigId: input.imageModelConfigId");
    expect(routesSource).toContain("videoModelConfigId: input.videoModelConfigId");
    expect(routesSource).not.toContain('url.pathname === "/api/model-bundles"');
    expect(routesSource).not.toContain("modelBundleMatch");
    expect(routesSource).not.toContain("assertModelBundleConfigsExist");
    expect(routesSource).not.toContain("assertModelServicePreferenceBundlesExist");
    expect(routesSource).not.toContain("ensureMissingPlatformBundles(");
    expect(routesSource).not.toContain("ensurePlatformBundles({");
  });
});
