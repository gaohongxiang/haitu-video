export const supportedLocales = ["zh", "en"] as const;

export type AppLocale = (typeof supportedLocales)[number];

export type I18nNamespace = "common" | "marketing" | "app";

export type Hreflang = "zh-CN" | "en";

export interface LocaleMeta {
  label: string;
  hreflang: Hreflang;
  htmlLang: string;
  pathPrefix: string;
}

export const defaultLocale: AppLocale = "zh";

export const defaultNamespace: I18nNamespace = "common";

export const namespaces: I18nNamespace[] = ["common", "marketing", "app"];

const localeMeta: Record<AppLocale, LocaleMeta> = {
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

export function getLocaleMeta(locale: AppLocale): LocaleMeta {
  return localeMeta[locale];
}

export function isSupportedLocale(value: string): value is AppLocale {
  return supportedLocales.includes(value as AppLocale);
}
