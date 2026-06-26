import type { ModelProviderId } from "../providers/modelCatalog.js";
import type { ApiOwner, ModelConfigStore } from "./modelConfigStore.js";
import type { ModelBundleInput, ModelBundleStore } from "./modelBundleStore.js";
import type { ModelServicePreference } from "./modelServicePreferenceStore.js";
import { selectModelConfig } from "./modelConfigSelection.js";

export async function assertModelBundleConfigsExist(input: ModelBundleInput, stores: {
  modelConfigStore: ModelConfigStore;
  platformModelConfigStore: ModelConfigStore;
}): Promise<void> {
  if (input.enabled !== false && !isCompleteBundleInput(input)) {
    throw new Error("启用模型组合必须同时选择文本、图片和视频模型。");
  }
  await assertBundleConfigExists("openai-compatible-text", input.textModelConfigId, input.apiOwner, stores);
  await assertBundleConfigExists("openai-compatible-image", input.imageModelConfigId, input.apiOwner, stores);
  await assertBundleConfigExists("volcengine-seedance", input.videoModelConfigId, input.apiOwner, stores);
}

async function assertBundleConfigExists(providerId: ModelProviderId, configId: string | undefined, apiOwner: ApiOwner | undefined, stores: {
  modelConfigStore: ModelConfigStore;
  platformModelConfigStore: ModelConfigStore;
}): Promise<void> {
  const normalized = normalizeText(configId);
  if (!normalized || normalized === "auto") {
    return;
  }
  const config = await selectModelConfig({
    providerId,
    modelConfigStore: stores.modelConfigStore,
    platformModelConfigStore: stores.platformModelConfigStore,
    configId: normalized
  });
  if (!config) {
    throw new Error("组合引用的模型配置不存在或已被删除。");
  }
  if (apiOwner && config.apiOwner !== apiOwner) {
    throw new Error(apiOwner === "platform" ? "平台组合只能引用平台托管模型。" : "自带 API 组合只能引用自带 Key 模型。");
  }
}

export async function assertModelServicePreferenceBundlesExist(
  input: Partial<ModelServicePreference>,
  modelBundleStore: ModelBundleStore
): Promise<void> {
  const bundles = modelBundleStore.list();
  const platformBundleId = normalizeText(input.platformBundleId);
  const byokBundleId = normalizeText(input.byokBundleId);
  if (platformBundleId) {
    const bundle = bundles.find((item) => item.bundleId === platformBundleId);
    if (!bundle) {
      throw new Error("选择的平台模型组合不存在或已被删除。");
    }
    if (bundle.apiOwner !== "platform") {
      throw new Error("平台模型模式只能选择平台组合。");
    }
    if (!isCompleteBundleInput(bundle)) {
      throw new Error("选择的平台模型组合尚未配置完整。");
    }
    if (!bundle.enabled) {
      throw new Error("选择的平台模型组合未启用。");
    }
  }
  if (byokBundleId) {
    const bundle = bundles.find((item) => item.bundleId === byokBundleId);
    if (!bundle) {
      throw new Error("选择的自带 API 组合不存在或已被删除。");
    }
    if (bundle.apiOwner !== "byok") {
      throw new Error("自带 API 模式只能选择自带 API 组合。");
    }
    if (!isCompleteBundleInput(bundle)) {
      throw new Error("选择的自带 API 组合尚未配置完整。");
    }
    if (!bundle.enabled) {
      throw new Error("选择的自带 API 组合未启用。");
    }
  }
}

function isCompleteBundleInput(input: {
  textModelConfigId?: unknown;
  imageModelConfigId?: unknown;
  videoModelConfigId?: unknown;
}): boolean {
  return Boolean(
    normalizeText(input.textModelConfigId) !== "auto" && normalizeText(input.textModelConfigId)
    && normalizeText(input.imageModelConfigId) !== "auto" && normalizeText(input.imageModelConfigId)
    && normalizeText(input.videoModelConfigId) !== "auto" && normalizeText(input.videoModelConfigId)
  );
}

function normalizeText(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}
