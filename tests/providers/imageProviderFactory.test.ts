import { describe, expect, it, vi } from "vitest";

import { createImageProvider } from "../../src/providers/imageProviderFactory.js";

describe("imageProviderFactory", () => {
  it("does not fall back to legacy image API key environment variables", async () => {
    const previousImageKey = process.env.IMAGE_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.IMAGE_MODEL_API_KEY = "legacy-image-key";
    process.env.OPENAI_API_KEY = "legacy-openai-key";
    try {
      const fetchImpl = vi.fn(async () => new Response("{}")) as unknown as typeof fetch;
      const provider = createImageProvider({
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
        model: "gemini-3-pro-image",
        fetchImpl
      });

      await expect(provider.generateImages({
        prompt: "Tiny white square.",
        count: 1
      })).rejects.toThrow("请先在 API 管理配置图片模型 API Key。");
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      restoreEnv("IMAGE_MODEL_API_KEY", previousImageKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("does not let legacy image model environment variables override API-managed defaults", async () => {
    const previousBaseUrl = process.env.IMAGE_MODEL_BASE_URL;
    const previousModel = process.env.IMAGE_MODEL_MODEL;
    process.env.IMAGE_MODEL_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
    process.env.IMAGE_MODEL_MODEL = "gemini-2.5-flash-image";
    try {
      const fetchImpl = vi.fn(async () =>
        new Response(JSON.stringify({
          data: [
            {
              b64_json: Buffer.from("fake image").toString("base64"),
              mime_type: "image/png"
            }
          ]
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      ) as unknown as typeof fetch;

      const provider = createImageProvider({
        apiKey: "test-key",
        fetchImpl
      });

      await expect(provider.generateImages({
        prompt: "Tiny white square.",
        count: 1
      })).resolves.toHaveLength(1);

      expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/images/generations");
      const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body));
      expect(body.model).toBe("gpt-image-2");
    } finally {
      restoreEnv("IMAGE_MODEL_BASE_URL", previousBaseUrl);
      restoreEnv("IMAGE_MODEL_MODEL", previousModel);
    }
  });

  it("creates OpenAI-compatible image providers through a factory like text providers", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({
        data: [
          {
            b64_json: Buffer.from("fake image").toString("base64"),
            mime_type: "image/png"
          }
        ]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    ) as unknown as typeof fetch;

    const provider = createImageProvider({
      apiKey: "test-key",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
      model: "gemini-3-pro-image",
      fetchImpl
    });

    const images = await provider.generateImages({
      prompt: "Tiny white square.",
      count: 1
    });

    expect(images[0]?.mimeType).toBe("image/png");
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://generativelanguage.googleapis.com/v1beta/openai/images/generations");
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
