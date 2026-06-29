import { describe, expect, it } from "vitest";

import {
  officialModelPricingUpdatedAt,
  officialModelPricingCatalog,
  officialModelPricingProviders,
  modelPricingEntryForModel
} from "../../src/modelPricing/officialModelPricingCatalog.js";
import {
  estimateImageUpstreamCostCny,
  estimateTextUpstreamCostCny,
  estimateVideoUpstreamCostCny,
  modelPricingSnapshotForUsage,
  videoTokenPriceCnyPerMillion
} from "../../src/server/modelPricing.js";
import {
  modelPricingCatalog,
  modelPricingProviders,
  modelPricingUpdatedAt
} from "../../src/client/modelPricingCatalog.js";
import {
  catalogEntriesForProvider,
  modelIdsFromInput,
  modelCatalogEntries
} from "../../src/providers/modelCatalog.js";

describe("shared official model pricing catalog", () => {
  it("is the single source used by the console pricing page and server billing estimates", () => {
    expect(modelPricingUpdatedAt).toBe(officialModelPricingUpdatedAt);
    expect(modelPricingProviders).toBe(officialModelPricingProviders);
    expect(modelPricingCatalog).toBe(officialModelPricingCatalog);
    expect(catalogEntriesForProvider("volcengine-seedance").map((entry) => entry.modelId)).toEqual([
      "doubao-seedance-2-0-fast-260128",
      "doubao-seedance-2-0-260128"
    ]);
    expect(modelCatalogEntries.every((entry) =>
      officialModelPricingCatalog.some((pricingEntry) => pricingEntry.catalog?.modelId === entry.modelId)
    )).toBe(true);
    expect(officialModelPricingCatalog.every((entry) => entry.catalog && entry.settlement)).toBe(true);
    expect(modelPricingEntryForModel("gpt-5")).toBe(officialModelPricingCatalog.find((entry) => entry.model === "gpt-5"));
    expect(modelIdsFromInput(["gpt-5"], "openai-compatible-text")).toEqual(["gpt-5"]);

    const seedanceQuality = modelPricingEntryForModel("doubao-seedance-2.0");
    expect(seedanceQuality?.videoTokenPriceCnyPerMillionByResolution).toEqual({
      "480p": 46,
      "720p": 46,
      "1080p": 51,
      "4k": 26
    });
    expect(videoTokenPriceCnyPerMillion("doubao-seedance-2-0-260128", "1080p")).toBe(
      seedanceQuality?.videoTokenPriceCnyPerMillionByResolution?.["1080p"]
    );

    const gptImage2 = modelPricingEntryForModel("gpt-image-2");
    expect(gptImage2?.imagePriceCnyPerImage).toBe(0.3);
    expect(estimateImageUpstreamCostCny("gpt-image-2", 2)).toBe(0.6);
  });

  it("creates settlement price snapshots from the shared catalog", () => {
    expect(modelPricingSnapshotForUsage({
      kind: "video",
      model: "doubao-seedance-2-0-260128",
      resolution: "1080p"
    })).toEqual(expect.objectContaining({
      catalogVersion: officialModelPricingUpdatedAt,
      model: "doubao-seedance-2.0",
      providerId: "volcengine",
      currency: "CNY",
      unit: "video_tokens_1m",
      unitPriceCny: 51,
      sourceUrl: "https://www.volcengine.com/docs/82379/1544106"
    }));
    expect(modelPricingSnapshotForUsage({
      kind: "text",
      model: "gpt-5",
      textUsage: {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000
      }
    })).toEqual(expect.objectContaining({
      model: "gpt-5",
      inputPriceCnyPerMillion: 9.0625,
      outputPriceCnyPerMillion: 72.5
    }));
    expect(estimateTextUpstreamCostCny("gpt-5", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000
    })).toBe(81.56);
    expect(estimateVideoUpstreamCostCny({
      model: "doubao-seedance-2-0-260128",
      resolution: "1080p",
      totalTokens: 243000
    })).toBe(12.39);
  });
});
