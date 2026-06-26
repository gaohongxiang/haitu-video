import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const requestHandlerPath = "src/server/consoleRequestHandler.ts";
const apiRoutesPath = "src/server/consoleApiRoutes.ts";
const routesPath = "src/server/reviewPublishingRoutes.ts";

describe("review publishing routes source boundaries", () => {
  it("keeps review, internal validation, and publish package routing out of the console server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const requestHandlerSource = await readFile(requestHandlerPath, "utf8");
    const apiRoutesSource = await readFile(apiRoutesPath, "utf8");

    await expect(access(routesPath)).resolves.toBeUndefined();
    expect(consoleServerSource).toContain("createConsoleRequestHandler(");
    expect(consoleServerSource).not.toContain("handleConsoleApiRoutes(");
    expect(requestHandlerSource).toContain("handleConsoleApiRoutes(");
    expect(consoleServerSource).not.toContain('from "./reviewPublishingRoutes.js"');
    expect(apiRoutesSource).toContain('from "./reviewPublishingRoutes.js"');
    expect(apiRoutesSource).toContain("handleReviewPublishingRoutes(");
    expect(consoleServerSource).not.toContain('url.pathname === "/api/internal-validation/export.csv"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/internal-validation/top-up"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/publish-packages"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/publish-packages/export.csv"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/reviews/select-final"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/reviews/rate-version"');
  });

  it("centralizes review, internal validation, and publish package API routes", async () => {
    const routesSource = await readFile(routesPath, "utf8");

    expect(routesSource).toContain("export async function handleReviewPublishingRoutes(");
    expect(routesSource).toContain('url.pathname === "/api/internal-validation/export.csv"');
    expect(routesSource).toContain('url.pathname === "/api/internal-validation/top-up"');
    expect(routesSource).toContain('url.pathname === "/api/publish-packages"');
    expect(routesSource).toContain('url.pathname === "/api/publish-packages/export.csv"');
    expect(routesSource).toContain('url.pathname === "/api/reviews/select-final"');
    expect(routesSource).toContain('url.pathname === "/api/reviews/rate-version"');
    expect(routesSource).toContain("createPublishPackagesBatch");
    expect(routesSource).toContain("withPublishPackageFileUrl");
  });
});
