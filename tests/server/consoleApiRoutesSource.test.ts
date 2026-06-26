import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const requestHandlerPath = "src/server/consoleRequestHandler.ts";
const apiRoutesPath = "src/server/consoleApiRoutes.ts";

describe("console API route aggregation source boundaries", () => {
  it("keeps authenticated API route ordering out of the console server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const requestHandlerSource = await readFile(requestHandlerPath, "utf8");

    await expect(access(apiRoutesPath)).resolves.toBeUndefined();
    expect(consoleServerSource).not.toContain("handleConsoleApiRoutes(");
    expect(requestHandlerSource).toContain("handleConsoleApiRoutes(");
    expect(consoleServerSource).not.toContain('from "./productRoutes.js"');
    expect(consoleServerSource).not.toContain('from "./walletModelRoutes.js"');
    expect(consoleServerSource).not.toContain('from "./assetReportRoutes.js"');
    expect(consoleServerSource).not.toContain('from "./reviewPublishingRoutes.js"');
    expect(consoleServerSource).not.toContain('from "./modelConfigRoutes.js"');
    expect(consoleServerSource).not.toContain('from "./settingsTemplateRoutes.js"');
    expect(consoleServerSource).not.toContain('from "./videoRoutes.js"');
    expect(consoleServerSource).not.toContain("const productRouteResponse");
    expect(consoleServerSource).not.toContain("const walletModelRouteResponse");
    expect(consoleServerSource).not.toContain("const assetReportRouteResponse");
    expect(consoleServerSource).not.toContain("const reviewPublishingRouteResponse");
    expect(consoleServerSource).not.toContain("const modelConfigRouteResponse");
    expect(consoleServerSource).not.toContain("const settingsTemplateRouteResponse");
    expect(consoleServerSource).not.toContain("const videoRouteResponse");
  });

  it("centralizes authenticated API route ordering", async () => {
    const apiRoutesSource = await readFile(apiRoutesPath, "utf8");

    expect(apiRoutesSource).toContain("export async function handleConsoleApiRoutes(");
    expect(apiRoutesSource).toContain('from "./productRoutes.js"');
    expect(apiRoutesSource).toContain('from "./walletModelRoutes.js"');
    expect(apiRoutesSource).toContain('from "./assetReportRoutes.js"');
    expect(apiRoutesSource).toContain('from "./reviewPublishingRoutes.js"');
    expect(apiRoutesSource).toContain('from "./modelConfigRoutes.js"');
    expect(apiRoutesSource).toContain('from "./settingsTemplateRoutes.js"');
    expect(apiRoutesSource).toContain('from "./videoRoutes.js"');
    expect(apiRoutesSource).toContain("handleProductRoutes(");
    expect(apiRoutesSource).toContain("handleWalletModelRoutes(");
    expect(apiRoutesSource).toContain("handleAssetReportRoutes(");
    expect(apiRoutesSource).toContain("handleReviewPublishingRoutes(");
    expect(apiRoutesSource).toContain("handleModelConfigRoutes(");
    expect(apiRoutesSource).toContain("handleSettingsTemplateRoutes(");
    expect(apiRoutesSource).toContain("handleVideoRoutes(");
  });
});
