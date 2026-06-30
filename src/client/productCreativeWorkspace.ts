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

export type ProductCreativeAssetLedgerItemId = "visual-asset-pool" | "image-output-records" | "video-versions";

export interface ProductCreativeAssetLedgerItem {
  id: ProductCreativeAssetLedgerItemId;
  label: string;
  count: number;
  unit: string;
  role: string;
  detail: string;
  reusableBy: ProductCreativeWorkspaceMode[];
}

export interface ProductCreativePromptCompilerStep {
  id: "product-memory" | "visual-assets" | "creative-intent" | "model-prompt";
  label: string;
  detail: string;
}

export interface ProductCreativePromptPipeline {
  title: string;
  inputSource: string;
  optimizer: {
    label: string;
    detail: string;
  };
  output: {
    label: string;
    detail: string;
  };
}

export interface ProductCreativePrimaryAction {
  mode: ProductCreativeWorkspaceMode;
  label: string;
  disabled: boolean;
  reason?: string;
}

export interface ProductCreativeArchitectureLane {
  id: "product-memory" | "visual-assets" | "creative-intent" | "model-output";
  title: string;
  detail: string;
  items: string[];
}

export interface ProductCreativeWorkspace {
  mode: ProductCreativeWorkspaceMode;
  productCount: number;
  selectedProductTitle: string;
  selectedProductSku?: string;
  assetSummary: ProductCreativeAssetSummary;
  assetLedger: ProductCreativeAssetLedgerItem[];
  memoryChips: ProductCreativeMemoryChip[];
  architectureLanes: ProductCreativeArchitectureLane[];
  promptCompilerSteps: ProductCreativePromptCompilerStep[];
  promptPipeline: ProductCreativePromptPipeline;
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

export function buildProductCreativeWorkspace(input: ProductCreativeWorkspaceInput): ProductCreativeWorkspace {
  const factsCount = input.selectedProduct?.verified_selling_points.length ?? 0;
  const referenceImages = productReferenceImageCount(input.selectedProduct);
  const blockedClaims = input.selectedProduct?.forbidden_claims.length ?? 0;
  const qualityScore = input.selectedProduct?.importQuality?.score ?? 0;
  const hasCreationSubject = Boolean(input.selectedProduct || input.draftTitle?.trim());
  const selectedProductTitle = input.selectedProduct?.title_ja || input.draftTitle?.trim() || "新商品";
  const summary = {
    factsCount,
    referenceImages,
    blockedClaims,
    imageAssetCount: Math.max(0, input.imageAssetCount),
    generatedVideoCount: Math.max(0, input.generatedVideoCount)
  };

  return {
    mode: input.mode,
    productCount: input.products.length,
    selectedProductTitle,
    selectedProductSku: input.selectedProduct?.sku,
    assetSummary: {
      referenceImages,
      imageAssets: summary.imageAssetCount,
      videoVersions: summary.generatedVideoCount
    },
    assetLedger: assetLedgerForSummary(summary),
    memoryChips: [
      { kind: "facts", label: "可用事实", value: String(factsCount) },
      { kind: "references", label: "参考图", value: String(referenceImages) },
      { kind: "blocked", label: "禁用宣称", value: String(blockedClaims) },
      { kind: "quality", label: "资料评分", value: String(qualityScore) }
    ],
    architectureLanes: architectureLanesForMode(input.mode, summary),
    promptCompilerSteps: promptCompilerStepsForMode(input.mode, summary),
    promptPipeline: promptPipelineForMode(input.mode),
    primaryAction: primaryActionForMode(input.mode, hasCreationSubject)
  };
}

function assetLedgerForSummary(summary: {
  referenceImages: number;
  imageAssetCount: number;
  generatedVideoCount: number;
}): ProductCreativeAssetLedgerItem[] {
  return [
    {
      id: "visual-asset-pool",
      label: "视觉资产池",
      count: summary.referenceImages,
      unit: "张",
      role: "商品级共享资产",
      detail: "当前存储于参考图列表，作为图片优化和视频生成的共同视觉约束",
      reusableBy: ["image", "video"]
    },
    {
      id: "image-output-records",
      label: "图片输出记录",
      count: summary.imageAssetCount,
      unit: "个",
      role: "独立图片账本预留",
      detail: "后续独立记录主图、场景图、细节图版本；当前不与参考图重复计数",
      reusableBy: ["image"]
    },
    {
      id: "video-versions",
      label: "视频版本",
      count: summary.generatedVideoCount,
      unit: "个",
      role: "视频模块输出",
      detail: "成片、分镜和投放版本沉淀回商品历史",
      reusableBy: ["video"]
    }
  ];
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

function architectureLanesForMode(
  mode: ProductCreativeWorkspaceMode,
  summary: {
    factsCount: number;
    referenceImages: number;
    blockedClaims: number;
    imageAssetCount: number;
    generatedVideoCount: number;
  }
): ProductCreativeArchitectureLane[] {
  const outputTitle = mode === "image" ? "图片输出" : "视频输出";
  const outputItems = mode === "image"
    ? [`${summary.imageAssetCount} 个图片资产`, "主图 / 场景图 / 细节图", "沉淀回商品资产"]
    : [`${summary.generatedVideoCount} 个视频版本`, "分镜 / 动作 / 字幕", "沉淀回商品资产"];
  return [
    {
      id: "product-memory",
      title: "商品源数据",
      detail: "事实、约束和禁用宣称先被保存为可复用商品记忆。",
      items: [`${summary.factsCount} 条可用事实`, `${summary.blockedClaims} 条禁用宣称`, "商品标题与类目"]
    },
    {
      id: "visual-assets",
      title: "视觉资产",
      detail: "当前商品图片统一在视觉资产池中约束商品外观，图片和视频共同复用。",
      items: [`${summary.referenceImages} 个视觉资产`, `${summary.imageAssetCount} 个图片输出记录`, `${summary.generatedVideoCount} 个视频版本`]
    },
    {
      id: "creative-intent",
      title: "创作意图",
      detail: mode === "image" ? "把商品目标转换成图片场景、构图、修图要求。" : "把商品目标转换成视频类型、节奏、比例和语言。",
      items: mode === "image" ? ["图片目标", "构图与场景", "质量控制"] : ["视频类型", "分镜节奏", "语言与比例"]
    },
    {
      id: "model-output",
      title: outputTitle,
      detail: "模型提示词是编译结果，不是商品事实源头。",
      items: outputItems
    }
  ];
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

function promptPipelineForMode(mode: ProductCreativeWorkspaceMode): ProductCreativePromptPipeline {
  if (mode === "image") {
    return {
      title: "图片提示词编译契约",
      inputSource: "商品记忆 + 视觉资产池 + 创作意图",
      optimizer: {
        label: "AI 可选优化层",
        detail: "只优化画面表达、构图和模型格式，不改写商品事实或禁用宣称"
      },
      output: {
        label: "图片模型 Payload",
        detail: "图片输入包含主体、场景、构图、细节约束和参考资产"
      }
    };
  }

  return {
    title: "视频提示词编译契约",
    inputSource: "商品记忆 + 视觉资产池 + 创作意图",
    optimizer: {
      label: "AI 可选优化层",
      detail: "只优化表达、镜头和模型格式，不改写商品事实或禁用宣称"
    },
    output: {
      label: "视频模型 Payload",
      detail: "Seedance 输入包含镜头、动作、节奏、比例、语言和参考资产"
    }
  };
}
