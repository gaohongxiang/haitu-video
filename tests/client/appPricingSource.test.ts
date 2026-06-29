import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const appPath = "src/client/App.tsx";

describe("console model pricing source", () => {
  it("renders provider pricing as a tabbed switcher instead of all provider columns", async () => {
    const source = await readFile(appPath, "utf8");
    const appSource = source.slice(source.indexOf("export function App()"), source.indexOf("function AppLanguageSwitcher"));
    const panelSource = source.slice(source.indexOf("function ModelPricingPanel"), source.indexOf("function ModelPricingRow"));

    expect(appSource).toContain("modelPricingCatalogResponse");
    expect(appSource).toContain("setModelPricingCatalog(modelPricingCatalogResponse.active)");
    expect(appSource).toContain("<ModelPricingPanel appLocale={appLocale} catalog={modelPricingCatalog} />");
    expect(panelSource).toContain('useState<ModelPricingProviderId>("openai")');
    expect(panelSource).toContain('role="tablist"');
    expect(panelSource).toContain("aria-selected={active}");
    expect(panelSource).toContain("pricingEntriesForProvider(activeProvider.id, catalog.entries)");
    expect(panelSource).toContain("catalog.version");
    expect(panelSource).toContain("catalog.source");
    expect(panelSource).toContain("localizedModelPricingProvider");
    expect(panelSource).toContain("localizedModelPricingEntry");
    expect(panelSource).not.toContain("xl:grid-cols-3");
  });

  it("keeps each model card compact with three comparison metrics and visible pricing context", async () => {
    const source = await readFile(appPath, "utf8");
    const rowSource = source.slice(source.indexOf("function ModelPricingRow"), source.indexOf("function PriceMetric"));

    expect(rowSource).toContain('<PriceMetric label={entry.kind === "video" ? tPricing("billingEntry") : tPricing("input")} value={entry.input} />');
    expect(rowSource).toContain('<PriceMetric label={secondaryPriceMetricLabel(entry.kind)} value={entry.cachedInput ?? "-"} />');
    expect(rowSource).toContain('<PriceMetric label={entry.kind === "image" || entry.kind === "video" ? tPricing("generatedOutput") : tPricing("output")} value={entry.output} />');
    expect(rowSource).toContain("entry.billingNote");
    expect(rowSource).toContain('tPricing("billingNote")');
    expect(rowSource).not.toContain("<details");
    expect(rowSource).not.toContain('tPricing("expand")');
    expect(rowSource).not.toContain('tPricing("collapse")');
  });

  it("surfaces formula details whenever a model provides them", async () => {
    const source = await readFile(appPath, "utf8");
    const rowSource = source.slice(source.indexOf("function ModelPricingRow"), source.indexOf("function PriceMetric"));

    expect(rowSource).toContain("entry.costFactors");
    expect(rowSource).toContain("entry.formula");
    expect(rowSource).toContain("entry.examples");
    expect(rowSource).toContain("entry.costFactors || entry.formula || entry.examples");
    expect(rowSource).toContain('tPricing("costFactors")');
    expect(rowSource).toContain('tPricing("formula")');
    expect(rowSource).toContain('tPricing("examples")');
  });

  it("uses model-type-specific labels for the secondary pricing metric", async () => {
    const source = await readFile(appPath, "utf8");
    const labelSource = source.slice(source.indexOf("function secondaryPriceMetricLabel"), source.indexOf("function modelPricingKindIcon"));

    expect(labelSource).toContain('if (kind === "video") return tPricing("secondary.video");');
    expect(labelSource).toContain('if (kind === "image") return tPricing("secondary.image");');
    expect(labelSource).toContain('return tPricing("secondary.text");');
  });
});
