import {
  extractJsonObject,
  trimTrailingSlash,
  type TextJsonRequest,
  type TextJsonResult,
  type TextProvider,
  type TextProviderUsage,
  type TextProviderOptions
} from "./textProviderTypes.js";
import { defaultTextModelBaseUrl, defaultTextModelId } from "./modelCatalog.js";

interface ResponsesApiResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
  usage?: ResponsesApiUsage;
}

interface ResponsesApiUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: {
    cached_tokens?: number;
  };
}

interface ResponsesStreamEvent {
  type?: string;
  delta?: string;
  text?: string;
  response?: ResponsesApiResponse;
  error?: {
    message?: string;
  };
}

export class OpenAiResponsesTextProvider implements TextProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly stream: boolean;

  constructor(options: TextProviderOptions & { stream?: boolean } = {}) {
    this.apiKey = options.apiKey ?? "";
    this.baseUrl = responsesBaseUrl(options.baseUrl ?? defaultTextModelBaseUrl());
    this.model = options.model ?? defaultTextModelId();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.stream = options.stream ?? true;
  }

  async generateJson<T>(request: TextJsonRequest): Promise<T> {
    return (await this.generateJsonWithUsage<T>(request)).value;
  }

  async generateJsonWithUsage<T>(request: TextJsonRequest): Promise<TextJsonResult<T>> {
    if (!this.apiKey) {
      throw new Error("请先在 API 管理配置文本模型 API Key。");
    }
    const response = await this.fetchImpl(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        instructions: request.system,
        input: request.user,
        temperature: request.temperature ?? 0.2,
        text: {
          format: { type: "json_object" }
        },
        stream: this.stream
      })
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`文本模型请求失败 ${response.status}: ${text}`);
    }
    const parsed = response.headers.get("content-type")?.includes("text/event-stream")
      ? parseResponsesStreamText(text)
      : parseResponsesText(text);
    const content = parsed.content;
    if (!content) {
      throw new Error("文本模型没有返回内容。");
    }
    return {
      value: JSON.parse(extractJsonObject(content)) as T,
      usage: textProviderUsageFromResponsesUsage(parsed.usage)
    };
  }
}

function responsesBaseUrl(value: string): string {
  const trimmed = trimTrailingSlash(value);
  return trimmed.endsWith("/v1") || trimmed.endsWith("/api/v3") ? trimmed : `${trimmed}/v1`;
}

function parseResponsesText(text: string): { content: string; usage?: ResponsesApiUsage } {
  const payload = text ? JSON.parse(text) as ResponsesApiResponse : {};
  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }
  return {
    content: payload.output_text ?? outputContentText(payload.output),
    usage: payload.usage
  };
}

function outputContentText(output: ResponsesApiResponse["output"]): string {
  return (output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .join("");
}

function parseResponsesStreamText(text: string): { content: string; usage?: ResponsesApiUsage } {
  let output = "";
  let usage: ResponsesApiUsage | undefined;
  for (const event of streamEvents(text)) {
    if (event === "[DONE]") {
      continue;
    }
    const payload = JSON.parse(event) as ResponsesStreamEvent;
    if (payload.error?.message) {
      throw new Error(payload.error.message);
    }
    if (payload.type === "response.output_text.delta" || payload.type === "response.refusal.delta") {
      output += payload.delta ?? "";
    } else if (payload.type === "response.completed" && payload.response) {
      output ||= payload.response.output_text ?? outputContentText(payload.response.output);
      usage = payload.response.usage ?? usage;
    } else if (payload.text) {
      output += payload.text;
    }
  }
  return {
    content: output,
    usage
  };
}

function streamEvents(text: string): string[] {
  const events: string[] = [];
  for (const chunk of text.split(/\n\n+/)) {
    const data = chunk
      .split(/\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .join("\n")
      .trim();
    if (data) {
      events.push(data);
    }
  }
  return events;
}

function textProviderUsageFromResponsesUsage(usage: ResponsesApiUsage | undefined): TextProviderUsage | undefined {
  if (!usage) {
    return undefined;
  }
  return compactUsage({
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
    cachedInputTokens: usage.input_tokens_details?.cached_tokens
  });
}

function compactUsage(usage: TextProviderUsage): TextProviderUsage | undefined {
  const next = Object.fromEntries(
    Object.entries(usage).filter(([, value]) => typeof value === "number" && Number.isFinite(value))
  ) as TextProviderUsage;
  return Object.keys(next).length > 0 ? next : undefined;
}
