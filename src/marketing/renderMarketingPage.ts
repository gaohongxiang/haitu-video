export const marketingLocales = ["zh", "en"] as const;

export type MarketingLocale = (typeof marketingLocales)[number];

type Hreflang = "zh-CN" | "en";

interface MarketingPageLocaleContent {
  title: string;
  description: string;
  h1: string;
  eyebrow: string;
  lead: string;
  primaryCta: string;
  secondaryCta: string;
  sections: Array<{
    heading: string;
    body: string;
    bullets: string[];
  }>;
  faqs: Array<{
    question: string;
    answer: string;
  }>;
}

interface MarketingPage {
  slug: string;
  priority: string;
  changefreq: string;
  content: Record<MarketingLocale, MarketingPageLocaleContent>;
}

interface MarketingRoute {
  locale: MarketingLocale;
  pageSlug: string;
}

const localeMeta: Record<MarketingLocale, { label: string; hreflang: Hreflang; htmlLang: string; pathPrefix: string }> = {
  zh: {
    label: "中文",
    hreflang: "zh-CN",
    htmlLang: "zh-CN",
    pathPrefix: ""
  },
  en: {
    label: "English",
    hreflang: "en",
    htmlLang: "en",
    pathPrefix: "/en"
  }
};

const crossBorderPlatformsZh = "TikTok Shop、Amazon、Shopee、Lazada、Shopify";
const crossBorderPlatformsEn = "TikTok Shop, Amazon, Shopee, Lazada, and Shopify";

export const marketingPages: MarketingPage[] = [
  {
    slug: "",
    priority: "1.0",
    changefreq: "weekly",
    content: {
      zh: {
        title: "Haitu 海兔 - 跨境电商 AI 商品视频与图片创作平台",
        description: "Haitu 海兔帮助中国跨境电商卖家把 1688/ERP 表格、商品资料和参考图批量生成海外平台可用的商品图、短视频、标题、卖点和多语言脚本。",
        h1: "面向跨境电商卖家的 AI 商品创意生产平台",
        eyebrow: "从中国供应链到全球货架",
        lead: `把 1688/ERP 表格、商品资料和参考图转成适配 ${crossBorderPlatformsZh} 的商品图、短视频、标题、卖点和多语言脚本。`,
        primaryCta: "免费诊断商品素材",
        secondaryCta: "进入创作台",
        sections: [
          {
            heading: "把商品资料变成可发布素材",
            body: "Haitu 围绕卖家的真实流程设计：导入商品资料，提炼可信卖点，生成多语言文案，再产出商品图和短视频版本。",
            bullets: ["AI 商品视频生成器", "AI 商品图生成器", "多语言标题与描述", "批量商品创意生产"]
          },
          {
            heading: "为跨境团队减少重复劳动",
            body: "从单个商品打样到整批 SKU 素材整理，都可以沉淀在同一个商品创意工作流里。",
            bullets: ["保留参考图和商品事实", "减少手工写脚本和改标题", "适配多个平台和市场", "支持团队审核发布"]
          }
        ],
        faqs: [
          {
            question: "Haitu 适合哪些卖家？",
            answer: "适合有中国供应链、需要批量制作海外平台商品素材的跨境电商卖家、运营团队和代运营服务商。"
          },
          {
            question: "是不是只支持某一个国家站？",
            answer: "不是。国家站主要是语言、平台规则和表达习惯的差异，Haitu 的核心是从商品资料生成多市场创意资产。"
          }
        ]
      },
      en: {
        title: "Haitu - AI Product Creative Platform for Ecommerce Sellers",
        description: "Haitu turns product data, reference images, and selling points into ecommerce product videos, images, titles, descriptions, and multilingual scripts.",
        h1: "AI product creative platform for ecommerce sellers",
        eyebrow: "From product data to global creative assets",
        lead: `Turn supplier sheets, product facts, and reference images into videos, product images, titles, selling points, and multilingual scripts for ${crossBorderPlatformsEn}.`,
        primaryCta: "Audit product creatives",
        secondaryCta: "Open app",
        sections: [
          {
            heading: "Generate product creatives from facts",
            body: "Haitu keeps product facts, reference images, scripts, and creative versions in one workflow for ecommerce teams.",
            bullets: ["AI product video generator", "AI product image generator", "Multilingual ecommerce copy", "Batch creative generation"]
          },
          {
            heading: "Built for cross-border ecommerce",
            body: "Create localized creative assets without rebuilding the same product workflow for every marketplace.",
            bullets: ["Preserve verified selling points", "Generate platform-ready scripts", "Adapt copy by market", "Review and publish faster"]
          }
        ],
        faqs: [
          {
            question: "Who is Haitu for?",
            answer: "Haitu is built for ecommerce sellers, operators, and agencies that need product videos, images, and copy across multiple marketplaces."
          },
          {
            question: "Is Haitu limited to one marketplace?",
            answer: "No. Marketplaces mainly change language, platform rules, and creative style. Haitu focuses on the product-to-creative workflow."
          }
        ]
      }
    }
  },
  page("features/ai-product-video-generator", "0.9", {
    zh: [
      "AI 商品视频生成器 - Haitu",
      "用商品资料、卖点和参考图批量生成跨境电商短视频，适配 TikTok Shop、Amazon、Shopee 等平台。",
      "AI 商品视频生成器",
      "把 SKU 变成短视频",
      "从商品标题、卖点、使用场景和参考图出发，生成适合海外货架和短视频广告的商品视频脚本与成片版本。",
      "生成商品视频",
      "查看商品图能力"
    ],
    en: [
      "AI Product Video Generator for Ecommerce Sellers - Haitu",
      "Create product videos from product facts, reference images, and selling points.",
      "AI product video generator for ecommerce sellers",
      "Turn SKUs into product videos",
      "Create product videos from product facts, reference images, and selling points.",
      "Generate product videos",
      "Explore image generation"
    ]
  }),
  page("features/ai-product-image-generator", "0.9", {
    zh: [
      "AI 商品图生成器 - Haitu",
      "基于商品参考图和可信卖点生成跨境电商主图、场景图和广告素材。",
      "AI 商品图生成器",
      "商品参考图到可投放素材",
      "用参考图、材质、尺寸和卖点生成商品主图、场景图和广告图片，保持商品事实一致。",
      "生成商品图",
      "查看视频生成"
    ],
    en: [
      "AI Product Image Generator for Ecommerce - Haitu",
      "Generate ecommerce product images, lifestyle scenes, and ad creatives from product references.",
      "AI product image generator for ecommerce",
      "Reference images to campaign assets",
      "Generate product images, lifestyle scenes, and ad creatives while keeping product facts consistent.",
      "Generate product images",
      "Explore video generation"
    ]
  }),
  page("features/product-copy-generator", "0.8", {
    zh: [
      "AI 商品文案生成器 - Haitu",
      "为跨境电商商品批量生成多语言标题、卖点、描述、广告脚本和短视频字幕。",
      "AI 商品文案生成器",
      "多语言标题、卖点和脚本",
      "把原始商品资料整理成不同市场可用的标题、描述、卖点、短视频脚本和广告 CTA。",
      "生成商品文案",
      "查看批量生成"
    ],
    en: [
      "AI Product Copy Generator for Global Ecommerce - Haitu",
      "Generate multilingual product titles, descriptions, selling points, ad scripts, and captions.",
      "AI product copy generator for global ecommerce",
      "Titles, selling points, and scripts",
      "Turn raw product information into localized titles, descriptions, selling points, short-video scripts, and ad CTAs.",
      "Generate copy",
      "Explore batch workflows"
    ]
  }),
  page("features/batch-product-creative-generation", "0.8", {
    zh: [
      "批量商品素材生成 - Haitu",
      "导入表格或商品资料，批量生成跨境电商商品图、视频、标题、卖点和脚本。",
      "批量商品素材生成",
      "从表格到整批创意资产",
      "适合有大量 SKU 的跨境团队，把商品资料导入后统一整理、生成、审核和发布。",
      "批量生成素材",
      "了解工作流"
    ],
    en: [
      "Batch Product Creative Generation - Haitu",
      "Import product sheets and generate ecommerce images, videos, titles, selling points, and scripts in batches.",
      "Batch product creative generation",
      "From product sheets to creative assets",
      "For ecommerce teams with many SKUs that need one workflow for importing, generating, reviewing, and publishing creatives.",
      "Generate in batch",
      "Explore workflow"
    ]
  }),
  page("platforms/tiktok-shop", "0.8", {
    zh: [
      "TikTok Shop 商品素材生成 - Haitu",
      "为 TikTok Shop 卖家生成商品短视频、商品图、标题、卖点、描述和多语言广告脚本。",
      "TikTok Shop 商品素材生成",
      "适配内容电商的商品创意",
      "Haitu 把商品资料转成 TikTok Shop 可用的短视频脚本、商品图、广告卖点和本地化文案。",
      "生成 TikTok Shop 素材",
      "查看标题工具"
    ],
    en: [
      "TikTok Shop Product Creative Automation - Haitu",
      "Haitu turns product data into short videos, product images, ad scripts, and multilingual copy for TikTok Shop sellers.",
      "TikTok Shop product creative automation",
      "Creative assets for social commerce",
      "Haitu turns product data into short videos, product images, ad scripts, and multilingual copy for TikTok Shop sellers.",
      "Create TikTok Shop creatives",
      "Try title generator"
    ]
  }),
  page("platforms/amazon", "0.8", {
    zh: [
      "Amazon 商品图与视频生成 - Haitu",
      "为亚马逊卖家生成商品图、视频脚本、卖点描述和多语言 Listing 创意素材。",
      "Amazon 商品图与视频生成",
      "为 Listing 和广告准备商品素材",
      "从商品事实和参考图出发，生成适合 Amazon Listing、A+ 内容和站外广告的图文视频素材。",
      "生成 Amazon 素材",
      "查看商品文案"
    ],
    en: [
      "Amazon Product Image and Video Generator - Haitu",
      "Generate Amazon product images, video scripts, selling points, and listing copy from product data.",
      "Amazon product image and video generator",
      "Creative assets for listings and ads",
      "Use product facts and reference images to generate creatives for Amazon listings, A+ content, and external ads.",
      "Generate Amazon assets",
      "Explore copy generation"
    ]
  }),
  page("tools/product-title-generator", "0.7", {
    zh: [
      "AI 商品标题生成器 - Haitu",
      "输入商品资料和目标市场，生成适合跨境电商平台的多语言商品标题。",
      "AI 商品标题生成器",
      "先从标题拿到精准流量",
      "把商品名称、类目、材质、卖点和目标语言整理成更适合搜索和转化的商品标题。",
      "生成商品标题",
      "继续生成视频脚本"
    ],
    en: [
      "AI Product Title Generator - Haitu",
      "Generate multilingual ecommerce product titles from product facts, category, materials, and selling points.",
      "AI product title generator",
      "Search-ready titles for global ecommerce",
      "Turn product names, categories, materials, selling points, and target languages into ecommerce titles for search and conversion.",
      "Generate titles",
      "Create video scripts"
    ]
  })
];

export function resolveMarketingRoute(url: URL): MarketingRoute | undefined {
  const pathname = normalizePathname(url.pathname);
  if (pathname === "/en") {
    return pageExists("en", "") ? { locale: "en", pageSlug: "" } : undefined;
  }
  if (pathname.startsWith("/en/")) {
    const pageSlug = pathname.slice("/en/".length);
    return pageExists("en", pageSlug) ? { locale: "en", pageSlug } : undefined;
  }
  const pageSlug = pathname === "/" ? "" : pathname.slice(1);
  return pageExists("zh", pageSlug) ? { locale: "zh", pageSlug } : undefined;
}

export function renderMarketingPage(input: {
  origin: string;
  locale: MarketingLocale;
  pageSlug: string;
}): string {
  const page = findPage(input.pageSlug);
  const content = page.content[input.locale];
  const canonicalUrl = absoluteMarketingUrl(input.origin, input.locale, page.slug);
  const alternateLinks = marketingLocales.map((locale) => {
    const meta = localeMeta[locale];
    return `<link rel="alternate" hreflang="${meta.hreflang}" href="${absoluteMarketingUrl(input.origin, locale, page.slug)}" />`;
  }).join("\n    ");
  const languageLinks = marketingLocales.map((locale) => {
    const active = locale === input.locale ? " aria-current=\"true\"" : "";
    return `<a${active} href="${marketingPath(locale, page.slug)}">${escapeHtml(localeMeta[locale].label)}</a>`;
  }).join("");
  const cards = content.sections.map((section) => `
        <section class="growth-card">
          <h2>${escapeHtml(section.heading)}</h2>
          <p>${escapeHtml(section.body)}</p>
          <ul>
            ${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}
          </ul>
        </section>`).join("");
  const faqs = content.faqs.map((faq) => `
        <details>
          <summary>${escapeHtml(faq.question)}</summary>
          <p>${escapeHtml(faq.answer)}</p>
        </details>`).join("");
  const schema = JSON.stringify(buildStructuredData(input.origin, input.locale, page, content, canonicalUrl));

  return `<!doctype html>
<html lang="${localeMeta[input.locale].htmlLang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="index,follow" />
    <title>${escapeHtml(content.title)}</title>
    <meta name="description" content="${escapeAttribute(content.description)}" />
    <link rel="canonical" href="${canonicalUrl}" />
    ${alternateLinks}
    <link rel="alternate" hreflang="x-default" href="${absoluteMarketingUrl(input.origin, "zh", page.slug)}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeAttribute(content.title)}" />
    <meta property="og:description" content="${escapeAttribute(content.description)}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <script type="application/ld+json">${schema}</script>
    <style>${marketingCss}</style>
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="${marketingPath(input.locale, "")}" aria-label="Haitu">Haitu</a>
      <nav>
        <a href="${marketingPath(input.locale, "features/ai-product-video-generator")}">${input.locale === "zh" ? "商品视频" : "Video"}</a>
        <a href="${marketingPath(input.locale, "features/ai-product-image-generator")}">${input.locale === "zh" ? "商品图" : "Images"}</a>
        <a href="${marketingPath(input.locale, "features/product-copy-generator")}">${input.locale === "zh" ? "文案" : "Copy"}</a>
      </nav>
      <div class="language-switcher">${languageLinks}</div>
    </header>
    <main>
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">${escapeHtml(content.eyebrow)}</p>
          <h1>${escapeHtml(content.h1)}</h1>
          <p class="lead">${escapeHtml(content.lead)}</p>
          <div class="hero-actions">
            <a class="primary-action" href="/app">${escapeHtml(content.primaryCta)}</a>
            <a class="secondary-action" href="${marketingPath(input.locale, "features/batch-product-creative-generation")}">${escapeHtml(content.secondaryCta)}</a>
          </div>
        </div>
        <div class="proof-panel" aria-label="${input.locale === "zh" ? "商品创意工作流" : "Product creative workflow"}">
          <span>01 ${input.locale === "zh" ? "导入商品资料" : "Import product facts"}</span>
          <span>02 ${input.locale === "zh" ? "提炼可信卖点" : "Extract selling points"}</span>
          <span>03 ${input.locale === "zh" ? "生成图文视频" : "Generate images and videos"}</span>
          <span>04 ${input.locale === "zh" ? "适配多平台" : "Localize for marketplaces"}</span>
        </div>
      </section>
      <section class="platform-strip" aria-label="marketplaces">
        <span>TikTok Shop</span><span>Amazon</span><span>Shopee</span><span>Lazada</span><span>Shopify</span>
      </section>
      <section class="growth-grid">
        ${cards}
      </section>
      <section class="faq">
        <h2>${input.locale === "zh" ? "常见问题" : "FAQ"}</h2>
        ${faqs}
      </section>
    </main>
  </body>
</html>`;
}

export function renderRobotsTxt(origin: string): string {
  return [
    "User-agent: *",
    "Allow: /$",
    "Allow: /features/",
    "Allow: /platforms/",
    "Allow: /tools/",
    "Allow: /en/",
    "Disallow: /app",
    "Disallow: /console",
    "Disallow: /admin",
    "Disallow: /api/",
    "Disallow: /media",
    "",
    `Sitemap: ${trimOrigin(origin)}/sitemap.xml`,
    ""
  ].join("\n");
}

export function renderSitemapXml(origin: string): string {
  const urls = marketingPages.flatMap((page) => marketingLocales.map((locale) => ({ page, locale })));
  const body = urls.map(({ page, locale }) => {
    const loc = absoluteMarketingUrl(origin, locale, page.slug);
    const alternates = marketingLocales.map((alternateLocale) => {
      const meta = localeMeta[alternateLocale];
      return `    <xhtml:link rel="alternate" hreflang="${meta.hreflang}" href="${absoluteMarketingUrl(origin, alternateLocale, page.slug)}" />`;
    }).join("\n");
    return `  <url>
    <loc>${loc}</loc>
${alternates}
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${body}
</urlset>
`;
}

function page(slug: string, priority: string, input: Record<MarketingLocale, [string, string, string, string, string, string, string]>): MarketingPage {
  return {
    slug,
    priority,
    changefreq: "monthly",
    content: {
      zh: contentFromTuple(input.zh, "zh"),
      en: contentFromTuple(input.en, "en")
    }
  };
}

function contentFromTuple(input: [string, string, string, string, string, string, string], locale: MarketingLocale): MarketingPageLocaleContent {
  const [title, description, h1, eyebrow, lead, primaryCta, secondaryCta] = input;
  return {
    title,
    description,
    h1,
    eyebrow,
    lead,
    primaryCta,
    secondaryCta,
    sections: locale === "zh"
      ? [
        {
          heading: "围绕真实商品事实生成",
          body: "先沉淀标题、类目、材质、尺寸、参考图和可用卖点，再生成对应创意，减少幻觉和违规表达。",
          bullets: ["商品资料结构化", "参考图参与创作", "卖点和禁用词分离", "适配多语言输出"]
        },
        {
          heading: "为获客和转化设计",
          body: "每个页面和工具都服务于跨境卖家的搜索意图，从标题、图片、脚本到短视频逐步引导转化。",
          bullets: ["覆盖平台关键词", "沉淀模板和案例", "支持批量 SKU", "连接创作台"]
        }
      ]
      : [
        {
          heading: "Generated from verified product facts",
          body: "Haitu starts with titles, categories, materials, dimensions, references, and allowed selling points before creating assets.",
          bullets: ["Structured product facts", "Reference-aware generation", "Separated blocked claims", "Localized outputs"]
        },
        {
          heading: "Designed for acquisition and conversion",
          body: "Each page and tool matches ecommerce search intent, then moves users from titles and images into full creative workflows.",
          bullets: ["Marketplace keywords", "Reusable templates", "Batch SKU workflows", "Connected app experience"]
        }
      ],
    faqs: locale === "zh"
      ? [
        {
          question: "这些素材能直接用于海外平台吗？",
          answer: "Haitu 会按商品事实生成标题、图像和视频脚本，最终发布前仍建议结合平台规则和店铺审核流程确认。"
        },
        {
          question: "可以批量处理商品吗？",
          answer: "可以。Haitu 的方向是从表格、ERP 和商品资料库批量生成多平台商品创意资产。"
        }
      ]
      : [
        {
          question: "Can these assets be used directly on marketplaces?",
          answer: "Haitu generates assets from product facts. Teams should still review against each marketplace policy before publishing."
        },
        {
          question: "Can Haitu process products in batches?",
          answer: "Yes. Haitu is designed to turn product sheets, ERP data, and product libraries into marketplace-ready creative assets."
        }
      ]
  };
}

function buildStructuredData(origin: string, locale: MarketingLocale, page: MarketingPage, content: MarketingPageLocaleContent, canonicalUrl: string): unknown {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Haitu",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: canonicalUrl,
        description: content.description,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: locale === "zh" ? "CNY" : "USD"
        }
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: locale === "zh" ? "首页" : "Home",
            item: absoluteMarketingUrl(origin, locale, "")
          },
          {
            "@type": "ListItem",
            position: 2,
            name: content.h1,
            item: absoluteMarketingUrl(origin, locale, page.slug)
          }
        ]
      },
      {
        "@type": "FAQPage",
        mainEntity: content.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer
          }
        }))
      }
    ]
  };
}

function findPage(slug: string): MarketingPage {
  const page = marketingPages.find((item) => item.slug === slug);
  if (!page) {
    throw new Error(`Unknown marketing page: ${slug}`);
  }
  return page;
}

function pageExists(locale: MarketingLocale, slug: string): boolean {
  return Boolean(marketingPages.find((page) => page.slug === slug && page.content[locale]));
}

function marketingPath(locale: MarketingLocale, slug: string): string {
  const prefix = localeMeta[locale].pathPrefix;
  if (!slug) {
    return prefix ? `${prefix}/` : "/";
  }
  return `${prefix}/${slug}`;
}

function absoluteMarketingUrl(origin: string, locale: MarketingLocale, slug: string): string {
  return `${trimOrigin(origin)}${marketingPath(locale, slug)}`;
}

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function trimOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

const marketingCss = `
:root{color-scheme:light;--bg:#f3e6d8;--panel:#fffaf3;--panel2:#f8ede1;--card:#fff5e9;--card2:#ffefd9;--field:#fffbf5;--field2:#fff4e6;--border:#ead7c4;--border-strong:#dbc2ab;--text:#2a211b;--muted:#76685c;--accent:#0aa394;--accent2:#6f442c;--warn:#b7791f;--brand-clay:#e0b286;--brand-cream:#f4e6d4;--brand-ember:#c65a36;--shadow:0 10px 28px rgba(96,64,43,.09);--radius:8px}
*{box-sizing:border-box}
html{min-height:100%;background:var(--bg)}
body{margin:0;min-height:100%;background:radial-gradient(circle at 18% -10%,rgba(255,250,243,.92),transparent 34%),linear-gradient(180deg,var(--bg),#f7ecdf 55%,var(--panel2));color:var(--text);font:14px/1.55 -apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","PingFang SC","Hiragino Sans","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
::selection{color:#fff;background:var(--accent)}
.site-header{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:18px;border-bottom:1px solid var(--border);background:rgba(255,250,243,.86);padding:14px clamp(16px,4vw,56px);backdrop-filter:blur(16px)}
.brand{display:inline-flex;align-items:center;gap:9px;font-size:20px;font-weight:950;letter-spacing:0}
.brand::before{content:"";width:28px;height:28px;border-radius:var(--radius);background:linear-gradient(145deg,var(--accent),#63cfc3);box-shadow:inset 0 -5px 10px rgba(42,33,27,.08),0 8px 18px rgba(10,163,148,.2)}
nav{display:flex;gap:6px;font-size:13px;font-weight:850;color:var(--muted)}
nav a{border-radius:var(--radius);padding:8px 10px}
nav a:hover{background:var(--panel2);color:var(--text)}
.language-switcher{margin-left:auto;display:flex;gap:4px;border:1px solid var(--border);border-radius:var(--radius);background:var(--field);padding:3px;box-shadow:var(--shadow)}
.language-switcher a{border-radius:6px;padding:7px 10px;font-size:12px;font-weight:900;color:var(--muted)}
.language-switcher a[aria-current=true]{background:var(--accent);color:#fff}
.hero{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(320px,.88fr);gap:24px;align-items:stretch;padding:54px clamp(16px,4vw,56px) 24px}
.hero-copy{min-width:0;border:1px solid var(--border);border-radius:var(--radius);background:rgba(255,250,243,.74);padding:clamp(24px,5vw,52px);box-shadow:var(--shadow)}
.eyebrow{display:inline-flex;align-items:center;min-height:28px;margin:0 0 18px;border:1px solid color-mix(in srgb,var(--accent) 28%,var(--border));border-radius:999px;background:color-mix(in srgb,var(--accent) 9%,var(--field));padding:0 11px;color:var(--accent);font-size:12px;font-weight:950}
h1{max-width:920px;margin:0;color:var(--text);font-size:clamp(36px,5.4vw,76px);font-weight:950;line-height:1.02;letter-spacing:0}
.lead{max-width:760px;margin:22px 0 0;color:var(--muted);font-size:clamp(16px,1.8vw,22px);font-weight:650;line-height:1.65}
.hero-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:30px}
.primary-action,.secondary-action{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:var(--radius);padding:0 16px;font-size:13px;font-weight:950;transition:filter .16s ease,border-color .16s ease,color .16s ease,background .16s ease}
.primary-action{border:1px solid transparent;background:var(--accent);color:#fff;box-shadow:0 12px 24px rgba(10,163,148,.16)}
.primary-action:hover{filter:brightness(1.05)}
.secondary-action{border:1px solid var(--border);background:var(--field);color:var(--text)}
.secondary-action:hover{border-color:var(--accent);color:var(--accent)}
.proof-panel{display:grid;align-content:start;gap:10px;border:1px solid var(--border);border-radius:var(--radius);background:linear-gradient(180deg,var(--card),var(--card2));padding:18px;box-shadow:var(--shadow)}
.proof-panel span{display:flex;align-items:center;gap:10px;min-height:46px;border:1px solid var(--border);border-radius:var(--radius);background:rgba(255,251,245,.78);padding:0 13px;color:var(--text);font-size:13px;font-weight:950}
.proof-panel span::before{content:"";width:8px;height:8px;border-radius:999px;background:var(--accent)}
.platform-strip{display:flex;flex-wrap:wrap;gap:8px;padding:0 clamp(16px,4vw,56px) 28px}
.platform-strip span{border:1px solid var(--border);border-radius:999px;background:var(--field);padding:8px 12px;color:var(--muted);font-size:12px;font-weight:950;box-shadow:0 8px 20px rgba(96,64,43,.05)}
.growth-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;padding:0 clamp(16px,4vw,56px) 42px}
.growth-card{min-width:0;border:1px solid var(--border);border-radius:var(--radius);background:var(--panel);padding:22px;box-shadow:var(--shadow)}
.growth-card h2,.faq h2{margin:0;color:var(--text);font-size:22px;font-weight:950;line-height:1.2;letter-spacing:0}
.growth-card p,.faq p{color:var(--muted);font-weight:650;line-height:1.7}
.growth-card ul{margin:18px 0 0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.growth-card li{border:1px solid var(--border);border-radius:var(--radius);background:var(--field2);padding:9px 10px;color:var(--text);font-size:12px;font-weight:900}
.growth-card li::before{content:"";display:inline-block;width:7px;height:7px;margin-right:8px;border-radius:999px;background:var(--brand-ember)}
.faq{padding:0 clamp(16px,4vw,56px) 70px}
.faq h2{margin-bottom:12px}
details{border:1px solid var(--border);border-radius:var(--radius);background:var(--panel);box-shadow:var(--shadow);padding:15px 16px}
details+details{margin-top:10px}
summary{cursor:pointer;color:var(--text);font-size:15px;font-weight:950}
details p{margin:10px 0 0}
@media (max-width:780px){.site-header{align-items:flex-start;flex-direction:column}.language-switcher{margin-left:0}.hero{grid-template-columns:1fr;padding-top:28px}.growth-grid{grid-template-columns:1fr}.growth-card ul{grid-template-columns:1fr}nav{flex-wrap:wrap}}
`;
