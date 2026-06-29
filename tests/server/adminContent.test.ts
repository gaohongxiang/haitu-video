import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildAdminContentSummary,
  listAdminContentProducts,
  listAdminContentVideoJobs
} from "../../src/server/adminContent.js";
import { closeDatabase, openDatabase, type DatabaseHandle } from "../../src/server/db/client.js";
import { ensureDefaultWorkspace, runMigrations } from "../../src/server/db/migrate.js";

const tempDirs: string[] = [];

describe("admin content", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("summarizes all workspace content for operations", async () => {
    const { handle, close } = await openTestDatabase("haitu-admin-content-summary-");
    try {
      seedContent(handle);

      const summary = buildAdminContentSummary(handle);

      expect(summary.metrics).toEqual({
        totalProducts: 2,
        totalVideoJobs: 2,
        completedVideoJobs: 1,
        failedVideoJobs: 1,
        totalVideoAssets: 2,
        totalStoryboards: 1
      });
      expect(summary.statusCounts).toEqual([
        { status: "completed", count: 1 },
        { status: "failed", count: 1 }
      ]);
      expect(summary.recentVideoJobs[0]).toEqual(expect.objectContaining({
        id: "job-b",
        workspaceName: "B 店铺",
        productSku: "SKU-B",
        status: "failed"
      }));
    } finally {
      close();
    }
  });

  it("lists products and video jobs across users with workspace filters", async () => {
    const { handle, close } = await openTestDatabase("haitu-admin-content-lists-");
    try {
      seedContent(handle);

      const products = listAdminContentProducts({ handle });
      const jobs = listAdminContentVideoJobs({ handle, workspaceId: "workspace-a" });

      expect(products.products.map((item) => item.sku)).toEqual(["SKU-B", "SKU-A"]);
      expect(products.products[0]).toEqual(expect.objectContaining({
        workspaceId: "workspace-b",
        workspaceName: "B 店铺",
        ownerEmail: "owner-b@example.com",
        videoJobCount: 1,
        assetCount: 1
      }));
      expect(jobs.videoJobs.map((item) => item.id)).toEqual(["job-a"]);
      expect(jobs.videoJobs[0]).toEqual(expect.objectContaining({
        workspaceId: "workspace-a",
        workspaceName: "A 店铺",
        productSku: "SKU-A",
        productTitle: "A 商品",
        assetCount: 1
      }));
    } finally {
      close();
    }
  });
});

async function openTestDatabase(prefix: string): Promise<{ handle: DatabaseHandle; close: () => void }> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(root);
  const handle = openDatabase({ dataDir: join(root, "data"), env: process.env });
  runMigrations(handle);
  ensureDefaultWorkspace(handle);
  return {
    handle,
    close: () => closeDatabase(handle)
  };
}

function seedContent(handle: DatabaseHandle): void {
  seedWorkspace(handle, "workspace-a", "A 店铺", "user-a", "owner-a@example.com");
  seedWorkspace(handle, "workspace-b", "B 店铺", "user-b", "owner-b@example.com");
  insertProduct(handle, "product-a", "workspace-a", "SKU-A", "A 商品", "2026-06-29T08:00:00.000Z");
  insertProduct(handle, "product-b", "workspace-b", "SKU-B", "B 商品", "2026-06-29T09:00:00.000Z");
  handle.sqlite.prepare(`
    INSERT INTO storyboards (id, workspace_id, product_id, style, duration_seconds, script, created_at)
    VALUES ('storyboard-a', 'workspace-a', 'product-a', 'scene', 10, '脚本', '2026-06-29T08:10:00.000Z')
  `).run();
  insertVideoJob(handle, {
    id: "job-a",
    workspaceId: "workspace-a",
    productId: "product-a",
    status: "completed",
    model: "doubao-seedance-2.0",
    createdAt: "2026-06-29T08:20:00.000Z",
    completedAt: "2026-06-29T08:25:00.000Z"
  });
  insertVideoJob(handle, {
    id: "job-b",
    workspaceId: "workspace-b",
    productId: "product-b",
    status: "failed",
    model: "doubao-seedance-2.0",
    createdAt: "2026-06-29T09:20:00.000Z"
  });
  insertVideoAsset(handle, "asset-a", "workspace-a", "job-a", "ready");
  insertVideoAsset(handle, "asset-b", "workspace-b", "job-b", "failed");
}

function seedWorkspace(handle: DatabaseHandle, workspaceId: string, workspaceName: string, userId: string, email: string): void {
  handle.sqlite.prepare(`
    INSERT INTO users (id, email, role, created_at, updated_at)
    VALUES (?, ?, 'user', '2026-06-29T00:00:00.000Z', '2026-06-29T00:00:00.000Z')
  `).run(userId, email);
  handle.sqlite.prepare(`
    INSERT INTO workspaces (id, name, owner_user_id, created_at, updated_at)
    VALUES (?, ?, ?, '2026-06-29T00:00:00.000Z', '2026-06-29T00:00:00.000Z')
  `).run(workspaceId, workspaceName, userId);
  handle.sqlite.prepare(`
    INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
    VALUES (?, ?, 'owner', '2026-06-29T00:00:00.000Z')
  `).run(workspaceId, userId);
}

function insertProduct(handle: DatabaseHandle, id: string, workspaceId: string, sku: string, title: string, createdAt: string): void {
  handle.sqlite.prepare(`
    INSERT INTO products (id, workspace_id, sku, title, product_json_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, workspaceId, sku, title, `/tmp/${sku}.json`, createdAt, createdAt);
}

function insertVideoJob(handle: DatabaseHandle, input: {
  id: string;
  workspaceId: string;
  productId: string;
  status: string;
  model: string;
  createdAt: string;
  completedAt?: string;
}): void {
  handle.sqlite.prepare(`
    INSERT INTO video_jobs (
      id,
      workspace_id,
      product_id,
      status,
      model,
      language,
      duration_seconds,
      output_count,
      job_dir,
      created_at,
      completed_at
    ) VALUES (
      @id,
      @workspaceId,
      @productId,
      @status,
      @model,
      'ja',
      10,
      1,
      @id,
      @createdAt,
      @completedAt
    )
  `).run({
    ...input,
    completedAt: input.completedAt ?? null
  });
}

function insertVideoAsset(handle: DatabaseHandle, id: string, workspaceId: string, jobId: string, status: string): void {
  handle.sqlite.prepare(`
    INSERT INTO video_assets (id, workspace_id, job_id, status, storage_path)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, workspaceId, jobId, status, `/tmp/${id}.mp4`);
}
