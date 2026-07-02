import { afterEach, describe, expect, it, vi } from "vitest";

import {
  matchMarketingRoute,
  marketingLocales,
  marketingPages,
  renderMarketingPage,
  resolveMarketingRoute
} from "../../src/marketing/renderMarketingPage.js";
import {
  defaultLocale,
  getLocaleMeta,
  supportedLocales
} from "../../src/i18n/config.js";
import {
  createServerI18n,
  getMarketingPageContent
} from "../../src/i18n/server.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("marketing SEO renderer", () => {
  const seoDescriptionLengthByLocale = {
    en: { max: 180, min: 50 },
    zh: { max: 120, min: 30 }
  } as const;

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
    expect(html).toContain("<title>Haitu 嗨兔 - 跨境电商 AI 商品视频与图片创作平台</title>");
    expect(html).toContain('<link rel="icon" href="/favicon.svg?v=haitu" type="image/svg+xml" />');
    expect(html).toContain("跨境电商商品图片优化与 AI 视频生成平台");
    expect(html).toContain("商品图片优化");
    expect(html).toContain("平台模型或接入自有模型");
    expect(html).toContain("AI 商品视频生成器");
    expect(html).toContain("TikTok Shop、Amazon、Shopee、Lazada、Shopify");
    expect(html).toContain("<link rel=\"canonical\" href=\"https://haitu.example/\" />");
    expect(html).toContain("<link rel=\"alternate\" hreflang=\"zh-CN\" href=\"https://haitu.example/\" />");
    expect(html).toContain("<link rel=\"alternate\" hreflang=\"en\" href=\"https://haitu.example/en/\" />");
    expect(html).toContain("<script type=\"application/ld+json\">");
    expect(html).toContain("\"@type\":\"SoftwareApplication\"");
    expect(html).toContain('<meta property="og:locale" content="zh_CN" />');
    expect(html).toContain('<meta property="og:locale:alternate" content="en_US" />');
    expect(html).toContain('<meta property="og:image" content="https://haitu.example/static/seo-og.png" />');
    expect(html).toContain('<meta property="og:image:type" content="image/png" />');
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta property="og:image:height" content="630" />');
    expect(html).toContain('<meta property="og:image:alt" content="Haitu 嗨兔跨境电商 AI 商品图片优化与商品视频创作平台预览图" />');
    expect(html).toContain('<meta name="twitter:title" content="Haitu 嗨兔 - 跨境电商 AI 商品视频与图片创作平台" />');
    expect(html).toContain('<meta name="twitter:description" content="Haitu 嗨兔是跨境电商 AI 商品图片和视频创作平台，帮助卖家上传和管理商品资料，优化商品图、营销脚本和短视频创作，并通过余额支付数字化 SaaS 服务。" />');
    expect(html).toContain('<meta name="twitter:image:alt" content="Haitu 嗨兔跨境电商 AI 商品图片优化与商品视频创作平台预览图" />');
    expect(html).toContain('class="seo-footer"');
    expect(html).toContain("商品图片转视频");
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/contact"');
    expect(html).toContain("开始优化商品图");
    expect(html).toContain('href="/console"');
    expect(html).toContain("先看清楚怎么用、怎么扣费");
    expect(html).toContain("Stripe Checkout");
    expect(html).toContain("优化商品图、营销脚本和短视频");
    expect(html).toContain("商品图优化、营销脚本整理和短视频生成");
    expect(html).toContain("余额用于商品图优化、视频生成和脚本整理");
    expect(html).toContain("class=\"geo-answer-block\"");
    expect(html).toContain("Haitu 是什么？");
    expect(html).toContain("Haitu 嗨兔是面向跨境电商卖家的 AI 商品图片优化与商品视频创作平台");
    expect(html).toContain("Haitu 不是实物商品商城");
    expect(html).toContain("\"@type\":\"Organization\"");
    expect(html).toContain("\"@type\":\"ContactPoint\"");
    expect(html).toContain("\"email\":\"support@haitu.online\"");
    expect(html).not.toContain("生成商品图、营销脚本和短视频");
    expect(html).not.toContain("AI 商品图生成</li>");
    expect(html).not.toContain("余额用于 AI 图片生成");
  });

  it("keeps the homepage footer curated while long-tail SEO pages stay outside the visual link grid", () => {
    const html = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: ""
    });
    const footer = extractSeoFooter(html);

    expect(footer).toContain("跨境电商 AI 商品图片优化与商品视频创作平台");
    expect(footer).toContain('href="/features/product-image-optimization"');
    expect(footer).toContain('href="/features/ai-product-video-generator"');
    expect(footer).toContain('href="/features/bring-your-own-model"');
    expect(footer).toContain('href="/platforms/tiktok-shop"');
    expect(footer).toContain('href="/platforms/amazon"');
    expect(footer).toContain('href="/use-cases/cross-border-ecommerce"');
    expect(footer).toContain('href="/terms"');
    expect(footer).toContain('href="/privacy"');
    expect(footer).toContain('href="/refund"');
    expect(footer).toContain('href="/contact"');
    expect(footer).not.toContain('href="/categories/baby-products-video"');
    expect(footer).not.toContain('href="/categories/car-accessories-product-video"');
    expect(footer).not.toContain('href="/compare/haitu-vs-manual-product-video-production"');
    expect((footer.match(/<a /g) ?? []).length).toBeLessThanOrEqual(24);
  });

  it("uses the production public origin and PNG social preview for local SEO requests", () => {
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "");

    const html = renderMarketingPage({
      origin: "http://127.0.0.1:4173",
      locale: "zh",
      pageSlug: ""
    });

    expect(html).toContain('<link rel="canonical" href="https://haitu.online/" />');
    expect(html).toContain('<link rel="alternate" hreflang="en" href="https://haitu.online/en/" />');
    expect(html).toContain('<meta property="og:image" content="https://haitu.online/static/seo-og.png" />');
    expect(html).toContain('<meta name="twitter:image" content="https://haitu.online/static/seo-og.png" />');
    expect(html).toContain('"url":"https://haitu.online/"');
    expect(html).not.toContain("127.0.0.1:4173/static/seo-og.svg");
  });

  it("renders complete social metadata and language-aware JSON-LD for every public page", () => {
    const expectedOgLocale = {
      en: "en_US",
      zh: "zh_CN"
    } as const;
    const expectedSiteName = {
      en: "Haitu",
      zh: "Haitu 嗨兔"
    } as const;

    for (const page of marketingPages) {
      for (const locale of marketingLocales) {
        const content = getMarketingPageContent(locale, page.slug);
        const path = marketingRendererTestPath(locale, page.slug);
        const canonical = `https://haitu.example${path}`;
        const html = renderMarketingPage({
          origin: "https://haitu.example",
          locale,
          pageSlug: page.slug
        });
        const graph = getJsonLdGraph(html);
        const website = findStructuredDataNode(graph, "WebSite");
        const primaryNode = graph.find((node) => {
          const type = node["@type"];
          return type === "SoftwareApplication" || type === "WebPage" || type === "ContactPage";
        });
        const faqPage = findStructuredDataNode(graph, "FAQPage");

        expect(getHeadMetaContent(html, "property", "og:type"), `${locale}:${page.slug || "/"} og:type`).toBe("website");
        expect(getHeadMetaContent(html, "property", "og:site_name"), `${locale}:${page.slug || "/"} og:site_name`).toBe(expectedSiteName[locale]);
        expect(getHeadMetaContent(html, "property", "og:locale"), `${locale}:${page.slug || "/"} og:locale`).toBe(expectedOgLocale[locale]);
        expect(html, `${locale}:${page.slug || "/"} og alternate`).toContain(`<meta property="og:locale:alternate" content="${expectedOgLocale[locale === "zh" ? "en" : "zh"]}" />`);
        expect(getHeadMetaContent(html, "property", "og:title"), `${locale}:${page.slug || "/"} og:title`).toBe(content.title);
        expect(getHeadMetaContent(html, "property", "og:description"), `${locale}:${page.slug || "/"} og:description`).toBe(content.description);
        expect(getHeadMetaContent(html, "property", "og:url"), `${locale}:${page.slug || "/"} og:url`).toBe(canonical);
        expect(getHeadMetaContent(html, "property", "og:image"), `${locale}:${page.slug || "/"} og:image`).toBe("https://haitu.example/static/seo-og.png");
        expect(getHeadMetaContent(html, "property", "og:image:type"), `${locale}:${page.slug || "/"} og:image:type`).toBe("image/png");
        expect(getHeadMetaContent(html, "property", "og:image:width"), `${locale}:${page.slug || "/"} og:image:width`).toBe("1200");
        expect(getHeadMetaContent(html, "property", "og:image:height"), `${locale}:${page.slug || "/"} og:image:height`).toBe("630");
        expect(getHeadMetaContent(html, "property", "og:image:alt"), `${locale}:${page.slug || "/"} og:image:alt`).not.toBe("");
        expect(getHeadMetaContent(html, "name", "twitter:card"), `${locale}:${page.slug || "/"} twitter:card`).toBe("summary_large_image");
        expect(getHeadMetaContent(html, "name", "twitter:title"), `${locale}:${page.slug || "/"} twitter:title`).toBe(content.title);
        expect(getHeadMetaContent(html, "name", "twitter:description"), `${locale}:${page.slug || "/"} twitter:description`).toBe(content.description);
        expect(getHeadMetaContent(html, "name", "twitter:image"), `${locale}:${page.slug || "/"} twitter:image`).toBe("https://haitu.example/static/seo-og.png");
        expect(getHeadMetaContent(html, "name", "twitter:image:alt"), `${locale}:${page.slug || "/"} twitter:image:alt`).not.toBe("");
        expect(website, `${locale}:${page.slug || "/"} WebSite`).toEqual(expect.objectContaining({
          "@type": "WebSite",
          inLanguage: getLocaleMeta(locale).hreflang,
          name: expectedSiteName[locale],
          url: `https://haitu.example${marketingRendererTestPath(locale, "")}`
        }));
        expect(primaryNode, `${locale}:${page.slug || "/"} primary node`).toEqual(expect.objectContaining({
          dateModified: "2026-06-28",
          inLanguage: getLocaleMeta(locale).hreflang,
          url: canonical
        }));
        expect(faqPage, `${locale}:${page.slug || "/"} FAQPage`).toEqual(expect.objectContaining({
          inLanguage: getLocaleMeta(locale).hreflang
        }));
      }
    }
  });

  it("centralizes locale metadata and marketing translations in i18next resources", () => {
    expect(defaultLocale).toBe("zh");
    expect(supportedLocales).toEqual(["zh", "en"]);
    expect(marketingLocales).toBe(supportedLocales);
    expect(getLocaleMeta("zh")).toEqual(expect.objectContaining({
      label: "中文",
      hreflang: "zh-CN",
      htmlLang: "zh-CN",
      pathPrefix: ""
    }));
    expect(getLocaleMeta("en")).toEqual(expect.objectContaining({
      label: "English",
      hreflang: "en",
      htmlLang: "en",
      pathPrefix: "/en"
    }));

    const i18n = createServerI18n("en", ["common", "marketing"]);

    expect(i18n.t("common:navigation.imageOptimization")).toBe("Images");
    expect(i18n.t("marketing:pages.home.title")).toBe("Haitu - AI Product Image Optimization and Video Generation Platform");
    expect(getMarketingPageContent("zh", "")).toEqual(expect.objectContaining({
      h1: "跨境电商商品图片优化与 AI 视频生成平台",
      primaryCta: "开始优化商品图"
    }));
  });

  it("uses the real logo asset and a language dropdown in the header", () => {
    const html = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: ""
    });

    expect(html).toContain('class="brand-logo" src="/static/logo.svg"');
    expect(html).toContain("<details class=\"language-switcher\" data-language-switcher>");
    expect(html).toContain("class=\"language-icon\"");
    expect(html).toContain("<span class=\"sr-only\">语言</span>");
    expect(html).toContain('<a href="/features/product-image-optimization">商品图优化</a>');
    expect(html).not.toContain('<a href="/features/ai-product-image-generator">商品图优化</a>');
    expect(html).toContain("<div class=\"language-menu\">");
    expect(html).toContain('href="/en/"');
    expect(html).toContain("document.addEventListener(\"click\"");
    expect(html).toContain("removeAttribute(\"open\")");
    expect(html).toContain(".language-menu{left:0;right:auto}");
    expect(html).not.toContain(".language-switcher summary::after");
  });

  it("keeps planned image generation SEO honest while routing users to current workflows", () => {
    const html = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: "features/ai-product-image-generator"
    });

    expect(html).toContain("<title>AI 商品图生成器规划 - Haitu</title>");
    expect(html).toContain("图片创作功能还没完整上线");
    expect(html).toContain("Haitu 的 AI 商品图生成器当前是什么状态？");
    expect(html).toContain("当前完整图片创作功能还没有上线");
    expect(html).toContain("先整理商品图");
    expect(html).toContain("后续主图生成");
    expect(html).not.toContain("完整图片创作功能已经上线");
  });

  it("renders GEO answer blocks on feature pages for AI answer engines", () => {
    const video = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: "features/image-to-product-video"
    });
    const english = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "en",
      pageSlug: "features/image-to-product-video"
    });

    expect(video).toContain("class=\"geo-answer-block\"");
    expect(video).toContain("Haitu 的商品图片转视频功能是什么？");
    expect(video).toContain("它不是普通娱乐视频生成器");
    expect(english).toContain("What is Haitu image-to-product-video?");
    expect(english).toContain("It is not a general entertainment video generator");
    expect(english).toContain("class=\"geo-answer-block\"");
  });

  it("uses page-specific GEO answer blocks across model, platform, and tool pages", () => {
    const hostedModels = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: "features/hosted-ai-models"
    });
    const ownModels = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "en",
      pageSlug: "features/bring-your-own-model"
    });
    const tiktokShop = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: "platforms/tiktok-shop"
    });
    const scriptTool = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "en",
      pageSlug: "tools/product-video-script-generator"
    });

    expect(hostedModels).toContain("Haitu 的平台 AI 模型托管适合什么团队？");
    expect(hostedModels).toContain("不用先申请多个模型服务商账号");
    expect(ownModels).toContain("What does bring-your-own-model mean in Haitu?");
    expect(ownModels).toContain("connect their own text, image, or video model APIs");
    expect(tiktokShop).toContain("Haitu 如何帮助 TikTok Shop 卖家？");
    expect(tiktokShop).toContain("围绕 TikTok Shop 的短视频、商品图优化需求、广告卖点和本地化文案");
    expect(scriptTool).toContain("What does the Haitu product video script generator do?");
    expect(scriptTool).toContain("turns product facts, selling points, pain points, and usage scenes into short-video scripts");
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
    expect(html).toContain('<meta property="og:locale" content="en_US" />');
    expect(html).toContain('<meta property="og:locale:alternate" content="zh_CN" />');
    expect(html).toContain("中文");
    expect(html).toContain("English");
  });

  it("adds multilingual layout guards for long English SEO headings", () => {
    const html = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "en",
      pageSlug: "features/batch-product-creative-generation"
    });

    expect(html).toContain('<body class="locale-en">');
    expect(html).toContain('<section class="hero-stage hero-subpage">');
    expect(html).toContain("Batch product image optimization and video generation");
    expect(html).toContain("<span>Batch product image</span><span>optimization and video generation</span>");
    expect(html).toContain(".locale-en h1");
    expect(html).toContain(".hero-subpage h1");
    expect(html).toContain(".locale-en .hero-subpage h1");
    expect(html).toContain("overflow-wrap:anywhere");
  });

  it("ships a focused bilingual SEO page set for ecommerce creative search intent", () => {
    expect(marketingLocales).toEqual(["zh", "en"]);
    expect(marketingPages.map((page) => page.slug)).toEqual([
      "",
      "features/ai-product-video-generator",
      "features/product-image-optimization",
      "features/ai-product-image-generator",
      "features/image-to-product-video",
      "features/product-copy-generator",
      "features/batch-product-creative-generation",
      "features/hosted-ai-models",
      "features/bring-your-own-model",
      "features/product-image-background-cleanup",
      "features/product-reference-image-management",
      "features/product-video-storyboard-generator",
      "features/product-creative-workflow",
      "features/product-creative-review-workflow",
      "features/ecommerce-video-localization",
      "features/model-cost-control",
      "platforms/tiktok-shop",
      "platforms/amazon",
      "platforms/shopee",
      "platforms/shopify",
      "platforms/lazada",
      "platforms/etsy",
      "tools/product-title-generator",
      "tools/product-video-script-generator",
      "use-cases/cross-border-ecommerce",
      "use-cases/tiktok-shop-product-video",
      "use-cases/amazon-product-image-optimization",
      "use-cases/fashion-product-video",
      "use-cases/home-goods-product-video",
      "use-cases/beauty-product-short-video",
      "categories/apparel-product-video",
      "categories/home-goods-product-video",
      "categories/beauty-product-video",
      "categories/electronics-product-video",
      "categories/pet-supplies-product-video",
      "categories/kitchen-product-video",
      "categories/jewelry-product-video",
      "categories/baby-products-video",
      "categories/sports-outdoor-product-video",
      "categories/car-accessories-product-video",
      "compare/ai-product-video-generator-vs-general-video-generator",
      "compare/haitu-vs-canva-for-product-video",
      "compare/haitu-vs-manual-product-video-production",
      "terms",
      "privacy",
      "refund",
      "contact"
    ]);
  });

  it("keeps localized SEO titles and descriptions complete and unique", () => {
    for (const locale of marketingLocales) {
      const titles = new Map<string, string[]>();
      const descriptions = new Map<string, string[]>();
      const descriptionLength = seoDescriptionLengthByLocale[locale];

      for (const page of marketingPages) {
        const content = getMarketingPageContent(locale, page.slug);
        const slug = page.slug || "/";

        expect(content.title.trim(), `${locale}:${slug} title`).not.toBe("");
        expect(content.description.trim(), `${locale}:${slug} description`).not.toBe("");
        expect(content.title.length, `${locale}:${slug} title length`).toBeLessThanOrEqual(70);
        expect(content.description.length, `${locale}:${slug} description min length`).toBeGreaterThanOrEqual(descriptionLength.min);
        expect(content.description.length, `${locale}:${slug} description max length`).toBeLessThanOrEqual(descriptionLength.max);

        titles.set(content.title, [...(titles.get(content.title) ?? []), slug]);
        descriptions.set(content.description, [...(descriptions.get(content.description) ?? []), slug]);
      }

      const duplicateTitles = [...titles.entries()].filter(([, slugs]) => slugs.length > 1);
      const duplicateDescriptions = [...descriptions.entries()].filter(([, slugs]) => slugs.length > 1);

      expect(duplicateTitles, `${locale} duplicate SEO titles`).toEqual([]);
      expect(duplicateDescriptions, `${locale} duplicate SEO descriptions`).toEqual([]);
    }
  });

  it("gives each core acquisition page at least four localized GEO FAQs", () => {
    const coreAcquisitionSlugs = [
      "",
      "features/ai-product-video-generator",
      "features/product-image-optimization",
      "features/ai-product-image-generator",
      "features/image-to-product-video",
      "features/product-copy-generator",
      "features/batch-product-creative-generation",
      "features/hosted-ai-models",
      "features/bring-your-own-model",
      "features/product-image-background-cleanup",
      "features/product-reference-image-management",
      "features/product-video-storyboard-generator",
      "features/product-creative-workflow",
      "features/product-creative-review-workflow",
      "features/ecommerce-video-localization",
      "features/model-cost-control",
      "platforms/tiktok-shop",
      "platforms/amazon",
      "platforms/shopee",
      "platforms/shopify",
      "platforms/lazada",
      "platforms/etsy",
      "tools/product-title-generator",
      "tools/product-video-script-generator",
      "use-cases/cross-border-ecommerce",
      "use-cases/tiktok-shop-product-video",
      "use-cases/amazon-product-image-optimization",
      "use-cases/fashion-product-video",
      "use-cases/home-goods-product-video",
      "use-cases/beauty-product-short-video",
      "categories/apparel-product-video",
      "categories/home-goods-product-video",
      "categories/beauty-product-video",
      "categories/electronics-product-video",
      "categories/pet-supplies-product-video",
      "categories/kitchen-product-video",
      "categories/jewelry-product-video",
      "categories/baby-products-video",
      "categories/sports-outdoor-product-video",
      "categories/car-accessories-product-video",
      "compare/ai-product-video-generator-vs-general-video-generator",
      "compare/haitu-vs-canva-for-product-video",
      "compare/haitu-vs-manual-product-video-production"
    ];

    for (const locale of marketingLocales) {
      for (const slug of coreAcquisitionSlugs) {
        const content = getMarketingPageContent(locale, slug);

        expect(content.faqs.length, `${locale}:${slug || "/"}`).toBeGreaterThanOrEqual(4);
      }
    }

    expect(getMarketingPageContent("zh", "features/ai-product-video-generator").faqs.map((faq) => faq.question)).toContain("Haitu 和普通 AI 视频生成器有什么区别？");
    expect(getMarketingPageContent("en", "features/bring-your-own-model").faqs.map((faq) => faq.question)).toContain("Will Haitu change the language of uploaded product data?");
    expect(getMarketingPageContent("zh", "platforms/tiktok-shop").faqs.map((faq) => faq.question)).toContain("Haitu 适合 TikTok Shop 卖家吗？");
    expect(getMarketingPageContent("en", "tools/product-video-script-generator").faqs.map((faq) => faq.question)).toContain("Can the script be used directly for product video generation?");
  });

  it("renders use-case pages for high-intent ecommerce creative searches", () => {
    const crossBorder = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: "use-cases/cross-border-ecommerce"
    });
    const tiktok = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "en",
      pageSlug: "use-cases/tiktok-shop-product-video"
    });

    expect(crossBorder).toContain("<title>跨境电商 AI 商品素材工作流 - Haitu</title>");
    expect(crossBorder).toContain("Haitu 如何帮助跨境电商团队批量做商品素材？");
    expect(crossBorder).toContain("从商品资料、商品图、卖点和参考图出发");
    expect(crossBorder).toContain("跨境电商卖家如何批量优化商品图和生成短视频？");
    expect(crossBorder).toContain('href="/use-cases/tiktok-shop-product-video"');
    expect(tiktok).toContain("<title>TikTok Shop Product Video Workflow - Haitu</title>");
    expect(tiktok).toContain("How does Haitu help TikTok Shop sellers create product videos?");
    expect(tiktok).toContain("short-video scripts, storyboards, localized selling points, and product video assets");
    expect(tiktok).toContain("Which inputs make TikTok Shop product videos better?");
    expect(tiktok).toContain('href="/en/use-cases/cross-border-ecommerce"');
  });

  it("renders new platform pages and comparison pages without competitor-bashing copy", () => {
    const lazada = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: "platforms/lazada"
    });
    const etsy = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "en",
      pageSlug: "platforms/etsy"
    });
    const comparison = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "en",
      pageSlug: "compare/haitu-vs-canva-for-product-video"
    });

    expect(lazada).toContain("<title>Lazada 商品图片与视频素材生成 - Haitu</title>");
    expect(lazada).toContain("Haitu 如何帮助 Lazada 卖家准备商品素材？");
    expect(lazada).toContain("东南亚电商商品页、广告素材和短视频内容");
    expect(etsy).toContain("<title>Etsy Product Image and Video Creative Workflow - Haitu</title>");
    expect(etsy).toContain("How does Haitu help Etsy sellers prepare product creatives?");
    expect(etsy).toContain("handmade, craft, vintage, and personalized product listings");
    expect(comparison).toContain("<title>Haitu vs Canva for Product Video Workflows - Haitu</title>");
    expect(comparison).toContain("How is Haitu different from Canva for product video workflows?");
    expect(comparison).toContain("Canva is useful for general design and layout work");
    expect(comparison).toContain("Haitu focuses on product facts, reference images, scripts, model workflows, and ecommerce video generation");
    expect(comparison).not.toContain("Canva is bad");
    expect(comparison).not.toContain("better than Canva");
  });

  it("renders category pages for product vertical SEO without changing user product language", () => {
    const apparel = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: "categories/apparel-product-video"
    });
    const electronics = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "en",
      pageSlug: "categories/electronics-product-video"
    });
    const pet = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: "categories/pet-supplies-product-video"
    });

    expect(apparel).toContain("<title>服饰商品短视频生成 - Haitu</title>");
    expect(apparel).toContain("Haitu 如何帮助服饰卖家生成商品短视频？");
    expect(apparel).toContain("款式、版型、材质、颜色、尺码、细节图和穿搭场景");
    expect(apparel).toContain('href="/features/ai-product-video-generator"');
    expect(apparel).not.toContain('href="/categories/home-goods-product-video"');
    expect(electronics).toContain("<title>Electronics Accessory Product Video Workflow - Haitu</title>");
    expect(electronics).toContain("How does Haitu support electronics accessory product videos?");
    expect(electronics).toContain("specifications, compatibility, ports, materials, usage scenes, and safety notes");
    expect(electronics).toContain("Site language switching does not automatically translate uploaded product specs");
    expect(pet).toContain("<title>宠物用品商品短视频生成 - Haitu</title>");
    expect(pet).toContain("Haitu 如何帮助宠物用品卖家准备商品视频？");
    expect(pet).toContain("尺寸、材质、适用宠物、使用场景和安全注意事项");
    expect(pet).not.toContain("自动翻译用户上传的商品资料");
  });

  it("renders workflow feature pages with honest image and storyboard boundaries", () => {
    const cleanup = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: "features/product-image-background-cleanup"
    });
    const reference = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "en",
      pageSlug: "features/product-reference-image-management"
    });
    const storyboard = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: "features/product-video-storyboard-generator"
    });
    const workflow = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "en",
      pageSlug: "features/product-creative-workflow"
    });

    expect(cleanup).toContain("<title>商品图背景清洁化工作流 - Haitu</title>");
    expect(cleanup).toContain("Haitu 的商品图背景清洁化适合什么场景？");
    expect(cleanup).toContain("先整理商品原图、参考图、背景需求和平台规则");
    expect(cleanup).not.toContain("完整图片创作功能已经上线");
    expect(reference).toContain("<title>Product Reference Image Management for Ecommerce AI - Haitu</title>");
    expect(reference).toContain("How does Haitu manage product reference images?");
    expect(reference).toContain("reference images, detail shots, scene examples, style constraints, and blocked visual directions");
    expect(storyboard).toContain("<title>商品视频分镜生成器 - Haitu</title>");
    expect(storyboard).toContain("Haitu 的商品视频分镜生成器做什么？");
    expect(storyboard).toContain("开场钩子、痛点、卖点顺序、镜头结构、字幕方向和 CTA");
    expect(workflow).toContain("<title>Product Creative Workflow for Images, Scripts, and Videos - Haitu</title>");
    expect(workflow).toContain("What is the Haitu product creative workflow?");
    expect(workflow).toContain("product facts, images, references, scripts, storyboards, model choices, and review steps");
  });

  it("renders second-wave GEO pages for review, localization, cost control, and more product categories", () => {
    const review = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: "features/product-creative-review-workflow"
    });
    const localization = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "en",
      pageSlug: "features/ecommerce-video-localization"
    });
    const costControl = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: "features/model-cost-control"
    });
    const jewelry = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "en",
      pageSlug: "categories/jewelry-product-video"
    });
    const baby = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: "categories/baby-products-video"
    });
    const sports = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "en",
      pageSlug: "categories/sports-outdoor-product-video"
    });
    const car = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: "categories/car-accessories-product-video"
    });

    expect(review).toContain("<title>商品素材审核工作流 - Haitu</title>");
    expect(review).toContain("Haitu 的商品素材审核工作流解决什么问题？");
    expect(review).toContain("商品事实、平台规则、广告表达、图片和视频素材");
    expect(review).toContain("发布前");
    expect(localization).toContain("<title>Ecommerce Video Localization Workflow - Haitu</title>");
    expect(localization).toContain("How does Haitu localize ecommerce product videos?");
    expect(localization).toContain("scripts, subtitles, selling points, and review notes");
    expect(costControl).toContain("<title>模型成本和余额消耗控制 - Haitu</title>");
    expect(costControl).toContain("Haitu 如何帮助团队控制模型成本？");
    expect(costControl).toContain("平台模型和自有模型");
    expect(jewelry).toContain("<title>Jewelry Product Video Workflow - Haitu</title>");
    expect(jewelry).toContain("How does Haitu support jewelry product videos?");
    expect(jewelry).toContain("materials, plating, dimensions, wearing scenes, close-up detail shots");
    expect(baby).toContain("<title>母婴商品短视频生成 - Haitu</title>");
    expect(baby).toContain("安全边界、适用年龄、材质和使用场景");
    expect(sports).toContain("<title>Sports and Outdoor Product Video Workflow - Haitu</title>");
    expect(sports).toContain("activity scenes, materials, size, weather, storage, and safety notes");
    expect(car).toContain("<title>汽车配件商品短视频生成 - Haitu</title>");
    expect(car).toContain("适配车型、安装步骤、材质和使用效果");
    expect(car).not.toContain("自动翻译用户上传的商品资料");
  });

  it("normalizes duplicate marketing paths to canonical URLs", () => {
    expect(matchMarketingRoute(new URL("https://haitu.example/en"))).toEqual(expect.objectContaining({
      redirectPath: "/en/"
    }));
    expect(matchMarketingRoute(new URL("https://haitu.example/en/"))).toEqual(expect.objectContaining({
      route: expect.objectContaining({
        locale: "en",
        pageSlug: ""
      })
    }));
    expect(matchMarketingRoute(new URL("https://haitu.example/en/")).redirectPath).toBeUndefined();
    expect(matchMarketingRoute(new URL("https://haitu.example/features/image-to-product-video/"))).toEqual(expect.objectContaining({
      redirectPath: "/features/image-to-product-video"
    }));
    expect(matchMarketingRoute(new URL("https://haitu.example/features/image-to-product-video"))).toEqual(expect.objectContaining({
      route: expect.objectContaining({
        locale: "zh",
        pageSlug: "features/image-to-product-video"
      })
    }));
    expect(matchMarketingRoute(new URL("https://haitu.example/privacy/"))).toEqual(expect.objectContaining({
      redirectPath: "/privacy"
    }));
  });

  it("renders trust pages for policies, refunds, and contact", () => {
    const privacy = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: "privacy"
    });
    const englishRefund = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "en",
      pageSlug: "refund"
    });

    expect(privacy).toContain("<title>隐私政策 - Haitu</title>");
    expect(privacy).toContain("商品资料保持用户输入的语言");
    expect(privacy).toContain("不保存完整银行卡号、微信支付账号或支付宝账号");
    expect(privacy).toContain('<link rel="alternate" hreflang="en" href="https://haitu.example/en/privacy" />');
    expect(englishRefund).toContain("<title>Refund Policy - Haitu</title>");
    expect(englishRefund).toContain('href="/en/contact"');
    expect(englishRefund).toContain("unused balance");
    expect(englishRefund).toContain("Stripe Checkout");
    expect(englishRefund).toContain("Consumed AI generation services are generally non-refundable");
  });

  it("uses page-appropriate JSON-LD types for acquisition, policy, and contact pages", () => {
    const feature = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "en",
      pageSlug: "features/image-to-product-video"
    });
    const terms = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: "terms"
    });
    const contact = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "en",
      pageSlug: "contact"
    });

    expect(feature).toContain("\"@type\":\"SoftwareApplication\"");
    expect(feature).toContain("\"@type\":\"FAQPage\"");
    expect(terms).toContain("\"@type\":\"WebPage\"");
    expect(terms).not.toContain("\"@type\":\"SoftwareApplication\"");
    expect(contact).toContain("\"@type\":\"ContactPage\"");
    expect(contact).toContain("\"@type\":\"ContactPoint\"");
    expect(contact).not.toContain("\"@type\":\"SoftwareApplication\"");
  });

  it("keeps JSON-LD breadcrumbs and FAQs aligned with visible page content", () => {
    const homepage = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: ""
    });
    const subpageSlug = "features/image-to-product-video";
    const subpageContent = getMarketingPageContent("en", subpageSlug);
    const subpage = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "en",
      pageSlug: subpageSlug
    });
    const homepageGraph = getJsonLdGraph(homepage);
    const subpageGraph = getJsonLdGraph(subpage);
    const homepageBreadcrumb = findStructuredDataNode(homepageGraph, "BreadcrumbList");
    const subpageBreadcrumb = findStructuredDataNode(subpageGraph, "BreadcrumbList");
    const faqPage = findStructuredDataNode(subpageGraph, "FAQPage");

    expect(homepage).not.toContain('class="breadcrumb"');
    expect(homepageBreadcrumb).toBeUndefined();
    expect(subpage).toContain('class="breadcrumb"');
    expect(subpage).toContain(`>${subpageContent.h1}</span>`);
    expect(subpageBreadcrumb?.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://haitu.example/en/"
      },
      {
        "@type": "ListItem",
        position: 2,
        name: subpageContent.h1,
        item: "https://haitu.example/en/features/image-to-product-video"
      }
    ]);
    expect(faqPage?.mainEntity).toEqual(subpageContent.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer
      }
    })));
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

  it("renders a substantial product-stage hero instead of a small tool card", () => {
    const html = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: ""
    });

    expect(html).toContain('class="hero-stage hero-home"');
    expect(html).toContain('class="studio-preview"');
    expect(html).toContain('class="metric-strip"');
    expect(html).toContain("商品原图");
    expect(html).toContain("商品视频");
    expect(html).toContain("平台模型");
    expect(html).toContain("自有模型");
    expect(html).toContain("批量 SKU");
  });

  it("renders an audit-ready public homepage with capability, payment, trust, and CTA sections", () => {
    const html = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "zh",
      pageSlug: ""
    });
    const english = renderMarketingPage({
      origin: "https://haitu.example",
      locale: "en",
      pageSlug: ""
    });

    expect(html).toContain('class="home-capability-band"');
    expect(html).toContain('class="payment-band"');
    expect(html).toContain('class="trust-band"');
    expect(html).toContain('class="final-cta"');
    expect(html).toContain("围绕商品图片和短视频的工作流");
    expect(html).toContain("图片创作功能后续接入");
    expect(html).toContain("充值余额，按实际 AI 服务消耗");
    expect(html).toContain("充值中心选择金额");
    expect(html).toContain("Stripe Checkout");
    expect(html).toContain("微信支付、支付宝或银行卡");
    expect(html).toContain("付款成功后余额入账");
    expect(html).toContain("安心创作，费用和规则都说清楚");
    expect(html).not.toContain("方便支付审核");
    expect(html).not.toContain("公开说明服务边界");
    expect(html).toContain("不销售实物商品");
    expect(html).toContain("不提供赌博、金融投资、加密货币交易、贷款、成人内容、药品等受限服务");
    expect(html).toContain("如果充值后还没使用，可以联系客服人工处理退款");
    expect(html).toContain("准备好把商品素材跑起来了吗");
    expect(english).toContain("Top up wallet balance and consume actual AI services");
    expect(english).toContain("Create with confidence, with billing and rules made clear");
    expect(english).not.toContain("payment review");
    expect(english).not.toContain("service boundaries");
    expect(english).toContain("WeChat Pay, Alipay, or cards");
    expect(english).toContain("does not sell physical goods");
    expect(english).toContain("Unused balance support");
  });
});

function getJsonLdGraph(html: string): Array<Record<string, unknown>> {
  const match = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);

  expect(match?.[1], "JSON-LD script").toBeTruthy();

  const parsed = JSON.parse(match?.[1] ?? "{}") as { "@graph"?: Array<Record<string, unknown>> };

  return parsed["@graph"] ?? [];
}

function findStructuredDataNode(graph: Array<Record<string, unknown>>, type: string): Record<string, any> | undefined {
  return graph.find((node) => node["@type"] === type) as Record<string, any> | undefined;
}

function getHeadMetaContent(html: string, attribute: "name" | "property", key: string): string {
  const pattern = new RegExp(`<meta ${attribute}="${escapeRegExp(key)}" content="([^"]*)" />`);
  const match = html.match(pattern);

  expect(match?.[1], `${key} meta content`).toBeDefined();

  return unescapeAttribute(match?.[1] ?? "");
}

function extractSeoFooter(html: string): string {
  const match = html.match(/<footer class="seo-footer"[\s\S]*?<\/footer>/);

  expect(match?.[0], "seo footer").toBeDefined();

  return match?.[0] ?? "";
}

function marketingRendererTestPath(locale: "zh" | "en", slug: string): string {
  if (!slug) {
    return locale === "en" ? "/en/" : "/";
  }
  return locale === "en" ? `/en/${slug}` : `/${slug}`;
}

function unescapeAttribute(value: string): string {
  return value.replaceAll("&quot;", "\"").replaceAll("&gt;", ">").replaceAll("&lt;", "<").replaceAll("&amp;", "&");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
