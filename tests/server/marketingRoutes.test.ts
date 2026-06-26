import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  it("serves the Chinese homepage publicly while keeping the app shell on /app", async () => {
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
    const appResponse = await server.fetch("/app");
    const app = await appResponse.text();

    expect(homepageResponse.status).toBe(200);
    expect(homepageResponse.headers.get("content-type")).toContain("text/html");
    expect(homepage).toContain("面向跨境电商卖家的 AI 商品创意生产平台");
    expect(homepage).toContain("<meta name=\"robots\" content=\"index,follow\" />");
    expect(homepage).toContain("<link rel=\"alternate\" hreflang=\"en\" href=\"http://localhost/en/\" />");
    expect(appResponse.status).toBe(200);
    expect(app).toContain('id="root"');
    expect(app).toContain("Haitu Video Console");
    expect(app).toContain("<meta name=\"robots\" content=\"noindex,nofollow\" />");
  });

  it("serves English SEO pages, robots.txt, and sitemap.xml", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-marketing-sitemap-"));
    tempDirs.push(root);
    const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

    const englishResponse = await server.fetch("/en/platforms/tiktok-shop");
    const robotsResponse = await server.fetch("/robots.txt");
    const sitemapResponse = await server.fetch("/sitemap.xml");
    const english = await englishResponse.text();
    const robots = await robotsResponse.text();
    const sitemap = await sitemapResponse.text();

    expect(englishResponse.status).toBe(200);
    expect(english).toContain("<html lang=\"en\">");
    expect(english).toContain("TikTok Shop Product Creative Automation - Haitu");
    expect(english).toContain("Haitu turns product data into short videos, product images, ad scripts, and multilingual copy for TikTok Shop sellers.");
    expect(robotsResponse.headers.get("content-type")).toContain("text/plain");
    expect(robots).toContain("Allow: /$");
    expect(robots).toContain("Disallow: /app");
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toContain("Sitemap: http://localhost/sitemap.xml");
    expect(sitemapResponse.headers.get("content-type")).toContain("application/xml");
    expect(sitemap).toContain("<loc>http://localhost/</loc>");
    expect(sitemap).toContain("<loc>http://localhost/en/platforms/tiktok-shop</loc>");
    expect(sitemap).toContain("hreflang=\"zh-CN\"");
    expect(sitemap).toContain("hreflang=\"en\"");
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
