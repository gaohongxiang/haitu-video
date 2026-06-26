import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const adminAppPath = "src/client/AdminApp.tsx";
const sharedModelConfigPath = "src/client/components/modelServiceConfig.tsx";

describe("admin app source", () => {
  it("keeps the admin shell mounted while checking auth and loading data", async () => {
    const source = await readFile(adminAppPath, "utf8");

    expect(source).toContain("useState<AuthSession | undefined>();");
    expect(source).toContain("<AdminDashboard");
    expect(source).toContain("checkingSession={!session}");
    expect(source).toContain('const adminShellStatus = checkingSession ? "检查登录状态" : isBusy ? "刷新数据中" : "";');
    expect(source).not.toContain("function AdminShellLoadingScreen");
    expect(source).not.toContain("正在检查登录状态");
    expect(source).not.toContain("正在载入后台数据");
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

  it("lets project admins configure platform model keys without exposing them to users", async () => {
    const source = await readFile(adminAppPath, "utf8");

    expect(source).toContain("PlatformModelAdminPanel");
    expect(source).toContain("/api/platform/model-configs/openai-compatible-text");
    expect(source).toContain("/api/platform/model-configs/openai-compatible-image");
    expect(source).toContain("/api/platform/model-configs/volcengine-seedance");
    expect(source).toContain('getJson<PlatformModelAdminConfigResponse>("/api/platform/model-configs")');
    expect(source).toContain("platformConfigLedgerFromResponse");
    expect(source).toContain("keyPreview");
    expect(source).toContain("revealPlatformModelConfigApiKey");
    expect(source).toContain('method: "DELETE"');
    expect(source).toContain("平台 API Key 加密写入数据库");
  });

  it("shows platform models as multi-service lists with editable base urls", async () => {
    const source = await readFile(adminAppPath, "utf8");
    const sharedSource = await readFile(sharedModelConfigPath, "utf8");
    const panelSource = source.slice(source.indexOf("function PlatformModelAdminPanel"), source.indexOf("function AdminMetricGrid"));

    expect(source).toContain('from "./components/modelServiceConfig.js"');
    expect(source).toContain("SharedModelServiceGroup");
    expect(source).toContain("SharedModelConfigDialog");
    expect(source).not.toContain("function PlatformModelServiceForm");
    expect(source).not.toContain("PlatformModelDraftsByProvider");
    expect(source).not.toContain("createPlatformModelDraft");
    expect(source).not.toContain("addPlatformModelDraft");
    expect(source).not.toContain("savedPlatformModelDrafts");
    expect(panelSource).toContain('apiOwner="platform"');
    expect(panelSource).toContain('apiKeyLabel="平台 API Key"');
    expect(panelSource).toContain('keyBadgeLabel="平台托管"');
    expect(panelSource).toContain('addButtonLabel={(badge) => `添加${badge}服务`}');
    expect(panelSource).toContain("platformModelsForProvider(config, provider.providerId)");
    expect(panelSource).toContain("onToggleEnabled={onToggleEnabled}");
    expect(source).toContain("togglePlatformModelConfigEnabled");
    expect(panelSource).toContain("添加${badge}服务");
    expect(sharedSource).toContain("baseUrl");
    expect(sharedSource).toContain("实际端点前缀");
    expect(sharedSource).not.toContain("优先级");
    expect(sharedSource).not.toContain("priority:");
    expect(sharedSource).not.toContain("draft.priority");
    expect(sharedSource).toContain("showApiKey");
    expect(sharedSource).toContain("toggleCatalogModel");
  });

  it("splits admin work into a left navigation shell instead of one crowded page", async () => {
    const source = await readFile(adminAppPath, "utf8");
    const dashboardSource = source.slice(source.indexOf("function AdminDashboard"), source.indexOf("function platformModelAdminEndpoint"));

    expect(source).toContain('type AdminSection = "overview" | "users" | "platform-models" | "billing" | "system";');
    expect(source).toContain("const adminNavigationItems");
    expect(source).toContain("AdminSidebar");
    expect(source).toContain("renderAdminSection");
    expect(dashboardSource).toContain("grid h-dvh grid-cols-[260px_minmax(0,1fr)]");
    expect(dashboardSource).toContain("activeSection");
    expect(dashboardSource).not.toContain("<AdminMetricGrid overview={overview} />\n            <div className=\"grid gap-4 xl:grid-cols-2\">");
  });

  it("connects recharge billing to payment method switches and audited wallet adjustments", async () => {
    const source = await readFile(adminAppPath, "utf8");
    const billingStart = source.indexOf('activeSection === "billing"');
    const billingSection = source.slice(
      billingStart,
      source.indexOf('return (\n      <AdminPlaceholderSection', billingStart)
    );

    expect(source).toContain("AdminBillingPanel");
    expect(source).toContain('getJson<AdminPaymentMethodsResponse>("/api/admin/payment-methods")');
    expect(source).toContain('getJson<AdminWalletsResponse>("/api/admin/wallets")');
    expect(source).toContain('putJson<AdminPaymentMethodsResponse>("/api/admin/payment-methods"');
    expect(source).toContain('postJson<AdminWalletAdjustmentResponse>("/api/admin/wallet-adjustments"');
    expect(source).toContain("togglePaymentMethodEnabled");
    expect(source).toContain("submitWalletAdjustment");
    expect(source).toContain("支付方式");
    expect(source).toContain("余额调整");
    expect(billingSection).toContain("<AdminBillingPanel");
    expect(billingSection).not.toContain("<AdminPlaceholderSection");
  });
});
