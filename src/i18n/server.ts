import { createInstance, type i18n, type Resource } from "i18next";

import {
  defaultLocale,
  defaultNamespace,
  namespaces,
  supportedLocales,
  type AppLocale,
  type I18nNamespace
} from "./config.js";
import { i18nResources } from "./resources.js";

export interface MarketingSection {
  heading: string;
  body: string;
  bullets: string[];
}

export interface MarketingFaq {
  question: string;
  answer: string;
}

export interface MarketingGeoAnswer {
  question: string;
  answer: string;
  points: string[];
}

export interface MarketingPreviewLabels {
  ariaLabel: string;
  libraryTitle: string;
  libraryCount: string;
  searchPlaceholder: string;
  selectedProduct: string;
  productTwo: string;
  productThree: string;
  productFour: string;
  productFive: string;
  generatable: string;
  referencesShort: string;
  productTitle: string;
  versionCount: string;
  factsHeading: string;
  aiPack: string;
  estimatedDraftCost: string;
  titleLabel: string;
  productTitleValue: string;
  categoryLabel: string;
  productCategoryValue: string;
  imagesHeading: string;
  addImage: string;
  referenceOne: string;
  referenceTwo: string;
  referenceThree: string;
  promptHeading: string;
  promptLineOne: string;
  promptLineTwo: string;
  promptLineThree: string;
  promptLineFour: string;
  imageMode: string;
  videoMode: string;
  videoModel: string;
  storyboardStatus: string;
  aspectRatio: string;
  duration: string;
  resolution: string;
  finalLanguage: string;
  estimateCost: string;
  generateVideo: string;
  historyHeading: string;
  historyCount: string;
  historyItem: string;
  expired: string;
  metricOne: string;
  metricTwo: string;
  metricThree: string;
  hostedModel: string;
  customModel: string;
}

export interface MarketingHomepageContent {
  capability: {
    eyebrow: string;
    title: string;
    body: string;
    items: MarketingSection[];
  };
  payment: {
    eyebrow: string;
    title: string;
    body: string;
    note: string;
    steps: Array<{
      label: string;
      title: string;
      body: string;
    }>;
  };
  trust: {
    eyebrow: string;
    title: string;
    items: MarketingSection[];
  };
  finalCta: {
    title: string;
    body: string;
    primaryCta: string;
    secondaryCta: string;
  };
}

export interface MarketingPageContent {
  title: string;
  description: string;
  h1: string;
  eyebrow: string;
  lead: string;
  primaryCta: string;
  secondaryCta: string;
  heroTitleLines?: string[];
  geoAnswer: MarketingGeoAnswer;
  sections: MarketingSection[];
  faqs: MarketingFaq[];
}

export interface MarketingPageMeta {
  priority: string;
  changefreq: string;
}

interface RawMarketingPage {
  slug: string;
  title: string;
  description: string;
  h1: string;
  eyebrow: string;
  lead: string;
  primaryCta: string;
  secondaryCta: string;
  heroTitleLines?: string[];
  geoAnswer?: MarketingGeoAnswer;
  sections?: MarketingSection[];
  faqs?: MarketingFaq[];
}

interface MarketingFaqResource {
  commonGeoFaqs?: MarketingFaq[];
  pageGeoFaqs?: Record<string, MarketingFaq[]>;
}

export function createServerI18n(locale: AppLocale, ns: I18nNamespace[] = namespaces): i18n {
  const instance = createInstance();
  void instance.init({
    resources: i18nResources as Resource,
    lng: locale,
    fallbackLng: defaultLocale,
    supportedLngs: [...supportedLocales],
    ns,
    defaultNS: defaultNamespace,
    interpolation: {
      escapeValue: false
    },
    initAsync: false
  });
  return instance;
}

export function getMarketingPageSlugs(locale: AppLocale): string[] {
  return createServerI18n(locale, ["marketing"]).t("marketing:pageOrder", {
    returnObjects: true
  }) as string[];
}

export function getMarketingPageMeta(locale: AppLocale, slug: string): MarketingPageMeta {
  const marketingResource = i18nResources[locale].marketing as {
    pageMeta: Record<string, MarketingPageMeta>;
  };
  const meta = marketingResource.pageMeta[slug];
  if (!meta) {
    throw new Error(`Missing marketing page metadata for ${locale}:${slug}`);
  }
  return meta;
}

export function getMarketingPreviewLabels(locale: AppLocale): MarketingPreviewLabels {
  return createServerI18n(locale, ["marketing"]).t("marketing:preview", {
    returnObjects: true
  }) as MarketingPreviewLabels;
}

export function getMarketingHomepageContent(locale: AppLocale): MarketingHomepageContent {
  return createServerI18n(locale, ["marketing"]).t("marketing:homepage", {
    returnObjects: true
  }) as MarketingHomepageContent;
}

export function getMarketingPageContent(locale: AppLocale, slug: string): MarketingPageContent {
  const i18n = createServerI18n(locale, ["marketing"]);
  const pageKey = marketingPageKey(slug);
  const rawPage = i18n.t(`marketing:pages.${pageKey}`, {
    marketplaces: i18n.t("marketing:marketplaces"),
    returnObjects: true
  }) as RawMarketingPage;
  const defaultSections = i18n.t("marketing:defaultSections", {
    returnObjects: true
  }) as MarketingSection[];
  const defaultFaqs = i18n.t("marketing:defaultFaqs", {
    returnObjects: true
  }) as MarketingFaq[];
  const geoAnswers = i18n.t("marketing:geoAnswers", {
    returnObjects: true
  }) as Record<string, MarketingGeoAnswer>;
  const marketingResource = i18nResources[locale].marketing as MarketingFaqResource;
  const pageGeoFaqs = marketingResource.pageGeoFaqs?.[pageKey] ?? [];
  const commonGeoFaqs = pageGeoFaqs.length ? marketingResource.commonGeoFaqs ?? [] : [];

  if (!rawPage || rawPage.slug !== slug) {
    throw new Error(`Missing marketing translation for ${locale}:${slug}`);
  }

  return {
    title: rawPage.title,
    description: rawPage.description,
    h1: rawPage.h1,
    eyebrow: rawPage.eyebrow,
    lead: rawPage.lead,
    primaryCta: rawPage.primaryCta,
    secondaryCta: rawPage.secondaryCta,
    heroTitleLines: rawPage.heroTitleLines,
    geoAnswer: rawPage.geoAnswer ?? geoAnswers[pageKey] ?? geoAnswers.default,
    sections: rawPage.sections ?? defaultSections,
    faqs: mergeMarketingFaqs(rawPage.faqs ?? defaultFaqs, pageGeoFaqs, commonGeoFaqs)
  };
}

function mergeMarketingFaqs(...groups: MarketingFaq[][]): MarketingFaq[] {
  const seen = new Set<string>();
  const merged: MarketingFaq[] = [];
  for (const group of groups) {
    for (const faq of group) {
      if (seen.has(faq.question)) {
        continue;
      }
      seen.add(faq.question);
      merged.push(faq);
    }
  }
  return merged;
}

export function marketingPageKey(slug: string): string {
  return slug ? slug.replaceAll("/", "-") : "home";
}
