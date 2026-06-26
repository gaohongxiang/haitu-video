import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const servicePath = "src/server/productService.ts";
const qualityPath = "src/server/productListQuality.ts";

describe("product list quality source boundaries", () => {
  it("keeps product list quality scoring rules out of the product service orchestration module", async () => {
    const serviceSource = await readFile(servicePath, "utf8");

    await expect(access(qualityPath)).resolves.toBeUndefined();
    expect(serviceSource).toContain('from "./productListQuality.js"');
    expect(serviceSource).toContain("summarizeProductListQuality(");
    expect(serviceSource).not.toContain("function summarizeProductListQuality(");
    expect(serviceSource).not.toContain("function productListMissingFields(");
    expect(serviceSource).not.toContain("function productListVerifiedFacts(");
    expect(serviceSource).not.toContain("function productListQualitySummary(");
  });

  it("centralizes product list quality scoring, missing fields, and verified fact labels", async () => {
    const qualitySource = await readFile(qualityPath, "utf8");

    expect(qualitySource).toContain("export interface ProductListQuality");
    expect(qualitySource).toContain("export function summarizeProductListQuality(");
    expect(qualitySource).toContain("function productListMissingFields(");
    expect(qualitySource).toContain("function productListVerifiedFacts(");
    expect(qualitySource).toContain("function productListQualitySummary(");
    expect(qualitySource).toContain("请补充材质");
    expect(qualitySource).toContain("商品资料完整，可进入视频预检。");
  });
});
