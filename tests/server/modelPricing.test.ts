import { describe, expect, it } from "vitest";

import {
  modelPricingEntryForModel,
  officialModelPricingUpdatedAt,
  type ModelPricingEntry
} from "../../src/modelPricing/officialModelPricingCatalog.js";
import {
  estimateImageUpstreamCostCny,
  estimateTextUpstreamCostCny,
  estimateVideoUpstreamCostCny,
  estimateVideoTokens,
  modelPricingSnapshotForUsage,
  videoTokenPriceCnyPerMillion
} from "../../src/server/modelPricing.js";

describe("model pricing", () => {
  it("keeps upstream cost estimates on official model pricing instead of billing policy rules", () => {
    expect(videoTokenPriceCnyPerMillion("doubao-seedance-2-0-fast-260128")).toBe(37);
    expect(videoTokenPriceCnyPerMillion("doubao-seedance-2-0-260128")).toBe(46);
    expect(videoTokenPriceCnyPerMillion("doubao-seedance-2-0-260128", "1080p")).toBe(51);
    expect(videoTokenPriceCnyPerMillion("doubao-seedance-2-0-260128", "4k")).toBe(26);
    expect(estimateImageUpstreamCostCny("gpt-image-2", 2)).toBe(0.6);
    expect(estimateTextUpstreamCostCny("deepseek-v4-pro", 1)).toBe(0.01);
  });

  it("can estimate with an injected published catalog entry while keeping the built-in catalog as default", () => {
    const injectedCatalog = [
      withVideoResolutionPrice(modelPricingEntryForModel("doubao-seedance-2.0")!, "1080p", 52)
    ];

    expect(modelPricingSnapshotForUsage({
      kind: "video",
      model: "doubao-seedance-2-0-260128",
      resolution: "1080p",
      catalog: injectedCatalog,
      catalogVersion: "2026-06-29"
    })).toEqual(expect.objectContaining({
      catalogVersion: "2026-06-29",
      unitPriceCny: 52
    }));
    expect(estimateVideoUpstreamCostCny({
      model: "doubao-seedance-2-0-260128",
      resolution: "1080p",
      totalTokens: 1_000_000,
      catalog: injectedCatalog
    })).toBe(52);
    expect(modelPricingSnapshotForUsage({
      kind: "video",
      model: "doubao-seedance-2-0-260128",
      resolution: "1080p"
    })).toEqual(expect.objectContaining({
      catalogVersion: officialModelPricingUpdatedAt,
      unitPriceCny: 51
    }));
  });

  it("uses official text token prices when providers return usage", () => {
    expect(estimateTextUpstreamCostCny("deepseek-v4-pro", {
      inputTokens: 1000,
      outputTokens: 1000,
      totalTokens: 2000
    })).toBe(0.01);
    expect(estimateTextUpstreamCostCny("gpt-5.5", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000
    })).toBe(253.75);
    expect(estimateTextUpstreamCostCny("doubao-seed-2-0-pro-260215", {
      inputTokens: 1000,
      outputTokens: 1000
    })).toBe(0.02);
  });

  it("scales video token estimates by requested resolution", () => {
    expect(estimateVideoTokens({ durationSeconds: 5, resolution: "480p" }).expected).toBe(50400);
    expect(estimateVideoTokens({ durationSeconds: 5, resolution: "720p" }).expected).toBe(108000);
    expect(estimateVideoTokens({ durationSeconds: 5, resolution: "1080p" }).expected).toBe(243000);
    expect(estimateVideoTokens({ durationSeconds: 5, resolution: "4k" }).expected).toBe(972000);
  });

  it("keeps vertical and horizontal video estimates aligned for the same resolution", () => {
    expect(estimateVideoTokens({ durationSeconds: 5, resolution: "720p", aspectRatio: "9:16" }).expected).toBe(108000);
    expect(estimateVideoTokens({ durationSeconds: 5, resolution: "720p", aspectRatio: "16:9" }).expected).toBe(108000);
  });

  it("matches official Seedance 2.0 example prices for 5s 16:9 output without input video", () => {
    expect(estimateVideoUpstreamCostCny({
      model: "doubao-seedance-2-0-fast-260128",
      resolution: "480p",
      totalTokens: estimateVideoTokens({ durationSeconds: 5, resolution: "480p" }).expected
    })).toBe(1.86);
    expect(estimateVideoUpstreamCostCny({
      model: "doubao-seedance-2-0-fast-260128",
      resolution: "720p",
      totalTokens: estimateVideoTokens({ durationSeconds: 5, resolution: "720p" }).expected
    })).toBe(4);
    expect(estimateVideoUpstreamCostCny({
      model: "doubao-seedance-2-0-260128",
      resolution: "1080p",
      totalTokens: estimateVideoTokens({ durationSeconds: 5, resolution: "1080p" }).expected
    })).toBe(12.39);
    expect(estimateVideoUpstreamCostCny({
      model: "doubao-seedance-2-0-260128",
      resolution: "4k",
      totalTokens: estimateVideoTokens({ durationSeconds: 5, resolution: "4k" }).expected
    })).toBe(25.27);
  });
});

function withVideoResolutionPrice(entry: ModelPricingEntry, resolution: "1080p", price: number): ModelPricingEntry {
  return {
    ...entry,
    videoTokenPriceCnyPerMillionByResolution: {
      ...entry.videoTokenPriceCnyPerMillionByResolution,
      [resolution]: price
    },
    settlement: entry.settlement?.kind === "video"
      ? {
          ...entry.settlement,
          videoTokenPriceCnyPerMillionByResolution: {
            ...entry.settlement.videoTokenPriceCnyPerMillionByResolution,
            [resolution]: price
          }
        }
      : entry.settlement
  };
}
