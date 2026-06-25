import { describe, expect, it, vi } from "vitest";

import { discoverAvailableModels, modelDiscoveryEndpoint } from "../../src/providers/modelDiscovery.js";

describe("modelDiscovery", () => {
  it("discovers OpenAI-compatible models through the provider models endpoint", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({
        data: [
          { id: "gpt-5.5" },
          { id: "gpt-5.4-mini" }
        ]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    ) as unknown as typeof fetch;

    const models = await discoverAvailableModels("openai-compatible-text", {
      apiKey: "test-key",
      baseUrl: "https://api.openai.com",
      fetchImpl
    });

    expect(modelDiscoveryEndpoint("openai-compatible-text", "https://api.openai.com")).toBe("https://api.openai.com/v1/models");
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/models");
    expect(models.map((model) => model.id)).toEqual(["gpt-5.5", "gpt-5.4-mini"]);
    expect(models[0]).toEqual(expect.objectContaining({
      known: true,
      source: "models_api"
    }));
  });

  it("uses DeepSeek's official /models endpoint instead of inventing a v1 path", () => {
    expect(modelDiscoveryEndpoint("openai-compatible-text", "https://api.deepseek.com")).toBe("https://api.deepseek.com/models");
  });

  it("falls back to the built-in video catalog when provider discovery is not available", async () => {
    const models = await discoverAvailableModels("volcengine-seedance", {
      apiKey: "test-key",
      baseUrl: "https://ark.cn-beijing.volces.com"
    });

    expect(models).toEqual([
      expect.objectContaining({
        id: "doubao-seedance-2-0-fast-260128",
        label: "seedance-2.0-fast",
        source: "catalog"
      }),
      expect.objectContaining({
        id: "doubao-seedance-2-0-260128",
        label: "seedance-2.0",
        source: "catalog"
      })
    ]);
  });
});
