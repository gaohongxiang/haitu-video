import { describe, expect, it } from "vitest";

import { parseProductFacts } from "../../src/core/productFacts.js";

const validProduct = {
  sku: "TK-001",
  title_ja: "折りたたみ収納ボックス",
  category: "収納用品",
  materials: ["PP"],
  dimensions: "36x25x19cm",
  verified_selling_points: ["折りたたみ可能", "積み重ね可能", "省スペース"],
  usage_scenes: ["キッチン", "洗面所", "クローゼット"],
  forbidden_claims: ["防水未確認", "耐荷重未確認", "日本で大人気は未確認"],
  reference_images: ["main.jpg", "detail1.jpg", "detail2.jpg"]
};

describe("parseProductFacts", () => {
  it("accepts a complete product fact package", () => {
    const product = parseProductFacts(validProduct);

    expect(product.sku).toBe("TK-001");
    expect(product.verified_selling_points).toHaveLength(3);
    expect(product.reference_images).toEqual(["main.jpg", "detail1.jpg", "detail2.jpg"]);
  });

  it("rejects products without verified selling points", () => {
    expect(() =>
      parseProductFacts({
        ...validProduct,
        verified_selling_points: []
      })
    ).toThrow(/verified_selling_points/);
  });

  it("rejects products without forbidden claim notes", () => {
    expect(() =>
      parseProductFacts({
        ...validProduct,
        forbidden_claims: []
      })
    ).toThrow(/forbidden_claims/);
  });
});
