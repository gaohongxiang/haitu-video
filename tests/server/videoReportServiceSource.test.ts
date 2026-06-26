import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const routesPath = "src/server/assetReportRoutes.ts";
const videoReportServicePath = "src/server/videoReportService.ts";
const videoQcSummaryServicePath = "src/server/videoQcSummaryService.ts";

describe("video report service source boundaries", () => {
  it("keeps report listing and QC summary workflows behind the route layer", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const routesSource = await readFile(routesPath, "utf8");

    await expect(access(videoReportServicePath)).resolves.toBeUndefined();
    await expect(access(videoQcSummaryServicePath)).resolves.toBeUndefined();
    expect(consoleServerSource).not.toContain('from "./videoReportService.js"');
    expect(routesSource).toContain('from "./videoReportService.js"');
    expect(consoleServerSource).not.toContain("async function buildQcSummary(");
    expect(consoleServerSource).not.toContain("async function listReports(");
    expect(consoleServerSource).not.toContain("async function toQcSummaryItem(");
    expect(consoleServerSource).not.toContain("function normalizeQcChecks(");
    expect(consoleServerSource).not.toContain("function matchesReportFilters(");
  });

  it("centralizes report list filtering and QC summary normalization", async () => {
    const serviceSource = await readFile(videoReportServicePath, "utf8");

    expect(serviceSource).toContain("export async function listReports(");
    expect(serviceSource).toContain('from "./videoQcSummaryService.js"');
    expect(serviceSource).toContain("make-video-report.json");
    expect(serviceSource).not.toContain("normalizeQcChecks");
    expect(serviceSource).not.toContain("function toQcSummaryItem(");
    expect(serviceSource).toContain("matchesReportFilters");
  });

  it("centralizes QC summary normalization away from report list filtering", async () => {
    const qcSource = await readFile(videoQcSummaryServicePath, "utf8");

    expect(qcSource).toContain("export async function buildQcSummary(");
    expect(qcSource).toContain("function toQcSummaryItem(");
    expect(qcSource).toContain("function normalizeQcChecks(");
    expect(qcSource).toContain("function summarizeQcItems(");
    expect(qcSource).toContain("make-video-report.json");
  });
});
