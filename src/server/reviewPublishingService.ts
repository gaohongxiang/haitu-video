import { createPublishPackage, listPublishPackages, type PublishPackageLedger, type PublishPackageManifest } from "./publishPackage.js";
import { buildJobLedger } from "./jobLedger.js";
import { LocalVideoJobQueue } from "./consoleVideoJobQueue.js";
import { fileExists, mediaUrl } from "./consoleAssetService.js";
import { listProducts } from "./productService.js";
import {
  buildInternalValidationCsvRows,
  buildPublishPackagesCsvRows,
  rowsToCsv
} from "./reviewPublishingCsv.js";
import {
  FileReviewStore,
  isManualReviewDecision,
  type ManualReviewInput,
  type SelectFinalInput
} from "./reviewStore.js";

export interface PublishPackageFileUrls {
  videoUrl: string;
  subtitleUrl?: string;
  finalManifestUrl?: string;
  manifestUrl: string;
}

export interface PublishPackageFileStatus {
  video: "ready" | "missing";
  subtitle?: "ready" | "missing";
}

export type PublishPackageConsoleManifest = PublishPackageManifest & {
  fileUrls: PublishPackageFileUrls;
  fileStatus: PublishPackageFileStatus;
};

export async function createPublishPackagesBatch(input: {
  outputsDir: string;
  reviewStore: FileReviewStore;
}): Promise<{
  packages: PublishPackageManifest[];
  skipped: Array<{
    productSku: string;
    jobId?: string;
    reason: string;
  }>;
}> {
  const [reviewState, existingLedger] = await Promise.all([
    input.reviewStore.read(),
    listPublishPackages(input.outputsDir)
  ]);
  const existingKeys = new Set(existingLedger.packages.map((item) => `${item.productSku}\n${item.jobId}`));
  const packages: PublishPackageManifest[] = [];
  const skipped: Array<{
    productSku: string;
    jobId?: string;
    reason: string;
  }> = [];

  for (const [productSku, review] of Object.entries(reviewState.products).sort(([left], [right]) => left.localeCompare(right))) {
    const jobId = review.selectedFinalJobId;
    if (!jobId) {
      skipped.push({
        productSku,
        reason: "未选择最终版"
      });
      continue;
    }
    const key = `${productSku}\n${jobId}`;
    if (existingKeys.has(key)) {
      skipped.push({
        productSku,
        jobId,
        reason: "发布素材已存在"
      });
      continue;
    }
    if (review.versionReviews?.[jobId]?.decision !== "publishable") {
      skipped.push({
        productSku,
        jobId,
        reason: "最终版未标记为可发布"
      });
      continue;
    }
    const created = await createPublishPackage({
      outputsDir: input.outputsDir,
      productSku,
      jobId,
      reviewState
    });
    existingKeys.add(key);
    packages.push(created);
  }

  return { packages, skipped };
}

export async function assertSelectableFinalJob(
  input: SelectFinalInput,
  outputsDir: string,
  reviewStore: FileReviewStore
): Promise<void> {
  const ledger = await buildJobLedger(outputsDir, {
    reviewState: await reviewStore.read()
  });
  const product = ledger.products.find((group) => group.productSku === input.productSku);
  const job = product?.jobs.find((item) => item.id === input.jobId);
  if (!job?.hasFinalVideo) {
    throw new Error("Selected final job must belong to the product and include a final video.");
  }
}

export function assertManualReviewInput(input: ManualReviewInput): void {
  if (
    typeof input?.productSku !== "string" ||
    input.productSku.trim().length === 0 ||
    typeof input.jobId !== "string" ||
    input.jobId.trim().length === 0 ||
    !isManualReviewDecision(input.decision) ||
    !Number.isInteger(input.score) ||
    input.score < 1 ||
    input.score > 5
  ) {
    throw new Error("Manual review requires productSku, jobId, decision, and score 1-5.");
  }
}

export async function assertReviewableJob(
  input: Pick<ManualReviewInput, "productSku" | "jobId">,
  outputsDir: string,
  reviewStore: FileReviewStore
): Promise<void> {
  const ledger = await buildJobLedger(outputsDir, {
    reviewState: await reviewStore.read()
  });
  const product = ledger.products.find((group) => group.productSku === input.productSku);
  const job = product?.jobs.find((item) => item.id === input.jobId);
  if (!job) {
    throw new Error("Manual review job must belong to the product.");
  }
}

export async function buildInternalValidationCsv(input: {
  rootDir: string;
  fixturesDir: string;
  outputsDir: string;
  reviewStore: FileReviewStore;
}): Promise<string> {
  const [products, reviewState] = await Promise.all([
    listProducts(input.fixturesDir, input.rootDir),
    input.reviewStore.read()
  ]);
  const ledger = await buildJobLedger(input.outputsDir, {
    reviewState
  });
  const groupsBySku = new Map(ledger.products.map((group) => [group.productSku, group]));
  return rowsToCsv(buildInternalValidationCsvRows({
    products,
    groupsBySku
  }));
}

export async function buildPublishPackagesCsv(outputsDir: string): Promise<string> {
  const ledger = await withPublishPackageFileUrls(await listPublishPackages(outputsDir));
  return rowsToCsv(buildPublishPackagesCsvRows(ledger.packages));
}

export async function topUpInternalValidationJobs(input: {
  rootDir: string;
  fixturesDir: string;
  outputsDir: string;
  videoJobQueue: LocalVideoJobQueue;
}): Promise<{
  jobs: Array<Awaited<ReturnType<LocalVideoJobQueue["enqueue"]>>>;
  skipped: Array<{
    productSku: string;
    reason: string;
    referenceImageCount: number;
    existingVersions: number;
    missingVersions: number;
  }>;
}> {
  const [products, ledger] = await Promise.all([
    listProducts(input.fixturesDir, input.rootDir),
    buildJobLedger(input.outputsDir)
  ]);
  const groupsBySku = new Map(ledger.products.map((group) => [group.productSku, group]));
  const jobs: Array<Awaited<ReturnType<LocalVideoJobQueue["enqueue"]>>> = [];
  const skipped: Array<{
    productSku: string;
    reason: string;
    referenceImageCount: number;
    existingVersions: number;
    missingVersions: number;
  }> = [];

  for (const product of products) {
    const existingVersions = groupsBySku.get(product.sku)?.jobCount ?? 0;
    const missingVersions = Math.max(0, 3 - existingVersions);
    if (missingVersions === 0) {
      skipped.push({
        productSku: product.sku,
        reason: "已有 3 个视频版本",
        referenceImageCount: product.referenceImageCount,
        existingVersions,
        missingVersions
      });
      continue;
    }
    if (product.referenceImageCount < 3) {
      skipped.push({
        productSku: product.sku,
        reason: "参考图不足 3 张",
        referenceImageCount: product.referenceImageCount,
        existingVersions,
        missingVersions
      });
      continue;
    }
    for (let index = existingVersions + 1; index <= 3; index += 1) {
      jobs.push(await input.videoJobQueue.enqueue({
        productPath: product.path,
        outDirName: `${sanitizePathSegment(product.sku)}-v${index}`,
        provider: "mock",
        duration: 8,
        template: "scene",
        finalLanguage: "ja",
        cta: "今すぐチェック",
        confirmPaid: false
      }));
    }
  }

  return { jobs, skipped };
}

export async function withPublishPackageFileUrls(
  ledger: PublishPackageLedger
): Promise<Omit<PublishPackageLedger, "packages"> & { packages: PublishPackageConsoleManifest[] }> {
  return {
    ...ledger,
    packages: await Promise.all(ledger.packages.map((item) => withPublishPackageFileUrl(item)))
  };
}

export async function withPublishPackageFileUrl(item: PublishPackageManifest): Promise<PublishPackageConsoleManifest> {
  return {
    ...item,
    fileUrls: {
      videoUrl: mediaUrl(item.files.videoPath),
      subtitleUrl: item.files.subtitlePath ? mediaUrl(item.files.subtitlePath) : undefined,
      finalManifestUrl: item.files.finalManifestPath ? mediaUrl(item.files.finalManifestPath) : undefined,
      manifestUrl: mediaUrl(item.manifestPath)
    },
    fileStatus: {
      video: await fileExists(item.files.videoPath) ? "ready" : "missing",
      subtitle: item.files.subtitlePath ? (await fileExists(item.files.subtitlePath) ? "ready" : "missing") : undefined
    }
  };
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "run";
}
