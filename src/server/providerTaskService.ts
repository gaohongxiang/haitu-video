import { type ListUsageTasksRequest, VolcengineUsageClient } from "../providers/volcengine/usageClient.js";
import { selectedVideoModelConfig } from "./modelConfigSelection.js";
import type { ModelConfigStore } from "./modelConfigStore.js";
import { ModelBundleStore } from "./modelBundleStore.js";
import { ModelServicePreferenceStore } from "./modelServicePreferenceStore.js";
import { queryValue } from "./consoleAssetService.js";

export async function getProviderTask(
  taskId: string,
  options: {
    modelConfigStore: ModelConfigStore;
    platformModelConfigStore?: ModelConfigStore;
    modelBundleStore?: ModelBundleStore;
    modelServicePreferenceStore?: ModelServicePreferenceStore;
    fetchImpl?: typeof fetch;
  }
) {
  const config = await selectedVideoModelConfig({
    modelConfigStore: options.modelConfigStore,
    platformModelConfigStore: options.platformModelConfigStore,
    modelBundleStore: options.modelBundleStore,
    modelServicePreferenceStore: options.modelServicePreferenceStore,
    provider: "volcengine-seedance"
  });
  return new VolcengineUsageClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    fetchImpl: options.fetchImpl
  }).getTask(taskId);
}

export async function listProviderTasks(
  url: URL,
  options: {
    modelConfigStore: ModelConfigStore;
    platformModelConfigStore?: ModelConfigStore;
    modelBundleStore?: ModelBundleStore;
    modelServicePreferenceStore?: ModelServicePreferenceStore;
    fetchImpl?: typeof fetch;
  }
) {
  const config = await selectedVideoModelConfig({
    modelConfigStore: options.modelConfigStore,
    platformModelConfigStore: options.platformModelConfigStore,
    modelBundleStore: options.modelBundleStore,
    modelServicePreferenceStore: options.modelServicePreferenceStore,
    provider: "volcengine-seedance"
  });
  return new VolcengineUsageClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    fetchImpl: options.fetchImpl
  }).listTasks(providerUsageListRequestFromUrl(url));
}

export async function cancelQueuedProviderTask(
  taskId: string,
  options: {
    modelConfigStore: ModelConfigStore;
    platformModelConfigStore?: ModelConfigStore;
    modelBundleStore?: ModelBundleStore;
    modelServicePreferenceStore?: ModelServicePreferenceStore;
    fetchImpl?: typeof fetch;
  }
): Promise<void> {
  const config = await selectedVideoModelConfig({
    modelConfigStore: options.modelConfigStore,
    platformModelConfigStore: options.platformModelConfigStore,
    modelBundleStore: options.modelBundleStore,
    modelServicePreferenceStore: options.modelServicePreferenceStore,
    provider: "volcengine-seedance"
  });
  const client = new VolcengineUsageClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    fetchImpl: options.fetchImpl
  });
  const task = await client.getTask(taskId);
  if (task.status !== "queued") {
    throw new Error(`Can cancel only queued tasks. Task ${taskId} is ${task.status ?? "unknown"}.`);
  }
  await client.deleteTask(taskId);
}

function providerUsageListRequestFromUrl(url: URL): ListUsageTasksRequest {
  return {
    pageNum: positiveIntegerFromQuery(url, "pageNum", 1, 1, 1000),
    pageSize: positiveIntegerFromQuery(url, "pageSize", 20, 1, 100),
    status: providerTaskStatusFromQuery(url),
    taskIds: taskIdsFromQuery(url),
    model: queryValue(url, "model"),
    serviceTier: providerServiceTierFromQuery(url)
  };
}

function positiveIntegerFromQuery(
  url: URL,
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  const value = Number(url.searchParams.get(name));
  if (!Number.isInteger(value) || value < min || value > max) {
    return fallback;
  }
  return value;
}

function providerTaskStatusFromQuery(url: URL): ListUsageTasksRequest["status"] | undefined {
  const value = queryValue(url, "status");
  return ["queued", "running", "cancelled", "succeeded", "failed"].includes(String(value))
    ? (value as ListUsageTasksRequest["status"])
    : undefined;
}

function providerServiceTierFromQuery(url: URL): ListUsageTasksRequest["serviceTier"] | undefined {
  const value = queryValue(url, "serviceTier");
  return ["default", "flex"].includes(String(value))
    ? (value as ListUsageTasksRequest["serviceTier"])
    : undefined;
}

function taskIdsFromQuery(url: URL): string[] | undefined {
  const repeated = url.searchParams.getAll("taskId");
  const csv = url.searchParams.get("taskIds")?.split(",") ?? [];
  const taskIds = [...repeated, ...csv].map((value) => value.trim()).filter(Boolean);
  return taskIds.length > 0 ? Array.from(new Set(taskIds)) : undefined;
}
