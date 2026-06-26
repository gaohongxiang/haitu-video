import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const ledgerPath = "src/server/jobLedger.ts";
const contentReviewPath = "src/server/jobLedgerContentReview.ts";

describe("job ledger content review source boundaries", () => {
  it("keeps raw manifest content review snapshot assembly out of the ledger orchestrator", async () => {
    const ledgerSource = await readFile(ledgerPath, "utf8");

    await expect(access(contentReviewPath)).resolves.toBeUndefined();
    expect(ledgerSource).toContain('from "./jobLedgerContentReview.js"');
    expect(ledgerSource).not.toContain("function buildContentReviewSnapshot(");
    expect(ledgerSource).not.toContain("normalizeJapaneseHashtags(");
    expect(ledgerSource).not.toContain("function truncateText(");
    expect(ledgerSource).not.toContain("function asText(");
  });

  it("centralizes raw manifest content review URLs, subtitle lines, hashtags, and prompt preview", async () => {
    const contentReviewSource = await readFile(contentReviewPath, "utf8");

    expect(contentReviewSource).toContain("export interface JobContentReviewSnapshot");
    expect(contentReviewSource).toContain("export async function buildContentReviewSnapshot(");
    expect(contentReviewSource).toContain("normalizeJapaneseHashtags(");
    expect(contentReviewSource).toContain("promptPreview");
    expect(contentReviewSource).toContain("raw manifest 缺失");
  });
});
