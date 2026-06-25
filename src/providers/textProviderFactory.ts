import { OpenAiCompatibleTextProvider } from "./openaiCompatibleTextProvider.js";
import { OpenAiResponsesTextProvider } from "./openaiResponsesTextProvider.js";
import { trimTrailingSlash, type TextModelApiMode, type TextProvider, type TextProviderOptions } from "./textProviderTypes.js";
import { defaultTextModelBaseUrl, defaultTextModelId } from "./modelCatalog.js";

export function createTextProvider(options: TextProviderOptions = {}): TextProvider {
  const apiMode = inferTextModelApiMode(options);
  if (apiMode === "responses" || apiMode === "responses_stream") {
    return new OpenAiResponsesTextProvider({
      ...options,
      stream: apiMode === "responses_stream"
    });
  }
  return new OpenAiCompatibleTextProvider(options);
}

export function inferTextModelApiMode(input: {
  apiMode?: string;
  baseUrl?: string;
  model?: string;
}): TextModelApiMode {
  const explicit = normalizeTextModelApiMode(input.apiMode);
  if (explicit) {
    return explicit;
  }
  return isOpenAiResponsesDefault(input) ? "responses_stream" : "chat_completions";
}

export function normalizeTextModelApiMode(value: unknown): TextModelApiMode | undefined {
  const normalized = typeof value === "string" ? value.trim().toLowerCase().replace(/-/g, "_") : "";
  if (normalized === "codex_responses" || normalized === "responses_stream") {
    return "responses_stream";
  }
  if (normalized === "responses") {
    return "responses";
  }
  if (normalized === "chat" || normalized === "chat_completions" || normalized === "chat_completions_compat") {
    return "chat_completions";
  }
  return undefined;
}

function isOpenAiResponsesDefault(input: {
  baseUrl?: string;
  model?: string;
}): boolean {
  const baseUrl = trimTrailingSlash(input.baseUrl ?? defaultTextModelBaseUrl()).toLowerCase();
  const model = (input.model ?? defaultTextModelId()).toLowerCase();
  return isOpenAiBaseUrl(baseUrl) && (model.startsWith("gpt-") || model.startsWith("o"));
}

function isOpenAiBaseUrl(value: string): boolean {
  return value === "https://api.openai.com" || value === "https://api.openai.com/v1";
}
