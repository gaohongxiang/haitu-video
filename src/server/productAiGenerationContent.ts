import type { ProductFacts } from "../core/productFacts.js";
import type { ScriptTemplate } from "../core/scriptGenerator.js";
import { videoTemplateDefinitions } from "../core/templateCatalog.js";

type ProductGenerationFacts = Pick<
  ProductFacts,
  | "title_ja"
  | "category"
  | "materials"
  | "dimensions"
  | "verified_selling_points"
  | "usage_scenes"
  | "forbidden_claims"
>;

export function buildProductReferenceImagePrompt(
  product: ProductGenerationFacts,
  extraPrompt: string | undefined
): string {
  return [
    "Create a clean e-commerce reference image for a TikTok Shop Japan product.",
    "Use a plain light background, realistic product shape, no text overlays, no logos, no exaggerated claims.",
    "The image should help video generation understand the product appearance.",
    `Product title: ${product.title_ja}`,
    `Category: ${product.category}`,
    `Materials: ${product.materials.join(", ")}`,
    `Dimensions/weight: ${product.dimensions}`,
    `Verified selling points: ${product.verified_selling_points.join(", ")}`,
    `Usage scenes: ${product.usage_scenes.join(", ")}`,
    product.forbidden_claims.length > 0
      ? `Avoid implying these unverified claims: ${product.forbidden_claims.join(", ")}`
      : "",
    typeof extraPrompt === "string" && extraPrompt.trim() ? `Extra direction: ${extraPrompt.trim()}` : ""
  ].filter(Boolean).join("\n");
}

export function buildProductImagePromptDraftFallback(
  product: ProductGenerationFacts,
  userPrompt: string | undefined
): string {
  const intent = typeof userPrompt === "string" && userPrompt.trim()
    ? userPrompt.trim()
    : "清晰电商商品图";
  const sellingPoints = product.verified_selling_points.slice(0, 2).join("、") || "核心卖点";
  const scene = product.usage_scenes[0] || "真实使用";
  const forbiddenClaims = product.forbidden_claims.slice(0, 2).join("、");
  return [
    `保留${product.title_ja}的真实外观、材质和比例`,
    intent,
    `突出${sellingPoints}`,
    `适合${scene}场景`,
    forbiddenClaims ? `避免 ${forbiddenClaims} 等未确认宣称` : "不添加未确认功效、销量或排名宣称"
  ].join("，").replace(/，避免 /, "；避免 ") + "。";
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export function hasJapaneseOutsideAllowedProductNames(lines: string[], allowedProductTitle: string): boolean {
  const allowedFragments = new Set(splitJapaneseFragments(allowedProductTitle));
  return lines.some((line) => {
    const fragments = splitJapaneseFragments(line);
    return fragments.some((fragment) => !allowedFragments.has(fragment));
  });
}

export function buildChineseScriptFallback(
  product: ProductGenerationFacts,
  template: ScriptTemplate,
  duration: number
): string[] {
  const firstScene = product.usage_scenes[0] || "日常使用";
  const firstPoint = safeChineseFact(product.verified_selling_points[0], "核心卖点");
  const secondPoint = safeChineseFact(product.verified_selling_points[1], "已确认卖点");
  return [
    `类型: ${serverTemplateLabel(template)} / 时长: ${duration}s`,
    `以${firstScene}场景切入，先展示用户会遇到的真实使用需求。`,
    `镜头重点展示${firstPoint}。`,
    `用近景补充${secondPoint}、材质和整体外观。`
  ];
}

export function buildChineseStoryboardFallback(input: {
  duration: number;
  template: ScriptTemplate;
  product: ProductGenerationFacts;
}): string[] {
  const middle = Math.max(2, Math.floor(input.duration * 0.45));
  const closing = Math.max(middle + 1, input.duration - 2);
  const firstScene = input.product.usage_scenes[0] || "使用场景";
  const firstPoint = safeChineseFact(input.product.verified_selling_points[0], "商品细节");
  const secondPoint = safeChineseFact(input.product.verified_selling_points[1], "已确认卖点");
  return [
    `0-2s: 以${serverTemplateLabel(input.template)}开场，展示${firstScene}和商品整体。`,
    `2-${middle}s: 近景展示${firstPoint}。`,
    `${middle}-${closing}s: 展示使用中的手部动作、质感和${secondPoint}。`,
    `${closing}-${input.duration}s: 再次展示使用后的效果和商品整体。`
  ];
}

export function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isInteger(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function extensionFromMimeType(mimeType: string): ".jpg" | ".png" | ".webp" {
  if (mimeType === "image/jpeg") {
    return ".jpg";
  }
  if (mimeType === "image/webp") {
    return ".webp";
  }
  return ".png";
}

function splitJapaneseFragments(value: string): string[] {
  return value.match(/[\u3040-\u30ffー]+/g) ?? [];
}

function serverTemplateLabel(template: ScriptTemplate): string {
  const definition = videoTemplateDefinitions.find((item) => item.id === template);
  return definition?.label ?? template;
}

function safeChineseFact(value: string | undefined, fallback: string): string {
  if (!value?.trim()) {
    return fallback;
  }
  return splitJapaneseFragments(value).length > 0 ? fallback : value.trim();
}
