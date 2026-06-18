export interface ProductDraft {
  sku: string;
  title_ja: string;
  category: string;
  materials: string;
  dimensions: string;
  verified_selling_points: string;
  usage_scenes: string;
  forbidden_claims: string;
  reference_images: string;
  source_text: string;
}

export const defaultProductDraft: ProductDraft = {
  sku: "",
  title_ja: "",
  category: "",
  materials: "",
  dimensions: "",
  verified_selling_points: "",
  usage_scenes: "",
  forbidden_claims: "",
  reference_images: "",
  source_text: ""
};

export function productDraftToComposerText(draft: ProductDraft): string {
  const sections = [
    ["标题", draft.title_ja],
    ["分类", draft.category],
    ["材质", draft.materials],
    ["尺寸/重量", draft.dimensions],
    ["卖点", draft.verified_selling_points],
    ["使用场景", draft.usage_scenes],
    ["不可用卖点", draft.forbidden_claims],
    ["参考图", draft.reference_images]
  ] as const;
  return sections
    .map(([label, value]) => `${label}：${value.trim()}`)
    .filter((line) => !line.endsWith("："))
    .join("\n\n");
}

export function isStructuredProductComposerText(value: string): boolean {
  return /(^|\n)\s*(标题|分类|材质|尺寸\/重量|卖点|使用场景|不可用卖点|参考图|图片|主图|画像)\s*[：:]/.test(value) ||
    extractImageUrls(value).length > 0;
}

export function productComposerTextToDraft(value: string, fallback: ProductDraft): ProductDraft {
  if (!isStructuredProductComposerText(value)) {
    return fallback;
  }
  const buckets: Partial<Record<keyof ProductDraft, string[]>> = {};
  let currentKey: keyof ProductDraft | undefined;
  const labelToKey: Record<string, keyof ProductDraft> = {
    "标题": "title_ja",
    "分类": "category",
    "材质": "materials",
    "尺寸/重量": "dimensions",
    "卖点": "verified_selling_points",
    "使用场景": "usage_scenes",
    "不可用卖点": "forbidden_claims",
    "参考图": "reference_images",
    "图片": "reference_images",
    "主图": "reference_images",
    "画像": "reference_images"
  };

  for (const rawLine of value.split(/\r?\n/)) {
    const imageUrls = extractImageUrls(rawLine);
    if (imageUrls.length > 0) {
      buckets.reference_images = [...(buckets.reference_images ?? []), ...imageUrls];
      if (currentKey === "reference_images") {
        continue;
      }
      continue;
    }
    const match = rawLine.match(/^\s*(标题|分类|材质|尺寸\/重量|卖点|使用场景|不可用卖点|参考图|图片|主图|画像)\s*[：:]\s*(.*)$/);
    if (match) {
      currentKey = labelToKey[match[1] ?? ""];
      if (currentKey) {
        buckets[currentKey] = splitReferenceText(match[2] ?? "");
      }
      continue;
    }
    if (currentKey && rawLine.trim()) {
      buckets[currentKey] = [...(buckets[currentKey] ?? []), rawLine.trim()];
      continue;
    }
  }

  const referenceImages = uniqueLines([
    ...splitLines(fallback.reference_images),
    ...(buckets.reference_images ?? []).flatMap(splitReferenceText)
  ]).join("\n");
  const bucketText = (key: keyof ProductDraft) => buckets[key]?.join("\n").trim();
  return {
    ...fallback,
    title_ja: bucketText("title_ja") ?? fallback.title_ja,
    category: bucketText("category") ?? fallback.category,
    materials: bucketText("materials") ?? fallback.materials,
    dimensions: bucketText("dimensions") ?? fallback.dimensions,
    verified_selling_points: bucketText("verified_selling_points") ?? fallback.verified_selling_points,
    usage_scenes: bucketText("usage_scenes") ?? fallback.usage_scenes,
    forbidden_claims: bucketText("forbidden_claims") ?? fallback.forbidden_claims,
    reference_images: referenceImages || fallback.reference_images,
    source_text: fallback.source_text
  };
}

function splitReferenceText(value: string): string[] {
  return value
    .split(/[,\n，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractImageUrls(value: string): string[] {
  return Array.from(value.matchAll(/https?:\/\/[^\s"'<>，,；;）)]+?\.(?:jpe?g|png|webp|gif|avif)(?:\?[^\s"'<>，,；;）)]*)?/gi)).map(
    (match) => match[0]
  );
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function uniqueLines(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
