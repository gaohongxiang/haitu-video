import { describe, expect, it, vi } from "vitest";

import { OpenAiCompatibleTextProvider } from "../../src/providers/openaiCompatibleTextProvider.js";

describe("OpenAiCompatibleTextProvider", () => {
  it("preserves OpenAI-compatible /api/v3 base URLs and uses the latest OpenAI default model", async () => {
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
    const provider = new OpenAiCompatibleTextProvider({
      apiKey: "test-key",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3/",
      fetchImpl
    });

    await provider.generateJson<{ ok: boolean }>({
      system: "Return JSON.",
      user: "Ping."
    });

    expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://ark.cn-beijing.volces.com/api/v3/chat/completions");
    const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("gpt-5.5");
  });
});
