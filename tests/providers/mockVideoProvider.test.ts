import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MockVideoProvider } from "../../src/providers/mockVideoProvider.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("MockVideoProvider", () => {
  it("writes a local placeholder output and returns zero provider cost", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "haitu-mock-provider-"));
    tempDirs.push(outDir);
    const provider = new MockVideoProvider();

    const result = await provider.generateVideo({
      jobId: "job-1",
      productSku: "TK-001",
      prompt: "Create a 15 second 9:16 product ad.",
      script: "今すぐチェック",
      durationSeconds: 15,
      aspectRatio: "9:16",
      outputDir: outDir
    });

    expect(result.provider).toBe("mock");
    expect(result.model).toBe("mock-local-placeholder");
    expect(result.cost.amount).toBe(0);
    expect(result.output.width).toBe(1080);
    expect(result.output.height).toBe(1920);
    await expect(readFile(result.output.path, "utf8")).resolves.toContain("job-1");
  });
});
