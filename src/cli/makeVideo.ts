import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";

import type { ScriptTemplate } from "../core/scriptGenerator.js";
import { runMakeVideoPipeline, type MakeVideoReport } from "../pipeline/makeVideoPipeline.js";
import type { VideoProviderName } from "../providers/providerFactory.js";
import { DEFAULT_WORKSPACE_ID, getWorkspacePaths, resolveDataDir } from "../server/storagePaths.js";

export interface MakeVideoCliOptions {
  cwd?: string;
  fetchImpl?: typeof fetch;
  postprocessVideo?: Parameters<typeof runMakeVideoPipeline>[0]["postprocessVideo"];
}

interface MakeVideoArgs {
  productPath: string;
  outDir: string;
  providerName: VideoProviderName;
  durationSeconds: number;
  cta: string;
  template: ScriptTemplate;
  confirmPaid: boolean;
  tokenPriceCnyPerMillion: number;
  forceRegenerate: boolean;
  reuseManifestPath?: string;
}

export async function runMakeVideoCli(
  argv: string[],
  options: MakeVideoCliOptions = {}
): Promise<MakeVideoReport> {
  loadDotenv({
    path: join(options.cwd ?? process.cwd(), ".env"),
    override: false,
    quiet: true
  });
  const cwd = options.cwd ?? process.cwd();
  const args = parseArgs(argv, cwd);
  return runMakeVideoPipeline({
    productPath: args.productPath,
    outDir: args.outDir,
    providerName: args.providerName,
    durationSeconds: args.durationSeconds,
    cta: args.cta,
    template: args.template,
    confirmPaid: args.confirmPaid,
    tokenPriceCnyPerMillion: args.tokenPriceCnyPerMillion,
    forceRegenerate: args.forceRegenerate,
    reuseManifestPath: args.reuseManifestPath,
    cwd,
    fetchImpl: options.fetchImpl,
    postprocessVideo: options.postprocessVideo
  });
}

function parseArgs(argv: string[], cwd: string): MakeVideoArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near "${key ?? ""}"`);
    }
    values.set(key.slice(2), value);
  }

  const productPath = values.get("product");
  if (!productPath) {
    throw new Error("Missing required argument: --product");
  }

  return {
    productPath,
    outDir: values.get("outDir") ?? join(defaultJobsDir(cwd), "make-video"),
    providerName: parseProvider(values.get("provider") ?? "mock"),
    durationSeconds: parseDuration(values.get("duration") ?? "8"),
    cta: values.get("cta") ?? "今すぐチェック",
    template: parseTemplate(values.get("template") ?? "scene"),
    confirmPaid: parseBoolean(values.get("confirmPaid") ?? "false"),
    tokenPriceCnyPerMillion: parsePositiveNumber(
      values.get("tokenPriceCnyPerMillion") ??
        process.env.SEEDANCE_TOKEN_PRICE_CNY_PER_MILLION ??
        "37",
      "--tokenPriceCnyPerMillion"
    ),
    forceRegenerate: parseBoolean(values.get("forceRegenerate") ?? "false"),
    reuseManifestPath: values.get("reuseManifest")
  };
}

function defaultJobsDir(cwd: string): string {
  const dataDir = resolveDataDir({
    rootDir: cwd,
    env: process.env
  });
  return getWorkspacePaths(dataDir, DEFAULT_WORKSPACE_ID).jobsDir;
}

function parseProvider(value: string): VideoProviderName {
  if (value !== "mock" && value !== "seedance" && value !== "volcengine-seedance") {
    throw new Error("--provider must be one of: mock, seedance, volcengine-seedance");
  }
  return value;
}

function parseDuration(value: string): number {
  const duration = Number.parseInt(value, 10);
  if (!Number.isInteger(duration) || duration < 4 || duration > 15) {
    throw new Error("--duration must be an integer between 4 and 15 seconds");
  }
  return duration;
}

function parseTemplate(value: string): ScriptTemplate {
  const allowed: ScriptTemplate[] = ["pain-point", "scene", "unboxing", "benefit", "ugc"];
  if (!allowed.includes(value as ScriptTemplate)) {
    throw new Error(`--template must be one of: ${allowed.join(", ")}`);
  }
  return value as ScriptTemplate;
}

function parseBoolean(value: string): boolean {
  return ["1", "true", "yes"].includes(value.toLowerCase());
}

function parsePositiveNumber(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return parsed;
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? fileURLToPath(new URL(`file://${process.argv[1]}`)) : "";

if (currentFile === invokedFile) {
  runMakeVideoCli(process.argv.slice(2))
    .then((report) => {
      process.stdout.write(
        [
          `Make video completed for ${report.productSku}.`,
          `Provider: ${report.provider}`,
          `Raw manifest: ${report.raw.manifestPath}`,
          `Final video: ${report.final?.outputPath ?? "-"}`,
          `Reused raw manifest: ${report.reusedRawManifest ? "yes" : "no"}`,
          `Recovered raw output: ${report.recoveredRawOutput ? "yes" : "no"}`,
          `Total cost: ${report.totalCost.amount} ${report.totalCost.currency}`,
          `Estimated token cost: ${report.billing?.estimatedCostCny ?? "-"} CNY`,
          `Report: ${report.reportPath}`
        ].join("\n") + "\n"
      );
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
