import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const queuePath = "src/server/consoleVideoJobQueue.ts";
const factoryPath = "src/server/consoleVideoJobRecordFactory.ts";

describe("console video job record factory source boundaries", () => {
  it("keeps queued job record construction out of the local job queue class", async () => {
    const queueSource = await readFile(queuePath, "utf8");
    const enqueueSource = queueSource.slice(
      queueSource.indexOf("async enqueue("),
      queueSource.indexOf("async get(")
    );

    await expect(access(factoryPath)).resolves.toBeUndefined();
    expect(queueSource).toContain('from "./consoleVideoJobRecordFactory.js"');
    expect(queueSource).toContain("createQueuedVideoJobRecord(");
    expect(enqueueSource).not.toContain("const provider = request.provider ?? settings.defaultProvider");
    expect(enqueueSource).not.toContain("durationSeconds = request.duration ?? settings.defaultDurationSeconds");
    expect(enqueueSource).not.toContain("template = request.template ?? settings.defaultTemplate");
    expect(enqueueSource).not.toContain("normalizeFinalVideoLanguage(");
    expect(enqueueSource).not.toContain("confirmPaid: request.confirmPaid ?? provider !== \"mock\"");
    expect(enqueueSource).not.toContain("function sanitizeLines(");
  });

  it("centralizes queued job record defaults and request normalization", async () => {
    const factorySource = await readFile(factoryPath, "utf8");

    expect(factorySource).toContain("export function createQueuedVideoJobRecord(");
    expect(factorySource).toContain("request.provider ?? settings.defaultProvider");
    expect(factorySource).toContain("request.duration ?? settings.defaultDurationSeconds");
    expect(factorySource).toContain("request.template ?? settings.defaultTemplate");
    expect(factorySource).toContain("referenceImages: sanitizeReferenceImages(request.referenceImages)");
    expect(factorySource).toContain("function sanitizeReferenceImages(lines?: string[]): string[] | undefined");
    expect(factorySource).toContain("normalizeFinalVideoLanguage(");
    expect(factorySource).toContain("confirmPaid: request.confirmPaid ?? provider !== \"mock\"");
    expect(factorySource).toContain("function sanitizeLines(");
  });
});
