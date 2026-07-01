import { describe, expect, it } from "vitest";

import {
  buildChineseScriptFallback,
  buildChineseStoryboardFallback,
  buildProductImagePromptDraftFallback,
  buildProductReferenceImagePrompt,
  clampInteger,
  extensionFromMimeType,
  hasJapaneseOutsideAllowedProductNames,
  normalizeStringArray
} from "../../src/server/productAiGenerationContent.js";

describe("product AI generation content helpers", () => {
  const product = {
    title_ja: "冷感アームカバー",
    category: "アームカバー",
    materials: ["ナイロン", "ポリウレタン"],
    dimensions: "45cm",
    verified_selling_points: ["轻量", "通気性"],
    usage_scenes: ["通勤"],
    forbidden_claims: ["No.1"]
  };

  it("builds reference image prompts without empty optional lines", () => {
    const prompt = buildProductReferenceImagePrompt(product, "  show pair layout  ");

    expect(prompt).toContain("Create a clean e-commerce reference image");
    expect(prompt).toContain("Product title: 冷感アームカバー");
    expect(prompt).toContain("Materials: ナイロン, ポリウレタン");
    expect(prompt).toContain("Avoid implying these unverified claims: No.1");
    expect(prompt).toContain("Extra direction: show pair layout");
  });

  it("builds a concise image prompt draft fallback from product facts and user intent", () => {
    expect(buildProductImagePromptDraftFallback(product, "  白底主图  ")).toBe(
      "保留冷感アームカバー的真实外观、材质和比例，白底主图，突出轻量、通気性，适合通勤场景；避免 No.1 等未确认宣称。"
    );
    expect(buildProductImagePromptDraftFallback(product, "")).toContain("清晰电商商品图");
  });

  it("normalizes model arrays and detects unexpected Japanese fragments", () => {
    expect(normalizeStringArray([" ok ", 12, "", null])).toEqual(["ok", "12", "null"]);
    expect(normalizeStringArray("not-array")).toEqual([]);
    expect(hasJapaneseOutsideAllowedProductNames(["冷感アームカバー"], "冷感アームカバー")).toBe(false);
    expect(hasJapaneseOutsideAllowedProductNames(["画面に冷感アームカバーを表示"], "冷感アームカバー")).toBe(true);
    expect(hasJapaneseOutsideAllowedProductNames(["ここで商品を見せる"], "冷感アームカバー")).toBe(true);
  });

  it("builds Chinese fallback text with existing fact fallback behavior", () => {
    expect(buildChineseScriptFallback(product, "scene", 8)).toEqual([
      "类型: 场景型 / 时长: 8s",
      "以通勤场景切入，先展示用户会遇到的真实使用需求。",
      "镜头重点展示轻量。",
      "用近景补充通気性、材质和整体外观。"
    ]);
    expect(buildChineseStoryboardFallback({
      duration: 8,
      template: "scene",
      product
    })).toEqual([
      "0-2s: 以场景型开场，展示通勤和商品整体。",
      "2-3s: 近景展示轻量。",
      "3-6s: 展示使用中的手部动作、质感和通気性。",
      "6-8s: 再次展示使用后的效果和商品整体。"
    ]);
  });

  it("clamps integer inputs and maps generated image mime types", () => {
    expect(clampInteger(6, 1, 4)).toBe(4);
    expect(clampInteger(0, 1, 4)).toBe(1);
    expect(clampInteger(3, 1, 4)).toBe(3);
    expect(clampInteger(2.5, 1, 4)).toBe(1);
    expect(extensionFromMimeType("image/jpeg")).toBe(".jpg");
    expect(extensionFromMimeType("image/webp")).toBe(".webp");
    expect(extensionFromMimeType("image/png")).toBe(".png");
  });
});
