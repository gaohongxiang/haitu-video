import { readFile } from "node:fs/promises";

import {
  parseProductImportFile,
  selectedFileImportRows,
  type ProductFileImportRow
} from "../core/productFileImport.js";
import { parseProductFacts } from "../core/productFacts.js";
import type { DatabaseHandle } from "./db/client.js";
import { listProductFiles } from "./productFileStore.js";
import { saveProductFactPackage } from "./productService.js";

export interface ImportProductFilePreviewRequest {
  fileName?: string;
  mimeType?: string;
  base64?: string;
}

export interface ImportProductFileCommitRequest {
  rows?: ProductFileImportRow[];
  rowIds?: string[];
}

type SavedProduct = Awaited<ReturnType<typeof saveProductFactPackage>>;

export async function buildProductFileImportPreview(input: {
  fixturesDir: string;
  input: ImportProductFilePreviewRequest;
}) {
  const fileName = String(input.input.fileName ?? "").trim();
  const base64 = String(input.input.base64 ?? "").trim();
  if (!fileName || !base64) {
    throw new Error("Product file import requires fileName and base64.");
  }
  const existingSkus = await existingProductSkus(input.fixturesDir);
  return await parseProductImportFile({
    fileName,
    mimeType: input.input.mimeType,
    bytes: Buffer.from(base64, "base64"),
    existingSkus
  });
}

export async function commitProductFileImportRows(input: {
  fixturesDir: string;
  rootDir: string;
  workspaceId?: string;
  databaseHandle?: DatabaseHandle;
  fetchImpl?: typeof fetch;
  input: ImportProductFileCommitRequest;
}): Promise<{
  summary: {
    requested: number;
    imported: number;
    failed: number;
  };
  results: Array<{
    rowId: string;
    rowNumber: number;
    status: "imported" | "failed";
    product?: SavedProduct;
    error?: string;
  }>;
}> {
  const rows = Array.isArray(input.input.rows) ? input.input.rows : [];
  const rowIds = Array.isArray(input.input.rowIds) ? input.input.rowIds.map((rowId) => String(rowId)) : [];
  if (rows.length === 0 || rowIds.length === 0) {
    throw new Error("Product file commit requires rows and rowIds.");
  }
  const selectedRows = selectedFileImportRows(rows, rowIds);
  const results: Array<{
    rowId: string;
    rowNumber: number;
    status: "imported" | "failed";
    product?: SavedProduct;
    error?: string;
  }> = [];
  for (const row of selectedRows) {
    if (!row.product) {
      results.push({
        rowId: row.rowId,
        rowNumber: row.rowNumber,
        status: "failed",
        error: "Selected row does not include parsed product facts."
      });
      continue;
    }
    try {
      const product = await saveProductFactPackage({
        fixturesDir: input.fixturesDir,
        rootDir: input.rootDir,
        workspaceId: input.workspaceId,
        databaseHandle: input.databaseHandle,
        fetchImpl: input.fetchImpl,
        input: row.product
      });
      results.push({
        rowId: row.rowId,
        rowNumber: row.rowNumber,
        status: "imported",
        product
      });
    } catch (error) {
      results.push({
        rowId: row.rowId,
        rowNumber: row.rowNumber,
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return {
    summary: {
      requested: rowIds.length,
      imported: results.filter((result) => result.status === "imported").length,
      failed: results.filter((result) => result.status === "failed").length
    },
    results
  };
}

async function existingProductSkus(fixturesDir: string): Promise<string[]> {
  const files = await listProductFiles(fixturesDir);
  const skus: string[] = [];
  for (const file of files) {
    try {
      const product = parseProductFacts(JSON.parse(await readFile(file, "utf8")));
      skus.push(product.sku);
    } catch {
      // Ignore malformed legacy product files while previewing imports.
    }
  }
  return skus;
}
