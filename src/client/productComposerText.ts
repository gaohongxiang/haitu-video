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

export interface DraftReferenceImageStatus {
  original: string;
  resolvedPath: string;
  previewUrl: string | null;
  status: "previewable" | "missing" | "outside-project-root" | "remote";
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
  return /(^|\n)\s*(商品ID|商品名|商品名称|产品名称|标题|カテゴリ|分类|素材|材质|尺寸|尺寸\/重量|サイズ|规格选项|规格|卖点|商品説明|商品描述|描述|使用场景|不可用卖点|禁止|参考图|图片|主图|画像)\s*[：:]/.test(value) ||
    extractImageUrls(value).length > 0;
}

export function productComposerTextToDraft(value: string, fallback: ProductDraft): ProductDraft {
  if (!isStructuredProductComposerText(value)) {
    return fallback;
  }
  const buckets: Partial<Record<keyof ProductDraft, string[]>> = {};
  let currentKey: keyof ProductDraft | undefined;
  const passthroughLabels = new Set(["规格选项", "规格", "商品説明", "商品描述", "描述"]);
  const labelToKey: Record<string, keyof ProductDraft> = {
    "商品ID": "sku",
    "商品名": "title_ja",
    "商品名称": "title_ja",
    "产品名称": "title_ja",
    "标题": "title_ja",
    "カテゴリ": "category",
    "分类": "category",
    "素材": "materials",
    "材质": "materials",
    "尺寸": "dimensions",
    "尺寸/重量": "dimensions",
    "サイズ": "dimensions",
    "卖点": "verified_selling_points",
    "使用场景": "usage_scenes",
    "不可用卖点": "forbidden_claims",
    "禁止": "forbidden_claims",
    "参考图": "reference_images",
    "图片": "reference_images",
    "主图": "reference_images",
    "画像": "reference_images"
  };
  const supportedLabels = [...Object.keys(labelToKey), ...passthroughLabels]
    .map(escapeRegExp)
    .sort((left, right) => right.length - left.length)
    .join("|");
  const labelPattern = new RegExp(`^\\s*(${supportedLabels})\\s*[：:]\\s*(.*)$`);

  let hasReferenceInput = false;
  for (const rawLine of value.split(/\r?\n/)) {
    const imageUrls = extractImageUrls(rawLine);
    if (imageUrls.length > 0) {
      hasReferenceInput = true;
      buckets.reference_images = [...(buckets.reference_images ?? []), ...imageUrls];
      if (currentKey === "reference_images") {
        continue;
      }
      continue;
    }
    const match = rawLine.match(labelPattern);
    if (match) {
      if (passthroughLabels.has(match[1] ?? "")) {
        currentKey = undefined;
        continue;
      }
      currentKey = labelToKey[match[1] ?? ""];
      if (currentKey) {
        if (currentKey === "reference_images") {
          hasReferenceInput = true;
        }
        buckets[currentKey] = [
          ...(buckets[currentKey] ?? []),
          ...splitReferenceText(match[2] ?? "")
        ];
      }
      continue;
    }
    if (currentKey && rawLine.trim()) {
      buckets[currentKey] = [...(buckets[currentKey] ?? []), rawLine.trim()];
      continue;
    }
  }

  const referenceImages = hasReferenceInput
    ? uniqueLines((buckets.reference_images ?? []).flatMap(splitReferenceText)).join("\n")
    : fallback.reference_images;
  const bucketText = (key: keyof ProductDraft) => buckets[key]?.join("\n").trim();
  return {
    ...fallback,
    sku: bucketText("sku") ?? fallback.sku,
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function draftReferenceImageStatuses(draft: ProductDraft): DraftReferenceImageStatus[] {
  return splitLines(draft.reference_images).map((reference) => ({
    original: reference,
    resolvedPath: reference,
    previewUrl: isRemoteReference(reference) ? reference : null,
    status: isRemoteReference(reference) ? "remote" : "missing"
  }));
}

export function removeDraftReferenceImage(draft: ProductDraft, reference: string): ProductDraft {
  const nextReferences = splitLines(draft.reference_images).filter((item) => item !== reference);
  return {
    ...draft,
    reference_images: nextReferences.join("\n")
  };
}

export function removeReferenceFromComposerText(value: string, reference: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.includes(reference) ? line.replaceAll(reference, "").trim() : line)
    .filter((line) => line.trim())
    .join("\n");
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

function isRemoteReference(reference: string): boolean {
  return reference.startsWith("http://") || reference.startsWith("https://") || reference.startsWith("data:image/");
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
