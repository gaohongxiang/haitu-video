import { access, readFile, readdir, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

import { PublicAssetTokenStore } from "./publicAssetTokenStore.js";

export {
  createReferenceImageUrlResolver,
  publicAssetTokenTtlMs
} from "./publicReferenceAssetService.js";

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function mediaUrl(path: string): string {
  return `/media?path=${encodeURIComponent(path)}`;
}

export function queryValue(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name);
  return value && value !== "all" ? value : undefined;
}

export async function listNamedFiles(root: string, fileName: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && entry.name === fileName) {
        found.push(path);
      }
    }
  }
  await walk(root);
  return found;
}

export function resolveWithin(rootDir: string, path: string): string {
  const resolved = resolve(rootDir, path);
  if (!isPathInsideRoot(rootDir, resolved)) {
    throw new Error(`Path is outside project root: ${path}`);
  }
  return resolved;
}

export function publicBaseUrlFromEnv(): string | undefined {
  return process.env.HAITU_PUBLIC_BASE_URL ?? process.env.BETTER_AUTH_URL;
}

export async function consoleAssetResponse(
  pathname: string,
  options: {
    consoleDistDir: string;
    head: boolean;
  }
): Promise<Response> {
  const assetPath = resolveWithin(options.consoleDistDir, `.${pathname}`);
  const content = options.head ? undefined : await readFile(assetPath);
  return new Response(content, {
    headers: { "content-type": assetContentType(assetPath) }
  });
}

export async function mediaResponse(
  path: string | null,
  options: {
    rootDir: string;
    head: boolean;
  }
): Promise<Response> {
  if (!path) {
    return jsonResponse({ error: "Missing media path" }, 400);
  }
  const filePath = resolveWithin(options.rootDir, path);
  const contentType = mediaContentType(filePath);
  return new Response(options.head ? undefined : await readFile(filePath), {
    headers: { "content-type": contentType }
  });
}

export async function publicAssetResponse(
  store: PublicAssetTokenStore,
  token: string,
  options: { head: boolean }
): Promise<Response> {
  const record = store.resolve(token);
  if (!record) {
    return jsonResponse({ error: "Public asset not found or expired." }, 404);
  }
  try {
    await stat(record.filePath);
    return new Response(options.head ? undefined : await readFile(record.filePath), {
      headers: {
        "content-type": record.mimeType,
        "cache-control": "private, max-age=300"
      }
    });
  } catch {
    return jsonResponse({ error: "Public asset not found or expired." }, 404);
  }
}

function isPathInsideRoot(rootDir: string, path: string): boolean {
  const resolved = resolve(path);
  const root = resolve(rootDir);
  const relativePath = relative(root, resolved);
  return relativePath !== ".." && !relativePath.startsWith(`..${"/"}`) && !isAbsolute(relativePath);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function assetContentType(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === ".js" || extension === ".mjs") {
    return "text/javascript; charset=utf-8";
  }
  if (extension === ".css") {
    return "text/css; charset=utf-8";
  }
  if (extension === ".svg") {
    return "image/svg+xml";
  }
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  return "application/octet-stream";
}

function mediaContentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".mp4":
      return "video/mp4";
    case ".json":
      return "application/json; charset=utf-8";
    case ".gz":
    case ".tgz":
      return "application/gzip";
    case ".ass":
      return "text/plain; charset=utf-8";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}
