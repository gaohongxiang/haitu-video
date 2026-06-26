import { describe, expect, it } from "vitest";

import { filterProductLibraryProducts, productLibraryFuzzyMatch } from "../../src/client/productLibrarySearch.js";

describe("product library search", () => {
  const products = [
    { sku: "hat-uv-001", title_ja: "UVカット 日よけ帽子 2026夏新作", path: "products/hat.md" },
    { sku: "bag-fold-002", title_ja: "折りたたみエコバッグ", path: "products/bag.md" },
    { sku: "lamp-003", title_ja: "充電式デスクライト", path: "products/lamp.md" }
  ];

  it("keeps all products when the query is blank", () => {
    expect(filterProductLibraryProducts(products, "   ")).toEqual(products);
  });

  it("matches sku, title, and extra status text", () => {
    expect(filterProductLibraryProducts(products, "bag").map((product) => product.sku)).toEqual(["bag-fold-002"]);
    expect(filterProductLibraryProducts(products, "UV帽").map((product) => product.sku)).toEqual(["hat-uv-001"]);
    expect(filterProductLibraryProducts(products, "生成", () => ["可生成视频"]).map((product) => product.sku)).toEqual([
      "hat-uv-001",
      "bag-fold-002",
      "lamp-003"
    ]);
  });

  it("supports ordered fuzzy matching without requiring adjacent characters", () => {
    expect(productLibraryFuzzyMatch("UVカット 日よけ帽子 2026夏新作", "u帽26")).toBe(true);
    expect(productLibraryFuzzyMatch("折りたたみエコバッグ", "帽子")).toBe(false);
  });
});
