import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const requestHandlerPath = "src/server/consoleRequestHandler.ts";
const routesPath = "src/server/authAdminRoutes.ts";

describe("auth and admin routes source boundaries", () => {
  it("keeps auth and admin API routing out of the console server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const requestHandlerSource = await readFile(requestHandlerPath, "utf8");

    await expect(access(routesPath)).resolves.toBeUndefined();
    expect(consoleServerSource).not.toContain('from "./authAdminRoutes.js"');
    expect(consoleServerSource).not.toContain("handleAuthAdminRoutes(");
    expect(requestHandlerSource).toContain('from "./authAdminRoutes.js"');
    expect(requestHandlerSource).toContain("handleAuthAdminRoutes(");
    expect(consoleServerSource).not.toContain('url.pathname === "/api/auth/session"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/auth/enter"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/auth/verify-email"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/auth/request-password-reset"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/auth/reset-password"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/auth/logout"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/admin/overview"');
    expect(consoleServerSource).not.toContain("const adminUserMatch");
  });

  it("centralizes auth session, auth actions, and admin API routes", async () => {
    const routesSource = await readFile(routesPath, "utf8");

    expect(routesSource).toContain("export async function handleAuthAdminRoutes(");
    expect(routesSource).toContain('url.pathname === "/api/auth/session"');
    expect(routesSource).toContain('url.pathname === "/api/auth/enter"');
    expect(routesSource).toContain('url.pathname === "/api/auth/verify-email"');
    expect(routesSource).toContain('url.pathname === "/api/auth/request-password-reset"');
    expect(routesSource).toContain('url.pathname === "/api/auth/reset-password"');
    expect(routesSource).toContain('url.pathname === "/api/auth/logout"');
    expect(routesSource).toContain('url.pathname === "/api/admin/overview"');
    expect(routesSource).toContain("adminUserMatch");
    expect(routesSource).toContain("buildAdminOverview");
    expect(routesSource).toContain("buildAdminUserDetail");
  });
});
