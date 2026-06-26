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
:root{color-scheme:light;--ink:#17211b;--muted:#5f6b63;--line:#d9dfd6;--paper:#f7f6ef;--field:#ffffff;--accent:#147a63;--gold:#b7791f;--dark:#0f1d18}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:Charter,Georgia,"Times New Roman","Noto Serif SC",serif}
a{color:inherit;text-decoration:none}
.site-header{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:28px;border-bottom:1px solid var(--line);background:rgba(247,246,239,.92);padding:18px clamp(20px,5vw,72px);backdrop-filter:blur(14px)}
.brand{font-size:24px;font-weight:900;letter-spacing:.02em}
nav{display:flex;gap:18px;font-size:14px;font-weight:700;color:var(--muted)}
.language-switcher{margin-left:auto;display:flex;gap:8px;border:1px solid var(--line);background:var(--field);padding:4px}
.language-switcher a{padding:7px 10px;font-size:13px;font-weight:800}
.language-switcher a[aria-current=true]{background:var(--dark);color:#fff}
.hero{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr);gap:44px;align-items:center;padding:72px clamp(20px,5vw,72px) 40px}
.eyebrow{margin:0 0 16px;color:var(--accent);font-size:14px;font-weight:900}
h1{max-width:920px;margin:0;font-size:clamp(42px,6vw,88px);line-height:.98;letter-spacing:0}
.lead{max-width:760px;margin:24px 0 0;color:var(--muted);font-size:clamp(18px,2vw,24px);line-height:1.55}
.hero-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px}
.primary-action,.secondary-action{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 20px;border:1px solid var(--dark);font-weight:900}
.primary-action{background:var(--dark);color:#fff}
.secondary-action{background:transparent;color:var(--dark)}
.proof-panel{display:grid;gap:12px;border:1px solid var(--line);background:#fff;padding:24px;box-shadow:0 24px 60px rgba(36,43,34,.12)}
.proof-panel span{display:block;border-bottom:1px solid var(--line);padding:12px 0;font-size:15px;font-weight:900}
.proof-panel span:last-child{border-bottom:0}
.platform-strip{display:flex;flex-wrap:wrap;gap:10px;padding:0 clamp(20px,5vw,72px) 44px}
.platform-strip span{border:1px solid var(--line);background:#fff;padding:10px 14px;font-size:13px;font-weight:900;color:var(--muted)}
.growth-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;padding:18px clamp(20px,5vw,72px) 56px}
.growth-card{border-top:3px solid var(--accent);background:#fff;padding:26px}
.growth-card h2,.faq h2{margin:0;font-size:26px;line-height:1.15}
.growth-card p,.faq p{color:var(--muted);line-height:1.7}
.growth-card ul{margin:18px 0 0;padding:0;list-style:none;display:grid;gap:8px}
.growth-card li::before{content:"";display:inline-block;width:7px;height:7px;margin-right:9px;background:var(--gold)}
.faq{padding:0 clamp(20px,5vw,72px) 80px}
details{border-top:1px solid var(--line);padding:18px 0}
summary{cursor:pointer;font-size:18px;font-weight:900}
@media (max-width:780px){.site-header{align-items:flex-start;flex-direction:column}.language-switcher{margin-left:0}.hero{grid-template-columns:1fr;padding-top:44px}.growth-grid{grid-template-columns:1fr}nav{flex-wrap:wrap}}
`;
