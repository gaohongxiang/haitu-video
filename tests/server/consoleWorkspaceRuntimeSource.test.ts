import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const requestHandlerPath = "src/server/consoleRequestHandler.ts";
const servicePath = "src/server/consoleWorkspaceRuntime.ts";

describe("console workspace runtime source boundaries", () => {
  it("keeps workspace request context and queue wiring out of the HTTP server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const requestHandlerSource = await readFile(requestHandlerPath, "utf8");

    await expect(access(servicePath)).resolves.toBeUndefined();
    expect(consoleServerSource).not.toContain('from "./consoleWorkspaceRuntime.js"');
    expect(requestHandlerSource).toContain('from "./consoleWorkspaceRuntime.js"');
    expect(requestHandlerSource).toContain("createConsoleRequestContext(");
    expect(consoleServerSource).not.toContain("interface ConsoleRequestContext");
    expect(consoleServerSource).not.toContain("async function createRequestContext(");
    expect(consoleServerSource).not.toContain("function videoJobQueueForWorkspace(");
    expect(consoleServerSource).not.toContain("function createConfiguredMakeVideoPipeline(");
    expect(consoleServerSource).not.toContain("function createModelConfigStore(");
    expect(consoleServerSource).not.toContain("selectedVideoModelConfig");
  });

  it("centralizes workspace stores, queue caching, and configured pipeline assembly", async () => {
    const serviceSource = await readFile(servicePath, "utf8");

    expect(serviceSource).toContain("export interface ConsoleRequestContext");
    expect(serviceSource).toContain("export async function createConsoleRequestContext(");
    expect(serviceSource).toContain("function videoJobQueueForWorkspace(");
    expect(serviceSource).toContain("export function createConfiguredMakeVideoPipeline(");
    expect(serviceSource).toContain("export function createModelConfigStore(");
    expect(serviceSource).toContain("selectedVideoModelConfig");
    expect(serviceSource).not.toContain("ensurePlatformBundles(");
    expect(serviceSource).not.toContain("ensurePlatformModelProvisioning");
    expect(serviceSource).toContain("new WalletStore");
  });
});
