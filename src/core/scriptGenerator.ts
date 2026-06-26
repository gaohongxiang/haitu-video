import type { ProductFacts } from "./productFacts.js";
import { defaultFinalVideoLanguage, type FinalVideoLanguage } from "./videoLanguage.js";

export type ScriptTemplate = "pain-point" | "scene" | "unboxing" | "benefit" | "ugc";

export interface ScriptOptions {
  cta: string;
  template: ScriptTemplate;
  scriptLines?: string[];
  finalLanguage?: FinalVideoLanguage;
}

export interface GeneratedScript {
  voiceover: string;
  subtitleLines: string[];
  cta: string;
}

export function generateJapaneseAdScript(
  product: ProductFacts,
  options: ScriptOptions
): GeneratedScript {
  const finalLanguage = options.finalLanguage ?? defaultFinalVideoLanguage;
  const editedScriptLines = normalizeEditedLines(options.scriptLines);
  if (editedScriptLines.length > 0) {
    return {
      voiceover: editedScriptLines.join(" "),
      subtitleLines: editedScriptLines,
      cta: options.cta
    };
  }

  if (finalLanguage === "zh") {
    return generateChineseAdScript(product, options);
  }
  if (finalLanguage === "en") {
    return generateEnglishAdScript(product, options);
  }

  const scenes = product.usage_scenes.slice(0, 2).join("や");
  const sellingPoints = product.verified_selling_points.slice(0, 3);
  const opening =
    options.template === "ugc"
      ? `これ、${product.title_ja}です。`
      : buildOpening(product.category, scenes);

  const subtitleLines = [
    opening,
    `${product.title_ja}は${sellingPoints[0]}。`,
    `${sellingPoints.slice(1).join("、")}で使いやすい。`,
    formatDetailLine(product.dimensions, product.materials),
    options.cta
  ];

  return {
    voiceover: subtitleLines.join(" "),
    subtitleLines,
    cta: options.cta
  };
}

function generateChineseAdScript(product: ProductFacts, options: ScriptOptions): GeneratedScript {
  const scenes = product.usage_scenes.slice(0, 2).join("、") || "日常使用";
  const sellingPoints = product.verified_selling_points.slice(0, 3);
  const subtitleLines = [
    options.template === "ugc"
      ? "这款商品可以这样自然展示。"
      : buildChineseOpening(product.category, scenes),
    `先展示${sellingPoints[0] || "商品资料里确认过的核心卖点"}。`,
    `再用手部动作带出${sellingPoints.slice(1).join("、") || "已确认的商品特点"}。`,
    formatChineseDetailLine(product.dimensions, product.materials),
    options.cta
  ];

  return {
    voiceover: subtitleLines.join(" "),
    subtitleLines,
    cta: options.cta
  };
}

function generateEnglishAdScript(product: ProductFacts, options: ScriptOptions): GeneratedScript {
  const scenes = product.usage_scenes.slice(0, 2).join(" and ") || "everyday use";
  const sellingPoints = product.verified_selling_points.slice(0, 3);
  const subtitleLines = [
    options.template === "ugc"
      ? "Here is a natural way to show this item."
      : buildEnglishOpening(product.category, scenes),
    `Show ${sellingPoints[0] || "the main verified product benefit"} first.`,
    `Then highlight ${sellingPoints.slice(1).join(", ") || "the confirmed product details"} with simple hand movement.`,
    formatEnglishDetailLine(product.dimensions, product.materials),
    options.cta
  ];

  return {
    voiceover: subtitleLines.join(" "),
    subtitleLines,
    cta: options.cta
  };
}

function normalizeEditedLines(lines?: string[]): string[] {
  return (lines ?? []).map((line) => line.trim()).filter(Boolean);
}

function formatDetailLine(dimensions: string, materials: string[]): string {
  const materialsText = formatMaterials(materials);
  if (/梱包|包装|重量|発送|配送/.test(dimensions)) {
    return `${materialsText}。`;
  }
  return `${dimensions}、${materialsText}。`;
}

function formatChineseDetailLine(dimensions: string, materials: string[]): string {
  const materialsText = materials.length > 0 ? `${materials.join("、")}材质` : "材质细节";
  if (/梱包|包装|重量|発送|配送|包[装裹]|物流|发货/.test(dimensions)) {
    return `用近景展示${materialsText}。`;
  }
  const dimensionText = dimensions ? `和${dimensions}` : "";
  return `补充展示${materialsText}${dimensionText}。`;
}

function formatEnglishDetailLine(dimensions: string, materials: string[]): string {
  const materialsText = materials.length > 0 ? materials.join(", ") : "the material details";
  if (/梱包|包装|重量|発送|配送|包[装裹]|物流|发货|shipping|package|weight/i.test(dimensions)) {
    return `Use close-up shots to show ${materialsText}.`;
  }
  const dimensionText = dimensions ? ` and ${dimensions}` : "";
  return `Add close-up shots of ${materialsText}${dimensionText}.`;
}

function formatMaterials(materials: string[]): string {
  const joinedMaterials = materials.join("・");
  if (/(素材|材|皮革|レザー|PU|PP|PET|ABS|PVC)$/i.test(joinedMaterials)) {
    return joinedMaterials;
  }
  return `${joinedMaterials}素材`;
}

function buildOpening(category: string, scenes: string): string {
  if (/収納/.test(category)) {
    return `${scenes}の収納、すっきり見せたい方へ。`;
  }
  return `${scenes}で使いやすいアイテムを探している方へ。`;
}

function buildChineseOpening(category: string, scenes: string): string {
  if (/収納|收纳/.test(category)) {
    return `面向想让${scenes}更整齐的用户。`;
  }
  return `面向${scenes}场景中需要这类商品的用户。`;
}

function buildEnglishOpening(category: string, scenes: string): string {
  if (/収納|收纳|storage/i.test(category)) {
    return `For everyday use in ${scenes}, show how this keeps things organized.`;
  }
  return `For everyday use in ${scenes}, introduce the product clearly.`;
}
