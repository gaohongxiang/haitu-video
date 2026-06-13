import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import ffmpeg from "@ffmpeg-installer/ffmpeg";

import { buildAssSubtitles } from "./subtitleAss.js";

export interface PostprocessVideoInput {
  inputVideoPath: string;
  outputDir: string;
  outputFileName: string;
  subtitleLines: string[];
  durationSeconds: number;
  width: number;
  height: number;
  ffmpegPath?: string;
  runCommand?: RunCommand;
  probeOutput?: ProbeOutput;
}

export interface PostprocessVideoResult {
  outputPath: string;
  subtitlePath: string;
  metadata: VideoMetadata;
}

type RunCommand = (command: string, args: string[]) => Promise<void>;
type ProbeOutput = (path: string) => Promise<VideoMetadata>;

export interface VideoMetadata {
  width: number;
  height: number;
  durationSeconds: number;
}

export async function postprocessVideo(
  input: PostprocessVideoInput
): Promise<PostprocessVideoResult> {
  await mkdir(input.outputDir, { recursive: true });
  const outputPath = join(input.outputDir, input.outputFileName);
  const subtitlePath = outputPath.replace(/\.[^.]+$/, ".ass");
  const subtitles = buildAssSubtitles({
    lines: input.subtitleLines,
    durationSeconds: input.durationSeconds,
    width: input.width,
    height: input.height
  });
  await writeFile(subtitlePath, subtitles, "utf8");

  const ffmpegPath = input.ffmpegPath ?? process.env.FFMPEG_PATH ?? ffmpeg.path ?? "ffmpeg";
  const args = [
    "-y",
    "-i",
    input.inputVideoPath,
    "-vf",
    `ass=${escapeFilterPath(subtitlePath)}`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "copy",
    outputPath
  ];

  await (input.runCommand ?? runCommand)(ffmpegPath, args);
  const metadata =
    input.probeOutput === undefined
      ? await probeVideo(ffmpegPath, outputPath, {
          width: input.width,
          height: input.height,
          durationSeconds: input.durationSeconds
        })
      : await input.probeOutput(outputPath);

  return {
    outputPath,
    subtitlePath,
    metadata
  };
}

function probeVideo(
  command: string,
  path: string,
  fallback: VideoMetadata
): Promise<VideoMetadata> {
  return new Promise((resolve) => {
    const child = spawn(command, ["-hide_banner", "-i", path], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", () => {
      resolve(fallback);
    });
    child.on("close", () => {
      resolve(parseProbeOutput(stderr) ?? fallback);
    });
  });
}

export function parseProbeOutput(output: string): VideoMetadata | undefined {
  const duration = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(output);
  const size = /Video:[^\n]*?,\s*(\d+)x(\d+)[\s,]/.exec(output);
  if (!duration || !size) {
    return undefined;
  }
  return {
    width: Number(size[1]),
    height: Number(size[2]),
    durationSeconds:
      Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])
  };
}

function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(`ffmpeg not found. Install ffmpeg or set FFMPEG_PATH. Tried: ${command}`));
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg failed with exit code ${code ?? "unknown"}: ${stderr.trim()}`));
    });
  });
}
