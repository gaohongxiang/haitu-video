import { randomUUID } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";

import { parseProductFacts } from "../../core/productFacts.js";
import type { DatabaseHandle } from "./client.js";
import { getWorkspacePaths } from "../storagePaths.js";

export interface ImportFileWorkspaceResult {
  userId: string;
  workspaceId: string;
  products: number;
  productAssets: number;
  storyboards: number;
  videoJobs: number;
  videoAssets: number;
}

export async function importFileWorkspace(input: {
  handle: DatabaseHandle;
  dataDir: string;
  sourceWorkspaceId?: string;
  adminEmail: string;
}): Promise<ImportFileWorkspaceResult> {
  const workspaceId = input.sourceWorkspaceId ?? "default";
  const workspace = getWorkspacePaths(input.dataDir, workspaceId);
  const now = new Date().toISOString();
  const userId = await ensureAdminUser(input.handle, {
    email: input.adminEmail,
    now
  });
  ensureWorkspace(input.handle, {
    workspaceId,
    userId,
    now
  });

  let products = 0;
  let productAssets = 0;
  let storyboards = 0;
  for (const productFile of await listProductJsonFiles(workspace.productsDir)) {
    const imported = await importProduct(input.handle, {
      workspaceId,
      productFile,
      now
    });
    products += imported.product ? 1 : 0;
    productAssets += imported.productAssets;
    storyboards += imported.storyboards;
  }

  let videoJobs = 0;
  let videoAssets = 0;
  for (const jobDir of await listDirectories(workspace.jobsDir)) {
    const imported = await importVideoJob(input.handle, {
      workspaceId,
      jobDir,
      now
    });
    videoJobs += imported.videoJob ? 1 : 0;
    videoAssets += imported.videoAssets;
  }

  return {
    userId,
    workspaceId,
    products,
    productAssets,
    storyboards,
    videoJobs,
    videoAssets
  };
}

async function ensureAdminUser(
  handle: DatabaseHandle,
  input: {
    email: string;
    now: string;
  }
): Promise<string> {
  const existing = handle.sqlite
    .prepare("SELECT id FROM users WHERE lower(email) = lower(?)")
    .get(input.email) as { id: string } | undefined;
  if (existing) {
    return existing.id;
  }
  const userId = randomUUID();
  handle.sqlite.prepare(`
    INSERT INTO users (id, email, display_name, role, created_at, updated_at)
    VALUES (@id, @email, 'Admin', 'admin', @now, @now)
  `).run({
    id: userId,
    email: input.email.toLowerCase(),
    now: input.now
  });
  return userId;
}

function ensureWorkspace(
  handle: DatabaseHandle,
  input: {
    workspaceId: string;
    userId: string;
    now: string;
  }
): void {
  handle.sqlite.prepare(`
    INSERT INTO workspaces (id, name, owner_user_id, created_at, updated_at)
    VALUES (@workspaceId, 'Default Workspace', @userId, @now, @now)
    ON CONFLICT(id) DO UPDATE SET owner_user_id = COALESCE(workspaces.owner_user_id, excluded.owner_user_id)
  `).run(input);
  handle.sqlite.prepare(`
    INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
    VALUES (@workspaceId, @userId, 'owner', @now)
    ON CONFLICT(workspace_id, user_id) DO NOTHING
  `).run(input);
}

async function importProduct(
  handle: DatabaseHandle,
  input: {
    workspaceId: string;
    productFile: string;
    now: string;
  }
): Promise<{ product: boolean; productAssets: number; storyboards: number }> {
  let product;
  try {
    product = parseProductFacts(JSON.parse(await readFile(input.productFile, "utf8")));
  } catch {
    return {
      product: false,
      productAssets: 0,
      storyboards: 0
    };
  }
  const productId = randomUUID();
  handle.sqlite.prepare(`
    INSERT INTO products (id, workspace_id, sku, title, product_json_path, created_at, updated_at)
    VALUES (@id, @workspaceId, @sku, @title, @productJsonPath, @now, @now)
    ON CONFLICT(workspace_id, sku) DO UPDATE SET
      title = excluded.title,
      product_json_path = excluded.product_json_path,
      updated_at = excluded.updated_at
  `).run({
    id: productId,
    workspaceId: input.workspaceId,
    sku: product.sku,
    title: product.title_ja,
    productJsonPath: input.productFile,
    now: input.now
  });
  const actualProductId = productIdForSku(handle, input.workspaceId, product.sku);
  let productAssets = 0;
  for (const reference of product.reference_images) {
    const storagePath = joinProductRelative(input.productFile, reference);
    if (!storagePath || !await isRegularFile(storagePath)) {
      continue;
    }
    upsertProductAsset(handle, {
      workspaceId: input.workspaceId,
      productId: actualProductId,
      storagePath,
      now: input.now
    });
    productAssets += 1;
  }
  const storyboards = await importStoryboards(handle, {
    workspaceId: input.workspaceId,
    productId: actualProductId,
    productFile: input.productFile
  });
  return {
    product: true,
    productAssets,
    storyboards
  };
}

async function importStoryboards(
  handle: DatabaseHandle,
  input: {
    workspaceId: string;
    productId: string;
    productFile: string;
  }
): Promise<number> {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(join(input.productFile, "..", "storyboards.json"), "utf8")) as { storyboards?: unknown };
  } catch {
    return 0;
  }
  if (!Array.isArray(parsed.storyboards)) {
    return 0;
  }
  let count = 0;
  for (const item of parsed.storyboards) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" && record.id.trim() ? record.id : randomUUID();
    const script = typeof record.script === "string" ? record.script : "";
    if (!script) {
      continue;
    }
    handle.sqlite.prepare(`
      INSERT INTO storyboards (id, workspace_id, product_id, style, duration_seconds, script, created_at)
      VALUES (@id, @workspaceId, @productId, @style, @durationSeconds, @script, @createdAt)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        product_id = excluded.product_id,
        style = excluded.style,
        duration_seconds = excluded.duration_seconds,
        script = excluded.script,
        created_at = excluded.created_at
    `).run({
      id,
      workspaceId: input.workspaceId,
      productId: input.productId,
      style: typeof record.style === "string" ? record.style : "scene",
      durationSeconds: Number.isFinite(Number(record.duration)) ? Number(record.duration) : 10,
      script,
      createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString()
    });
    count += 1;
  }
  return count;
}

async function importVideoJob(
  handle: DatabaseHandle,
  input: {
    workspaceId: string;
    jobDir: string;
    now: string;
  }
): Promise<{ videoJob: boolean; videoAssets: number }> {
  const jobFile = join(input.jobDir, "job.json");
  let job;
  try {
    job = JSON.parse(await readFile(jobFile, "utf8")) as Record<string, unknown>;
  } catch {
    return { videoJob: false, videoAssets: 0 };
  }
  const jobId = typeof job.id === "string" && job.id.trim() ? job.id : basename(input.jobDir);
  const productSku = typeof job.productSku === "string" ? job.productSku : undefined;
  const productId = productSku ? findProductIdBySku(handle, input.workspaceId, productSku) : undefined;
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
      completed_at,
      expires_at
    ) VALUES (
      @id,
      @workspaceId,
      @productId,
      @status,
      @model,
      @language,
      @durationSeconds,
      @outputCount,
      @jobDir,
      @createdAt,
      @completedAt,
      @expiresAt
    )
    ON CONFLICT(id) DO UPDATE SET
      workspace_id = excluded.workspace_id,
      product_id = excluded.product_id,
      status = excluded.status,
      model = excluded.model,
      language = excluded.language,
      duration_seconds = excluded.duration_seconds,
      output_count = excluded.output_count,
      job_dir = excluded.job_dir,
      completed_at = excluded.completed_at,
      expires_at = excluded.expires_at
  `).run({
    id: jobId,
    workspaceId: input.workspaceId,
    productId: productId ?? null,
    status: textValue(job.status) ?? "unknown",
    model: textValue(job.providerModel) ?? textValue(job.provider) ?? null,
    language: textValue(job.finalLanguage) ?? null,
    durationSeconds: numberValue(job.durationSeconds),
    outputCount: 1,
    jobDir: input.jobDir,
    createdAt: textValue(job.createdAt) ?? input.now,
    completedAt: textValue(job.completedAt) ?? null,
    expiresAt: textValue(job.expiresAt) ?? null
  });
  const assets = await importVideoAssets(handle, {
    workspaceId: input.workspaceId,
    jobId,
    jobDir: input.jobDir,
    expiresAt: textValue(job.expiresAt)
  });
  return {
    videoJob: true,
    videoAssets: assets
  };
}

async function importVideoAssets(
  handle: DatabaseHandle,
  input: {
    workspaceId: string;
    jobId: string;
    jobDir: string;
    expiresAt?: string;
  }
): Promise<number> {
  const assets = [
    ...(await listFiles(join(input.jobDir, "raw"))),
    ...(await listFiles(join(input.jobDir, "final")))
  ].filter((path) => /\.(mp4|mov|m4v|webm)$/i.test(path));
  let count = 0;
  for (const storagePath of assets) {
    const sizeBytes = await fileSize(storagePath);
    handle.sqlite.prepare(`
      INSERT INTO video_assets (
        id,
        workspace_id,
        job_id,
        status,
        storage_provider,
        storage_path,
        size_bytes,
        expires_at
      ) VALUES (
        @id,
        @workspaceId,
        @jobId,
        'available',
        'file',
        @storagePath,
        @sizeBytes,
        @expiresAt
      )
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        job_id = excluded.job_id,
        status = excluded.status,
        storage_path = excluded.storage_path,
        size_bytes = excluded.size_bytes,
        expires_at = excluded.expires_at
    `).run({
      id: `${input.jobId}:${storagePath}`,
      workspaceId: input.workspaceId,
      jobId: input.jobId,
      storagePath,
      sizeBytes,
      expiresAt: input.expiresAt ?? null
    });
    count += 1;
  }
  return count;
}

function productIdForSku(handle: DatabaseHandle, workspaceId: string, sku: string): string {
  const row = handle.sqlite
    .prepare("SELECT id FROM products WHERE workspace_id = ? AND sku = ?")
    .get(workspaceId, sku) as { id: string } | undefined;
  if (!row) {
    throw new Error(`Imported product missing after upsert: ${sku}`);
  }
  return row.id;
}

function findProductIdBySku(handle: DatabaseHandle, workspaceId: string, sku: string): string | undefined {
  const row = handle.sqlite
    .prepare("SELECT id FROM products WHERE workspace_id = ? AND sku = ?")
    .get(workspaceId, sku) as { id: string } | undefined;
  return row?.id;
}

function upsertProductAsset(
  handle: DatabaseHandle,
  input: {
    workspaceId: string;
    productId: string;
    storagePath: string;
    now: string;
  }
): void {
  handle.sqlite.prepare(`
    INSERT INTO product_assets (id, workspace_id, product_id, kind, storage_provider, storage_path, created_at)
    VALUES (@id, @workspaceId, @productId, 'reference', 'file', @storagePath, @now)
    ON CONFLICT(id) DO UPDATE SET
      workspace_id = excluded.workspace_id,
      product_id = excluded.product_id,
      storage_path = excluded.storage_path
  `).run({
    id: `${input.productId}:${input.storagePath}`,
    workspaceId: input.workspaceId,
    productId: input.productId,
    storagePath: input.storagePath,
    now: input.now
  });
}

async function listProductJsonFiles(productsDir: string): Promise<string[]> {
  const dirs = await listDirectories(productsDir);
  return dirs.map((dir) => join(dir, "product.json"));
}

async function listDirectories(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => join(root, entry.name)).sort();
  } catch {
    return [];
  }
}

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  }
  await walk(root);
  return files.sort();
}

function joinProductRelative(productFile: string, reference: string): string | undefined {
  if (/^https?:\/\//i.test(reference)) {
    return undefined;
  }
  return join(productFile, "..", reference);
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function fileSize(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
