import { describe, expect, it } from "vitest";

import { resolveVideoRequestModel } from "../../src/server/modelConfigSelection.js";
import type { ModelConfigStore, ModelStoredConfig } from "../../src/server/modelConfigStore.js";

describe("model config selection", () => {
  it("uses the selected saved video model and ignores request model overrides", async () => {
    const config = modelConfig({
      configId: "video-fast",
      model: "doubao-seedance-2-0-fast-260128"
    });
    const resolved = await resolveVideoRequestModel({
      provider: "volcengine-seedance",
      modelConfigStore: modelStore([config]),
      body: {
        providerModelConfigId: "video-fast",
        providerModel: "doubao-seedance-2-0-260128"
      }
    });

    expect(resolved.providerModelConfigId).toBe("video-fast");
    expect(resolved.providerModel).toBe("doubao-seedance-2-0-fast-260128");
  });
});

function modelConfig(input: Partial<ModelStoredConfig>): ModelStoredConfig {
  return {
    credentialId: "credential-1",
    configId: input.configId ?? "config-1",
    providerId: "volcengine-seedance",
    modelKind: "video",
    apiOwner: "platform",
    apiKey: "test-key",
    label: "Seedance",
    vendor: "volcengine",
    priority: 0,
    baseUrl: "https://ark.cn-beijing.volces.com",
    model: input.model ?? "doubao-seedance-2-0-fast-260128",
    enabled: true,
    ...input
  };
}

function modelStore(configs: ModelStoredConfig[]): ModelConfigStore {
  return {
    async listConfigs() {
      return configs;
    },
    async getConfig(_providerId, configId) {
      return configId && configId !== "auto"
        ? configs.find((config) => config.configId === configId)
        : configs.find((config) => config.enabled);
    },
    async getConfigById(_providerId, configId) {
      return configs.find((config) => config.configId === configId);
    },
    async set() {
      throw new Error("not implemented");
    },
    async delete() {
      throw new Error("not implemented");
    }
  };
}
