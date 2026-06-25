import { describe, expect, it, vi } from "vitest";

import { createTextProvider, inferTextModelApiMode } from "../../src/providers/textProviderFactory.js";

describe("textProviderFactory", () => {
  it("does not fall back to legacy text API key environment variables", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.TEXT_MODEL_API_KEY = "legacy-text-key";
    process.env.OPENAI_API_KEY = "legacy-openai-key";
    try {
      const fetchImpl = vi.fn(async () => new Response("{}")) as unknown as typeof fetch;
      const provider = createTextProvider({
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-pro",
        fetchImpl
      });

      await expect(provider.generateJson({
        system: "Return JSON.",
        user: "Ping."
      })).rejects.toThrow("请先在 API 管理配置文本模型 API Key。");
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("does not let legacy text model environment variables override API-managed defaults", async () => {
    const previousBaseUrl = process.env.TEXT_MODEL_BASE_URL;
    const previousModel = process.env.TEXT_MODEL_MODEL;
    process.env.TEXT_MODEL_BASE_URL = "https://api.deepseek.com";
    process.env.TEXT_MODEL_MODEL = "deepseek-v4-pro";
    try {
      const fetchImpl = vi.fn(async () =>
        new Response([
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "{\"ok\":true}" })}\n\n`,
          "data: [DONE]\n\n"
        ].join(""), {
          status: 200,
          headers: { "content-type": "text/event-stream" }
        })
      ) as unknown as typeof fetch;
      const provider = createTextProvider({
        apiKey: "test-key",
        fetchImpl
      });

      await expect(provider.generateJson<{ ok: boolean }>({
        system: "Return JSON.",
        user: "Ping."
      })).resolves.toEqual({ ok: true });

      expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/responses");
      const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body));
      expect(body.model).toBe("gpt-5.5");
    } finally {
      restoreEnv("TEXT_MODEL_BASE_URL", previousBaseUrl);
      restoreEnv("TEXT_MODEL_MODEL", previousModel);
    }
  });

  it("routes OpenAI GPT text configs through streamed Responses by default", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response([
        `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "{\"ok\":" })}\n\n`,
        `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "true}" })}\n\n`,
        "data: [DONE]\n\n"
      ].join(""), {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    ) as unknown as typeof fetch;
    const provider = createTextProvider({
      apiKey: "test-key",
      baseUrl: "https://api.openai.com",
      model: "gpt-5.5",
      fetchImpl
    });

    const result = await provider.generateJson<{ ok: boolean }>({
      system: "Return JSON.",
      user: "Ping."
    });

    expect(result).toEqual({ ok: true });
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body));
    expect(body).toEqual(expect.objectContaining({
      model: "gpt-5.5",
      instructions: "Return JSON.",
      input: "Ping.",
      stream: true
    }));
    expect(body.text?.format).toEqual({ type: "json_object" });
  });

  it("keeps DeepSeek-style OpenAI-compatible configs on Chat Completions by default", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({ ok: true })
            }
          }
        ]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    ) as unknown as typeof fetch;
    const provider = createTextProvider({
      apiKey: "test-key",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
      fetchImpl
    });

    const result = await provider.generateJson<{ ok: boolean }>({
      system: "Return JSON.",
      user: "Ping."
    });

    expect(result).toEqual({ ok: true });
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://api.deepseek.com/v1/chat/completions");
    const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body));
    expect(body.messages).toEqual([
      { role: "system", content: "Return JSON." },
      { role: "user", content: "Ping." }
    ]);
  });

  it("normalizes the codex_responses alias to streamed Responses", () => {
    expect(inferTextModelApiMode({
      apiMode: "codex_responses",
      baseUrl: "https://api.openai.com",
      model: "gpt-5.5"
    })).toBe("responses_stream");
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
