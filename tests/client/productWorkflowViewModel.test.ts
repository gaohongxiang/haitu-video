import { describe, expect, it } from "vitest";

import {
  dedupeProductSummaries,
  fileImportCanSelect,
  fileImportProductIdLabel,
  fileImportRowLabel,
  fileImportRowTone,
  fileImportSourceRowsLabel,
  isProductImportFile,
  productActionSummary,
  productAutoSaveStatusLabel,
  productFactsStatusLabel,
  productGenerationReadiness,
  productReferenceCount,
  storyboardStatusLabel,
  type ProductDetail,
  type ProductFileImportRow,
  type ProductSummary
} from "../../src/client/productWorkflowViewModel.js";

function productSummary(overrides: Partial<ProductSummary>): ProductSummary {
  return {
    path: overrides.path ?? "products/item.json",
    sku: overrides.sku ?? "SKU-1",
    title_ja: overrides.title_ja ?? "商品",
    ...overrides
  };
}

function productDetail(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    ...productSummary(overrides),
    category: overrides.category ?? "カテゴリ",
    materials: overrides.materials ?? [],
    dimensions: overrides.dimensions ?? "",
    verified_selling_points: overrides.verified_selling_points ?? [],
    usage_scenes: overrides.usage_scenes ?? [],
    forbidden_claims: overrides.forbidden_claims ?? [],
    reference_images: overrides.reference_images ?? [],
    ...overrides
  };
}

function importRow(overrides: Partial<ProductFileImportRow>): ProductFileImportRow {
  return {
    rowId: overrides.rowId ?? "row-1",
    rowNumber: overrides.rowNumber ?? 1,
    sourceRowNumbers: overrides.sourceRowNumbers ?? [overrides.rowNumber ?? 1],
    status: overrides.status ?? "ready",
    raw: overrides.raw ?? {},
    sourceText: overrides.sourceText ?? "",
    notes: overrides.notes ?? [],
    warnings: overrides.warnings ?? [],
    duplicate: overrides.duplicate ?? false,
    referenceImageCount: overrides.referenceImageCount ?? 0,
    quality: overrides.quality ?? {
      ready: true,
      score: 80,
      summary: "ok",
      missingFields: [],
      verifiedFacts: [],
      blockedClaims: [],
      warnings: []
    },
    ...overrides
  };
}

describe("product workflow view-model helpers", () => {
  it("counts references from detailed status, detailed paths, or summary counts", () => {
    expect(productReferenceCount(productDetail({
      reference_image_statuses: [
        { original: "a.jpg", resolvedPath: "a.jpg", previewUrl: null, status: "missing" },
        { original: "b.jpg", resolvedPath: "b.jpg", previewUrl: "/media/b.jpg", status: "previewable" }
      ],
      reference_images: ["fallback.jpg"],
      referenceImageCount: 9
    }))).toBe(2);
    expect(productReferenceCount(productDetail({ reference_images: ["a.jpg", "b.jpg"] }))).toBe(2);
    expect(productReferenceCount(productSummary({ referenceImageCount: 3 }))).toBe(3);
    expect(productReferenceCount()).toBe(0);
  });

  it("dedupes products by identity and keeps the most complete summary", () => {
    const low = productSummary({
      path: "products/old.json",
      sku: " SKU-1 ",
      title_ja: "旧",
      referenceImageCount: 1
    });
    const high = productSummary({
      path: "products/new.json",
      sku: "sku-1",
      title_ja: "新",
      referenceImageCount: 3,
      importQuality: { ready: true, score: 90, summary: "good", missingFields: [], verifiedFacts: [], blockedClaims: [], warnings: [] },
      paidReadiness: { readyForPaidGeneration: true, blockingReasons: [], warnings: [] }
    });
    const pathOnly = productSummary({ path: "products/path-only.json", sku: "", title_ja: "パスのみ" });

    expect(dedupeProductSummaries([low, high, pathOnly])).toEqual([high, pathOnly]);
  });

  it("builds action summaries from detailed products without losing existing list metadata", () => {
    const detail = productDetail({
      path: "products/detail.json",
      sku: "SKU-DETAIL",
      title_ja: "詳細",
      reference_images: ["a.jpg", "b.jpg"]
    });
    const existing = productSummary({ path: "products/existing.json", sku: "SKU-DETAIL", title_ja: "既存", referenceImageCount: 8 });

    expect(productActionSummary(detail, existing)).toBe(existing);
    expect(productActionSummary(detail)).toMatchObject({
      path: "products/detail.json",
      sku: "SKU-DETAIL",
      title_ja: "詳細",
      referenceImageCount: 2
    });
  });

  it("keeps import-row labels, tones, selection, source rows, and product id extraction stable", () => {
    const selectable = importRow({
      sourceRowNumbers: [4, 5, 6],
      raw: { "全球产品ID": "  GP-100  " },
      product: productDetail({ sku: "SKU-FALLBACK" })
    });

    expect(fileImportCanSelect(selectable)).toBe(true);
    expect(fileImportSourceRowsLabel(selectable)).toBe("4-6 (3 行)");
    expect(fileImportProductIdLabel(selectable)).toBe("GP-100");
    expect(fileImportRowLabel("ready")).toBe("未导入");
    expect(fileImportRowLabel("ready", "en")).toBe("Not imported");
    expect(fileImportRowLabel("duplicate")).toBe("已导入");
    expect(fileImportSourceRowsLabel(selectable, "en")).toBe("4-6 (3 rows)");
    expect(fileImportRowTone("ready")).toBe("ok");
    expect(fileImportRowTone("needs-ai")).toBe("warn");
    expect(fileImportRowTone("failed")).toBe("danger");
    expect(fileImportCanSelect(importRow({ status: "duplicate", product: productDetail() }))).toBe(false);
    expect(fileImportProductIdLabel(importRow({ raw: {}, product: productDetail({ sku: "SKU-FALLBACK" }) }))).toBe("SKU-FALLBACK");
  });

  it("keeps product and storyboard status labels stable", () => {
    expect(productGenerationReadiness({ selectedProduct: undefined, importText: "" })).toEqual({
      ready: false,
      label: "请先填写商品资料。"
    });
    expect(productGenerationReadiness({ selectedProduct: undefined, importText: "", locale: "en" })).toEqual({
      ready: false,
      label: "Fill in product facts first."
    });
    expect(productGenerationReadiness({ selectedProduct: productDetail(), importText: "" })).toEqual({
      ready: true,
      label: "资料已保存，可生成视频。"
    });
    expect(productFactsStatusLabel({ selectedProduct: undefined, importText: "商品资料" })).toBe("原始资料");
    expect(productFactsStatusLabel({ selectedProduct: undefined, importText: "商品资料", locale: "en" })).toBe("Raw facts");
    expect(productFactsStatusLabel({ selectedProduct: productDetail(), importText: "" })).toBe("已整理资料包");
    expect(productAutoSaveStatusLabel("saving")).toBe("保存中");
    expect(productAutoSaveStatusLabel("saving", "en")).toBe("Saving");
    expect(productAutoSaveStatusLabel("idle")).toBe("");
    expect(storyboardStatusLabel("ai")).toBe("AI 优化提示词");
    expect(storyboardStatusLabel("ai", "en")).toBe("AI prompt");
    expect(storyboardStatusLabel("manual")).toBe("手动提示词");
  });

  it("detects supported product import files by extension", () => {
    expect(isProductImportFile({ name: "products.csv" })).toBe(true);
    expect(isProductImportFile({ name: "products.XLSX" })).toBe(true);
    expect(isProductImportFile({ name: "notes.txt" })).toBe(false);
  });
});
