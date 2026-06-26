import {
  consoleAssetResponse,
  mediaResponse,
  publicAssetResponse
} from "./consoleAssetService.js";
import {
  jsonResponse,
  readConsoleIndex,
  staticResponse
} from "./consoleHttpService.js";
import type { PublicAssetTokenStore } from "./publicAssetTokenStore.js";

export async function handleHealthRoutes(input: {
  request: Request;
  url: URL;
}): Promise<Response | undefined> {
  const { request, url } = input;
  if (request.method === "GET" && url.pathname === "/api/health") {
    return jsonResponse({
      ok: true,
      service: "haitu-video-console",
      storage: "local",
      uptimeSeconds: Math.floor(process.uptime()),
      checkedAt: new Date().toISOString()
    });
  }
  return undefined;
}

export async function handlePublicAssetRoutes(input: {
  request: Request;
  url: URL;
  publicAssetTokenStore: PublicAssetTokenStore;
}): Promise<Response | undefined> {
  const { request, url, publicAssetTokenStore } = input;
  const publicAssetMatch = url.pathname.match(/^\/api\/public-assets\/([A-Za-z0-9_-]+)$/);
  if (publicAssetMatch && (request.method === "GET" || request.method === "HEAD")) {
    return publicAssetResponse(publicAssetTokenStore, publicAssetMatch[1] ?? "", {
      head: request.method === "HEAD"
    });
  }
  return undefined;
}

export async function handleConsoleAssetRoutes(input: {
  request: Request;
  url: URL;
  consoleDistDir: string;
}): Promise<Response | undefined> {
  const { request, url, consoleDistDir } = input;
  const canReadAsset = request.method === "GET" || request.method === "HEAD";

  if (canReadAsset && (url.pathname === "/" || url.pathname === "/console" || url.pathname === "/admin")) {
    return new Response(request.method === "HEAD" ? undefined : await readConsoleIndex(consoleDistDir), {
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  }
  if (canReadAsset && url.pathname === "/favicon.svg") {
    return consoleAssetResponse(url.pathname, {
      consoleDistDir,
      head: request.method === "HEAD"
    });
  }
  if (canReadAsset && url.pathname.startsWith("/assets/")) {
    return consoleAssetResponse(url.pathname, {
      consoleDistDir,
      head: request.method === "HEAD"
    });
  }
  if (request.method === "GET" && url.pathname.startsWith("/static/")) {
    return staticResponse(url.pathname.slice("/static/".length));
  }
  return undefined;
}

export async function handleMediaRoutes(input: {
  request: Request;
  url: URL;
  rootDir: string;
}): Promise<Response | undefined> {
  const { request, url, rootDir } = input;
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/media") {
    return mediaResponse(url.searchParams.get("path"), {
      rootDir,
      head: request.method === "HEAD"
    });
  }
  return undefined;
}
