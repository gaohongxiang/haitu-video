import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const servicePath = "src/server/reviewPublishingService.ts";
const csvPath = "src/server/reviewPublishingCsv.ts";

describe("review publishing CSV source boundaries", () => {
  it("keeps CSV presentation helpers outside the publishing workflow service", async () => {
    const serviceSource = await readFile(servicePath, "utf8");

    await expect(access(csvPath)).resolves.toBeUndefined();
    expect(serviceSource).toContain('from "./reviewPublishingCsv.js"');
    expect(serviceSource).not.toContain("function internalValidationGapText(");
    expect(serviceSource).not.toContain("function providerDisplayName(");
    expect(serviceSource).not.toContain("function statusDisplayName(");
    expect(serviceSource).not.toContain("function manualReviewDisplayName(");
    expect(serviceSource).not.toContain("function csvCell(");
  });

  it("centralizes review publishing CSV builders and display text", async () => {
    const csvSource = await readFile(csvPath, "utf8");

    expect(csvSource).toContain("export function buildInternalValidationCsvRows(");
    expect(csvSource).toContain("export function buildPublishPackagesCsvRows(");
    expect(csvSource).toContain("export function rowsToCsv(");
    expect(csvSource).toContain("function internalValidationGapText(");
    expect(csvSource).toContain("function providerDisplayName(");
    expect(csvSource).toContain("function statusDisplayName(");
    expect(csvSource).toContain("function manualReviewDisplayName(");
    expect(csvSource).toContain("function csvCell(");
  });
});
