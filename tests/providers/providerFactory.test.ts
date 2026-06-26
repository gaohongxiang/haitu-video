import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MockVideoProvider } from "../../src/providers/mockVideoProvider.js";
import { createVideoProvider } from "../../src/providers/providerFactory.js";
import { VolcengineSeedanceProvider } from "../../src/providers/volcengine/seedanceProvider.js";

describe("createVideoProvider", () => {
  it("creates the mock provider by name", () => {
    const provider = createVideoProvider("mock");

    expect(provider).toBeInstanceOf(MockVideoProvider);
  });

  it("creates the Volcengine Seedance provider by canonical name only", () => {
    expect(createVideoProvider("volcengine-seedance")).toBeInstanceOf(VolcengineSeedanceProvider);
  });

  it("passes the requested Seedance resolution into the provider", async () => {
    const calls: Array<{ init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      calls.push({ init });
      return new Response(JSON.stringify({ id: "task-id", status: "succeeded" }), {
        headers: { "content-type": "application/json" }
      });
    };
    const provider = createVideoProvider("volcengine-seedance", {
      apiKey: "test-key",
      resolution: "4k",
      fetchImpl
    });

    await expect(provider.generateVideo({
      jobId: "job-1",
      productSku: "TK-001",
      prompt: "prompt",
      script: "script",
      durationSeconds: 8,
      aspectRatio: "9:16",
      outputDir: process.cwd()
    })).rejects.toThrow();

    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(expect.objectContaining({
      resolution: "4k"
    }));
  });

  it("does not keep the old seedance provider alias", () => {
    expect(() => createVideoProvider("seedance")).toThrow(/Unknown video provider/);
  });

  it("does not keep the old seedance provider module shim", () => {
    expect(existsSync(join(process.cwd(), "src/providers/seedanceProvider.ts"))).toBe(false);
  });

  it("rejects unknown provider names", () => {
    expect(() => createVideoProvider("veo")).toThrow(/Unknown video provider/);
  });
});
