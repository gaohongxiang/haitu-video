import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { listProducts } from "../../src/server/productListService.js";

describe("product list service", () => {
  it("deduplicates products by sku using the strongest summary and sorts by sku", async () => {
    const rootDir = join(process.cwd(), "output", "test-product-list-service");
    const fixturesDir = join(rootDir, "products");
    await writeProduct(join(fixturesDir, "z-low", "product.json"), {
      sku: "SKU-Z",
      title_ja: "低品質",
      reference_images: []
    });
    await writeProduct(join(fixturesDir, "z-high", "product.json"), {
      sku: "SKU-Z",
      title_ja: "高品質",
      reference_images: ["reference.jpg", "refs/reference-01.jpg"]
    });
    await writeProduct(join(fixturesDir, "a", "product.json"), {
      sku: "SKU-A",
      title_ja: "先頭商品",
      reference_images: ["reference.jpg"]
    });

    const products = await listProducts(fixturesDir, rootDir);

    expect(products.map((product) => product.sku)).toEqual(["SKU-A", "SKU-Z"]);
    expect(products.find((product) => product.sku === "SKU-Z")).toMatchObject({
      title_ja: "高品質",
      referenceImageCount: 2
    });
  });
});

async function writeProduct(path: string, input: {
  sku: string;
  title_ja: string;
  reference_images: string[];
}): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify({
    sku: input.sku,
    title_ja: input.title_ja,
    category: "雑貨",
    materials: ["ナイロン"],
    dimensions: "10cm",
    verified_selling_points: ["軽量"],
    usage_scenes: ["日常"],
    forbidden_claims: [],
    reference_images: input.reference_images
  }), "utf8");
}
