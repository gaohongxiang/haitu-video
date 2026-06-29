import enApp from "./locales/en/app.json" with { type: "json" };
import enCommon from "./locales/en/common.json" with { type: "json" };
import enMarketing from "./locales/en/marketing.json" with { type: "json" };
import zhApp from "./locales/zh/app.json" with { type: "json" };
import zhCommon from "./locales/zh/common.json" with { type: "json" };
import zhMarketing from "./locales/zh/marketing.json" with { type: "json" };
import type { AppLocale, I18nNamespace } from "./config.js";

export const i18nResources = {
  zh: {
    common: zhCommon,
    marketing: zhMarketing,
    app: zhApp
  },
  en: {
    common: enCommon,
    marketing: enMarketing,
    app: enApp
  }
} satisfies Record<AppLocale, Record<I18nNamespace, unknown>>;

export type I18nResources = typeof i18nResources;
