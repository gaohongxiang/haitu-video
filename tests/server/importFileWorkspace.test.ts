import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { closeDatabase, openDatabase } from "../../src/server/db/client.js";
import { importFileWorkspace } from "../../src/server/db/importFileWorkspace.js";
import { runMigrations } from "../../src/server/db/migrate.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("file workspace import", () => {
  it("registers first-stage default workspace files in SQLite without moving files", async () => {
    const dataDir = await makeTempDir();
    const productDir = join(dataDir, "workspaces", "default", "products", "TK-001");
    const jobDir = join(dataDir, "workspaces", "default", "jobs", "job-1");
    await mkdir(join(productDir, "refs"), { recursive: true });
    await mkdir(join(jobDir, "final"), { recursive: true });
    await mkdir(join(jobDir, "raw"), { recursive: true });
    const productFile = join(productDir, "product.json");
    const refFile = join(productDir, "refs", "reference-01.jpg");
    const storyboardsFile = join(productDir, "storyboards.json");
    const jobFile = join(jobDir, "job.json");
    const reportFile = join(jobDir, "make-video-report.json");
    const finalVideo = join(jobDir, "final", "wallet.mp4");
    const rawVideo = join(jobDir, "raw", "source.mp4");
    await writeFile(productFile, JSON.stringify({
      workspaceId: "default",
      sku: "TK-001",
      title_ja: "財布",
      category: "バッグ",
      materials: ["PU"],
      dimensions: "10cm",
      verified_selling_points: ["軽量"],
      usage_scenes: ["通勤"],
      forbidden_claims: ["防水未確認"],
      reference_images: ["refs/reference-01.jpg"]
    }, null, 2), "utf8");
    await writeFile(refFile, "fake image");
    await writeFile(storyboardsFile, JSON.stringify({
      productSku: "TK-001",
      storyboards: [{
        id: "storyboard-1",
        createdAt: "2026-06-15T00:00:00.000Z",
        style: "scene",
        duration: 10,
        script: "0-3s 商品を見せる"
      }]
    }, null, 2), "utf8");
    await writeFile(jobFile, JSON.stringify({
      id: "job-1",
      workspaceId: "default",
      status: "completed",
      productSku: "TK-001",
      productPath: productFile,
      provider: "mock",
      durationSeconds: 10,
      outDir: jobDir,
      createdAt: "2026-06-15T00:01:00.000Z",
      completedAt: "2026-06-15T00:02:00.000Z",
      expiresAt: "2026-06-16T00:01:00.000Z"
    }, null, 2), "utf8");
    await writeFile(reportFile, JSON.stringify({
      productSku: "TK-001",
      provider: "mock",
      status: "completed",
      durationSeconds: 10,
      final: {
        outputPath: finalVideo
      },
      raw: {
        outputPath: rawVideo
      }
    }, null, 2), "utf8");
    await writeFile(finalVideo, "final video");
    await writeFile(rawVideo, "raw video");
    const handle = openDatabase({ dataDir, env: {} });

    try {
      runMigrations(handle);
      const result = await importFileWorkspace({
        handle,
        dataDir,
        sourceWorkspaceId: "default",
        adminEmail: "admin@example.com"
      });

      expect(result).toEqual({
        userId: expect.any(String),
        workspaceId: "default",
        products: 1,
        productAssets: 1,
        storyboards: 1,
        videoJobs: 1,
        videoAssets: 2
      });
      expect(await rowCount(handle, "users")).toBe(1);
      expect(await rowCount(handle, "workspaces")).toBe(2);
      expect(await rowCount(handle, "workspace_members")).toBe(1);
      expect(await rowCount(handle, "products")).toBe(1);
      expect(await rowCount(handle, "product_assets")).toBe(1);
      expect(await rowCount(handle, "storyboards")).toBe(1);
      expect(await rowCount(handle, "video_jobs")).toBe(1);
      expect(await rowCount(handle, "video_assets")).toBe(2);
      const product = handle.sqlite
        .prepare("SELECT workspace_id, sku, title, product_json_path FROM products WHERE sku = 'TK-001'")
        .get() as { workspace_id: string; sku: string; title: string; product_json_path: string };
      expect(product).toEqual({
        workspace_id: "default",
        sku: "TK-001",
        title: "財布",
        product_json_path: productFile
      });
    } finally {
      closeDatabase(handle);
    }
  });
});

async function rowCount(handle: ReturnType<typeof openDatabase>, table: string): Promise<number> {
  const row = handle.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
  return row.count;
}

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "haitu-import-workspace-"));
  tempDirs.push(dir);
  return dir;
}
