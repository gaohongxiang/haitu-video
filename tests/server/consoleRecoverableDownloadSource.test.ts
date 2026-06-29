import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const queuePath = "src/server/consoleVideoJobQueue.ts";
const servicePath = "src/server/consoleRecoverableDownload.ts";
const failurePath = "src/server/consoleVideoJobFailure.ts";

describe("console recoverable download source boundaries", () => {
  it("keeps recoverable download manifest and failed report assembly out of the job queue", async () => {
    const queueSource = await readFile(queuePath, "utf8");
    const failureSource = await readFile(failurePath, "utf8");

    await expect(access(servicePath)).resolves.toBeUndefined();
    expect(queueSource).not.toContain('from "./consoleRecoverableDownload.js"');
    expect(queueSource).not.toContain("persistRecoverableDownloadFailure(");
    expect(failureSource).toContain('from "./consoleRecoverableDownload.js"');
    expect(failureSource).toContain("persistRecoverableDownloadFailure(");
    expect(queueSource).not.toContain("function buildRecoverableRawManifest(");
    expect(queueSource).not.toContain("function extractRecoverableDownloadFailure(");
    expect(queueSource).not.toContain("interface RecoverableDownloadFailure");
    expect(queueSource).not.toContain("generateJapaneseAdScript");
    expect(queueSource).not.toContain("generateVideoPrompt");
    expect(queueSource).not.toContain("runBasicQc");
    expect(queueSource).not.toContain("generateJapaneseHashtags");
    expect(queueSource).not.toContain("maxSeedanceReferenceImages");
    expect(queueSource).not.toContain("estimateVideoUpstreamCostCny(");
  });

  it("centralizes recoverable download manifest and failed report assembly", async () => {
    const serviceSource = await readFile(servicePath, "utf8");

    expect(serviceSource).toContain("export async function persistRecoverableDownloadFailure(");
    expect(serviceSource).toContain("function buildRecoverableRawManifest(");
    expect(serviceSource).toContain("function extractRecoverableDownloadFailure(");
    expect(serviceSource).toContain("interface RecoverableDownloadFailure");
    expect(serviceSource).toContain("generateJapaneseAdScript");
    expect(serviceSource).toContain("generateVideoPrompt");
    expect(serviceSource).toContain("runBasicQc");
    expect(serviceSource).toContain("generateJapaneseHashtags");
    expect(serviceSource).toContain("maxSeedanceReferenceImages");
    expect(serviceSource).toContain("estimateVideoUpstreamCostCny(");
  });
});
