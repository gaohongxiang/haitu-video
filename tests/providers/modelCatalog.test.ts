import { describe, expect, it } from "vitest";

import {
  catalogEntriesForProvider,
  catalogEntriesForVendor,
  catalogEntryForModel,
  catalogVendorsForProvider,
  defaultCatalogEntryForProvider,
  defaultCatalogEntryForVendor,
  modelIdsFromInput,
  modelLabelForId,
  modelCatalogEntries,
  visibleModelLabel,
  type ModelKind
} from "../../src/providers/modelCatalog.js";

describe("modelCatalog", () => {
  it("uses one catalog shape for text, image, and video models", () => {
    const kinds = new Set<ModelKind>(modelCatalogEntries.map((entry) => entry.modelKind));

    expect(kinds).toEqual(new Set(["text", "image", "video"]));
    expect(modelCatalogEntries.every((entry) => entry.catalogId && entry.modelId && entry.providerId)).toBe(true);
  });

  it("keeps user-facing labels short while retaining real provider model IDs", () => {
    expect(visibleModelLabel(defaultCatalogEntryForProvider("volcengine-seedance"))).toBe("seedance-2.0-fast");
    expect(catalogEntriesForProvider("volcengine-seedance").map((entry) => entry.label)).toEqual([
      "seedance-2.0-fast",
      "seedance-2.0"
    ]);
    expect(catalogEntriesForProvider("volcengine-seedance").map((entry) => entry.modelId)).toEqual([
      "doubao-seedance-2-0-fast-260128",
      "doubao-seedance-2-0-260128"
    ]);
  });

  it("stores provider defaults in the catalog instead of UI form literals", () => {
    expect(defaultCatalogEntryForProvider("openai-compatible-text")).toEqual(expect.objectContaining({
      providerId: "openai-compatible-text",
      modelKind: "text",
      modelId: "gpt-5.5",
      apiMode: "responses_stream",
      baseUrl: "https://api.openai.com"
    }));
    expect(defaultCatalogEntryForProvider("openai-compatible-image")).toEqual(expect.objectContaining({
      providerId: "openai-compatible-image",
      modelKind: "image",
      modelId: "gpt-image-2",
      baseUrl: "https://api.openai.com"
    }));
  });

  it("groups models by vendor before exposing selectable model versions", () => {
    expect(catalogVendorsForProvider("openai-compatible-text").map((vendor) => vendor.value)).toEqual([
      "openai",
      "deepseek",
      "doubao"
    ]);
    expect(catalogEntriesForVendor("openai-compatible-text", "deepseek").map((entry) => entry.label)).toEqual([
      "deepseek-v4-pro",
      "deepseek-v4-flash"
    ]);
    expect(defaultCatalogEntryForVendor("openai-compatible-text", "deepseek")).toEqual(expect.objectContaining({
      vendor: "deepseek",
      label: "deepseek-v4-pro",
      apiMode: "chat_completions"
    }));
    expect(catalogVendorsForProvider("openai-compatible-image").map((vendor) => vendor.value)).toEqual([
      "openai",
      "gemini",
      "doubao"
    ]);
    expect(catalogEntriesForVendor("openai-compatible-image", "gemini").map((entry) => entry.modelId)).toEqual([
      "gemini-3-pro-image-preview",
      "gemini-2.5-flash-image"
    ]);
    expect(catalogVendorsForProvider("volcengine-seedance").map((vendor) => vendor.value)).toEqual([
      "volcengine"
    ]);
  });

  it("resolves user-facing labels to real model IDs across model kinds", () => {
    expect(catalogEntryForModel("volcengine-seedance", "seedance-2.0-fast")).toEqual(expect.objectContaining({
      label: "seedance-2.0-fast",
      modelId: "doubao-seedance-2-0-fast-260128"
    }));
    expect(modelLabelForId("openai-compatible-text", "doubao-seed-2-0-pro-260215")).toBe("doubao-seed-2.0-pro");
    expect(modelIdsFromInput(["doubao-seed-2.0-pro"], "openai-compatible-text")).toEqual([
      "doubao-seed-2-0-pro-260215"
    ]);
    expect(modelIdsFromInput(["gpt-image-2"], "openai-compatible-image")).toEqual(["gpt-image-2"]);
    expect(modelIdsFromInput(["doubao-seedream-5.0-lite"], "openai-compatible-image")).toEqual([
      "doubao-seedream-5-0-lite"
    ]);
    expect(modelIdsFromInput(["seedance-2.0-fast", "seedance-2.0"], "volcengine-seedance")).toEqual([
      "doubao-seedance-2-0-fast-260128",
      "doubao-seedance-2-0-260128"
    ]);
  });

  it("falls back to the real model ID when a compatible gateway model is not in the built-in catalog", () => {
    expect(modelLabelForId("openai-compatible-text", "deepseek-v4-lite")).toBe("deepseek-v4-lite");
  });
});
