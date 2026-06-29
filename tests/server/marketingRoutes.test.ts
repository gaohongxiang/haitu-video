import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  marketingLocales,
  marketingPages
} from "../../src/marketing/renderMarketingPage.js";
import { createConsoleServer } from "../../src/server/consoleServer.js";

let tempDirs: string[] = [];

beforeEach(() => {
  vi.stubEnv("HAITU_SECRET_KEY", "0123456789abcdef0123456789abcdef");
  vi.stubEnv("HAITU_DATA_DIR", "");
  vi.stubEnv("HAITU_DB_PATH", "");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("marketing SEO routes", () => {
  it("serves the Chinese homepage publicly while keeping the console shell on /console", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-marketing-routes-"));
    tempDirs.push(root);
    const consoleDistDir = join(root, "dist", "console");
    await mkdir(join(consoleDistDir, "assets"), { recursive: true });
    await writeFile(
      join(consoleDistDir, "index.html"),
      '<!doctype html><html><head><title>Haitu Video Console</title></head><body><div id="root"></div><script type="module" src="/assets/index-test.js"></script></body></html>',
      "utf8"
    );
    await writeFile(join(consoleDistDir, "assets", "index-test.js"), "console.log('react shell');", "utf8");
    const server = createConsoleServer({ rootDir: root, consoleDistDir, autoStartSavedJobs: false });

    const homepageResponse = await server.fetch("/");
    const homepage = await homepageResponse.text();
    const consoleResponse = await server.fetch("/console");
    const appResponse = await server.fetch("/app");
    const adminResponse = await server.fetch("/admin");
    const consoleShell = await consoleResponse.text();
    const app = await appResponse.text();
    const admin = await adminResponse.text();

    expect(homepageResponse.status).toBe(200);
    expect(homepageResponse.headers.get("content-type")).toContain("text/html");
    expect(homepage).toContain("跨境电商商品图片优化与 AI 视频生成平台");
    expect(homepage).toContain("平台模型");
    expect(homepage).toContain("自有模型");
    expect(homepage).toContain("<meta name=\"robots\" content=\"index,follow\" />");
    expect(homepage).toContain("<link rel=\"alternate\" hreflang=\"en\" href=\"https://haitu.online/en/\" />");
    expect(consoleResponse.status).toBe(200);
    expect(consoleResponse.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(consoleShell).toContain('id="root"');
    expect(consoleShell).toContain("Haitu Video Console");
    expect(consoleShell).toContain("<meta name=\"robots\" content=\"noindex,nofollow\" />");
    expect(appResponse.status).toBe(200);
    expect(appResponse.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(app).toContain('id="root"');
    expect(app).toContain("Haitu Video Console");
    expect(app).toContain("<meta name=\"robots\" content=\"noindex,nofollow\" />");
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(admin).toContain('id="root"');
    expect(admin).toContain("Haitu Video Console");
    expect(admin).toContain("<meta name=\"robots\" content=\"noindex,nofollow\" />");
  });

  it("serves English SEO pages, robots.txt, sitemap.xml, and llms.txt", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-marketing-sitemap-"));
    tempDirs.push(root);
    const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

    const englishResponse = await server.fetch("/en/platforms/tiktok-shop");
    const robotsResponse = await server.fetch("/robots.txt");
    const sitemapResponse = await server.fetch("/sitemap.xml");
    const llmsResponse = await server.fetch("/llms.txt");
    const ogImageResponse = await server.fetch("/static/seo-og.png");
    const english = await englishResponse.text();
    const robots = await robotsResponse.text();
    const sitemap = await sitemapResponse.text();
    const llms = await llmsResponse.text();
    const ogImage = Buffer.from(await ogImageResponse.arrayBuffer());

    expect(englishResponse.status).toBe(200);
    expect(english).toContain("<html lang=\"en\">");
    expect(english).toContain("TikTok Shop Product Creative Automation - Haitu");
    expect(english).toContain("Haitu turns product data into short videos, image optimization requests, ad scripts, and multilingual copy for TikTok Shop sellers.");
    expect(robotsResponse.headers.get("content-type")).toContain("text/plain");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Allow: /terms");
    expect(robots).toContain("Allow: /privacy");
    expect(robots).toContain("Allow: /refund");
    expect(robots).toContain("Allow: /contact");
    expect(robots).toContain("Disallow: /app");
    expect(robots).toContain("Disallow: /console");
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toContain("User-agent: OAI-SearchBot");
    expect(robots).toContain("User-agent: GPTBot");
    expect(robots).toContain("Allow: /categories/");
    expect(robots).toContain("Disallow: /api/");
    expect(robots).toContain("Sitemap: https://haitu.online/sitemap.xml");
    expect(sitemapResponse.headers.get("content-type")).toContain("application/xml");
    expect(sitemap).toContain("<loc>https://haitu.online/</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/en/platforms/tiktok-shop</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/features/image-to-product-video</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/features/product-video-storyboard-generator</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/en/features/product-creative-workflow</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/features/product-creative-review-workflow</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/en/features/ecommerce-video-localization</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/features/model-cost-control</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/en/tools/product-video-script-generator</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/use-cases/cross-border-ecommerce</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/en/use-cases/tiktok-shop-product-video</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/platforms/lazada</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/en/platforms/etsy</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/categories/apparel-product-video</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/en/categories/electronics-product-video</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/en/categories/jewelry-product-video</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/categories/baby-products-video</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/en/categories/sports-outdoor-product-video</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/categories/car-accessories-product-video</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/compare/haitu-vs-canva-for-product-video</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/privacy</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/en/refund</loc>");
    expect(sitemap).toContain("<loc>https://haitu.online/contact</loc>");
    expect(sitemap).toContain("<lastmod>2026-06-28</lastmod>");
    expect(sitemap).toContain("hreflang=\"zh-CN\"");
    expect(sitemap).toContain("hreflang=\"en\"");
    expect(sitemap).toContain('hreflang="x-default" href="https://haitu.online/"');
    expect(sitemap).toContain('hreflang="x-default" href="https://haitu.online/features/image-to-product-video"');
    expect(sitemap).toContain('hreflang="x-default" href="https://haitu.online/privacy"');
    expect(llmsResponse.status).toBe(200);
    expect(llmsResponse.headers.get("content-type")).toContain("text/plain");
    expect(llms).toContain("# Haitu");
    expect(llms).toContain("Haitu 嗨兔 is an AI product image optimization and product video creation platform");
    expect(llms).toContain("https://haitu.online/features/image-to-product-video");
    expect(llms).toContain("https://haitu.online/features/product-video-storyboard-generator");
    expect(llms).toContain("https://haitu.online/en/features/product-creative-workflow");
    expect(llms).toContain("https://haitu.online/features/product-creative-review-workflow");
    expect(llms).toContain("https://haitu.online/en/features/ecommerce-video-localization");
    expect(llms).toContain("https://haitu.online/features/model-cost-control");
    expect(llms).toContain("https://haitu.online/en/features/ai-product-video-generator");
    expect(llms).toContain("https://haitu.online/use-cases/cross-border-ecommerce");
    expect(llms).toContain("https://haitu.online/en/use-cases/tiktok-shop-product-video");
    expect(llms).toContain("https://haitu.online/platforms/lazada");
    expect(llms).toContain("https://haitu.online/en/platforms/etsy");
    expect(llms).toContain("https://haitu.online/categories/apparel-product-video");
    expect(llms).toContain("https://haitu.online/en/categories/electronics-product-video");
    expect(llms).toContain("https://haitu.online/en/categories/jewelry-product-video");
    expect(llms).toContain("https://haitu.online/categories/baby-products-video");
    expect(llms).toContain("https://haitu.online/compare/haitu-vs-canva-for-product-video");
    expect(llms).toContain("## Standard AI Answers");
    expect(llms).toContain("What is Haitu?");
    expect(llms).toContain("Haitu 嗨兔 is an AI product image optimization and product video creation platform for cross-border ecommerce sellers.");
    expect(llms).toContain("What is Haitu not?");
    expect(llms).toContain("Haitu is not a physical goods marketplace and is not a general entertainment video generator.");
    expect(llms).toContain("How does Haitu billing work?");
    expect(llms).toContain("Users top up wallet balance and consume that balance for product image optimization, video generation, script organization, model calls, and other digital SaaS services.");
    expect(llms).toContain("Who is Haitu for?");
    expect(llms).toContain("Haitu is for cross-border ecommerce sellers, brand operators, content creators, and agency teams that need to process product data, product images, marketing scripts, and short-video assets in batches.");
    expect(llms).toContain("Do not index or summarize /console, /admin, /app, /api");
    expect(llms).not.toContain("127.0.0.1");
    expect(ogImageResponse.headers.get("content-type")).toContain("image/png");
    expect(ogImage.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });

  it("lists every localized public marketing page in llms.txt for AI answer engines", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-marketing-llms-all-pages-"));
    tempDirs.push(root);
    const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

    const response = await server.fetch("/llms.txt");
    const llms = await response.text();

    expect(response.status).toBe(200);
    expect(llms).toContain("## Public Page Index");
    for (const page of marketingPages) {
      for (const locale of marketingLocales) {
        const path = marketingTestPath(locale, page.slug);

        expect(llms, `${locale}:${page.slug || "/"}`).toContain(`- https://haitu.online${path} —`);
      }
    }
    expect(llms).not.toContain("https://haitu.online/console");
    expect(llms).not.toContain("https://haitu.online/admin");
    expect(llms).not.toContain("https://haitu.online/app");
    expect(llms).not.toContain("https://haitu.online/api");
    expect(llms).not.toContain("127.0.0.1");
  });

  it("lists every localized public marketing page in sitemap.xml with crawl hints and alternates", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-marketing-sitemap-all-pages-"));
    tempDirs.push(root);
    const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

    const response = await server.fetch("/sitemap.xml");
    const sitemap = await response.text();
    const urlEntries = sitemap.match(/  <url>[\s\S]*?  <\/url>/g) ?? [];

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(urlEntries).toHaveLength(marketingPages.length * marketingLocales.length);

    for (const page of marketingPages) {
      for (const locale of marketingLocales) {
        const path = marketingTestPath(locale, page.slug);
        const zhPath = marketingTestPath("zh", page.slug);
        const enPath = marketingTestPath("en", page.slug);
        const loc = `https://haitu.online${path}`;
        const entry = urlEntries.find((item) => item.includes(`<loc>${loc}</loc>`));

        expect(entry, `${locale}:${page.slug || "/"} sitemap entry`).toBeDefined();
        expect(entry, `${locale}:${page.slug || "/"} zh alternate`).toContain(`hreflang="zh-CN" href="https://haitu.online${zhPath}"`);
        expect(entry, `${locale}:${page.slug || "/"} en alternate`).toContain(`hreflang="en" href="https://haitu.online${enPath}"`);
        expect(entry, `${locale}:${page.slug || "/"} x-default`).toContain(`hreflang="x-default" href="https://haitu.online${zhPath}"`);
        expect(entry, `${locale}:${page.slug || "/"} lastmod`).toContain("<lastmod>2026-06-28</lastmod>");
        expect(entry, `${locale}:${page.slug || "/"} changefreq`).toContain(`<changefreq>${page.changefreq}</changefreq>`);
        expect(entry, `${locale}:${page.slug || "/"} priority`).toContain(`<priority>${page.priority}</priority>`);
      }
    }

    expect(sitemap).not.toContain("https://haitu.online/console");
    expect(sitemap).not.toContain("https://haitu.online/admin");
    expect(sitemap).not.toContain("https://haitu.online/app");
    expect(sitemap).not.toContain("https://haitu.online/api");
    expect(sitemap).not.toContain("127.0.0.1");
  });

  it("serves Stripe review policy pages publicly without an authenticated session", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-marketing-policy-pages-"));
    tempDirs.push(root);
    const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

    const policyPages = await Promise.all(
      ["/terms", "/privacy", "/refund", "/contact"].map(async (path) => {
        const response = await server.fetch(path);
        return {
          path,
          response,
          html: await response.text()
        };
      })
    );

    for (const page of policyPages) {
      expect(page.response.status, page.path).toBe(200);
      expect(page.response.headers.get("content-type")).toContain("text/html");
      expect(page.html).toContain("<meta name=\"robots\" content=\"index,follow\" />");
      expect(page.html).not.toContain("Authentication required");
    }
    expect(policyPages.find((page) => page.path === "/terms")?.html).toContain("禁止用途");
    expect(policyPages.find((page) => page.path === "/privacy")?.html).toContain("不保存完整银行卡号");
    expect(policyPages.find((page) => page.path === "/refund")?.html).toContain("未使用余额");
    expect(policyPages.find((page) => page.path === "/contact")?.html).toContain("support@haitu.online");
  });

  it("serves every localized public marketing page as indexable HTML with canonical alternates", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-marketing-all-public-pages-"));
    tempDirs.push(root);
    const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

    for (const page of marketingPages) {
      for (const locale of marketingLocales) {
        const path = marketingTestPath(locale, page.slug);
        const response = await server.fetch(path);
        const html = await response.text();
        const canonical = `https://haitu.online${path}`;
        const zhPath = marketingTestPath("zh", page.slug);
        const enPath = marketingTestPath("en", page.slug);

        expect(response.status, path).toBe(200);
        expect(response.headers.get("content-type"), path).toContain("text/html");
        expect(html, path).toContain("<meta name=\"robots\" content=\"index,follow\" />");
        expect(html, path).toContain(`<link rel="canonical" href="${canonical}" />`);
        expect(html, path).toContain(`<link rel="alternate" hreflang="zh-CN" href="https://haitu.online${zhPath}" />`);
        expect(html, path).toContain(`<link rel="alternate" hreflang="en" href="https://haitu.online${enPath}" />`);
        expect(html, path).toContain(`<link rel="alternate" hreflang="x-default" href="https://haitu.online${zhPath}" />`);
        expect(html, path).toContain("<script type=\"application/ld+json\">");
        expect(html, path).not.toContain("Authentication required");
      }
    }

    const sitemapResponse = await server.fetch("/sitemap.xml");
    const sitemap = await sitemapResponse.text();

    expect(sitemap).not.toContain("https://haitu.online/console");
    expect(sitemap).not.toContain("https://haitu.online/admin");
    expect(sitemap).not.toContain("https://haitu.online/app");
    expect(sitemap).not.toContain("https://haitu.online/api");
  });

  it("redirects duplicate marketing paths to the canonical URL shape", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-marketing-redirects-"));
    tempDirs.push(root);
    const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

    const englishRoot = await server.fetch("/en");
    const canonicalEnglishRoot = await server.fetch("/en/");
    const trailingSlash = await server.fetch("/features/image-to-product-video/");
    const privacyTrailingSlash = await server.fetch("/privacy/");
    const canonicalEnglishHtml = await canonicalEnglishRoot.text();

    expect(englishRoot.status).toBe(301);
    expect(englishRoot.headers.get("location")).toBe("/en/");
    expect(canonicalEnglishRoot.status).toBe(200);
    expect(canonicalEnglishHtml).toContain("<html lang=\"en\">");
    expect(canonicalEnglishHtml).toContain('<link rel="canonical" href="https://haitu.online/en/" />');
    expect(trailingSlash.status).toBe(301);
    expect(trailingSlash.headers.get("location")).toBe("/features/image-to-product-video");
    expect(privacyTrailingSlash.status).toBe(301);
    expect(privacyTrailingSlash.headers.get("location")).toBe("/privacy");
  });

  it("uses the incoming host and forwarded protocol for canonical URLs", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-marketing-origin-"));
    tempDirs.push(root);
    const port = await findOpenPort();
    const running = await createConsoleServer({ rootDir: root, autoStartSavedJobs: false }).listen(port);
    try {
      const response = await fetch(`${running.url}/features/ai-product-video-generator`, {
        headers: {
          "x-forwarded-host": "haitu.online",
          "x-forwarded-proto": "https"
        }
      });
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(html).toContain('<link rel="canonical" href="https://haitu.online/features/ai-product-video-generator" />');
      expect(html).toContain('<link rel="alternate" hreflang="en" href="https://haitu.online/en/features/ai-product-video-generator" />');
    } finally {
      await running.close();
    }
  });
});

async function findOpenPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function marketingTestPath(locale: "zh" | "en", slug: string): string {
  if (!slug) {
    return locale === "en" ? "/en/" : "/";
  }
  return locale === "en" ? `/en/${slug}` : `/${slug}`;
}
