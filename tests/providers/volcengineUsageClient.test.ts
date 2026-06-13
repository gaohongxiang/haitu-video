import { describe, expect, it, vi } from "vitest";

import { VolcengineUsageClient } from "../../src/providers/volcengine/usageClient.js";

describe("VolcengineUsageClient", () => {
  it("lists content generation tasks with usage and summarizes billable tokens", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return jsonResponse({
        total: 2,
        items: [
          {
            id: "cgt-1",
            model: "doubao-seedance-2-0-fast-260128",
            status: "succeeded",
            usage: {
              completion_tokens: 324900,
              total_tokens: 324900
            },
            created_at: 1780740000,
            updated_at: 1780740300,
            resolution: "720p",
            ratio: "9:16",
            duration: 15
          },
          {
            id: "cgt-2",
            model: "doubao-seedance-2-0-fast-260128",
            status: "succeeded",
            usage: {
              completion_tokens: 173280,
              total_tokens: 173280
            },
            created_at: 1780740600,
            updated_at: 1780740800,
            resolution: "480p",
            ratio: "9:16",
            duration: 8
          }
        ]
      });
    }) as unknown as typeof fetch;
    const client = new VolcengineUsageClient({
      apiKey: "test-key",
      fetchImpl,
      tokenPriceCnyPerMillion: 37
    });

    const report = await client.listTasks({
      pageSize: 20,
      status: "succeeded",
      model: "doubao-seedance-2-0-fast-260128"
    });

    expect(calls[0]?.init?.method).toBe("GET");
    expect(calls[0]?.url).toContain("/api/v3/contents/generations/tasks");
    expect(calls[0]?.url).toContain("page_size=20");
    expect(calls[0]?.url).toContain("filter.status=succeeded");
    expect(calls[0]?.url).toContain("filter.model=doubao-seedance-2-0-fast-260128");
    expect(report.totalTokens).toBe(498180);
    expect(report.estimatedCostCny).toBe(18.43);
    expect(report.items[0]?.estimatedCostCny).toBe(12.02);
    expect(report.items[1]?.estimatedCostCny).toBe(6.41);
  });

  it("uses repeated filter.task_ids query parameters", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ total: 0, items: [] })) as unknown as typeof fetch;
    const client = new VolcengineUsageClient({
      apiKey: "test-key",
      fetchImpl
    });

    await client.listTasks({
      taskIds: ["cgt-1", "cgt-2"]
    });

    const url = String(vi.mocked(fetchImpl).mock.calls[0]?.[0]);
    expect(url).toContain("filter.task_ids=cgt-1");
    expect(url).toContain("filter.task_ids=cgt-2");
  });

  it("gets one content generation task by id", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        id: "cgt-one",
        model: "doubao-seedance-2-0-fast-260128",
        status: "running",
        usage: {
          total_tokens: 0
        },
        resolution: "480p",
        ratio: "9:16",
        duration: 8
      })
    ) as unknown as typeof fetch;
    const client = new VolcengineUsageClient({
      apiKey: "test-key",
      fetchImpl
    });

    const task = await client.getTask("cgt-one");

    expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toContain(
      "/api/v3/contents/generations/tasks/cgt-one"
    );
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.method).toBe("GET");
    expect(task.id).toBe("cgt-one");
    expect(task.status).toBe("running");
  });

  it("deletes or cancels one content generation task by id", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    const client = new VolcengineUsageClient({
      apiKey: "test-key",
      fetchImpl
    });

    await client.deleteTask("cgt-delete");

    expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toContain(
      "/api/v3/contents/generations/tasks/cgt-delete"
    );
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.method).toBe("DELETE");
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
