import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const adminAppPath = "src/client/AdminApp.tsx";

describe("admin app source", () => {
  it("keeps the admin shell in an auth-checking state instead of flashing the login page", async () => {
    const source = await readFile(adminAppPath, "utf8");

    expect(source).toContain("useState<AuthSession | undefined>();");
    expect(source).toContain("<AdminShellLoadingScreen status={status} />");
    expect(source).not.toContain('useState<AuthSession>({ authEnabled: true, authenticated: false })');
  });

  it("renders admin user video jobs with compact metadata instead of oversized right-side badges", async () => {
    const source = await readFile(adminAppPath, "utf8");
    const drawerSource = source.slice(source.indexOf("function AdminUserDetailDrawer"), source.indexOf("function DetailMetric"));
    const videoJobsSectionSource = drawerSource.slice(drawerSource.indexOf("最近视频任务"), drawerSource.indexOf("最近商品"));

    expect(drawerSource).toContain("AdminVideoJobCard");
    expect(source).toContain("function AdminVideoJobCard");
    expect(source).toContain("function AdminJobMetaRail");
    expect(source).toContain("admin-provider-chip");
    expect(source).toContain("break-words");
    expect(videoJobsSectionSource).not.toContain("min-[720px]:grid-cols-[minmax(0,1fr)_auto]");
  });

  it("keeps the activity chart legend away from x-axis labels", async () => {
    const source = await readFile(adminAppPath, "utf8");
    const activityOptionSource = source.slice(source.indexOf("function buildActivityOption"), source.indexOf("async function getJson"));

    expect(activityOptionSource).toContain("grid: { left: 36, right: 18, top: 22, bottom: 62 }");
    expect(activityOptionSource).toContain("legend: {");
    expect(activityOptionSource).toContain("bottom: 4");
  });
});
