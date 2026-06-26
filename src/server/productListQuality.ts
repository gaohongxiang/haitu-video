import type { parseProductFacts } from "../core/productFacts.js";

export interface ProductListQuality {
  ready: boolean;
  score: number;
  summary: string;
  missingFields: string[];
  verifiedFacts: string[];
  warnings: string[];
}

export function summarizeProductListQuality(product: ReturnType<typeof parseProductFacts>): ProductListQuality {
  const missingFields = productListMissingFields(product);
  const verifiedFacts = productListVerifiedFacts(product);
  const warnings: string[] = [];
  if (missingFields.includes("材质")) {
    warnings.push("请补充材质，避免脚本描述商品手感或面料时编造。");
  }
  if (missingFields.includes("尺寸/重量")) {
    warnings.push("请补充尺寸/重量，避免生成脚本时编造大小、容量或便携性。");
  }
  if (missingFields.includes("已验证卖点")) {
    warnings.push("请补充已验证卖点，否则脚本只能保守描述商品。");
  }
  if (missingFields.includes("参考图")) {
    warnings.push("请上传真实参考图，视频生成时才有商品外观约束。");
  }
  const score = Math.max(0, Math.round(100 - missingFields.length * 16.5));
  return {
    ready: missingFields.length === 0,
    score,
    summary: productListQualitySummary(missingFields.length),
    missingFields,
    verifiedFacts,
    warnings
  };
}

function productListMissingFields(product: ReturnType<typeof parseProductFacts>): string[] {
  const fields: string[] = [];
  if (!product.title_ja.trim() || product.title_ja === "未命名商品") fields.push("标题");
  if (!product.category.trim() || product.category === "未分类") fields.push("分类");
  if (product.materials.length === 0 || product.materials.some((item) => item.includes("未确认"))) fields.push("材质");
  if (!product.dimensions.trim() || product.dimensions.includes("未确认")) fields.push("尺寸/重量");
  if (
    product.verified_selling_points.length === 0 ||
    product.verified_selling_points.some((item) => item.includes("待确认") || item.includes("未确认"))
  ) {
    fields.push("已验证卖点");
  }
  if (product.usage_scenes.length === 0) fields.push("使用场景");
  if (product.reference_images.length === 0 || product.reference_images.every((item) => item === "reference.jpg")) fields.push("参考图");
  return fields;
}

function productListVerifiedFacts(product: ReturnType<typeof parseProductFacts>): string[] {
  const facts: string[] = [];
  if (product.title_ja.trim() && product.title_ja !== "未命名商品") facts.push("标题");
  if (product.category.trim() && product.category !== "未分类") facts.push("分类");
  if (product.materials.length > 0 && product.materials.every((item) => !item.includes("未确认"))) facts.push("材质");
  if (product.dimensions.trim() && !product.dimensions.includes("未确认")) facts.push("尺寸/重量");
  if (
    product.verified_selling_points.length > 0 &&
    product.verified_selling_points.every((item) => !item.includes("待确认") && !item.includes("未确认"))
  ) {
    facts.push("已验证卖点");
  }
  if (product.usage_scenes.length > 0) facts.push("使用场景");
  if (product.reference_images.length > 0 && product.reference_images.some((item) => item !== "reference.jpg")) facts.push("参考图");
  return facts;
}

function productListQualitySummary(missingCount: number): string {
  if (missingCount === 0) {
    return "商品资料完整，可进入视频预检。";
  }
  return `缺少 ${missingCount} 项关键信息。`;
}
