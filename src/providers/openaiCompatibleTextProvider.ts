import {
  extractJsonObject,
  openAiCompatibleBaseUrl,
  trimTrailingSlash,
  type TextJsonRequest,
  type TextJsonResult,
  type TextProvider,
  type TextProviderUsage,
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
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
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
    return (await this.generateJsonWithUsage<T>(request)).value;
  }

  async generateJsonWithUsage<T>(request: TextJsonRequest): Promise<TextJsonResult<T>> {
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
    return {
      value: JSON.parse(extractJsonObject(content)) as T,
      usage: textProviderUsageFromChatUsage(completion.usage)
    };
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

function textProviderUsageFromChatUsage(usage: ChatCompletionResponse["usage"]): TextProviderUsage | undefined {
  if (!usage) {
    return undefined;
  }
  return compactUsage({
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    cachedInputTokens: usage.prompt_tokens_details?.cached_tokens
  });
}

function compactUsage(usage: TextProviderUsage): TextProviderUsage | undefined {
  const next = Object.fromEntries(
    Object.entries(usage).filter(([, value]) => typeof value === "number" && Number.isFinite(value))
  ) as TextProviderUsage;
  return Object.keys(next).length > 0 ? next : undefined;
}
