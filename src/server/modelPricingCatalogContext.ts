import {
  officialModelPricingCatalog,
  officialModelPricingUpdatedAt,
  type ModelPricingEntry
} from "../modelPricing/officialModelPricingCatalog.js";

export interface ModelPricingCatalogContext {
  catalog: readonly ModelPricingEntry[];
  version: string;
  source: "built_in" | "database";
}

export function builtInModelPricingCatalogContext(): ModelPricingCatalogContext {
  return {
    catalog: officialModelPricingCatalog,
    version: officialModelPricingUpdatedAt,
    source: "built_in"
  };
}

