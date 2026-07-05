import type { ProductDraft } from "./productComposerText.js";
import type { ProductDetail, ProductFactsResponse } from "./productWorkflowViewModel.js";

export interface ProductDraftFactsOptions {
  now?: number;
}

export function productDraftToProductDetail(draft: ProductDraft, options: ProductDraftFactsOptions = {}): ProductDetail {
  const facts = productDraftToFacts(draft, options);
  return {
    ...facts,
    path: "",
    referenceImageCount: facts.reference_images.length,
    importQuality: undefined,
    reference_image_statuses: []
  };
}

export function productDraftToPreviewProduct(draft: ProductDraft, options: ProductDraftFactsOptions = {}): ProductDetail {
  const sourceText = draft.source_text.trim();
  const title = draft.title_ja.trim() || previewTitleFromSourceText(sourceText) || "未命名商品";
  const materials = splitList(draft.materials);
  const verifiedSellingPoints = splitLines(draft.verified_selling_points);
  const usageScenes = splitLines(draft.usage_scenes);
  const facts: ProductFactsResponse = {
    sku: draft.sku.trim() || internalProductIdFromTitle(title, options.now),
    title_ja: title,
    category: draft.category.trim() || "not specified in source facts",
    materials: materials.length > 0 ? materials : ["not specified in source facts"],
    dimensions: draft.dimensions.trim() || "not specified in source facts",
    verified_selling_points: verifiedSellingPoints.length > 0
      ? verifiedSellingPoints
      : previewFactsFromSourceText(sourceText),
    usage_scenes: usageScenes.length > 0
      ? usageScenes
      : ["not specified in source facts; follow the user's requested scene"],
    forbidden_claims: splitLines(draft.forbidden_claims),
    reference_images: splitLines(draft.reference_images),
    source_text: sourceText || undefined
  };
  return {
    ...facts,
    path: "",
    referenceImageCount: facts.reference_images.length,
    importQuality: undefined,
    reference_image_statuses: []
  };
}

export function productDraftToFacts(draft: ProductDraft, options: ProductDraftFactsOptions = {}): ProductFactsResponse {
  return {
    sku: draft.sku.trim() || internalProductIdFromTitle(draft.title_ja, options.now),
    title_ja: draft.title_ja.trim(),
    category: draft.category.trim(),
    materials: splitList(draft.materials),
    dimensions: draft.dimensions.trim(),
    verified_selling_points: splitLines(draft.verified_selling_points),
    usage_scenes: splitLines(draft.usage_scenes),
    forbidden_claims: splitLines(draft.forbidden_claims),
    reference_images: splitLines(draft.reference_images),
    source_text: draft.source_text.trim() || undefined
  };
}

export function internalProductIdFromTitle(title: string, now = Date.now()): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = normalized || "product";
  return `ITEM-${base.slice(0, 28)}-${now.toString(36)}`;
}

export function productFactsToDraft(product: ProductFactsResponse): ProductDraft {
  return {
    sku: product.sku,
    title_ja: product.title_ja,
    category: product.category,
    materials: product.materials.join("、"),
    dimensions: product.dimensions,
    verified_selling_points: product.verified_selling_points.join("\n"),
    usage_scenes: product.usage_scenes.join("\n"),
    forbidden_claims: product.forbidden_claims.join("\n"),
    reference_images: product.reference_images.join("\n"),
    source_text: product.source_text ?? ""
  };
}

export function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function splitList(value: string): string[] {
  return value
    .split(/[、,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function previewTitleFromSourceText(sourceText: string): string {
  const firstLine = splitLines(sourceText)[0] ?? "";
  return firstLine
    .replace(/^\s*(商品ID|商品id|标题|商品名|商品名称|产品名称|商品タイトル|title)\s*[：:]\s*/i, "")
    .trim();
}

function previewFactsFromSourceText(sourceText: string): string[] {
  const lines = splitLines(sourceText)
    .map((line) => line.replace(/^\s*(卖点|特徴|特長|商品説明|商品描述|描述)\s*[：:]\s*/i, "").trim())
    .filter(Boolean)
    .slice(0, 8);
  return lines.length > 0 ? lines : ["not specified in source facts; preserve only visible product details"];
}
