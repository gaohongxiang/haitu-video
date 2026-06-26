import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const requestHandlerPath = "src/server/consoleRequestHandler.ts";
const apiRoutesPath = "src/server/consoleApiRoutes.ts";
const routesPath = "src/server/productRoutes.ts";

describe("product routes source boundaries", () => {
  it("keeps product API routing out of the console server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const requestHandlerSource = await readFile(requestHandlerPath, "utf8");
    const apiRoutesSource = await readFile(apiRoutesPath, "utf8");

    await expect(access(routesPath)).resolves.toBeUndefined();
    expect(consoleServerSource).toContain("createConsoleRequestHandler(");
    expect(consoleServerSource).not.toContain("handleConsoleApiRoutes(");
    expect(requestHandlerSource).toContain("handleConsoleApiRoutes(");
    expect(consoleServerSource).not.toContain('from "./productRoutes.js"');
    expect(apiRoutesSource).toContain('from "./productRoutes.js"');
    expect(apiRoutesSource).toContain("handleProductRoutes(");
    expect(consoleServerSource).not.toContain('url.pathname === "/api/products"');
    expect(consoleServerSource).not.toContain('url.pathname === "/api/products/import-preview"');
    expect(consoleServerSource).not.toContain("const productVideoJobsMatch");
    expect(consoleServerSource).not.toContain("const productStoryboardsMatch");
    expect(consoleServerSource).not.toContain("const productMatch");
    expect(consoleServerSource).not.toContain("const uploadProductAssetsMatch");
    expect(consoleServerSource).not.toContain("const generateProductAssetsMatch");
  });

  it("centralizes product CRUD, storyboard, reference image, product video job routes, and import route delegation", async () => {
    const routesSource = await readFile(routesPath, "utf8");

    expect(routesSource).toContain("export async function handleProductRoutes(");
    expect(routesSource).toContain('url.pathname === "/api/products"');
    expect(routesSource).toContain('from "./productImportRoutes.js"');
    expect(routesSource).toContain("handleProductImportRoutes(");
    expect(routesSource).not.toContain('url.pathname === "/api/products/import-preview"');
    expect(routesSource).toContain("productVideoJobsMatch");
    expect(routesSource).toContain("productStoryboardsMatch");
    expect(routesSource).toContain("productMatch");
    expect(routesSource).toContain("uploadProductAssetsMatch");
    expect(routesSource).toContain("generateProductAssetsMatch");
    expect(routesSource).toContain("saveProductFactPackage");
    expect(routesSource).toContain("generateProductReferenceImages");
  });
});
