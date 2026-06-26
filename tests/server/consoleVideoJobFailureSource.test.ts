import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const queuePath = "src/server/consoleVideoJobQueue.ts";
const failurePath = "src/server/consoleVideoJobFailure.ts";

describe("console video job failure source boundaries", () => {
  it("keeps failed job patch construction out of the local job queue class", async () => {
    const queueSource = await readFile(queuePath, "utf8");
    const catchSource = queueSource.slice(
      queueSource.indexOf("} catch (error)"),
      queueSource.indexOf("releaseVideoJobWalletReservation(")
    );

    await expect(access(failurePath)).resolves.toBeUndefined();
    expect(queueSource).toContain('from "./consoleVideoJobFailure.js"');
    expect(queueSource).toContain("failedVideoJobPatch(");
    expect(catchSource).not.toContain("const errorDetails = {");
    expect(catchSource).not.toContain("const recoverable = await persistRecoverableDownloadFailure(");
    expect(catchSource).not.toContain("const mergedErrorDetails = {");
    expect(catchSource).not.toContain("readableVideoJobError(");
    expect(catchSource).not.toContain("canRecoverDownload: true");
  });

  it("centralizes failed job readable errors and recoverable-download patches", async () => {
    const failureSource = await readFile(failurePath, "utf8");

    expect(failureSource).toContain("export async function failedVideoJobPatch(");
    expect(failureSource).toContain("serializeVideoJobError(");
    expect(failureSource).toContain("persistRecoverableDownloadFailure(");
    expect(failureSource).toContain("readableVideoJobError(");
    expect(failureSource).toContain("isDownloadRecoveryRun(");
    expect(failureSource).toContain("mergedErrorDetails");
    expect(failureSource).toContain("canRecoverDownload: true");
  });
});
