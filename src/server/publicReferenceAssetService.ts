import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";

import type { ReferenceImageUrlResolver } from "../providers/types.js";
import {
  imageExtensionFromRemoteReference,
  isHttpReference
} from "./productService.js";
import { PublicAssetTokenStore } from "./publicAssetTokenStore.js";

export const publicAssetTokenTtlMs = 2 * 60 * 60 * 1000;

export function createReferenceImageUrlResolver(input: {
  dataDir: string;
  workspaceId: string;
  publicBaseUrl?: string;
  publicAssetTokenStore: PublicAssetTokenStore;
  fetchImpl?: typeof fetch;
}): ReferenceImageUrlResolver | undefined {
  if (!input.publicBaseUrl || isLocalPublicBaseUrl(input.publicBaseUrl)) {
    return undefined;
  }
  return async (reference) => {
    const filePath = isHttpReference(reference)
      ? await cacheRemoteReferenceForPublicAsset({
          dataDir: input.dataDir,
          workspaceId: input.workspaceId,
          reference,
          fetchImpl: input.fetchImpl
        })
      : localReferencePathForPublicAsset(input.dataDir, reference);
    const token = input.publicAssetTokenStore.create({
      filePath,
      mimeType: mimeTypeForAssetPath(filePath),
      workspaceId: input.workspaceId,
      ttlMs: publicAssetTokenTtlMs
    });
    return joinPublicUrl(input.publicBaseUrl ?? "", token.urlPath);
  };
}

function joinPublicUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function mimeTypeForAssetPath(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  return "image/png";
}

function localReferencePathForPublicAsset(dataDir: string, reference: string): string {
  const filePath = isAbsolute(reference) ? resolve(reference) : resolve(dataDir, reference);
  if (!isPathInsideRoot(dataDir, filePath)) {
    throw new Error(`Path is outside data root: ${reference}`);
  }
  return filePath;
}

function isLocalPublicBaseUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return true;
  }
}

async function cacheRemoteReferenceForPublicAsset(input: {
  dataDir: string;
  workspaceId: string;
  reference: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchReference = input.fetchImpl ?? fetch;
  const response = await fetchReference(input.reference);
  if (!response.ok) {
    throw new Error("参考图地址无法访问。请重新上传这张图，或换一张能稳定访问的图片后再生成。");
  }
  const contentType = response.headers.get("content-type") ?? "";
  const extension = imageExtensionFromRemoteReference(input.reference, contentType);
  if (!extension) {
    throw new Error("参考图地址返回的不是可用图片。请重新上传这张图，或换一张能稳定访问的图片后再生成。");
  }
  const hash = createHash("sha256").update(input.reference).digest("hex").slice(0, 24);
  const targetPath = resolve(
    input.dataDir,
    "workspaces",
    sanitizePathSegment(input.workspaceId),
    "system",
    "public-reference-cache",
    `${hash}${extension}`
  );
  if (!isPathInsideRoot(input.dataDir, targetPath)) {
    throw new Error("Reference image cache path must stay inside data root.");
  }
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, Buffer.from(await response.arrayBuffer()));
  return targetPath;
}

function isPathInsideRoot(rootDir: string, path: string): boolean {
  const resolved = resolve(path);
  const root = resolve(rootDir);
  const relativePath = relative(root, resolved);
  return relativePath !== ".." && !relativePath.startsWith(`..${"/"}`) && !isAbsolute(relativePath);
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "run";
}
