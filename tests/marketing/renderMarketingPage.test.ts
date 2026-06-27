import { describe, expect, it } from "vitest";

import {
  marketingLocales,
  marketingPages,
  renderMarketingPage,
  resolveMarketingRoute
} from "../../src/marketing/renderMarketingPage.js";

describe("marketing SEO renderer", () => {
  it("renders the Chinese root as the canonical acquisition homepage", () => {
    const route = resolveMarketingRoute(new URL("https://haitu.example/"));

    expect(route).toEqual(expect.objectContaining({
      locale: "zh",
      pageSlug: ""
    }));

    const html = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: ""
    });

    expect(html).toContain("<html lang=\"zh-CN\">");
    expect(html).toContain("<title>Haitu 海兔 - 跨境电商 AI 商品视频与图片创作平台</title>");
    expect(html).toContain("面向跨境电商卖家的 AI 商品创意生产平台");
    expect(html).toContain("1688/ERP 表格、商品资料和参考图");
    expect(html).toContain("AI 商品视频生成器");
    expect(html).toContain("TikTok Shop、Amazon、Shopee、Lazada、Shopify");
    expect(html).toContain("<link rel=\"canonical\" href=\"https://haitu.example/\" />");
    expect(html).toContain("<link rel=\"alternate\" hreflang=\"zh-CN\" href=\"https://haitu.example/\" />");
    expect(html).toContain("<link rel=\"alternate\" hreflang=\"en\" href=\"https://haitu.example/en/\" />");
    expect(html).toContain("<script type=\"application/ld+json\">");
    expect(html).toContain("\"@type\":\"SoftwareApplication\"");
    expect(html).toContain("免费诊断商品素材");
  });

  it("renders English alternate pages with localized SEO and links back to Chinese", () => {
    const route = resolveMarketingRoute(new URL("https://haitu.example/en/features/ai-product-video-generator"));

    expect(route).toEqual(expect.objectContaining({
      locale: "en",
      pageSlug: "features/ai-product-video-generator"
    }));

    const html = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "en",
      pageSlug: "features/ai-product-video-generator"
    });

    expect(html).toContain("<html lang=\"en\">");
    expect(html).toContain("<title>AI Product Video Generator for Ecommerce Sellers - Haitu</title>");
    expect(html).toContain("Create product videos from product facts, reference images, and selling points.");
    expect(html).toContain("<link rel=\"canonical\" href=\"https://haitu.example/en/features/ai-product-video-generator\" />");
    expect(html).toContain("<link rel=\"alternate\" hreflang=\"zh-CN\" href=\"https://haitu.example/features/ai-product-video-generator\" />");
    expect(html).toContain("<link rel=\"alternate\" hreflang=\"en\" href=\"https://haitu.example/en/features/ai-product-video-generator\" />");
    expect(html).toContain("中文");
    expect(html).toContain("English");
  });

  it("ships a focused bilingual page set for the first SEO release", () => {
    expect(marketingLocales).toEqual(["zh", "en"]);
    expect(marketingPages.map((page) => page.slug)).toEqual([
      "",
      "features/ai-product-video-generator",
      "features/ai-product-image-generator",
      "features/product-copy-generator",
      "features/batch-product-creative-generation",
      "platforms/tiktok-shop",
      "platforms/amazon",
      "tools/product-title-generator"
    ]);
  });

  it("uses the same warm clay theme tokens as the app console", () => {
    const html = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: ""
    });

    expect(html).toContain("--bg:#f3e6d8");
    expect(html).toContain("--panel:#fffaf3");
    expect(html).toContain("--card:#fff5e9");
    expect(html).toContain("--accent:#0aa394");
    expect(html).toContain("--text:#2a211b");
    expect(html).toContain("--radius:8px");
    expect(html).toContain("-apple-system");
    expect(html).not.toContain("font-family:Charter");
    expect(html).not.toContain("--paper:#f7f6ef");
  });
});
