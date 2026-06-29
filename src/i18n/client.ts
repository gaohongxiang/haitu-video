import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import {
  defaultLocale,
  defaultNamespace,
  supportedLocales,
  type AppLocale
} from "./config.js";
import { i18nResources } from "./resources.js";

export const clientLocaleStorageKey = "haitu-console-locale";

export function detectClientLocale(): AppLocale {
  const storedLocale = window.localStorage.getItem(clientLocaleStorageKey);
  if (storedLocale && supportedLocales.includes(storedLocale as AppLocale)) {
    return storedLocale as AppLocale;
  }
  const pathLocale = window.location.pathname.split("/").filter(Boolean)[0];
  if (supportedLocales.includes(pathLocale as AppLocale)) {
    return pathLocale as AppLocale;
  }
  const browserLocale = window.navigator.language.toLowerCase();
  return browserLocale.startsWith("en") ? "en" : defaultLocale;
}

export function initClientI18n(locale: AppLocale = detectClientLocale()): typeof i18n {
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({
      resources: i18nResources,
      lng: locale,
      fallbackLng: defaultLocale,
      supportedLngs: [...supportedLocales],
      ns: ["common", "app"],
      defaultNS: defaultNamespace,
      interpolation: {
        escapeValue: false
      }
    });
  } else if (i18n.language !== locale) {
    void i18n.changeLanguage(locale);
  }
  return i18n;
}

export { i18n };
