export interface OpenAiCompatibleTextProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export interface TextJsonRequest {
  system: string;
  user: string;
  temperature?: number;
}

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

export class OpenAiCompatibleTextProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAiCompatibleTextProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.TEXT_MODEL_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
    this.baseUrl = chatCompletionsBaseUrl(options.baseUrl ?? process.env.TEXT_MODEL_BASE_URL ?? "https://api.openai.com");
    this.model = options.model ?? process.env.TEXT_MODEL_MODEL ?? "gpt-5.5";
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
  return trimTrailingSlash(process.env.TEXT_MODEL_BASE_URL ?? "https://api.openai.com");
}

export function textModelName(): string {
  return process.env.TEXT_MODEL_MODEL ?? "gpt-5.5";
}

export function imageModelBaseUrl(): string {
  return trimTrailingSlash(process.env.IMAGE_MODEL_BASE_URL ?? "https://api.openai.com");
}

export function imageModelName(): string {
  return process.env.IMAGE_MODEL_MODEL ?? "gpt-image-2";
}

function extractJsonObject(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  throw new Error("文本模型返回内容不是 JSON。");
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function chatCompletionsBaseUrl(value: string): string {
  const trimmed = trimTrailingSlash(value);
  return trimmed.endsWith("/v1") || trimmed.endsWith("/api/v3") ? trimmed : `${trimmed}/v1`;
}
