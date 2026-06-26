import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const productRoutesPath = "src/server/productRoutes.ts";
const servicePath = "src/server/productReferenceImageService.ts";
const storePath = "src/server/productReferenceImageStore.ts";

describe("product reference image service source boundaries", () => {
  it("keeps non-AI product reference image mutations out of the HTTP server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const productRoutesSource = await readFile(productRoutesPath, "utf8");

    await expect(access(servicePath)).resolves.toBeUndefined();
    await expect(access(storePath)).resolves.toBeUndefined();
    expect(productRoutesSource).toContain('from "./productReferenceImageService.js"');
    expect(consoleServerSource).not.toContain('from "./productReferenceImageService.js"');
    expect(consoleServerSource).not.toContain("async function importProductReferenceAssets(");
    expect(consoleServerSource).not.toContain("async function uploadProductReferenceImages(");
    expect(consoleServerSource).not.toContain("async function deleteProductReferenceImage(");
    expect(consoleServerSource).not.toContain("async function reorderProductReferenceImages(");
    expect(consoleServerSource).not.toContain("async function generateProductReferenceImages(");
  });

  it("centralizes non-AI product reference image import, upload, delete, and reorder logic", async () => {
    const serviceSource = await readFile(servicePath, "utf8");

    expect(serviceSource).toContain("export async function importProductReferenceAssets(");
    expect(serviceSource).toContain("export async function uploadProductReferenceImages(");
    expect(serviceSource).toContain("export async function deleteProductReferenceImage(");
    expect(serviceSource).toContain("export async function reorderProductReferenceImages(");
    expect(serviceSource).toContain('from "./productReferenceImageStore.js"');
    expect(serviceSource).toContain("nextAvailableReferenceImageTarget");
    expect(serviceSource).toContain("sameReferenceImageSet");
    expect(serviceSource).not.toContain("findProductFileBySku(");
    expect(serviceSource).not.toContain("parseProductFacts(");
    expect(serviceSource).not.toContain("JSON.stringify(");
  });

  it("centralizes product file loading and reference image writes for image mutations", async () => {
    const storeSource = await readFile(storePath, "utf8");

    expect(storeSource).toContain("export async function readProductReferenceImageFile(");
    expect(storeSource).toContain("export async function writeProductReferenceImages(");
    expect(storeSource).toContain("findProductFileBySku");
    expect(storeSource).toContain("parseProductFacts");
    expect(storeSource).toContain("JSON.stringify(");
  });
});
