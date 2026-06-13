import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseProbeOutput, postprocessVideo } from "../../src/postprocess/postprocessVideo.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("postprocessVideo", () => {
  it("writes an ASS subtitle file and invokes ffmpeg with subtitle burn-in", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "haitu-postprocess-"));
    tempDirs.push(outDir);
    const calls: string[][] = [];

    const result = await postprocessVideo({
      inputVideoPath: "input.mp4",
      outputDir: outDir,
      outputFileName: "final.mp4",
      subtitleLines: ["通勤に便利。", "今すぐチェック"],
      durationSeconds: 8,
      width: 1080,
      height: 1920,
      ffmpegPath: "/bin/echo",
      runCommand: async (_command, args) => {
        calls.push(args);
      }
    });

    expect(result.outputPath).toBe(join(outDir, "final.mp4"));
    expect(result.subtitlePath).toBe(join(outDir, "final.ass"));
    await expect(readFile(result.subtitlePath, "utf8")).resolves.toContain("今すぐチェック");
    expect(calls[0]).toEqual([
      "-y",
      "-i",
      "input.mp4",
      "-vf",
      `ass=${escapeFilterPath(result.subtitlePath)}`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "copy",
      result.outputPath
    ]);
  });

  it("parses real ffmpeg probe output without confusing codec hex ids for dimensions", () => {
    const metadata = parseProbeOutput(
      [
        "Duration: 00:00:08.08, start: 0.000000, bitrate: 1483 kb/s",
        "Stream #0:0(und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 496x864, 1351 kb/s, 24 fps"
      ].join("\n")
    );

    expect(metadata).toEqual({
      width: 496,
      height: 864,
      durationSeconds: 8.08
    });
  });
});

function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
}
