import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { buildJobLedger, type JobLedgerRow } from "./jobLedger.js";
import type { ReviewState } from "./reviewStore.js";

export interface PublishPackageManifest {
  type: "haitu_publish_package";
  productSku: string;
  jobId: string;
  provider?: string;
  taskId?: string;
  durationSeconds?: number;
  totalTokens: number;
  estimatedCostCny: number;
  selectedFinalNote?: string;
  packageDir: string;
  manifestPath: string;
  createdAt: string;
  files: {
    videoPath: string;
    subtitlePath?: string;
    finalManifestPath?: string;
    sourceReportPath: string;
    rawManifestPath?: string;
  };
}

export interface CreatePublishPackageInput {
  outputsDir: string;
  productSku: string;
  jobId?: string;
  reviewState: ReviewState;
  now?: Date;
}

export interface PublishPackageLedgerSummary {
  totalPackages: number;
  totalProducts: number;
  totalTokens: number;
  estimatedCostCny: number;
  latestCreatedAt?: string;
}

export interface PublishPackageLedger {
  summary: PublishPackageLedgerSummary;
  packages: PublishPackageManifest[];
}

export async function createPublishPackage(
  input: CreatePublishPackageInput
): Promise<PublishPackageManifest> {
  const ledger = await buildJobLedger(input.outputsDir, {
    reviewState: input.reviewState
  });
  const product = ledger.products.find((group) => group.productSku === input.productSku);
  const jobId = input.jobId ?? product?.selectedFinalJobId;
  if (!product || !jobId) {
    throw new Error(`No selected final job for product ${input.productSku}.`);
  }
  const job = product.jobs.find((item) => item.id === jobId);
  if (!job?.hasFinalVideo || !job.finalOutputPath) {
    throw new Error("Publish package requires a selected final video.");
  }
  if (job.manualReview?.decision !== "publishable") {
    throw new Error("Publish package requires the selected final version to be manually marked publishable.");
  }

  const packageDir = join(
    input.outputsDir,
    "publish-packages",
    sanitizePathSegment(input.productSku),
    sanitizePathSegment(job.id)
  );
  await mkdir(packageDir, { recursive: true });

  const videoPath = await copyNamedFile(job.finalOutputPath, packageDir);
  const subtitlePath = job.finalSubtitlePath
    ? await copyNamedFile(job.finalSubtitlePath, packageDir)
    : undefined;
  const finalManifestPath = job.finalManifestPath
    ? await copyNamedFile(job.finalManifestPath, packageDir)
    : undefined;
  const manifestPath = join(packageDir, "publish-package.json");
  const manifest: PublishPackageManifest = {
    type: "haitu_publish_package",
    productSku: input.productSku,
    jobId: job.id,
    provider: job.provider,
    taskId: job.taskId,
    durationSeconds: job.durationSeconds,
    totalTokens: job.totalTokens,
    estimatedCostCny: job.estimatedCostCny,
    selectedFinalNote: product.selectedFinalNote,
    packageDir,
    manifestPath,
    createdAt: (input.now ?? new Date()).toISOString(),
    files: {
      videoPath,
      subtitlePath,
      finalManifestPath,
      sourceReportPath: job.reportPath,
      rawManifestPath: job.rawManifestPath
    }
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

export async function listPublishPackages(outputsDir: string): Promise<PublishPackageLedger> {
  const manifestPaths = await listNamedFiles(join(outputsDir, "publish-packages"), "publish-package.json");
  const packages: PublishPackageManifest[] = [];
  for (const manifestPath of manifestPaths) {
    const manifest = normalizePublishPackageManifest(
      JSON.parse(await readFile(manifestPath, "utf8")),
      manifestPath
    );
    if (manifest) {
      packages.push(manifest);
    }
  }
  packages.sort(
    (left, right) =>
      Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
      left.productSku.localeCompare(right.productSku) ||
      left.jobId.localeCompare(right.jobId)
  );
  return {
    summary: summarizePublishPackages(packages),
    packages
  };
}

async function copyNamedFile(sourcePath: string, targetDir: string): Promise<string> {
  const targetPath = join(targetDir, basename(sourcePath));
  await copyFile(sourcePath, targetPath);
  return targetPath;
}

async function listNamedFiles(root: string, fileName: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && entry.name === fileName) {
        found.push(path);
      }
    }
  }
  await walk(root);
  return found;
}

function normalizePublishPackageManifest(
  value: unknown,
  manifestPath: string
): PublishPackageManifest | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const manifest = value as Partial<PublishPackageManifest>;
  if (
    manifest.type !== "haitu_publish_package" ||
    typeof manifest.productSku !== "string" ||
    typeof manifest.jobId !== "string" ||
    typeof manifest.createdAt !== "string" ||
    !manifest.files ||
    typeof manifest.files !== "object" ||
    typeof manifest.files.videoPath !== "string" ||
    typeof manifest.files.sourceReportPath !== "string"
  ) {
    return undefined;
  }
  return {
    type: "haitu_publish_package",
    productSku: manifest.productSku,
    jobId: manifest.jobId,
    provider: manifest.provider,
    taskId: manifest.taskId,
    durationSeconds: manifest.durationSeconds,
    totalTokens: manifest.totalTokens ?? 0,
    estimatedCostCny: manifest.estimatedCostCny ?? 0,
    selectedFinalNote: manifest.selectedFinalNote,
    packageDir: dirname(manifestPath),
    manifestPath,
    createdAt: manifest.createdAt,
    files: {
      videoPath: manifest.files.videoPath,
      subtitlePath: manifest.files.subtitlePath,
      finalManifestPath: manifest.files.finalManifestPath,
      sourceReportPath: manifest.files.sourceReportPath,
      rawManifestPath: manifest.files.rawManifestPath
    }
  };
}

function summarizePublishPackages(packages: PublishPackageManifest[]): PublishPackageLedgerSummary {
  return {
    totalPackages: packages.length,
    totalProducts: new Set(packages.map((item) => item.productSku)).size,
    totalTokens: packages.reduce((sum, item) => sum + item.totalTokens, 0),
    estimatedCostCny: roundCny(packages.reduce((sum, item) => sum + item.estimatedCostCny, 0)),
    latestCreatedAt: packages[0]?.createdAt
  };
}

function roundCny(value: number): number {
  return Math.round(value * 100) / 100;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}
