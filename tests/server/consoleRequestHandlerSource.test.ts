import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const requestHandlerPath = "src/server/consoleRequestHandler.ts";

describe("console request handler source boundaries", () => {
  it("keeps request routing orchestration out of the HTTP server adapter", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");

    await expect(access(requestHandlerPath)).resolves.toBeUndefined();
    expect(consoleServerSource).toContain("createConsoleRequestHandler(");
    expect(consoleServerSource).not.toContain("async function handle(");
    expect(consoleServerSource).not.toContain('from "./authAdminRoutes.js"');
    expect(consoleServerSource).not.toContain('from "./consoleApiRoutes.js"');
    expect(consoleServerSource).not.toContain('from "./paymentWebhookRoutes.js"');
    expect(consoleServerSource).not.toContain('from "./consolePublicRoutes.js"');
    expect(consoleServerSource).not.toContain('from "./consoleErrorResponse.js"');
    expect(consoleServerSource).not.toContain('from "./consoleWorkspaceRuntime.js"');
    expect(consoleServerSource).not.toContain("handleAuthAdminRoutes(");
    expect(consoleServerSource).not.toContain("handleConsoleApiRoutes(");
    expect(consoleServerSource).not.toContain("handleHealthRoutes(");
    expect(consoleServerSource).not.toContain("handlePublicAssetRoutes(");
    expect(consoleServerSource).not.toContain("handlePaymentWebhookRoutes(");
    expect(consoleServerSource).not.toContain("handleConsoleAssetRoutes(");
    expect(consoleServerSource).not.toContain("handleMediaRoutes(");
    expect(consoleServerSource).not.toContain("createConsoleRequestContext(");
    expect(consoleServerSource).not.toContain("isPublicConsoleRoute(");
    expect(consoleServerSource).not.toContain("consoleErrorResponse(");
    expect(consoleServerSource).not.toContain('jsonResponse({ error: "Not found" }');
  });

  it("centralizes request routing, auth gate, workspace context, and error mapping", async () => {
    const requestHandlerSource = await readFile(requestHandlerPath, "utf8");

    expect(requestHandlerSource).toContain("export function createConsoleRequestHandler(");
    expect(requestHandlerSource).toContain("handleAuthAdminRoutes(");
    expect(requestHandlerSource).toContain("handleConsoleApiRoutes(");
    expect(requestHandlerSource).toContain("handlePaymentWebhookRoutes(");
    expect(requestHandlerSource).toContain("handleHealthRoutes(");
    expect(requestHandlerSource).toContain("handlePublicAssetRoutes(");
    expect(requestHandlerSource).toContain("handleConsoleAssetRoutes(");
    expect(requestHandlerSource).toContain("handleMediaRoutes(");
    expect(requestHandlerSource).toContain("createConsoleRequestContext(");
    expect(requestHandlerSource).toContain("isPublicConsoleRoute(");
    expect(requestHandlerSource).toContain("consoleErrorResponse(");
    expect(requestHandlerSource).toContain('jsonResponse({ error: "Not found" }');
  });
});
