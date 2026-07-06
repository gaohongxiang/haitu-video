import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const appPath = "src/client/App.tsx";
const adminAppPath = "src/client/AdminApp.tsx";
const apiModelConfigPanelPath = "src/client/components/apiModelConfigPanel.tsx";
const modelServiceConfigPath = "src/client/components/modelServiceConfig.tsx";
const zhAppPath = "src/i18n/locales/zh/app.json";
const enAppPath = "src/i18n/locales/en/app.json";

async function readAppLocale(localePath: string) {
  return JSON.parse(await readFile(localePath, "utf8")) as Record<string, unknown>;
}

function expectLocaleSections(locale: Record<string, unknown>) {
  for (const section of [
    "auth",
    "account",
    "dialogs",
    "dashboard",
    "productLibrary",
    "productStatus",
    "fileImport",
    "preflight",
    "wallet",
    "pricing",
    "ledger",
    "settings",
    "admin",
    "status",
    "commonActions"
  ]) {
    expect(locale).toHaveProperty(section);
  }
}

describe("full site i18n source boundaries", () => {
  it("ships matching app translation sections for every major console surface", async () => {
    const zh = await readAppLocale(zhAppPath);
    const en = await readAppLocale(enAppPath);

    expectLocaleSections(zh);
    expectLocaleSections(en);
  });

  it("localizes app shell, auth, dashboard, product library, wallet, pricing, and ledger UI", async () => {
    const source = await readFile(appPath, "utf8");
    const appSource = source.slice(source.indexOf("export function App()"), source.indexOf("function AppLanguageSwitcher"));
    const loginSource = source.slice(source.indexOf("function LoginScreen"), source.indexOf("function AuthOtpField"));
    const dashboardSource = source.slice(source.indexOf("function DashboardStatsPanel"), source.indexOf("function ChartBlock"));
    const productLibrarySource = source.slice(source.indexOf("function ProductLibraryHome"), source.indexOf("function ProductLibraryDialogMount"));
    const fileImportSource = source.slice(source.indexOf("function ProductFileImportDialog"), source.indexOf("function FactList"));
    const paymentDialogSource = source.slice(source.indexOf("function PaymentMethodDialog"), source.indexOf("function LoginScreen"));
    const walletSource = source.slice(source.indexOf("function WalletRechargePanel"), source.indexOf("function ModelPricingPanel"));
    const pricingSource = source.slice(source.indexOf("function ModelPricingPanel"), source.indexOf("function ModelPricingRow"));
    const ledgerSource = source.slice(source.indexOf("function VideoJobsPanel"), source.indexOf("function AuditLogPanel"));
    const providerUsageSource = source.slice(source.indexOf("function ProviderUsagePanel"), source.indexOf("function FeeSummaryPanel"));
    const feeSummarySource = source.slice(source.indexOf("function FeeSummaryPanel"), source.indexOf("function ReportsPanel"));
    const reportsSource = source.slice(source.indexOf("function ReportsPanel"), source.indexOf("type KpiTone"));
    const loadingSource = source.slice(source.indexOf("function ConsoleSectionLoadingState"), source.indexOf("function errorMessage"));

    expect(appSource).toContain('tApp("dashboard.ariaLabel")');
    expect(appSource).toContain('tApp("navigation.creative")');
    expect(appSource).toContain("creativeWorkspaceMode");
    expect(appSource).toContain("mode={creativeWorkspaceMode}");
    expect(appSource).toContain('tApp("ledger.ariaLabel")');
    expect(appSource).toContain('tApp("wallet.ariaLabel")');
    expect(appSource).toContain('tApp("pricing.ariaLabel")');
    expect(appSource).toContain('tApp("settings.ariaLabel")');
    expect(appSource).not.toContain('aria-label="仪表盘"');
    expect(appSource).not.toContain('text="图片创作待上线"');
    expect(appSource).not.toContain('tApp("image.empty")');

    expect(loginSource).toContain('const tAuth = (key: string, options?: Record<string, unknown>) => i18n.t(`app:auth.${key}`, options);');
    expect(loginSource).toContain('tAuth("title")');
    expect(loginSource).toContain('tAuth("entry.submit")');
    expect(loginSource).not.toContain("Haitu 账号入口");
    expect(loginSource).not.toContain("登录 / 创建账号");

    expect(dashboardSource).toContain('tDashboard("range.label")');
    expect(dashboardSource).toContain('tDashboard("provider.title")');
    expect(dashboardSource).toContain('tDashboard("recent.empty")');
    expect(dashboardSource).not.toContain("时间范围:");
    expect(dashboardSource).not.toContain("最近使用");

    expect(productLibrarySource).toContain('tProductLibrary("title")');
    expect(productLibrarySource).toContain('tProductLibrary("actions.createVideo")');
    expect(productLibrarySource).not.toContain(">商品库<");
    expect(productLibrarySource).not.toContain(">创作视频<");

    expect(fileImportSource).toContain('tFileImport("title")');
    expect(fileImportSource).toContain('tFileImport("table.productTitle")');
    expect(fileImportSource).not.toContain("导入商品资料");
    expect(fileImportSource).not.toContain("商品标题");

    expect(walletSource).toContain('tWallet("title")');
    expect(walletSource).toContain('tWallet("balance.available")');
    expect(walletSource).toContain('tWallet("tabs.recharge")');
    expect(walletSource).toContain('tWallet("tabs.consumption")');
    expect(walletSource).toContain("wallet-balance-hero");
    expect(walletSource).toContain("wallet-balance-actions");
    expect(walletSource).toContain("wallet-balance-summary");
    expect(walletSource).toContain("wallet-recharge-panel");
    expect(walletSource).toContain("min-[900px]:border-l");
    expect(walletSource).not.toContain('tWallet("availableBadge"');
    expect(walletSource).toContain('tWallet("quickRecharge")');
    expect(walletSource).toContain("wallet-recharge-options");
    expect(walletSource).toContain("lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(170px,1.2fr)]");
    expect(walletSource).toContain("wallet-recharge-option");
    expect(walletSource).toContain("wallet-custom-recharge-option");
    expect(walletSource).toContain("selectedRechargeAmountCny");
    expect(walletSource).toContain("setSelectedRechargeAmountCny(amount)");
    expect(walletSource).toContain("selectedRechargePaymentAmountCny");
    expect(walletSource).toContain("wallet-selected-recharge-pay");
    expect(walletSource).toContain('tWallet("pay")');
    expect(walletSource).toContain('tWallet("paySelected"');
    expect(paymentDialogSource).toContain('getJson<PaymentMethodsResponse>(`/api/payment-methods?amountCny=${encodeURIComponent(String(amountCny))}&methodId=${encodeURIComponent(selectedPaymentMethodId)}`)');
    expect(paymentDialogSource).toContain("selectedMethod?.quote");
    expect(paymentDialogSource).toContain("selectedQuoteReady");
    expect(paymentDialogSource).toContain("quoteLoadFailed");
    expect(paymentDialogSource).toContain('tPayment("quoteUnavailable")');
    expect(paymentDialogSource).toContain("refreshPaymentQuote");
    expect(paymentDialogSource).toContain("PaymentRateMetric");
    expect(paymentDialogSource).toContain('tPayment("refreshRate")');
    expect(paymentDialogSource).toContain("paymentMethodPaymentAmountText");
    expect(paymentDialogSource).toContain("paymentMethodFxRateText");
    expect(paymentDialogSource).toContain('tPayment("rate")');
    expect(paymentDialogSource.indexOf('label={tPayment("credit")}')).toBeLessThan(paymentDialogSource.indexOf('label={tPayment("amount")}'));
    expect(paymentDialogSource.indexOf('label={tPayment("amount")}')).toBeLessThan(paymentDialogSource.indexOf('label={tPayment("rate")}'));
    expect(source).toContain("paymentCurrencySymbol");
    expect(source).toContain("paymentCurrencyAmountText");
    expect(source).toContain("formatReverseFxRate");
    expect(walletSource).toContain('tWallet("customRecharge.inputAriaLabel")');
    expect(walletSource).toContain("customRechargeAmountValid");
    expect(walletSource).toContain("normalizeCustomRechargeAmountCny");
    expect(walletSource).not.toContain('tWallet("customRecharge.label")');
    expect(walletSource).not.toContain('tWallet("customRecharge.submitAriaLabel")');
    expect(walletSource).not.toContain("<ChevronRight size={15}");
    expect(walletSource).not.toContain('Field className="min-w-[150px] flex-1" label={tWallet("customRecharge.label")}');
    expect(walletSource).not.toContain('tWallet("customRecharge.pay")');
    expect(walletSource).not.toContain('tWallet("customRecharge.hint")');
    expect(walletSource).toContain("wallet-tab-strip");
    expect(walletSource).toContain("wallet-recharge-order-table");
    expect(walletSource).toContain("wallet-recharge-order-row");
    expect(walletSource).toContain('tWallet("orderTable.order")');
    expect(walletSource).toContain('tWallet("orderTable.topUpAmount")');
    expect(walletSource).not.toContain('tWallet("orderTable.paid")');
    expect(walletSource).toContain('tWallet("orderTable.paymentMethod")');
    expect(walletSource).toContain('tWallet("orderTable.status")');
    expect(walletSource).toContain('tWallet("orderTable.createdAt")');
    expect(walletSource).toContain('tWallet("orderTable.action")');
    expect(walletSource).toContain("wallet-transaction-empty");
    expect(walletSource).toContain("border-b border-[var(--border)]");
    expect(walletSource).toContain("walletRechargeOrders");
    expect(walletSource).toContain("WalletRechargeOrderTable");
    expect(walletSource).toContain("walletRechargeOrderDisplayCode");
    expect(walletSource).toContain("walletRechargeOrderCreditAmountText");
    expect(walletSource).toContain("walletRechargeOrderSettlementAmountText");
    expect(walletSource).not.toContain("walletRechargeOrderPaymentAmountText");
    expect(walletSource).toContain("wallet-recharge-order-settlement");
    expect(walletSource).toContain("walletRechargeOrderPaymentMethodView");
    expect(walletSource).toContain("walletRechargeOrderEffectiveStatus");
    expect(walletSource).toContain("walletRechargeOrderExpiresInText");
    expect(walletSource).toContain("window.setInterval(() => setNowTick(Date.now()), 1000)");
    expect(walletSource).not.toContain("setNowTick(Date.now()), 30_000");
    expect(walletSource).toContain('className="h-8 min-h-8 whitespace-nowrap px-2.5 text-[12px]"');
    expect(walletSource).toContain("wallet-recharge-order-countdown");
    expect(walletSource).not.toContain("grid justify-items-start gap-1");
    expect(walletSource).toContain("rechargeTransactionsByOrderId");
    expect(walletSource).toContain("cryptoCurrency");
    expect(walletSource).toContain("cryptoNetwork");
    expect(walletSource).toContain("cardLast4");
    expect(walletSource).toContain('title={order.id}');
    expect(walletSource).not.toContain(">{order.id}</div>");
    expect(walletSource).not.toContain("showTypeBadge={false}");
    expect(walletSource).toContain("walletConsumptionTransactions");
    expect(walletSource).toContain("wallet-consumption-transaction-table");
    expect(walletSource).toContain("wallet-consumption-transaction-row");
    expect(walletSource).toContain("WalletConsumptionTransactionTable");
    expect(walletSource).toContain('tWallet("transactionTable.type")');
    expect(walletSource).toContain('tWallet("transactionTable.description")');
    expect(walletSource).toContain('tWallet("transactionTable.amount")');
    expect(walletSource).toContain('tWallet("transactionTable.feeComposition")');
    expect(walletSource).toContain("WalletBillingBreakdownInline");
    expect(walletSource).toContain('tWallet("transactionTable.serviceFee")');
    expect(walletSource).toContain('tWallet("transactionTable.officialCost")');
    expect(walletSource).toContain('tWallet("transactionTable.balance")');
    expect(walletSource).toContain('tWallet("transactionTable.createdAt")');
    expect(walletSource).toContain('tWallet("transactionTable.action")');
    expect(walletSource).toContain("walletTransactionMatchesConsumptionFilter");
    expect(walletSource).not.toContain("min-[900px]:grid-cols-[minmax(340px,1fr)_minmax(360px,520px)]");
    expect(walletSource).not.toContain("shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_18%,transparent)]");
    expect(walletSource).not.toContain("md:grid-cols-3");
    expect(walletSource).not.toContain('className="mt-4 flex flex-wrap gap-2 rounded-lg border');
    expect(walletSource).not.toContain('rounded-lg border border-[var(--border)] bg-[var(--card2)] p-2');
    expect(walletSource).not.toContain(">余额中心<");
    expect(walletSource).not.toContain(">消费明细<");
    expect(walletSource).not.toContain("账户余额");

    expect(pricingSource).toContain('tPricing("title")');
    expect(pricingSource).toContain('tPricing("officialSource")');
    expect(pricingSource).not.toContain("官方模型价格快照");
    expect(pricingSource).not.toContain("动态定价项");
    expect(pricingSource).not.toContain("活动价");
    expect(pricingSource).not.toContain("控制台专属价");

    expect(ledgerSource).toContain('tLedger("jobs.title")');
    expect(ledgerSource).toContain('tLedger("jobs.empty")');
    expect(ledgerSource).not.toContain("生成任务记录");

    expect(providerUsageSource).toContain('tLedger("providerUsage.title")');
    expect(providerUsageSource).toContain('tLedger("providerUsage.refresh")');
    expect(providerUsageSource).not.toContain("官方用量");

    expect(feeSummarySource).toContain('tLedger("fees.title")');
    expect(feeSummarySource).toContain('tLedger("fees.table.product")');
    expect(feeSummarySource).not.toContain("费用汇总");

    expect(reportsSource).toContain('tLedger("reports.title")');
    expect(reportsSource).toContain('tLedger("reports.filters.product")');
    expect(reportsSource).not.toContain("生成报告");

    expect(walletSource).toContain('walletTransactionTypeLabel(transaction.type, tWallet)');
    expect(loadingSource).toContain('tAppGlobal("shell.consoleLoading"');
    expect(loadingSource).not.toContain("正在载入");
  });

  it("localizes shared model/API settings components instead of hard-coding Chinese UI", async () => {
    const apiPanelSource = await readFile(apiModelConfigPanelPath, "utf8");
    const sharedConfigSource = await readFile(modelServiceConfigPath, "utf8");

    expect(apiPanelSource).toContain('const tSettings = (key: string, options?: Record<string, unknown>) => i18n.t(`app:settings.${key}`, options);');
    expect(apiPanelSource).toContain('tSettings("title")');
    expect(apiPanelSource).toContain('tSettings("serviceMode.platform.title")');
    expect(apiPanelSource).not.toContain('title: "平台托管 API"');
    expect(apiPanelSource).not.toContain("模型服务设置");

    expect(sharedConfigSource).toContain('const tSettings = (key: string, options?: Record<string, unknown>) => i18n.t(`app:settings.${key}`, options);');
    expect(sharedConfigSource).toContain('tSettings("serviceDialog.nameLabel")');
    expect(sharedConfigSource).toContain('tSettings("actions.save")');
    expect(sharedConfigSource).not.toContain("配置名称");
    expect(sharedConfigSource).not.toContain("测试配置");
  });

  it("localizes the project admin console instead of leaving it as a Chinese-only island", async () => {
    const adminSource = await readFile(adminAppPath, "utf8");
    const loginSource = adminSource.slice(adminSource.indexOf("function AdminLoginScreen"), adminSource.indexOf("function AdminDashboard"));
    const dashboardSource = adminSource.slice(adminSource.indexOf("function AdminDashboard"), adminSource.indexOf("function modelServicesEndpoint"));
    const sidebarSource = adminSource.slice(adminSource.indexOf("function AdminSidebar"), adminSource.indexOf("function AdminLanguageSwitcher"));
    const paymentBillingSource = adminSource.slice(adminSource.indexOf("function AdminPaymentBillingPanel"), adminSource.indexOf("function AdminToggle"));
    const userDetailSource = adminSource.slice(adminSource.indexOf("function AdminUserExpandedRow"), adminSource.indexOf("function AdminVideoJobCard"));

    expect(adminSource).toContain("function AdminLanguageSwitcher");
    expect(adminSource).toContain('tAdmin("navigation.overview.label")');
    expect(adminSource).toContain('tAdmin("shell.title")');
    expect(adminSource).toContain('tAdmin("modelServices.title")');
    expect(adminSource).toContain('tAdmin("navigation.finance.label")');
    expect(adminSource).toContain('tAdmin("paymentBilling.serviceFees")');
    expect(adminSource).not.toContain('tAdmin("platformModels.');
    expect(adminSource).not.toContain('tAdmin("billing.');

    expect(loginSource).toContain('tAdmin("auth.subtitle")');
    expect(loginSource).toContain('tAdmin("auth.enterAdmin")');
    expect(loginSource).not.toContain("项目方用户运营后台");
    expect(loginSource).not.toContain("进入后台");

    expect(sidebarSource).toContain("AdminLanguageSwitcher");
    expect(dashboardSource).not.toContain("后台概览");
    expect(dashboardSource).not.toContain("用户管理");
    expect(dashboardSource).not.toContain("退出");

    expect(paymentBillingSource).toContain('tAdmin("paymentBilling.paymentMethods")');
    expect(paymentBillingSource).toContain('tAdmin("paymentBilling.serviceFees")');
    expect(paymentBillingSource).toContain('tAdmin("paymentBilling.serviceFeeUnits.perVideo")');
    expect(adminSource).toContain('tAdmin("finance.transactionTypes.adjustment")');
    expect(paymentBillingSource).not.toContain("充值账单");
    expect(paymentBillingSource).not.toContain("余额调整");

    expect(userDetailSource).toContain('tAdmin("users.profile.businessContext")');
    expect(userDetailSource).toContain('tAdmin("users.drawer.loading")');
    expect(userDetailSource).toContain('tAdmin("users.drawer.emptyVideoJobs")');
    expect(adminSource).toContain('tAdmin("jobStatus.completed")');
    expect(userDetailSource).not.toContain("用户详情");
    expect(userDetailSource).not.toContain("最近视频任务");
  });
});
