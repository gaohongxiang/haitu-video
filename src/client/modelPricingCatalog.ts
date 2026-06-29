import type { AppLocale } from "../i18n/config.js";
import { appText } from "../i18n/appText.js";
import {
  officialModelPricingCatalog,
  type ModelPricingEntry,
  type ModelPricingProvider,
  type ModelPricingProviderId
} from "../modelPricing/officialModelPricingCatalog.js";

export {
  officialModelPricingCatalog as modelPricingCatalog,
  officialModelPricingProviders as modelPricingProviders,
  officialModelPricingUpdatedAt as modelPricingUpdatedAt
} from "../modelPricing/officialModelPricingCatalog.js";

export type {
  ModelPricingExample,
  ModelPricingEntry,
  ModelPricingKind,
  ModelPricingProvider,
  ModelPricingProviderId,
  ModelPricingStatus
} from "../modelPricing/officialModelPricingCatalog.js";

export function pricingEntriesForProvider(
  providerId: ModelPricingProviderId,
  catalog: readonly ModelPricingEntry[] = officialModelPricingCatalog
): ModelPricingEntry[] {
  return catalog.filter((entry) => entry.providerId === providerId);
}

export function localizedModelPricingProvider(provider: ModelPricingProvider, locale?: AppLocale): ModelPricingProvider {
  const baseKey = `pricing.catalog.providers.${provider.resourceKey}`;
  return {
    ...provider,
    name: appText(`${baseKey}.name`, locale),
    summary: appText(`${baseKey}.summary`, locale),
    sourceLabel: appText(`${baseKey}.sourceLabel`, locale)
  };
}

export function localizedModelPricingEntry(entry: ModelPricingEntry, locale?: AppLocale): ModelPricingEntry {
  const baseKey = `pricing.catalog.entries.${entry.resourceKey}`;
  return {
    ...entry,
    label: appText(`${baseKey}.label`, locale),
    unit: appText(`${baseKey}.unit`, locale),
    input: appText(`${baseKey}.input`, locale),
    cachedInput: entry.cachedInput === undefined ? undefined : appText(`${baseKey}.cachedInput`, locale),
    output: appText(`${baseKey}.output`, locale),
    note: entry.note === undefined ? undefined : appText(`${baseKey}.note`, locale),
    billingNote: entry.billingNote === undefined ? undefined : appText(`${baseKey}.billingNote`, locale),
    costFactors: entry.costFactors === undefined ? undefined : localizedList(`${baseKey}.costFactors`, entry.costFactors, locale),
    formula: entry.formula === undefined ? undefined : localizedValue(`${baseKey}.formula`, entry.formula, locale),
    examples: entry.examples === undefined ? undefined : localizedExamples(`${baseKey}.examples`, entry.examples, locale)
  };
}

function localizedValue(key: string, fallback: string, locale?: AppLocale): string {
  const localized = appText(key, locale);
  return localized === key ? fallback : localized;
}

function localizedList(baseKey: string, fallback: readonly string[], locale?: AppLocale): string[] {
  return fallback.map((value, index) => {
    return localizedValue(`${baseKey}.${index}`, value, locale);
  });
}

function localizedExamples(baseKey: string, fallback: NonNullable<ModelPricingEntry["examples"]>, locale?: AppLocale): NonNullable<ModelPricingEntry["examples"]> {
  return fallback.map((example, index) => {
    return {
      label: localizedValue(`${baseKey}.${index}.label`, example.label, locale),
      value: localizedValue(`${baseKey}.${index}.value`, example.value, locale)
    };
  });
}
