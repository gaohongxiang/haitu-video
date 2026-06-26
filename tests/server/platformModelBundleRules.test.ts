import { describe, expect, it } from "vitest";

import {
  isEnabledPlatformConfig,
  lowCostPlatformConfig,
  managedPlatformBundleIds,
  normalizeOptionalText,
  platformLowCostBundleId,
  platformQualityBundleId,
  preferredPlatformConfig,
  qualityPlatformConfig,
  stalePlatformBundleIds
} from "../../src/server/platformModelBundleRules.js";
import type { ModelStoredConfig } from "../../src/server/modelConfigStore.js";

describe("platform model bundle rules", () => {
  const configs: ModelStoredConfig[] = [
    config({
      configId: "text-pro",
      apiOwner: "platform",
      vendor: "deepseek",
      model: "deepseek-v4-pro",
      label: "DeepSeek Pro",
      tags: ["高质量"],
      enabled: true
    }),
    config({
      configId: "text-flash",
      apiOwner: "platform",
      vendor: "deepseek",
      model: "deepseek-v4-flash",
      label: "DeepSeek Flash",
      tags: ["低成本"],
      enabled: true
    }),
    config({
      configId: "byok-fast",
      apiOwner: "byok",
      vendor: "openai",
      model: "gpt-4.1-mini",
      label: "BYOK Fast",
      enabled: true
    }),
    config({
      configId: "disabled",
      apiOwner: "platform",
      vendor: "openai",
      model: "gpt-4.1",
      label: "Disabled",
      enabled: false
    })
  ];

  it("selects enabled platform configs and preferred models by model or label", () => {
    expect(configs.filter(isEnabledPlatformConfig).map((item) => item.configId)).toEqual([
      "text-pro",
      "text-flash"
    ]);
    expect(preferredPlatformConfig(configs, "deepseek-v4-flash")?.configId).toBe("text-flash");
    expect(preferredPlatformConfig(configs, "DeepSeek Pro")?.configId).toBe("text-pro");
    expect(preferredPlatformConfig(configs, "missing")).toBeUndefined();
  });

  it("selects quality and low-cost configs by tags, labels, model catalog text, or capabilities", () => {
    expect(qualityPlatformConfig(configs)?.configId).toBe("text-pro");
    expect(lowCostPlatformConfig(configs)?.configId).toBe("text-flash");
  });

  it("normalizes platform bundle constants and config ids", () => {
    expect(platformQualityBundleId).toBe("platform-quality-bundle");
    expect(platformLowCostBundleId).toBe("platform-low-cost-bundle");
    expect(stalePlatformBundleIds).toContain("platform-default-bundle");
    expect(managedPlatformBundleIds).toEqual(expect.arrayContaining([
      "platform-default-bundle",
      "platform-fast-bundle",
      "platform-custom-bundle",
      "platform-quality-bundle",
      "platform-low-cost-bundle"
    ]));
    expect(normalizeOptionalText("  model-id  ")).toBe("model-id");
    expect(normalizeOptionalText("   ")).toBeUndefined();
  });
});

function config(input: Partial<ModelStoredConfig> & Pick<ModelStoredConfig, "configId" | "apiOwner" | "vendor" | "model" | "label">): ModelStoredConfig {
  return {
    credentialId: `${input.configId}-credential`,
    providerId: input.providerId ?? "openai-compatible-text",
    modelKind: input.modelKind ?? "text",
    priority: input.priority ?? 0,
    enabled: input.enabled ?? true,
    ...input
  };
}
