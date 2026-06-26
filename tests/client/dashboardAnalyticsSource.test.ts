import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const appPath = "src/client/App.tsx";
const dashboardAnalyticsPath = "src/client/dashboardAnalytics.ts";

describe("dashboard analytics source boundaries", () => {
  it("keeps dashboard aggregation logic outside the App component file", async () => {
    const appSource = await readFile(appPath, "utf8");
    const dashboardAnalyticsSource = await readFile(dashboardAnalyticsPath, "utf8");

    expect(appSource).toContain('from "./dashboardAnalytics.js"');
    expect(appSource).not.toContain("function buildDashboardAnalytics(");
    expect(appSource).not.toContain("function buildProviderRows(");
    expect(appSource).not.toContain("function buildTrendPoints(");
    expect(appSource).not.toContain("function filterRowsByRange(");

    expect(dashboardAnalyticsSource).toContain("export function buildDashboardAnalytics");
    expect(dashboardAnalyticsSource).toContain("export function buildProviderRows");
    expect(dashboardAnalyticsSource).toContain("export function buildTrendPoints");
    expect(dashboardAnalyticsSource).toContain("export function filterRowsByRange");
  });
});
