import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const ledgerPath = "src/server/jobLedger.ts";
const summaryPath = "src/server/jobLedgerSummary.ts";

describe("job ledger summary source boundaries", () => {
  it("keeps ledger totals, review summaries, validation summaries, and product grouping out of the ledger orchestrator", async () => {
    const ledgerSource = await readFile(ledgerPath, "utf8");

    await expect(access(summaryPath)).resolves.toBeUndefined();
    expect(ledgerSource).toContain('from "./jobLedgerSummary.js"');
    expect(ledgerSource).not.toContain("function summarizeJobs(");
    expect(ledgerSource).not.toContain("function summarizeReviewProgress(");
    expect(ledgerSource).not.toContain("function summarizeInternalValidation(");
    expect(ledgerSource).not.toContain("function groupProducts(");
    expect(ledgerSource).not.toContain("function toProductGroup(");
  });

  it("centralizes ledger totals, review summaries, validation summaries, and product grouping", async () => {
    const summarySource = await readFile(summaryPath, "utf8");

    expect(summarySource).toContain("export interface JobLedgerSummary");
    expect(summarySource).toContain("export interface ReviewProgressSummary");
    expect(summarySource).toContain("export interface InternalValidationSummary");
    expect(summarySource).toContain("export interface ProductVersionGroup");
    expect(summarySource).toContain("export function summarizeJobs(");
    expect(summarySource).toContain("export function summarizeReviewProgress(");
    expect(summarySource).toContain("export function summarizeInternalValidation(");
    expect(summarySource).toContain("export function groupProducts(");
  });
});
