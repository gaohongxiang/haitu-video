import { describe, expect, it } from "vitest";

import {
  buildModelSchemeOptions,
  bundleIdForPreference,
  bundleModelConfigIds,
  compareCustomModelBundles,
  isCompleteModelBundle,
  modelConfigChoiceLabel,
  modelSchemeBundleLabel,
  modelSchemeChoiceLabel,
  nextModelBundleLabel,
  normalizeModelBundleItem,
  platformConfiguredModels,
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
    priority: 0,
    capabilities: ["text"],
    modelKind: "text",
    ...input
  };
}

describe("model service bundle rules", () => {
  it("builds selectable scheme options from complete bundles without an automatic option", () => {
    const options = buildModelSchemeOptions({
      platformBundles: [
        bundle({ bundleId: "platform-custom-bundle-1", apiOwner: "platform", label: "新增组合1" }),
        bundle({ bundleId: "platform-low-cost-bundle", apiOwner: "platform", label: "低成本" }),
        bundle({ bundleId: "platform-quality-bundle", apiOwner: "platform", label: "高质量" })
      ],
      byokBundles: [
        bundle({ bundleId: "byok-bundle-2", apiOwner: "byok", label: "新增组合2" })
      ]
    });

    expect(options.map((option) => option.label)).toEqual([
      "平台 · 高质量",
      "平台 · 低成本",
      "平台 · 新增组合1",
      "自带 · 新增组合2"
    ]);
    expect(options.map((option) => option.id)).not.toContain("auto");
    expect(modelSchemeChoiceLabel("bundle:missing", options)).toBe("平台 · 高质量");
  });

  it("keeps platform bundles before BYOK bundles and orders numbered custom bundles naturally", () => {
    const bundles = [
      bundle({ bundleId: "byok-bundle-2", apiOwner: "byok", label: "新增组合2" }),
      bundle({ bundleId: "platform-custom-bundle-10", apiOwner: "platform", label: "新增组合10" }),
      bundle({ bundleId: "platform-quality-bundle", apiOwner: "platform", label: "高质量", priority: 100 }),
      bundle({ bundleId: "byok-bundle-1", apiOwner: "byok", label: "新增组合1" }),
      bundle({ bundleId: "platform-custom-bundle-1", apiOwner: "platform", label: "新增组合1" })
    ];

    expect(sortSelectableModelBundles(bundles).map((item) => item.bundleId)).toEqual([
      "platform-quality-bundle",
      "platform-custom-bundle-1",
      "platform-custom-bundle-10",
      "byok-bundle-1",
      "byok-bundle-2"
    ]);
    expect([bundles[0]!, bundles[3]!].sort(compareCustomModelBundles).map((item) => item.bundleId)).toEqual([
      "byok-bundle-1",
      "byok-bundle-2"
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
    expect(bundleIdForPreference([complete, { ...incomplete, enabled: false }], "missing")).toBe("platform-custom-bundle-1");
    expect(bundleModelConfigIds(incomplete)).toEqual({
      textModelConfigId: "auto",
      imageModelConfigId: "auto",
      videoModelConfigId: "auto"
    });
    expect(isCompleteModelBundle(complete)).toBe(true);
    expect(isCompleteModelBundle(incomplete)).toBe(false);
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
    expect(modelConfigChoiceLabel("missing", models)).toBe("已删除模型");
    expect(modelConfigChoiceLabel("platform-text", models)).toBe("gpt-5.5-review");
  });
});
