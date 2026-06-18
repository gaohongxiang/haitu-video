import { describe, expect, it } from "vitest";

import { cleanImportedProductText } from "../../src/core/productImportCleaner.js";

describe("cleanImportedProductText", () => {
  it("keeps structured field imports compatible with the product fact draft", () => {
    const preview = cleanImportedProductText([
      "SKU: WALLET-BLACK-001",
      "商品名：ラウンドファスナー ミニ財布 ブラック",
      "カテゴリ：財布",
      "素材：PUレザー、ポリエステル",
      "サイズ：約11x9x3cm",
      "卖点：カードを整理しやすい / 小銭入れ付き / ラウンドファスナー",
      "使用场景：買い物、通勤、旅行",
      "禁止：本革未確認、防水未確認、日本で大人気は未確認",
      "图片：/tmp/wallet-main.jpg, detail1.jpg"
    ].join("\n"));

    expect(preview.product).toEqual({
      sku: "WALLET-BLACK-001",
      title_ja: "ラウンドファスナー ミニ財布 ブラック",
      category: "財布",
      materials: ["PUレザー", "ポリエステル"],
      dimensions: "約11x9x3cm",
      verified_selling_points: ["カードを整理しやすい", "小銭入れ付き", "ラウンドファスナー"],
      usage_scenes: ["買い物", "通勤", "旅行"],
      forbidden_claims: ["本革未確認", "防水未確認", "日本で大人気は未確認"],
      reference_images: ["/tmp/wallet-main.jpg", "detail1.jpg"]
    });
  });

  it("cleans messy ecommerce text without treating shop or price as product facts", () => {
    const preview = cleanImportedProductText([
      "店铺名：lumi",
      "商品ID 172397240576223361",
      "商品タイトル 接触冷感アームカバー 指穴付き ロング丈",
      "カテゴリ スポーツ・アウトドア > スポーツ用スリーブ・サポーター",
      "販売価格：¥1,280",
      "カラー：ホワイト / カーキ / ブルー / グレー / ブラック",
      "素材 ポリエステル",
      "サイズ：長さ約52cm",
      "商品説明：",
      "・指先までカバーしやすい一体型デザイン",
      "・ロング丈で腕まわりをカバー",
      "・通気性のある生地",
      "・UVカット96%以上",
      "主图：https://cdn.example.com/main.jpg",
      "画像2：/tmp/detail.jpg"
    ].join("\n"));

    expect(preview.product).toEqual({
      sku: "DXM-172397240576223361",
      title_ja: "接触冷感アームカバー 指穴付き ロング丈",
      category: "スポーツ用スリーブ・サポーター",
      materials: ["ポリエステル"],
      dimensions: "長さ約52cm",
      verified_selling_points: [
        "指先までカバーしやすい一体型デザイン",
        "ロング丈で腕まわりをカバー",
        "通気性のある生地",
        "ホワイト、カーキ、ブルー、グレー、ブラックの5色展開"
      ],
      usage_scenes: ["通勤", "屋外での移動", "スポーツ"],
      forbidden_claims: [
        "UVカット96%以上は証明未確認"
      ],
      reference_images: ["https://cdn.example.com/main.jpg", "/tmp/detail.jpg"]
    });
    expect(preview.notes).toEqual([
      "已忽略店铺名: lumi",
      "已识别价格但未写入商品资料: ¥1,280",
      "颜色已转为可确认卖点: ホワイト、カーキ、ブルー、グレー、ブラックの5色展開",
      "疑似夸大或需证明的宣称已移入禁止宣称: UVカット96%以上"
    ]);
  });

  it("extracts bare ecommerce image URLs from pasted product text", () => {
    const imageUrl = "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/c5633a662f964e4889c530fd4fd4b263~tplv-o3syd03w52-origin-jpeg.jpeg?dr=15568&t=555f072d&ps=933b5bde&shp=a3510d86&shcp=6ce186a1&idc=my&from=2739998086";
    const preview = cleanImportedProductText([
      "商品ID 172397240576223361",
      "商品タイトル 接触冷感アームカバー 指穴付き ロング丈",
      "カテゴリ スポーツ・アウトドア > スポーツ用スリーブ・サポーター",
      "素材 ポリエステル",
      "サイズ：長さ約52cm",
      "・指先までカバーしやすい一体型デザイン",
      imageUrl
    ].join("\n"));

    expect(preview.product.reference_images).toEqual([imageUrl]);
  });

  it("returns a structured quality report for missing facts and blocked claims", () => {
    const preview = cleanImportedProductText([
      "商品ID 9988",
      "商品タイトル ラウンドファスナー ミニ財布 ブラック",
      "カテゴリ 財布",
      "販売価格：¥1,280",
      "・カードを整理しやすい",
      "・完全防水",
      "画像：https://cdn.example.com/wallet.jpg"
    ].join("\n"));

    expect(preview.quality).toEqual({
      ready: false,
      score: 67,
      summary: "缺少 2 项关键信息，已拦截 1 条高风险宣称。",
      missingFields: [
        "材质",
        "尺寸/重量"
      ],
      verifiedFacts: [
        "标题",
        "分类",
        "已验证卖点",
        "使用场景",
        "参考图"
      ],
      blockedClaims: [
        "完全防水"
      ],
      warnings: [
        "价格已识别但不写入商品资料，后续可在字幕/CTA 阶段单独管理。",
        "存在未确认宣称，已放入禁止宣称，不会用于脚本或 prompt。",
        "请补充材质，避免脚本描述商品手感或面料时编造。",
        "请补充尺寸/重量，避免生成脚本时编造大小、容量或便携性。"
      ]
    });
  });

  it("does not invent placeholder reference images when the pasted text has no image", () => {
    const preview = cleanImportedProductText([
      "商品ID 9988",
      "商品タイトル ラウンドファスナー ミニ財布 ブラック",
      "カテゴリ 財布",
      "素材 PUレザー",
      "サイズ 約11x9x3cm",
      "卖点：カードを整理しやすい",
      "使用场景：買い物"
    ].join("\n"));

    expect(preview.product.reference_images).toEqual([]);
    expect(preview.quality.missingFields).toContain("参考图");
    expect(preview.quality.verifiedFacts).not.toContain("参考图");
  });

  it("does not add generic default forbidden claims when no risky claim is present", () => {
    const preview = cleanImportedProductText([
      "商品ID 9988",
      "商品タイトル 接触冷感アームカバー",
      "カテゴリ アームカバー",
      "素材 ポリエステル",
      "サイズ 約52cm",
      "・接触冷感",
      "・通気性が良い",
      "・紫外線対策",
      "主图：https://cdn.example.com/main.jpg"
    ].join("\n"));

    expect(preview.product.verified_selling_points).toEqual([
      "接触冷感",
      "通気性が良い",
      "紫外線対策"
    ]);
    expect(preview.product.forbidden_claims).toEqual([]);
    expect(preview.quality.blockedClaims).toEqual([]);
  });

  it("treats explicit unverified claim fields as blocked claims", () => {
    const preview = cleanImportedProductText([
      "商品ID 172397240576223361",
      "商品タイトル ラウンドファスナー ミニ財布 ブラック",
      "カテゴリ 財布",
      "素材 PUレザー、ポリエステル",
      "サイズ 約11x9x2.5cm",
      "重量 約120g",
      "卖点：カードを整理しやすい / 小銭入れ付き / ファスナーで中身が見えにくい",
      "使用场景：通勤、買い物、旅行",
      "未确认宣称：完全防水、日本で大人気",
      "主图：/Users/gaohongxiang/电商/tiktok1/钱包/钱包-黑色.jpg"
    ].join("\n"));

    expect(preview.product.forbidden_claims).toEqual([
      "完全防水",
      "日本で大人気"
    ]);
    expect(preview.quality).toEqual(expect.objectContaining({
      ready: true,
      score: 100,
      summary: "商品资料完整，已拦截 2 条高风险宣称。",
      missingFields: [],
      blockedClaims: [
        "完全防水",
        "日本で大人気"
      ],
      warnings: [
        "存在未确认宣称，已放入禁止宣称，不会用于脚本或 prompt。"
      ]
    }));
  });
});
