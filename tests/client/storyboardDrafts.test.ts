import { describe, expect, it } from "vitest";

import {
  defaultStoryboardDraft,
  defaultStudioScriptDraft,
  defaultStudioStoryboardCnDraft,
  defaultStudioStoryboardDraft,
  splitDraftLines,
  storyboardTimeRanges,
  templateLabel,
  type StoryboardTemplateName
} from "../../src/client/storyboardDrafts.js";
import type { ProductDetail } from "../../src/client/productWorkflowViewModel.js";

function productDetail(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    path: overrides.path ?? "products/item.json",
    sku: overrides.sku ?? "SKU-1",
    title_ja: overrides.title_ja ?? "冷感アームカバー",
    category: overrides.category ?? "アパレル",
    materials: overrides.materials ?? ["尼龙", "氨纶"],
    dimensions: overrides.dimensions ?? "长 40cm",
    verified_selling_points: overrides.verified_selling_points ?? ["接触冷感", "轻薄透气", "弹力贴合"],
    usage_scenes: overrides.usage_scenes ?? ["通勤", "户外运动"],
    forbidden_claims: overrides.forbidden_claims ?? [],
    reference_images: overrides.reference_images ?? [],
    referenceImageCount: overrides.referenceImageCount,
    importQuality: overrides.importQuality,
    paidReadiness: overrides.paidReadiness,
    source_text: overrides.source_text,
    reference_image_statuses: overrides.reference_image_statuses
  };
}

describe("storyboard draft helpers", () => {
  it("keeps template labels and split draft parsing stable", () => {
    expect(templateLabel("scene")).toBe("场景型");
    expect(templateLabel("pain-point")).toBe("痛点型");
    expect(templateLabel("benefit")).toBe("卖点型");
    expect(templateLabel("ugc")).toBe("UGC 型");
    expect(templateLabel("unboxing")).toBe("开箱型");
    expect(templateLabel("unknown")).toBe("unknown");
    expect(splitDraftLines(" 第一行 \n\n 第二行 ")).toEqual(["第一行", "第二行"]);
    expect(splitDraftLines("   ")).toBeUndefined();
  });

  it("builds default storyboard drafts with clamped time ranges", () => {
    expect(storyboardTimeRanges(10)).toEqual(["0-2s", "2-4s", "4-7s", "7-10s"]);
    expect(storyboardTimeRanges(1)).toEqual(["0-1s", "1-2s", "2-3s", "3-4s"]);
    expect(storyboardTimeRanges(99)).toEqual(["0-2s", "2-6s", "6-10s", "10-15s"]);

    expect(defaultStoryboardDraft("scene", 10)).toContain("0-2s: 展示商品所处的真实使用环境和整体外观。");
    expect(defaultStoryboardDraft("ugc", 10)).toContain("2-4s: 边展示边试用，用自然动作呈现第一感受。");
    expect(defaultStoryboardDraft("unboxing", 10)).toContain("7-10s: 摆放商品并进入简单使用场景，完成开箱收尾。");
    expect(defaultStoryboardDraft("unknown" as StoryboardTemplateName, 10)).toContain("0-2s: 展示商品所处的真实使用环境和整体外观。");
  });

  it("builds default studio drafts while avoiding Japanese kana in Chinese guidance", () => {
    const product = productDetail({
      usage_scenes: ["アウトドア", "通勤"],
      verified_selling_points: ["ひんやり", "轻薄透气", "弹力贴合"]
    });

    expect(defaultStudioScriptDraft(product, 10, "pain-point")).toBe([
      "类型: 痛点型 / 时长: 10s",
      "面向日常使用场景里的用户，开头 1 秒先展示痛点或使用场景。",
      "自然展示「冷感アームカバー」的外观，以及核心卖点。",
      "用手部动作展示轻薄透气、弹力贴合。",
      "加入能看出尼龙、氨纶的近景。"
    ].join("\n"));
    expect(defaultStudioStoryboardDraft(product, 10, "benefit")).toBe([
      "0-2s: 以卖点型开场，展示使用场景和商品整体。",
      "2-4s: 近景展示商品细节。",
      "4-8s: 展示使用中的手部动作、质感和尺寸感。",
      "8-10s: 再次展示使用后的效果和商品整体。"
    ].join("\n"));
    expect(defaultStudioStoryboardCnDraft(product, 10, "ugc")).toBe([
      "0-2 秒：以UGC 型开场，展示使用场景和商品整体。",
      "2-4 秒：近景展示商品细节。",
      "4-8 秒：展示使用中的手部动作、质感和尺寸感。",
      "8-10 秒：再次展示使用后的效果和商品整体。"
    ].join("\n"));
  });
});
