import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { parseProductFacts } from "../core/productFacts.js";
import type { ScriptTemplate } from "../core/scriptGenerator.js";
import { isScriptTemplate } from "../core/templateCatalog.js";
import { DEFAULT_WORKSPACE_ID } from "./storagePaths.js";
import type { DatabaseHandle } from "./db/client.js";
import { findProductFileBySku } from "./productFileStore.js";
import {
  productFileBySkuFromDatabase,
  productIdBySkuFromDatabase
} from "./productIndexStore.js";

export interface StoryboardHistoryRequest {
  style?: unknown;
  duration?: unknown;
  script?: unknown;
}

export interface StoryboardRecord {
  id: string;
  createdAt: string;
  style: ScriptTemplate;
  duration: number;
  script: string;
}

export async function listProductStoryboards(input: {
  fixturesDir: string;
  databaseHandle?: DatabaseHandle;
  workspaceId?: string;
  sku: string;
}): Promise<StoryboardRecord[]> {
  if (input.databaseHandle) {
    return listProductStoryboardsFromDatabase(
      input.databaseHandle,
      input.workspaceId ?? DEFAULT_WORKSPACE_ID,
      input.sku
    );
  }
  const productFilePath = await findProductFileBySku(input.fixturesDir, input.sku);
  return readProductStoryboards(productFilePath);
}

export async function createProductStoryboard(input: {
  fixturesDir: string;
  databaseHandle?: DatabaseHandle;
  workspaceId?: string;
  sku: string;
  input: StoryboardHistoryRequest;
}): Promise<StoryboardRecord> {
  const productFilePath = await findProductFileBySku(input.fixturesDir, input.sku);
  const storyboards = await readProductStoryboards(productFilePath);
  const record: StoryboardRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    style: normalizeStoryboardStyle(input.input.style),
    duration: clampInteger(Number(input.input.duration ?? 10), 4, 60),
    script: normalizeStoryboardScript(input.input.script)
  };
  await writeProductStoryboards(productFilePath, [record, ...storyboards]);
  if (input.databaseHandle) {
    upsertStoryboardIndex(input.databaseHandle, input.workspaceId ?? DEFAULT_WORKSPACE_ID, input.sku, record);
  }
  return record;
}

export async function deleteProductStoryboard(input: {
  fixturesDir: string;
  databaseHandle?: DatabaseHandle;
  workspaceId?: string;
  sku: string;
  id: string;
}): Promise<{ deleted: true; id: string }> {
  if (input.databaseHandle) {
    const productFilePath = productFileBySkuFromDatabase(input.databaseHandle, input.workspaceId ?? DEFAULT_WORKSPACE_ID, input.sku);
    if (!productFilePath) {
      throw new Error(`Product not found: ${input.sku}`);
    }
    input.databaseHandle.sqlite.prepare(`
      DELETE FROM storyboards
      WHERE id = ? AND workspace_id = ? AND product_id = (
        SELECT id FROM products WHERE workspace_id = ? AND sku = ?
      )
    `).run(input.id, input.workspaceId ?? DEFAULT_WORKSPACE_ID, input.workspaceId ?? DEFAULT_WORKSPACE_ID, input.sku);
    try {
      const storyboards = await readProductStoryboards(productFilePath);
      await writeProductStoryboards(
        productFilePath,
        storyboards.filter((record) => record.id !== input.id)
      );
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
    }
    return {
      deleted: true,
      id: input.id
    };
  }
  const productFilePath = await findProductFileBySku(input.fixturesDir, input.sku);
  const storyboards = await readProductStoryboards(productFilePath);
  await writeProductStoryboards(
    productFilePath,
    storyboards.filter((record) => record.id !== input.id)
  );
  return {
    deleted: true,
    id: input.id
  };
}

function listProductStoryboardsFromDatabase(
  handle: DatabaseHandle,
  workspaceId: string,
  sku: string
): StoryboardRecord[] {
  const productId = productIdBySkuFromDatabase(handle, workspaceId, sku);
  if (!productId) {
    throw new Error(`Product not found: ${sku}`);
  }
  const rows = handle.sqlite.prepare(`
    SELECT id, created_at, style, duration_seconds, script
    FROM storyboards
    WHERE workspace_id = ? AND product_id = ?
    ORDER BY created_at DESC
  `).all(workspaceId, productId) as Array<{
    id: string;
    created_at: string;
    style: ScriptTemplate;
    duration_seconds: number;
    script: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    style: row.style,
    duration: row.duration_seconds,
    script: row.script
  }));
}

function upsertStoryboardIndex(
  handle: DatabaseHandle,
  workspaceId: string,
  sku: string,
  record: StoryboardRecord
): void {
  const productId = productIdBySkuFromDatabase(handle, workspaceId, sku);
  if (!productId) {
    throw new Error(`Product not found: ${sku}`);
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
    id: record.id,
    workspaceId,
    productId,
    style: record.style,
    durationSeconds: record.duration,
    script: record.script,
    createdAt: record.createdAt
  });
}

async function readProductStoryboards(productFilePath: string): Promise<StoryboardRecord[]> {
  try {
    const parsed = JSON.parse(await readFile(join(dirname(productFilePath), "storyboards.json"), "utf8")) as {
      storyboards?: unknown;
    };
    if (!Array.isArray(parsed.storyboards)) {
      return [];
    }
    return parsed.storyboards.flatMap((record) => normalizeStoryboardRecord(record));
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw error;
  }
}

async function writeProductStoryboards(productFilePath: string, storyboards: StoryboardRecord[]): Promise<void> {
  const product = parseProductFacts(JSON.parse(await readFile(productFilePath, "utf8")));
  const storyboardsFile = join(dirname(productFilePath), "storyboards.json");
  await mkdir(dirname(storyboardsFile), { recursive: true });
  await writeFile(storyboardsFile, JSON.stringify({
    workspaceId: DEFAULT_WORKSPACE_ID,
    productSku: product.sku,
    storyboards
  }, null, 2), "utf8");
}

function normalizeStoryboardRecord(value: unknown): StoryboardRecord[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  const raw = value as Partial<StoryboardRecord>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.createdAt !== "string" ||
    typeof raw.script !== "string" ||
    !isScriptTemplate(raw.style)
  ) {
    return [];
  }
  return [{
    id: raw.id,
    createdAt: raw.createdAt,
    style: raw.style,
    duration: clampInteger(Number(raw.duration ?? 10), 4, 60),
    script: raw.script
  }];
}

function normalizeStoryboardStyle(value: unknown): ScriptTemplate {
  return isScriptTemplate(value) ? value : "scene";
}

function normalizeStoryboardScript(value: unknown): string {
  const script = typeof value === "string" ? value.trim() : "";
  if (!script) {
    throw new Error("Storyboard history requires a script.");
  }
  return script;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isInteger(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
