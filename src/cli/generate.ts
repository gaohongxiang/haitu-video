import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";

import { resolveReferenceImages } from "../core/productAssetResolver.js";
import { parseProductFacts } from "../core/productFacts.js";
import type { ScriptTemplate } from "../core/scriptGenerator.js";
import { runProductJob } from "../pipeline/runProductJob.js";
import { createVideoProvider } from "../providers/providerFactory.js";
import type { MoneyAmount } from "../providers/types.js";
import type { VideoProviderName } from "../providers/providerFactory.js";
import { DEFAULT_WORKSPACE_ID, getWorkspacePaths, resolveDataDir } from "../server/storagePaths.js";

export interface GenerateSummary {
  productSku: string;
  generated: number;
  totalCost: MoneyAmount;
  manifests: string[];
  summaryPath: string;
}

export interface GenerateCliOptions {
  cwd?: string;
  fetchImpl?: typeof fetch;
}

interface GenerateArgs {
  productPath: string;
  versions: number;
  outDir: string;
  cta: string;
  template: ScriptTemplate;
  providerName: VideoProviderName;
  durationSeconds: number;
  confirmPaid: boolean;
}

export async function runGenerateCli(
  argv: string[],
  options: GenerateCliOptions = {}
): Promise<GenerateSummary> {
  loadDotenv({
    path: join(options.cwd ?? process.cwd(), ".env"),
    override: false,
    quiet: true
  });
  const cwd = options.cwd ?? process.cwd();
  const args = parseArgs(argv, cwd);
  const rawProduct = JSON.parse(await readFile(args.productPath, "utf8")) as unknown;
  const product = parseProductFacts(rawProduct);
  const productWithResolvedAssets = {
    ...product,
    reference_images: resolveReferenceImages(product.reference_images, {
      productFilePath: args.productPath
    })
  };
  if (isPaidProvider(args.providerName) && !args.confirmPaid) {
    throw new Error(
      `Provider ${args.providerName} makes paid requests. Re-run with --confirmPaid true after checking duration and estimated cost.`
    );
  }
  const provider = createVideoProvider(args.providerName, {
    fetchImpl: options.fetchImpl
  });
  const manifests = [];
  let totalCost = 0;
  let totalCostCurrency: MoneyAmount["currency"] = "USD";

  for (let version = 1; version <= args.versions; version += 1) {
    const manifest = await runProductJob({
      product: productWithResolvedAssets,
      version,
      outputRoot: args.outDir,
      provider,
      cta: args.cta,
      template: args.template,
      durationSeconds: args.durationSeconds
    });
    manifests.push(manifest.paths.manifest);
    totalCost += manifest.cost.total.amount;
    totalCostCurrency = manifest.cost.total.currency;
  }

  const summaryPath = join(args.outDir, "summary.json");
  const summary: GenerateSummary = {
    productSku: productWithResolvedAssets.sku,
    generated: manifests.length,
    totalCost: {
      amount: totalCost,
      currency: totalCostCurrency
    },
    manifests,
    summaryPath
  };

  await writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");
  return summary;
}

function parseArgs(argv: string[], cwd: string): GenerateArgs {
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

  const versions = Number.parseInt(values.get("versions") ?? "3", 10);
  if (!Number.isInteger(versions) || versions < 1 || versions > 10) {
    throw new Error("--versions must be an integer between 1 and 10");
  }

  return {
    productPath,
    versions,
    outDir: values.get("outDir") ?? join(defaultJobsDir(cwd), "generate"),
    cta: values.get("cta") ?? "今すぐチェック",
    template: parseTemplate(values.get("template") ?? "pain-point"),
    providerName: parseProvider(values.get("provider") ?? "mock"),
    durationSeconds: parseDuration(values.get("duration") ?? "8"),
    confirmPaid: parseBoolean(values.get("confirmPaid") ?? "false")
  };
}

function defaultJobsDir(cwd: string): string {
  const dataDir = resolveDataDir({
    rootDir: cwd,
    env: process.env
  });
  return getWorkspacePaths(dataDir, DEFAULT_WORKSPACE_ID).jobsDir;
}

function parseTemplate(value: string): ScriptTemplate {
  const allowed: ScriptTemplate[] = ["pain-point", "scene", "unboxing", "benefit", "ugc"];
  if (!allowed.includes(value as ScriptTemplate)) {
    throw new Error(`--template must be one of: ${allowed.join(", ")}`);
  }
  return value as ScriptTemplate;
}

function parseProvider(value: string): VideoProviderName {
  if (value !== "mock" && value !== "seedance" && value !== "volcengine-seedance") {
    throw new Error("--provider must be one of: mock, seedance, volcengine-seedance");
  }
  return value as VideoProviderName;
}

function parseDuration(value: string): number {
  const duration = Number.parseInt(value, 10);
  if (!Number.isInteger(duration) || duration < 4 || duration > 15) {
    throw new Error("--duration must be an integer between 4 and 15 seconds");
  }
  return duration;
}

function parseBoolean(value: string): boolean {
  return ["1", "true", "yes"].includes(value.toLowerCase());
}

function isPaidProvider(providerName: VideoProviderName): boolean {
  return providerName !== "mock";
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? fileURLToPath(new URL(`file://${process.argv[1]}`)) : "";

if (currentFile === invokedFile) {
  runGenerateCli(process.argv.slice(2))
    .then((summary) => {
      process.stdout.write(
        [
          `Generated ${summary.generated} video job(s) for ${summary.productSku}.`,
          `Total provider cost: ${summary.totalCost.amount} ${summary.totalCost.currency}.`,
          `Summary: ${summary.summaryPath}`
        ].join("\n") + "\n"
      );
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
