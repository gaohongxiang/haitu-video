import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const appPath = "src/client/App.tsx";
const chartOptionsPath = "src/client/dashboardChartOptions.ts";

describe("dashboard chart option source boundaries", () => {
  it("keeps chart option builders outside the App component file", async () => {
    const appSource = await readFile(appPath, "utf8");
    const chartOptionsSource = await readFile(chartOptionsPath, "utf8");

    expect(appSource).toContain('from "./dashboardChartOptions.js"');
    expect(appSource).not.toContain("function buildProviderChartOption(");
    expect(appSource).not.toContain("function buildTrendChartOption(");
    expect(appSource).not.toContain("function buildRecentChartOption(");
    expect(chartOptionsSource).toContain("export function buildProviderChartOption");
    expect(chartOptionsSource).toContain("export function buildTrendChartOption");
    expect(chartOptionsSource).toContain("export function buildRecentChartOption");
  });
});
