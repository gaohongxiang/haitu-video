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
import {
  matchMarketingRoute,
  renderLlmsTxt,
  renderMarketingPage,
  renderRobotsTxt,
  renderSitemapXml
} from "../marketing/renderMarketingPage.js";
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

export function handleMarketingRoutes(input: {
  request: Request;
  url: URL;
}): Response | undefined {
  const { request, url } = input;
  const canRead = request.method === "GET" || request.method === "HEAD";
  if (!canRead) {
    return undefined;
  }
  if (url.pathname === "/robots.txt") {
    return new Response(request.method === "HEAD" ? undefined : renderRobotsTxt(url.origin), {
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
  if (url.pathname === "/llms.txt") {
    return new Response(request.method === "HEAD" ? undefined : renderLlmsTxt(url.origin), {
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
  if (url.pathname === "/sitemap.xml") {
    return new Response(request.method === "HEAD" ? undefined : renderSitemapXml(url.origin), {
      headers: { "content-type": "application/xml; charset=utf-8" }
    });
  }
  const routeMatch = matchMarketingRoute(url);
  if (routeMatch.redirectPath) {
    return new Response(undefined, {
      status: 301,
      headers: { location: routeMatch.redirectPath }
    });
  }
  const route = routeMatch.route;
  if (!route) {
    return undefined;
  }
  return new Response(
    request.method === "HEAD"
      ? undefined
      : renderMarketingPage({
        origin: url.origin,
        locale: route.locale,
        pageSlug: route.pageSlug
      }),
    {
      headers: { "content-type": "text/html; charset=utf-8" }
    }
  );
}

export async function handleConsoleAssetRoutes(input: {
  request: Request;
  url: URL;
  consoleDistDir: string;
}): Promise<Response | undefined> {
  const { request, url, consoleDistDir } = input;
  const canReadAsset = request.method === "GET" || request.method === "HEAD";

  if (canReadAsset && (url.pathname === "/app" || url.pathname === "/console" || url.pathname === "/admin")) {
    const indexHtml = request.method === "HEAD"
      ? undefined
      : withNoindexRobots(await readConsoleIndex(consoleDistDir));
    return new Response(indexHtml, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "noindex, nofollow"
      }
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

function withNoindexRobots(html: string): string {
  if (html.includes('name="robots"') || html.includes("name='robots'")) {
    return html;
  }
  const tag = '<meta name="robots" content="noindex,nofollow" />';
  return html.includes("</head>")
    ? html.replace("</head>", `    ${tag}\n</head>`)
    : `${tag}\n${html}`;
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
