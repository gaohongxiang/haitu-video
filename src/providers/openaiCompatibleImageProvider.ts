import { defaultImageModelBaseUrl, defaultImageModelId } from "./modelCatalog.js";

export interface OpenAiCompatibleImageProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export interface ImageGenerationRequest {
  prompt: string;
  count?: number;
}

export interface GeneratedImageAsset {
  bytes: Buffer;
  mimeType: string;
}

interface ImageGenerationResponse {
  data?: Array<{
    b64_json?: string;
    url?: string;
    mime_type?: string;
  }>;
  error?: {
    message?: string;
  };
}

export class OpenAiCompatibleImageProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAiCompatibleImageProviderOptions = {}) {
    this.apiKey = options.apiKey ?? "";
    this.baseUrl = imagesBaseUrl(options.baseUrl ?? defaultImageModelBaseUrl());
    this.model = options.model ?? defaultImageModelId();
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generateImages(request: ImageGenerationRequest): Promise<GeneratedImageAsset[]> {
    if (!this.apiKey) {
      throw new Error("请先在 API 管理配置图片模型 API Key。");
    }
    const response = await this.fetchImpl(`${this.baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        prompt: request.prompt,
        n: clampImageCount(request.count),
        size: "1024x1024",
        response_format: "b64_json"
      })
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`图片模型请求失败 ${response.status}: ${text}`);
    }
    const payload = text ? JSON.parse(text) as ImageGenerationResponse : {};
    const images = payload.data ?? [];
    if (images.length === 0) {
      throw new Error(payload.error?.message ?? "图片模型没有返回图片。");
    }
    return Promise.all(images.map((image) => this.toGeneratedImage(image)));
  }

  private async toGeneratedImage(image: NonNullable<ImageGenerationResponse["data"]>[number]): Promise<GeneratedImageAsset> {
    if (image.b64_json) {
      return {
        bytes: Buffer.from(image.b64_json, "base64"),
        mimeType: normalizeImageMimeType(image.mime_type)
      };
    }
    if (image.url) {
      const response = await this.fetchImpl(image.url);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!response.ok) {
        throw new Error(`图片下载失败 ${response.status}: ${image.url}`);
      }
      return {
        bytes,
        mimeType: normalizeImageMimeType(response.headers.get("content-type") ?? image.mime_type)
      };
    }
    throw new Error("图片模型返回项缺少 b64_json 或 url。");
  }
}

function imagesBaseUrl(value: string): string {
  const trimmed = value.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") || trimmed.endsWith("/v1beta/openai") ? trimmed : `${trimmed}/v1`;
}

function clampImageCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) {
    return 1;
  }
  return Math.max(1, Math.min(4, parsed));
}

function normalizeImageMimeType(value: string | undefined): string {
  const lowered = value?.split(";")[0]?.trim().toLowerCase();
  if (lowered === "image/jpeg" || lowered === "image/webp" || lowered === "image/png") {
    return lowered;
  }
  return "image/png";
}
