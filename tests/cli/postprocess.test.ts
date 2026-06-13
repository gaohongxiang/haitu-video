import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runPostprocessCli } from "../../src/cli/postprocess.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("runPostprocessCli", () => {
  it("loads a video manifest and writes a final manifest", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "haitu-postprocess-cli-"));
    tempDirs.push(outDir);
    const manifestPath = join(outDir, "manifest.json");
    const videoPath = join(outDir, "raw.mp4");
    await writeFile(videoPath, "fake video", "utf8");
    await writeFile(
      manifestPath,
      JSON.stringify({
        jobId: "job-1",
        script: {
          subtitleLines: ["通勤に便利。", "今すぐチェック"]
        },
        output: {
          path: videoPath,
          width: 1080,
          height: 1920,
          durationSeconds: 8
        }
      }),
      "utf8"
    );
    const calls: string[][] = [];

    const summary = await runPostprocessCli(
      ["--manifest", manifestPath, "--outDir", outDir, "--ffmpegPath", "/bin/echo"],
      {
        runCommand: async (_command, args) => {
          calls.push(args);
        },
        probeOutput: async () => {
          return {
            width: 496,
            height: 864,
            durationSeconds: 8.08
          };
        }
      }
    );

    expect(summary.outputPath).toBe(join(outDir, "job-1.final.mp4"));
    expect(summary.finalManifestPath).toBe(join(outDir, "final-manifest.json"));
    expect(calls).toHaveLength(1);
    await expect(readFile(summary.finalManifestPath, "utf8")).resolves.toContain(
      "\"type\": \"postprocessed_final\""
    );
    await expect(readFile(summary.finalManifestPath, "utf8")).resolves.toContain(
      "\"width\": 496"
    );
  });
});
