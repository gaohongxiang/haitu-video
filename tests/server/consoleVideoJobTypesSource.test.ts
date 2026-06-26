import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const queuePath = "src/server/consoleVideoJobQueue.ts";
const typesPath = "src/server/consoleVideoJobTypes.ts";
const helperPaths = [
  "src/server/consoleRecoverableDownload.ts",
  "src/server/consoleVideoJobCompletion.ts",
  "src/server/consoleVideoJobError.ts",
  "src/server/consoleVideoJobFailure.ts",
  "src/server/consoleVideoJobPersistence.ts",
  "src/server/consoleVideoJobPipelineInput.ts",
  "src/server/consoleVideoJobRecord.ts",
  "src/server/consoleVideoJobRecordFactory.ts",
  "src/server/consoleVideoJobRestartPlan.ts",
  "src/server/consoleVideoJobStatePatch.ts",
  "src/server/consoleVideoJobStore.ts",
  "src/server/videoJobBilling.ts"
];

describe("console video job type source boundaries", () => {
  it("keeps shared video job data contracts out of the local job queue class module", async () => {
    const queueSource = await readFile(queuePath, "utf8");

    await expect(access(typesPath)).resolves.toBeUndefined();
    expect(queueSource).toContain('from "./consoleVideoJobTypes.js"');
    expect(queueSource).not.toContain("export interface VideoJobRequest");
    expect(queueSource).not.toContain("export interface VideoJobRecord");
    expect(queueSource).not.toContain("export interface VideoJobErrorDetails");
  });

  it("centralizes shared video job request, record, and error detail contracts", async () => {
    const typesSource = await readFile(typesPath, "utf8");

    expect(typesSource).toContain("export interface VideoJobRequest");
    expect(typesSource).toContain("export interface VideoJobRecord");
    expect(typesSource).toContain("export interface VideoJobErrorDetails");
    expect(typesSource).toContain("providerModelConfigId?: string");
    expect(typesSource).toContain("status: \"queued\" | \"running\" | \"completed\" | \"failed\" | \"canceled\"");
    expect(typesSource).toContain("recoverableRawManifestPath?: string");
  });

  it("keeps helper modules type-coupled to the shared contracts instead of the queue class", async () => {
    for (const path of helperPaths) {
      const source = await readFile(path, "utf8");
      expect(source, path).not.toContain('from "./consoleVideoJobQueue.js"');
      expect(source, path).toContain('from "./consoleVideoJobTypes.js"');
    }
  });
});
