export type TextModelApiMode = "chat_completions" | "responses" | "responses_stream";

export interface TextProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  apiMode?: string;
  fetchImpl?: typeof fetch;
}

export interface TextJsonRequest {
  system: string;
  user: string;
  temperature?: number;
}

export interface TextProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
}

export interface TextJsonResult<T> {
  value: T;
  usage?: TextProviderUsage;
}

export interface TextProvider {
  generateJson<T>(request: TextJsonRequest): Promise<T>;
  generateJsonWithUsage<T>(request: TextJsonRequest): Promise<TextJsonResult<T>>;
}

export function extractJsonObject(value: string): string {
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

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function openAiCompatibleBaseUrl(value: string): string {
  const trimmed = trimTrailingSlash(value);
  return trimmed.endsWith("/v1") || trimmed.endsWith("/api/v3") ? trimmed : `${trimmed}/v1`;
}
