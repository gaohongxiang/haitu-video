import {
  marketingLocales,
  marketingPages
} from "../src/marketing/renderMarketingPage.js";

export interface SeoGeoProductionCheckOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export interface SeoGeoProductionCheckResult {
  checks: string[];
  failures: string[];
  ok: boolean;
}

const publicHtmlPaths = marketingPages.flatMap((page) => marketingLocales.map((locale) => marketingPath(locale, page.slug)));
const requiredReviewPaths = ["/", "/en/", "/terms", "/privacy", "/refund", "/contact"] as const;
const machineReadablePaths = ["/robots.txt", "/sitemap.xml", "/llms.txt"] as const;
const noindexPaths = ["/console", "/admin", "/app"] as const;
const privatePathFragments = ["/console", "/admin", "/app", "/api"];
const defaultBaseUrl = "https://haitu.online";

export async function runSeoGeoProductionCheck(options: SeoGeoProductionCheckOptions): Promise<SeoGeoProductionCheckResult> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const checks: string[] = [];
  const failures: string[] = [];

  for (const path of publicHtmlPaths) {
    const { body, response } = await fetchText(fetchImpl, baseUrl, path);
    checks.push(`${path} public HTML`);

    expectStatus(failures, path, response, 200);
    expectContains(failures, path, response.headers.get("content-type") ?? "", "text/html", "content-type must be text/html");
    expectContains(failures, path, body, '<meta name="robots" content="index,follow" />', "must include index,follow meta robots");
    expectContains(failures, path, body, `<link rel="canonical" href="${canonicalUrl(baseUrl, path)}" />`, "must include production canonical");
    expectContains(failures, path, body, '<script type="application/ld+json">', "must include JSON-LD");
    expectNotContains(failures, path, body, "Authentication required", "must not require authentication");
    expectNotContains(failures, path, body, "127.0.0.1", "must not include local hostnames");
    expectNotContains(failures, path, body, "localhost", "must not include local hostnames");

    if (path === "/" || path === "/en/") {
      expectContains(failures, path, body, `${baseUrl}/static/seo-og.png`, "must reference production OG image");
      expectContains(failures, path, body, path === "/en/" ? 'property="og:site_name" content="Haitu"' : 'property="og:site_name" content="Haitu 嗨兔"', "must include localized og:site_name");
    }
  }

  const robots = await fetchText(fetchImpl, baseUrl, "/robots.txt");
  checks.push("/robots.txt crawl policy");
  expectStatus(failures, "/robots.txt", robots.response, 200);
  expectContains(failures, "/robots.txt", robots.response.headers.get("content-type") ?? "", "text/plain", "content-type must be text/plain");
  expectContains(failures, "/robots.txt", robots.body, "User-agent: OAI-SearchBot", "must explicitly allow ChatGPT search crawler");
  expectContains(failures, "/robots.txt", robots.body, "Disallow: /console", "must disallow /console");
  expectContains(failures, "/robots.txt", robots.body, "Disallow: /admin", "must disallow /admin");
  expectContains(failures, "/robots.txt", robots.body, "Disallow: /app", "must disallow /app");
  expectContains(failures, "/robots.txt", robots.body, "Disallow: /api", "must disallow /api");
  expectContains(failures, "/robots.txt", robots.body, `Sitemap: ${baseUrl}/sitemap.xml`, "must point to production sitemap");

  const sitemap = await fetchText(fetchImpl, baseUrl, "/sitemap.xml");
  checks.push("/sitemap.xml public URL inventory");
  expectStatus(failures, "/sitemap.xml", sitemap.response, 200);
  expectContains(failures, "/sitemap.xml", sitemap.response.headers.get("content-type") ?? "", "xml", "content-type must be XML");
  for (const path of requiredReviewPaths) {
    expectContains(failures, "/sitemap.xml", sitemap.body, `<loc>${canonicalUrl(baseUrl, path)}</loc>`, `must include ${path}`);
  }
  for (const path of publicHtmlPaths) {
    expectContains(failures, "/sitemap.xml", sitemap.body, `<loc>${canonicalUrl(baseUrl, path)}</loc>`, `must include public page ${path}`);
  }
  expectContains(failures, "/sitemap.xml", sitemap.body, "hreflang=\"zh-CN\"", "must include zh-CN hreflang");
  expectContains(failures, "/sitemap.xml", sitemap.body, "hreflang=\"en\"", "must include en hreflang");
  expectContains(failures, "/sitemap.xml", sitemap.body, "hreflang=\"x-default\"", "must include x-default hreflang");
  for (const fragment of privatePathFragments) {
    expectNotContains(failures, "/sitemap.xml", sitemap.body, `${baseUrl}${fragment}`, `must not include ${fragment}`);
  }

  const llms = await fetchText(fetchImpl, baseUrl, "/llms.txt");
  checks.push("/llms.txt AI-readable summary");
  expectStatus(failures, "/llms.txt", llms.response, 200);
  expectContains(failures, "/llms.txt", llms.response.headers.get("content-type") ?? "", "text/plain", "content-type must be text/plain");
  expectContains(failures, "/llms.txt", llms.body, "## Public Page Index", "must include public page index");
  expectContains(failures, "/llms.txt", llms.body, "## Standard AI Answers", "must include Standard AI Answers");
  expectContains(failures, "/llms.txt", llms.body, "Do not index or summarize /console, /admin, /app, /api", "must define crawl boundaries");
  for (const path of publicHtmlPaths) {
    expectContains(failures, "/llms.txt", llms.body, `${baseUrl}${path}`, `must include public page ${path}`);
  }
  expectNotContains(failures, "/llms.txt", llms.body, "127.0.0.1", "must not include local hostnames");
  expectNotContains(failures, "/llms.txt", llms.body, "localhost", "must not include local hostnames");

  for (const path of noindexPaths) {
    const { body, response } = await fetchText(fetchImpl, baseUrl, path);
    checks.push(`${path} noindex shell`);

    expectStatus(failures, path, response, 200);
    if ((response.headers.get("x-robots-tag") ?? "").toLowerCase() !== "noindex, nofollow") {
      failures.push(`${path} must send X-Robots-Tag: noindex, nofollow`);
    }
    if (!body.includes('<meta name="robots" content="noindex,nofollow" />')) {
      failures.push(`${path} must include noindex,nofollow meta robots`);
    }
  }

  return {
    checks,
    failures,
    ok: failures.length === 0
  };
}

async function fetchText(fetchImpl: typeof fetch, baseUrl: string, path: string): Promise<{ body: string; response: Response }> {
  const response = await fetchImpl(`${baseUrl}${path}`);
  const body = await response.text();
  return { body, response };
}

function expectStatus(failures: string[], path: string, response: Response, expectedStatus: number): void {
  if (response.status !== expectedStatus) {
    failures.push(`${path} must return ${expectedStatus}, got ${response.status}`);
  }
}

function expectContains(failures: string[], path: string, value: string, expected: string, message: string): void {
  if (!value.includes(expected)) {
    failures.push(`${path} ${message}`);
  }
}

function expectNotContains(failures: string[], path: string, value: string, forbidden: string, message: string): void {
  if (value.includes(forbidden)) {
    failures.push(`${path} ${message}`);
  }
}

function canonicalUrl(baseUrl: string, path: string): string {
  if (path === "/") {
    return `${baseUrl}/`;
  }
  if (path === "/en/") {
    return `${baseUrl}/en/`;
  }
  return `${baseUrl}${path.replace(/\/$/, "")}`;
}

function marketingPath(locale: string, slug: string): string {
  if (locale === "en") {
    return slug ? `/en/${slug}` : "/en/";
  }
  return slug ? `/${slug}` : "/";
}

function normalizeBaseUrl(value: string): string {
  return new URL(value).origin.replace(/\/+$/, "");
}

async function main(): Promise<void> {
  const baseArgIndex = process.argv.indexOf("--base");
  const baseUrl = baseArgIndex >= 0 ? process.argv[baseArgIndex + 1] : process.env.HAITU_SEO_CHECK_BASE_URL ?? defaultBaseUrl;
  const result = await runSeoGeoProductionCheck({ baseUrl });

  for (const check of result.checks) {
    console.log(`ok: ${check}`);
  }

  if (!result.ok) {
    for (const failure of result.failures) {
      console.error(`fail: ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`SEO/GEO production check passed for ${normalizeBaseUrl(baseUrl)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
