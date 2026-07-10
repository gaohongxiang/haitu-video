import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const requestHandlerPath = "src/server/consoleRequestHandler.ts";
const apiRoutesPath = "src/server/consoleApiRoutes.ts";
const routesPath = "src/server/videoRoutes.ts";

describe("video routes source boundaries", () => {
  it("keeps video generation, job, and provider task routing out of the console server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const requestHandlerSource = await readFile(requestHandlerPath, "utf8");
    const apiRoutesSource = await readFile(apiRoutesPath, "utf8");

    await expect(access(routesPath)).resolves.toBeUndefined();
    expect(consoleServerSource).toContain("createConsoleRequestHandler(");
    expect(consoleServerSource).not.toContain("handleConsoleApiRoutes(");
    expect(requestHandlerSource).toContain("handleConsoleApiRoutes(");
    expect(consoleServerSource).not.toContain('from "./videoRoutes.js"');
    expect(apiRoutesSource).toContain('from "./videoRoutes.js"');
    expect(apiRoutesSource).toContain("handleVideoRoutes(");
    expect(consoleServerSource).not.toContain('url.pathname === "/api/preflight"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/make-video"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/video-jobs"');
    expect(consoleServerSource).not.toContain("const videoJobCancelMatch");
    expect(consoleServerSource).not.toContain("const videoJobRetryMatch");
    expect(consoleServerSource).not.toContain("const providerTaskMatch");
  });

  it("centralizes video preflight, billed compatibility generation, queued jobs, and provider task routes", async () => {
    const routesSource = await readFile(routesPath, "utf8");

    expect(routesSource).toContain("export async function handleVideoRoutes(");
    expect(routesSource).toContain('url.pathname === "/api/preflight"');
    expect(routesSource).toContain('url.pathname === "/api/make-video"');
    expect(routesSource).toContain('url.pathname === "/api/video-jobs"');
    expect(routesSource).toContain("videoJobCancelMatch");
    expect(routesSource).toContain("videoJobRetryMatch");
    expect(routesSource).toContain("providerTaskMatch");
    expect(routesSource).toContain("await enqueueVideoJob(body");
    expect(routesSource).toContain("waitForIdle(queued.id)");
    expect(routesSource).toContain("reserveRetryVideoJobBilling");
  });
});
