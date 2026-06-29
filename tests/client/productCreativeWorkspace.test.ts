import { describe, expect, it } from "vitest";

import {
  buildProductCreativeWorkspace,
  productCreativeWorkspaceModeLabel,
  type ProductCreativeWorkspaceMode
} from "../../src/client/productCreativeWorkspace.js";
import type { ProductDetail, ProductSummary } from "../../src/client/productWorkflowViewModel.js";

const product: ProductDetail = {
  path: "products/storage-box.json",
  sku: "SKU-BOX-01",
  title_ja: "折りたたみ収納ボックス",
  category: "収納",
  materials: ["PP"],
  dimensions: "40 x 30 x 20 cm",
  verified_selling_points: ["折りたためる", "省スペース", "水拭きできる"],
  usage_scenes: ["キッチン", "クローゼット"],
  forbidden_claims: ["耐荷重100kg", "永久保証"],
  reference_images: ["refs/front.jpg", "refs/detail.jpg", "refs/scene.jpg"],
  reference_image_statuses: [
    { original: "refs/front.jpg", resolvedPath: "/tmp/front.jpg", previewUrl: "/media?path=front.jpg", status: "previewable" },
    { original: "refs/detail.jpg", resolvedPath: "/tmp/detail.jpg", previewUrl: "/media?path=detail.jpg", status: "previewable" },
    { original: "refs/scene.jpg", resolvedPath: "/tmp/scene.jpg", previewUrl: "/media?path=scene.jpg", status: "previewable" }
  ],
  importQuality: {
    ready: true,
    score: 92,
    summary: "商品事实完整",
    missingFields: [],
    verifiedFacts: ["材质 PP", "折りたためる"],
    blockedClaims: ["耐荷重100kg"],
    warnings: []
  },
  paidReadiness: {
    readyForPaidGeneration: true,
    blockingReasons: [],
    warnings: []
  }
};

const products: ProductSummary[] = [
  {
    path: product.path,
    sku: product.sku,
    title_ja: product.title_ja,
    referenceImageCount: 3,
    importQuality: product.importQuality,
    paidReadiness: product.paidReadiness
  },
  {
    path: "products/light.json",
    sku: "SKU-LIGHT",
    title_ja: "LEDライト",
    referenceImageCount: 1
  }
];

describe("buildProductCreativeWorkspace", () => {
  it("centers image and video work around one reusable product memory", () => {
    const workspace = buildProductCreativeWorkspace({
      mode: "video",
      products,
      selectedProduct: product,
      draftTitle: "",
      generatedVideoCount: 2,
      imageAssetCount: 4
    });

    expect(workspace.selectedProductTitle).toBe("折りたたみ収納ボックス");
    expect(workspace.productCount).toBe(2);
    expect(workspace.assetSummary.referenceImages).toBe(3);
    expect(workspace.assetSummary.imageAssets).toBe(4);
    expect(workspace.assetSummary.videoVersions).toBe(2);
    expect(workspace.memoryChips).toEqual([
      { kind: "facts", label: "可用事实", value: "3" },
      { kind: "references", label: "参考图", value: "3" },
      { kind: "blocked", label: "禁用宣称", value: "2" },
      { kind: "quality", label: "资料评分", value: "92" }
    ]);
    expect(workspace.promptCompilerSteps.map((step) => step.id)).toEqual([
      "product-memory",
      "visual-assets",
      "creative-intent",
      "model-prompt"
    ]);
    expect(workspace.primaryAction).toEqual({
      mode: "video",
      label: "生成商品视频",
      disabled: false
    });
  });

  it("uses the same product memory when the active mode is image", () => {
    const workspace = buildProductCreativeWorkspace({
      mode: "image",
      products,
      selectedProduct: product,
      draftTitle: "",
      generatedVideoCount: 0,
      imageAssetCount: 1
    });

    expect(workspace.mode).toBe("image");
    expect(workspace.primaryAction).toEqual({
      mode: "image",
      label: "优化商品图片",
      disabled: false
    });
    expect(workspace.promptCompilerSteps.at(-1)?.label).toBe("图片提示词");
    expect(workspace.promptCompilerSteps.at(-1)?.detail).toContain("主图");
  });

  it("describes the shared architecture lanes and mode switch from the same product source", () => {
    const workspace = buildProductCreativeWorkspace({
      mode: "image",
      products,
      selectedProduct: product,
      draftTitle: "",
      generatedVideoCount: 2,
      imageAssetCount: 4
    });

    expect(workspace.modeSwitch).toEqual([
      { mode: "image", label: "图片工作台", active: true },
      { mode: "video", label: "视频工作台", active: false }
    ]);
    expect(workspace.architectureLanes.map((lane) => lane.id)).toEqual([
      "product-memory",
      "visual-assets",
      "creative-intent",
      "model-output"
    ]);
    expect(workspace.architectureLanes[0].title).toBe("商品源数据");
    expect(workspace.architectureLanes[0].items).toContain("3 条可用事实");
    expect(workspace.architectureLanes[1].items).toContain("3 张参考图");
    expect(workspace.architectureLanes[3].title).toBe("图片输出");
    expect(workspace.modeSummary).toContain("图片");
    expect(workspace.modeSummary).toContain("商品记忆");
  });

  it("models reusable media as one product asset ledger shared by image and video modes", () => {
    const workspace = buildProductCreativeWorkspace({
      mode: "video",
      products,
      selectedProduct: product,
      draftTitle: "",
      generatedVideoCount: 2,
      imageAssetCount: 4
    });

    expect(workspace.assetLedger.map((asset) => asset.id)).toEqual([
      "reference-images",
      "image-assets",
      "video-versions"
    ]);
    expect(workspace.assetLedger).toEqual([
      {
        id: "reference-images",
        label: "参考图",
        count: 3,
        unit: "张",
        role: "输入约束",
        detail: "锁定商品外观、材质和关键细节",
        reusableBy: ["image", "video"]
      },
      {
        id: "image-assets",
        label: "图片资产",
        count: 4,
        unit: "个",
        role: "图片模块输出",
        detail: "主图、场景图、细节图会继续供视频模块复用",
        reusableBy: ["image", "video"]
      },
      {
        id: "video-versions",
        label: "视频版本",
        count: 2,
        unit: "个",
        role: "视频模块输出",
        detail: "成片、分镜和投放版本沉淀回商品历史",
        reusableBy: ["video"]
      }
    ]);
  });

  it("keeps creation disabled until a product draft or saved product exists", () => {
    const workspace = buildProductCreativeWorkspace({
      mode: "video",
      products: [],
      draftTitle: "",
      generatedVideoCount: 0,
      imageAssetCount: 0
    });

    expect(workspace.selectedProductTitle).toBe("新商品");
    expect(workspace.primaryAction.disabled).toBe(true);
    expect(workspace.primaryAction.reason).toBe("先填写或选择一个商品");
    expect(workspace.memoryChips[0]).toEqual({ kind: "facts", label: "可用事实", value: "0" });
  });
});

describe("productCreativeWorkspaceModeLabel", () => {
  it.each([
    ["image", "图片工作台"],
    ["video", "视频工作台"]
  ] satisfies Array<[ProductCreativeWorkspaceMode, string]>)("labels %s mode", (mode, label) => {
    expect(productCreativeWorkspaceModeLabel(mode)).toBe(label);
  });
});
