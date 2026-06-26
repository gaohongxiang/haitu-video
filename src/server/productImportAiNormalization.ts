import {
  cleanImportedProductText,
  riskyClaimPatterns
} from "../core/productImportCleaner.js";

export function normalizeAiProductFacts(input: unknown, sourceText: string): unknown {
  const fallback = cleanImportedProductText(sourceText).product;
  const raw = isPlainObject(input) ? input : {};
  const aiVerifiedSellingPoints = textListFromAiValue(raw.verified_selling_points, fallback.verified_selling_points);
  const aiForbiddenClaims = textListFromAiValue(raw.forbidden_claims, fallback.forbidden_claims);
  const normalizedClaims = normalizeAiClaims({
    verifiedSellingPoints: aiVerifiedSellingPoints,
    forbiddenClaims: aiForbiddenClaims,
    fallbackVerifiedSellingPoints: fallback.verified_selling_points,
    sourceText
  });
  return {
    sku: textFromAiValue(raw.sku) || fallback.sku,
    title_ja: textFromAiValue(raw.title_ja) || fallback.title_ja,
    category: textFromAiValue(raw.category) || fallback.category,
    materials: textListFromAiValue(raw.materials, fallback.materials),
    dimensions: dimensionTextFromAiValue(raw.dimensions) || fallback.dimensions,
    verified_selling_points: normalizedClaims.verifiedSellingPoints,
    usage_scenes: textListFromAiValue(raw.usage_scenes, fallback.usage_scenes),
    forbidden_claims: normalizedClaims.forbiddenClaims,
    reference_images: referenceImagesFromAiValue(raw.reference_images, fallback.reference_images, sourceText),
    source_text: sourceText
  };
}

function normalizeAiClaims(input: {
  verifiedSellingPoints: string[];
  forbiddenClaims: string[];
  fallbackVerifiedSellingPoints: string[];
  sourceText: string;
}): { verifiedSellingPoints: string[]; forbiddenClaims: string[] } {
  const verifiedSellingPoints = [...input.verifiedSellingPoints];
  const forbiddenClaims: string[] = [];
  for (const claim of input.forbiddenClaims) {
    if (isRiskyProductClaim(claim) || claimMarkedUnverified(claim)) {
      forbiddenClaims.push(claim);
      continue;
    }
    if (input.sourceText.includes(claim)) {
      verifiedSellingPoints.push(claim);
    }
  }
  return {
    verifiedSellingPoints: uniqueTextItems([
      ...verifiedSellingPoints,
      ...input.fallbackVerifiedSellingPoints.filter((point) => !point.includes("待确认"))
    ]),
    forbiddenClaims: uniqueTextItems(forbiddenClaims)
  };
}

function isRiskyProductClaim(claim: string): boolean {
  return riskyClaimPatterns.some((pattern) => pattern.test(claim));
}

function claimMarkedUnverified(claim: string): boolean {
  return /未确认|未確認|証明未確認|根拠なし|证据不足|エビデンスなし/.test(claim);
}

function referenceImagesFromAiValue(value: unknown, fallback: string[], sourceText: string): string[] {
  const references = textListFromAiValue(value, fallback);
  return references.filter((reference) => sourceText.includes(reference));
}

function textListFromAiValue(value: unknown, fallback: string[]): string[] {
  const items = Array.isArray(value) ? value : [value];
  const normalized = items
    .flatMap((item) => textFromAiValue(item).split(/[、,\n]/))
    .map((item) => item.trim())
    .filter(Boolean);
  return normalized.length > 0 ? uniqueTextItems(normalized) : fallback;
}

function uniqueTextItems(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function dimensionTextFromAiValue(value: unknown): string {
  if (isPlainObject(value)) {
    const preferredKeys = ["text", "value", "label", "size", "length", "width", "height", "weight", "wrist"];
    return preferredKeys
      .map((key) => textFromAiValue(value[key]))
      .filter(Boolean)
      .join("、");
  }
  return textFromAiValue(value);
}

function textFromAiValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(textFromAiValue).filter(Boolean).join("、");
  }
  if (isPlainObject(value)) {
    const preferredKeys = ["text", "name", "value", "label", "url", "path", "claim", "scene", "description", "size", "length", "width", "height", "weight", "ratio", "wrist"];
    const preferred = preferredKeys
      .map((key) => textFromAiValue(value[key]))
      .filter(Boolean);
    if (preferred.length > 0) {
      return preferred.join(" ");
    }
    return Object.values(value).map(textFromAiValue).filter(Boolean).join(" ");
  }
  return "";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
