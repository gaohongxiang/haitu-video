import {
  catalogEntriesForProvider,
  catalogEntryForModel,
  type ModelProviderId
} from "./modelCatalog.js";
import { trimTrailingSlash } from "./textProviderTypes.js";

export type DiscoveredModelSource = "models_api" | "catalog";

export interface ModelDiscoveryOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface DiscoveredModel {
  id: string;
  label?: string;
  known: boolean;
  source: DiscoveredModelSource;
}

interface ModelsApiResponse {
  data?: ModelsApiItem[];
  models?: ModelsApiItem[];
  error?: {
    message?: string;
  };
}

interface ModelsApiItem {
  id?: string;
  name?: string;
}

export async function discoverAvailableModels(
  providerId: ModelProviderId,
  options: ModelDiscoveryOptions = {}
): Promise<DiscoveredModel[]> {
  if (providerId === "volcengine-seedance") {
    return catalogEntriesForProvider(providerId).map((entry) => ({
      id: entry.modelId,
      label: entry.label,
      known: true,
      source: "catalog"
    }));
  }
  if (!options.apiKey) {
    return catalogEntriesForProvider(providerId).map((entry) => ({
      id: entry.modelId,
      label: entry.label,
      known: true,
      source: "catalog"
    }));
  }
  const endpoint = modelDiscoveryEndpoint(providerId, options.baseUrl ?? catalogEntriesForProvider(providerId)[0]?.baseUrl ?? "");
  const response = await (options.fetchImpl ?? fetch)(endpoint, {
    method: "GET",
    headers: {
      authorization: `Bearer ${options.apiKey}`
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`模型列表刷新失败 ${response.status}: ${text}`);
  }
  const payload = text ? JSON.parse(text) as ModelsApiResponse : {};
  if (payload.error?.message) {
    throw new Error(payload.error.message);
  }
  const rawModels = payload.data ?? payload.models ?? [];
  return rawModels
    .map((item) => item.id?.trim() || item.name?.trim() || "")
    .filter(Boolean)
    .map((id) => {
      const catalogEntry = catalogEntryForModel(providerId, id);
      return {
        id,
        label: catalogEntry?.label,
        known: Boolean(catalogEntry),
        source: "models_api" as const
      };
    });
}

export function modelDiscoveryEndpoint(providerId: ModelProviderId, baseUrl: string): string {
  const trimmed = trimTrailingSlash(baseUrl);
  if (providerId === "openai-compatible-text" && isDeepSeekBaseUrl(trimmed)) {
    return `${trimmed}/models`;
  }
  if (trimmed.endsWith("/v1") || trimmed.endsWith("/api/v3") || trimmed.endsWith("/v1beta/openai")) {
    return `${trimmed}/models`;
  }
  return `${trimmed}/v1/models`;
}

function isDeepSeekBaseUrl(value: string): boolean {
  return value === "https://api.deepseek.com" || value === "https://api.deepseek.com/v1";
}
