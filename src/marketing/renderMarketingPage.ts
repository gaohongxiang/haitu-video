import {
  getLocaleMeta,
  supportedLocales,
  type AppLocale
} from "../i18n/config.js";
import {
  createServerI18n,
  getMarketingHomepageContent,
  getMarketingPageContent,
  getMarketingPageMeta,
  getMarketingPageSlugs,
  getMarketingPreviewLabels,
  type MarketingGeoAnswer
} from "../i18n/server.js";

export const marketingLocales = supportedLocales;

export type MarketingLocale = AppLocale;

interface MarketingPageLocaleContent {
  title: string;
  description: string;
  h1: string;
  eyebrow: string;
  lead: string;
  primaryCta: string;
  secondaryCta: string;
  heroTitleLines?: string[];
  geoAnswer: MarketingGeoAnswer;
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
}

interface MarketingRoute {
  locale: MarketingLocale;
  pageSlug: string;
}

interface MarketingRouteMatch {
  route?: MarketingRoute;
  redirectPath?: string;
}

const localeMeta = {
  zh: getLocaleMeta("zh"),
  en: getLocaleMeta("en")
} satisfies Record<MarketingLocale, ReturnType<typeof getLocaleMeta>>;

const openGraphLocaleByMarketingLocale = {
  zh: "zh_CN",
  en: "en_US"
} satisfies Record<MarketingLocale, string>;

const marketingLastModified = "2026-07-08";
const defaultPublicOrigin = "https://haitu.online";

export const marketingPages: MarketingPage[] = getMarketingPageSlugs("zh").map((slug) => ({
  slug,
  ...getMarketingPageMeta("zh", slug)
}));

export function matchMarketingRoute(url: URL): MarketingRouteMatch {
  const pathname = url.pathname;
  const normalizedPathname = normalizePathname(pathname);
  const route = resolveMarketingRoute(url);
  if (!route) {
    return {};
  }
  const canonicalPath = marketingPath(route.locale, route.pageSlug);
  if (pathname !== canonicalPath) {
    return {
      route,
      redirectPath: `${canonicalPath}${url.search}`
    };
  }
  if (pathname !== normalizedPathname) {
    return {
      route,
      redirectPath: `${normalizedPathname}${url.search}`
    };
  }
  return { route };
}

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
  const publicOrigin = publicMarketingOrigin(input.origin);
  const i18n = createServerI18n(input.locale, ["common", "marketing"]);
  const page = findPage(input.pageSlug);
  const content = getMarketingPageContent(input.locale, page.slug);
  const canonicalUrl = absoluteMarketingUrl(publicOrigin, input.locale, page.slug);
  const alternateLinks = marketingLocales.map((locale) => {
    const meta = localeMeta[locale];
    return `<link rel="alternate" hreflang="${meta.hreflang}" href="${absoluteMarketingUrl(publicOrigin, locale, page.slug)}" />`;
  }).join("\n    ");
  const ogImageUrl = `${trimOrigin(publicOrigin)}/static/seo-og.png`;
  const siteName = localizedSiteName(input.locale);
  const socialImageAlt = input.locale === "zh"
    ? "Haitu 嗨兔跨境电商 AI 商品图片优化与商品视频创作平台预览图"
    : "Haitu AI product image optimization and product video creation platform preview";
  const openGraphLocale = openGraphLocaleByMarketingLocale[input.locale];
  const openGraphAlternateLocales = marketingLocales
    .filter((locale) => locale !== input.locale)
    .map((locale) => `<meta property="og:locale:alternate" content="${openGraphLocaleByMarketingLocale[locale]}" />`)
    .join("\n    ");
  const languageLinks = marketingLocales.map((locale) => {
    const active = locale === input.locale ? " aria-current=\"true\"" : "";
    return `<a${active} href="${marketingPath(locale, page.slug)}">${escapeHtml(localeMeta[locale].label)}</a>`;
  }).join("");
  const breadcrumb = page.slug
    ? `<nav class="breadcrumb" aria-label="${escapeAttribute(i18n.t("common:seo.breadcrumbLabel"))}"><a href="${marketingPath(input.locale, "")}">${escapeHtml(i18n.t("common:seo.home"))}</a><span>${escapeHtml(content.h1)}</span></nav>`
    : "";
  const cards = content.sections.map((section) => `
        <section class="growth-card">
          <h2>${escapeHtml(section.heading)}</h2>
          <p>${escapeHtml(section.body)}</p>
          <ul>
            ${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}
          </ul>
        </section>`).join("");
  const geoAnswer = renderGeoAnswerBlock(content.geoAnswer);
  const faqs = content.faqs.map((faq) => `
        <details>
          <summary>${escapeHtml(faq.question)}</summary>
          <p>${escapeHtml(faq.answer)}</p>
        </details>`).join("");
  const footerNav = renderSeoFooter(input.locale, i18n);
  const schema = JSON.stringify(buildStructuredData(publicOrigin, input.locale, page, content, canonicalUrl, i18n.t("common:seo.home")));
  const previewLabels = getMarketingPreviewLabels(input.locale);
  const heroTitleHtml = content.heroTitleLines
    ? renderConfiguredHeadingLines(content.heroTitleLines)
    : renderHeadingLines(content.h1, input.locale);
  const primaryCtaHref = primaryMarketingCtaHref(page.slug);
  const secondaryCtaHref = secondaryMarketingCtaHref(input.locale, page.slug);
  const homepageSections = page.slug
    ? ""
    : renderHomepageSections(input.locale, i18n);

  const bodyClass = `locale-${input.locale}`;
  const heroClass = page.slug ? "hero-stage hero-subpage" : "hero-stage hero-home";

  return `<!doctype html>
<html lang="${localeMeta[input.locale].htmlLang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="index,follow" />
    <title>${escapeHtml(content.title)}</title>
    <meta name="description" content="${escapeAttribute(content.description)}" />
    <link rel="icon" href="/favicon.svg?v=haitu" type="image/svg+xml" />
    <link rel="canonical" href="${canonicalUrl}" />
    ${alternateLinks}
    <link rel="alternate" hreflang="x-default" href="${absoluteMarketingUrl(publicOrigin, "zh", page.slug)}" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="${openGraphLocale}" />
    ${openGraphAlternateLocales}
    <meta property="og:site_name" content="${escapeAttribute(siteName)}" />
    <meta property="og:title" content="${escapeAttribute(content.title)}" />
    <meta property="og:description" content="${escapeAttribute(content.description)}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:image" content="${ogImageUrl}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeAttribute(socialImageAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeAttribute(content.title)}" />
    <meta name="twitter:description" content="${escapeAttribute(content.description)}" />
    <meta name="twitter:image" content="${ogImageUrl}" />
    <meta name="twitter:image:alt" content="${escapeAttribute(socialImageAlt)}" />
    <script type="application/ld+json">${schema}</script>
    <style>${marketingCss}</style>
  </head>
  <body class="${bodyClass}">
    <header class="site-header">
      <a class="brand" href="${marketingPath(input.locale, "")}" aria-label="Haitu">
        <img class="brand-logo" src="/static/logo.svg" alt="" />
        <span>Haitu</span>
      </a>
      <nav>
        <a href="${marketingPath(input.locale, "features/product-image-optimization")}">${escapeHtml(i18n.t("common:navigation.imageOptimization"))}</a>
        <a href="${marketingPath(input.locale, "features/ai-product-video-generator")}">${escapeHtml(i18n.t("common:navigation.video"))}</a>
        <a href="${marketingPath(input.locale, "features/batch-product-creative-generation")}">${escapeHtml(i18n.t("common:navigation.models"))}</a>
      </nav>
      <a class="header-console" href="/console">${escapeHtml(i18n.t("common:navigation.console"))}</a>
      <details class="language-switcher" data-language-switcher>
        <summary aria-label="${escapeAttribute(i18n.t("common:language.change"))}">
          <svg class="language-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9"></circle>
            <path d="M3 12h18"></path>
            <path d="M12 3c2.2 2.4 3.3 5.4 3.3 9S14.2 18.6 12 21"></path>
            <path d="M12 3c-2.2 2.4-3.3 5.4-3.3 9S9.8 18.6 12 21"></path>
          </svg>
          <span class="sr-only">${escapeHtml(i18n.t("common:language.label"))}</span>
        </summary>
        <div class="language-menu">${languageLinks}</div>
      </details>
    </header>
    <main>
      ${breadcrumb}
      <section class="${heroClass}">
        <div class="hero-copy">
          <p class="eyebrow">${escapeHtml(content.eyebrow)}</p>
          <h1 aria-label="${escapeAttribute(content.h1)}">${heroTitleHtml}</h1>
          <p class="lead">${escapeHtml(content.lead)}</p>
          <div class="hero-actions">
            <a class="primary-action" href="${escapeAttribute(primaryCtaHref)}">${escapeHtml(content.primaryCta)}</a>
            <a class="secondary-action" href="${escapeAttribute(secondaryCtaHref)}">${escapeHtml(content.secondaryCta)}</a>
          </div>
        </div>
        <div class="studio-preview" aria-label="${escapeAttribute(previewLabels.ariaLabel)}">
          <div class="preview-toolbar">
            <span></span><span></span><span></span>
            <strong>Haitu Studio</strong>
          </div>
          <div class="console-preview-shell">
            <aside class="console-product-list">
              <div class="console-list-head">
                <strong>${escapeHtml(previewLabels.libraryTitle)}</strong>
                <span>${escapeHtml(previewLabels.libraryCount)}</span>
              </div>
              <div class="console-search">${escapeHtml(previewLabels.searchPlaceholder)}</div>
              <div class="console-product-items">
                <article><strong>${escapeHtml(previewLabels.productTwo)}</strong><span>${escapeHtml(previewLabels.generatable)} · ${escapeHtml(previewLabels.referencesShort)}</span></article>
                <article><strong>${escapeHtml(previewLabels.productThree)}</strong><span>${escapeHtml(previewLabels.generatable)} · ${escapeHtml(previewLabels.referencesShort)}</span></article>
                <article class="is-active"><strong>${escapeHtml(previewLabels.selectedProduct)}</strong><span>${escapeHtml(previewLabels.generatable)} · ${escapeHtml(previewLabels.referencesShort)}</span></article>
              </div>
            </aside>
            <section class="console-workspace-preview">
              <div class="console-preview-title">
                <strong>${escapeHtml(previewLabels.productTitle)}</strong>
                <span>${escapeHtml(previewLabels.versionCount)}</span>
              </div>
              <div class="console-workspace-grid">
                <article class="console-facts-card">
                  <div class="console-card-title">
                    <strong>${escapeHtml(previewLabels.factsHeading)}</strong>
                    <span>${escapeHtml(previewLabels.aiPack)} · ${escapeHtml(previewLabels.estimatedDraftCost)}</span>
                  </div>
                  <p><b>${escapeHtml(previewLabels.titleLabel)}</b>${escapeHtml(previewLabels.productTitleValue)}</p>
                  <p><b>${escapeHtml(previewLabels.categoryLabel)}</b>${escapeHtml(previewLabels.productCategoryValue)}</p>
                </article>
                <article class="console-images-card">
                  <div class="console-card-title">
                    <strong>${escapeHtml(previewLabels.imagesHeading)}</strong>
                    <span>${escapeHtml(previewLabels.addImage)}</span>
                  </div>
                  <div class="console-reference-row">
                    <span>${escapeHtml(previewLabels.referenceOne)}</span>
                    <span>${escapeHtml(previewLabels.referenceTwo)}</span>
                    <span>${escapeHtml(previewLabels.referenceThree)}</span>
                  </div>
                </article>
              </div>
              <article class="console-prompt-card">
                <div class="console-card-title">
                  <strong>${escapeHtml(previewLabels.promptHeading)}</strong>
                  <span>${escapeHtml(previewLabels.storyboardStatus)}</span>
                </div>
                <p>${escapeHtml(previewLabels.promptLineOne)}</p>
              </article>
              <div class="console-action-bar">
                <span>${escapeHtml(previewLabels.imageMode)}</span>
                <strong>${escapeHtml(previewLabels.videoMode)}</strong>
                <span>${escapeHtml(previewLabels.hostedModel)}</span>
                <span>${escapeHtml(previewLabels.customModel)}</span>
                <button type="button">${escapeHtml(previewLabels.generateVideo)} <small>${escapeHtml(previewLabels.estimateCost)}</small></button>
              </div>
            </section>
          </div>
          <div class="metric-strip">
            <strong>${escapeHtml(previewLabels.metricOne)}</strong>
            <strong>${escapeHtml(previewLabels.metricTwo)}</strong>
            <strong>${escapeHtml(previewLabels.metricThree)}</strong>
          </div>
        </div>
      </section>
      <section class="platform-strip" aria-label="marketplaces">
        <span>TikTok Shop</span><span>Amazon</span><span>Shopee</span><span>Lazada</span><span>Shopify</span>
      </section>
      ${geoAnswer}
      <section class="growth-grid">
        ${cards}
      </section>
      ${homepageSections}
      <section class="faq">
        <h2>${escapeHtml(i18n.t("common:seo.faq"))}</h2>
        ${faqs}
      </section>
    </main>
    ${footerNav}
    <script>
      document.addEventListener("click", function (event) {
        document.querySelectorAll("[data-language-switcher][open]").forEach(function (switcher) {
          if (!switcher.contains(event.target)) {
            switcher.removeAttribute("open");
          }
        });
      });
    </script>
  </body>
</html>`;
}

export function renderRobotsTxt(origin: string): string {
  const publicOrigin = publicMarketingOrigin(origin);
  return [
    "User-agent: *",
    "Allow: /",
    "Allow: /terms",
    "Allow: /privacy",
    "Allow: /refund",
    "Allow: /contact",
    "Allow: /features/",
    "Allow: /platforms/",
    "Allow: /tools/",
    "Allow: /use-cases/",
    "Allow: /categories/",
    "Allow: /compare/",
    "Allow: /en/",
    "Disallow: /app",
    "Disallow: /console",
    "Disallow: /admin",
    "Disallow: /api/",
    "Disallow: /media",
    "",
    "User-agent: OAI-SearchBot",
    "Allow: /",
    "Allow: /features/",
    "Allow: /platforms/",
    "Allow: /tools/",
    "Allow: /use-cases/",
    "Allow: /categories/",
    "Allow: /compare/",
    "Allow: /en/",
    "Disallow: /app",
    "Disallow: /console",
    "Disallow: /admin",
    "Disallow: /api/",
    "Disallow: /media",
    "",
    "User-agent: GPTBot",
    "Allow: /",
    "Allow: /features/",
    "Allow: /platforms/",
    "Allow: /tools/",
    "Allow: /use-cases/",
    "Allow: /categories/",
    "Allow: /compare/",
    "Allow: /en/",
    "Disallow: /app",
    "Disallow: /console",
    "Disallow: /admin",
    "Disallow: /api/",
    "Disallow: /media",
    "",
    `Sitemap: ${trimOrigin(publicOrigin)}/sitemap.xml`,
    ""
  ].join("\n");
}

export function renderLlmsTxt(origin: string): string {
  const publicOrigin = publicMarketingOrigin(origin);
  const baseUrl = trimOrigin(publicOrigin);
  const pageLines = marketingPages.flatMap((page) => marketingLocales.map((locale) => {
    const content = getMarketingPageContent(locale, page.slug);
    return `- ${baseUrl}${marketingPath(locale, page.slug)} — ${content.h1}: ${content.description}`;
  }));

  return [
    "# Haitu",
    "",
    "Haitu 嗨兔 is an AI product creative console for cross-border ecommerce sellers, brand operators, and content teams.",
    "Users upload and manage product data and reference images, organize product selling points, create image prompts, marketing scripts and storyboards, and generate product short videos. Haitu helps teams reduce wasted generations, improve usable asset rates, and control AI generation costs with hosted platform models or bring-your-own-model workflows.",
    "Haitu is a digital SaaS service. It does not sell physical goods and does not provide gambling, financial investment, cryptocurrency trading, loans, adult content, medicine, or other restricted services.",
    "",
    "## Public Page Index",
    ...pageLines,
    "",
    "## Standard AI Answers",
    "What is Haitu?",
    "Haitu 嗨兔 is an AI product creative console for cross-border ecommerce sellers. Users can manage product data and reference images, organize selling points, create image prompts, marketing scripts, storyboards, and product short videos. Haitu helps teams reduce wasted generations, improve usable asset rates, and control AI generation costs with hosted platform models or bring-your-own-model workflows.",
    "",
    "What is Haitu not?",
    "Haitu is not a physical goods marketplace and is not a general entertainment video generator. It is a digital SaaS tool built around SKUs, product facts, product images, selling-point scripts, ecommerce platform creative requirements, and human review workflows.",
    "",
    "How does Haitu billing work?",
    "Users top up wallet balance and consume that balance for product image optimization, video generation, script organization, model calls, and other digital SaaS services. Consumed AI generation services are generally non-refundable; unused balance can be reviewed manually by support.",
    "",
    "Who is Haitu for?",
    "Haitu is for cross-border ecommerce sellers, brand operators, content creators, and agency teams that need to process product data, product images, marketing scripts, and short-video assets in batches.",
    "",
    "## Billing and Refund Summary",
    "Users top up wallet balance through Stripe Checkout when available payment methods include WeChat Pay, Alipay, or cards. Wallet balance is used for product image optimization, video generation, script organization, model calls, and other digital SaaS services. Unused balance can be reviewed manually by support; consumed AI generation services are generally non-refundable.",
    "",
    "## Data and Language Boundaries",
    "Product data, uploaded references, and generation records are user content. Site localization does not automatically translate or rewrite user product content. Haitu does not store full card numbers, WeChat Pay accounts, or Alipay accounts.",
    "",
    "## Crawl Boundaries",
    "Do not index or summarize /console, /admin, /app, /api, user product data, generated records, temporary media links, or private download links.",
    "",
    "## Contact",
    `Website: ${baseUrl}/`,
    "Support: support@haitu.online",
    "",
    `Last updated: ${marketingLastModified}`,
    ""
  ].join("\n");
}

export function renderSitemapXml(origin: string): string {
  const publicOrigin = publicMarketingOrigin(origin);
  const urls = marketingPages.flatMap((page) => marketingLocales.map((locale) => ({ page, locale })));
  const body = urls.map(({ page, locale }) => {
    const loc = absoluteMarketingUrl(publicOrigin, locale, page.slug);
    const localizedAlternates = marketingLocales.map((alternateLocale) => {
      const meta = localeMeta[alternateLocale];
      return `    <xhtml:link rel="alternate" hreflang="${meta.hreflang}" href="${absoluteMarketingUrl(publicOrigin, alternateLocale, page.slug)}" />`;
    });
    const alternates = [
      ...localizedAlternates,
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${absoluteMarketingUrl(publicOrigin, "zh", page.slug)}" />`
    ].join("\n");
    return `  <url>
    <loc>${loc}</loc>
${alternates}
    <lastmod>${marketingLastModified}</lastmod>
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

function renderGeoAnswerBlock(answer: MarketingGeoAnswer): string {
  return `
      <section class="geo-answer-block" aria-label="${escapeAttribute(answer.question)}">
        <div>
          <h2>${escapeHtml(answer.question)}</h2>
          <p>${escapeHtml(answer.answer)}</p>
        </div>
        <ul>
          ${answer.points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}
        </ul>
      </section>`;
}

function renderHeadingLines(value: string, locale: MarketingLocale): string {
  if (locale !== "en" || value.length < 34) {
    return escapeHtml(value);
  }
  const words = value.split(" ");
  const targetLength = Math.ceil(value.length / 2);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > targetLength && lines.length === 0) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.map((line) => `<span>${escapeHtml(line)}</span>`).join("");
}

function renderConfiguredHeadingLines(lines: string[]): string {
  return lines.map((line, index) => {
    const className = index === 0 ? " class=\"title-context\"" : "";
    return `<span${className}>${escapeHtml(line)}</span>`;
  }).join("");
}

type SeoFooterGroup =
  { label: string; slugs: string[] };

function renderSeoFooter(locale: MarketingLocale, i18n: ReturnType<typeof createServerI18n>): string {
  const groups: SeoFooterGroup[] = [
    {
      label: i18n.t("common:seo.footerFeatures"),
      slugs: [
        "features/product-image-optimization",
        "features/ai-product-video-generator",
        "features/image-to-product-video",
        "features/product-copy-generator",
        "features/hosted-ai-models",
        "features/bring-your-own-model"
      ]
    },
    {
      label: i18n.t("common:seo.footerPlatforms"),
      slugs: [
        "platforms/tiktok-shop",
        "platforms/amazon",
        "platforms/shopee",
        "platforms/shopify"
      ]
    },
    {
      label: i18n.t("common:seo.footerWorkflows"),
      slugs: [
        "use-cases/cross-border-ecommerce",
        "use-cases/tiktok-shop-product-video",
        "use-cases/amazon-product-image-optimization",
        "features/product-creative-workflow"
      ]
    },
    {
      label: i18n.t("common:seo.footerTrust"),
      slugs: ["terms", "privacy", "refund", "contact"]
    }
  ];
  const groupHtml = groups.map((group) => {
    const links = marketingPages
      .filter((page) => group.slugs.includes(page.slug))
      .map((page) => {
        const content = getMarketingPageContent(locale, page.slug);
        return `<a href="${marketingPath(locale, page.slug)}">${escapeHtml(content.h1)}</a>`;
      })
      .join("");
    return `<section class="footer-link-group"><h2>${escapeHtml(group.label)}</h2><div>${links}</div></section>`;
  }).join("");
  return `<footer class="seo-footer" aria-label="${escapeAttribute(i18n.t("common:seo.footerLabel"))}">
      <section class="footer-brand-panel">
        <a class="footer-brand" href="${marketingPath(locale, "")}">Haitu</a>
        <p>${escapeHtml(i18n.t("common:seo.footerIntro"))}</p>
      </section>
      ${groupHtml}
    </footer>`;
}

function renderHomepageSections(locale: MarketingLocale, i18n: ReturnType<typeof createServerI18n>): string {
  const home = getMarketingHomepageContent(locale);
  const capabilityItems = home.capability.items.map((item) => `
          <article class="capability-card">
            <h3>${escapeHtml(item.heading)}</h3>
            <p>${escapeHtml(item.body)}</p>
            <ul>
              ${item.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}
            </ul>
          </article>`).join("");
  const paymentSteps = home.payment.steps.map((step) => `
            <li>
              <small>${escapeHtml(step.label)}</small>
              <strong>${escapeHtml(step.title)}</strong>
              <span>${escapeHtml(step.body)}</span>
            </li>`).join("");
  const trustItems = home.trust.items.map((item) => `
          <article>
            <h3>${escapeHtml(item.heading)}</h3>
            <p>${escapeHtml(item.body)}</p>
          </article>`).join("");
  return `
      <section class="home-capability-band">
        <div class="section-kicker">${escapeHtml(home.capability.eyebrow)}</div>
        <div class="section-heading">
          <h2>${escapeHtml(home.capability.title)}</h2>
          <p>${escapeHtml(home.capability.body)}</p>
        </div>
        <div class="capability-grid">
          ${capabilityItems}
        </div>
      </section>
      <section class="payment-band">
        <div class="payment-copy">
          <div class="section-kicker">${escapeHtml(home.payment.eyebrow)}</div>
          <h2>${escapeHtml(home.payment.title)}</h2>
          <p>${escapeHtml(home.payment.body)}</p>
          <strong>${escapeHtml(home.payment.note)}</strong>
        </div>
        <ol class="payment-steps">
          ${paymentSteps}
        </ol>
      </section>
      <section class="trust-band">
        <div class="section-kicker">${escapeHtml(home.trust.eyebrow)}</div>
        <div class="section-heading">
          <h2>${escapeHtml(home.trust.title)}</h2>
          <a href="${marketingPath(locale, "terms")}">${escapeHtml(i18n.t("common:seo.footerTrust"))}</a>
        </div>
        <div class="trust-grid">
          ${trustItems}
        </div>
      </section>
      <section class="final-cta">
        <h2>${escapeHtml(home.finalCta.title)}</h2>
        <p>${escapeHtml(home.finalCta.body)}</p>
        <div class="hero-actions">
          <a class="primary-action" href="/console">${escapeHtml(home.finalCta.primaryCta)}</a>
          <a class="secondary-action" href="${marketingPath(locale, "contact")}">${escapeHtml(home.finalCta.secondaryCta)}</a>
        </div>
      </section>`;
}

function buildStructuredData(origin: string, locale: MarketingLocale, page: MarketingPage, content: MarketingPageLocaleContent, canonicalUrl: string, homeLabel: string): unknown {
  const primaryPageNode = buildPrimaryStructuredDataNode(locale, page, content, canonicalUrl);
  const graph: unknown[] = [
    {
      "@type": "Organization",
      name: "Haitu",
      alternateName: locale === "zh" ? "Haitu 嗨兔" : "Haitu",
      url: absoluteMarketingUrl(origin, locale, ""),
      logo: `${trimOrigin(origin)}/static/logo.svg`,
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "support@haitu.online",
        url: absoluteMarketingUrl(origin, locale, "contact")
      }
    },
    {
      "@type": "WebSite",
      name: localizedSiteName(locale),
      url: absoluteMarketingUrl(origin, locale, ""),
      inLanguage: localeMeta[locale].hreflang
    },
    primaryPageNode
  ];

  if (page.slug) {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: homeLabel,
          item: absoluteMarketingUrl(origin, locale, "")
        },
        {
          "@type": "ListItem",
          position: 2,
          name: content.h1,
          item: absoluteMarketingUrl(origin, locale, page.slug)
        }
      ]
    });
  }

  graph.push({
    "@type": "FAQPage",
    inLanguage: localeMeta[locale].hreflang,
    mainEntity: content.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer
      }
    }))
  });

  return {
    "@context": "https://schema.org",
    "@graph": graph
  };
}

function buildPrimaryStructuredDataNode(
  locale: MarketingLocale,
  page: MarketingPage,
  content: MarketingPageLocaleContent,
  canonicalUrl: string
): unknown {
  if (page.slug === "contact") {
    return {
      "@type": "ContactPage",
      name: content.h1,
      url: canonicalUrl,
      description: content.description,
      inLanguage: localeMeta[locale].hreflang,
      dateModified: marketingLastModified
    };
  }
  if (isPolicyPage(page.slug)) {
    return {
      "@type": "WebPage",
      name: content.h1,
      url: canonicalUrl,
      description: content.description,
      inLanguage: localeMeta[locale].hreflang,
      dateModified: marketingLastModified
    };
  }
  return {
    "@type": "SoftwareApplication",
    name: "Haitu",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: canonicalUrl,
    description: content.description,
    inLanguage: localeMeta[locale].hreflang,
    dateModified: marketingLastModified,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: locale === "zh" ? "CNY" : "USD"
    }
  };
}

function isPolicyPage(slug: string): boolean {
  return slug === "terms" || slug === "privacy" || slug === "refund";
}

function findPage(slug: string): MarketingPage {
  const page = marketingPages.find((item) => item.slug === slug);
  if (!page) {
    throw new Error(`Unknown marketing page: ${slug}`);
  }
  return page;
}

function pageExists(locale: MarketingLocale, slug: string): boolean {
  return Boolean(marketingPages.find((page) => page.slug === slug) && getMarketingPageSlugs(locale).includes(slug));
}

function localizedSiteName(locale: MarketingLocale): string {
  return locale === "zh" ? "Haitu 嗨兔" : "Haitu";
}

function marketingPath(locale: MarketingLocale, slug: string): string {
  const prefix = localeMeta[locale].pathPrefix;
  if (!slug) {
    return prefix ? `${prefix}/` : "/";
  }
  return `${prefix}/${slug}`;
}

function primaryMarketingCtaHref(slug: string): string {
  return slug === "refund" ? "/console?section=wallet" : "/console";
}

function secondaryMarketingCtaHref(locale: MarketingLocale, slug: string): string {
  const secondaryTargets: Record<string, string> = {
    "": "features/ai-product-video-generator",
    terms: "privacy",
    privacy: "terms",
    refund: "contact",
    contact: "refund",
    "features/ai-product-image-generator": "features/ai-product-video-generator",
    "features/product-image-optimization": "features/ai-product-video-generator",
    "features/ai-product-video-generator": "features/product-image-optimization"
  };
  return marketingPath(locale, secondaryTargets[slug] ?? "features/batch-product-creative-generation");
}

function absoluteMarketingUrl(origin: string, locale: MarketingLocale, slug: string): string {
  return `${trimOrigin(origin)}${marketingPath(locale, slug)}`;
}

function publicMarketingOrigin(origin: string): string {
  const configuredOrigin = normalizePublicOrigin(process.env.HAITU_PUBLIC_BASE_URL);
  if (configuredOrigin) {
    return configuredOrigin;
  }
  const normalizedOrigin = normalizePublicOrigin(origin);
  if (!normalizedOrigin || isLocalOrigin(normalizedOrigin)) {
    return defaultPublicOrigin;
  }
  return normalizedOrigin;
}

function normalizePublicOrigin(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const url = new URL(trimmed);
    return trimOrigin(url.origin);
  } catch {
    return undefined;
  }
}

function isLocalOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname === "0.0.0.0"
      || hostname === "::1"
      || hostname === "[::1]";
  } catch {
    return true;
  }
}

function normalizePathname(pathname: string): string {
  if (marketingLocales.some((locale) => pathname === `${localeMeta[locale].pathPrefix}/`)) {
    return pathname;
  }
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
body{margin:0;min-height:100%;background:linear-gradient(180deg,#f8ecdf 0%,var(--bg) 38%,#efe0d0 100%);color:var(--text);font:14px/1.55 -apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","PingFang SC","Hiragino Sans","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
::selection{color:#fff;background:var(--accent)}
.sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.site-header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:20px;border-bottom:1px solid rgba(234,215,196,.82);background:rgba(255,250,243,.9);padding:14px clamp(18px,5vw,72px);backdrop-filter:blur(18px)}
.brand{display:inline-flex;align-items:center;gap:10px;font-size:20px;font-weight:950;letter-spacing:0}
.brand-logo{width:34px;height:34px;border-radius:var(--radius);box-shadow:0 9px 20px rgba(96,64,43,.14);display:block;flex:0 0 auto}
nav{display:flex;gap:6px;font-size:13px;font-weight:850;color:var(--muted)}
nav a{border-radius:var(--radius);padding:8px 10px}
nav a:hover{background:var(--panel2);color:var(--text)}
.header-console{margin-left:auto;display:inline-flex;align-items:center;justify-content:center;min-height:36px;border:1px solid transparent;border-radius:var(--radius);background:var(--accent2);padding:0 14px;color:#fff;font-size:12px;font-weight:950;box-shadow:0 12px 24px rgba(111,68,44,.18);transition:transform .16s ease,filter .16s ease}
.header-console:hover{transform:translateY(-1px);filter:brightness(1.04)}
.language-switcher{position:relative;margin-left:0}
.language-switcher summary{list-style:none;display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border:1px solid var(--border);border-radius:var(--radius);background:var(--field);padding:0;color:var(--accent2);box-shadow:var(--shadow);cursor:pointer;transition:background .16s ease,border-color .16s ease,color .16s ease,transform .16s ease}
.language-switcher summary::-webkit-details-marker{display:none}
.language-switcher summary:hover,.language-switcher[open] summary{border-color:color-mix(in srgb,var(--accent) 42%,var(--border));background:color-mix(in srgb,var(--accent) 10%,var(--field));color:var(--accent);transform:translateY(-1px)}
.language-icon{width:19px;height:19px;display:block;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.language-menu{position:absolute;right:0;top:calc(100% + 8px);z-index:8;display:grid;min-width:148px;border:1px solid var(--border);border-radius:var(--radius);background:var(--field);padding:5px;box-shadow:0 18px 38px rgba(96,64,43,.16)}
.language-menu a{border-radius:6px;padding:9px 10px;color:var(--muted);font-size:12px;font-weight:900}
.language-menu a:hover{background:var(--panel2);color:var(--text)}
.language-menu a[aria-current=true]{background:var(--accent);color:#fff}
.breadcrumb{position:relative;z-index:2;display:flex;align-items:center;gap:8px;padding:18px clamp(18px,5vw,72px) 0;color:var(--muted);font-size:12px;font-weight:850}
.breadcrumb a{color:var(--accent2)}
.breadcrumb a:hover{color:var(--accent)}
.breadcrumb span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.breadcrumb span::before{content:"/";margin-right:8px;color:var(--border-strong)}
.hero-stage{position:relative;display:grid;grid-template-columns:minmax(0,1fr) minmax(380px,.68fr);gap:28px;align-items:start;min-height:auto;padding:28px clamp(18px,5vw,72px) 32px;overflow:hidden}
.hero-stage::before{content:"";position:absolute;inset:14px clamp(12px,3vw,42px) 14px;z-index:0;border:1px solid rgba(234,215,196,.64);border-radius:18px;background:linear-gradient(135deg,rgba(255,250,243,.72),rgba(255,239,217,.58));box-shadow:0 30px 90px rgba(96,64,43,.12)}
.hero-stage::after{content:"";position:absolute;right:4vw;bottom:5vh;z-index:0;width:34vw;max-width:520px;aspect-ratio:1;border-radius:999px;background:radial-gradient(circle,rgba(10,163,148,.18),transparent 66%);filter:blur(4px)}
.hero-copy{position:relative;z-index:1;min-width:0;padding:clamp(10px,2vw,24px) 0}
.eyebrow{display:inline-flex;align-items:center;min-height:28px;margin:0 0 18px;border:1px solid color-mix(in srgb,var(--accent) 24%,var(--border));border-radius:999px;background:rgba(255,251,245,.68);padding:0 11px;color:var(--accent2);font-size:11px;font-weight:850;box-shadow:0 8px 18px rgba(96,64,43,.06)}
h1{max-width:680px;margin:0;color:var(--text);font-size:clamp(36px,4.15vw,58px);font-weight:780;line-height:1.12;letter-spacing:0;text-wrap:balance}
h1 span{display:block}
h1 span+span{margin-top:6px}
h1 .title-context{color:var(--accent2);font-size:.72em;font-weight:740;line-height:1.18}
.locale-en h1{font-size:clamp(36px,4vw,56px);line-height:1.13;max-width:760px;overflow-wrap:anywhere}
.locale-en h1 span{display:block}
.hero-subpage h1{font-size:clamp(32px,3.55vw,50px);line-height:1.14;max-width:700px;overflow-wrap:anywhere}
.locale-en .hero-subpage h1{font-size:clamp(31px,3.3vw,46px);line-height:1.15;max-width:700px}
.lead{max-width:620px;margin:24px 0 0;color:var(--muted);font-size:clamp(15px,1.18vw,17px);font-weight:540;line-height:1.82}
.locale-en .lead{font-size:clamp(15px,1.12vw,17px);line-height:1.8;max-width:660px}
.hero-subpage .lead{font-size:clamp(14px,1.08vw,17px);line-height:1.8;max-width:640px}
.hero-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.primary-action,.secondary-action{display:inline-flex;align-items:center;justify-content:center;min-height:46px;border-radius:var(--radius);padding:0 18px;font-size:13px;font-weight:950;transition:transform .16s ease,filter .16s ease,border-color .16s ease,color .16s ease,background .16s ease}
.primary-action{border:1px solid transparent;background:var(--accent);color:#fff;box-shadow:0 16px 30px rgba(10,163,148,.2)}
.primary-action:hover,.secondary-action:hover{transform:translateY(-1px)}
.primary-action:hover{filter:brightness(1.05)}
.secondary-action{border:1px solid var(--border-strong);background:rgba(255,251,245,.82);color:var(--text);box-shadow:var(--shadow)}
.secondary-action:hover{border-color:var(--accent);color:var(--accent)}
.studio-preview{position:relative;z-index:1;justify-self:end;width:min(100%,560px);min-width:0;border:1px solid var(--border-strong);border-radius:12px;background:linear-gradient(180deg,var(--panel),var(--card));box-shadow:0 22px 54px rgba(96,64,43,.14);overflow:hidden}
.preview-toolbar{display:flex;align-items:center;gap:6px;border-bottom:1px solid var(--border);background:rgba(255,251,245,.78);padding:10px 12px;color:var(--muted);font-size:11px;font-weight:950}
.preview-toolbar span{width:7px;height:7px;border-radius:999px;background:var(--border-strong)}
.preview-toolbar span:first-child{background:var(--brand-ember)}
.preview-toolbar span:nth-child(2){background:var(--warn)}
.preview-toolbar span:nth-child(3){background:var(--accent)}
.preview-toolbar strong{margin-left:6px;color:var(--text)}
.console-preview-shell{display:grid;grid-template-columns:132px minmax(0,1fr);min-height:300px;background:linear-gradient(180deg,rgba(255,251,245,.96),rgba(248,237,225,.82))}
.console-product-list{border-right:1px solid var(--border);background:rgba(255,250,243,.74);padding:10px 8px}
.console-list-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.console-list-head strong{color:var(--text);font-size:13px;font-weight:950;line-height:1.2}
.console-list-head span{color:var(--muted);font-size:10px;font-weight:850}
.console-search{margin-top:9px;border:1px solid var(--border-strong);border-radius:var(--radius);background:var(--field);padding:7px;color:var(--muted);font-size:10px;font-weight:850}
.console-product-items{display:grid;gap:6px;margin-top:8px}
.console-product-items article{min-width:0;border:1px solid transparent;border-radius:var(--radius);padding:7px;background:rgba(255,251,245,.46)}
.console-product-items article.is-active{border-color:color-mix(in srgb,var(--accent) 42%,var(--border));background:color-mix(in srgb,var(--accent) 10%,var(--field));box-shadow:0 12px 26px rgba(96,64,43,.08)}
.console-product-items strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);font-size:11px;font-weight:950}
.console-product-items span{display:block;margin-top:4px;color:var(--muted);font-size:9px;font-weight:850}
.console-workspace-preview{min-width:0;padding:10px;background:linear-gradient(135deg,rgba(255,250,243,.78),rgba(255,239,217,.5))}
.console-preview-title{display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid var(--border);padding-bottom:8px}
.console-preview-title strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);font-size:13px;font-weight:950}
.console-preview-title span{flex:0 0 auto;border:1px solid var(--border);border-radius:999px;background:var(--field);padding:3px 8px;color:var(--muted);font-size:10px;font-weight:950}
.console-workspace-grid{display:grid;grid-template-columns:minmax(130px,.85fr) minmax(0,1fr);gap:8px;margin-top:8px}
.console-facts-card,.console-images-card,.console-prompt-card,.console-history-card{min-width:0;border:1px solid var(--border);border-radius:var(--radius);background:rgba(255,251,245,.88);box-shadow:0 12px 26px rgba(96,64,43,.07)}
.console-facts-card,.console-images-card{padding:8px}
.console-card-title{display:flex;align-items:center;justify-content:space-between;gap:10px}
.console-card-title strong{color:var(--text);font-size:11px;font-weight:950}
.console-card-title span{border:1px solid color-mix(in srgb,var(--accent) 34%,var(--border));border-radius:var(--radius);background:color-mix(in srgb,var(--accent) 10%,var(--field));padding:4px 6px;color:var(--accent);font-size:9px;font-weight:950;line-height:1.2}
.console-facts-card p{margin:8px 0 0;color:var(--text);font-size:10px;font-weight:760;line-height:1.38}
.console-facts-card p+p{margin-top:5px}
.console-facts-card b{margin-right:6px;color:var(--muted);font-weight:950}
.console-reference-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:10px}
.console-reference-row span{position:relative;min-height:42px;border:1px solid var(--border);border-radius:var(--radius);background:linear-gradient(135deg,#2a211b 0 18%,#d7f0ea 19% 45%,#f5cfaa 46% 100%);overflow:hidden;color:var(--text);font-size:8px;font-weight:950;padding:27px 5px 5px}
.console-reference-row span:nth-child(2){background:linear-gradient(135deg,#f4d6c2 0 28%,#fffaf3 29% 52%,#c65a36 53% 100%)}
.console-reference-row span:nth-child(3){background:linear-gradient(135deg,#fffaf3 0 30%,#d7f0ea 31% 54%,#6f442c 55% 100%)}
.console-prompt-card{margin-top:8px;padding:8px}
.console-prompt-card p{margin:6px 0 0;color:var(--text);font-size:10px;font-weight:720;line-height:1.36}
.console-action-bar{display:flex;align-items:center;gap:6px;margin-top:0;border:1px solid var(--border);border-top:0;border-radius:0 0 var(--radius) var(--radius);background:rgba(255,251,245,.92);padding:8px}
.console-action-bar span,.console-action-bar strong{flex:0 0 auto;border:1px solid var(--border);border-radius:999px;background:var(--field);padding:5px 7px;color:var(--muted);font-size:9px;font-weight:950;line-height:1}
.console-action-bar strong{border-color:var(--accent2);background:var(--accent2);color:#fff}
.console-action-bar button{margin-left:auto;border:0;border-radius:var(--radius);background:var(--accent);padding:8px 10px;color:#fff;font:inherit;font-size:10px;font-weight:950;box-shadow:0 12px 24px rgba(10,163,148,.2)}
.console-action-bar button small{margin-left:6px;font-size:9px;font-weight:850;opacity:.86}
.console-history-card{margin-top:10px;padding:10px}
.console-history-card p{display:flex;align-items:center;gap:7px;margin:9px 0 0;color:var(--muted);font-size:10px;font-weight:850}
.console-history-card b{color:var(--text);font-weight:950}
.console-history-card p span{border:1px solid var(--border);border-radius:999px;background:var(--card2);padding:3px 7px;color:var(--muted);font-size:10px;font-weight:950}
.metric-strip{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--border);background:rgba(248,237,225,.72)}
.metric-strip strong{display:flex;align-items:center;justify-content:center;min-height:38px;border-right:1px solid var(--border);color:var(--text);font-size:10px;font-weight:950}
.metric-strip strong:last-child{border-right:0}
.platform-strip{display:flex;flex-wrap:wrap;gap:8px;padding:0 clamp(18px,5vw,72px) 34px;margin-top:-18px;position:relative;z-index:2}
.platform-strip span{border:1px solid var(--border);border-radius:999px;background:var(--field);padding:9px 13px;color:var(--muted);font-size:12px;font-weight:950;box-shadow:0 8px 20px rgba(96,64,43,.05)}
.geo-answer-block{display:grid;grid-template-columns:minmax(0,.9fr) minmax(260px,.55fr);gap:18px;margin:0 clamp(18px,5vw,72px) 28px;border:1px solid color-mix(in srgb,var(--accent) 30%,var(--border));border-radius:12px;background:linear-gradient(135deg,rgba(255,250,243,.9),rgba(215,240,234,.38));padding:22px;box-shadow:0 16px 38px rgba(96,64,43,.08)}
.geo-answer-block h2{margin:0;color:var(--text);font-size:22px;font-weight:950;line-height:1.22;letter-spacing:0}
.geo-answer-block p{margin:10px 0 0;color:var(--muted);font-size:14px;font-weight:660;line-height:1.72}
.geo-answer-block ul{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.geo-answer-block li{border:1px solid rgba(10,163,148,.18);border-radius:var(--radius);background:rgba(255,251,245,.72);padding:9px 10px;color:var(--accent2);font-size:12px;font-weight:920;line-height:1.42}
.geo-answer-block li::before{content:"";display:inline-block;width:7px;height:7px;margin-right:8px;border-radius:999px;background:var(--accent)}
.growth-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding:0 clamp(18px,5vw,72px) 46px}
.growth-card{min-width:0;border:1px solid var(--border);border-radius:var(--radius);background:rgba(255,250,243,.88);padding:24px;box-shadow:var(--shadow)}
.growth-card h2,.faq h2{margin:0;color:var(--text);font-size:24px;font-weight:950;line-height:1.18;letter-spacing:0}
.growth-card p,.faq p{color:var(--muted);font-weight:650;line-height:1.7}
.growth-card ul{margin:18px 0 0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.growth-card li{border:1px solid var(--border);border-radius:var(--radius);background:var(--field2);padding:9px 10px;color:var(--text);font-size:12px;font-weight:900}
.growth-card li::before{content:"";display:inline-block;width:7px;height:7px;margin-right:8px;border-radius:999px;background:var(--brand-ember)}
.home-capability-band,.payment-band,.trust-band,.final-cta{padding:54px clamp(18px,5vw,72px)}
.section-kicker{margin-bottom:10px;color:var(--brand-ember);font-size:11px;font-weight:950;letter-spacing:0;text-transform:uppercase}
.section-heading{display:grid;grid-template-columns:minmax(0,.78fr) minmax(260px,.52fr);gap:28px;align-items:end;margin-bottom:22px}
.section-heading h2,.payment-copy h2,.final-cta h2{margin:0;color:var(--text);font-size:clamp(26px,2.8vw,38px);font-weight:820;line-height:1.16;letter-spacing:0;text-wrap:balance}
.section-heading p,.payment-copy p,.final-cta p{margin:0;color:var(--muted);font-size:15px;font-weight:620;line-height:1.75}
.capability-grid,.trust-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.capability-card,.trust-grid article{min-width:0;border:1px solid var(--border);border-radius:var(--radius);background:rgba(255,250,243,.78);padding:20px;box-shadow:0 12px 28px rgba(96,64,43,.07)}
.capability-card h3,.trust-grid h3{margin:0;color:var(--text);font-size:17px;font-weight:950;line-height:1.24}
.capability-card p,.trust-grid p{margin:10px 0 0;color:var(--muted);font-size:13px;font-weight:650;line-height:1.65}
.capability-card ul{display:flex;flex-wrap:wrap;gap:7px;margin:16px 0 0;padding:0;list-style:none}
.capability-card li{border:1px solid var(--border);border-radius:999px;background:var(--field);padding:6px 9px;color:var(--accent2);font-size:11px;font-weight:950}
.payment-band{display:grid;grid-template-columns:minmax(280px,.72fr) minmax(0,1fr);gap:24px;align-items:stretch;background:rgba(255,250,243,.35)}
.payment-copy{border:1px solid var(--border-strong);border-radius:12px;background:linear-gradient(145deg,var(--panel),var(--card2));padding:26px;box-shadow:0 20px 54px rgba(96,64,43,.12)}
.payment-copy p{margin-top:16px}
.payment-copy strong{display:inline-flex;margin-top:20px;border:1px solid color-mix(in srgb,var(--accent) 36%,var(--border));border-radius:999px;background:color-mix(in srgb,var(--accent) 10%,var(--field));padding:8px 11px;color:var(--accent);font-size:12px;font-weight:950}
.payment-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0;padding:0;list-style:none}
.payment-steps li{min-width:0;border:1px solid var(--border);border-radius:var(--radius);background:rgba(255,251,245,.86);padding:18px;box-shadow:var(--shadow)}
.payment-steps small{display:inline-flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:999px;background:var(--accent2);color:#fff;font-size:11px;font-weight:950}
.payment-steps strong{display:block;margin-top:18px;color:var(--text);font-size:18px;font-weight:950;line-height:1.22}
.payment-steps span{display:block;margin-top:9px;color:var(--muted);font-size:13px;font-weight:650;line-height:1.65}
.trust-band .section-heading{align-items:center}
.trust-band .section-heading a{justify-self:end;border:1px solid var(--border-strong);border-radius:var(--radius);background:var(--field);padding:9px 12px;color:var(--accent2);font-size:12px;font-weight:950;box-shadow:var(--shadow)}
.trust-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
.trust-grid article{background:rgba(255,251,245,.74)}
.final-cta{margin:0 clamp(18px,5vw,72px) 72px;border:1px solid var(--border-strong);border-radius:16px;background:linear-gradient(135deg,rgba(255,250,243,.92),rgba(255,239,217,.72));text-align:center;box-shadow:0 22px 60px rgba(96,64,43,.12)}
.final-cta p{max-width:680px;margin:14px auto 0}
.final-cta .hero-actions{justify-content:center;margin-top:24px}
.faq{padding:0 clamp(18px,5vw,72px) 76px}
.faq h2{margin-bottom:12px}
.faq details{border:1px solid var(--border);border-radius:var(--radius);background:rgba(255,250,243,.86);box-shadow:var(--shadow);padding:15px 16px}
.faq details+details{margin-top:10px}
.faq summary{cursor:pointer;color:var(--text);font-size:15px;font-weight:950}
.faq details p{margin:10px 0 0}
.seo-footer{display:grid;grid-template-columns:minmax(220px,.95fr) repeat(4,minmax(128px,.58fr));gap:28px;border-top:1px solid var(--border);background:rgba(255,250,243,.9);padding:32px clamp(18px,5vw,72px) 38px}
.footer-brand-panel{min-width:0;max-width:360px}
.footer-brand{display:inline-flex;margin-bottom:10px;font-size:20px;font-weight:950;color:var(--text)}
.footer-brand-panel p{margin:0;color:var(--muted);font-size:13px;font-weight:640;line-height:1.7}
.seo-footer section{min-width:0}
.seo-footer h2{margin:0 0 10px;color:var(--accent2);font-size:12px;font-weight:950}
.seo-footer div{display:grid;gap:8px}
.seo-footer a{color:var(--muted);font-size:12px;font-weight:850;line-height:1.42;overflow-wrap:anywhere}
.seo-footer a:hover{color:var(--accent)}
@media (max-width:1080px){.hero-stage{grid-template-columns:1fr;padding-top:28px}.hero-stage::before{inset:12px 10px}.studio-preview{max-width:840px;justify-self:start}}
@media (max-width:960px){.section-heading,.payment-band{grid-template-columns:1fr}.capability-grid,.payment-steps,.trust-grid{grid-template-columns:1fr 1fr}.trust-band .section-heading a{justify-self:start}.seo-footer{grid-template-columns:repeat(2,minmax(0,1fr))}.footer-brand-panel{grid-column:1/-1;max-width:620px}}
@media (max-width:860px){.geo-answer-block,.growth-grid{grid-template-columns:1fr}.console-preview-shell{grid-template-columns:1fr}.console-product-list{border-right:0;border-bottom:1px solid var(--border)}.console-product-items{grid-template-columns:repeat(2,minmax(0,1fr))}.console-workspace-grid{grid-template-columns:1fr}.console-action-bar{flex-wrap:wrap}.console-action-bar button{width:100%;margin-left:0}.console-reference-row{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:780px){.site-header{align-items:flex-start;flex-direction:column}.header-console,.language-switcher{margin-left:0}.language-menu{left:0;right:auto}.growth-card ul{grid-template-columns:1fr}nav{flex-wrap:wrap}h1{font-size:clamp(34px,9.5vw,52px);line-height:1.1}.lead{font-size:15px;line-height:1.72}.console-product-items{grid-template-columns:1fr}.console-reference-row{grid-template-columns:1fr}.metric-strip{grid-template-columns:1fr}.metric-strip strong{border-right:0;border-bottom:1px solid var(--border)}.metric-strip strong:last-child{border-bottom:0}.capability-grid,.payment-steps,.trust-grid{grid-template-columns:1fr}.home-capability-band,.payment-band,.trust-band{padding-top:40px;padding-bottom:40px}.final-cta{margin-bottom:52px;padding:38px 18px}.seo-footer{grid-template-columns:1fr}.breadcrumb{padding-top:14px}}
`;
