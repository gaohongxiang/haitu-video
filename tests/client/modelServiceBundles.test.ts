import { describe, expect, it } from "vitest";

import {
  buildModelSchemeOptions,
  bundleIdForPreference,
  bundleModelConfigIds,
  compareCustomModelBundles,
  configuredModelOptions,
  isCompleteModelBundle,
  modelConfigChoiceLabel,
  modelSchemeBundleLabel,
  modelSchemeChoiceLabel,
  localizedModelSchemeBundleLabel,
  nextModelBundleLabel,
  normalizeModelBundleItem,
  byokConfiguredModels,
  platformConfiguredModels,
  sortByokModelBundlesForDisplay,
  sortPlatformModelBundlesForDisplay,
  sortSelectableModelBundles,
  type ModelBundleItem
} from "../../src/client/modelServiceBundles.js";
import type { ProviderConfigItem } from "../../src/client/components/modelServiceConfig.js";

function bundle(input: Partial<ModelBundleItem> & Pick<ModelBundleItem, "bundleId" | "apiOwner" | "label">): ModelBundleItem {
  return {
    enabled: true,
    priority: 0,
    ...input
  };
}

function model(input: Partial<ProviderConfigItem> & Pick<ProviderConfigItem, "configId" | "apiOwner" | "model">): ProviderConfigItem {
  return {
    id: "openai-compatible-text",
    label: input.model,
    configured: true,
    baseUrl: "https://api.example.test/v1",
    capabilities: ["text"],
    modelKind: "text",
    ...input
  };
}

describe("model service bundle rules", () => {
  it("builds selectable scheme options from complete bundles without an automatic option", () => {
    const apiManagementPlatformBundles = [
      bundle({ bundleId: "platform-custom-bundle-1", apiOwner: "platform", label: "新增组合1", textModelConfigId: "text-1", imageModelConfigId: "image-1", videoModelConfigId: "video-1" }),
      bundle({ bundleId: "platform-quality-bundle", apiOwner: "platform", label: "高质量", textModelConfigId: "text-3", imageModelConfigId: "image-3", videoModelConfigId: "video-3" }),
      bundle({ bundleId: "platform-low-cost-bundle", apiOwner: "platform", label: "低成本", textModelConfigId: "text-2", imageModelConfigId: "image-2", videoModelConfigId: "video-2" }),
      bundle({ bundleId: "platform-draft", apiOwner: "platform", label: "草稿", textModelConfigId: "text-draft", enabled: true }),
      bundle({ bundleId: "platform-disabled", apiOwner: "platform", label: "停用", textModelConfigId: "text-4", imageModelConfigId: "image-4", videoModelConfigId: "video-4", enabled: false })
    ];
    const apiManagementByokBundles = [
      bundle({ bundleId: "byok-bundle-10", apiOwner: "byok", label: "新增组合10", textModelConfigId: "text-6", imageModelConfigId: "image-6", videoModelConfigId: "video-6" }),
      bundle({ bundleId: "byok-bundle-2", apiOwner: "byok", label: "新增组合2", textModelConfigId: "text-5", imageModelConfigId: "image-5", videoModelConfigId: "video-5" })
    ];
    const options = buildModelSchemeOptions({
      platformBundles: apiManagementPlatformBundles,
      byokBundles: apiManagementByokBundles
    });

    const selectablePlatformBundles = sortPlatformModelBundlesForDisplay(
      apiManagementPlatformBundles.filter((item) => item.enabled && isCompleteModelBundle(item))
    );
    const selectableByokBundles = sortByokModelBundlesForDisplay(
      apiManagementByokBundles.filter((item) => item.enabled && isCompleteModelBundle(item))
    );
    expect(options.filter((option) => option.apiOwner === "platform").map((option) => option.bundleId)).toEqual(
      selectablePlatformBundles.map((bundle) => bundle.bundleId)
    );
    expect(options.filter((option) => option.apiOwner === "byok").map((option) => option.bundleId)).toEqual(
      selectableByokBundles.map((bundle) => bundle.bundleId)
    );
    expect(options.map((option) => option.label)).toEqual([
      ...selectablePlatformBundles.map((bundle) => modelSchemeBundleLabel(bundle)),
      ...selectableByokBundles.map((bundle) => modelSchemeBundleLabel(bundle))
    ]);
    expect(options.map((option) => option.id)).not.toContain("auto");
    expect(options.map((option) => option.bundleId)).not.toContain("platform-draft");
    expect(options.map((option) => option.bundleId)).not.toContain("platform-disabled");
    expect(modelSchemeChoiceLabel("bundle:missing", options)).toBe(modelSchemeBundleLabel(selectablePlatformBundles[0]!));
  });

  it("localizes built-in bundle labels while keeping custom user labels intact", () => {
    const quality = bundle({ bundleId: "platform-quality-bundle", apiOwner: "platform", label: "高质量", textModelConfigId: "t1", imageModelConfigId: "i1", videoModelConfigId: "v1" });
    const lowCost = bundle({ bundleId: "platform-low-cost-bundle", apiOwner: "platform", label: "低成本", textModelConfigId: "t2", imageModelConfigId: "i2", videoModelConfigId: "v2" });
    const custom = bundle({ bundleId: "platform-custom-bundle-1", apiOwner: "platform", label: "夏季广告组合", textModelConfigId: "t3", imageModelConfigId: "i3", videoModelConfigId: "v3" });
    const byok = bundle({ bundleId: "byok-bundle-1", apiOwner: "byok", label: "Amazon JP", textModelConfigId: "t4", imageModelConfigId: "i4", videoModelConfigId: "v4" });

    expect(localizedModelSchemeBundleLabel(lowCost, "en")).toBe("Platform · Low cost");
    expect(localizedModelSchemeBundleLabel(quality, "en")).toBe("Platform · High quality");
    expect(localizedModelSchemeBundleLabel(custom, "en")).toBe("Platform · 夏季广告组合");
    expect(localizedModelSchemeBundleLabel(byok, "en")).toBe("Your key · Amazon JP");
    expect(modelSchemeBundleLabel(lowCost, "en")).toBe("Platform · Low cost");
  });

  it("keeps selectable platform bundles before BYOK bundles and orders numbered custom bundles naturally without priority", () => {
    const bundles = [
      bundle({ bundleId: "byok-bundle-2", apiOwner: "byok", label: "新增组合2", textModelConfigId: "t1", imageModelConfigId: "i1", videoModelConfigId: "v1" }),
      bundle({ bundleId: "platform-custom-bundle-10", apiOwner: "platform", label: "新增组合10", textModelConfigId: "t2", imageModelConfigId: "i2", videoModelConfigId: "v2", priority: 100 }),
      bundle({ bundleId: "platform-quality-bundle", apiOwner: "platform", label: "高质量", textModelConfigId: "t3", imageModelConfigId: "i3", videoModelConfigId: "v3", priority: 0 }),
      bundle({ bundleId: "platform-low-cost-bundle", apiOwner: "platform", label: "低成本", textModelConfigId: "t8", imageModelConfigId: "i8", videoModelConfigId: "v8", priority: 0 }),
      bundle({ bundleId: "byok-bundle-1", apiOwner: "byok", label: "新增组合1", textModelConfigId: "t4", imageModelConfigId: "i4", videoModelConfigId: "v4" }),
      bundle({ bundleId: "platform-draft", apiOwner: "platform", label: "新增组合0", textModelConfigId: "t5", enabled: true }),
      bundle({ bundleId: "platform-disabled", apiOwner: "platform", label: "新增组合0", textModelConfigId: "t6", imageModelConfigId: "i6", videoModelConfigId: "v6", enabled: false }),
      bundle({ bundleId: "platform-custom-bundle-1", apiOwner: "platform", label: "新增组合1", textModelConfigId: "t7", imageModelConfigId: "i7", videoModelConfigId: "v7", priority: 200 })
    ];

    expect(sortSelectableModelBundles(bundles).map((item) => item.bundleId)).toEqual([
      ...sortPlatformModelBundlesForDisplay(bundles.filter((bundle) => bundle.apiOwner === "platform" && bundle.enabled && isCompleteModelBundle(bundle))).map((bundle) => bundle.bundleId),
      "byok-bundle-1",
      "byok-bundle-2"
    ]);
    expect([bundles[0]!, bundles[4]!].sort(compareCustomModelBundles).map((item) => item.bundleId)).toEqual([
      "byok-bundle-1",
      "byok-bundle-2"
    ]);
  });

  it("puts the low-cost platform preset before the quality preset", () => {
    const quality = bundle({ bundleId: "platform-quality-bundle", apiOwner: "platform", label: "高质量", textModelConfigId: "t1", imageModelConfigId: "i1", videoModelConfigId: "v1" });
    const lowCost = bundle({ bundleId: "platform-low-cost-bundle", apiOwner: "platform", label: "低成本", textModelConfigId: "t2", imageModelConfigId: "i2", videoModelConfigId: "v2" });

    expect(sortPlatformModelBundlesForDisplay([quality, lowCost]).map((item) => item.bundleId)).toEqual([
      "platform-low-cost-bundle",
      "platform-quality-bundle"
    ]);
    expect(sortPlatformModelBundlesForDisplay([lowCost, quality]).map((item) => item.bundleId)).toEqual([
      "platform-low-cost-bundle",
      "platform-quality-bundle"
    ]);
  });

  it("keeps single model dropdown choices in API management order", () => {
    const models = [
      model({ configId: "platform-image-2", apiOwner: "platform", model: "image-model-2" }),
      model({ configId: "platform-image-1", apiOwner: "platform", model: "image-model-1" }),
      model({ configId: "disabled-platform-image", apiOwner: "platform", model: "image-model-disabled", enabled: false }),
      model({ configId: "byok-image-1", apiOwner: "byok", model: "byok-image-1" }),
      model({ configId: "byok-image-2", apiOwner: "byok", model: "byok-image-2" })
    ];

    expect(platformConfiguredModels(models).map((item) => item.configId)).toEqual([
      "platform-image-2",
      "platform-image-1"
    ]);
    expect(byokConfiguredModels(models).map((item) => item.configId)).toEqual([
      "byok-image-1",
      "byok-image-2"
    ]);
    expect(configuredModelOptions(platformConfiguredModels(models))).toEqual([
      "auto",
      "platform-image-2",
      "platform-image-1"
    ]);
  });

  it("derives labels, next custom names, preference fallbacks, and safe model ids", () => {
    const complete = bundle({
      bundleId: "platform-custom-bundle-1",
      apiOwner: "platform",
      label: "新增组合1",
      textModelConfigId: "text-1",
      imageModelConfigId: "image-1",
      videoModelConfigId: "video-1"
    });
    const incomplete = bundle({ bundleId: "byok-empty", apiOwner: "byok", label: "新增组合2" });

    expect(modelSchemeBundleLabel(complete)).toBe("平台 · 新增组合1");
    expect(nextModelBundleLabel([
      bundle({ bundleId: "a", apiOwner: "byok", label: "新增组合1" }),
      bundle({ bundleId: "b", apiOwner: "byok", label: "新增组合3" })
    ])).toBe("新增组合2");
    expect(nextModelBundleLabel([
      bundle({ bundleId: "a", apiOwner: "byok", label: "New Bundle 1" }),
      bundle({ bundleId: "b", apiOwner: "byok", label: "New Bundle 3" })
    ], "en")).toBe("New Bundle 2");
    expect(bundleIdForPreference([{ ...complete, enabled: false }, incomplete], complete.bundleId)).toBeUndefined();
    expect(bundleIdForPreference([complete, { ...incomplete, enabled: false }], "missing")).toBe("platform-custom-bundle-1");
    expect(bundleModelConfigIds(complete)).toEqual({
      textModelConfigId: "text-1",
      imageModelConfigId: "image-1",
      videoModelConfigId: "video-1"
    });
    expect(() => bundleModelConfigIds(incomplete)).toThrow("模型组合尚未配置完整");
    expect(() => bundleModelConfigIds(incomplete, "en")).toThrow("The model bundle is incomplete");
    expect(isCompleteModelBundle(complete)).toBe(true);
    expect(isCompleteModelBundle(incomplete)).toBe(false);
    expect(isCompleteModelBundle({ ...complete, imageModelConfigId: "auto" })).toBe(false);
    expect(normalizeModelBundleItem({ ...complete, apiOwner: "byok" })).toEqual({ ...complete, apiOwner: "byok" });
  });

  it("filters configured owner models and formats model choice labels", () => {
    const models = [
      model({ configId: "platform-text", apiOwner: "platform", model: "gpt-5.5-review" }),
      model({ configId: "disabled-platform-text", apiOwner: "platform", model: "gpt-5.5-review", enabled: false }),
      model({ configId: "byok-text", apiOwner: "byok", model: "deepseek-v4-pro" }),
      model({ configId: undefined, apiOwner: "platform", model: "missing-config" })
    ];

    expect(platformConfiguredModels(models).map((item) => item.configId)).toEqual(["platform-text"]);
    expect(modelConfigChoiceLabel("auto", models)).toBe("自动推荐");
    expect(modelConfigChoiceLabel("auto", models, "en")).toBe("Auto");
    expect(modelConfigChoiceLabel("missing", models)).toBe("已删除模型");
    expect(modelConfigChoiceLabel("missing", models, "en")).toBe("Deleted model");
    expect(modelConfigChoiceLabel("platform-text", models)).toBe("gpt-5.5-review");
  });
});
