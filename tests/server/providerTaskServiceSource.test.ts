import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const videoRoutesPath = "src/server/videoRoutes.ts";
const servicePath = "src/server/providerTaskService.ts";

describe("provider task service source boundaries", () => {
  it("keeps provider task query, list, cancel, and query parsing out of the HTTP server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const videoRoutesSource = await readFile(videoRoutesPath, "utf8");

    await expect(access(servicePath)).resolves.toBeUndefined();
    expect(videoRoutesSource).toContain('from "./providerTaskService.js"');
    expect(consoleServerSource).not.toContain('from "./providerTaskService.js"');
    expect(consoleServerSource).not.toContain("async function getProviderTask(");
    expect(consoleServerSource).not.toContain("async function listProviderTasks(");
    expect(consoleServerSource).not.toContain("async function cancelQueuedProviderTask(");
    expect(consoleServerSource).not.toContain("function providerUsageListRequestFromUrl(");
    expect(consoleServerSource).not.toContain("function providerTaskStatusFromQuery(");
    expect(consoleServerSource).not.toContain("function providerServiceTierFromQuery(");
    expect(consoleServerSource).not.toContain("function taskIdsFromQuery(");
  });

  it("centralizes provider task read-only usage and queued cancel workflows", async () => {
    const serviceSource = await readFile(servicePath, "utf8");

    expect(serviceSource).toContain("export async function getProviderTask(");
    expect(serviceSource).toContain("export async function listProviderTasks(");
    expect(serviceSource).toContain("export async function cancelQueuedProviderTask(");
    expect(serviceSource).toContain("function providerUsageListRequestFromUrl(");
    expect(serviceSource).toContain("function providerTaskStatusFromQuery(");
    expect(serviceSource).toContain("function providerServiceTierFromQuery(");
    expect(serviceSource).toContain("function taskIdsFromQuery(");
    expect(serviceSource).toContain("VolcengineUsageClient");
  });
});
