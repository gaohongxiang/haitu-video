import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const servicePath = "src/server/productImportService.ts";
const normalizationPath = "src/server/productImportAiNormalization.ts";

describe("product import AI normalization source boundaries", () => {
  it("keeps AI product normalization outside the import orchestration service", async () => {
    const serviceSource = await readFile(servicePath, "utf8");

    await expect(access(normalizationPath)).resolves.toBeUndefined();
    expect(serviceSource).toContain('from "./productImportAiNormalization.js"');
    expect(serviceSource).not.toContain("function normalizeAiProductFacts(");
    expect(serviceSource).not.toContain("function normalizeAiClaims(");
    expect(serviceSource).not.toContain("function referenceImagesFromAiValue(");
  });

  it("centralizes AI value coercion and claim risk filtering in the normalization module", async () => {
    const normalizationSource = await readFile(normalizationPath, "utf8");

    expect(normalizationSource).toContain("export function normalizeAiProductFacts(");
    expect(normalizationSource).toContain("function normalizeAiClaims(");
    expect(normalizationSource).toContain("function isRiskyProductClaim(");
    expect(normalizationSource).toContain("function claimMarkedUnverified(");
    expect(normalizationSource).toContain("function referenceImagesFromAiValue(");
    expect(normalizationSource).toContain("function textFromAiValue(");
  });
});
