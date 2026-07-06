import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const videoRoutesPath = "src/server/videoRoutes.ts";
const servicePath = "src/server/consoleMakeVideoService.ts";

describe("console make-video service source boundaries", () => {
  it("keeps direct make-video orchestration out of the HTTP server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const videoRoutesSource = await readFile(videoRoutesPath, "utf8");

    await expect(access(servicePath)).resolves.toBeUndefined();
    expect(videoRoutesSource).toContain('from "./consoleMakeVideoService.js"');
    expect(consoleServerSource).not.toContain('from "./consoleMakeVideoService.js"');
    expect(consoleServerSource).not.toContain("async function runConsoleMakeVideo(");
    expect(consoleServerSource).not.toContain("const outDirName = sanitizePathSegment(body.outDirName");
    expect(consoleServerSource).not.toContain("reuseManifestPath: body.reuseManifest");
  });

  it("centralizes direct make-video path, readiness, model, and pipeline assembly", async () => {
    const serviceSource = await readFile(servicePath, "utf8");

    expect(serviceSource).toContain("export async function runConsoleMakeVideo(");
    expect(serviceSource).toContain("assertTemplateEnabled");
    expect(serviceSource).toContain("assertPaidProductReady");
    expect(serviceSource).toContain("resolveVideoRequestModel");
    expect(serviceSource).toContain("runMakeVideoPipeline");
    expect(serviceSource).toContain("normalizeFinalVideoLanguage");
    expect(serviceSource).toContain("reuseManifestPath: body.reuseManifest");
  });
});
