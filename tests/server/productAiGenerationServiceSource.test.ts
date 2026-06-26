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

    expect(serviceSource).toContain("export async function buildAiStoryboardDraft(");
    expect(serviceSource).toContain("export async function generateProductReferenceImages(");
    expect(serviceSource).toContain('from "./productAiGenerationContent.js"');
    expect(serviceSource).toContain("buildProductReferenceImagePrompt(");
    expect(serviceSource).toContain("buildChineseStoryboardFallback(");
    expect(serviceSource).toContain("hasJapaneseOutsideAllowedProductNames(");
    expect(serviceSource).not.toContain("function buildProductReferenceImagePrompt(");
    expect(serviceSource).not.toContain("function buildChineseStoryboardFallback(");
    expect(serviceSource).not.toContain("function hasJapaneseOutsideAllowedProductNames(");
    expect(serviceSource).toContain("runMeteredAiAction");
  });
});
