import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const queuePath = "src/server/consoleVideoJobQueue.ts";
const errorPath = "src/server/consoleVideoJobError.ts";
const failurePath = "src/server/consoleVideoJobFailure.ts";

describe("console video job error source boundaries", () => {
  it("keeps provider error serialization and readable messages out of the local job queue class", async () => {
    const queueSource = await readFile(queuePath, "utf8");
    const failureSource = await readFile(failurePath, "utf8");

    await expect(access(errorPath)).resolves.toBeUndefined();
    expect(queueSource).not.toContain('from "./consoleVideoJobError.js"');
    expect(queueSource).not.toContain("serializeVideoJobError(");
    expect(queueSource).not.toContain("readableVideoJobError(");
    expect(queueSource).not.toContain("isDownloadRecoveryRun(");
    expect(failureSource).toContain('from "./consoleVideoJobError.js"');
    expect(failureSource).toContain("serializeVideoJobError(");
    expect(failureSource).toContain("readableVideoJobError(");
    expect(failureSource).toContain("isDownloadRecoveryRun(");
    expect(queueSource).not.toContain('from "../core/videoProviderErrors.js"');
    expect(queueSource).not.toContain("function serializeJobError(");
    expect(queueSource).not.toContain("function readableJobError(");
    expect(queueSource).not.toContain("function isDownloadRecoveryRun(");
  });

  it("centralizes provider error serialization, readable messages, and recovery-run detection", async () => {
    const errorSource = await readFile(errorPath, "utf8");

    expect(errorSource).toContain("export function serializeVideoJobError(");
    expect(errorSource).toContain("export function readableVideoJobError(");
    expect(errorSource).toContain("export function isDownloadRecoveryRun(");
    expect(errorSource).toContain('from "../core/videoProviderErrors.js"');
    expect(errorSource).toContain("readableVideoProviderError(");
    expect(errorSource).toContain("providerPhase");
    expect(errorSource).toContain("recoverableRawManifestPath");
  });
});
