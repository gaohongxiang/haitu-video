import { describe, expect, it } from "vitest";

import type { ProductFacts } from "../../src/core/productFacts.js";
import { generateJapaneseAdScript } from "../../src/core/scriptGenerator.js";

const product: ProductFacts = {
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

describe("generateJapaneseAdScript", () => {
  it("builds a short Japanese ad script from verified facts", () => {
    const script = generateJapaneseAdScript(product, {
      cta: "今すぐチェック",
      template: "pain-point"
    });

    expect(script.voiceover).toContain("折りたたみ収納ボックス");
    expect(script.voiceover).toContain("折りたたみ可能");
    expect(script.voiceover).toContain("積み重ね可能");
    expect(script.voiceover).toContain("省スペース");
    expect(script.subtitleLines.at(-1)).toBe("今すぐチェック");
  });

  it("does not include forbidden or unverified claims", () => {
    const script = generateJapaneseAdScript(product, {
      cta: "今すぐチェック",
      template: "benefit"
    });

    expect(script.voiceover).not.toContain("防水");
    expect(script.voiceover).not.toContain("耐荷重");
    expect(script.voiceover).not.toContain("日本で大人気");
  });

  it("does not duplicate the Japanese material suffix when material already includes it", () => {
    const script = generateJapaneseAdScript(
      {
        ...product,
        title_ja: "ラウンドファスナー ミニ財布 ブラック",
        materials: ["レザー調素材"],
        dimensions: "ミニサイズ",
        verified_selling_points: ["ラウンドファスナー仕様", "小銭入れ付き"]
      },
      {
        cta: "今すぐチェック",
        template: "pain-point"
      }
    );

    expect(script.voiceover).toContain("ミニサイズ、レザー調素材。");
    expect(script.voiceover).not.toContain("素材素材");
  });

  it("uses a category-neutral opening for non-storage products", () => {
    const script = generateJapaneseAdScript(
      {
        ...product,
        sku: "DXM-172397240576223361",
        title_ja: "接触冷感アームカバー",
        category: "スポーツ用スリーブ・サポーター",
        materials: ["ポリエステル"],
        dimensions: "梱包サイズ目安 15x10x5cm、重量 0.1kg",
        verified_selling_points: [
          "指先までカバーしやすい一体型デザイン",
          "ロング丈のアームカバー"
        ],
        usage_scenes: ["通勤", "屋外での移動"],
        forbidden_claims: ["UVカット96%以上は証明未確認"]
      },
      {
        cta: "今すぐチェック",
        template: "scene"
      }
    );

    expect(script.voiceover).not.toContain("収納");
    expect(script.subtitleLines[0]).toContain("通勤や屋外での移動");
  });

  it("omits logistics-style package details from ad voiceover", () => {
    const script = generateJapaneseAdScript(
      {
        ...product,
        title_ja: "接触冷感アームカバー",
        category: "スポーツ用スリーブ・サポーター",
        materials: ["ポリエステル"],
        dimensions: "梱包サイズ目安 15x10x5cm、重量 0.1kg",
        verified_selling_points: [
          "指先までカバーしやすい一体型デザイン",
          "ロング丈のアームカバー",
          "リブとメロウのくすみカラーデザイン"
        ],
        usage_scenes: ["通勤", "屋外での移動"]
      },
      {
        cta: "今すぐチェック",
        template: "scene"
      }
    );

    expect(script.voiceover).not.toContain("梱包サイズ");
    expect(script.voiceover).not.toContain("重量");
    expect(script.voiceover).toContain("ポリエステル素材");
  });

  it("uses operator-edited script lines when provided", () => {
    const script = generateJapaneseAdScript(product, {
      cta: "詳しく見る",
      template: "scene",
      scriptLines: [
        "冷蔵庫まわりをすっきり見せたい方へ。",
        "折りたたみ可能で使わない時も省スペース。",
        "詳しく見る"
      ]
    });

    expect(script.subtitleLines).toEqual([
      "冷蔵庫まわりをすっきり見せたい方へ。",
      "折りたたみ可能で使わない時も省スペース。",
      "詳しく見る"
    ]);
    expect(script.voiceover).toBe("冷蔵庫まわりをすっきり見せたい方へ。 折りたたみ可能で使わない時も省スペース。 詳しく見る");
    expect(script.cta).toBe("詳しく見る");
  });

  it("can build a simplified Chinese fallback script for Chinese final videos", () => {
    const script = generateJapaneseAdScript(product, {
      cta: "立即查看",
      template: "scene",
      finalLanguage: "zh"
    });

    expect(script.voiceover).toContain("面向");
    expect(script.voiceover).toContain("折りたたみ可能");
    expect(script.voiceover).toContain("立即查看");
    expect(script.voiceover).not.toContain("の収納");
    expect(script.voiceover).not.toContain("で使いやすい");
  });
});
