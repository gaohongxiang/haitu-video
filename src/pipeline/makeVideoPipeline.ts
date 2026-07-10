import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { resolveReferenceImages } from "../core/productAssetResolver.js";
import { parseProductFacts } from "../core/productFacts.js";
import type { ScriptTemplate } from "../core/scriptGenerator.js";
import type { FinalVideoLanguage } from "../core/videoLanguage.js";
import { postprocessVideo } from "../postprocess/postprocessVideo.js";
import { createVideoProvider, type VideoProviderName } from "../providers/providerFactory.js";
import type { MoneyAmount, ReferenceImageUrlResolver, VideoAspectRatio, VideoResolution } from "../providers/types.js";
import { runProductJob, type ProductJobManifest } from "./runProductJob.js";

export interface MakeVideoPipelineInput {
  productPath: string;
  outDir: string;
  providerName: VideoProviderName;
  durationSeconds: number;
  resolution?: VideoResolution;
  aspectRatio?: VideoAspectRatio;
  cta: string;
  template: ScriptTemplate;
  finalLanguage?: FinalVideoLanguage;
  scriptLines?: string[];
  storyboardLines?: string[];
  referenceImages?: string[];
  confirmPaid: boolean;
  cwd?: string;
  fetchImpl?: typeof fetch;
  apiKey?: string;
  providerBaseUrl?: string;
  providerModelConfigId?: string;
  providerModel?: string;
  referenceImageUrlResolver?: ReferenceImageUrlResolver;
  tokenPriceCnyPerMillion?: number;
  forceRegenerate?: boolean;
  onProviderTaskCreated?: (taskId: string) => Promise<void> | void;
  reuseManifestPath?: string;
  postprocessVideo?: (manifest: ProductJobManifest, finalDir: string) => Promise<NonNullable<MakeVideoReport["final"]>>;
}

export interface MakeVideoReport {
  type: "haitu_make_video_report";
  status: "completed" | "failed";
  productSku: string;
  provider: VideoProviderName;
  durationSeconds: number;
  paidRequestConfirmed: boolean;
  raw: {
    manifestPath: string;
    outputPath: string;
    taskId?: string;
  };
  final?: {
    manifestPath: string;
    outputPath: string;
    subtitlePath: string;
  };
  usage?: ProductJobManifest["usage"];
  billing?: {
    tokenPriceCnyPerMillion: number;
    totalTokens: number;
    estimatedCostCny: number;
  };
  totalCost: MoneyAmount;
  reusedRawManifest: boolean;
  recoveredRawOutput: boolean;
  reportPath: string;
}

export async function runMakeVideoPipeline(input: MakeVideoPipelineInput): Promise<MakeVideoReport> {
  await mkdir(input.outDir, { recursive: true });
  const rawOutputRoot = join(input.outDir, "raw");
  const explicitReuseManifest = input.forceRegenerate || !input.reuseManifestPath
    ? undefined
    : await readCompletedManifest(input.reuseManifestPath);

  if (explicitReuseManifest) {
    const recoveredRawOutput = await ensureRawOutput(explicitReuseManifest, input);
    return writePipelineReport({
      input,
      rawManifest: explicitReuseManifest,
      productSku: explicitReuseManifest.product.sku,
      existingManifest: explicitReuseManifest,
      recoveredRawOutput
    });
  }
  if (input.reuseManifestPath && !input.forceRegenerate) {
    throw new Error(`恢复下载清单不存在或不可用：${input.reuseManifestPath}`);
  }

  const rawProduct = JSON.parse(await readFile(input.productPath, "utf8")) as unknown;
  const product = parseProductFacts(rawProduct);
  const productWithResolvedAssets = {
    ...product,
    reference_images: resolveReferenceImages(input.referenceImages ?? [], {
      productFilePath: input.productPath
    })
  };
  const defaultManifestPath = join(rawOutputRoot, productWithResolvedAssets.sku, "v1", "manifest.json");
  const defaultManifest = input.forceRegenerate ? undefined : await readCompletedManifest(defaultManifestPath);

  if (isPaidProvider(input.providerName) && !input.confirmPaid && !defaultManifest) {
    throw new Error(
      `Provider ${input.providerName} makes paid requests. Re-run with --confirmPaid true after checking duration and estimated cost.`
    );
  }
  const rawManifest =
    defaultManifest ??
    (await runProductJob({
      product: productWithResolvedAssets,
      version: 1,
      outputRoot: rawOutputRoot,
      provider: createVideoProvider(input.providerName, {
        apiKey: input.apiKey,
        baseUrl: input.providerBaseUrl,
        model: input.providerModel,
        resolution: input.resolution,
        fetchImpl: input.fetchImpl,
        referenceImageUrlResolver: input.referenceImageUrlResolver
      }),
      cta: input.cta,
      template: input.template,
      finalLanguage: input.finalLanguage,
      scriptLines: input.scriptLines,
      storyboardLines: input.storyboardLines,
      durationSeconds: input.durationSeconds,
      resolution: input.resolution,
      aspectRatio: input.aspectRatio,
      onProviderTaskCreated: input.onProviderTaskCreated
    }));
  const recoveredRawOutput = await ensureRawOutput(rawManifest, input);
  return writePipelineReport({
    input,
    rawManifest,
    productSku: productWithResolvedAssets.sku,
    existingManifest: defaultManifest,
    recoveredRawOutput
  });
}

async function writePipelineReport(input: {
  input: MakeVideoPipelineInput;
  rawManifest: ProductJobManifest;
  productSku: string;
  existingManifest?: ProductJobManifest;
  recoveredRawOutput: boolean;
}): Promise<MakeVideoReport> {
  const { rawManifest } = input;
  const pipelineInput = input.input;
  const final = await maybePostprocess(rawManifest, pipelineInput);
  const reportPath = join(pipelineInput.outDir, "make-video-report.json");
  const totalTokens = rawManifest.usage?.totalTokens ?? rawManifest.usage?.completionTokens;
  const tokenPriceCnyPerMillion = pipelineInput.tokenPriceCnyPerMillion ?? Number(process.env.SEEDANCE_TOKEN_PRICE_CNY_PER_MILLION ?? 37);
  const report: MakeVideoReport = {
    type: "haitu_make_video_report",
    status: "completed",
    productSku: input.productSku,
    provider: pipelineInput.providerName,
    durationSeconds: pipelineInput.durationSeconds,
    paidRequestConfirmed: pipelineInput.confirmPaid,
    raw: {
      manifestPath: rawManifest.paths.manifest,
      outputPath: rawManifest.output.path,
      taskId: rawManifest.provider.taskId
    },
    final,
    usage: rawManifest.usage,
    billing:
      totalTokens === undefined
        ? undefined
        : {
            tokenPriceCnyPerMillion,
            totalTokens,
            estimatedCostCny: estimateCny(totalTokens, tokenPriceCnyPerMillion)
      },
    totalCost: rawManifest.cost.total,
    reusedRawManifest: input.existingManifest !== undefined,
    recoveredRawOutput: input.recoveredRawOutput,
    reportPath
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  return report;
}

async function ensureRawOutput(
  rawManifest: ProductJobManifest,
  input: MakeVideoPipelineInput
): Promise<boolean> {
  if (rawManifest.output.mimeType !== "video/mp4") {
    return false;
  }
  try {
    await access(rawManifest.output.path);
    return false;
  } catch {
    // Continue into provider recovery below.
  }
  if (rawManifest.provider.name !== "volcengine-seedance" || !rawManifest.provider.taskId) {
    throw new Error(`Raw output is missing and cannot be recovered: ${rawManifest.output.path}`);
  }
  await recoverVolcengineOutput({
    taskId: rawManifest.provider.taskId,
    outputPath: rawManifest.output.path,
    apiKey: input.apiKey,
    baseUrl: input.providerBaseUrl,
    fetchImpl: input.fetchImpl ?? fetch
  });
  return true;
}

async function recoverVolcengineOutput(input: {
  taskId: string;
  outputPath: string;
  apiKey?: string;
  baseUrl?: string;
  fetchImpl: typeof fetch;
}): Promise<void> {
  const apiKey = input.apiKey ?? "";
  if (!apiKey) {
    throw new Error("请先在 API 管理配置视频模型 API Key。");
  }
  const baseUrl = input.baseUrl ?? "https://ark.cn-beijing.volces.com";
  const taskResponse = await input.fetchImpl(
    `${baseUrl}/api/v3/contents/generations/tasks/${encodeURIComponent(input.taskId)}`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${apiKey}`
      }
    }
  );
  const taskText = await taskResponse.text();
  if (!taskResponse.ok) {
    throw new Error(`Volcengine recovery API error ${taskResponse.status}: ${taskText}`);
  }
  const task = JSON.parse(taskText) as VolcengineRecoveryTask;
  const videoUrl = getVideoUrl(task);
  if (!videoUrl) {
    throw new Error(`Volcengine task ${input.taskId} did not include a recoverable video URL.`);
  }
  const videoResponse = await fetchWithRetry(input.fetchImpl, videoUrl, {
    timeoutMs: Number(process.env.SEEDANCE_DOWNLOAD_TIMEOUT_MS ?? 60000),
    maxAttempts: Number(process.env.SEEDANCE_DOWNLOAD_MAX_ATTEMPTS ?? 3)
  });
  if (!videoResponse.ok) {
    throw new Error(
      `Failed to download recovered provider video: ${videoResponse.status} ${videoResponse.statusText}`
    );
  }
  await mkdir(dirname(input.outputPath), { recursive: true });
  await writeFile(input.outputPath, Buffer.from(await videoResponse.arrayBuffer()));
}

async function fetchWithRetry(
  fetchImpl: typeof fetch,
  url: string,
  options: {
    timeoutMs: number;
    maxAttempts: number;
  }
): Promise<Response> {
  let lastError: unknown;
  const maxAttempts = Math.max(1, options.maxAttempts);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchWithTimeout(fetchImpl, url, options.timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await sleep(1000 * attempt);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function fetchWithTimeout(fetchImpl: typeof fetch, url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

interface VolcengineRecoveryTask {
  content?: VolcengineRecoveryContent;
  output?: {
    video_url?: string;
    url?: string;
  };
  data?: {
    content?: VolcengineRecoveryContent;
    output?: VolcengineRecoveryTask["output"];
  };
}

type VolcengineRecoveryContent =
  | Array<{
      type?: string;
      url?: string;
      video_url?: string;
    }>
  | {
      type?: string;
      url?: string;
      video_url?: string;
    };

function getVideoUrl(task: VolcengineRecoveryTask): string | undefined {
  return (
    task.output?.video_url ??
    task.output?.url ??
    task.data?.output?.video_url ??
    task.data?.output?.url ??
    getContentVideoUrl(task.content) ??
    getContentVideoUrl(task.data?.content)
  );
}

function getContentVideoUrl(content: VolcengineRecoveryContent | undefined): string | undefined {
  if (!content) {
    return undefined;
  }
  if (Array.isArray(content)) {
    return (
      content.find((item) => item.type === "video_url")?.url ??
      content.find((item) => item.video_url)?.video_url
    );
  }
  return content.video_url ?? (content.type === "video_url" ? content.url : undefined) ?? content.url;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPaidProvider(providerName: VideoProviderName): boolean {
  return providerName !== "mock";
}

async function maybePostprocess(
  rawManifest: ProductJobManifest,
  input: MakeVideoPipelineInput
): Promise<MakeVideoReport["final"]> {
  if (rawManifest.output.mimeType !== "video/mp4") {
    return undefined;
  }
  const finalDir = join(input.outDir, "final");
  if (input.postprocessVideo) {
    return input.postprocessVideo(rawManifest, finalDir);
  }
  const result = await postprocessVideo({
    inputVideoPath: rawManifest.output.path,
    outputDir: finalDir,
    outputFileName: `${rawManifest.jobId}.final.mp4`,
    subtitleLines: rawManifest.script.subtitleLines,
    durationSeconds: rawManifest.output.durationSeconds,
    width: rawManifest.output.width,
    height: rawManifest.output.height
  });
  const finalManifestPath = join(finalDir, "final-manifest.json");
  await writeFile(
    finalManifestPath,
    JSON.stringify(
      {
        type: "postprocessed_final",
        sourceManifest: rawManifest.paths.manifest,
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
    manifestPath: finalManifestPath,
    outputPath: result.outputPath,
    subtitlePath: result.subtitlePath
  };
}

async function readCompletedManifest(manifestPath: string): Promise<ProductJobManifest | undefined> {
  try {
    await access(manifestPath);
  } catch {
    return undefined;
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ProductJobManifest;
  return manifest.status === "completed" ? manifest : undefined;
}

export function estimateCny(tokens: number, tokenPriceCnyPerMillion: number): number {
  return Math.round((tokens / 1_000_000) * tokenPriceCnyPerMillion * 100) / 100;
}
