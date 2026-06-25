import {
  extractJsonObject,
  openAiCompatibleBaseUrl,
  trimTrailingSlash,
  type TextJsonRequest,
  type TextProvider,
  type TextProviderOptions
} from "./textProviderTypes.js";
import {
  defaultImageModelBaseUrl,
  defaultImageModelId,
  defaultTextModelBaseUrl,
  defaultTextModelId
} from "./modelCatalog.js";

export interface OpenAiCompatibleTextProviderOptions extends TextProviderOptions {}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

export class OpenAiCompatibleTextProvider implements TextProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAiCompatibleTextProviderOptions = {}) {
    this.apiKey = options.apiKey ?? "";
    this.baseUrl = openAiCompatibleBaseUrl(options.baseUrl ?? defaultTextModelBaseUrl());
    this.model = options.model ?? defaultTextModelId();
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generateJson<T>(request: TextJsonRequest): Promise<T> {
    if (!this.apiKey) {
      throw new Error("请先在 API 管理配置文本模型 API Key。");
    }
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        temperature: request.temperature ?? 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user }
        ]
      })
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`文本模型请求失败 ${response.status}: ${text}`);
    }
    const completion = text ? JSON.parse(text) as ChatCompletionResponse : {};
    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(completion.error?.message ?? "文本模型没有返回内容。");
    }
    return JSON.parse(extractJsonObject(content)) as T;
  }
}

export function textModelBaseUrl(): string {
  return trimTrailingSlash(defaultTextModelBaseUrl());
}

export function textModelName(): string {
  return defaultTextModelId();
}

export function imageModelBaseUrl(): string {
  return trimTrailingSlash(defaultImageModelBaseUrl());
}

export function imageModelName(): string {
  return defaultImageModelId();
}
