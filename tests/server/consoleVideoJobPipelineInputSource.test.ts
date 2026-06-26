import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const queuePath = "src/server/consoleVideoJobQueue.ts";
const pipelineInputPath = "src/server/consoleVideoJobPipelineInput.ts";

describe("console video job pipeline input source boundaries", () => {
  it("keeps make-video pipeline input mapping out of the local job queue class", async () => {
    const queueSource = await readFile(queuePath, "utf8");
    const runSource = queueSource.slice(
      queueSource.indexOf("private async run("),
      queueSource.indexOf("if ((await this.store.read(id)).status === \"canceled\")")
    );

    await expect(access(pipelineInputPath)).resolves.toBeUndefined();
    expect(queueSource).toContain('from "./consoleVideoJobPipelineInput.js"');
    expect(queueSource).toContain("createMakeVideoPipelineInput(");
    expect(runSource).not.toContain("productPath: record.productPath");
    expect(runSource).not.toContain("providerName: record.provider ?? \"mock\"");
    expect(runSource).not.toContain("durationSeconds: record.durationSeconds ?? 8");
    expect(runSource).not.toContain("reuseManifestPath: record.reuseManifest");
  });

  it("centralizes make-video pipeline input defaults and option forwarding", async () => {
    const pipelineInputSource = await readFile(pipelineInputPath, "utf8");

    expect(pipelineInputSource).toContain("export function createMakeVideoPipelineInput(");
    expect(pipelineInputSource).toContain("productPath: input.record.productPath");
    expect(pipelineInputSource).toContain("providerName: input.record.provider ?? \"mock\"");
    expect(pipelineInputSource).toContain("durationSeconds: input.record.durationSeconds ?? 8");
    expect(pipelineInputSource).toContain("template: input.record.template ?? \"scene\"");
    expect(pipelineInputSource).toContain("cta: input.record.cta ?? \"今すぐチェック\"");
    expect(pipelineInputSource).toContain("reuseManifestPath: input.record.reuseManifest");
    expect(pipelineInputSource).toContain("referenceImageUrlResolver: input.referenceImageUrlResolver");
  });
});
