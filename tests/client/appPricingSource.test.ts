import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const appPath = "src/client/App.tsx";

describe("console model pricing source", () => {
  it("renders provider pricing as a tabbed switcher instead of all provider columns", async () => {
    const source = await readFile(appPath, "utf8");
    const panelSource = source.slice(source.indexOf("function ModelPricingPanel"), source.indexOf("function ModelPricingRow"));

    expect(panelSource).toContain('useState<ModelPricingProviderId>("openai")');
    expect(panelSource).toContain('role="tablist"');
    expect(panelSource).toContain("aria-selected={active}");
    expect(panelSource).toContain("pricingEntriesForProvider(activeProvider.id)");
    expect(panelSource).not.toContain("xl:grid-cols-3");
  });

  it("keeps each model card compact with three comparison metrics and collapsible notes", async () => {
    const source = await readFile(appPath, "utf8");
    const rowSource = source.slice(source.indexOf("function ModelPricingRow"), source.indexOf("function PriceMetric"));

    expect(rowSource).toContain('<PriceMetric label={entry.kind === "video" ? "计费入口" : "输入"} value={entry.input} />');
    expect(rowSource).toContain('<PriceMetric label={secondaryPriceMetricLabel(entry.kind)} value={entry.cachedInput ?? "-"} />');
    expect(rowSource).toContain('<PriceMetric label={entry.kind === "image" || entry.kind === "video" ? "生成输出" : "输出"} value={entry.output} />');
    expect(rowSource).toContain("<details");
  });

  it("uses model-type-specific labels for the secondary pricing metric", async () => {
    const source = await readFile(appPath, "utf8");
    const labelSource = source.slice(source.indexOf("function secondaryPriceMetricLabel"), source.indexOf("function modelPricingKindIcon"));

    expect(labelSource).toContain('if (kind === "video") return "含输入视频";');
    expect(labelSource).toContain('if (kind === "image") return "计费基准";');
    expect(labelSource).toContain('return "缓存输入";');
  });
});
