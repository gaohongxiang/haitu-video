import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const routesPath = "src/server/reviewPublishingRoutes.ts";
const servicePath = "src/server/reviewPublishingService.ts";

describe("review publishing service source boundaries", () => {
  it("keeps review validation, internal validation CSVs, and publish package presentation behind the route layer", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const routesSource = await readFile(routesPath, "utf8");

    await expect(access(servicePath)).resolves.toBeUndefined();
    expect(consoleServerSource).not.toContain('from "./reviewPublishingService.js"');
    expect(routesSource).toContain('from "./reviewPublishingService.js"');
    expect(consoleServerSource).not.toContain("async function createPublishPackagesBatch(");
    expect(consoleServerSource).not.toContain("async function assertSelectableFinalJob(");
    expect(consoleServerSource).not.toContain("function assertManualReviewInput(");
    expect(consoleServerSource).not.toContain("async function assertReviewableJob(");
    expect(consoleServerSource).not.toContain("async function buildInternalValidationCsv(");
    expect(consoleServerSource).not.toContain("async function buildPublishPackagesCsv(");
    expect(consoleServerSource).not.toContain("async function topUpInternalValidationJobs(");
    expect(consoleServerSource).not.toContain("async function withPublishPackageFileUrls(");
    expect(consoleServerSource).not.toContain("async function withPublishPackageFileUrl(");
    expect(consoleServerSource).not.toContain("function internalValidationGapText(");
    expect(consoleServerSource).not.toContain("function csvCell(");
  });

  it("centralizes review-to-publish workflow helpers", async () => {
    const serviceSource = await readFile(servicePath, "utf8");

    expect(serviceSource).toContain("export async function createPublishPackagesBatch(");
    expect(serviceSource).toContain("export async function assertSelectableFinalJob(");
    expect(serviceSource).toContain("export function assertManualReviewInput(");
    expect(serviceSource).toContain("export async function assertReviewableJob(");
    expect(serviceSource).toContain("export async function buildInternalValidationCsv(");
    expect(serviceSource).toContain("export async function buildPublishPackagesCsv(");
    expect(serviceSource).toContain("export async function topUpInternalValidationJobs(");
    expect(serviceSource).toContain("export async function withPublishPackageFileUrls(");
    expect(serviceSource).toContain("export async function withPublishPackageFileUrl(");
  });
});
