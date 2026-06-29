import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const queuePath = "src/server/consoleVideoJobQueue.ts";
const statePatchPath = "src/server/consoleVideoJobStatePatch.ts";
const completionPath = "src/server/consoleVideoJobCompletion.ts";

describe("console video job state patch source boundaries", () => {
  it("keeps retry and recover result reset patches out of the local job queue class", async () => {
    const queueSource = await readFile(queuePath, "utf8");
    const retryRecoverSource = queueSource.slice(
      queueSource.indexOf("async retry("),
      queueSource.indexOf("async list()")
    );

    await expect(access(statePatchPath)).resolves.toBeUndefined();
    expect(queueSource).toContain('from "./consoleVideoJobStatePatch.js"');
    expect(queueSource).toContain("queuedRetryVideoJobPatch(");
    expect(queueSource).toContain("queuedRecoverDownloadVideoJobPatch(");
    expect(retryRecoverSource).not.toContain("reportPath: undefined");
    expect(retryRecoverSource).not.toContain("rawOutputPath: undefined");
    expect(retryRecoverSource).not.toContain("finalOutputPath: undefined");
    expect(retryRecoverSource).not.toContain("providerVideoUrl: undefined");
    expect(retryRecoverSource).not.toContain("errorDetails: undefined");
  });

  it("keeps completed job result mapping out of the local job queue class", async () => {
    const queueSource = await readFile(queuePath, "utf8");
    const runSource = queueSource.slice(
      queueSource.indexOf("private async run("),
      queueSource.indexOf("} catch (error)")
    );
    const completionSource = await readFile(completionPath, "utf8");

    expect(queueSource).not.toContain("completedVideoJobPatch(");
    expect(completionSource).toContain("completedVideoJobPatch(");
    expect(runSource).not.toContain("productSku: report.productSku");
    expect(runSource).not.toContain("reportUrl: mediaUrl(report.reportPath)");
    expect(runSource).not.toContain("rawOutputPath: report.raw.outputPath");
    expect(runSource).not.toContain("finalVideoUrl: report.final?.outputPath");
    expect(runSource).not.toContain("upstreamEstimatedCostCny: record.apiBillingMode");
  });

  it("centralizes retry, recover, and completed result patches", async () => {
    const statePatchSource = await readFile(statePatchPath, "utf8");

    expect(statePatchSource).toContain("export function queuedRetryVideoJobPatch(");
    expect(statePatchSource).toContain("export function queuedRecoverDownloadVideoJobPatch(");
    expect(statePatchSource).toContain("export function completedVideoJobPatch(");
    expect(statePatchSource).toContain("reportPath: undefined");
    expect(statePatchSource).toContain("rawOutputPath: undefined");
    expect(statePatchSource).toContain("finalOutputPath: undefined");
    expect(statePatchSource).toContain("providerVideoUrl: undefined");
    expect(statePatchSource).toContain("errorDetails: undefined");
    expect(statePatchSource).toContain("productSku: input.report.productSku");
    expect(statePatchSource).toContain("upstreamActualCostCny");
    expect(statePatchSource).toContain("upstreamEstimatedCostCny: upstreamActualCostCny");
  });
});
