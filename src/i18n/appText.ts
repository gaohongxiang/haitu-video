import type { AppLocale } from "./config.js";
import { i18nResources } from "./resources.js";

export function appText(key: string, locale?: AppLocale, options?: Record<string, unknown>): string {
  const targetLocale = locale ?? "zh";
  const fallbackLocale: AppLocale = "zh";
  const value = nestedResourceValue(i18nResources[targetLocale].app, key)
    ?? nestedResourceValue(i18nResources[fallbackLocale].app, key)
    ?? key;
  if (typeof value !== "string") return key;
  return interpolate(value, options);
}

function interpolate(value: string, options?: Record<string, unknown>): string {
  return value.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(options?.[name] ?? ""));
}

function nestedResourceValue(resource: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((current, part) => {
    if (current && typeof current === "object" && part in current) {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, resource);
}
