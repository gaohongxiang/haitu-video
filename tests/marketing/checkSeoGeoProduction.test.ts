import { describe, expect, it } from "vitest";

import { runSeoGeoProductionCheck } from "../../scripts/check-seo-geo-production.js";
import {
  marketingLocales,
  marketingPages
} from "../../src/marketing/renderMarketingPage.js";

function html(options: {
  canonical?: string;
  content?: string;
  noindex?: boolean;
  ogImage?: string;
  siteName?: string;
} = {}): string {
  const robots = options.noindex ? "noindex,nofollow" : "index,follow";
  const canonical = options.canonical ?? "https://haitu.online/";
  const ogImage = options.ogImage ?? "https://haitu.online/static/seo-og.png";
  const siteName = options.siteName ?? "Haitu 嗨兔";

  return `<!doctype html><html><head>
    <meta name="robots" content="${robots}" />
    <link rel="canonical" href="${canonical}" />
    <link rel="alternate" hreflang="zh-CN" href="https://haitu.online/" />
    <link rel="alternate" hreflang="en" href="https://haitu.online/en/" />
    <link rel="alternate" hreflang="x-default" href="https://haitu.online/" />
    <meta property="og:site_name" content="${siteName}" />
    <meta property="og:image" content="${ogImage}" />
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite"}]}</script>
  </head><body>${options.content ?? "Haitu public page"}</body></html>`;
}

function response(body: string, init: {
  contentType?: string;
  headers?: Record<string, string>;
  status?: number;
} = {}): Response {
  return new Response(body, {
    headers: {
      "content-type": init.contentType ?? "text/html; charset=utf-8",
      ...init.headers
    },
    status: init.status ?? 200
  });
}

describe("SEO/GEO production checker", () => {
  it("passes when public pages, machine-readable files, and noindex shells match the production contract", async () => {
    const requests: string[] = [];
    const sitemapEntries = marketingPages.flatMap((page) => marketingLocales.map((locale) => {
      const path = locale === "en" ? (page.slug ? `/en/${page.slug}` : "/en/") : (page.slug ? `/${page.slug}` : "/");
      return `<url><loc>https://haitu.online${path}</loc><xhtml:link rel="alternate" hreflang="zh-CN" href="https://haitu.online${page.slug ? `/${page.slug}` : "/"}" /><xhtml:link rel="alternate" hreflang="en" href="https://haitu.online${page.slug ? `/en/${page.slug}` : "/en/"}" /><xhtml:link rel="alternate" hreflang="x-default" href="https://haitu.online${page.slug ? `/${page.slug}` : "/"}" /></url>`;
    })).join("");
    const llmsPageLines = marketingPages.flatMap((page) => marketingLocales.map((locale) => {
      const path = locale === "en" ? (page.slug ? `/en/${page.slug}` : "/en/") : (page.slug ? `/${page.slug}` : "/");
      return `- https://haitu.online${path} — Haitu page`;
    })).join("\n");
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = new URL(input.toString());
      requests.push(url.pathname);

      if (url.pathname === "/robots.txt") {
        return response("User-agent: *\nAllow: /\nUser-agent: OAI-SearchBot\nAllow: /\nDisallow: /console\nDisallow: /admin\nDisallow: /app\nDisallow: /api/\nSitemap: https://haitu.online/sitemap.xml\n", {
          contentType: "text/plain"
        });
      }
      if (url.pathname === "/sitemap.xml") {
        return response(`<urlset>${sitemapEntries}</urlset>`, {
          contentType: "application/xml"
        });
      }
      if (url.pathname === "/llms.txt") {
        return response(`# Haitu\n\n## Public Page Index\n${llmsPageLines}\n\n## Standard AI Answers\nWhat is Haitu?\nDo not index or summarize /console, /admin, /app, /api\n`, {
          contentType: "text/plain"
        });
      }
      if (url.pathname === "/console" || url.pathname === "/admin" || url.pathname === "/app") {
        return response(html({
          canonical: `https://haitu.online${url.pathname}`,
          noindex: true
        }), {
          headers: {
            "x-robots-tag": "noindex, nofollow"
          }
        });
      }
      return response(html({
        canonical: `https://haitu.online${url.pathname === "/" ? "/" : url.pathname}`,
        content: url.pathname === "/" ? "更懂电商商品的 AI 创作控制台" : "Haitu public policy page",
        siteName: url.pathname.startsWith("/en") ? "Haitu" : "Haitu 嗨兔"
      }));
    };

    const result = await runSeoGeoProductionCheck({
      baseUrl: "https://haitu.online",
      fetchImpl
    });

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(requests).toEqual(expect.arrayContaining([
      "/",
      "/en/",
      "/features/ai-product-video-generator",
      "/en/features/ai-product-video-generator",
      "/categories/car-accessories-product-video",
      "/en/compare/haitu-vs-manual-product-video-production",
      "/terms",
      "/privacy",
      "/refund",
      "/contact",
      "/robots.txt",
      "/sitemap.xml",
      "/llms.txt",
      "/console",
      "/admin",
      "/app"
    ]));
  });

  it("reports missing noindex and private URLs in sitemap as failures", async () => {
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = new URL(input.toString());

      if (url.pathname === "/sitemap.xml") {
        return response("<urlset><url><loc>https://haitu.online/console</loc></url></urlset>", {
          contentType: "application/xml"
        });
      }
      if (url.pathname === "/robots.txt") {
        return response("User-agent: *\nAllow: /\nSitemap: https://haitu.online/sitemap.xml\n", {
          contentType: "text/plain"
        });
      }
      if (url.pathname === "/llms.txt") {
        return response("# Haitu\n", {
          contentType: "text/plain"
        });
      }
      if (url.pathname === "/console" || url.pathname === "/admin" || url.pathname === "/app") {
        return response(html({
          canonical: `https://haitu.online${url.pathname}`
        }));
      }
      return response(html({
        canonical: `https://haitu.online${url.pathname === "/" ? "/" : url.pathname}`
      }));
    };

    const result = await runSeoGeoProductionCheck({
      baseUrl: "https://haitu.online",
      fetchImpl
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(expect.arrayContaining([
      "/sitemap.xml must not include /console",
      "/console must send X-Robots-Tag: noindex, nofollow",
      "/console must include noindex,nofollow meta robots",
      "/llms.txt must include Standard AI Answers",
      "/llms.txt must include public page /en/features/ai-product-video-generator"
    ]));
  });
});
