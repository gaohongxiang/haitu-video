import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SeedanceProvider } from "../../src/providers/seedanceProvider.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("SeedanceProvider", () => {
  it("creates a task, polls until success, downloads the video, and records estimated cost", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "haitu-seedance-provider-"));
    tempDirs.push(outDir);
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/api/v3/contents/generations/tasks")) {
        return jsonResponse({ id: "cgt-test-1", status: "queued" });
      }
      if (String(url).endsWith("/api/v3/contents/generations/tasks/cgt-test-1")) {
        return jsonResponse({
          id: "cgt-test-1",
          status: "succeeded",
          content: [{ type: "video_url", url: "https://cdn.example.com/video.mp4" }],
          usage: { total_tokens: 9000 }
        });
      }
      if (String(url) === "https://cdn.example.com/video.mp4") {
        return new Response(Buffer.from("fake mp4 bytes"), {
          status: 200,
          headers: { "content-type": "video/mp4" }
        });
      }
      throw new Error(`Unexpected URL: ${String(url)}`);
    };
    const provider = new SeedanceProvider({
      apiKey: "test-key",
      baseUrl: "https://ark.ap-southeast.bytepluses.com",
      model: "dreamina-seedance-2-0-fast-260128",
      pollIntervalMs: 1,
      maxPolls: 2,
      resolution: "720p",
      estimatedCostAmount: 12,
      estimatedCostCurrency: "CNY",
      fetchImpl
    });

    const result = await provider.generateVideo({
      jobId: "job-1",
      productSku: "TK-001",
      prompt: "Create a 15 second 9:16 product ad.",
      script: "今すぐチェック",
      durationSeconds: 15,
      aspectRatio: "9:16",
      outputDir: outDir
    });

    expect(result.provider).toBe("volcengine-seedance");
    expect(result.model).toBe("dreamina-seedance-2-0-fast-260128");
    expect(result.output.mimeType).toBe("video/mp4");
    expect(result.cost.amount).toBeGreaterThan(0);
    expect(result.cost.currency).toBe("CNY");
    expect(result.providerTaskId).toBe("cgt-test-1");
    expect(result.usage).toEqual({
      completionTokens: undefined,
      totalTokens: 9000
    });
    await expect(readFile(result.output.path, "utf8")).resolves.toBe("fake mp4 bytes");
    const createBody = JSON.parse(String(calls[0]?.init?.body)) as {
      model: string;
      ratio: string;
      resolution: string;
      duration: number;
      watermark: boolean;
      content: Array<{ type: string; text?: string; role?: string; image_url?: { url: string } }>;
    };
    expect(createBody.model).toBe("dreamina-seedance-2-0-fast-260128");
    expect(createBody.ratio).toBe("9:16");
    expect(createBody.resolution).toBe("720p");
    expect(createBody.duration).toBe(15);
    expect(createBody.watermark).toBe(false);
    expect(createBody.content.some((item) => item.type === "text" && item.text?.includes("9:16"))).toBe(
      true
    );
  });

  it("uses 480p and estimates lower cost for short low-cost videos by default", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "haitu-seedance-low-cost-"));
    tempDirs.push(outDir);
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/api/v3/contents/generations/tasks")) {
        return jsonResponse({ id: "low-cost-task", status: "queued" });
      }
      if (String(url).endsWith("/api/v3/contents/generations/tasks/low-cost-task")) {
        return jsonResponse({
          id: "low-cost-task",
          status: "succeeded",
          content: { video_url: "https://cdn.example.com/low-cost.mp4" }
        });
      }
      if (String(url) === "https://cdn.example.com/low-cost.mp4") {
        return new Response(Buffer.from("mp4"), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${String(url)}`);
    };
    const provider = new SeedanceProvider({
      apiKey: "test-key",
      baseUrl: "https://ark.cn-beijing.volces.com",
      model: "doubao-seedance-2-0-fast-260128",
      pollIntervalMs: 1,
      maxPolls: 2,
      fetchImpl
    });

    const result = await provider.generateVideo({
      jobId: "job-1",
      productSku: "TK-001",
      prompt: "Create a product ad.",
      script: "今すぐチェック",
      durationSeconds: 8,
      aspectRatio: "9:16",
      outputDir: outDir
    });

    const createBody = JSON.parse(String(calls[0]?.init?.body)) as {
      resolution: string;
      duration: number;
    };
    expect(createBody.resolution).toBe("480p");
    expect(createBody.duration).toBe(8);
    expect(result.cost).toEqual({ amount: 6.4, currency: "CNY" });
  });

  it("sends product reference images as Seedance reference_image content", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "haitu-seedance-reference-"));
    tempDirs.push(outDir);
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url) === "https://assets.example.com/main.png") {
        return new Response(Buffer.from("main-reference"), {
          headers: {
            "content-type": "image/png"
          }
        });
      }
      if (String(url).endsWith("/api/v3/contents/generations/tasks")) {
        return jsonResponse({ id: "task-with-reference", status: "queued" });
      }
      if (String(url).endsWith("/api/v3/contents/generations/tasks/task-with-reference")) {
        return jsonResponse({
          id: "task-with-reference",
          status: "succeeded",
          output: { video_url: "https://cdn.example.com/video.mp4" }
        });
      }
      if (String(url) === "https://cdn.example.com/video.mp4") {
        return new Response(Buffer.from("fake mp4 bytes"), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${String(url)}`);
    };
    const provider = new SeedanceProvider({
      apiKey: "test-key",
      baseUrl: "https://ark.cn-beijing.volces.com",
      model: "doubao-seedance-2-0-fast-260128",
      pollIntervalMs: 1,
      maxPolls: 2,
      fetchImpl
    });

    await provider.generateVideo({
      jobId: "job-1",
      productSku: "TK-001",
      prompt: "Create a product ad.",
      script: "今すぐチェック",
      durationSeconds: 15,
      aspectRatio: "9:16",
      outputDir: outDir,
      referenceImages: ["https://assets.example.com/main.png"]
    });

    const createCall = calls.find((call) => call.url.endsWith("/api/v3/contents/generations/tasks"));
    const createBody = JSON.parse(String(createCall?.init?.body)) as {
      content: Array<{ type: string; role?: string; image_url?: { url: string } }>;
    };
    expect(createBody.content).toContainEqual({
      type: "image_url",
      role: "reference_image",
      image_url: {
        url: `data:image/png;base64,${Buffer.from("main-reference").toString("base64")}`
      }
    });
  });

  it("limits Seedance reference images to the first nine accepted by the API", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "haitu-seedance-reference-limit-"));
    tempDirs.push(outDir);
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).startsWith("https://assets.example.com/ref-")) {
        return new Response(Buffer.from(`reference-${String(url).match(/ref-(\d+)/)?.[1] ?? "x"}`), {
          headers: {
            "content-type": "image/png"
          }
        });
      }
      if (String(url).endsWith("/api/v3/contents/generations/tasks")) {
        return jsonResponse({ id: "task-with-nine-references", status: "queued" });
      }
      if (String(url).endsWith("/api/v3/contents/generations/tasks/task-with-nine-references")) {
        return jsonResponse({
          id: "task-with-nine-references",
          status: "succeeded",
          output: { video_url: "https://cdn.example.com/video.mp4" }
        });
      }
      if (String(url) === "https://cdn.example.com/video.mp4") {
        return new Response(Buffer.from("fake mp4 bytes"), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${String(url)}`);
    };
    const provider = new SeedanceProvider({
      apiKey: "test-key",
      baseUrl: "https://ark.cn-beijing.volces.com",
      model: "doubao-seedance-2-0-fast-260128",
      pollIntervalMs: 1,
      maxPolls: 2,
      fetchImpl
    });

    await provider.generateVideo({
      jobId: "job-1",
      productSku: "TK-001",
      prompt: "Create a product ad.",
      script: "今すぐチェック",
      durationSeconds: 15,
      aspectRatio: "9:16",
      outputDir: outDir,
      referenceImages: Array.from({ length: 10 }, (_, index) => `https://assets.example.com/ref-${index + 1}.png`)
    });

    const createCall = calls.find((call) => call.url.endsWith("/api/v3/contents/generations/tasks"));
    const createBody = JSON.parse(String(createCall?.init?.body)) as {
      content: Array<{ type: string; role?: string; image_url?: { url: string } }>;
    };
    const referenceImages = createBody.content.filter((item) => item.role === "reference_image");
    expect(referenceImages).toHaveLength(9);
    expect(referenceImages.at(8)?.image_url?.url).toBe(`data:image/png;base64,${Buffer.from("reference-9").toString("base64")}`);
    expect(calls.some((call) => call.url === "https://assets.example.com/ref-10.png")).toBe(false);
  });

  it("uses the configured reference image URL resolver for local files", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "haitu-seedance-reference-resolver-"));
    tempDirs.push(outDir);
    const resolverCalls: string[] = [];
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    const provider = new SeedanceProvider({
      apiKey: "seedance-key",
      baseUrl: "https://ark.example.test",
      model: "doubao-seedance-2-0-fast-260128",
      pollIntervalMs: 1,
      maxPolls: 2,
      referenceImageUrlResolver: async (reference) => {
        resolverCalls.push(reference);
        return `https://haitu.online/api/public-assets/token-${resolverCalls.length}`;
      },
      fetchImpl: (async (url, init) => {
        fetchCalls.push({ url: String(url), init });
        if (String(url).endsWith("/api/v3/contents/generations/tasks") && init?.method === "POST") {
          return jsonResponse({ id: "task-1", status: "queued" });
        }
        if (String(url).endsWith("/api/v3/contents/generations/tasks/task-1")) {
          return jsonResponse({
            id: "task-1",
            status: "succeeded",
            output: { video_url: "https://video.example.test/out.mp4" }
          });
        }
        if (String(url) === "https://video.example.test/out.mp4") {
          return new Response("video", { status: 200 });
        }
        throw new Error(`Unexpected URL: ${String(url)}`);
      }) as typeof fetch
    });

    await provider.generateVideo({
      jobId: "job-1",
      productSku: "sku-1",
      prompt: "prompt",
      script: "script",
      durationSeconds: 10,
      aspectRatio: "9:16",
      outputDir: outDir,
      referenceImages: ["/local/reference.png"],
      finalLanguage: "ja"
    });

    const createCall = fetchCalls.find((call) => call.url.endsWith("/api/v3/contents/generations/tasks"));
    const body = JSON.parse(String(createCall?.init?.body)) as {
      content: Array<{ type: string; image_url?: { url: string } }>;
    };
    expect(resolverCalls).toEqual(["/local/reference.png"]);
    expect(body.content[1]?.image_url?.url).toBe("https://haitu.online/api/public-assets/token-1");
  });

  it("inlines remote HTTPS reference images when no public URL resolver is configured", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "haitu-seedance-remote-inline-reference-"));
    tempDirs.push(outDir);
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    const provider = new SeedanceProvider({
      apiKey: "seedance-key",
      baseUrl: "https://ark.example.test",
      model: "doubao-seedance-2-0-fast-260128",
      pollIntervalMs: 1,
      maxPolls: 2,
      fetchImpl: (async (url, init) => {
        fetchCalls.push({ url: String(url), init });
        if (String(url) === "https://cdn.example.test/reference.png") {
          return new Response(Buffer.from("remote-image"), {
            headers: {
              "content-type": "image/png"
            }
          });
        }
        if (String(url).endsWith("/api/v3/contents/generations/tasks") && init?.method === "POST") {
          return jsonResponse({ id: "task-1", status: "queued" });
        }
        if (String(url).endsWith("/api/v3/contents/generations/tasks/task-1")) {
          return jsonResponse({
            id: "task-1",
            status: "succeeded",
            output: { video_url: "https://video.example.test/out.mp4" }
          });
        }
        if (String(url) === "https://video.example.test/out.mp4") {
          return new Response("video", { status: 200 });
        }
        throw new Error(`Unexpected URL: ${String(url)}`);
      }) as typeof fetch
    });

    await provider.generateVideo({
      jobId: "job-1",
      productSku: "sku-1",
      prompt: "prompt",
      script: "script",
      durationSeconds: 10,
      aspectRatio: "9:16",
      outputDir: outDir,
      referenceImages: ["https://cdn.example.test/reference.png"],
      finalLanguage: "ja"
    });

    const createCall = fetchCalls.find((call) => call.url.endsWith("/api/v3/contents/generations/tasks"));
    const body = JSON.parse(String(createCall?.init?.body)) as {
      content: Array<{ type: string; image_url?: { url: string } }>;
    };
    expect(fetchCalls.some((call) => call.url === "https://cdn.example.test/reference.png")).toBe(true);
    expect(body.content[1]?.image_url?.url).toBe(`data:image/png;base64,${Buffer.from("remote-image").toString("base64")}`);
  });

  it("uses the configured reference image URL resolver for remote HTTPS reference images", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "haitu-seedance-remote-reference-"));
    tempDirs.push(outDir);
    const resolverCalls: string[] = [];
    const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
    const provider = new SeedanceProvider({
      apiKey: "seedance-key",
      baseUrl: "https://ark.example.test",
      model: "doubao-seedance-2-0-fast-260128",
      pollIntervalMs: 1,
      maxPolls: 2,
      referenceImageUrlResolver: async (reference) => {
        resolverCalls.push(reference);
        return "https://haitu.online/api/public-assets/token-remote";
      },
      fetchImpl: (async (url, init) => {
        fetchCalls.push({ url: String(url), init });
        if (String(url).endsWith("/api/v3/contents/generations/tasks") && init?.method === "POST") {
          return jsonResponse({ id: "task-1", status: "queued" });
        }
        if (String(url).endsWith("/api/v3/contents/generations/tasks/task-1")) {
          return jsonResponse({
            id: "task-1",
            status: "succeeded",
            output: { video_url: "https://video.example.test/out.mp4" }
          });
        }
        if (String(url) === "https://video.example.test/out.mp4") {
          return new Response("video", { status: 200 });
        }
        throw new Error(`Unexpected URL: ${String(url)}`);
      }) as typeof fetch
    });

    await provider.generateVideo({
      jobId: "job-1",
      productSku: "sku-1",
      prompt: "prompt",
      script: "script",
      durationSeconds: 10,
      aspectRatio: "9:16",
      outputDir: outDir,
      referenceImages: ["https://cdn.example.test/reference.png"],
      finalLanguage: "ja"
    });

    const createCall = fetchCalls.find((call) => call.url.endsWith("/api/v3/contents/generations/tasks"));
    const body = JSON.parse(String(createCall?.init?.body)) as {
      content: Array<{ type: string; image_url?: { url: string } }>;
    };
    expect(resolverCalls).toEqual(["https://cdn.example.test/reference.png"]);
    expect(body.content[1]?.image_url?.url).toBe("https://haitu.online/api/public-assets/token-remote");
  });

  it("annotates create task failures with provider debugging metadata", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "haitu-seedance-create-failure-"));
    tempDirs.push(outDir);
    const cause = Object.assign(new Error("Headers Timeout Error"), {
      code: "UND_ERR_HEADERS_TIMEOUT"
    });
    const provider = new SeedanceProvider({
      apiKey: "seedance-key",
      baseUrl: "https://ark.example.test",
      model: "doubao-seedance-2-0-fast-260128",
      referenceImageUrlResolver: async () => "https://haitu.online/api/public-assets/token-1",
      fetchImpl: (async () => {
        throw Object.assign(new Error("fetch failed"), {
          name: "TypeError",
          cause
        });
      }) as typeof fetch
    });

    await expect(
      provider.generateVideo({
        jobId: "job-1",
        productSku: "sku-1",
        prompt: "prompt",
        script: "script",
        durationSeconds: 10,
        aspectRatio: "9:16",
        outputDir: outDir,
        referenceImages: ["/local/reference.png"],
        finalLanguage: "ja"
      })
    ).rejects.toMatchObject({
      message: "fetch failed",
      name: "TypeError",
      cause,
      providerPhase: "create-task",
      providerName: "volcengine-seedance",
      providerModel: "doubao-seedance-2-0-fast-260128",
      referenceImageCount: 1,
      usedTemporaryAssetUrls: true
    });
  });

  it("downloads the video when Volcengine returns the completed video URL in content.video_url", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "haitu-seedance-content-object-"));
    tempDirs.push(outDir);
    const fetchImpl: typeof fetch = async (url) => {
      if (String(url).endsWith("/api/v3/contents/generations/tasks")) {
        return jsonResponse({ id: "task-with-content-object", status: "queued" });
      }
      if (String(url).endsWith("/api/v3/contents/generations/tasks/task-with-content-object")) {
        return jsonResponse({
          id: "task-with-content-object",
          status: "succeeded",
          content: {
            video_url: "https://cdn.example.com/content-object-video.mp4"
          }
        });
      }
      if (String(url) === "https://cdn.example.com/content-object-video.mp4") {
        return new Response(Buffer.from("official content object bytes"), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${String(url)}`);
    };
    const provider = new SeedanceProvider({
      apiKey: "test-key",
      baseUrl: "https://ark.cn-beijing.volces.com",
      model: "doubao-seedance-2-0-fast-260128",
      pollIntervalMs: 1,
      maxPolls: 2,
      fetchImpl
    });

    const result = await provider.generateVideo({
      jobId: "job-1",
      productSku: "TK-001",
      prompt: "Create a product ad.",
      script: "今すぐチェック",
      durationSeconds: 15,
      aspectRatio: "9:16",
      outputDir: outDir
    });

    await expect(readFile(result.output.path, "utf8")).resolves.toBe("official content object bytes");
  });

  it("retries completed video downloads when the first attempt times out", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "haitu-seedance-download-retry-"));
    tempDirs.push(outDir);
    let downloadAttempts = 0;
    const fetchImpl: typeof fetch = async (url) => {
      if (String(url).endsWith("/api/v3/contents/generations/tasks")) {
        return jsonResponse({ id: "task-download-retry", status: "queued" });
      }
      if (String(url).endsWith("/api/v3/contents/generations/tasks/task-download-retry")) {
        return jsonResponse({
          id: "task-download-retry",
          status: "succeeded",
          output: { video_url: "https://cdn.example.com/retry-video.mp4" }
        });
      }
      if (String(url) === "https://cdn.example.com/retry-video.mp4") {
        downloadAttempts += 1;
        if (downloadAttempts === 1) {
          throw Object.assign(new Error("fetch failed"), {
            cause: Object.assign(new Error("Connect Timeout Error"), {
              code: "UND_ERR_CONNECT_TIMEOUT"
            })
          });
        }
        return new Response(Buffer.from("retried video bytes"), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${String(url)}`);
    };
    const provider = new SeedanceProvider({
      apiKey: "test-key",
      baseUrl: "https://ark.cn-beijing.volces.com",
      model: "doubao-seedance-2-0-fast-260128",
      pollIntervalMs: 1,
      maxPolls: 2,
      downloadMaxAttempts: 2,
      fetchImpl
    });

    const result = await provider.generateVideo({
      jobId: "job-1",
      productSku: "TK-001",
      prompt: "Create a product ad.",
      script: "今すぐチェック",
      durationSeconds: 15,
      aspectRatio: "9:16",
      outputDir: outDir
    });

    expect(downloadAttempts).toBe(2);
    await expect(readFile(result.output.path, "utf8")).resolves.toBe("retried video bytes");
  });

  it("keeps task usage and video URL on completed-task download failures", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "haitu-seedance-download-failure-metadata-"));
    tempDirs.push(outDir);
    const downloadError = Object.assign(new Error("fetch failed"), {
      cause: Object.assign(new Error("Connect Timeout Error"), {
        code: "UND_ERR_CONNECT_TIMEOUT"
      })
    });
    const fetchImpl: typeof fetch = async (url) => {
      if (String(url).endsWith("/api/v3/contents/generations/tasks")) {
        return jsonResponse({ id: "task-download-failed", status: "queued" });
      }
      if (String(url).endsWith("/api/v3/contents/generations/tasks/task-download-failed")) {
        return jsonResponse({
          id: "task-download-failed",
          status: "succeeded",
          usage: { completion_tokens: 9000, total_tokens: 9000 },
          output: { video_url: "https://cdn.example.com/failed-download.mp4" }
        });
      }
      if (String(url) === "https://cdn.example.com/failed-download.mp4") {
        throw downloadError;
      }
      throw new Error(`Unexpected URL: ${String(url)}`);
    };
    const provider = new SeedanceProvider({
      apiKey: "test-key",
      baseUrl: "https://ark.cn-beijing.volces.com",
      model: "doubao-seedance-2-0-fast-260128",
      pollIntervalMs: 1,
      maxPolls: 2,
      downloadMaxAttempts: 1,
      fetchImpl
    });

    await expect(
      provider.generateVideo({
        jobId: "job-1",
        productSku: "TK-001",
        prompt: "Create a product ad.",
        script: "今すぐチェック",
        durationSeconds: 10,
        aspectRatio: "9:16",
        outputDir: outDir
      })
    ).rejects.toMatchObject({
      name: "SeedanceOutputDownloadError",
      providerPhase: "download-output",
      providerTaskId: "task-download-failed",
      providerVideoUrl: "https://cdn.example.com/failed-download.mp4",
      usage: {
        completionTokens: 9000,
        totalTokens: 9000
      },
      output: {
        path: join(outDir, "job-1.seedance.mp4"),
        mimeType: "video/mp4"
      }
    });
  });

  it("throws before making a paid request when the API key is missing", async () => {
    const provider = new SeedanceProvider({
      apiKey: "",
      fetchImpl: async () => {
        throw new Error("fetch should not be called");
      }
    });

    await expect(
      provider.generateVideo({
        jobId: "job-1",
        productSku: "TK-001",
        prompt: "Create a product ad.",
        script: "今すぐチェック",
        durationSeconds: 15,
        aspectRatio: "9:16",
        outputDir: "outputs"
      })
    ).rejects.toThrow(/SEEDANCE_API_KEY|ARK_API_KEY/);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
