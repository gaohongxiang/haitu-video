import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const servicePath = "src/server/productAiGenerationService.ts";
const contentPath = "src/server/productAiGenerationContent.ts";

describe("product AI generation content source boundaries", () => {
  it("keeps prompt, fallback, and value normalization helpers outside the orchestration service", async () => {
    const serviceSource = await readFile(servicePath, "utf8");

    await expect(access(contentPath)).resolves.toBeUndefined();
    expect(serviceSource).toContain('from "./productAiGenerationContent.js"');
    expect(serviceSource).not.toContain("function buildProductReferenceImagePrompt(");
    expect(serviceSource).not.toContain("function buildChineseStoryboardFallback(");
    expect(serviceSource).not.toContain("function hasJapaneseOutsideAllowedProductNames(");
    expect(serviceSource).not.toContain("function normalizeStringArray(");
    expect(serviceSource).not.toContain("function extensionFromMimeType(");
  });

  it("centralizes product AI prompt text, fallback builders, and simple coercion helpers", async () => {
    const contentSource = await readFile(contentPath, "utf8");

    expect(contentSource).toContain("export function buildProductReferenceImagePrompt(");
    expect(contentSource).toContain("export function buildChineseScriptFallback(");
    expect(contentSource).toContain("export function buildChineseStoryboardFallback(");
    expect(contentSource).toContain("export function hasJapaneseOutsideAllowedProductNames(");
    expect(contentSource).toContain("export function normalizeStringArray(");
    expect(contentSource).toContain("export function clampInteger(");
    expect(contentSource).toContain("export function extensionFromMimeType(");
  });
});
