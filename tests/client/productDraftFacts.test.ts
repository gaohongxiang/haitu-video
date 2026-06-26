import { describe, expect, it } from "vitest";

import {
  internalProductIdFromTitle,
  productDraftToFacts,
  productDraftToProductDetail,
  productFactsToDraft,
  splitList,
  splitLines
} from "../../src/client/productDraftFacts.js";
import type { ProductFactsResponse } from "../../src/client/productWorkflowViewModel.js";

describe("product draft/facts conversion helpers", () => {
  it("converts a draft into normalized product facts and generated detail placeholders", () => {
    const facts = productDraftToFacts({
      sku: "  ",
      title_ja: " 冷感アームカバー ",
      category: " アパレル ",
      materials: "尼龙、 氨纶\n棉",
      dimensions: " 长 40cm ",
      verified_selling_points: " 接触冷感 \n\n 轻薄透气 ",
      usage_scenes: "通勤\n户外",
      forbidden_claims: "医疗用\n完全防水",
      reference_images: " a.jpg \n b.webp ",
      source_text: " 原始资料 "
    }, { now: 1_720_000_000_000 });

    expect(facts).toEqual({
      sku: "ITEM-product-ly5nl9ts",
      title_ja: "冷感アームカバー",
      category: "アパレル",
      materials: ["尼龙", "氨纶", "棉"],
      dimensions: "长 40cm",
      verified_selling_points: ["接触冷感", "轻薄透气"],
      usage_scenes: ["通勤", "户外"],
      forbidden_claims: ["医疗用", "完全防水"],
      reference_images: ["a.jpg", "b.webp"],
      source_text: "原始资料"
    });
    expect(productDraftToProductDetail({ ...productFactsToDraft(facts), source_text: "原始资料" }, { now: 1_720_000_000_000 })).toMatchObject({
      ...facts,
      path: "",
      referenceImageCount: 2,
      importQuality: undefined,
      reference_image_statuses: []
    });
  });

  it("round-trips facts back into the existing multiline draft format", () => {
    const product: ProductFactsResponse = {
      sku: "SKU-1",
      title_ja: "商品名",
      category: "カテゴリ",
      materials: ["ABS", "金属"],
      dimensions: "10cm",
      verified_selling_points: ["軽量", "丈夫"],
      usage_scenes: ["室内", "屋外"],
      forbidden_claims: ["医療用"],
      reference_images: ["a.jpg", "b.png"],
      source_text: "source"
    };

    expect(productFactsToDraft(product)).toEqual({
      sku: "SKU-1",
      title_ja: "商品名",
      category: "カテゴリ",
      materials: "ABS、金属",
      dimensions: "10cm",
      verified_selling_points: "軽量\n丈夫",
      usage_scenes: "室内\n屋外",
      forbidden_claims: "医療用",
      reference_images: "a.jpg\nb.png",
      source_text: "source"
    });
  });

  it("keeps splitting and fallback ID behavior stable", () => {
    expect(splitLines(" a \n\n b ")).toEqual(["a", "b"]);
    expect(splitList("a、 b,c\nd")).toEqual(["a", "b", "c", "d"]);
    expect(internalProductIdFromTitle("  Hello 商品!  ", 1_720_000_000_000)).toBe("ITEM-hello-ly5nl9ts");
    expect(internalProductIdFromTitle("!!!", 1_720_000_000_000)).toBe("ITEM-product-ly5nl9ts");
  });
});
