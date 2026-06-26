import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const productRoutesPath = "src/server/productRoutes.ts";
const productServicePath = "src/server/productService.ts";

describe("product service source boundaries", () => {
  it("keeps base product CRUD orchestration behind the route layer", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const productRoutesSource = await readFile(productRoutesPath, "utf8");

    await expect(access(productServicePath)).resolves.toBeUndefined();
    expect(consoleServerSource).not.toContain('from "./productService.js"');
    expect(productRoutesSource).toContain('from "./productService.js"');
    expect(consoleServerSource).not.toContain("async function listProducts(");
    expect(consoleServerSource).not.toContain("async function getProductBySku(");
    expect(consoleServerSource).not.toContain("async function saveProductFactPackage(");
    expect(consoleServerSource).not.toContain("async function deleteProductBySku(");
  });

  it("keeps product detail, save, delete, and compatible list export in the service module", async () => {
    const serviceSource = await readFile(productServicePath, "utf8");

    expect(serviceSource).toContain('export { listProducts } from "./productListService.js"');
    expect(serviceSource).toContain("export async function getProductBySku(");
    expect(serviceSource).toContain("export async function saveProductFactPackage(");
    expect(serviceSource).toContain("export async function deleteProductBySku(");
    expect(serviceSource).toContain('from "./productFileStore.js"');
    expect(serviceSource).toContain('from "./productIndexStore.js"');
    expect(serviceSource).not.toContain("export async function findProductFileBySku(");
    expect(serviceSource).not.toContain("export async function listProductFiles(");
    expect(serviceSource).not.toContain("export function upsertProductIndex(");
    expect(serviceSource).not.toContain("export function productFileBySkuFromDatabase(");
    expect(serviceSource).not.toContain("export function productIdBySkuFromDatabase(");
    expect(serviceSource).not.toContain("INSERT INTO products");
    expect(serviceSource).not.toContain("SELECT product_json_path");
    expect(serviceSource).not.toContain("DELETE FROM products");
    expect(serviceSource).toContain("buildPaidGenerationReadiness");
  });
});
