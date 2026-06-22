import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runMakeVideoCli } from "../../src/cli/makeVideo.js";

let tempDirs: string[] = [];
const originalArkApiKey = process.env.ARK_API_KEY;
const originalSeedanceApiKey = process.env.SEEDANCE_API_KEY;

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
  restoreEnv();
});

describe("runMakeVideoCli", () => {
  it("runs a free mock pipeline and writes a pipeline report", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "haitu-make-video-"));
    tempDirs.push(tempDir);
    const productPath = join(tempDir, "product.json");
    const outDir = join(tempDir, "outputs");
    await writeProduct(productPath);

    const report = await runMakeVideoCli([
      "--product",
      productPath,
      "--outDir",
      outDir,
      "--provider",
      "mock",
      "--duration",
      "8"
    ]);

    expect(report.provider).toBe("mock");
    expect(report.status).toBe("completed");
    expect(report.paidRequestConfirmed).toBe(false);
    expect(report.raw.manifestPath).toContain("manifest.json");
    expect(report.final).toBeUndefined();
    expect(report.totalCost.amount).toBe(0);
    await expect(readFile(report.reportPath, "utf8")).resolves.toContain(
      "\"type\": \"haitu_make_video_report\""
    );
    await expect(readFile(report.raw.manifestPath, "utf8")).resolves.toContain(
      "\"provider\": {"
    );
  });

  it("defaults output to HAITU_DATA_DIR default workspace jobs when --outDir is omitted", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "haitu-make-video-default-data-"));
    tempDirs.push(tempDir);
    process.env.HAITU_DATA_DIR = join(tempDir, "runtime-data");
    const productPath = join(tempDir, "product.json");
    await writeProduct(productPath);

    const report = await runMakeVideoCli([
      "--product",
      productPath,
      "--provider",
      "mock",
      "--duration",
      "8"
    ], {
      cwd: tempDir
    });

    expect(report.reportPath).toBe(join(
      tempDir,
      "runtime-data",
      "workspaces",
      "default",
      "jobs",
      "make-video",
      "make-video-report.json"
    ));
  });

  it("estimates billing cost from recorded usage tokens", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "haitu-make-video-billing-"));
    tempDirs.push(tempDir);
    const productPath = join(tempDir, "product.json");
    const outDir = join(tempDir, "outputs");
    await writeProduct(productPath);
    await writeReferenceImages(tempDir);
    await writeFile(join(tempDir, ".env"), "ARK_API_KEY=from-env-file\n", "utf8");
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith("/api/v3/contents/generations/tasks")) {
        return jsonResponse({ id: "task-usage-1", status: "queued" });
      }
      if (value.endsWith("/api/v3/contents/generations/tasks/task-usage-1")) {
        return jsonResponse({
          id: "task-usage-1",
          status: "succeeded",
          usage: {
            completion_tokens: 80770,
            total_tokens: 80770
          },
          content: { video_url: "https://cdn.example.com/video.mp4" }
        });
      }
      if (value === "https://cdn.example.com/video.mp4") {
        return new Response(Buffer.from("mp4"), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${value}`);
    }) as unknown as typeof fetch;

    const report = await runMakeVideoCli(
      [
        "--product",
        productPath,
        "--outDir",
        outDir,
        "--provider",
        "volcengine-seedance",
        "--confirmPaid",
        "true",
        "--tokenPriceCnyPerMillion",
        "37"
      ],
      {
        cwd: tempDir,
        fetchImpl,
        postprocessVideo: async () => ({
          manifestPath: join(outDir, "final", "final-manifest.json"),
          outputPath: join(outDir, "final", "final.mp4"),
          subtitlePath: join(outDir, "final", "final.ass")
        })
      }
    );

    expect(report.billing).toEqual({
      tokenPriceCnyPerMillion: 37,
      totalTokens: 80770,
      estimatedCostCny: 2.99
    });
    await expect(readFile(report.reportPath, "utf8")).resolves.toContain(
      "\"estimatedCostCny\": 2.99"
    );
  });

  it("reuses a completed raw manifest by default to avoid duplicate paid generation", async () => {
    process.env.ARK_API_KEY = "from-env";
    const tempDir = await mkdtemp(join(tmpdir(), "haitu-make-video-reuse-"));
    tempDirs.push(tempDir);
    const productPath = join(tempDir, "product.json");
    const outDir = join(tempDir, "outputs");
    await writeProduct(productPath);
    await writeReferenceImages(tempDir);
    const manifestDir = join(outDir, "raw", "TK-001", "v1");
    await writeFile(join(manifestDir, "existing.mp4"), "fake mp4", "utf8").catch(async () => {
      await import("node:fs/promises").then(({ mkdir }) => mkdir(manifestDir, { recursive: true }));
      await writeFile(join(manifestDir, "existing.mp4"), "fake mp4", "utf8");
    });
    await writeFile(
      join(manifestDir, "manifest.json"),
      JSON.stringify({
        jobId: "TK-001-v1",
        status: "completed",
        product: { sku: "TK-001", title_ja: "折りたたみ収納ボックス" },
        version: 1,
        provider: {
          name: "volcengine-seedance",
          model: "doubao-seedance-2-0-fast-260128",
          taskId: "task-existing"
        },
        script: {
          voiceover: "折りたたみ可能。今すぐチェック",
          subtitleLines: ["折りたたみ可能。", "今すぐチェック"],
          cta: "今すぐチェック"
        },
        prompt: "Create video",
        output: {
          path: join(manifestDir, "existing.mp4"),
          width: 496,
          height: 864,
          durationSeconds: 8,
          mimeType: "video/mp4"
        },
        usage: { completionTokens: 80770, totalTokens: 80770 },
        qc: { result: "pass", checks: [] },
        cost: {
          provider: { amount: 2.8, currency: "CNY" },
          total: { amount: 2.8, currency: "CNY" }
        },
        paths: {
          outputDir: manifestDir,
          manifest: join(manifestDir, "manifest.json")
        }
      }),
      "utf8"
    );
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "should-not-call" })) as unknown as typeof fetch;

    const report = await runMakeVideoCli(
      [
        "--product",
        productPath,
        "--outDir",
        outDir,
        "--provider",
        "volcengine-seedance",
        "--confirmPaid",
        "true"
      ],
      {
        cwd: tempDir,
        fetchImpl,
        postprocessVideo: async () => ({
          manifestPath: join(outDir, "final", "final-manifest.json"),
          outputPath: join(outDir, "final", "final.mp4"),
          subtitlePath: join(outDir, "final", "final.ass")
        })
      }
    );

    expect(report.reusedRawManifest).toBe(true);
    expect(report.raw.taskId).toBe("task-existing");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("adopts an explicit existing manifest without calling the paid provider", async () => {
    process.env.ARK_API_KEY = "from-env";
    const tempDir = await mkdtemp(join(tmpdir(), "haitu-make-video-adopt-"));
    tempDirs.push(tempDir);
    const productPath = join(tempDir, "product.json");
    const outDir = join(tempDir, "outputs");
    await writeProduct(productPath);
    const existingDir = join(tempDir, "existing");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(existingDir, { recursive: true }));
    const existingVideo = join(existingDir, "existing.mp4");
    const existingManifest = join(existingDir, "manifest.json");
    await writeFile(existingVideo, "fake mp4", "utf8");
    await writeCompletedMp4Manifest(existingManifest, existingVideo);
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "should-not-call" })) as unknown as typeof fetch;

    const report = await runMakeVideoCli(
      [
        "--product",
        productPath,
        "--outDir",
        outDir,
        "--provider",
        "volcengine-seedance",
        "--confirmPaid",
        "true",
        "--reuseManifest",
        existingManifest
      ],
      {
        cwd: tempDir,
        fetchImpl,
        postprocessVideo: async () => ({
          manifestPath: join(outDir, "final", "final-manifest.json"),
          outputPath: join(outDir, "final", "final.mp4"),
          subtitlePath: join(outDir, "final", "final.ass")
        })
      }
    );

    expect(report.reusedRawManifest).toBe(true);
    expect(report.raw.manifestPath).toBe(existingManifest);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("recovers a missing raw mp4 from the provider task instead of regenerating", async () => {
    process.env.ARK_API_KEY = "from-env";
    const tempDir = await mkdtemp(join(tmpdir(), "haitu-make-video-recover-"));
    tempDirs.push(tempDir);
    const productPath = join(tempDir, "product.json");
    const outDir = join(tempDir, "outputs");
    await writeProduct(productPath);
    const existingDir = join(tempDir, "existing");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(existingDir, { recursive: true }));
    const missingVideo = join(existingDir, "missing.mp4");
    const existingManifest = join(existingDir, "manifest.json");
    await writeCompletedMp4Manifest(existingManifest, missingVideo);
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith("/api/v3/contents/generations/tasks/task-existing")) {
        return jsonResponse({
          id: "task-existing",
          status: "succeeded",
          content: { video_url: "https://cdn.example.com/recovered.mp4" }
        });
      }
      if (value === "https://cdn.example.com/recovered.mp4") {
        return new Response(Buffer.from("recovered mp4"), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${value}`);
    }) as unknown as typeof fetch;

    const report = await runMakeVideoCli(
      [
        "--product",
        productPath,
        "--outDir",
        outDir,
        "--provider",
        "volcengine-seedance",
        "--confirmPaid",
        "true",
        "--reuseManifest",
        existingManifest
      ],
      {
        cwd: tempDir,
        fetchImpl,
        postprocessVideo: async () => ({
          manifestPath: join(outDir, "final", "final-manifest.json"),
          outputPath: join(outDir, "final", "final.mp4"),
          subtitlePath: join(outDir, "final", "final.ass")
        })
      }
    );

    expect(report.recoveredRawOutput).toBe(true);
    expect(await readFile(missingVideo, "utf8")).toBe("recovered mp4");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("recovers an existing provider task without requiring a fresh paid confirmation", async () => {
    process.env.ARK_API_KEY = "from-env";
    const tempDir = await mkdtemp(join(tmpdir(), "haitu-make-video-recover-unpaid-"));
    tempDirs.push(tempDir);
    const productPath = join(tempDir, "product.json");
    const outDir = join(tempDir, "outputs");
    await writeProduct(productPath);
    const existingDir = join(tempDir, "existing");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(existingDir, { recursive: true }));
    const missingVideo = join(existingDir, "missing.mp4");
    const existingManifest = join(existingDir, "manifest.json");
    await writeCompletedMp4Manifest(existingManifest, missingVideo);
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith("/api/v3/contents/generations/tasks/task-existing")) {
        return jsonResponse({
          id: "task-existing",
          status: "succeeded",
          output: { video_url: "https://cdn.example.com/recovered-without-paid-confirm.mp4" }
        });
      }
      if (value === "https://cdn.example.com/recovered-without-paid-confirm.mp4") {
        return new Response(Buffer.from("recovered mp4"), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${value}`);
    }) as unknown as typeof fetch;

    const report = await runMakeVideoCli(
      [
        "--product",
        productPath,
        "--outDir",
        outDir,
        "--provider",
        "volcengine-seedance",
        "--confirmPaid",
        "false",
        "--reuseManifest",
        existingManifest
      ],
      {
        cwd: tempDir,
        fetchImpl,
        postprocessVideo: async () => ({
          manifestPath: join(outDir, "final", "final-manifest.json"),
          outputPath: join(outDir, "final", "final.mp4"),
          subtitlePath: join(outDir, "final", "final.ass")
        })
      }
    );

    expect(report.recoveredRawOutput).toBe(true);
    expect(report.paidRequestConfirmed).toBe(false);
    expect(await readFile(missingVideo, "utf8")).toBe("recovered mp4");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("recovers a reusable provider task after the original product JSON was deleted", async () => {
    process.env.ARK_API_KEY = "from-env";
    const tempDir = await mkdtemp(join(tmpdir(), "haitu-make-video-recover-missing-product-"));
    tempDirs.push(tempDir);
    const productPath = join(tempDir, "products", "deleted-product.json");
    const outDir = join(tempDir, "outputs");
    const existingDir = join(tempDir, "existing");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(existingDir, { recursive: true }));
    const missingVideo = join(existingDir, "missing.mp4");
    const existingManifest = join(existingDir, "manifest.json");
    await writeCompletedMp4Manifest(existingManifest, missingVideo);
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith("/api/v3/contents/generations/tasks/task-existing")) {
        return jsonResponse({
          id: "task-existing",
          status: "succeeded",
          output: { video_url: "https://cdn.example.com/recovered-after-delete.mp4" }
        });
      }
      if (value === "https://cdn.example.com/recovered-after-delete.mp4") {
        return new Response(Buffer.from("recovered mp4"), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${value}`);
    }) as unknown as typeof fetch;

    const report = await runMakeVideoCli(
      [
        "--product",
        productPath,
        "--outDir",
        outDir,
        "--provider",
        "volcengine-seedance",
        "--confirmPaid",
        "false",
        "--reuseManifest",
        existingManifest
      ],
      {
        cwd: tempDir,
        fetchImpl,
        postprocessVideo: async () => ({
          manifestPath: join(outDir, "final", "final-manifest.json"),
          outputPath: join(outDir, "final", "final.mp4"),
          subtitlePath: join(outDir, "final", "final.ass")
        })
      }
    );

    expect(report.productSku).toBe("TK-001");
    expect(report.reusedRawManifest).toBe(true);
    expect(report.recoveredRawOutput).toBe(true);
    expect(report.paidRequestConfirmed).toBe(false);
    expect(await readFile(missingVideo, "utf8")).toBe("recovered mp4");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reports an unavailable reusable manifest instead of blaming a missing product JSON", async () => {
    process.env.ARK_API_KEY = "from-env";
    const tempDir = await mkdtemp(join(tmpdir(), "haitu-make-video-recover-missing-manifest-"));
    tempDirs.push(tempDir);
    const productPath = join(tempDir, "products", "deleted-product.json");
    const missingManifest = join(tempDir, "existing", "missing-manifest.json");
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "should-not-call" })) as unknown as typeof fetch;

    await expect(
      runMakeVideoCli(
        [
          "--product",
          productPath,
          "--outDir",
          join(tempDir, "outputs"),
          "--provider",
          "volcengine-seedance",
          "--confirmPaid",
          "false",
          "--reuseManifest",
          missingManifest
        ],
        {
          cwd: tempDir,
          fetchImpl
        }
      )
    ).rejects.toThrow(/恢复下载清单不存在或不可用/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses paid providers unless explicitly confirmed", async () => {
    process.env.ARK_API_KEY = "from-env";
    const tempDir = await mkdtemp(join(tmpdir(), "haitu-make-video-paid-"));
    tempDirs.push(tempDir);
    const productPath = join(tempDir, "product.json");
    await writeProduct(productPath);
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "should-not-call" })) as unknown as typeof fetch;

    await expect(
      runMakeVideoCli(
        [
          "--product",
          productPath,
          "--outDir",
          join(tempDir, "outputs"),
          "--provider",
          "volcengine-seedance"
        ],
        {
          cwd: tempDir,
          fetchImpl
        }
      )
    ).rejects.toThrow(/--confirmPaid true/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

async function writeProduct(path: string): Promise<void> {
  await writeFile(
    path,
    JSON.stringify({
      sku: "TK-001",
      title_ja: "折りたたみ収納ボックス",
      category: "収納用品",
      materials: ["PP"],
      dimensions: "36x25x19cm",
      verified_selling_points: ["折りたたみ可能", "積み重ね可能", "省スペース"],
      usage_scenes: ["キッチン", "洗面所", "クローゼット"],
      forbidden_claims: ["防水未確認", "耐荷重未確認", "日本で大人気は未確認"],
      reference_images: ["main.jpg", "detail1.jpg", "detail2.jpg"]
    }),
    "utf8"
  );
}

async function writeReferenceImages(dir: string): Promise<void> {
  await Promise.all(
    ["main.jpg", "detail1.jpg", "detail2.jpg"].map((fileName) =>
      writeFile(join(dir, fileName), Buffer.from("fake jpg bytes"))
    )
  );
}

async function writeCompletedMp4Manifest(path: string, outputPath: string): Promise<void> {
  await writeFile(
    path,
    JSON.stringify({
      jobId: "TK-001-v1",
      status: "completed",
      product: { sku: "TK-001", title_ja: "折りたたみ収納ボックス" },
      version: 1,
      provider: {
        name: "volcengine-seedance",
        model: "doubao-seedance-2-0-fast-260128",
        taskId: "task-existing"
      },
      script: {
        voiceover: "折りたたみ可能。今すぐチェック",
        subtitleLines: ["折りたたみ可能。", "今すぐチェック"],
        cta: "今すぐチェック"
      },
      prompt: "Create video",
      output: {
        path: outputPath,
        width: 496,
        height: 864,
        durationSeconds: 8,
        mimeType: "video/mp4"
      },
      usage: { completionTokens: 80770, totalTokens: 80770 },
      qc: { result: "pass", checks: [] },
      cost: {
        provider: { amount: 2.8, currency: "CNY" },
        total: { amount: 2.8, currency: "CNY" }
      },
      paths: {
        outputDir: join(outputPath, ".."),
        manifest: path
      }
    }),
    "utf8"
  );
}

function restoreEnv(): void {
  if (originalArkApiKey === undefined) {
    delete process.env.ARK_API_KEY;
  } else {
    process.env.ARK_API_KEY = originalArkApiKey;
  }

  if (originalSeedanceApiKey === undefined) {
    delete process.env.SEEDANCE_API_KEY;
  } else {
    process.env.SEEDANCE_API_KEY = originalSeedanceApiKey;
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
