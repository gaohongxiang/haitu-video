export type ProductAutoSaveStatus = "idle" | "dirty" | "saving" | "saved" | "failed";
export type StoryboardDraftSource = "default" | "ai" | "manual";
export type ProductFileImportRowStatus = "ready" | "needs-ai" | "needs-input" | "duplicate" | "failed";

export interface ProductImportQuality {
  ready: boolean;
  score: number;
  summary: string;
  missingFields: string[];
  verifiedFacts: string[];
  blockedClaims: string[];
  warnings: string[];
}

export interface ProductSummary {
  path: string;
  sku: string;
  title_ja: string;
  referenceImageCount?: number;
  importQuality?: ProductImportQuality;
  paidReadiness?: {
    readyForPaidGeneration: boolean;
    blockingReasons: string[];
    warnings: string[];
  };
}

export interface ReferenceImageStatus {
  original: string;
  resolvedPath: string;
  previewUrl: string | null;
  status: "previewable" | "missing" | "outside-project-root" | "remote";
}

export interface ProductDetail extends ProductSummary {
  category: string;
  materials: string[];
  dimensions: string;
  verified_selling_points: string[];
  usage_scenes: string[];
  forbidden_claims: string[];
  reference_images: string[];
  source_text?: string;
  reference_image_statuses?: ReferenceImageStatus[];
}

export type ProductFactsResponse = Omit<ProductDetail, "path" | "reference_image_statuses" | "reference_image_urls">;

export interface ProductFileImportRow {
  rowId: string;
  rowNumber: number;
  sourceRowNumbers: number[];
  status: ProductFileImportRowStatus;
  raw: Record<string, string>;
  sourceText: string;
  notes: string[];
  warnings: string[];
  duplicate: boolean;
  referenceImageCount: number;
  product?: ProductFactsResponse;
  quality: ProductImportQuality;
  error?: string;
}

export function productReferenceCount(product?: ProductSummary | ProductDetail): number {
  if (!product) return 0;
  if ("reference_image_statuses" in product && product.reference_image_statuses) {
    return product.reference_image_statuses.length;
  }
  if ("reference_images" in product) {
    return product.reference_images.length;
  }
  return product.referenceImageCount ?? 0;
}

export function isProductImportFile(file: { name: string }): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls");
}

export function fileImportRowLabel(status: ProductFileImportRowStatus): string {
  const labels: Record<ProductFileImportRowStatus, string> = {
    ready: "未导入",
    "needs-ai": "未导入",
    "needs-input": "不可导入",
    duplicate: "已导入",
    failed: "不可导入"
  };
  return labels[status];
}

export function fileImportCanSelect(row: ProductFileImportRow): boolean {
  return Boolean(row.product) && row.status !== "failed" && row.status !== "needs-input" && row.status !== "duplicate";
}

export function fileImportSourceRowsLabel(row: ProductFileImportRow): string {
  const rows = row.sourceRowNumbers?.length ? row.sourceRowNumbers : [row.rowNumber];
  if (rows.length === 1) {
    return String(rows[0]);
  }
  return `${rows[0]}-${rows[rows.length - 1]} (${rows.length} 行)`;
}

export function fileImportProductIdLabel(row: ProductFileImportRow): string {
  const productId = Object.entries(row.raw).find(([header, value]) =>
    /^(商品ID|商品id|产品ID|產品ID|产品id|產品id|全球产品ID|全球產品ID|product\s*id|global\s*product\s*id|id|ID)$/i.test(header.trim()) &&
    value.trim()
  )?.[1];
  return productId?.trim() || row.product?.sku || "-";
}

export function fileImportRowTone(status: ProductFileImportRowStatus): "neutral" | "ok" | "warn" | "danger" {
  if (status === "ready") return "ok";
  if (status === "failed" || status === "needs-input") return "danger";
  if (status === "needs-ai" || status === "duplicate") return "warn";
  return "neutral";
}

export function productGenerationReadiness({
  selectedProduct,
  importText
}: {
  selectedProduct?: ProductDetail;
  importText: string;
}): { ready: boolean; label: string } {
  if (selectedProduct) {
    return { ready: true, label: "资料已保存，可生成视频。" };
  }
  if (!importText.trim()) {
    return { ready: false, label: "请先填写商品资料。" };
  }
  return { ready: true, label: "将先整理资料包，再生成视频。" };
}

export function productFactsStatusLabel({
  selectedProduct,
  importText
}: {
  selectedProduct?: ProductDetail;
  importText: string;
}): string {
  if (!selectedProduct) {
    if (importText.trim()) {
      return "原始资料";
    }
    return "未填资料";
  }
  return "已整理资料包";
}

export function productAutoSaveStatusLabel(status: ProductAutoSaveStatus): string {
  if (status === "saving") {
    return "保存中";
  }
  if (status === "saved") {
    return "已保存";
  }
  if (status === "failed") {
    return "保存失败";
  }
  return "";
}

export function storyboardStatusLabel(storyboardDraftSource: StoryboardDraftSource): string {
  if (storyboardDraftSource === "default") {
    return "默认分镜";
  }
  if (storyboardDraftSource === "ai") {
    return "AI 生成分镜";
  }
  return "手动分镜";
}

export function dedupeProductSummaries(products: ProductSummary[]): ProductSummary[] {
  const byIdentity = new Map<string, ProductSummary>();
  for (const product of products) {
    const identity = productIdentityKey(product);
    const existing = byIdentity.get(identity);
    if (!existing || productSummaryCompleteness(product) > productSummaryCompleteness(existing)) {
      byIdentity.set(identity, product);
    }
  }
  return Array.from(byIdentity.values());
}

export function productIdentityKey(product: ProductSummary): string {
  const sku = product.sku.trim().toLowerCase();
  if (sku) return `sku:${sku}`;
  const path = product.path.trim().toLowerCase();
  if (path) return `path:${path}`;
  return `title:${product.title_ja.trim().toLowerCase()}`;
}

export function productSummaryCompleteness(product: ProductSummary): number {
  return productReferenceCount(product) * 100 +
    (product.importQuality?.score ?? 0) +
    (product.paidReadiness?.readyForPaidGeneration ? 10 : 0);
}

export function productActionSummary(product: ProductDetail, summary?: ProductSummary): ProductSummary {
  return summary ?? {
    path: product.path,
    sku: product.sku,
    title_ja: product.title_ja,
    referenceImageCount: productReferenceCount(product),
    importQuality: product.importQuality,
    paidReadiness: product.paidReadiness
  };
}
