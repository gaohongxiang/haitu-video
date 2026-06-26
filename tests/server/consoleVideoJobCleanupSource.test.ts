import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const queuePath = "src/server/consoleVideoJobQueue.ts";
const cleanupPath = "src/server/consoleVideoJobCleanup.ts";

describe("console video job cleanup source boundaries", () => {
  it("keeps generated output file cleanup out of the local job queue class", async () => {
    const queueSource = await readFile(queuePath, "utf8");

    await expect(access(cleanupPath)).resolves.toBeUndefined();
    expect(queueSource).toContain('from "./consoleVideoJobCleanup.js"');
    expect(queueSource).toContain("removeGeneratedVideoJobOutputs(");
    expect(queueSource).not.toContain('from "node:fs/promises"');
    expect(queueSource).not.toContain("rm(");
    expect(queueSource).not.toContain("private async removeGeneratedOutputs(");
  });

  it("centralizes canceled-job generated output cleanup paths", async () => {
    const cleanupSource = await readFile(cleanupPath, "utf8");

    expect(cleanupSource).toContain("export async function removeGeneratedVideoJobOutputs(");
    expect(cleanupSource).toContain('from "node:fs/promises"');
    expect(cleanupSource).toContain('join(outDir, "raw")');
    expect(cleanupSource).toContain('join(outDir, "final")');
    expect(cleanupSource).toContain('join(outDir, "make-video-report.json")');
    expect(cleanupSource).toContain("recursive: true");
    expect(cleanupSource).toContain("force: true");
  });
});
