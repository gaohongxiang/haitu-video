import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const queuePath = "src/server/consoleVideoJobQueue.ts";
const completionPath = "src/server/consoleVideoJobCompletion.ts";

describe("console video job completion source boundaries", () => {
  it("keeps completed job patch and wallet capture out of the local job queue class", async () => {
    const queueSource = await readFile(queuePath, "utf8");
    const runSource = queueSource.slice(
      queueSource.indexOf("private async run("),
      queueSource.indexOf("} catch (error)")
    );

    await expect(access(completionPath)).resolves.toBeUndefined();
    expect(queueSource).toContain('from "./consoleVideoJobCompletion.js"');
    expect(queueSource).toContain("completeVideoJob(");
    expect(runSource).not.toContain("readHashtagsFromRawManifest(");
    expect(runSource).not.toContain("completedVideoJobPatch(");
    expect(runSource).not.toContain("captureVideoJobWalletCharge(");
    expect(runSource).not.toContain("estimatedCostCny: report.billing?.estimatedCostCny");
  });

  it("centralizes completed job hashtags, patch construction, and wallet capture", async () => {
    const completionSource = await readFile(completionPath, "utf8");

    expect(completionSource).toContain("export async function completeVideoJob(");
    expect(completionSource).toContain("readHashtagsFromRawManifest(");
    expect(completionSource).toContain("completedVideoJobPatch(");
    expect(completionSource).toContain("captureVideoJobWalletCharge(");
    expect(completionSource).toContain("estimatedCostCny: input.report.billing?.estimatedCostCny");
  });
});
