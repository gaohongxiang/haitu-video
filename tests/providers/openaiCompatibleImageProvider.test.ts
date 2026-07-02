import { describe, expect, it, vi } from "vitest";

import { OpenAiCompatibleImageProvider } from "../../src/providers/openaiCompatibleImageProvider.js";

describe("OpenAiCompatibleImageProvider", () => {
  it("preserves Gemini OpenAI-compatible image base URLs", async () => {
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
    const provider = new OpenAiCompatibleImageProvider({
      apiKey: "test-key",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
      model: "gemini-3-pro-image",
      fetchImpl
    });

    await provider.generateImages({
      prompt: "Tiny white square.",
      count: 1
    });

    expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://generativelanguage.googleapis.com/v1beta/openai/images/generations");
    const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("gemini-3-pro-image");
  });

  it("preserves Volcengine /api/v3 image base URLs from the unified model catalog", async () => {
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
    const provider = new OpenAiCompatibleImageProvider({
      apiKey: "test-key",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3/",
      model: "doubao-seedream-5-0-lite",
      fetchImpl
    });

    await provider.generateImages({
      prompt: "Tiny white square.",
      count: 1
    });

    expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://ark.cn-beijing.volces.com/api/v3/images/generations");
    const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("doubao-seedream-5-0-lite");
  });

  it("uses the image edit endpoint when reference images are provided", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({
        data: [
          {
            b64_json: Buffer.from("edited image").toString("base64"),
            mime_type: "image/png"
          }
        ]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    ) as unknown as typeof fetch;
    const provider = new OpenAiCompatibleImageProvider({
      apiKey: "test-key",
      baseUrl: "https://api.openai.com",
      model: "gpt-image-2",
      fetchImpl
    });

    await provider.generateImages({
      prompt: "Keep the product shape and improve the lighting.",
      count: 1,
      referenceImages: [
        {
          bytes: Buffer.from("reference-image"),
          fileName: "main.png",
          mimeType: "image/png"
        }
      ]
    });

    expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/images/edits");
    const body = vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    const formData = body as FormData;
    expect(formData.get("model")).toBe("gpt-image-2");
    expect(formData.get("prompt")).toBe("Keep the product shape and improve the lighting.");
    expect(formData.get("n")).toBe("1");
    expect(formData.getAll("image")).toHaveLength(1);
  });
});
