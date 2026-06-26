import { access, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { resolveReferenceImages } from "../core/productAssetResolver.js";
import { parseProductFacts } from "../core/productFacts.js";
import { maxSeedanceReferenceImages } from "../core/videoProviderErrors.js";
import type { VideoProviderName } from "../providers/providerFactory.js";

export interface ProductImagePreview {
  original: string;
  resolvedPath: string;
  previewUrl: string | null;
  status: "previewable" | "missing" | "outside-project-root" | "remote";
}

export async function assertPaidProductReady(input: {
  provider: VideoProviderName | undefined;
  productPath: string;
  rootDir: string;
}): Promise<void> {
  if (!input.provider || input.provider === "mock") {
    return;
  }
  const product = parseProductFacts(JSON.parse(await readFile(input.productPath, "utf8")));
  const referenceImages = await describeReferenceImages(product.reference_images, {
    productFilePath: input.productPath,
    rootDir: input.rootDir
  });
  const readiness = buildPaidGenerationReadiness(product, summarizeReferenceImages(referenceImages));
  if (!readiness.readyForPaidGeneration) {
    throw new Error(`付费生成前请先补齐商品资料: ${readiness.blockingReasons.join("、")}。`);
  }
}

export async function describeReferenceImages(
  referenceImages: string[],
  options: {
    productFilePath: string;
    rootDir: string;
  }
): Promise<ProductImagePreview[]> {
  const resolvedImages = resolveReferenceImages(referenceImages, {
    productFilePath: options.productFilePath
  });
  return Promise.all(
    referenceImages.map(async (original, index) =>
      describeReferenceImage(original, resolvedImages[index] ?? original, options.rootDir)
    )
  );
}

export function summarizeReferenceImages(images: ProductImagePreview[]) {
  return {
    total: images.length,
    previewable: images.filter((image) => image.status === "previewable").length,
    missing: images.filter((image) => image.status === "missing").length,
    outsideProjectRoot: images.filter((image) => image.status === "outside-project-root").length,
    remote: images.filter((image) => image.status === "remote").length
  };
}

export function buildPaidGenerationReadiness(
  product: ReturnType<typeof parseProductFacts>,
  assetSummary: ReturnType<typeof summarizeReferenceImages>
) {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  if (assetSummary.total > maxSeedanceReferenceImages) {
    warnings.push(`参考图超过 ${maxSeedanceReferenceImages} 张，生成时只会使用前 ${maxSeedanceReferenceImages} 张。`);
  }
  if (assetSummary.missing > 0) {
    warnings.push(`${assetSummary.missing} 张参考图缺失。`);
  }
  if (assetSummary.outsideProjectRoot > 0) {
    warnings.push(`${assetSummary.outsideProjectRoot} 张参考图在项目目录外，请先导入资产。`);
  }
  if (assetSummary.previewable === 0 && assetSummary.remote === 0) {
    warnings.push("没有可用参考图，视频外观可能不稳定。");
  }
  if (product.materials.length === 0 || product.materials.some((item) => item.includes("未确认"))) {
    warnings.push("请补充材质，避免脚本描述商品手感或面料时编造。");
  }
  if (!product.dimensions.trim() || product.dimensions.includes("未确认")) {
    warnings.push("请补充尺寸/重量，避免脚本编造大小、容量或便携性。");
  }
  if (
    product.verified_selling_points.length === 0 ||
    product.verified_selling_points.some((item) => item.includes("待确认") || item.includes("未确认"))
  ) {
    warnings.push("请补充已验证卖点，避免脚本事实边界过宽。");
  }
  return {
    readyForPaidGeneration: blockingReasons.length === 0,
    blockingReasons,
    warnings
  };
}

async function describeReferenceImage(
  original: string,
  resolvedPath: string,
  rootDir: string
): Promise<ProductImagePreview> {
  if (isRemoteReference(resolvedPath)) {
    return {
      original,
      resolvedPath,
      previewUrl: resolvedPath,
      status: "remote"
    };
  }
  if (!isPathInsideRoot(rootDir, resolvedPath)) {
    return {
      original,
      resolvedPath,
      previewUrl: null,
      status: "outside-project-root"
    };
  }
  try {
    await access(resolvedPath);
  } catch {
    return {
      original,
      resolvedPath,
      previewUrl: null,
      status: "missing"
    };
  }
  return {
    original,
    resolvedPath,
    previewUrl: `/media?path=${encodeURIComponent(resolvedPath)}`,
    status: "previewable"
  };
}

function isPathInsideRoot(rootDir: string, path: string): boolean {
  const resolved = resolve(path);
  const root = resolve(rootDir);
  const relativePath = relative(root, resolved);
  return relativePath !== ".." && !relativePath.startsWith(`..${"/"}`) && !isAbsolute(relativePath);
}

function isRemoteReference(reference: string): boolean {
  return reference.startsWith("http://") || reference.startsWith("https://") || reference.startsWith("data:image/");
}
