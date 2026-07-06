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
    expect(source).toContain('const adminShellStatus = checkingSession ? tAdmin("shell.checkingSession") : isBusy ? tAdmin("shell.refreshing") : "";');
    expect(source).not.toContain("function AdminShellLoadingScreen");
    expect(source).not.toContain("正在检查登录状态");
    expect(source).not.toContain("正在载入后台数据");
    expect(source).not.toContain('useState<AuthSession>({ authEnabled: true, authenticated: false })');
  });

  it("renders admin user video jobs with compact metadata instead of oversized right-side badges", async () => {
    const source = await readFile(adminAppPath, "utf8");
    const expandedRowSource = source.slice(source.indexOf("function AdminUserExpandedRow"), source.indexOf("function AdminUserRecentLedgerList"));

    expect(expandedRowSource).toContain("AdminVideoJobCard");
    expect(source).toContain("function AdminVideoJobCard");
    expect(source).toContain("function AdminJobMetaRail");
    expect(source).toContain("admin-provider-chip");
    expect(source).toContain("break-words");
    expect(expandedRowSource).not.toContain("AdminUserVideoJobsPane");
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

    expect(source).toContain("AdminModelServicesPanel");
    expect(source).toContain("/api/admin/platform-model-configs/openai-compatible-text");
    expect(source).toContain("/api/admin/platform-model-configs/openai-compatible-image");
    expect(source).toContain("/api/admin/platform-model-configs/volcengine-seedance");
    expect(source).toContain('getJson<ModelServiceAdminConfigResponse>("/api/admin/platform-model-configs")');
    expect(source).toContain("platformConfigLedgerFromResponse");
    expect(source).toContain("keyPreview");
    expect(source).toContain("revealPlatformModelConfigApiKey");
    expect(source).toContain('method: "DELETE"');
    expect(source).toContain('tAdmin("modelServices.hint")');
    expect(source).not.toContain('tAdmin("platformModels.');
  });

  it("shows platform models as multi-service lists with editable base urls", async () => {
    const source = await readFile(adminAppPath, "utf8");
    const sharedSource = await readFile(sharedModelConfigPath, "utf8");
    const panelSource = source.slice(source.indexOf("function AdminModelServicesPanel"), source.indexOf("function AdminMetricGrid"));

    expect(source).toContain('from "./components/modelServiceConfig.js"');
    expect(source).toContain("SharedModelServiceGroup");
    expect(source).toContain("SharedModelConfigDialog");
    expect(source).not.toContain("function PlatformModelServiceForm");
    expect(source).not.toContain("PlatformModelDraftsByProvider");
    expect(source).not.toContain("createPlatformModelDraft");
    expect(source).not.toContain("addPlatformModelDraft");
    expect(source).not.toContain("savedPlatformModelDrafts");
    expect(panelSource).toContain('apiOwner="platform"');
    expect(panelSource).toContain('apiKeyLabel={tAdmin("modelServices.apiKeyLabel")}');
    expect(panelSource).toContain('keyBadgeLabel={tAdmin("modelServices.keyBadge")}');
    expect(panelSource).toContain('addButtonLabel={(badge) => tAdmin("modelServices.addService", { badge })}');
    expect(panelSource).toContain("modelServicesForProvider(config, provider.providerId)");
    expect(panelSource).toContain("onToggleEnabled={onToggleEnabled}");
    expect(source).toContain("togglePlatformModelConfigEnabled");
    expect(panelSource).toContain('tAdmin("modelServices.addService", { badge })');
    expect(panelSource).not.toContain('tAdmin("platformModels.');
    expect(sharedSource).toContain("baseUrl");
    expect(sharedSource).toContain('tSettings("serviceDialog.endpointPrefix")');
    expect(sharedSource).not.toContain("优先级");
    expect(sharedSource).not.toContain("priority:");
    expect(sharedSource).not.toContain("draft.priority");
    expect(sharedSource).toContain("showApiKey");
    expect(sharedSource).toContain("toggleCatalogModel");
  });

  it("splits admin work into a left navigation shell instead of one crowded page", async () => {
    const source = await readFile(adminAppPath, "utf8");
    const dashboardSource = source.slice(source.indexOf("function AdminDashboard"), source.indexOf("function modelServicesEndpoint"));

    expect(source).toContain('type AdminSection = "overview" | "users" | "content" | "finance" | "payment-billing" | "model-services" | "model-pricing" | "site-settings" | "system";');
    expect(source).toContain("const adminNavigationItems");
    expect(source).toContain('group: "operate"');
    expect(source).toContain('group: "commercial"');
    expect(source).toContain('group: "configuration"');
    expect(source).toContain('group: "system"');
    expect(source).toContain("AdminSidebar");
    expect(source).toContain("AdminTopBar");
    expect(source).toContain("globalSearch");
    expect(source).toContain("timeRange");
    expect(source).toContain("renderAdminSection");
    expect(dashboardSource).toContain("grid h-dvh grid-cols-[280px_minmax(0,1fr)]");
    expect(dashboardSource).toContain("activeSection");
    expect(dashboardSource).not.toContain("<AdminMetricGrid overview={overview} />\n            <div className=\"grid gap-4 xl:grid-cols-2\">");
  });

  it("connects recharge billing to payment method switches and audited wallet adjustments", async () => {
    const source = await readFile(adminAppPath, "utf8");
    const financeStart = source.indexOf('activeSection === "finance"');
    const financeSection = source.slice(
      financeStart,
      source.indexOf('if (activeSection === "payment-billing")', financeStart)
    );
    const paymentBillingStart = source.indexOf('activeSection === "payment-billing"');
    const paymentBillingSection = source.slice(
      paymentBillingStart,
      source.indexOf('if (activeSection === "model-services")', paymentBillingStart)
    );
    const transactionsTable = source.slice(source.indexOf("function AdminFinanceWalletTransactionsTable"), source.indexOf("const billingUsageKinds"));

    expect(source).toContain("AdminFinancePanel");
    expect(source).toContain("AdminPaymentBillingPanel");
    expect(source).toContain('getJson<AdminPaymentMethodsResponse>("/api/admin/payment-methods")');
    expect(source).toContain('getJson<AdminWalletsResponse>("/api/admin/wallets")');
    expect(source).toContain('getJson<AdminWalletTransactionsResponse>("/api/admin/wallet-transactions")');
    expect(source).toContain('getJson<AdminRechargeOrdersResponse>("/api/admin/recharge-orders")');
    expect(source).toContain('getJson<AdminBillingSettingsResponse>("/api/admin/billing-settings")');
    expect(source).toContain('putJson<AdminPaymentMethodsResponse>("/api/admin/payment-methods"');
    expect(source).toContain('putJson<AdminBillingSettingsResponse>("/api/admin/billing-settings"');
    expect(source).toContain('postJson<AdminWalletAdjustmentResponse>("/api/admin/wallet-adjustments"');
    expect(source).toContain("togglePaymentMethodEnabled");
    expect(source).toContain("submitWalletAdjustment");
    expect(source).toContain("saveBillingSettings");
    expect(source).toContain('tAdmin("paymentBilling.paymentMethods")');
    expect(source).toContain('tAdmin("finance.rechargeOrders")');
    expect(source).toContain('tAdmin("finance.walletTransactions")');
    expect(source).toContain('tAdmin("finance.adjustment")');
    expect(financeSection).toContain("<AdminFinancePanel");
    expect(financeSection).toContain("onSubmitWalletAdjustment={onSubmitWalletAdjustment}");
    expect(financeSection).not.toContain("paymentMethods={paymentMethods}");
    expect(financeSection).not.toContain("billingSettings={billingSettings}");
    expect(financeSection).not.toContain("onTogglePaymentMethodEnabled");
    expect(financeSection).not.toContain("onSaveBillingSettings");
    expect(paymentBillingSection).toContain("<AdminPaymentBillingPanel");
    expect(paymentBillingSection).toContain("paymentMethods={paymentMethods}");
    expect(paymentBillingSection).toContain("billingSettings={billingSettings}");
    expect(paymentBillingSection).toContain("onTogglePaymentMethodEnabled={onTogglePaymentMethodEnabled}");
    expect(paymentBillingSection).toContain("onSaveBillingSettings={onSaveBillingSettings}");
    expect(financeSection).not.toContain("<AdminPlaceholderSection");
    expect(transactionsTable).toContain("selectedTransaction");
    expect(transactionsTable).toContain("AdminWalletTransactionDetailDialog");
    expect(transactionsTable).toContain("transaction.metadata");
    expect(transactionsTable).toContain("priceSnapshot");
  });

  it("connects content, model pricing, and site settings sections to admin APIs", async () => {
    const source = await readFile(adminAppPath, "utf8");

    expect(source).toContain("AdminContentPanel");
    expect(source).toContain("AdminModelPricingPanel");
    expect(source).toContain("AdminSiteSettingsPanel");
    expect(source).toContain('getJson<AdminContentSummaryResponse>("/api/admin/content/summary")');
    expect(source).toContain('getJson<AdminContentProductsResponse>("/api/admin/content/products")');
    expect(source).toContain('getJson<AdminContentVideoJobsResponse>("/api/admin/content/video-jobs")');
    expect(source).toContain('getJson<AdminModelPricingCatalogResponse>("/api/admin/model-pricing-catalog")');
    expect(source).toContain('getJson<AdminSiteSettingsResponse>("/api/admin/site-settings")');
    expect(source).toContain('activeSection === "content"');
    expect(source).toContain('activeSection === "model-pricing"');
    expect(source).toContain('activeSection === "site-settings"');
  });

  it("keeps the admin shell usable when secondary admin modules fail to load", async () => {
    const source = await readFile(adminAppPath, "utf8");
    const refreshSource = source.slice(source.indexOf("async function refreshOverview"), source.indexOf("async function login"));

    expect(source).toContain("async function loadAdminModule");
    expect(refreshSource).toContain('const nextOverview = await getJson<AdminOverview>("/api/admin/overview");');
    expect(refreshSource).toContain("await Promise.all([");
    expect(refreshSource).toContain("loadAdminModule(");
    expect(refreshSource).toContain("setOverview(nextOverview);");
    expect(refreshSource).toContain('setStatus(tAdmin("status.partialLoadFailed", { modules: Array.from(new Set(failedModules)).join(tAdmin("status.moduleSeparator")) }));');
    expect(refreshSource).not.toContain("] = await Promise.all([");
  });

  it("uses workbench layouts instead of card walls for admin modules", async () => {
    const source = await readFile(adminAppPath, "utf8");
    const contentPanel = source.slice(source.indexOf("function AdminContentPanel"), source.indexOf("function AdminFinancePanel"));
    const financePanel = source.slice(source.indexOf("function AdminFinancePanel"), source.indexOf("function AdminPaymentBillingPanel"));
    const paymentBillingPanel = source.slice(source.indexOf("function AdminPaymentBillingPanel"), source.indexOf("function AdminToggle"));
    const modelPricingPanel = source.slice(source.indexOf("function AdminModelPricingPanel"), source.indexOf("function AdminPriceInput"));
    const siteSettingsPanel = source.slice(source.indexOf("function AdminSiteSettingsPanel"), source.indexOf("function AdminFinanceRechargeOrdersTable"));

    expect(source).toContain("function AdminWorkbench");
    expect(source).toContain("function AdminSummaryStrip");
    expect(source).toContain("function AdminSegmentedControl");
    expect(source).toContain("function AdminDataPanel");
    expect(source).toContain("function AdminSidePanel");
    expect(contentPanel).toContain("useState<AdminContentView>");
    expect(contentPanel).toContain('useState<AdminContentView>("videoJobs")');
    expect(contentPanel).toContain("<AdminWorkbench");
    expect(contentPanel).toContain("<AdminSegmentedControl");
    expect(contentPanel).toContain("AdminContentSignalStrip");
    expect(contentPanel).not.toContain("AdminContentSidePanel");
    expect(source).not.toContain("function AdminContentSidePanel");
    expect(financePanel).toContain("useState<AdminFinanceLedgerView>");
    expect(financePanel).toContain("<AdminWorkbench");
    expect(financePanel).toContain("<AdminSegmentedControl");
    expect(financePanel).toContain("AdminWalletAdjustmentDialog");
    expect(financePanel).not.toContain("AdminFinanceControlsPanel");
    expect(paymentBillingPanel).toContain("<AdminWorkbench");
    expect(paymentBillingPanel).toContain("AdminPaymentBillingSettingsPanel");
    expect(paymentBillingPanel).toContain("AdminPaymentMethodsPanel");
    expect(paymentBillingPanel).toContain('tAdmin("paymentBilling.paymentMethods")');
    expect(paymentBillingPanel).not.toContain('tAdmin("finance.paymentMethods")');
    expect(modelPricingPanel).toContain("<AdminWorkbench");
    expect(modelPricingPanel).toContain("AdminModelPricingPublishPanel");
    expect(siteSettingsPanel).toContain("<AdminWorkbench");
    expect(siteSettingsPanel).toContain("AdminSiteSettingsSidePanel");
    expect(financePanel).not.toContain('<div className="grid gap-4 xl:grid-cols-2">');
    expect(contentPanel).not.toContain('<div className="grid gap-4 xl:grid-cols-2">');
  });

  it("keeps user management account-centric and sends full video and finance work to dedicated modules", async () => {
    const source = await readFile(adminAppPath, "utf8");
    const dashboardSource = source.slice(source.indexOf("function AdminDashboard"), source.indexOf("function modelServicesEndpoint"));
    const userPanel = source.slice(source.indexOf("function AdminUsersPanel"), source.indexOf("function AdminUsersTable"));
    const usersTable = source.slice(source.indexOf("function AdminUsersTable"), source.indexOf("function AdminUserExpandedRow"));
    const expandedRow = source.slice(source.indexOf("function AdminUserExpandedRow"), source.indexOf("function AdminUserRecentLedgerList"));

    expect(source).not.toContain("type AdminUserDetailView");
    expect(dashboardSource).toContain("<AdminUsersPanel");
    expect(dashboardSource).toContain("globalSearch={globalSearch}");
    expect(dashboardSource).toContain("selectedUserDetail={selectedUserDetail}");
    expect(dashboardSource).toContain("wallets={adminWallets}");
    expect(dashboardSource).toContain("walletTransactions={walletTransactions}");
    expect(dashboardSource).toContain("rechargeOrders={rechargeOrders}");
    expect(dashboardSource).toContain("selectedUser?.id === user.id");
    expect(dashboardSource).toContain("setSelectedUser(undefined)");
    expect(dashboardSource).toContain("setSelectedUserDetail(undefined)");
    expect(dashboardSource).toContain("setDetailLoading(false)");
    expect(dashboardSource).toContain('setActiveSection("content")');
    expect(dashboardSource).toContain('setActiveSection("finance")');
    expect(dashboardSource).toContain("globalSearch={globalSearch}");
    expect(source).toContain("function AdminUsersPanel");
    expect(source).not.toContain("function AdminUserDirectoryWorkbench");
    expect(source).toContain("function filterAdminUsers");
    expect(source).not.toContain("function AdminUserProfilePanel");
    expect(source).toContain("function AdminUserExpandedRow");
    expect(source).toContain("function AdminUserRecentLedgerList");
    expect(source).toContain("function adminUserFinanceSnapshot");
    expect(source).toContain("function adminWorkspaceIdsForUserDetail");
    expect(source).toContain("function adminWalletsForUserDetail");
    expect(source).toContain("function adminRechargeOrdersForUserDetail");
    expect(source).toContain("function adminWalletTransactionsForUserDetail");
    expect(userPanel).not.toContain("<AdminWorkbench");
    expect(userPanel).toContain("filterAdminUsers(overview.users, globalSearch)");
    expect(userPanel).toContain("<AdminUsersTable");
    expect(userPanel).toContain("users={visibleUsers}");
    expect(usersTable).toContain("selectedUserDetail");
    expect(usersTable).toContain("money(user.totalBalanceCny)");
    expect(usersTable).toContain("money(user.totalRechargeCny)");
    expect(usersTable).toContain("money(user.totalSpendCny)");
    expect(usersTable).not.toContain("adminUserFinanceSnapshot(");
    expect(usersTable).toContain("<AdminUserExpandedRow");
    expect(usersTable).toContain("colSpan={8}");
    expect(expandedRow).not.toContain("<AdminSidePanel");
    expect(expandedRow).toContain("admin-user-expanded-profile");
    expect(expandedRow).toContain("AdminUserDetailColumn");
    expect(expandedRow).toContain("AdminHeaderMetric");
    expect(expandedRow).toContain("AdminInlineMetric");
    expect(expandedRow).toContain("AdminMiniFact");
    expect(expandedRow).toContain("AdminWorkspaceMiniList");
    expect(expandedRow).toContain("AdminProductMiniList");
    expect(expandedRow).toContain("AdminVideoJobCard");
    expect(expandedRow).toContain("AdminUserRecentLedgerList");
    expect(expandedRow).toContain("onOpenContent");
    expect(expandedRow).toContain("onOpenFinance");
    expect(source).not.toContain("function AdminUserFinancePane");
    expect(source).not.toContain("function AdminUserVideoJobsPane");
    expect(source).not.toContain("function AdminUserProductsPane");
  });

  it("renames content and finance around operational ownership", async () => {
    const source = await readFile(adminAppPath, "utf8");
    const contentPanel = source.slice(source.indexOf("function AdminContentPanel"), source.indexOf("function AdminFinancePanel"));
    const financePanel = source.slice(source.indexOf("function AdminFinancePanel"), source.indexOf("function AdminPaymentBillingPanel"));

    expect(source).toContain('tAdmin("navigation.content.label")');
    expect(source).toContain('tAdmin("navigation.finance.label")');
    expect(contentPanel).toContain("filterAdminContentProducts");
    expect(contentPanel).toContain("filterAdminContentVideoJobs");
    expect(financePanel).toContain("filterAdminWallets");
    expect(financePanel).toContain("filterAdminRechargeOrders");
    expect(financePanel).toContain("filterAdminWalletTransactions");
    expect(financePanel).toContain("adjustingWallet");
    expect(financePanel).toContain("onAdjust={openWalletAdjustment}");
  });

  it("normalizes legacy workspace names to business-space wording in admin tables", async () => {
    const source = await readFile(adminAppPath, "utf8");

    expect(source).toContain("function adminBusinessSpaceName");
    expect(source).toContain("adminBusinessSpaceName(product.workspaceName)");
    expect(source).toContain("adminBusinessSpaceName(job.workspaceName)");
    expect(source).toContain("adminBusinessSpaceName(wallet.workspaceName)");
    expect(source).toContain("adminBusinessSpaceName(order.workspaceName)");
    expect(source).toContain("adminBusinessSpaceName(transaction.workspaceName)");
    expect(source).toContain("adminBusinessSpaceName(workspace.name)");
  });
});
