import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const appPath = "src/client/App.tsx";
const creativeVersionsPath = "src/client/videoCreativeVersions.ts";

describe("video creative versions source boundaries", () => {
  it("keeps video job merge and creative-version mapping logic outside the App component file", async () => {
    const appSource = await readFile(appPath, "utf8");
    const creativeVersionsSource = await readFile(creativeVersionsPath, "utf8");

    expect(appSource).toContain('from "./videoCreativeVersions.js"');
    expect(appSource).not.toContain("function removeLedgerJob(");
    expect(appSource).not.toContain("function mergeLedgerJobs(");
    expect(appSource).not.toContain("function mergeVideoJobs(");
    expect(appSource).not.toContain("function buildLatestCreativeJobs(");
    expect(appSource).not.toContain("function videoJobToCreativeVersion(");
    expect(appSource).not.toContain("function ledgerJobToCreativeVersion(");

    expect(creativeVersionsSource).toContain("export function removeLedgerJob");
    expect(creativeVersionsSource).toContain("export function mergeLedgerJobs");
    expect(creativeVersionsSource).toContain("export function mergeVideoJobs");
    expect(creativeVersionsSource).toContain("export function buildLatestCreativeJobs");
    expect(creativeVersionsSource).toContain("export function videoJobToCreativeVersion");
    expect(creativeVersionsSource).toContain("export function ledgerJobToCreativeVersion");
  });
});
