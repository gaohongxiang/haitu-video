import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

import { parseProductFacts } from "../core/productFacts.js";
import { DEFAULT_WORKSPACE_ID } from "./storagePaths.js";
import type { DatabaseHandle } from "./db/client.js";
import {
  findProductFileBySku,
  listProductFiles
} from "./productFileStore.js";
import {
  deleteProductIndexBySku,
  productFileBySkuFromDatabase,
  upsertProductIndex
} from "./productIndexStore.js";
import {
  summarizeProductListQuality,
  type ProductListQuality
} from "./productListQuality.js";
import {
  buildPaidGenerationReadiness,
  describeReferenceImages,
  summarizeReferenceImages,
  type ProductImagePreview
} from "./productReadiness.js";
import { fetchRemoteImage } from "./remoteImageFetch.js";

export { listProducts } from "./productListService.js";

export interface ImportedProductAsset {
  original: string;
  path: string;
  reference: string;
}

export interface RemoteReferenceImportResult {
  referenceImages: string[];
  downloaded: ImportedProductAsset[];
}

export async function getProductBySku(input: {
  fixturesDir: string;
  rootDir: string;
  sku: string;
}): Promise<
  {
    path: string;
    referenceImageCount: number;
    importQuality: ProductListQuality;
    paidReadiness: ReturnType<typeof buildPaidGenerationReadiness>;
    reference_image_urls: Array<string | null>;
    reference_image_statuses: ProductImagePreview[];
  } & ReturnType<typeof parseProductFacts>
> {
  const files = await listProductFiles(input.fixturesDir);
  for (const file of files) {
    const product = parseProductFacts(JSON.parse(await readFile(file, "utf8")));
    if (product.sku === input.sku) {
      const referenceImageStatuses = await describeReferenceImages(product.reference_images, {
        productFilePath: file,
        rootDir: input.rootDir
      });
      const assetSummary = summarizeReferenceImages(referenceImageStatuses);
      return {
        path: file,
        ...product,
        referenceImageCount: product.reference_images.length,
        importQuality: summarizeProductListQuality(product),
        paidReadiness: buildPaidGenerationReadiness(product, assetSummary),
        reference_image_urls: referenceImageStatuses.map((item) => item.previewUrl),
        reference_image_statuses: referenceImageStatuses
      };
    }
  }
  throw new Error(`Product not found: ${input.sku}`);
}

export async function saveProductFactPackage(input: {
  fixturesDir: string;
  rootDir: string;
  workspaceId?: string;
  databaseHandle?: DatabaseHandle;
  fetchImpl?: typeof fetch;
  input: unknown;
}): Promise<Awaited<ReturnType<typeof getProductBySku>>> {
  const product = parseProductFacts(input.input);
  const productPath = join(input.fixturesDir, sanitizePathSegment(product.sku), "product.json");
  await mkdir(dirname(productPath), { recursive: true });
  const importedReferences = await importRemoteReferenceImages({
    productFilePath: productPath,
    referenceImages: product.reference_images,
    fetchImpl: input.fetchImpl
  });
  await writeFile(productPath, JSON.stringify({
    ...product,
    reference_images: importedReferences.referenceImages,
    workspaceId: input.workspaceId ?? DEFAULT_WORKSPACE_ID
  }, null, 2), "utf8");
  if (input.databaseHandle) {
    upsertProductIndex(input.databaseHandle, {
      workspaceId: input.workspaceId ?? DEFAULT_WORKSPACE_ID,
      sku: product.sku,
      title: product.title_ja,
      productJsonPath: productPath
    });
  }
  return getProductBySku({
    fixturesDir: input.fixturesDir,
    rootDir: input.rootDir,
    sku: product.sku
  });
}

export async function deleteProductBySku(input: {
  fixturesDir: string;
  databaseHandle?: DatabaseHandle;
  workspaceId?: string;
  sku: string;
}): Promise<{ deleted: true; sku: string; path: string }> {
  const productPath = input.databaseHandle
    ? productFileBySkuFromDatabase(input.databaseHandle, input.workspaceId ?? DEFAULT_WORKSPACE_ID, input.sku)
    : await findProductFileBySku(input.fixturesDir, input.sku);
  if (!productPath) {
    throw new Error(`Product not found: ${input.sku}`);
  }
  await rm(dirname(productPath), { recursive: true, force: true });
  if (input.databaseHandle) {
    deleteProductIndexBySku(input.databaseHandle, input.workspaceId ?? DEFAULT_WORKSPACE_ID, input.sku);
  }
  return {
    deleted: true,
    sku: input.sku,
    path: productPath
  };
}

export function withoutPlaceholderReferenceImages(referenceImages: string[]): string[] {
  return referenceImages.filter((reference) => reference.trim() && reference.trim() !== "reference.jpg");
}

export function isHttpReference(reference: string): boolean {
  return reference.startsWith("http://") || reference.startsWith("https://");
}

export function normalizedImageExtension(path: string): string {
  const extension = extname(path).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp"].includes(extension) ? extension : ".jpg";
}

export async function nextAvailableReferenceImageTarget(input: {
  productFilePath: string;
  referenceImages: string[];
  startIndex: number;
  extension: string;
}): Promise<{ path: string; reference: string }> {
  const refsDir = join(dirname(input.productFilePath), "refs");
  const usedReferences = new Set(input.referenceImages);
  for (let index = Math.max(1, input.startIndex); index < 10000; index += 1) {
    const targetPath = join(refsDir, `reference-${String(index).padStart(2, "0")}${input.extension}`);
    const reference = `refs/${basename(targetPath)}`;
    if (usedReferences.has(reference) || await pathExists(targetPath)) {
      continue;
    }
    return { path: targetPath, reference };
  }
  throw new Error("Could not allocate a product reference image filename.");
}

export function imageExtensionFromUpload(fileName: string, mimeType: string): string | undefined {
  const normalizedMimeType = mimeType.toLowerCase();
  if (normalizedMimeType === "image/jpeg" || normalizedMimeType === "image/jpg") {
    return ".jpg";
  }
  if (normalizedMimeType === "image/png") {
    return ".png";
  }
  if (normalizedMimeType === "image/webp") {
    return ".webp";
  }
  const extension = extname(fileName).toLowerCase();
  if (extension === ".jpeg") {
    return ".jpg";
  }
  return [".jpg", ".png", ".webp"].includes(extension) ? extension : undefined;
}

export function imageExtensionFromRemoteReference(reference: string, mimeType: string): string | undefined {
  const fromMimeType = imageExtensionFromUpload("", mimeType);
  if (fromMimeType) {
    return fromMimeType;
  }
  return imageExtensionFromUpload(new URL(reference).pathname, "");
}

async function importRemoteReferenceImages(input: {
  productFilePath: string;
  referenceImages: string[];
  fetchImpl?: typeof fetch;
}): Promise<RemoteReferenceImportResult> {
  const nextReferenceImages = withoutPlaceholderReferenceImages(input.referenceImages);
  const downloaded: ImportedProductAsset[] = [];
  for (const [index, reference] of nextReferenceImages.entries()) {
    if (!isHttpReference(reference)) {
      continue;
    }
    try {
      const remote = await fetchRemoteImage({ url: reference, fetchImpl: input.fetchImpl });
      const contentType = remote.contentType;
      const extension = imageExtensionFromRemoteReference(reference, contentType);
      if (!extension) {
        continue;
      }
      const target = await nextAvailableReferenceImageTarget({
        productFilePath: input.productFilePath,
        referenceImages: nextReferenceImages,
        startIndex: index + 1,
        extension
      });
      const targetPath = target.path;
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, remote.bytes);
      const localReference = target.reference;
      nextReferenceImages[index] = localReference;
      downloaded.push({
        original: reference,
        path: targetPath,
        reference: localReference
      });
    } catch {
      continue;
    }
  }
  return {
    referenceImages: nextReferenceImages,
    downloaded
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "run";
}
