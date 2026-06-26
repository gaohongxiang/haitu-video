import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const productRoutesPath = "src/server/productRoutes.ts";
const importRoutesPath = "src/server/productImportRoutes.ts";

describe("product import routes source boundaries", () => {
  it("keeps product import endpoint branches outside the main product route aggregator", async () => {
    const routesSource = await readFile(productRoutesPath, "utf8");

    await expect(access(importRoutesPath)).resolves.toBeUndefined();
    expect(routesSource).toContain('from "./productImportRoutes.js"');
    expect(routesSource).toContain("handleProductImportRoutes(");
    expect(routesSource).not.toContain('url.pathname === "/api/products/import-preview"');
    expect(routesSource).not.toContain('url.pathname === "/api/products/import-ai-preview"');
    expect(routesSource).not.toContain('url.pathname === "/api/products/import-file-preview"');
    expect(routesSource).not.toContain("buildAiImportedProductPreview(");
    expect(routesSource).not.toContain("commitProductFileImportRows(");
  });

  it("centralizes product import, AI import, batch import, and file import routes", async () => {
    const importRoutesSource = await readFile(importRoutesPath, "utf8");

    expect(importRoutesSource).toContain("export async function handleProductImportRoutes(");
    expect(importRoutesSource).toContain('url.pathname === "/api/products/import-preview"');
    expect(importRoutesSource).toContain('url.pathname === "/api/products/import-ai-preview"');
    expect(importRoutesSource).toContain('url.pathname === "/api/products/import"');
    expect(importRoutesSource).toContain('url.pathname === "/api/products/import-batch"');
    expect(importRoutesSource).toContain('url.pathname === "/api/products/import-file-preview"');
    expect(importRoutesSource).toContain('url.pathname === "/api/products/import-file-commit"');
    expect(importRoutesSource).toContain("createTextModelProvider(");
    expect(importRoutesSource).toContain("commitProductFileImportRows(");
  });
});
