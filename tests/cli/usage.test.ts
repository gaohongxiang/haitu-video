import { describe, expect, it, vi } from "vitest";

import { runUsageCli } from "../../src/cli/usage.js";

describe("runUsageCli", () => {
  it("prints a support-friendly usage table and totals", async () => {
    process.env.ARK_API_KEY = "from-env";
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        total: 2,
        items: [
          {
            id: "cgt-15s",
            model: "doubao-seedance-2-0-fast-260128",
            status: "succeeded",
            usage: { completion_tokens: 324900, total_tokens: 324900 },
            created_at: 1780740000,
            updated_at: 1780740300,
            resolution: "720p",
            ratio: "9:16",
            duration: 15
          },
          {
            id: "cgt-8s",
            model: "doubao-seedance-2-0-fast-260128",
            status: "succeeded",
            usage: { completion_tokens: 173280, total_tokens: 173280 },
            created_at: 1780740600,
            updated_at: 1780740800,
            resolution: "480p",
            ratio: "9:16",
            duration: 8
          }
        ]
      })
    ) as unknown as typeof fetch;

    const output = await runUsageCli(
      ["--status", "succeeded", "--pageSize", "20"],
      { fetchImpl }
    );

    expect(output).toContain("Volcengine Seedance Usage");
    expect(output).toContain("cgt-15s");
    expect(output).toContain("324900");
    expect(output).toContain("12.02 CNY");
    expect(output).toContain("cgt-8s");
    expect(output).toContain("6.41 CNY");
    expect(output).toContain("Total tokens: 498180");
    expect(output).toContain("Estimated total: 18.43 CNY");
  });

  it("passes task ids as repeated filter parameters", async () => {
    process.env.ARK_API_KEY = "from-env";
    const fetchImpl = vi.fn(async () => jsonResponse({ total: 0, items: [] })) as unknown as typeof fetch;

    await runUsageCli(["--taskIds", "cgt-1,cgt-2"], { fetchImpl });

    const url = String(vi.mocked(fetchImpl).mock.calls[0]?.[0]);
    expect(url).toContain("filter.task_ids=cgt-1");
    expect(url).toContain("filter.task_ids=cgt-2");
  });

  it("prints one task detail when taskId is provided", async () => {
    process.env.ARK_API_KEY = "from-env";
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        id: "cgt-one",
        model: "doubao-seedance-2-0-fast-260128",
        status: "succeeded",
        usage: { completion_tokens: 173280, total_tokens: 173280 },
        resolution: "480p",
        ratio: "9:16",
        duration: 8
      })
    ) as unknown as typeof fetch;

    const output = await runUsageCli(["--taskId", "cgt-one"], { fetchImpl });

    expect(output).toContain("Volcengine Seedance Task");
    expect(output).toContain("cgt-one");
    expect(output).toContain("173280");
    expect(output).toContain("6.41 CNY");
  });

  it("cancels only queued tasks after checking the current status", async () => {
    process.env.ARK_API_KEY = "from-env";
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "cgt-queued", status: "queued" }))
      .mockResolvedValueOnce(jsonResponse({ id: "cgt-queued" })) as unknown as typeof fetch;

    const output = await runUsageCli(["--cancelTaskId", "cgt-queued"], { fetchImpl });

    expect(output).toContain("Cancelled queued task: cgt-queued");
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.method).toBe("GET");
    expect(vi.mocked(fetchImpl).mock.calls[1]?.[1]?.method).toBe("DELETE");
  });

  it("refuses to cancel a running or succeeded task", async () => {
    process.env.ARK_API_KEY = "from-env";
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ id: "cgt-running", status: "running" })
    ) as unknown as typeof fetch;

    await expect(runUsageCli(["--cancelTaskId", "cgt-running"], { fetchImpl })).rejects.toThrow(
      /only queued/
    );
    expect(vi.mocked(fetchImpl)).toHaveBeenCalledTimes(1);
  });

  it("requires explicit confirmation before deleting a completed task", async () => {
    process.env.ARK_API_KEY = "from-env";
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "cgt-done" })) as unknown as typeof fetch;

    await expect(runUsageCli(["--deleteTaskId", "cgt-done"], { fetchImpl })).rejects.toThrow(
      /--confirm true/
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("deletes a task when confirmation is explicit", async () => {
    process.env.ARK_API_KEY = "from-env";
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "cgt-done" })) as unknown as typeof fetch;

    const output = await runUsageCli(["--deleteTaskId", "cgt-done", "--confirm", "true"], {
      fetchImpl
    });

    expect(output).toContain("Deleted task: cgt-done");
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.method).toBe("DELETE");
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
