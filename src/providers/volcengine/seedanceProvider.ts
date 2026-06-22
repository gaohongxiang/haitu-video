import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, resolve } from "node:path";

import { maxSeedanceReferenceImages } from "../../core/videoProviderErrors.js";
import { defaultFinalVideoLanguage, providerScriptLanguageLabel } from "../../core/videoLanguage.js";
import type {
  MoneyAmount,
  ReferenceImageUrlResolver,
  VideoOutput,
  VideoProvider,
  VideoProviderRequest,
  VideoProviderResult
} from "../types.js";

interface VolcengineSeedanceProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  pollIntervalMs?: number;
  maxPolls?: number;
  resolution?: "480p" | "720p" | "1080p";
  watermark?: boolean;
  estimatedCostAmount?: number;
  estimatedCostPerSecond?: number;
  estimatedCostCurrency?: "USD" | "JPY" | "CNY";
  fetchImpl?: typeof fetch;
  referenceImageUrlResolver?: ReferenceImageUrlResolver;
  downloadTimeoutMs?: number;
  downloadMaxAttempts?: number;
  downloadChunkBytes?: number;
}

interface VolcengineSeedanceTaskResponse {
  id?: string;
  task_id?: string;
  status?: string;
  content?: VolcengineSeedanceContent;
  output?: {
    video_url?: string;
    url?: string;
  };
  data?: {
    id?: string;
    task_id?: string;
    status?: string;
    content?: VolcengineSeedanceContent;
    output?: VolcengineSeedanceTaskResponse["output"];
  };
  usage?: Record<string, unknown>;
  error?: {
    code?: string;
    message?: string;
  };
}

type VolcengineSeedanceContent =
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

interface ProviderErrorMetadata {
  providerName: string;
  providerModel: string;
  referenceImageCount: number;
  usedTemporaryAssetUrls: boolean;
}

export class SeedanceOutputDownloadError extends Error {
  readonly providerTaskId: string;
  readonly providerVideoUrl: string;
  readonly output: VideoOutput;
  readonly usage?: VideoProviderResult["usage"];
  readonly cost: MoneyAmount;
  readonly rawResponse: Record<string, unknown>;

  constructor(
    message: string,
    input: {
      cause: unknown;
      providerTaskId: string;
      providerVideoUrl: string;
      output: VideoOutput;
      usage?: VideoProviderResult["usage"];
      cost: MoneyAmount;
      rawResponse: Record<string, unknown>;
    }
  ) {
    super(message, { cause: input.cause });
    this.name = "SeedanceOutputDownloadError";
    this.providerTaskId = input.providerTaskId;
    this.providerVideoUrl = input.providerVideoUrl;
    this.output = input.output;
    this.usage = input.usage;
    this.cost = input.cost;
    this.rawResponse = input.rawResponse;
  }
}

export class VolcengineSeedanceProvider implements VideoProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly pollIntervalMs: number;
  private readonly maxPolls: number;
  private readonly resolution: "480p" | "720p" | "1080p";
  private readonly watermark: boolean;
  private readonly estimatedCostAmount?: number;
  private readonly estimatedCostPerSecond: number;
  private readonly estimatedCostCurrency: "USD" | "JPY" | "CNY";
  private readonly fetchImpl: typeof fetch;
  private readonly referenceImageUrlResolver?: ReferenceImageUrlResolver;
  private readonly downloadTimeoutMs: number;
  private readonly downloadMaxAttempts: number;
  private readonly downloadChunkBytes: number;

  constructor(options: VolcengineSeedanceProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.SEEDANCE_API_KEY ?? process.env.ARK_API_KEY ?? "";
    this.baseUrl =
      options.baseUrl ?? process.env.SEEDANCE_BASE_URL ?? "https://ark.cn-beijing.volces.com";
    this.model =
      options.model ?? process.env.SEEDANCE_MODEL ?? "doubao-seedance-2-0-260128";
    this.pollIntervalMs = options.pollIntervalMs ?? Number(process.env.SEEDANCE_POLL_MS ?? 5000);
    this.maxPolls = options.maxPolls ?? Number(process.env.SEEDANCE_MAX_POLLS ?? 120);
    this.resolution =
      options.resolution ??
      ((process.env.SEEDANCE_RESOLUTION as "480p" | "720p" | "1080p" | undefined) ?? "480p");
    this.watermark = options.watermark ?? parseBoolean(process.env.SEEDANCE_WATERMARK ?? "false");
    this.estimatedCostAmount = options.estimatedCostAmount ?? parseOptionalNumber(
      process.env.SEEDANCE_ESTIMATED_COST_CNY
    );
    this.estimatedCostPerSecond =
      options.estimatedCostPerSecond ??
      Number(process.env.SEEDANCE_ESTIMATED_COST_CNY_PER_SECOND ?? 0.8);
    this.estimatedCostCurrency =
      options.estimatedCostCurrency ??
      ((process.env.SEEDANCE_ESTIMATED_COST_CURRENCY as "USD" | "JPY" | "CNY" | undefined) ??
        "CNY");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.referenceImageUrlResolver = options.referenceImageUrlResolver;
    this.downloadTimeoutMs = options.downloadTimeoutMs ?? Number(process.env.SEEDANCE_DOWNLOAD_TIMEOUT_MS ?? 60000);
    this.downloadMaxAttempts = options.downloadMaxAttempts ?? Number(process.env.SEEDANCE_DOWNLOAD_MAX_ATTEMPTS ?? 3);
    this.downloadChunkBytes = options.downloadChunkBytes ?? Number(process.env.SEEDANCE_DOWNLOAD_CHUNK_BYTES ?? 1048576);
  }

  async generateVideo(request: VideoProviderRequest): Promise<VideoProviderResult> {
    if (!this.apiKey) {
      throw new Error("Missing SEEDANCE_API_KEY or ARK_API_KEY. Refusing to make a paid request.");
    }

    await mkdir(request.outputDir, { recursive: true });
    const errorMetadata = this.errorMetadata(request);
    let createResponse: VolcengineSeedanceTaskResponse;
    try {
      createResponse = await this.postJson<VolcengineSeedanceTaskResponse>(
        "/api/v3/contents/generations/tasks",
        {
          model: this.model,
          content: await this.buildContent(request),
          resolution: this.resolution,
          ratio: request.aspectRatio,
          duration: request.durationSeconds,
          watermark: this.watermark
        }
      );
    } catch (error) {
      throw annotateProviderError(error, {
        ...errorMetadata,
        providerPhase: "create-task"
      });
    }
    const taskId = getTaskId(createResponse);
    if (!taskId) {
      throw new Error("Volcengine Seedance create task response did not include a task id.");
    }

    let completedTask: VolcengineSeedanceTaskResponse;
    try {
      completedTask = await this.waitForTask(taskId);
    } catch (error) {
      throw annotateProviderError(error, {
        ...errorMetadata,
        providerPhase: "poll-task"
      });
    }
    const videoUrl = getVideoUrl(completedTask);
    if (!videoUrl) {
      throw new Error(`Volcengine Seedance task ${taskId} completed without a video URL.`);
    }

    const outputPath = join(request.outputDir, `${request.jobId}.seedance.mp4`);
    const output: VideoOutput = {
      path: outputPath,
      width: 1080,
      height: 1920,
      durationSeconds: request.durationSeconds,
      mimeType: "video/mp4"
    };
    const usage = getUsage(completedTask);
    const cost = {
      amount: this.estimatedCostAmount ?? roundMoney(this.estimatedCostPerSecond * request.durationSeconds),
      currency: this.estimatedCostCurrency
    };
    const rawResponse = {
      createResponse,
      completedTask
    };
    try {
      await this.download(videoUrl, outputPath);
    } catch (error) {
      throw annotateProviderError(new SeedanceOutputDownloadError(
        "Volcengine Seedance video was generated but the output download failed.",
        {
          cause: error,
          providerTaskId: taskId,
          providerVideoUrl: videoUrl,
          output,
          usage,
          cost,
          rawResponse
        }
      ), {
        ...errorMetadata,
        providerPhase: "download-output"
      });
    }

    return {
      provider: "volcengine-seedance",
      model: this.model,
      providerTaskId: taskId,
      output,
      usage,
      cost,
      rawResponse
    };
  }

  private async buildContent(request: VideoProviderRequest): Promise<Array<Record<string, unknown>>> {
    const finalLanguage = request.finalLanguage ?? defaultFinalVideoLanguage;
    const content: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: [request.prompt, "", `${providerScriptLanguageLabel(finalLanguage)}:`, request.script].join("\n")
      }
    ];

    for (const referenceImage of (request.referenceImages ?? []).slice(0, maxSeedanceReferenceImages)) {
      content.push({
        type: "image_url",
        role: "reference_image",
        image_url: {
          url: await this.normalizeReferenceImage(referenceImage)
        }
      });
    }

    return content;
  }

  private async normalizeReferenceImage(reference: string): Promise<string> {
    if (reference.startsWith("data:image/") || reference.startsWith("asset://")) {
      return reference;
    }
    if (this.referenceImageUrlResolver) {
      return this.referenceImageUrlResolver(reference);
    }
    if (reference.startsWith("http://") || reference.startsWith("https://")) {
      return this.inlineRemoteImage(reference);
    }
    return normalizeImageReference(reference);
  }

  private async inlineRemoteImage(reference: string): Promise<string> {
    const response = await this.fetchImpl(reference);
    if (!response.ok) {
      throw new Error(`Reference image could not be loaded before video generation: HTTP ${response.status}.`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      throw new Error("Reference image URL did not return an image before video generation.");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${contentType.split(";")[0]};base64,${bytes.toString("base64")}`;
  }

  private errorMetadata(request: VideoProviderRequest): ProviderErrorMetadata {
    return {
      providerName: "volcengine-seedance",
      providerModel: this.model,
      referenceImageCount: request.referenceImages?.length ?? 0,
      usedTemporaryAssetUrls: Boolean(this.referenceImageUrlResolver)
    };
  }

  private async waitForTask(taskId: string): Promise<VolcengineSeedanceTaskResponse> {
    for (let attempt = 1; attempt <= this.maxPolls; attempt += 1) {
      const task = await this.getJson<VolcengineSeedanceTaskResponse>(
        `/api/v3/contents/generations/tasks/${taskId}`
      );
      const status = getStatus(task);
      if (["succeeded", "success", "completed"].includes(status)) {
        return task;
      }
      if (["failed", "error", "cancelled", "canceled", "expired"].includes(status)) {
        const message = task.error?.message ?? task.data?.status ?? status;
        throw new Error(`Volcengine Seedance task ${taskId} failed: ${message}`);
      }
      await sleep(this.pollIntervalMs);
    }

    throw new Error(`Volcengine Seedance task did not finish after ${this.maxPolls} poll(s).`);
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
    return parseJsonResponse<T>(response);
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${this.apiKey}`
      }
    });
    return parseJsonResponse<T>(response);
  }

  private async download(url: string, outputPath: string): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= Math.max(1, this.downloadMaxAttempts); attempt += 1) {
      try {
        await this.downloadWithRanges(url, outputPath);
        return;
      } catch (error) {
        lastError = error;
        await rm(outputPath, { force: true });
        if (attempt < Math.max(1, this.downloadMaxAttempts)) {
          await sleep(1000 * attempt);
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async downloadWithRanges(url: string, outputPath: string): Promise<void> {
    const chunkBytes = Math.max(256 * 1024, Math.floor(this.downloadChunkBytes));
    const file = createWriteStream(outputPath, { flags: "w" });
    try {
      let offset = 0;
      let totalSize: number | undefined;
      while (totalSize === undefined || offset < totalSize) {
        const end = offset + chunkBytes - 1;
        const response = await this.fetchWithTimeout(url, this.downloadTimeoutMs, {
          range: `bytes=${offset}-${end}`
        });
        if (response.status !== 206 && !(offset === 0 && response.status === 200)) {
          throw new Error(
            `Failed to download Volcengine Seedance video: ${response.status} ${response.statusText}`
          );
        }
        const body = Buffer.from(await this.readResponseBodyWithTimeout(response));
        if (body.length === 0) {
          throw new Error("Failed to download Volcengine Seedance video: empty response body.");
        }
        await writeStreamChunk(file, body);
        offset += body.length;
        totalSize = contentRangeTotal(response.headers.get("content-range")) ?? totalSize;
        if (response.status === 200) {
          totalSize = offset;
        }
      }
    } finally {
      await closeWriteStream(file);
    }
  }

  private async readResponseBodyWithTimeout(response: Response): Promise<ArrayBuffer> {
    return withTimeout(
      response.arrayBuffer(),
      this.downloadTimeoutMs,
      "Volcengine Seedance video body download timed out."
    );
  }

  private async fetchWithTimeout(url: string, timeoutMs: number, headers?: Record<string, string>): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchImpl(url, {
        headers,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export { VolcengineSeedanceProvider as SeedanceProvider };

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Volcengine Seedance API error ${response.status}: ${text}`);
  }
  return JSON.parse(text) as T;
}

function getTaskId(response: VolcengineSeedanceTaskResponse): string | undefined {
  return response.id ?? response.task_id ?? response.data?.id ?? response.data?.task_id;
}

function getStatus(response: VolcengineSeedanceTaskResponse): string {
  return (response.status ?? response.data?.status ?? "").toLowerCase();
}

function getVideoUrl(response: VolcengineSeedanceTaskResponse): string | undefined {
  return (
    response.output?.video_url ??
    response.output?.url ??
    response.data?.output?.video_url ??
    response.data?.output?.url ??
    getContentVideoUrl(response.content) ??
    getContentVideoUrl(response.data?.content)
  );
}

function getUsage(
  response: VolcengineSeedanceTaskResponse
): { completionTokens?: number; totalTokens?: number } | undefined {
  const completionTokens = getNumberField(response.usage, "completion_tokens");
  const totalTokens = getNumberField(response.usage, "total_tokens");
  if (completionTokens === undefined && totalTokens === undefined) {
    return undefined;
  }
  return {
    completionTokens,
    totalTokens
  };
}

function getNumberField(value: Record<string, unknown> | undefined, key: string): number | undefined {
  const field = value?.[key];
  return typeof field === "number" ? field : undefined;
}

function getContentVideoUrl(content: VolcengineSeedanceContent | undefined): string | undefined {
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

async function normalizeImageReference(reference: string): Promise<string> {
  if (reference.startsWith("http://") || reference.startsWith("https://")) {
    return reference;
  }
  if (reference.startsWith("data:image/") || reference.startsWith("asset://")) {
    return reference;
  }

  const path = isAbsolute(reference) ? reference : resolve(reference);
  const extension = extname(path).slice(1).toLowerCase();
  const mime = extension === "jpg" ? "jpeg" : extension || "png";
  const bytes = await readFile(path);
  return `data:image/${mime};base64,${bytes.toString("base64")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

function writeStreamChunk(stream: ReturnType<typeof createWriteStream>, chunk: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(chunk, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function closeWriteStream(stream: ReturnType<typeof createWriteStream>): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.end((error?: Error | null) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function contentRangeTotal(value: string | null): number | undefined {
  const match = value?.match(/^bytes\s+\d+-\d+\/(\d+)$/i);
  if (!match) {
    return undefined;
  }
  const total = Number(match[1]);
  return Number.isFinite(total) ? total : undefined;
}

function parseBoolean(value: string): boolean {
  return ["1", "true", "yes"].includes(value.toLowerCase());
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  return Number(value);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function annotateProviderError(error: unknown, metadata: ProviderErrorMetadata & { providerPhase: string }): Error {
  const err = error instanceof Error ? error : new Error(String(error));
  return Object.assign(err, metadata);
}
