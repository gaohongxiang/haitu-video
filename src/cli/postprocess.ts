import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { postprocessVideo } from "../postprocess/postprocessVideo.js";

export interface PostprocessSummary {
  outputPath: string;
  subtitlePath: string;
  finalManifestPath: string;
}

export interface PostprocessCliOptions {
  runCommand?: (command: string, args: string[]) => Promise<void>;
  probeOutput?: (path: string) => Promise<{
    width: number;
    height: number;
    durationSeconds: number;
  }>;
}

interface PostprocessArgs {
  manifestPath: string;
  outDir?: string;
  ffmpegPath?: string;
}

interface SourceManifest {
  jobId: string;
  script: {
    subtitleLines: string[];
  };
  output: {
    path: string;
    width: number;
    height: number;
    durationSeconds: number;
  };
}

export async function runPostprocessCli(
  argv: string[],
  options: PostprocessCliOptions = {}
): Promise<PostprocessSummary> {
  const args = parseArgs(argv);
  const manifest = JSON.parse(await readFile(args.manifestPath, "utf8")) as SourceManifest;
  const outDir = args.outDir ?? join(dirname(args.manifestPath), "final");
  const result = await postprocessVideo({
    inputVideoPath: manifest.output.path,
    outputDir: outDir,
    outputFileName: `${manifest.jobId}.final.mp4`,
    subtitleLines: manifest.script.subtitleLines,
    durationSeconds: manifest.output.durationSeconds,
    width: manifest.output.width,
    height: manifest.output.height,
    ffmpegPath: args.ffmpegPath,
    runCommand: options.runCommand,
    probeOutput: options.probeOutput
  });
  const finalManifestPath = join(outDir, "final-manifest.json");
  await writeFile(
    finalManifestPath,
    JSON.stringify(
      {
        type: "postprocessed_final",
        sourceManifest: args.manifestPath,
        output: {
          path: result.outputPath,
          subtitlePath: result.subtitlePath,
          width: result.metadata.width,
          height: result.metadata.height,
          durationSeconds: result.metadata.durationSeconds,
          mimeType: "video/mp4"
        }
      },
      null,
      2
    ),
    "utf8"
  );

  return {
    outputPath: result.outputPath,
    subtitlePath: result.subtitlePath,
    finalManifestPath
  };
}

function parseArgs(argv: string[]): PostprocessArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near "${key ?? ""}"`);
    }
    values.set(key.slice(2), value);
  }

  const manifestPath = values.get("manifest");
  if (!manifestPath) {
    throw new Error("Missing required argument: --manifest");
  }

  return {
    manifestPath,
    outDir: values.get("outDir"),
    ffmpegPath: values.get("ffmpegPath")
  };
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? fileURLToPath(new URL(`file://${process.argv[1]}`)) : "";

if (currentFile === invokedFile) {
  runPostprocessCli(process.argv.slice(2))
    .then((summary) => {
      process.stdout.write(
        [
          `Final video: ${summary.outputPath}`,
          `Subtitles: ${summary.subtitlePath}`,
          `Manifest: ${summary.finalManifestPath}`
        ].join("\n") + "\n"
      );
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
