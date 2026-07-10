import { copyFile, mkdir, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";

import { describeReferenceImages } from "./productReadiness.js";
import {
  readProductReferenceImageFile,
  writeProductReferenceImages
} from "./productReferenceImageStore.js";
import {
  getProductBySku,
  imageExtensionFromUpload,
  nextAvailableReferenceImageTarget,
  normalizedImageExtension,
  withoutPlaceholderReferenceImages,
  type ImportedProductAsset
} from "./productService.js";

export interface UploadProductReferenceImagesRequest {
  files?: Array<{
    fileName?: string;
    mimeType?: string;
    base64?: string;
  }>;
}

export interface ReorderProductReferenceImagesRequest {
  referenceImages?: unknown;
}

export interface UploadedProductReferenceImage {
  originalName: string;
  path: string;
  reference: string;
}

const maxUploadedReferenceImageCount = 10;
const maxUploadedReferenceImageBytes = 20 * 1024 * 1024;
const maxUploadedReferenceImageTotalBytes = 50 * 1024 * 1024;

export async function importProductReferenceAssets(input: {
  fixturesDir: string;
  rootDir: string;
  sku: string;
  allowedImportRoot?: string;
}): Promise<{
  imported: ImportedProductAsset[];
  product: Awaited<ReturnType<typeof getProductBySku>>;
}> {
  if (!input.allowedImportRoot?.trim()) {
    throw new Error("Server-side local file import is disabled. Upload the image instead.");
  }
  const allowedImportRoot = await realpath(input.allowedImportRoot);
  const { productFilePath, rawProduct, product } = await readProductReferenceImageFile(input);
  const statuses = await describeReferenceImages(product.reference_images, {
    productFilePath,
    rootDir: input.rootDir
  });
  const imported: ImportedProductAsset[] = [];
  const nextReferenceImages = withoutPlaceholderReferenceImages(product.reference_images);
  for (const [index, image] of statuses.entries()) {
    if (image.status !== "outside-project-root") {
      continue;
    }
    const sourcePath = await realpath(image.resolvedPath);
    if (!isPathInsideRoot(allowedImportRoot, sourcePath)) {
      throw new Error("Reference image is outside the configured local import directory.");
    }
    const sourceStat = await stat(sourcePath);
    if (!sourceStat.isFile() || sourceStat.size <= 0 || sourceStat.size > 20 * 1024 * 1024) {
      throw new Error("Reference image must be a non-empty file no larger than 20 MB.");
    }
    const extension = normalizedImageExtension(sourcePath);
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(extname(sourcePath).toLowerCase())) {
      throw new Error("Reference image type is not supported.");
    }
    const target = await nextAvailableReferenceImageTarget({
      productFilePath,
      referenceImages: nextReferenceImages,
      startIndex: index + 1,
      extension
    });
    const targetPath = target.path;
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
    const reference = target.reference;
    nextReferenceImages[index] = reference;
    imported.push({
      original: image.original,
      path: targetPath,
      reference
    });
  }
  if (imported.length > 0) {
    await writeProductReferenceImages({
      productFilePath,
      rawProduct,
      referenceImages: nextReferenceImages
    });
  }
  return {
    imported,
    product: await getProductBySku({
      fixturesDir: input.fixturesDir,
      rootDir: input.rootDir,
      sku: input.sku
    })
  };
}

function isPathInsideRoot(rootDir: string, path: string): boolean {
  const relativePath = relative(resolve(rootDir), resolve(path));
  return relativePath !== ".." && !relativePath.startsWith(`..${"/"}`) && !isAbsolute(relativePath);
}

export async function uploadProductReferenceImages(input: {
  fixturesDir: string;
  rootDir: string;
  sku: string;
  input: UploadProductReferenceImagesRequest;
}): Promise<{
  uploaded: UploadedProductReferenceImage[];
  product: Awaited<ReturnType<typeof getProductBySku>>;
}> {
  const { productFilePath, rawProduct, product } = await readProductReferenceImageFile(input);
  const files = input.input.files ?? [];
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("Reference image upload requires at least one file.");
  }
  if (files.length > maxUploadedReferenceImageCount) {
    throw new Error(`Reference image upload accepts at most ${maxUploadedReferenceImageCount} files at a time.`);
  }
  const nextReferenceImages = withoutPlaceholderReferenceImages(product.reference_images);
  const uploaded: UploadedProductReferenceImage[] = [];
  let totalBytes = 0;
  for (const file of files) {
    const fileName = typeof file.fileName === "string" && file.fileName.trim() ? file.fileName.trim() : "reference.jpg";
    const mimeType = typeof file.mimeType === "string" ? file.mimeType : "";
    const extension = imageExtensionFromUpload(fileName, mimeType);
    if (!extension) {
      throw new Error(`Unsupported reference image type: ${mimeType || fileName}`);
    }
    if (typeof file.base64 !== "string" || !file.base64.trim()) {
      throw new Error(`Reference image ${fileName} is missing base64 content.`);
    }
    const normalizedBase64 = file.base64.replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalizedBase64) || normalizedBase64.length % 4 !== 0) {
      throw new Error(`Reference image ${fileName} has invalid base64 content.`);
    }
    const content = Buffer.from(normalizedBase64, "base64");
    if (content.byteLength === 0 || content.byteLength > maxUploadedReferenceImageBytes) {
      throw new Error(`Reference image ${fileName} must be no larger than 20 MB.`);
    }
    totalBytes += content.byteLength;
    if (totalBytes > maxUploadedReferenceImageTotalBytes) {
      throw new Error("Reference image upload must be no larger than 50 MB in total.");
    }
    const target = await nextAvailableReferenceImageTarget({
      productFilePath,
      referenceImages: nextReferenceImages,
      startIndex: nextReferenceImages.length + 1,
      extension
    });
    const targetPath = target.path;
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content);
    const reference = target.reference;
    nextReferenceImages.push(reference);
    uploaded.push({
      originalName: fileName,
      path: targetPath,
      reference
    });
  }
  await writeProductReferenceImages({
    productFilePath,
    rawProduct,
    referenceImages: nextReferenceImages
  });
  return {
    uploaded,
    product: await getProductBySku({
      fixturesDir: input.fixturesDir,
      rootDir: input.rootDir,
      sku: input.sku
    })
  };
}

export async function deleteProductReferenceImage(input: {
  fixturesDir: string;
  rootDir: string;
  sku: string;
  index: number;
}): Promise<{
  deleted: {
    index: number;
    reference: string;
  };
  product: Awaited<ReturnType<typeof getProductBySku>>;
}> {
  const { productFilePath, rawProduct, product } = await readProductReferenceImageFile(input);
  if (!Number.isInteger(input.index) || input.index < 0 || input.index >= product.reference_images.length) {
    throw new Error(`Reference image index is out of range: ${input.index}`);
  }
  const nextReferenceImages = product.reference_images.filter((_, index) => index !== input.index);
  const deletedReference = product.reference_images[input.index] ?? "";
  await writeProductReferenceImages({
    productFilePath,
    rawProduct,
    referenceImages: nextReferenceImages
  });
  return {
    deleted: {
      index: input.index,
      reference: deletedReference
    },
    product: await getProductBySku({
      fixturesDir: input.fixturesDir,
      rootDir: input.rootDir,
      sku: input.sku
    })
  };
}

export async function reorderProductReferenceImages(input: {
  fixturesDir: string;
  rootDir: string;
  sku: string;
  input: ReorderProductReferenceImagesRequest;
}): Promise<{
  product: Awaited<ReturnType<typeof getProductBySku>>;
}> {
  const { productFilePath, rawProduct, product } = await readProductReferenceImageFile(input);
  const referenceImages = input.input.referenceImages;
  if (!Array.isArray(referenceImages) || !referenceImages.every((item) => typeof item === "string")) {
    throw new Error("Reference image order requires referenceImages.");
  }
  const nextReferenceImages = referenceImages.map((item) => item.trim()).filter(Boolean);
  if (!sameReferenceImageSet(product.reference_images, nextReferenceImages)) {
    throw new Error("Reference image order must include the same images.");
  }
  await writeProductReferenceImages({
    productFilePath,
    rawProduct,
    referenceImages: nextReferenceImages
  });
  return {
    product: await getProductBySku({
      fixturesDir: input.fixturesDir,
      rootDir: input.rootDir,
      sku: input.sku
    })
  };
}

function sameReferenceImageSet(current: string[], next: string[]): boolean {
  if (current.length !== next.length) {
    return false;
  }
  const counts = new Map<string, number>();
  for (const reference of current) {
    counts.set(reference, (counts.get(reference) ?? 0) + 1);
  }
  for (const reference of next) {
    const count = counts.get(reference) ?? 0;
    if (count <= 0) {
      return false;
    }
    if (count === 1) {
      counts.delete(reference);
    } else {
      counts.set(reference, count - 1);
    }
  }
  return counts.size === 0;
}
