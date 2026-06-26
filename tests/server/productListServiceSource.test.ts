import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const servicePath = "src/server/productService.ts";
const listServicePath = "src/server/productListService.ts";

describe("product list service source boundaries", () => {
  it("keeps product list discovery and summary ranking outside the base product service", async () => {
    const serviceSource = await readFile(servicePath, "utf8");

    await expect(access(listServicePath)).resolves.toBeUndefined();
    expect(serviceSource).toContain('from "./productListService.js"');
    expect(serviceSource).toContain("export { listProducts }");
    expect(serviceSource).not.toContain("async function readProductFactsForList(");
    expect(serviceSource).not.toContain("function productSummaryRank(");
    expect(serviceSource).not.toContain("function missingProductFileReadiness(");
  });

  it("centralizes product list loading, SQLite fallback, and summary ranking", async () => {
    const listServiceSource = await readFile(listServicePath, "utf8");

    expect(listServiceSource).toContain("export async function listProducts(");
    expect(listServiceSource).toContain("async function readProductFactsForList(");
    expect(listServiceSource).toContain("function productSummaryRank(");
    expect(listServiceSource).toContain("function missingProductFileReadiness(");
    expect(listServiceSource).toContain("summarizeProductListQuality(");
    expect(listServiceSource).toContain("buildPaidGenerationReadiness(");
  });
});
