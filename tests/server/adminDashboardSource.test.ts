import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const dashboardPath = "src/server/adminDashboard.ts";
const overviewPath = "src/server/adminDashboardOverview.ts";
const detailPath = "src/server/adminDashboardUserDetail.ts";
const videoJobsPath = "src/server/adminDashboardVideoJobs.ts";
const typesPath = "src/server/adminDashboardTypes.ts";

describe("admin dashboard source boundaries", () => {
  it("keeps admin dashboard as a narrow facade over overview and user detail modules", async () => {
    const dashboardSource = await readFile(dashboardPath, "utf8");

    await expect(access(overviewPath)).resolves.toBeUndefined();
    await expect(access(detailPath)).resolves.toBeUndefined();
    await expect(access(videoJobsPath)).resolves.toBeUndefined();
    await expect(access(typesPath)).resolves.toBeUndefined();
    expect(dashboardSource).toContain('from "./adminDashboardOverview.js"');
    expect(dashboardSource).toContain('from "./adminDashboardUserDetail.js"');
    expect(dashboardSource).toContain('from "./adminDashboardTypes.js"');
    expect(dashboardSource).not.toContain("SELECT COUNT(*) AS count FROM auth_users");
    expect(dashboardSource).not.toContain("function buildGrowth(");
    expect(dashboardSource).not.toContain("function buildUserVideoJobs(");
    expect(dashboardSource).not.toContain("readableVideoProviderError(");
  });

  it("centralizes admin overview metrics, growth, activity, and user summary queries", async () => {
    const overviewSource = await readFile(overviewPath, "utf8");

    expect(overviewSource).toContain("export function buildAdminOverview(");
    expect(overviewSource).toContain("function buildGrowth(");
    expect(overviewSource).toContain("function buildActivity(");
    expect(overviewSource).toContain("function buildUsers(");
    expect(overviewSource).toContain("SELECT COUNT(*) AS count FROM auth_users");
  });

  it("centralizes admin user detail workspace, product, video job, and readable error queries", async () => {
    const detailSource = await readFile(detailPath, "utf8");

    expect(detailSource).toContain("export function buildAdminUserDetail(");
    expect(detailSource).toContain('from "./adminDashboardVideoJobs.js"');
    expect(detailSource).toContain("function buildUserWorkspaces(");
    expect(detailSource).toContain("function buildUserProducts(");
    expect(detailSource).not.toContain("function buildUserVideoJobs(");
    expect(detailSource).not.toContain("readFileSync(");
    expect(detailSource).not.toContain("readableVideoProviderError(");
  });

  it("centralizes admin user detail video job queries, metadata, and readable error mapping", async () => {
    const videoJobsSource = await readFile(videoJobsPath, "utf8");

    expect(videoJobsSource).toContain("export function buildUserVideoJobs(");
    expect(videoJobsSource).toContain("function readVideoJobMetadata(");
    expect(videoJobsSource).toContain("function parseAdminVideoJobErrorDetails(");
    expect(videoJobsSource).toContain("function providerFromModel(");
    expect(videoJobsSource).toContain("readableVideoProviderError(");
  });
});
