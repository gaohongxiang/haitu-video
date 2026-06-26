import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { parseProductFacts } from "../core/productFacts.js";

export async function findProductFileBySku(fixturesDir: string, sku: string): Promise<string> {
  const files = await listProductFiles(fixturesDir);
  for (const file of files) {
    const product = parseProductFacts(JSON.parse(await readFile(file, "utf8")));
    if (product.sku === sku) {
      return file;
    }
  }
  throw new Error(`Product not found: ${sku}`);
}

export async function listProductFiles(productsDir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(productsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(productsDir, entry.name, "product.json"));
}
