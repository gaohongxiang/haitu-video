import { describe, expect, it } from "vitest";

describe("normalizeAiProductFacts", () => {
  it("keeps supported AI facts while moving only source-backed safe claims into verified points", async () => {
    const { normalizeAiProductFacts } = await import("../../src/server/productImportAiNormalization.js");
    const sourceText = [
      "SKU: ITEM-001",
      "商品名: 冷感アームカバー",
      "素材: ナイロン",
      "接触冷感",
      "通気性",
      "画像: https://example.com/a.jpg"
    ].join("\n");

    const normalized = normalizeAiProductFacts({
      sku: " AI-001 ",
      title_ja: { text: "冷感アームカバー" },
      category: "アームカバー",
      materials: ["ナイロン", " ポリウレタン "],
      dimensions: { length: "45cm", wrist: "16cm" },
      verified_selling_points: ["接触冷感"],
      usage_scenes: [{ scene: "通勤" }, "アウトドア"],
      forbidden_claims: ["通気性", "No.1", "証明未確認"],
      reference_images: ["https://example.com/a.jpg", "https://example.com/missing.jpg"]
    }, sourceText);

    expect(normalized).toMatchObject({
      sku: "AI-001",
      title_ja: "冷感アームカバー",
      category: "アームカバー",
      materials: ["ナイロン", "ポリウレタン"],
      dimensions: "45cm、16cm",
      verified_selling_points: expect.arrayContaining(["接触冷感", "通気性"]),
      usage_scenes: ["通勤", "アウトドア"],
      forbidden_claims: ["No.1", "証明未確認"],
      reference_images: ["https://example.com/a.jpg"],
      source_text: sourceText
    });
  });
});
