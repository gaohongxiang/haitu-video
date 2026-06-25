import { describe, expect, it } from "vitest";

import { modelPricingCatalog, modelPricingProviders } from "../../src/client/modelPricingCatalog.js";

describe("model pricing catalog", () => {
  it("groups official pricing snapshots by the providers shown in the console", () => {
    expect(modelPricingProviders.map((provider) => provider.id)).toEqual(["openai", "deepseek", "volcengine"]);
    expect(modelPricingCatalog.every((entry) => entry.sourceUrl.startsWith("https://"))).toBe(true);
  });

  it("includes key official rates users compare before choosing a model", () => {
    expect(modelPricingCatalog).toContainEqual(expect.objectContaining({
      providerId: "openai",
      model: "gpt-5",
      input: "US$1.25",
      cachedInput: "US$0.125",
      output: "US$10.00",
      unit: "/ 1M tokens"
    }));
    expect(modelPricingCatalog).toContainEqual(expect.objectContaining({
      providerId: "deepseek",
      model: "deepseek-v4-flash",
      input: "US$0.14",
      cachedInput: "US$0.0028",
      output: "US$0.28",
      unit: "/ 1M tokens"
    }));
    expect(modelPricingCatalog).toContainEqual(expect.objectContaining({
      providerId: "volcengine",
      model: "doubao-seedance-2.0-fast",
      input: "¥37.00",
      output: "480p 5s ¥1.86 / 720p 5s ¥4.00",
      unit: "/ 1M tokens"
    }));
  });

  it("shows concrete official Volcengine prices instead of placeholder settlement labels", () => {
    const volcengineEntries = modelPricingCatalog.filter((entry) => entry.providerId === "volcengine");

    expect(volcengineEntries.length).toBeGreaterThan(0);
    expect(volcengineEntries.every((entry) => entry.status === "verified")).toBe(true);
    expect(volcengineEntries.every((entry) => {
      const cachedInput = "cachedInput" in entry ? entry.cachedInput : undefined;
      return ![entry.input, cachedInput, entry.output].some((value) => value?.includes("控制台结算"));
    })).toBe(true);
    expect(volcengineEntries).toContainEqual(expect.objectContaining({
      model: "doubao-seed-2.0-pro",
      input: "¥3.20",
      cachedInput: "¥0.017",
      output: "¥16.00"
    }));
    expect(volcengineEntries).toContainEqual(expect.objectContaining({
      model: "doubao-seedream-5.0-lite",
      input: "按张计费",
      cachedInput: "成功输出",
      output: "¥0.22 / 张"
    }));
  });

  it("uses explicit currency symbols for USD and CNY prices", () => {
    const priceFields: Array<string | undefined> = modelPricingCatalog.flatMap((entry) => [entry.input, "cachedInput" in entry ? entry.cachedInput : undefined, entry.output]);
    const concreteCurrencyFields = priceFields.filter((value): value is string => typeof value === "string" && /[$¥]/.test(value));

    expect(concreteCurrencyFields.some((value) => value.startsWith("US$"))).toBe(true);
    expect(concreteCurrencyFields.some((value) => value.startsWith("¥"))).toBe(true);
    expect(concreteCurrencyFields.every((value) => !value.startsWith("$"))).toBe(true);
  });
});
