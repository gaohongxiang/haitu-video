import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const productIndexStorePath = "src/server/productIndexStore.ts";
const productStoryboardServicePath = "src/server/productStoryboardService.ts";

describe("product index store source boundaries", () => {
  it("centralizes product index persistence helpers and products table SQL", async () => {
    const storeSource = await readFile(productIndexStorePath, "utf8");

    await expect(access(productIndexStorePath)).resolves.toBeUndefined();
    expect(storeSource).toContain("export function upsertProductIndex(");
    expect(storeSource).toContain("export function productFileBySkuFromDatabase(");
    expect(storeSource).toContain("export function productIdBySkuFromDatabase(");
    expect(storeSource).toContain("export function listProductFilesFromDatabase(");
    expect(storeSource).toContain("export function deleteProductIndexBySku(");
    expect(storeSource).toContain("export function productIndexFallbackByPath(");
    expect(storeSource).toContain("INSERT INTO products");
    expect(storeSource).toContain("SELECT product_json_path");
    expect(storeSource).toContain("DELETE FROM products");
  });

  it("keeps storyboard code depending on product index store instead of product service internals", async () => {
    const storyboardSource = await readFile(productStoryboardServicePath, "utf8");

    expect(storyboardSource).toContain('from "./productIndexStore.js"');
    expect(storyboardSource).not.toContain('from "./productService.js";');
  });
});
