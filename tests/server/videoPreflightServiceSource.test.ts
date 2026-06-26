import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const videoRoutesPath = "src/server/videoRoutes.ts";
const servicePath = "src/server/videoPreflightService.ts";

describe("video preflight service source boundaries", () => {
  it("keeps video preflight prompt, cost, credit, and warning assembly out of the HTTP server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const videoRoutesSource = await readFile(videoRoutesPath, "utf8");

    await expect(access(servicePath)).resolves.toBeUndefined();
    expect(videoRoutesSource).toContain('from "./videoPreflightService.js"');
    expect(consoleServerSource).not.toContain('from "./videoPreflightService.js"');
    expect(consoleServerSource).not.toContain("async function runConsolePreflight(");
    expect(consoleServerSource).not.toContain("function buildPreflightWarnings(");
    expect(consoleServerSource).not.toContain("async function summarizeTestCredit(");
    expect(consoleServerSource).not.toContain("async function sumPaidEstimatedCostCny(");
    expect(consoleServerSource).not.toContain("function estimateCny(");
  });

  it("centralizes video preflight response assembly", async () => {
    const serviceSource = await readFile(servicePath, "utf8");

    expect(serviceSource).toContain("export async function runConsolePreflight(");
    expect(serviceSource).toContain("function buildPreflightWarnings(");
    expect(serviceSource).toContain("async function summarizeTestCredit(");
    expect(serviceSource).toContain("async function sumPaidEstimatedCostCny(");
    expect(serviceSource).toContain("generateVideoPrompt");
    expect(serviceSource).toContain("buildPaidGenerationReadiness");
  });
});
