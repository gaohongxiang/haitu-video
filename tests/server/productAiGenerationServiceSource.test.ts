import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const productRoutesPath = "src/server/productRoutes.ts";
const servicePath = "src/server/productAiGenerationService.ts";

describe("product AI generation service source boundaries", () => {
  it("keeps product AI storyboard and reference image generation out of the HTTP server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const productRoutesSource = await readFile(productRoutesPath, "utf8");

    await expect(access(servicePath)).resolves.toBeUndefined();
    expect(productRoutesSource).toContain('from "./productAiGenerationService.js"');
    expect(consoleServerSource).not.toContain('from "./productAiGenerationService.js"');
    expect(consoleServerSource).not.toContain("async function buildAiStoryboardDraft(");
    expect(consoleServerSource).not.toContain("async function generateProductReferenceImages(");
    expect(consoleServerSource).not.toContain("function buildProductReferenceImagePrompt(");
    expect(consoleServerSource).not.toContain("function buildChineseStoryboardFallback(");
    expect(consoleServerSource).not.toContain("function hasJapaneseOutsideAllowedProductNames(");
  });

  it("centralizes product AI storyboard drafts and reference image generation", async () => {
    const serviceSource = await readFile(servicePath, "utf8");
    const productRoutesSource = await readFile(productRoutesPath, "utf8");

    expect(serviceSource).toContain("export async function buildAiStoryboardDraft(");
    expect(serviceSource).toContain("export async function generateProductReferenceImages(");
    expect(serviceSource).toContain("referenceImages?: string[];");
    expect(serviceSource).toContain("const selectedReferenceImages = sanitizeReferenceImages(input.input.referenceImages);");
    expect(serviceSource).toContain("referenceImages: selectedReferenceImages");
    expect(serviceSource).toContain('from "./productAiGenerationContent.js"');
    expect(serviceSource).toContain("compileProductPrompt({");
    expect(serviceSource).toContain("compileProductPrompt({");
    expect(serviceSource).not.toContain("function buildProductReferenceImagePrompt(");
    expect(serviceSource).not.toContain("function compileProductPrompt(");
    expect(serviceSource).toContain("runMeteredAiAction");
    expect(serviceSource).toContain("modelPricingCatalog?: readonly ModelPricingEntry[]");
    expect(serviceSource).toContain("modelPricingCatalogVersion?: string");
    expect(serviceSource).toContain("modelPricingCatalog: input.modelPricingCatalog");
    expect(serviceSource).toContain("modelPricingCatalogVersion: input.modelPricingCatalogVersion");
    expect(productRoutesSource).toContain("modelPricingCatalog: requestContext.modelPricingCatalog");
    expect(productRoutesSource).toContain("modelPricingCatalogVersion: requestContext.modelPricingCatalogVersion");
  });

  it("uses the product prompt compiler as the deterministic model prompt preview layer", async () => {
    const serviceSource = await readFile(servicePath, "utf8");
    const productRoutesSource = await readFile(productRoutesPath, "utf8");

    expect(serviceSource).toContain('from "../core/productPromptCompiler.js"');
    expect(serviceSource).toContain("compileProductPrompt({");
    expect(serviceSource).toContain('mode: "image"');
    expect(serviceSource).toContain('mode: "video"');
    expect(serviceSource).toContain('providerId: "openai-compatible-image"');
    expect(serviceSource).toContain('providerId: "volcengine-seedance"');
    expect(serviceSource).toContain("userPrompt: input.input.prompt");
    expect(serviceSource).not.toContain("userPrompt: input.input.prompt || template");
    expect(serviceSource).toContain("creativeStyle?: ProductPromptCreativeStyle");
    expect(serviceSource).toContain("creativeStyle: input.input.creativeStyle");
    expect(serviceSource).toContain("imageModelConfigId: input.input.imageModelConfigId");
    expect(serviceSource).toContain("providerModelConfigId: input.input.videoModelConfigId");
    expect(serviceSource).toContain("requestedConfigId: imageModelConfigId");
    expect(productRoutesSource).toContain("input: (await request.json()) as StoryboardDraftRequest");
    expect(productRoutesSource).toContain("input: (await request.json()) as ImagePromptDraftRequest");
  });
});
