import { OpenAiCompatibleImageProvider, type OpenAiCompatibleImageProviderOptions } from "./openaiCompatibleImageProvider.js";

export type ImageProviderOptions = OpenAiCompatibleImageProviderOptions;
export type ImageProvider = OpenAiCompatibleImageProvider;

export function createImageProvider(options: ImageProviderOptions = {}): ImageProvider {
  return new OpenAiCompatibleImageProvider(options);
}
