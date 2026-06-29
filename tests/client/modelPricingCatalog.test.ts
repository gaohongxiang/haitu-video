import { describe, expect, it } from "vitest";

import {
  localizedModelPricingEntry,
  localizedModelPricingProvider,
  modelPricingCatalog,
  modelPricingProviders
} from "../../src/client/modelPricingCatalog.js";

describe("model pricing catalog", () => {
  it("groups official pricing snapshots by the providers shown in the console", () => {
    expect(modelPricingProviders.map((provider) => provider.id)).toEqual(["openai", "deepseek", "gemini", "volcengine"]);
    expect(modelPricingCatalog.every((entry) => entry.sourceUrl.startsWith("https://"))).toBe(true);
  });

  it("includes key official rates users compare before choosing a model", () => {
    const openaiEntries = modelPricingCatalog.filter((entry) => entry.providerId === "openai");
    expect(openaiEntries.map((entry) => entry.model)).toEqual([
      "gpt-5.5",
      "gpt-image-2",
      "gpt-5",
      "gpt-5-mini",
      "gpt-4.1",
      "gpt-4o-mini"
    ]);
    expect(openaiEntries).toContainEqual(expect.objectContaining({
      providerId: "openai",
      model: "gpt-5.5",
      input: "US$5.00",
      cachedInput: "US$0.50",
      output: "US$30.00",
      unit: "/ 1M tokens",
      costFactors: expect.arrayContaining(["文本输入 tokens", "缓存输入命中", "生成输出 tokens"]),
      formula: "文本总成本 = 输入 tokens / 1M × US$5.00 + 输出 tokens / 1M × US$30.00；缓存命中输入按 tokens / 1M × US$0.50",
      examples: expect.arrayContaining([
        expect.objectContaining({ label: "100k 输入 + 20k 输出", value: "US$1.10" })
      ]),
      billingNote: expect.stringContaining("默认按即时标准价估算")
    }));
    expect(openaiEntries).toContainEqual(expect.objectContaining({
      providerId: "openai",
      model: "gpt-5",
      kind: "text",
      input: "US$1.25",
      cachedInput: "US$0.125",
      output: "US$10.00",
      unit: "/ 1M tokens"
    }));
    expect(openaiEntries).toContainEqual(expect.objectContaining({
      providerId: "openai",
      model: "gpt-image-2",
      kind: "image",
      input: "US$8.00",
      cachedInput: "US$2.00",
      output: "US$30.00",
      unit: "/ 1M image tokens",
      costFactors: expect.arrayContaining(["文本输入 tokens", "图片输入 tokens", "图片输出 tokens", "缓存输入命中"]),
      formula: "图片总成本 = 文本输入 tokens / 1M × US$5.00 + 图片输入 tokens / 1M × US$8.00 + 图片输出 tokens / 1M × US$30.00",
      examples: expect.arrayContaining([
        expect.objectContaining({ label: "10k 文本 + 100k 图片输入 + 100k 图片输出", value: "US$3.85" })
      ]),
      billingNote: expect.stringContaining("默认按即时标准价估算")
    }));
    expect(modelPricingCatalog).toContainEqual(expect.objectContaining({
      providerId: "gemini",
      model: "gemini-2.5-flash-image",
      input: "按张估算",
      output: "¥0.30 / 张",
      unit: "/ 张"
    }));
    expect(modelPricingCatalog).toContainEqual(expect.objectContaining({
      providerId: "deepseek",
      model: "deepseek-v4-flash",
      input: "US$0.14",
      cachedInput: "US$0.0028",
      output: "US$0.28",
      unit: "/ 1M tokens",
      costFactors: expect.arrayContaining(["缓存未命中输入 tokens", "缓存命中输入 tokens", "生成输出 tokens"]),
      formula: "文本总成本 = 缓存未命中输入 tokens / 1M × US$0.14 + 缓存命中输入 tokens / 1M × US$0.0028 + 输出 tokens / 1M × US$0.28",
      examples: expect.arrayContaining([
        expect.objectContaining({ label: "100k 未命中输入 + 20k 输出", value: "US$0.0196" })
      ])
    }));
    expect(modelPricingCatalog).toContainEqual(expect.objectContaining({
      providerId: "volcengine",
      model: "doubao-seedance-2.0-fast",
      input: "¥37.00",
      output: "480p 5s ¥1.86 / 720p 5s ¥4.00",
      unit: "/ 1M tokens",
      costFactors: expect.arrayContaining([
        "输出视频时长",
        "输出视频分辨率",
        "输出视频宽高比",
        "输出视频帧率",
        "是否包含输入视频"
      ])
    }));
  });

  it("documents official Seedance video cost formula and typical examples", () => {
    const fast = modelPricingCatalog.find((entry) => entry.model === "doubao-seedance-2.0-fast")!;
    const quality = modelPricingCatalog.find((entry) => entry.model === "doubao-seedance-2.0")!;

    expect(fast.formula).toBe("费用 = token 单价 × (输入视频时长 + 输出视频时长) × 输出宽 × 输出高 × 帧率 / 1024");
    expect(fast.examples).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "480p 16:9 5s", value: "¥1.86 / 条" }),
      expect.objectContaining({ label: "720p 16:9 5s", value: "¥4.00 / 条" })
    ]));
    expect(quality.examples).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "1080p 16:9 5s", value: "¥12.39 / 条" }),
      expect.objectContaining({ label: "4k 16:9 5s", value: "¥25.27 / 条" })
    ]));
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
      output: "¥16.00",
      costFactors: expect.arrayContaining(["文本输入 tokens", "缓存输入命中", "生成输出 tokens", "长上下文分段"]),
      formula: "文本总成本 = 输入 tokens / 1M × ¥3.20 + 输出 tokens / 1M × ¥16.00；缓存命中输入按 tokens / 1M × ¥0.017",
      examples: expect.arrayContaining([
        expect.objectContaining({ label: "100k 输入 + 20k 输出", value: "¥0.64" })
      ])
    }));
    expect(volcengineEntries).toContainEqual(expect.objectContaining({
      model: "doubao-seedream-5.0-lite",
      input: "按张计费",
      cachedInput: "成功输出",
      output: "¥0.22 / 张",
      costFactors: expect.arrayContaining(["成功输出张数", "组图生成张数", "失败或拦截输出"]),
      formula: "图片总成本 = 成功输出图片张数 × ¥0.22",
      examples: expect.arrayContaining([
        expect.objectContaining({ label: "1 张成功输出", value: "¥0.22" })
      ])
    }));
  });

  it("uses explicit currency symbols for USD and CNY prices", () => {
    const priceFields: Array<string | undefined> = modelPricingCatalog.flatMap((entry) => [entry.input, "cachedInput" in entry ? entry.cachedInput : undefined, entry.output]);
    const concreteCurrencyFields = priceFields.filter((value): value is string => typeof value === "string" && /[$¥]/.test(value));

    expect(concreteCurrencyFields.some((value) => value.startsWith("US$"))).toBe(true);
    expect(concreteCurrencyFields.some((value) => value.startsWith("¥"))).toBe(true);
    expect(concreteCurrencyFields.every((value) => !value.startsWith("$"))).toBe(true);
  });

  it("localizes provider names, summaries, labels, notes, and billing units without changing model ids or prices", () => {
    const volcengine = modelPricingProviders.find((provider) => provider.id === "volcengine")!;
    const openaiEntry = modelPricingCatalog.find((entry) => entry.model === "gpt-5.5")!;
    const seedreamEntry = modelPricingCatalog.find((entry) => entry.model === "doubao-seedream-5.0-lite")!;

    expect(localizedModelPricingProvider(volcengine, "en")).toEqual(expect.objectContaining({
      name: "Volcengine",
      sourceLabel: "Volcengine Ark model pricing"
    }));
    expect(localizedModelPricingProvider(volcengine, "en").summary).not.toContain("火山");
    expect(localizedModelPricingEntry(openaiEntry, "en")).toEqual(expect.objectContaining({
      model: "gpt-5.5",
      label: "Flagship text",
      unit: "/ 1M tokens",
      input: "US$5.00",
      output: "US$30.00",
      billingNote: expect.stringContaining("Default estimates use immediate standard pricing")
    }));
    expect(localizedModelPricingEntry(openaiEntry, "en").note).not.toContain("短上下文");
    expect(localizedModelPricingEntry(seedreamEntry, "en")).toEqual(expect.objectContaining({
      label: "Image generation",
      input: "Per image",
      cachedInput: "Successful output",
      output: "¥0.22 / image"
    }));
  });
});
