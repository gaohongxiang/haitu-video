import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const productRoutesPath = "src/server/productRoutes.ts";
const productImportRoutesPath = "src/server/productImportRoutes.ts";
const productImportServicePath = "src/server/productImportService.ts";
const productFileImportServicePath = "src/server/productFileImportService.ts";

describe("product import service source boundaries", () => {
  it("keeps product import orchestration out of the HTTP server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const productRoutesSource = await readFile(productRoutesPath, "utf8");
    const productImportRoutesSource = await readFile(productImportRoutesPath, "utf8");

    await expect(access(productImportServicePath)).resolves.toBeUndefined();
    await expect(access(productFileImportServicePath)).resolves.toBeUndefined();
    expect(productRoutesSource).toContain('from "./productImportRoutes.js"');
    expect(productRoutesSource).not.toContain('from "./productImportService.js"');
    expect(productImportRoutesSource).toContain('from "./productImportService.js"');
    expect(consoleServerSource).not.toContain('from "./productImportService.js"');
    expect(consoleServerSource).not.toContain("function buildImportedProductPreview(");
    expect(consoleServerSource).not.toContain("async function buildAiImportedProductPreview(");
    expect(consoleServerSource).not.toContain("async function importProductFromText(");
    expect(consoleServerSource).not.toContain("async function buildProductFileImportPreview(");
    expect(consoleServerSource).not.toContain("async function commitProductFileImportRows(");
    expect(consoleServerSource).not.toContain("async function importProductsBatchFromText(");
    expect(consoleServerSource).not.toContain("function splitImportedProductBlocks(");
  });

  it("centralizes text, AI, batch, and file product import workflows in the service module", async () => {
    const serviceSource = await readFile(productImportServicePath, "utf8");
    const productImportRoutesSource = await readFile(productImportRoutesPath, "utf8");

    expect(serviceSource).toContain("export function buildImportedProductPreview(");
    expect(serviceSource).toContain("export async function buildAiImportedProductPreview(");
    expect(serviceSource).toContain("export async function importProductFromText(");
    expect(serviceSource).toContain("export async function importProductsBatchFromText(");
    expect(serviceSource).toContain('from "./productFileImportService.js"');
    expect(serviceSource).not.toContain("export async function buildProductFileImportPreview(");
    expect(serviceSource).not.toContain("export async function commitProductFileImportRows(");
    expect(serviceSource).not.toContain("async function existingProductSkus(");
    expect(serviceSource).not.toContain("selectedFileImportRows(");
    expect(serviceSource).toContain("runMeteredAiAction");
    expect(serviceSource).toContain("saveProductFactPackage");
    expect(serviceSource).toContain("modelPricingCatalog?: readonly ModelPricingEntry[]");
    expect(serviceSource).toContain("modelPricingCatalogVersion?: string");
    expect(serviceSource).toContain("modelPricingCatalog: input.modelPricingCatalog");
    expect(serviceSource).toContain("modelPricingCatalogVersion: input.modelPricingCatalogVersion");
    expect(productImportRoutesSource).toContain("modelPricingCatalog: requestContext.modelPricingCatalog");
    expect(productImportRoutesSource).toContain("modelPricingCatalogVersion: requestContext.modelPricingCatalogVersion");
  });

  it("centralizes product file import preview, existing SKU lookup, and commit workflows", async () => {
    const fileImportSource = await readFile(productFileImportServicePath, "utf8");

    expect(fileImportSource).toContain("export async function buildProductFileImportPreview(");
    expect(fileImportSource).toContain("export async function commitProductFileImportRows(");
    expect(fileImportSource).toContain("async function existingProductSkus(");
    expect(fileImportSource).toContain("parseProductImportFile(");
    expect(fileImportSource).toContain("selectedFileImportRows(");
    expect(fileImportSource).toContain("saveProductFactPackage");
  });
});
