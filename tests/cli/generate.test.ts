import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runGenerateCli } from "../../src/cli/generate.js";

let tempDirs: string[] = [];
const originalArkApiKey = process.env.ARK_API_KEY;
const originalSeedanceApiKey = process.env.SEEDANCE_API_KEY;

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
  restoreEnv();
});

describe("runGenerateCli", () => {
  it("generates multiple mock video manifests and a summary", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "haitu-cli-"));
    tempDirs.push(tempDir);
    const productPath = join(tempDir, "product.json");
    const outDir = join(tempDir, "outputs");
    await writeFile(
      productPath,
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

    const summary = await runGenerateCli([
      "--product",
      productPath,
      "--versions",
      "2",
      "--outDir",
      outDir
    ]);

    expect(summary.generated).toBe(2);
    expect(summary.totalCost.amount).toBe(0);
    expect(summary.summaryPath).toBe(join(outDir, "summary.json"));
    await expect(readFile(join(outDir, "summary.json"), "utf8")).resolves.toContain(
      "\"generated\": 2"
    );
    await expect(readFile(summary.manifests[0] ?? "", "utf8")).resolves.toContain(
      "\"durationSeconds\": 8"
    );
  });

  it("defaults output to the project data default workspace jobs when --outDir is omitted", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "haitu-cli-default-data-"));
    tempDirs.push(tempDir);
    delete process.env.HAITU_DATA_DIR;
    const productPath = join(tempDir, "product.json");
    await writeFile(
      productPath,
      JSON.stringify({
        sku: "TK-001",
        title_ja: "折りたたみ収納ボックス",
        category: "収納用品",
        materials: ["PP"],
        dimensions: "36x25x19cm",
        verified_selling_points: ["折りたたみ可能"],
        usage_scenes: ["キッチン"],
        forbidden_claims: ["防水未確認"],
        reference_images: ["main.jpg"]
      }),
      "utf8"
    );

    const summary = await runGenerateCli([
      "--product",
      productPath,
      "--versions",
      "1"
    ], {
      cwd: tempDir
    });

    expect(summary.summaryPath).toBe(join(
      tempDir,
      "data",
      "workspaces",
      "default",
      "jobs",
      "generate",
      "summary.json"
    ));
  });

  it("passes an explicit duration to generated jobs", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "haitu-cli-duration-"));
    tempDirs.push(tempDir);
    const productPath = join(tempDir, "product.json");
    const outDir = join(tempDir, "outputs");
    await writeFile(
      productPath,
      JSON.stringify({
        sku: "TK-001",
        title_ja: "折りたたみ収納ボックス",
        category: "収納用品",
        materials: ["PP"],
        dimensions: "36x25x19cm",
        verified_selling_points: ["折りたたみ可能"],
        usage_scenes: ["キッチン"],
        forbidden_claims: ["防水未確認"],
        reference_images: ["main.jpg"]
      }),
      "utf8"
    );

    const summary = await runGenerateCli([
      "--product",
      productPath,
      "--versions",
      "1",
      "--outDir",
      outDir,
      "--duration",
      "8"
    ]);

    await expect(readFile(summary.manifests[0] ?? "", "utf8")).resolves.toContain(
      "\"durationSeconds\": 8"
    );
  });

  it("refuses paid providers unless the user explicitly confirms the paid request", async () => {
    process.env.ARK_API_KEY = "from-env";
    const tempDir = await mkdtemp(join(tmpdir(), "haitu-cli-paid-confirm-"));
    tempDirs.push(tempDir);
    const productPath = join(tempDir, "product.json");
    await writeFile(
      productPath,
      JSON.stringify({
        sku: "TK-001",
        title_ja: "折りたたみ収納ボックス",
        category: "収納用品",
        materials: ["PP"],
        dimensions: "36x25x19cm",
        verified_selling_points: ["折りたたみ可能"],
        usage_scenes: ["キッチン"],
        forbidden_claims: ["防水未確認"],
        reference_images: ["main.jpg"]
      }),
      "utf8"
    );
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "should-not-call" })) as unknown as typeof fetch;

    await expect(
      runGenerateCli(
        [
          "--product",
          productPath,
          "--versions",
          "1",
          "--outDir",
          join(tempDir, "outputs"),
          "--provider",
          "seedance"
        ],
        {
          cwd: tempDir,
          fetchImpl
        }
      )
    ).rejects.toThrow(/--confirmPaid true/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses the seedance provider when no API key is configured", async () => {
    delete process.env.ARK_API_KEY;
    delete process.env.SEEDANCE_API_KEY;
    const tempDir = await mkdtemp(join(tmpdir(), "haitu-cli-seedance-"));
    tempDirs.push(tempDir);
    const productPath = join(tempDir, "product.json");
    await writeFile(
      productPath,
      JSON.stringify({
        sku: "TK-001",
        title_ja: "折りたたみ収納ボックス",
        category: "収納用品",
        materials: ["PP"],
        dimensions: "36x25x19cm",
        verified_selling_points: ["折りたたみ可能"],
        usage_scenes: ["キッチン"],
        forbidden_claims: ["防水未確認"],
        reference_images: ["main.jpg"]
      }),
      "utf8"
    );

    await expect(
      runGenerateCli([
        "--product",
        productPath,
        "--versions",
        "1",
        "--outDir",
        join(tempDir, "outputs"),
        "--provider",
        "seedance",
        "--confirmPaid",
        "true"
      ], {
        cwd: tempDir
      })
    ).rejects.toThrow(/SEEDANCE_API_KEY|ARK_API_KEY/);
  });

  it("loads provider configuration from a local .env file", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "haitu-cli-env-"));
    tempDirs.push(tempDir);
    const productPath = join(tempDir, "product.json");
    const outDir = join(tempDir, "outputs");
    await writeFile(join(tempDir, ".env"), "ARK_API_KEY=from-env-file\n", "utf8");
    await writeFile(join(tempDir, "main.jpg"), Buffer.from("fake jpg bytes"));
    await writeFile(
      productPath,
      JSON.stringify({
        sku: "TK-001",
        title_ja: "折りたたみ収納ボックス",
        category: "収納用品",
        materials: ["PP"],
        dimensions: "36x25x19cm",
        verified_selling_points: ["折りたたみ可能"],
        usage_scenes: ["キッチン"],
        forbidden_claims: ["防水未確認"],
        reference_images: ["main.jpg"]
      }),
      "utf8"
    );
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith("/api/v3/contents/generations/tasks")) {
        return jsonResponse({ id: "task-1", status: "queued" });
      }
      if (value.endsWith("/api/v3/contents/generations/tasks/task-1")) {
        return jsonResponse({
          id: "task-1",
          status: "succeeded",
          output: { video_url: "https://cdn.example.com/video.mp4" }
        });
      }
      if (value === "https://cdn.example.com/video.mp4") {
        return new Response(Buffer.from("mp4"), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${value}`);
    }) as unknown as typeof fetch;

    const summary = await runGenerateCli(
      [
        "--product",
        productPath,
        "--versions",
        "1",
        "--outDir",
        outDir,
        "--provider",
        "seedance",
        "--confirmPaid",
        "true"
      ],
      {
        cwd: tempDir,
        fetchImpl
      }
    );

    expect(summary.generated).toBe(1);
    expect(summary.totalCost.currency).toBe("CNY");
    await expect(readFile(join(outDir, "summary.json"), "utf8")).resolves.toContain(
      "\"currency\": \"CNY\""
    );
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("accepts the canonical Volcengine Seedance provider name", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "haitu-cli-canonical-provider-"));
    tempDirs.push(tempDir);
    const productPath = join(tempDir, "product.json");
    const outDir = join(tempDir, "outputs");
    await writeFile(join(tempDir, ".env"), "ARK_API_KEY=from-env-file\n", "utf8");
    await writeFile(join(tempDir, "main.jpg"), Buffer.from("fake jpg bytes"));
    await writeFile(
      productPath,
      JSON.stringify({
        sku: "TK-001",
        title_ja: "折りたたみ収納ボックス",
        category: "収納用品",
        materials: ["PP"],
        dimensions: "36x25x19cm",
        verified_selling_points: ["折りたたみ可能"],
        usage_scenes: ["キッチン"],
        forbidden_claims: ["防水未確認"],
        reference_images: ["main.jpg"]
      }),
      "utf8"
    );
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.endsWith("/api/v3/contents/generations/tasks")) {
        return jsonResponse({ id: "task-1", status: "queued" });
      }
      if (value.endsWith("/api/v3/contents/generations/tasks/task-1")) {
        return jsonResponse({
          id: "task-1",
          status: "succeeded",
          content: { video_url: "https://cdn.example.com/video.mp4" }
        });
      }
      if (value === "https://cdn.example.com/video.mp4") {
        return new Response(Buffer.from("mp4"), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${value}`);
    }) as unknown as typeof fetch;

    const summary = await runGenerateCli(
      [
        "--product",
        productPath,
        "--versions",
        "1",
        "--outDir",
        outDir,
        "--provider",
        "volcengine-seedance",
        "--confirmPaid",
        "true"
      ],
      {
        cwd: tempDir,
        fetchImpl
      }
    );

    expect(summary.generated).toBe(1);
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("prints a provider-neutral completion message", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "haitu-cli-main-"));
    tempDirs.push(tempDir);
    const productPath = join(tempDir, "product.json");
    await writeFile(
      productPath,
      JSON.stringify({
        sku: "TK-001",
        title_ja: "折りたたみ収納ボックス",
        category: "収納用品",
        materials: ["PP"],
        dimensions: "36x25x19cm",
        verified_selling_points: ["折りたたみ可能"],
        usage_scenes: ["キッチン"],
        forbidden_claims: ["防水未確認"],
        reference_images: ["main.jpg"]
      }),
      "utf8"
    );
    const { spawnSync } = await import("node:child_process");

    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/cli/generate.ts",
        "--product",
        productPath,
        "--versions",
        "1",
        "--outDir",
        join(tempDir, "outputs"),
        "--provider",
        "mock"
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8"
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Generated 1 video job(s) for TK-001.");
    expect(result.stdout).not.toContain("mock video job");
  });
});

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
