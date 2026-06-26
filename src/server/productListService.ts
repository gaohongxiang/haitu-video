import { readFile } from "node:fs/promises";

import { parseProductFacts } from "../core/productFacts.js";
import type { DatabaseHandle } from "./db/client.js";
import { listProductFiles } from "./productFileStore.js";
import {
  listProductFilesFromDatabase,
  productIndexFallbackByPath
} from "./productIndexStore.js";
import {
  summarizeProductListQuality,
  type ProductListQuality
} from "./productListQuality.js";
import {
  buildPaidGenerationReadiness,
  describeReferenceImages,
  summarizeReferenceImages
} from "./productReadiness.js";
import { DEFAULT_WORKSPACE_ID } from "./storagePaths.js";

export interface ProductListItem {
  path: string;
  sku: string;
  title_ja: string;
  referenceImageCount: number;
  importQuality: ProductListQuality;
  paidReadiness: ReturnType<typeof buildPaidGenerationReadiness>;
}

export async function listProducts(
  fixturesDir: string,
  rootDir: string,
  options: {
    databaseHandle?: DatabaseHandle;
    workspaceId?: string;
  } = {}
): Promise<ProductListItem[]> {
  const files = options.databaseHandle
    ? listProductFilesFromDatabase(options.databaseHandle, options.workspaceId ?? DEFAULT_WORKSPACE_ID)
    : await listProductFiles(fixturesDir);
  const products = new Map<string, ProductListItem>();
  for (const file of files) {
    const product = await readProductFactsForList(file, options.databaseHandle);
    const referenceImageStatuses = product.fileAvailable
      ? await describeReferenceImages(product.reference_images, {
        productFilePath: file,
        rootDir
      })
      : [];
    const assetSummary = summarizeReferenceImages(referenceImageStatuses);
    const summary = {
      path: file,
      sku: product.sku,
      title_ja: product.title_ja,
      referenceImageCount: product.reference_images.length,
      importQuality: product.fileAvailable
        ? summarizeProductListQuality(product)
        : {
          ready: false,
          score: 0,
          summary: "商品文件缺失",
          missingFields: ["商品文件"],
          verifiedFacts: [],
          warnings: ["SQLite 索引存在，但 product.json 缺失"]
        },
      paidReadiness: product.fileAvailable
        ? buildPaidGenerationReadiness(product, assetSummary)
        : missingProductFileReadiness()
    };
    const existing = products.get(product.sku);
    if (!existing || productSummaryRank(summary) > productSummaryRank(existing)) {
      products.set(product.sku, summary);
    }
  }
  return Array.from(products.values()).sort((left, right) => left.sku.localeCompare(right.sku));
}

async function readProductFactsForList(
  productFilePath: string,
  handle?: DatabaseHandle
): Promise<ReturnType<typeof parseProductFacts> & { fileAvailable: boolean }> {
  try {
    return {
      ...parseProductFacts(JSON.parse(await readFile(productFilePath, "utf8"))),
      fileAvailable: true
    };
  } catch (error) {
    if (!handle || !isMissingFileError(error)) {
      throw error;
    }
    const row = productIndexFallbackByPath(handle, productFilePath);
    if (!row) {
      throw error;
    }
    return {
      sku: row.sku,
      title_ja: row.title ?? row.sku,
      category: "商品文件缺失",
      materials: ["商品文件缺失"],
      dimensions: "商品文件缺失",
      verified_selling_points: ["商品文件缺失"],
      usage_scenes: ["商品文件缺失"],
      forbidden_claims: ["商品文件缺失"],
      reference_images: [],
      fileAvailable: false
    };
  }
}

function productSummaryRank(product: {
  referenceImageCount: number;
  importQuality?: ProductListQuality;
  paidReadiness?: ReturnType<typeof buildPaidGenerationReadiness>;
}): number {
  return (
    product.referenceImageCount * 100 +
    (product.importQuality?.score ?? 0) +
    (product.paidReadiness?.readyForPaidGeneration ? 10 : 0)
  );
}

function missingProductFileReadiness(): ReturnType<typeof buildPaidGenerationReadiness> {
  return {
    readyForPaidGeneration: false,
    blockingReasons: ["商品文件缺失"],
    warnings: ["SQLite 索引存在，但 product.json 缺失"]
  };
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
