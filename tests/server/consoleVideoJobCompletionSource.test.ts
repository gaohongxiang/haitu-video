import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const queuePath = "src/server/consoleVideoJobQueue.ts";
const completionPath = "src/server/consoleVideoJobCompletion.ts";

describe("console video job completion source boundaries", () => {
  it("persists the completed job before the local queue captures its wallet charge", async () => {
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
    expect(runSource).toContain("const completedRecord = await this.update(record, completedPatch)");
    expect(runSource).toContain("captureVideoJobWalletCharge(");
    expect(runSource).not.toContain("estimatedCostCny: report.billing?.estimatedCostCny");
  });

  it("centralizes completed job hashtags and patch construction", async () => {
    const completionSource = await readFile(completionPath, "utf8");

    expect(completionSource).toContain("export async function completeVideoJob(");
    expect(completionSource).toContain("readHashtagsFromRawManifest(");
    expect(completionSource).toContain("completedVideoJobPatch(");
    expect(completionSource).not.toContain("captureVideoJobWalletCharge(");
    expect(completionSource).toContain("billingPolicyStore: input.billingPolicyStore");
  });
});
