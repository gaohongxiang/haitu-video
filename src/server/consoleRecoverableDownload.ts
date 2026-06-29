import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { generateJapaneseHashtags } from "../core/japaneseHashtags.js";
import { parseProductFacts } from "../core/productFacts.js";
import { generateVideoPrompt } from "../core/promptGenerator.js";
import { generateJapaneseAdScript } from "../core/scriptGenerator.js";
import { normalizeFinalVideoLanguage } from "../core/videoLanguage.js";
import { maxSeedanceReferenceImages } from "../core/videoProviderErrors.js";
import { type MakeVideoReport } from "../pipeline/makeVideoPipeline.js";
import type { ProductJobManifest } from "../pipeline/runProductJob.js";
import type { MoneyAmount, VideoOutput, VideoProviderResult } from "../providers/types.js";
import { defaultVideoResolution, normalizeVideoAspectRatio } from "../providers/videoGeometry.js";
import { runBasicQc } from "../qc/basicQc.js";
import type { BillingPolicyStore } from "./billingPolicyStore.js";
import type { VideoJobErrorDetails, VideoJobRecord } from "./consoleVideoJobTypes.js";
import {
  estimateVideoUpstreamCostCny,
  videoTokenPriceCnyPerMillion
} from "./modelPricing.js";

export async function persistRecoverableDownloadFailure(input: {
  record: VideoJobRecord;
  error: unknown;
  errorDetails: VideoJobErrorDetails;
  reportUrlForPath: (path: string) => string;
  billingPolicyStore?: BillingPolicyStore;
}): Promise<Partial<VideoJobRecord>> {
  const partial = extractRecoverableDownloadFailure(input.error);
  if (!partial || input.errorDetails.providerPhase !== "download-output") {
    return {};
  }
  const product = parseProductFacts(JSON.parse(await readFile(input.record.productPath, "utf8")) as unknown);
  const rawManifestPath = join(input.record.outDir, "raw", product.sku, "v1", "manifest.json");
  const providerTaskId = partial.providerTaskId;
  const tokenPriceCnyPerMillion = videoTokenPriceCnyPerMillion(input.record.providerModel, input.record.resolution);
  const totalTokens = partial.usage?.totalTokens ?? partial.usage?.completionTokens;
  const billing = totalTokens === undefined
    ? undefined
    : {
        tokenPriceCnyPerMillion,
        totalTokens,
        estimatedCostCny: estimateVideoUpstreamCostCny({
          model: input.record.providerModel,
          resolution: input.record.resolution,
          aspectRatio: input.record.aspectRatio,
          totalTokens
        })
      };
  const rawManifest = await buildRecoverableRawManifest({
    record: input.record,
    product,
    partial,
    manifestPath: rawManifestPath
  });
  await mkdir(dirname(rawManifestPath), { recursive: true });
  await writeFile(rawManifestPath, JSON.stringify(rawManifest, null, 2), "utf8");
  const reportPath = join(input.record.outDir, "make-video-report.json");
  const failedReport: MakeVideoReport = {
    type: "haitu_make_video_report",
    status: "failed" as MakeVideoReport["status"],
    productSku: rawManifest.product.sku,
    provider: input.record.provider ?? "volcengine-seedance",
    durationSeconds: input.record.durationSeconds ?? partial.output.durationSeconds,
    paidRequestConfirmed: input.record.confirmPaid,
    raw: {
      manifestPath: rawManifest.paths.manifest,
      outputPath: rawManifest.output.path,
      taskId: providerTaskId
    },
    usage: partial.usage,
    billing,
    totalCost: rawManifest.cost.total,
    reusedRawManifest: false,
    recoveredRawOutput: false,
    reportPath
  };
  await mkdir(input.record.outDir, { recursive: true });
  await writeFile(reportPath, JSON.stringify(failedReport, null, 2), "utf8");
  return {
    productSku: rawManifest.product.sku,
    reportPath,
    reportUrl: input.reportUrlForPath(reportPath),
    providerTaskId,
    recoverableRawManifestPath: rawManifest.paths.manifest,
    providerVideoUrl: partial.providerVideoUrl,
    canRecoverDownload: true,
    totalTokens: billing?.totalTokens ?? partial.usage?.totalTokens ?? partial.usage?.completionTokens,
    estimatedCostCny: billing?.estimatedCostCny
  };
}

interface RecoverableDownloadFailure {
  providerTaskId: string;
  providerVideoUrl: string;
  output: VideoOutput;
  usage?: VideoProviderResult["usage"];
  cost: MoneyAmount;
  rawResponse: Record<string, unknown>;
}

function extractRecoverableDownloadFailure(error: unknown): RecoverableDownloadFailure | undefined {
  const value = error as Partial<RecoverableDownloadFailure> | undefined;
  if (
    !value ||
    typeof value.providerTaskId !== "string" ||
    typeof value.providerVideoUrl !== "string" ||
    !isVideoOutput(value.output) ||
    !isMoneyAmount(value.cost) ||
    !value.rawResponse ||
    typeof value.rawResponse !== "object" ||
    Array.isArray(value.rawResponse)
  ) {
    return undefined;
  }
  return {
    providerTaskId: value.providerTaskId,
    providerVideoUrl: value.providerVideoUrl,
    output: value.output,
    usage: value.usage,
    cost: value.cost,
    rawResponse: value.rawResponse
  };
}

async function buildRecoverableRawManifest(input: {
  record: VideoJobRecord;
  product: ReturnType<typeof parseProductFacts>;
  partial: RecoverableDownloadFailure;
  manifestPath: string;
}): Promise<ProductJobManifest> {
  const durationSeconds = input.record.durationSeconds ?? input.partial.output.durationSeconds;
  const aspectRatio = normalizeVideoAspectRatio(input.record.aspectRatio);
  const template = input.record.template ?? "scene";
  const finalLanguage = normalizeFinalVideoLanguage(input.record.finalLanguage);
  const generationProduct = {
    ...input.product,
    reference_images: input.product.reference_images.slice(0, maxSeedanceReferenceImages)
  };
  const script = generateJapaneseAdScript(input.product, {
    cta: input.record.cta ?? "今すぐチェック",
    template,
    scriptLines: input.record.scriptLines,
    finalLanguage
  });
  const prompt = generateVideoPrompt(generationProduct, {
    durationSeconds,
    aspectRatio,
    template,
    storyboardLines: input.record.storyboardLines,
    finalLanguage
  });
  const jobId = `${input.product.sku}-v1`;
  const qc = runBasicQc({
    product: input.product,
    script,
    output: input.partial.output,
    targetDurationSeconds: durationSeconds,
    targetAspectRatio: aspectRatio,
    targetResolution: input.record.resolution ?? defaultVideoResolution
  });
  const hashtags = generateJapaneseHashtags({
    product: input.product,
    script,
    variantKey: jobId
  });
  return {
    jobId,
    status: "completed",
    product: {
      sku: input.product.sku,
      title_ja: input.product.title_ja,
      category: input.product.category,
      materials: input.product.materials,
      verified_selling_points: input.product.verified_selling_points,
      usage_scenes: input.product.usage_scenes
    },
    version: 1,
    provider: {
      name: "volcengine-seedance",
      model: input.record.providerModel ?? "volcengine-seedance",
      taskId: input.partial.providerTaskId
    },
    script,
    prompt,
    output: input.partial.output,
    usage: input.partial.usage,
    qc,
    cost: {
      provider: input.partial.cost,
      total: input.partial.cost
    },
    hashtags,
    paths: {
      outputDir: dirname(input.manifestPath),
      manifest: input.manifestPath
    }
  };
}

function isVideoOutput(value: unknown): value is VideoOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const output = value as Partial<VideoOutput>;
  return (
    typeof output.path === "string" &&
    typeof output.width === "number" &&
    typeof output.height === "number" &&
    typeof output.durationSeconds === "number" &&
    output.mimeType === "video/mp4"
  );
}

function isMoneyAmount(value: unknown): value is MoneyAmount {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const amount = value as Partial<MoneyAmount>;
  return (
    typeof amount.amount === "number" &&
    (amount.currency === "USD" || amount.currency === "JPY" || amount.currency === "CNY")
  );
}
