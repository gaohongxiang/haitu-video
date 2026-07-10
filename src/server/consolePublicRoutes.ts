import {
  consoleAssetResponse,
  isPathWithin,
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
import {
  isAllowedTrafficEventName,
  recordTrafficEvent
} from "./adminTraffic.js";
import type { DatabaseHandle } from "./db/client.js";
import type { ConsoleAuthStore } from "./consoleAuth.js";
import type { PublicAssetTokenStore } from "./publicAssetTokenStore.js";

const trafficEventRateBuckets = new Map<string, { count: number; resetAt: number }>();
const publicTrafficEventNames = new Set(["cta_click"]);

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
  databaseHandle?: DatabaseHandle;
  now?: () => Date;
}): Response | undefined {
  const { request, url, databaseHandle, now } = input;
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
  if (request.method === "GET" && databaseHandle) {
    recordTrafficEvent({
      handle: databaseHandle,
      eventName: "page_view",
      path: url.pathname,
      referrer: request.headers.get("referer"),
      occurredAt: now?.() ?? new Date()
    });
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

export async function handleTrafficEventRoutes(input: {
  request: Request;
  url: URL;
  databaseHandle: DatabaseHandle;
  now?: () => Date;
}): Promise<Response | undefined> {
  const { request, url, databaseHandle, now } = input;
  if (request.method !== "POST" || url.pathname !== "/api/traffic/events") {
    return undefined;
  }
  if (!isSameOriginRequest(request, url)) {
    return jsonResponse({ error: "Cross-origin traffic events are not accepted." }, 403);
  }
  if (!consumeTrafficEventRateLimit(request, now?.() ?? new Date())) {
    return jsonResponse({ error: "Too many traffic events." }, 429);
  }
  const bodyText = await request.text();
  if (bodyText.length > 4096) {
    return jsonResponse({ error: "Traffic event payload is too large." }, 400);
  }
  let body: unknown;
  try {
    body = JSON.parse(bodyText || "{}");
  } catch {
    return jsonResponse({ error: "Invalid JSON payload." }, 400);
  }
  if (!isTrafficEventRequest(body)) {
    return jsonResponse({ error: "Invalid traffic event payload." }, 400);
  }
  if (!isAllowedTrafficEventName(body.eventName) || !publicTrafficEventNames.has(body.eventName)) {
    return jsonResponse({ error: "Unsupported traffic event." }, 400);
  }
  recordTrafficEvent({
    handle: databaseHandle,
    eventName: body.eventName,
    path: body.path,
    sessionId: body.sessionId,
    referrer: request.headers.get("referer"),
    occurredAt: now?.() ?? new Date(),
    metadata: body.metadata
  });
  return jsonResponse({ ok: true });
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

function isTrafficEventRequest(value: unknown): value is {
  eventName: string;
  path: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
} {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.eventName !== "string" || typeof record.path !== "string") {
    return false;
  }
  if (record.eventName.length > 64 || record.path.length === 0 || record.path.length > 2048) {
    return false;
  }
  if (record.sessionId !== undefined && typeof record.sessionId !== "string") {
    return false;
  }
  if (typeof record.sessionId === "string" && record.sessionId.length > 128) {
    return false;
  }
  if (record.metadata !== undefined && (!record.metadata || typeof record.metadata !== "object" || Array.isArray(record.metadata))) {
    return false;
  }
  if (record.metadata !== undefined && JSON.stringify(record.metadata).length > 2048) {
    return false;
  }
  return true;
}

function isSameOriginRequest(request: Request, url: URL): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === url.origin;
}

function consumeTrafficEventRateLimit(request: Request, now: Date): boolean {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwardedFor || request.headers.get("cf-connecting-ip")?.trim() || "unknown";
  const nowMs = now.getTime();
  const current = trafficEventRateBuckets.get(key);
  if (!current || current.resetAt <= nowMs) {
    trafficEventRateBuckets.set(key, { count: 1, resetAt: nowMs + 60_000 });
    return true;
  }
  if (current.count >= 60) {
    return false;
  }
  current.count += 1;
  return true;
}

export async function handleMediaRoutes(input: {
  request: Request;
  url: URL;
  dataDir: string;
  workspaceDir: string;
  authStore: ConsoleAuthStore;
}): Promise<Response | undefined> {
  const { request, url, dataDir, workspaceDir, authStore } = input;
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/media") {
    const path = url.searchParams.get("path");
    const rootDir = path && isPathWithin(workspaceDir, path) ? workspaceDir : dataDir;
    if (rootDir === dataDir) {
      const adminResponse = await authStore.requireAdmin(request);
      if (adminResponse) {
        return adminResponse;
      }
    }
    return mediaResponse(path, {
      rootDir,
      head: request.method === "HEAD",
      rangeHeader: request.headers.get("range")
    });
  }
  return undefined;
}
