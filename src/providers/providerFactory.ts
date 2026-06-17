import { MockVideoProvider } from "./mockVideoProvider.js";
import type { ReferenceImageUrlResolver, VideoProvider } from "./types.js";
import { VolcengineSeedanceProvider } from "./volcengine/seedanceProvider.js";

export type VideoProviderName = "mock" | "seedance" | "volcengine-seedance";

export interface ProviderFactoryOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  referenceImageUrlResolver?: ReferenceImageUrlResolver;
}

export function createVideoProvider(
  name: string,
  options: ProviderFactoryOptions = {}
): VideoProvider {
  switch (name) {
    case "mock":
      return new MockVideoProvider();
    case "seedance":
    case "volcengine-seedance":
      return new VolcengineSeedanceProvider({
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
        model: options.model,
        fetchImpl: options.fetchImpl,
        referenceImageUrlResolver: options.referenceImageUrlResolver
      });
    default:
      throw new Error(`Unknown video provider: ${name}`);
  }
}
