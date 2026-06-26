import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const requestHandlerPath = "src/server/consoleRequestHandler.ts";
const apiRoutesPath = "src/server/consoleApiRoutes.ts";
const routesPath = "src/server/settingsTemplateRoutes.ts";

describe("settings and template routes source boundaries", () => {
  it("keeps settings and template routing out of the console server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const requestHandlerSource = await readFile(requestHandlerPath, "utf8");
    const apiRoutesSource = await readFile(apiRoutesPath, "utf8");

    await expect(access(routesPath)).resolves.toBeUndefined();
    expect(consoleServerSource).toContain("createConsoleRequestHandler(");
    expect(consoleServerSource).not.toContain("handleConsoleApiRoutes(");
    expect(requestHandlerSource).toContain("handleConsoleApiRoutes(");
    expect(consoleServerSource).not.toContain('from "./settingsTemplateRoutes.js"');
    expect(apiRoutesSource).toContain('from "./settingsTemplateRoutes.js"');
    expect(apiRoutesSource).toContain("handleSettingsTemplateRoutes(");
    expect(consoleServerSource).not.toContain('url.pathname === "/api/settings"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/templates"');
  });

  it("centralizes settings and template API routes", async () => {
    const routesSource = await readFile(routesPath, "utf8");

    expect(routesSource).toContain("export async function handleSettingsTemplateRoutes(");
    expect(routesSource).toContain('url.pathname === "/api/settings"');
    expect(routesSource).toContain('url.pathname === "/api/templates"');
    expect(routesSource).toContain("listVideoTemplates");
    expect(routesSource).toContain("saveVideoTemplates");
  });
});
