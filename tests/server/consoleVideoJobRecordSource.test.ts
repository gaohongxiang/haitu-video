import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const queuePath = "src/server/consoleVideoJobQueue.ts";
const recordPath = "src/server/consoleVideoJobRecord.ts";
const storePath = "src/server/consoleVideoJobStore.ts";
const completionPath = "src/server/consoleVideoJobCompletion.ts";

describe("console video job record source boundaries", () => {
  it("keeps historical job result hydration out of the local job queue class", async () => {
    const queueSource = await readFile(queuePath, "utf8");

    await expect(access(recordPath)).resolves.toBeUndefined();
    expect(queueSource).toContain('from "./consoleVideoJobRecord.js"');
    expect(queueSource).toContain("canRecoverVideoJobDownload(");
    expect(queueSource).not.toContain("readHashtagsFromRawManifest(");
    expect(queueSource).not.toContain("hydrateVideoJobRecord(");
    expect(queueSource).not.toContain("private async hydrateResultFields(");
    expect(queueSource).not.toContain("private canRecoverDownload(");
    expect(queueSource).not.toContain("export async function readHashtagsFromRawManifest(");
    expect(queueSource).not.toContain("normalizeJapaneseHashtags");
  });

  it("centralizes historical job result hydration and recoverability checks", async () => {
    const recordSource = await readFile(recordPath, "utf8");
    const storeSource = await readFile(storePath, "utf8");
    const completionSource = await readFile(completionPath, "utf8");

    expect(recordSource).toContain("export async function hydrateVideoJobRecord(");
    expect(recordSource).toContain("export function canRecoverVideoJobDownload(");
    expect(recordSource).toContain("export async function readHashtagsFromRawManifest(");
    expect(recordSource).toContain("normalizeJapaneseHashtags");
    expect(recordSource).toContain("reportUrl");
    expect(recordSource).toContain("finalVideoUrl");
    expect(recordSource).toContain("recoverableRawManifestPath");
    expect(storeSource).toContain("hydrateVideoJobRecord(");
    expect(completionSource).toContain("readHashtagsFromRawManifest(");
  });
});
