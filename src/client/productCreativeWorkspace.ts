import type { ProductDetail, ProductSummary } from "./productWorkflowViewModel.js";

export type ProductCreativeWorkspaceMode = "image" | "video";

export type ProductCreativeMemoryChipKind = "facts" | "references" | "blocked" | "quality";

export interface ProductCreativeMemoryChip {
  kind: ProductCreativeMemoryChipKind;
  label: string;
  value: string;
}

export interface ProductCreativeAssetSummary {
  referenceImages: number;
  imageAssets: number;
  videoVersions: number;
}

export interface ProductCreativePromptCompilerStep {
  id: "product-memory" | "visual-assets" | "creative-intent" | "model-prompt";
  label: string;
  detail: string;
}

export interface ProductCreativePrimaryAction {
  mode: ProductCreativeWorkspaceMode;
  label: string;
  disabled: boolean;
  reason?: string;
}

export interface ProductCreativeWorkspace {
  mode: ProductCreativeWorkspaceMode;
  productCount: number;
  selectedProductTitle: string;
  selectedProductSku?: string;
  assetSummary: ProductCreativeAssetSummary;
  memoryChips: ProductCreativeMemoryChip[];
  promptCompilerSteps: ProductCreativePromptCompilerStep[];
  primaryAction: ProductCreativePrimaryAction;
}

export interface ProductCreativeWorkspaceInput {
  mode: ProductCreativeWorkspaceMode;
  products: ProductSummary[];
  selectedProduct?: ProductDetail;
  draftTitle?: string;
  generatedVideoCount: number;
  imageAssetCount: number;
}

export function productCreativeWorkspaceModeLabel(mode: ProductCreativeWorkspaceMode): string {
  return mode === "image" ? "图片工作台" : "视频工作台";
}

export function buildProductCreativeWorkspace(input: ProductCreativeWorkspaceInput): ProductCreativeWorkspace {
  const factsCount = input.selectedProduct?.verified_selling_points.length ?? 0;
  const referenceImages = productReferenceImageCount(input.selectedProduct);
  const blockedClaims = input.selectedProduct?.forbidden_claims.length ?? 0;
  const qualityScore = input.selectedProduct?.importQuality?.score ?? 0;
  const hasCreationSubject = Boolean(input.selectedProduct || input.draftTitle?.trim());
  const selectedProductTitle = input.selectedProduct?.title_ja || input.draftTitle?.trim() || "新商品";

  return {
    mode: input.mode,
    productCount: input.products.length,
    selectedProductTitle,
    selectedProductSku: input.selectedProduct?.sku,
    assetSummary: {
      referenceImages,
      imageAssets: Math.max(0, input.imageAssetCount),
      videoVersions: Math.max(0, input.generatedVideoCount)
    },
    memoryChips: [
      { kind: "facts", label: "可用事实", value: String(factsCount) },
      { kind: "references", label: "参考图", value: String(referenceImages) },
      { kind: "blocked", label: "禁用宣称", value: String(blockedClaims) },
      { kind: "quality", label: "资料评分", value: String(qualityScore) }
    ],
    promptCompilerSteps: promptCompilerStepsForMode(input.mode, {
      factsCount,
      referenceImages,
      blockedClaims
    }),
    primaryAction: primaryActionForMode(input.mode, hasCreationSubject)
  };
}

function productReferenceImageCount(product?: ProductDetail): number {
  if (!product) return 0;
  if (product.reference_image_statuses?.length) {
    return product.reference_image_statuses.length;
  }
  return product.reference_images.length;
}

function primaryActionForMode(mode: ProductCreativeWorkspaceMode, enabled: boolean): ProductCreativePrimaryAction {
  return {
    mode,
    label: mode === "image" ? "优化商品图片" : "生成商品视频",
    disabled: !enabled,
    reason: enabled ? undefined : "先填写或选择一个商品"
  };
}

function promptCompilerStepsForMode(
  mode: ProductCreativeWorkspaceMode,
  summary: { factsCount: number; referenceImages: number; blockedClaims: number }
): ProductCreativePromptCompilerStep[] {
  const outputLabel = mode === "image" ? "图片提示词" : "视频提示词";
  const outputDetail = mode === "image"
    ? "生成主图、场景图、细节图或修图指令"
    : "生成镜头、动作、节奏、字幕和 Seedance 输入";
  return [
    {
      id: "product-memory",
      label: "商品记忆",
      detail: `${summary.factsCount} 条可用事实，${summary.blockedClaims} 条禁用宣称`
    },
    {
      id: "visual-assets",
      label: "视觉资产",
      detail: `${summary.referenceImages} 张参考图作为商品外观和细节约束`
    },
    {
      id: "creative-intent",
      label: "创作意图",
      detail: mode === "image" ? "主图、场景图、局部修复或风格统一" : "视频类型、时长、比例、目标语言和分镜"
    },
    {
      id: "model-prompt",
      label: outputLabel,
      detail: outputDetail
    }
  ];
}
