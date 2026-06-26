import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const productFileStorePath = "src/server/productFileStore.ts";
const productServicePath = "src/server/productService.ts";

describe("product file store source boundaries", () => {
  it("centralizes product JSON file discovery helpers outside the product service", async () => {
    const storeSource = await readFile(productFileStorePath, "utf8");
    const serviceSource = await readFile(productServicePath, "utf8");

    await expect(access(productFileStorePath)).resolves.toBeUndefined();
    expect(storeSource).toContain("export async function findProductFileBySku(");
    expect(storeSource).toContain("export async function listProductFiles(");
    expect(serviceSource).toContain('from "./productFileStore.js"');
    expect(serviceSource).not.toContain("export async function findProductFileBySku(");
    expect(serviceSource).not.toContain("export async function listProductFiles(");
  });
});
