import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const requestHandlerPath = "src/server/consoleRequestHandler.ts";
const routesPath = "src/server/consolePublicRoutes.ts";

describe("console public routes source boundaries", () => {
  it("keeps public console, asset token, and media route dispatch out of the server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const requestHandlerSource = await readFile(requestHandlerPath, "utf8");

    await expect(access(routesPath)).resolves.toBeUndefined();
    expect(consoleServerSource).not.toContain("handleHealthRoutes(");
    expect(consoleServerSource).not.toContain("handlePublicAssetRoutes(");
    expect(consoleServerSource).not.toContain("handleConsoleAssetRoutes(");
    expect(consoleServerSource).not.toContain("handleMediaRoutes(");
    expect(requestHandlerSource).toContain("handleHealthRoutes(");
    expect(requestHandlerSource).toContain("handlePublicAssetRoutes(");
    expect(requestHandlerSource).toContain("handleConsoleAssetRoutes(");
    expect(requestHandlerSource).toContain("handleMediaRoutes(");
    expect(consoleServerSource).not.toContain('url.pathname === "/api/health"');
    expect(consoleServerSource).not.toContain('service: "haitu-video-console"');
    expect(consoleServerSource).not.toContain("const publicAssetMatch = url.pathname.match");
    expect(consoleServerSource).not.toContain('url.pathname === "/favicon.svg"');
    expect(consoleServerSource).not.toContain('url.pathname.startsWith("/assets/")');
    expect(consoleServerSource).not.toContain('url.pathname.startsWith("/static/")');
    expect(consoleServerSource).not.toContain('url.pathname === "/media"');
    expect(consoleServerSource).not.toContain("readConsoleIndex(consoleDistDir)");
    expect(consoleServerSource).not.toContain("consoleAssetResponse(url.pathname");
    expect(consoleServerSource).not.toContain("mediaResponse(url.searchParams.get");
    expect(consoleServerSource).not.toContain("publicAssetResponse(publicAssetTokenStore");
  });

  it("centralizes public console, asset token, and media route dispatch", async () => {
    const routesSource = await readFile(routesPath, "utf8");

    expect(routesSource).toContain("export async function handleHealthRoutes(");
    expect(routesSource).toContain('url.pathname === "/api/health"');
    expect(routesSource).toContain('service: "haitu-video-console"');
    expect(routesSource).toContain("export async function handlePublicAssetRoutes(");
    expect(routesSource).toContain("export async function handleConsoleAssetRoutes(");
    expect(routesSource).toContain("export async function handleMediaRoutes(");
    expect(routesSource).toContain("publicAssetResponse(");
    expect(routesSource).toContain("readConsoleIndex(");
    expect(routesSource).toContain("consoleAssetResponse(");
    expect(routesSource).toContain("staticResponse(");
    expect(routesSource).toContain("mediaResponse(");
  });
});
