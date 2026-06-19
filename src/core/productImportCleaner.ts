import { parseProductFacts, type ProductFacts } from "./productFacts.js";

export interface ImportedProductPreview {
  product: ProductFacts;
  notes: string[];
  quality: ProductImportQuality;
}

export interface ProductImportQuality {
  ready: boolean;
  score: number;
  summary: string;
  missingFields: string[];
  verifiedFacts: string[];
  blockedClaims: string[];
  warnings: string[];
}

interface FieldReadResult {
  value?: string;
  lineIndex?: number;
}

export const riskyClaimPatterns = [
  /UV\s*カット\s*\d+%以上/i,
  /UV\s*\d+%/i,
  /防水/,
  /大人気/,
  /ランキング\s*1位/,
  /No\.?1/i,
  /医療/,
  /治療/,
  /永久/,
  /完全/
];

export function cleanImportedProductText(sourceText: string): ImportedProductPreview {
  const text = sourceText.trim();
  if (!text) {
    throw new Error("Product import requires source text.");
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const notes: string[] = [];
  const shopName = firstField(lines, ["店铺名", "店鋪名", "店铺", "店鋪", "店舗", "shop"]);
  if (shopName.value) {
    notes.push(`已忽略店铺名: ${shopName.value}`);
  }

  const price = firstField(lines, ["販売価格", "售价", "价格", "価格", "price"]);
  if (price.value) {
    notes.push(`已识别价格但未写入商品资料: ${price.value}`);
  }

  const explicitSku = firstField(lines, ["sku", "SKU", "商品番号", "品番", "货号"]);
  const productId = firstField(lines, ["商品ID", "商品 id", "product id", "id"]);
  const titleField = firstField(lines, ["商品名", "商品タイトル", "日语标题", "日文标题", "标题", "title", "Title"]);
  const categoryField = firstField(lines, ["カテゴリ", "カテゴリー", "分类", "类目", "category"]);
  const materialField = firstField(lines, ["素材", "材质", "材料", "materials"]);
  const dimensionField = firstField(lines, ["サイズ", "尺寸", "规格", "重量", "dimensions"]);
  const sellingPointField = firstField(lines, ["卖点", "卖點", "selling points", "Selling points", "特徴", "特长", "特長"]);
  const usageField = firstField(lines, ["使用场景", "使用場景", "シーン", "场景", "scene", "usage"]);
  const forbiddenField = firstField(lines, ["禁止", "禁用", "未确认宣称", "未確認宣称", "未确认", "未確認", "forbidden"]);
  const imageField = firstField(lines, ["图片", "圖片", "画像", "参考图", "参考圖片", "images"]);

  const sku = explicitSku.value ?? (productId.value ? `DXM-${productId.value}` : makeSkuFromText(text));
  const colors = splitImportedList(firstField(lines, ["カラー", "颜色", "色", "color"]).value);
  const colorSellingPoint = colors ? `${colors.join("、")}の${colors.length}色展開` : undefined;
  if (colorSellingPoint) {
    notes.push(`颜色已转为可确认卖点: ${colorSellingPoint}`);
  }

  const explicitSellingPoints = splitImportedList(sellingPointField.value);
  const bulletSellingPoints = collectBulletSellingPoints(lines, [
    sellingPointField.lineIndex,
    usageField.lineIndex,
    forbiddenField.lineIndex,
    imageField.lineIndex
  ]);
  const { safeSellingPoints, riskyClaims } = splitSafeAndRiskyClaims([
    ...(explicitSellingPoints ?? []),
    ...bulletSellingPoints
  ]);
  for (const claim of riskyClaims) {
    notes.push(`疑似夸大或需证明的宣称已移入禁止宣称: ${claim}`);
  }

  const explicitForbiddenClaims = splitImportedList(forbiddenField.value);
  const explicitRiskyClaims = explicitForbiddenClaims?.filter((claim) => riskyClaimPatterns.some((pattern) => pattern.test(claim))) ?? [];
  const title = titleField.value ?? firstLikelyTitleLine(lines);
  if (!title || title === "未命名商品") {
    throw new Error("Imported product title is missing or invalid.");
  }
  const product = {
    sku,
    title_ja: title,
    category: normalizeCategory(categoryField.value) ?? "未分类",
    materials: splitImportedList(materialField.value) ?? ["材质未确认"],
    dimensions: dimensionField.value ?? "尺寸未确认",
    verified_selling_points: uniqueNonEmpty([
      ...safeSellingPoints,
      ...(colorSellingPoint ? [colorSellingPoint] : [])
    ]).slice(0, 8),
    usage_scenes: splitImportedList(usageField.value) ?? inferUsageScenes(categoryField.value, titleField.value),
    forbidden_claims: uniqueNonEmpty([
      ...(explicitForbiddenClaims ?? []),
      ...riskyClaims.map((claim) => `${claim}は証明未確認`)
    ]),
    reference_images: collectImageReferences(lines, imageField.value)
  };

  if (product.verified_selling_points.length === 0) {
    product.verified_selling_points = ["商品资料已导入，卖点待确认"];
  }

  const parsedProduct = parseProductFacts(product);
  return {
    product: parsedProduct,
    notes,
    quality: buildProductImportQuality({
      product: parsedProduct,
      price: price.value,
      riskyClaims: [
        ...riskyClaims,
        ...explicitRiskyClaims
      ]
    })
  };
}

export function buildProductImportQuality(input: {
  product: ProductFacts;
  price?: string;
  riskyClaims: string[];
}): ProductImportQuality {
  const missingFields = productMissingFields(input.product);
  const verifiedFacts = productVerifiedFacts(input.product);
  const blockedClaims = uniqueNonEmpty(input.riskyClaims);
  const warnings = productQualityWarnings({
    missingFields,
    blockedClaims,
    price: input.price
  });
  const score = Math.max(0, Math.round(100 - missingFields.length * 16.5));
  return {
    ready: missingFields.length === 0,
    score,
    summary: productQualitySummary(missingFields.length, blockedClaims.length),
    missingFields,
    verifiedFacts,
    blockedClaims,
    warnings
  };
}

function productMissingFields(product: ProductFacts): string[] {
  const fields: string[] = [];
  if (!product.title_ja.trim() || product.title_ja === "未命名商品") fields.push("标题");
  if (!product.category.trim() || product.category === "未分类") fields.push("分类");
  if (product.materials.length === 0 || product.materials.some((item) => item.includes("未确认"))) fields.push("材质");
  if (!product.dimensions.trim() || product.dimensions.includes("未确认")) fields.push("尺寸/重量");
  if (product.verified_selling_points.length === 0 || product.verified_selling_points.some((item) => item.includes("待确认"))) fields.push("已验证卖点");
  if (product.usage_scenes.length === 0) fields.push("使用场景");
  if (product.reference_images.length === 0 || product.reference_images.every((item) => item === "reference.jpg")) fields.push("参考图");
  return fields;
}

function productVerifiedFacts(product: ProductFacts): string[] {
  const facts: string[] = [];
  if (product.title_ja.trim() && product.title_ja !== "未命名商品") facts.push("标题");
  if (product.category.trim() && product.category !== "未分类") facts.push("分类");
  if (product.materials.length > 0 && product.materials.every((item) => !item.includes("未确认"))) facts.push("材质");
  if (product.dimensions.trim() && !product.dimensions.includes("未确认")) facts.push("尺寸/重量");
  if (product.verified_selling_points.length > 0 && product.verified_selling_points.every((item) => !item.includes("待确认"))) facts.push("已验证卖点");
  if (product.usage_scenes.length > 0) facts.push("使用场景");
  if (product.reference_images.length > 0 && product.reference_images.some((item) => item !== "reference.jpg")) facts.push("参考图");
  return facts;
}

function productQualityWarnings(input: {
  missingFields: string[];
  blockedClaims: string[];
  price?: string;
}): string[] {
  const warnings: string[] = [];
  if (input.price) {
    warnings.push("价格已识别但不写入商品资料，后续可在字幕/CTA 阶段单独管理。");
  }
  if (input.blockedClaims.length > 0) {
    warnings.push("存在未确认宣称，已放入禁止宣称，不会用于脚本或 prompt。");
  }
  if (input.missingFields.includes("材质")) {
    warnings.push("请补充材质，避免脚本描述商品手感或面料时编造。");
  }
  if (input.missingFields.includes("尺寸/重量")) {
    warnings.push("请补充尺寸/重量，避免生成脚本时编造大小、容量或便携性。");
  }
  if (input.missingFields.includes("参考图")) {
    warnings.push("请上传真实参考图，视频生成时才有商品外观约束。");
  }
  if (input.missingFields.includes("已验证卖点")) {
    warnings.push("请补充已验证卖点，否则脚本只能保守描述商品。");
  }
  return warnings;
}

function productQualitySummary(missingCount: number, blockedCount: number): string {
  if (missingCount === 0 && blockedCount === 0) {
    return "商品资料完整，可进入视频预检。";
  }
  if (missingCount === 0) {
    return `商品资料完整，已拦截 ${blockedCount} 条高风险宣称。`;
  }
  if (blockedCount === 0) {
    return `缺少 ${missingCount} 项关键信息。`;
  }
  return `缺少 ${missingCount} 项关键信息，已拦截 ${blockedCount} 条高风险宣称。`;
}

function firstField(lines: string[], labels: string[]): FieldReadResult {
  for (const [lineIndex, line] of lines.entries()) {
    for (const label of labels) {
      const escapedLabel = escapeRegExp(label);
      const match = line.match(new RegExp(`^${escapedLabel}(?:\\d+)?\\s*(?:[:：]|\\s)\\s*(.+)$`, "i"));
      if (match?.[1]?.trim()) {
        return {
          value: stripLeadingSeparators(match[1].trim()),
          lineIndex
        };
      }
    }
  }
  return {};
}

function stripLeadingSeparators(value: string): string {
  return value.replace(/^[：:\-_\s]+/, "").trim();
}

function firstLikelyTitleLine(lines: string[]): string | undefined {
  const nonTitleLabelPattern = /^(店铺名|店鋪名|店铺|店鋪|店舗|shop|販売価格|售价|价格|価格|price|カテゴリ|カテゴリー|分类|類目|类目|category|素材|材质|材質|材料|サイズ|尺寸|重量|カラー|颜色|色|主图|主圖|画像|图片|圖片|商品ID|产品ID|產品ID|使用场景|使用場景|シーン|场景|場景|usage|scene|卖点|賣點|販売ポイント|特徴|特长|特長|selling\s*points?|禁止|禁用|未确认|未確認|forbidden)(?:\s|[:：]|$)/i;
  return lines.find((line) => {
    if (nonTitleLabelPattern.test(line)) {
      return false;
    }
    if (/https?:\/\//i.test(line)) {
      return false;
    }
    return /[\u3040-\u30ff\u3400-\u9fff]/.test(line) && line.length <= 220;
  });
}

function collectBulletSellingPoints(lines: string[], stopLineIndexes: Array<number | undefined>): string[] {
  const stopIndexes = new Set(stopLineIndexes.filter((value): value is number => value !== undefined));
  const items: string[] = [];
  for (const [index, line] of lines.entries()) {
    if (stopIndexes.has(index)) {
      continue;
    }
    const match = line.match(/^[・\-*]\s*(.+)$/);
    if (match?.[1]?.trim()) {
      items.push(match[1].trim());
    }
  }
  return items;
}

function splitSafeAndRiskyClaims(items: string[]): { safeSellingPoints: string[]; riskyClaims: string[] } {
  const safeSellingPoints: string[] = [];
  const riskyClaims: string[] = [];
  for (const item of uniqueNonEmpty(items)) {
    if (riskyClaimPatterns.some((pattern) => pattern.test(item))) {
      riskyClaims.push(item);
    } else {
      safeSellingPoints.push(item);
    }
  }
  return { safeSellingPoints, riskyClaims };
}

function normalizeCategory(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const parts = value.split(/\s*(?:>|＞|\/)\s*/).map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) || value.trim();
}

function inferUsageScenes(category: string | undefined, title: string | undefined): string[] {
  const combined = `${category ?? ""} ${title ?? ""}`;
  if (/スポーツ|アーム|アウトドア|スリーブ|サポーター/.test(combined)) {
    return ["通勤", "屋外での移動", "スポーツ"];
  }
  if (/財布|バッグ|ポーチ/.test(combined)) {
    return ["買い物", "通勤", "旅行"];
  }
  return ["日常使用"];
}

function collectImageReferences(lines: string[], explicitImages: string | undefined): string[] {
  const candidates = lines.flatMap((line) => {
    const match = line.match(/^(?:主图|主圖|画像\d*|图片\d*|圖片\d*|参考图\d*|参考圖片\d*)\s*[:：]?\s*(.+)$/i);
    return match?.[1] ? splitImportedImageList(match[1]) ?? [] : [];
  });
  candidates.push(...extractImageUrls(lines.join("\n")));
  if (candidates.length === 0 && explicitImages) {
    candidates.push(...(splitImportedImageList(explicitImages) ?? []));
  }
  return uniqueImageReferences(candidates);
}

function extractImageUrls(value: string): string[] {
  const urls: string[] = [];
  const starts = Array.from(value.matchAll(/https?:\/\//gi)).map((match) => match.index ?? 0);
  for (const start of starts) {
    const candidate = readPossiblyWrappedImageUrl(value, start);
    if (candidate) {
      urls.push(candidate);
    }
  }
  return uniqueNonEmpty(urls);
}

function readPossiblyWrappedImageUrl(value: string, start: number): string | undefined {
  let candidate = "";
  let sawImageExtension = false;
  let sawQuery = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (!char || /["'<>、，,；;）)]/.test(char)) {
      break;
    }
    if (/\s/.test(char)) {
      const rest = value.slice(index);
      const nextNonWhitespace = rest.match(/\S/);
      if (!nextNonWhitespace) {
        break;
      }
      const nextIndex = index + nextNonWhitespace.index!;
      const next = value[nextIndex];
      const nextText = value.slice(nextIndex);
      if (/^https?:\/\//i.test(nextText)) {
        break;
      }
      const nextToken = nextText.split(/\s+/)[0] ?? "";
      if (!sawImageExtension || next === "?" || (sawQuery && isLikelyWrappedUrlQueryContinuation(nextToken))) {
        continue;
      }
      break;
    }
    candidate += char;
    if (/\.(?:jpe?g|png|webp|gif|avif)$/i.test(candidate.split("?")[0] ?? "")) {
      sawImageExtension = true;
    }
    if (sawImageExtension && char === "?") {
      sawQuery = true;
    }
  }
  const trimmed = candidate.replace(/[.。]+$/, "");
  return /\.(?:jpe?g|png|webp|gif|avif)(?:\?|$)/i.test(trimmed) ? trimmed : undefined;
}

function isLikelyWrappedUrlQueryContinuation(value: string): boolean {
  if (!value || /[:：]/.test(value)) {
    return false;
  }
  if (/^[&?][A-Za-z0-9_%=&./:-]+$/.test(value)) {
    return true;
  }
  if (/^[a-f0-9]{1,32}$/i.test(value)) {
    return true;
  }
  return /^[a-z0-9_%./-]{1,24}$/.test(value);
}

function splitImportedList(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const items = value
    .split(/\s*(?:\/|、|,|，|;|；|\n)\s*/)
    .map((item) => stripBullet(item.trim()))
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function splitImportedImageList(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const items = value
    .split(/\s*(?:、|,|，|;|；|\n)\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function stripBullet(value: string): string {
  return value.replace(/^[・\-*]\s*/, "").trim();
}

function makeSkuFromText(text: string): string {
  const compact = text.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 28);
  return compact || `IMPORTED-${Date.now()}`;
}

function uniqueNonEmpty(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function uniqueImageReferences(items: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const item of items.map((value) => value.trim()).filter(Boolean)) {
    const key = imageReferenceKey(item);
    const existing = byKey.get(key);
    if (!existing || imageReferenceScore(item) > imageReferenceScore(existing)) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values());
}

function imageReferenceKey(value: string): string {
  try {
    const url = new URL(value);
    const tiktokImageId = url.pathname.match(/\/([^/?]+)~tplv-[^/?]+?\.(?:jpe?g|png|webp)/i)?.[1];
    if (tiktokImageId) {
      return `${url.host}/${tiktokImageId}`;
    }
    url.search = "";
    url.hash = "";
    return url.toString().replace(/~tplv-[^/?]+(?=\.(?:jpe?g|png|webp))/i, "");
  } catch {
    return value.replace(/[?#].*$/, "");
  }
}

function imageReferenceScore(value: string): number {
  let score = 0;
  if (/origin/i.test(value)) score += 10;
  if (!/resize/i.test(value)) score += 2;
  return score;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
