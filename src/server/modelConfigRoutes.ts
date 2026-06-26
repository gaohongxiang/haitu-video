import {
  type ModelProviderId
} from "../providers/modelCatalog.js";
import type { FileAuditLog } from "./auditLog.js";
import type { ConsoleAuthStore } from "./consoleAuth.js";
import { jsonResponse } from "./consoleHttpService.js";
import type { ConsoleRequestContext } from "./consoleWorkspaceRuntime.js";
import {
  buildPlatformModelAdminConfig,
  buildProviderConfig
} from "./modelConfigPresentation.js";
import {
  platformModelConfigInput,
  refreshProviderModels,
  revealProviderConfigKey,
  testProviderConfig,
  type ModelConfigRequest,
  type ProviderConfigTestRequest
} from "./modelConfigService.js";
import { ensurePlatformBundlesForAllWorkspaces } from "./consoleLifecycleService.js";

export async function handleModelConfigRoutes(input: {
  request: Request;
  url: URL;
  requestContext: ConsoleRequestContext;
  authStore: ConsoleAuthStore;
  auditLog: FileAuditLog;
  fetchImpl?: typeof fetch;
}): Promise<Response | undefined> {
  const {
    request,
    url,
    requestContext,
    authStore,
    auditLog,
    fetchImpl
  } = input;

  if (request.method === "GET" && url.pathname === "/api/provider-config") {
    return jsonResponse(await buildProviderConfig({
      modelConfigStore: requestContext.modelConfigStore,
      platformModelConfigStore: requestContext.platformModelConfigStore
    }));
  }
  if (request.method === "GET" && url.pathname === "/api/platform/model-configs") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    return jsonResponse(await buildPlatformModelAdminConfig(requestContext.platformModelConfigStore));
  }
  const platformModelConfigMatch = url.pathname.match(/^\/api\/platform\/model-configs\/([^/]+)$/);
  const platformModelConfigKeyMatch = url.pathname.match(/^\/api\/platform\/model-configs\/([^/]+)\/key$/);
  if (platformModelConfigKeyMatch && request.method === "GET") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    const provider = parseModelProviderId(decodeURIComponent(platformModelConfigKeyMatch[1] ?? ""));
    const configId = url.searchParams.get("configId") ?? undefined;
    return jsonResponse(await revealProviderConfigKey(provider, {
      modelConfigStore: requestContext.platformModelConfigStore,
      configId
    }));
  }
  if (platformModelConfigMatch && request.method === "PUT") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    const provider = parseModelProviderId(decodeURIComponent(platformModelConfigMatch[1] ?? ""));
    const providerInput = (await request.json()) as ModelConfigRequest;
    const saved = await requestContext.platformModelConfigStore.set(provider, platformModelConfigInput(provider, providerInput));
    await ensurePlatformBundlesForAllWorkspaces({
      databaseHandle: requestContext.databaseHandle,
      platformModelConfigStore: requestContext.platformModelConfigStore,
    });
    await auditLog.append({
      action: "platform_model_config.saved",
      target: provider,
      metadata: {
        keyPreview: saved.keyPreview
      }
    });
    return jsonResponse({ provider: saved });
  }
  if (platformModelConfigMatch && request.method === "DELETE") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    const provider = parseModelProviderId(decodeURIComponent(platformModelConfigMatch[1] ?? ""));
    const configId = url.searchParams.get("configId") ?? undefined;
    const deleted = await requestContext.platformModelConfigStore.delete(provider, configId);
    await ensurePlatformBundlesForAllWorkspaces({
      databaseHandle: requestContext.databaseHandle,
      platformModelConfigStore: requestContext.platformModelConfigStore,
    });
    await auditLog.append({
      action: "platform_model_config.deleted",
      target: provider,
      metadata: {
        configId
      }
    });
    return jsonResponse({ provider: deleted });
  }
  const providerModelsMatch = url.pathname.match(/^\/api\/model-configs\/([^/]+)\/models$/);
  if (providerModelsMatch && request.method === "POST") {
    const provider = parseModelProviderId(decodeURIComponent(providerModelsMatch[1] ?? ""));
    return jsonResponse(await refreshProviderModels(provider, {
      modelConfigStore: requestContext.modelConfigStore,
      fetchImpl,
      input: (await request.json()) as ProviderConfigTestRequest
    }));
  }
  const modelConfigTestMatch = url.pathname.match(/^\/api\/model-configs\/([^/]+)\/test$/);
  if (modelConfigTestMatch && request.method === "POST") {
    const provider = parseModelProviderId(decodeURIComponent(modelConfigTestMatch[1] ?? ""));
    return jsonResponse(await testProviderConfig(provider, {
      modelConfigStore: requestContext.modelConfigStore,
      fetchImpl,
      input: (await request.json()) as ProviderConfigTestRequest
    }));
  }
  const modelConfigMatch = url.pathname.match(/^\/api\/model-configs\/([^/]+)$/);
  const modelConfigKeyMatch = url.pathname.match(/^\/api\/model-configs\/([^/]+)\/key$/);
  if (modelConfigKeyMatch && request.method === "GET") {
    const provider = parseModelProviderId(decodeURIComponent(modelConfigKeyMatch[1] ?? ""));
    const configId = url.searchParams.get("configId") ?? undefined;
    return jsonResponse(await revealProviderConfigKey(provider, {
      modelConfigStore: requestContext.modelConfigStore,
      configId
    }));
  }
  if (modelConfigMatch && request.method === "PUT") {
    const provider = parseModelProviderId(decodeURIComponent(modelConfigMatch[1] ?? ""));
    const providerInput = (await request.json()) as ModelConfigRequest;
    const saved = await requestContext.modelConfigStore.set(provider, {
      ...providerInput,
      apiOwner: "byok"
    });
    await auditLog.append({
      action: "model_config.saved",
      target: provider,
      metadata: {
        keySource: saved.keySource,
        keyPreview: saved.keyPreview
      }
    });
    return jsonResponse({
      provider: saved
    });
  }
  if (modelConfigMatch && request.method === "DELETE") {
    const provider = parseModelProviderId(decodeURIComponent(modelConfigMatch[1] ?? ""));
    const configId = url.searchParams.get("configId") ?? undefined;
    const deleted = await requestContext.modelConfigStore.delete(provider, configId);
    await auditLog.append({
      action: "model_config.deleted",
      target: provider,
      metadata: {
        keySource: deleted.keySource
      }
    });
    return jsonResponse({
      provider: deleted
    });
  }
  return undefined;
}

function parseModelProviderId(value: string): ModelProviderId {
  if (value === "openai-compatible-text" || value === "openai-compatible-image") {
    return value;
  }
  if (value === "volcengine-seedance") {
    return "volcengine-seedance";
  }
  throw new Error(`Unknown model provider target: ${value}`);
}
