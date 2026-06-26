import { randomUUID } from "node:crypto";

import type { DatabaseHandle } from "./db/client.js";

export interface ProductIndexFallback {
  sku: string;
  title: string | null;
}

export function upsertProductIndex(
  handle: DatabaseHandle,
  input: {
    workspaceId: string;
    sku: string;
    title: string;
    productJsonPath: string;
  }
): void {
  const now = new Date().toISOString();
  handle.sqlite.prepare(`
    INSERT INTO products (id, workspace_id, sku, title, product_json_path, created_at, updated_at)
    VALUES (@id, @workspaceId, @sku, @title, @productJsonPath, @now, @now)
    ON CONFLICT(workspace_id, sku) DO UPDATE SET
      title = excluded.title,
      product_json_path = excluded.product_json_path,
      updated_at = excluded.updated_at
  `).run({
    id: randomUUID(),
    workspaceId: input.workspaceId,
    sku: input.sku,
    title: input.title,
    productJsonPath: input.productJsonPath,
    now
  });
}

export function productFileBySkuFromDatabase(
  handle: DatabaseHandle,
  workspaceId: string,
  sku: string
): string | undefined {
  const row = handle.sqlite.prepare(`
    SELECT product_json_path
    FROM products
    WHERE workspace_id = ? AND sku = ?
  `).get(workspaceId, sku) as { product_json_path: string } | undefined;
  return row?.product_json_path;
}

export function productIdBySkuFromDatabase(
  handle: DatabaseHandle,
  workspaceId: string,
  sku: string
): string | undefined {
  const row = handle.sqlite.prepare(`
    SELECT id
    FROM products
    WHERE workspace_id = ? AND sku = ?
  `).get(workspaceId, sku) as { id: string } | undefined;
  return row?.id;
}

export function listProductFilesFromDatabase(handle: DatabaseHandle, workspaceId: string): string[] {
  const rows = handle.sqlite.prepare(`
    SELECT product_json_path
    FROM products
    WHERE workspace_id = ?
    ORDER BY sku ASC
  `).all(workspaceId) as Array<{ product_json_path: string }>;
  return rows.map((row) => row.product_json_path);
}

export function deleteProductIndexBySku(
  handle: DatabaseHandle,
  workspaceId: string,
  sku: string
): void {
  handle.sqlite.prepare("DELETE FROM products WHERE workspace_id = ? AND sku = ?").run(workspaceId, sku);
}

export function productIndexFallbackByPath(
  handle: DatabaseHandle,
  productFilePath: string
): ProductIndexFallback | undefined {
  return handle.sqlite.prepare(`
    SELECT sku, title
    FROM products
    WHERE product_json_path = ?
  `).get(productFilePath) as ProductIndexFallback | undefined;
}
