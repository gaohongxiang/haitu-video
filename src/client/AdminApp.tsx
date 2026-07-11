import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock3,
  CreditCard,
  Database,
  DollarSign,
  Globe2,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MailCheck,
  Package,
  RefreshCcw,
  Route,
  Search,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Users,
  Video,
  X
} from "lucide-react";
import * as EChartsForReact from "echarts-for-react";
import type { EChartsOption, EChartsReactProps } from "echarts-for-react";
import { Fragment, FormEvent, type ComponentType, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "./components/ui/badge.js";
import { Button } from "./components/ui/button.js";
import { Card, CardHeader } from "./components/ui/card.js";
import { Field, Input, Select, Textarea } from "./components/ui/field.js";
import { cn } from "./lib/utils.js";
import {
  notifyAuthenticationEstablished,
  notifyAuthenticationRequired,
  subscribeAuthenticationRequired
} from "./authExpiry.js";
import { getLocaleMeta, supportedLocales, type AppLocale } from "../i18n/config.js";
import { clientLocaleStorageKey, i18n } from "../i18n/client.js";
import {
  apiModeForProviderDraft,
  draftFromProviderConfig,
  groupConfiguredModelServices,
  modelConfigDeleteQuery,
  modelConfigPresets,
  resetModelConfigDraft,
  SharedModelConfigDialog,
  SharedModelServiceGroup,
  type ModelConfigDraft,
  type ModelConfigProviderId,
  type ModelConfigTestStatus,
  type ModelServiceGroup,
  type ProviderConfigServiceItem,
  type ProviderConfigItem,
  type ProviderConfigLedger
} from "./components/modelServiceConfig.js";

const ReactECharts = ((EChartsForReact as { default?: unknown }).default ?? EChartsForReact) as ComponentType<EChartsReactProps>;
const brandLogoUrl = new URL("./assets/logo.svg", import.meta.url).href;
const authOtpCooldownDurationSeconds = 60;

function tAdmin(key: string, options?: Record<string, unknown>): string {
  return i18n.t(`app:admin.${key}`, options);
}

function adminLabel(item: (typeof adminNavigationItems)[number]): string {
  if (item.translationKey === "overview") return tAdmin("navigation.overview.label");
  if (item.translationKey === "users") return tAdmin("navigation.users.label");
  if (item.translationKey === "content") return tAdmin("navigation.content.label");
  if (item.translationKey === "traffic") return tAdmin("navigation.traffic.label");
  if (item.translationKey === "finance") return tAdmin("navigation.finance.label");
  if (item.translationKey === "paymentBilling") return tAdmin("navigation.paymentBilling.label");
  if (item.translationKey === "modelServices") return tAdmin("navigation.modelServices.label");
  if (item.translationKey === "modelPricing") return tAdmin("navigation.modelPricing.label");
  if (item.translationKey === "siteSettings") return tAdmin("navigation.siteSettings.label");
  return tAdmin("navigation.system.label");
}

function adminDescription(item: (typeof adminNavigationItems)[number]): string {
  if (item.translationKey === "overview") return tAdmin("navigation.overview.description");
  if (item.translationKey === "users") return tAdmin("navigation.users.description");
  if (item.translationKey === "content") return tAdmin("navigation.content.description");
  if (item.translationKey === "traffic") return tAdmin("navigation.traffic.description");
  if (item.translationKey === "finance") return tAdmin("navigation.finance.description");
  if (item.translationKey === "paymentBilling") return tAdmin("navigation.paymentBilling.description");
  if (item.translationKey === "modelServices") return tAdmin("navigation.modelServices.description");
  if (item.translationKey === "modelPricing") return tAdmin("navigation.modelPricing.description");
  if (item.translationKey === "siteSettings") return tAdmin("navigation.siteSettings.description");
  return tAdmin("navigation.system.description");
}

function adminStringArray(key: string): string[] {
  const value = i18n.t(`app:admin.${key}`, { returnObjects: true });
  if (!Array.isArray(value)) return [];
  return (value as unknown[]).filter((item): item is string => typeof item === "string");
}

type AuthFlowMode = "entry" | "verify-email";
type AdminSection = "overview" | "users" | "content" | "traffic" | "finance" | "payment-billing" | "model-services" | "model-pricing" | "site-settings" | "system";
type AdminTranslationKey = "overview" | "users" | "content" | "traffic" | "finance" | "paymentBilling" | "modelServices" | "modelPricing" | "siteSettings" | "system";
type AdminNavigationGroup = "operate" | "commercial" | "configuration" | "system";
type AdminTranslator = (key: string, options?: Record<string, unknown>) => string;
type AdminContentView = "products" | "videoJobs";
type AdminFinanceLedgerView = "wallets" | "rechargeOrders" | "walletTransactions";

const adminNavigationItems: Array<{
  id: AdminSection;
  translationKey: AdminTranslationKey;
  group: AdminNavigationGroup;
  icon: ComponentType<{ size?: number; className?: string }>;
}> = [
  {
    id: "overview",
    translationKey: "overview",
    group: "operate",
    icon: LayoutDashboard
  },
  {
    id: "users",
    translationKey: "users",
    group: "operate",
    icon: Users
  },
  {
    id: "content",
    translationKey: "content",
    group: "operate",
    icon: Package
  },
  {
    id: "traffic",
    translationKey: "traffic",
    group: "operate",
    icon: Route
  },
  {
    id: "finance",
    translationKey: "finance",
    group: "commercial",
    icon: CreditCard
  },
  {
    id: "payment-billing",
    translationKey: "paymentBilling",
    group: "configuration",
    icon: SlidersHorizontal
  },
  {
    id: "model-services",
    translationKey: "modelServices",
    group: "configuration",
    icon: KeyRound
  },
  {
    id: "model-pricing",
    translationKey: "modelPricing",
    group: "configuration",
    icon: DollarSign
  },
  {
    id: "site-settings",
    translationKey: "siteSettings",
    group: "configuration",
    icon: Globe2
  },
  {
    id: "system",
    translationKey: "system",
    group: "system",
    icon: Settings2
  }
];

const adminNavigationGroups: Array<{ id: AdminNavigationGroup; labelKey: string }> = [
  { id: "operate", labelKey: "navigationGroups.operate" },
  { id: "commercial", labelKey: "navigationGroups.commercial" },
  { id: "configuration", labelKey: "navigationGroups.configuration" },
  { id: "system", labelKey: "navigationGroups.system" }
];

interface AuthSession {
  authEnabled: boolean;
  authenticated: boolean;
  user?: {
    id?: string;
    email?: string;
    role?: string;
  };
  workspace?: {
    id: string;
    name?: string;
    role?: string;
  };
}

interface AuthEntryResponse extends AuthSession {
  verificationRequired?: boolean;
  email?: string;
}

interface AdminOverview {
  metrics: {
    totalUsers: number;
    verifiedUsers: number;
    newUsersToday: number;
    newUsers7d: number;
    activeUsers7d: number;
    totalWorkspaces: number;
    totalProducts: number;
    totalVideoJobs: number;
  };
  growth: Array<{
    date: string;
    registrations: number;
  }>;
  activity: Array<{
    date: string;
    activeUsers: number;
    events: number;
  }>;
  users: AdminUserSummary[];
}

interface AdminUserSummary {
  id: string;
  email: string;
  displayName?: string;
  role: string;
  emailVerified: boolean;
  workspaceCount: number;
  productCount: number;
  videoJobCount: number;
  totalBalanceCny: number;
  totalRechargeCny: number;
  totalSpendCny: number;
  createdAt: string;
  lastActiveAt?: string;
}

interface AdminUserDetail {
  user: AdminUserSummary & {
    lastSessionAt?: string;
  };
  videoStatusCounts: Record<string, number>;
  workspaces: AdminUserWorkspaceSummary[];
  products: AdminUserProductSummary[];
  videoJobs: AdminUserVideoJobSummary[];
}

interface AdminUserWorkspaceSummary {
  id: string;
  name: string;
  role: string;
  ownerEmail?: string;
  memberCount: number;
  productCount: number;
  videoJobCount: number;
  completedJobCount: number;
  failedJobCount: number;
  queuedJobCount: number;
  expiredJobCount: number;
  lastVideoJobAt?: string;
}

interface AdminUserProductSummary {
  id: string;
  workspaceId: string;
  sku: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

interface AdminUserVideoJobSummary {
  id: string;
  workspaceId: string;
  productId?: string;
  productSku?: string;
  productTitle?: string;
  status: string;
  provider?: string;
  model?: string;
  language?: string;
  durationSeconds?: number;
  outputCount?: number;
  jobDir: string;
  error?: string;
  readableError?: string;
  createdAt: string;
  completedAt?: string;
  expiresAt?: string;
}

type ModelServiceAdminConfigResponse = Pick<ProviderConfigLedger, "textModels" | "imageModels" | "videoModels">;

interface PaymentMethodView {
  id: "stripe" | "infini";
  label: string;
  kind: "rmb" | "crypto";
  enabled: boolean;
  configured: boolean;
  available: boolean;
  description: string;
  unavailableReason?: string;
}

interface AdminPaymentMethodsResponse {
  methods: PaymentMethodView[];
}

interface AdminWalletSummary {
  workspaceId: string;
  workspaceName: string;
  ownerEmail?: string;
  memberCount: number;
  balanceCny: number;
  reservedCny: number;
  availableCny: number;
  transactionCount: number;
  lastTransactionAt?: string;
  lastTransactionType?: string;
}

interface AdminWalletsResponse {
  wallets: AdminWalletSummary[];
}

interface AdminWalletTransactionView {
  id: string;
  workspaceId: string;
  workspaceName: string;
  ownerEmail?: string;
  type: string;
  amountCny: number;
  balanceAfterCny: number;
  reservedAfterCny: number;
  reservationId?: string;
  jobId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface AdminWalletTransactionsResponse {
  transactions: AdminWalletTransactionView[];
}

interface AdminRechargeOrderView {
  id: string;
  workspaceId: string;
  workspaceName: string;
  ownerEmail?: string;
  provider: string;
  providerSessionId?: string;
  providerPaymentIntentId?: string;
  paymentAmount: number;
  paymentAmountCents: number;
  paymentCurrency: string;
  walletCurrency: "cny";
  creditCny: number;
  creditCents: number;
  status: string;
  checkoutUrl?: string;
  failureReason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  expiresAt?: string;
}

interface AdminRechargeOrdersResponse {
  orders: AdminRechargeOrderView[];
}

interface AdminWalletAdjustmentResponse {
  wallet: {
    workspaceId: string;
    balanceCny: number;
    reservedCny: number;
    availableCny: number;
  };
}

type BillingUsageKind = "text" | "image" | "video";

interface BillingPriceRuleView {
  ruleId: string;
  policyId: string;
  usageKind: BillingUsageKind;
  serviceFeeCny: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BillingSettingsView {
  policy: {
    policyId: string;
    mode: "metered_generation";
    label: string;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
  };
  rules: BillingPriceRuleView[];
}

interface AdminBillingSettingsResponse {
  settings: BillingSettingsView;
}

interface AdminContentSummaryResponse {
  metrics: {
    totalProducts: number;
    totalVideoJobs: number;
    completedVideoJobs: number;
    failedVideoJobs: number;
    totalVideoAssets: number;
    totalStoryboards: number;
  };
  statusCounts: Array<{
    status: string;
    count: number;
  }>;
  recentVideoJobs: AdminContentVideoJobView[];
}

interface AdminContentProductView {
  id: string;
  workspaceId: string;
  workspaceName: string;
  ownerEmail?: string;
  sku: string;
  title?: string;
  videoJobCount: number;
  assetCount: number;
  storyboardCount: number;
  createdAt: string;
  updatedAt: string;
}

interface AdminContentProductsResponse {
  products: AdminContentProductView[];
}

interface AdminContentVideoJobView {
  id: string;
  workspaceId: string;
  workspaceName: string;
  ownerEmail?: string;
  productId?: string;
  productSku?: string;
  productTitle?: string;
  status: string;
  model?: string;
  language?: string;
  durationSeconds?: number;
  outputCount?: number;
  assetCount: number;
  jobDir: string;
  createdAt: string;
  completedAt?: string;
  expiresAt?: string;
}

interface AdminContentVideoJobsResponse {
  videoJobs: AdminContentVideoJobView[];
}

interface AdminTrafficOverviewResponse {
  metrics: {
    visitors: number;
    pageViews: number;
    ctaClicks: number;
    signups: number;
    logins: number;
    rechargeOrders: number;
    paidRecharges: number;
    creativeJobs: number;
    completedCreativeJobs: number;
    indexSubmissions: number;
  };
  trend: Array<{
    date: string;
    visitors: number;
    pageViews: number;
    ctaClicks: number;
    signups: number;
    paidRecharges: number;
    completedCreativeJobs: number;
  }>;
}

interface AdminTrafficSourcesResponse {
  sources: Array<{
    source: string;
    visitors: number;
    pageViews: number;
    ctaClicks: number;
    signups: number;
    paidRecharges: number;
    completedCreativeJobs: number;
  }>;
}

interface AdminTrafficPagesResponse {
  pages: Array<{
    path: string;
    locale?: string;
    pageType: string;
    visitors: number;
    pageViews: number;
    searchClicks: number;
    searchImpressions: number;
    searchCtr?: number;
    averagePosition?: number;
    ctaClicks: number;
    signups: number;
    paidRecharges: number;
    completedCreativeJobs: number;
  }>;
}

interface AdminTrafficIndexingResponse {
  submissions: Array<{
    id: string;
    submittedAt: string;
    provider: string;
    submissionType: string;
    url: string;
    statusCode?: number;
    responseExcerpt?: string;
    errorMessage?: string;
    retryCount: number;
  }>;
}

interface AdminTrafficSettingsResponse {
  integrations: Array<{
    id: string;
    label: string;
    configured: boolean;
    status: "configured" | "not_configured";
    description: string;
  }>;
}

interface AdminTrafficSearchResponse {
  rows: Array<{
    date: string;
    query: string;
    page: string;
    country?: string;
    device?: string;
    clicks: number;
    impressions: number;
    ctr?: number;
    position?: number;
  }>;
}

interface AdminTrafficCloudflareResponse {
  rows: Array<{
    date: string;
    country?: string;
    status?: string;
    crawler?: string;
    requests: number;
  }>;
}

interface AdminTrafficGeoSummaryResponse {
  pagesReviewed: number;
  searchClicks: number;
  searchImpressions: number;
  edgeRequests: number;
  opportunities: Array<{
    path: string;
    reason: string;
    searchClicks: number;
    searchImpressions: number;
    searchCtr?: number;
    averagePosition?: number;
    pageViews: number;
    ctaClicks: number;
  }>;
}

interface AdminTrafficActionResponse {
  ok: boolean;
  status: "not_configured" | "synced" | "partial_error" | "error" | "submitted" | "failed";
  provider?: string;
  providers?: Array<{
    id: string;
    configured: boolean;
    status: "not_configured" | "synced" | "error";
    rowsSynced: number;
    error?: string;
  }>;
  statusCode?: number;
}

type AdminModelPricingKind = "text" | "image" | "video";
type AdminModelPricingProviderId = "openai" | "deepseek" | "gemini" | "volcengine";
type AdminModelPricingStatus = "verified" | "official-reference";

interface AdminModelPricingEntry {
  providerId: AdminModelPricingProviderId;
  model: string;
  label: string;
  kind: AdminModelPricingKind;
  unit: string;
  input: string;
  cachedInput?: string;
  output: string;
  note?: string;
  status: AdminModelPricingStatus;
  sourceUrl: string;
  inputPriceCnyPerMillion?: number;
  outputPriceCnyPerMillion?: number;
  cachedInputPriceCnyPerMillion?: number;
  fallbackPriceCnyPerCall?: number;
  imagePriceCnyPerImage?: number;
  videoTokenPriceCnyPerMillion?: number;
  editable: boolean;
}

interface AdminModelPricingCatalogResponse {
  active: {
    id?: string;
    version: string;
    source: "built_in" | "database";
    publishedAt?: string;
    entries: AdminModelPricingEntry[];
  };
}

interface AdminModelPricingDraftResponse {
  draft: {
    id: string;
    version: string;
  };
}

interface AdminSiteSettingsResponse {
  sections: Array<{
    id: string;
    label: string;
    status: "configured" | "attention" | "planned";
    description: string;
  }>;
  publicPages: Array<{
    id: string;
    label: string;
    status: "configured" | "planned";
  }>;
  seoGeo: {
    status: "configured";
    roadmapPath: string;
    productionCheck: string;
  };
  paymentMethods: PaymentMethodView[];
  billing: {
    policyId: string;
    label: string;
    enabled: boolean;
    rules: Array<{
      usageKind: string;
      serviceFeeCny: number;
      enabled: boolean;
    }>;
  };
  modelPricing: {
    activeVersion: string;
    source: "built_in" | "database";
    entryCount: number;
    publishedAt?: string;
  };
}

interface ModelConfigKeyRevealResponse {
  ok: true;
  provider: ModelConfigProviderId;
  configId: string;
  apiKey: string;
  keyPreview?: string;
}

const modelServiceAdminProviders: Array<{
  providerId: ModelConfigProviderId;
  endpoint: string;
  groupKey: "text" | "image" | "video";
}> = [
  {
    providerId: "openai-compatible-text",
    endpoint: "/api/admin/platform-model-configs/openai-compatible-text",
    groupKey: "text"
  },
  {
    providerId: "openai-compatible-image",
    endpoint: "/api/admin/platform-model-configs/openai-compatible-image",
    groupKey: "image"
  },
  {
    providerId: "volcengine-seedance",
    endpoint: "/api/admin/platform-model-configs/volcengine-seedance",
    groupKey: "video"
  }
];

function defaultPlatformConfigLedger(): ProviderConfigLedger {
  return {
    textModels: [],
    imageModels: [],
    videoModels: [],
    providers: [],
    runtime: {
      textConfigured: false,
      imageConfigured: false,
      videoConfigured: false
    }
  };
}

function defaultPlatformModelDrafts(): Record<ModelConfigProviderId, ModelConfigDraft> {
  return {
    "openai-compatible-text": resetModelConfigDraft("openai-compatible-text"),
    "openai-compatible-image": resetModelConfigDraft("openai-compatible-image"),
    "volcengine-seedance": resetModelConfigDraft("volcengine-seedance")
  };
}

function platformConfigLedgerFromResponse(response: ModelServiceAdminConfigResponse): ProviderConfigLedger {
  return {
    textModels: response.textModels,
    imageModels: response.imageModels,
    videoModels: response.videoModels,
    providers: response.videoModels,
    runtime: {
      textConfigured: response.textModels.some((model) => model.configured && model.enabled !== false),
      imageConfigured: response.imageModels.some((model) => model.configured && model.enabled !== false),
      videoConfigured: response.videoModels.some((model) => model.configured && model.enabled !== false)
    }
  };
}

function modelServicesForProvider(config: ProviderConfigLedger, providerId: ModelConfigProviderId): ProviderConfigItem[] {
  if (providerId === "openai-compatible-text") {
    return config.textModels;
  }
  if (providerId === "openai-compatible-image") {
    return config.imageModels;
  }
  return config.videoModels;
}

export function AdminApp() {
  const [adminLocale, setAdminLocale] = useState<AppLocale>(supportedLocales.includes(i18n.language as AppLocale) ? i18n.language as AppLocale : "zh");
  const [session, setSession] = useState<AuthSession | undefined>();
  const [overview, setOverview] = useState<AdminOverview | undefined>();
  const [authMode, setAuthMode] = useState<AuthFlowMode>("entry");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [otpCooldownSeconds, setOtpCooldownSeconds] = useState(0);
  const [platformConfig, setPlatformConfig] = useState<ProviderConfigLedger>(() => defaultPlatformConfigLedger());
  const [platformDrafts, setPlatformDrafts] = useState<Record<ModelConfigProviderId, ModelConfigDraft>>(() => defaultPlatformModelDrafts());
  const [platformTestStatus] = useState<Partial<Record<ModelConfigProviderId, ModelConfigTestStatus>>>({});
  const [editingPlatformProviderId, setEditingPlatformProviderId] = useState<ModelConfigProviderId | undefined>();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodView[]>([]);
  const [adminWallets, setAdminWallets] = useState<AdminWalletSummary[]>([]);
  const [walletTransactions, setWalletTransactions] = useState<AdminWalletTransactionView[]>([]);
  const [rechargeOrders, setRechargeOrders] = useState<AdminRechargeOrderView[]>([]);
  const [billingSettings, setBillingSettings] = useState<BillingSettingsView | undefined>();
  const [contentSummary, setContentSummary] = useState<AdminContentSummaryResponse | undefined>();
  const [contentProducts, setContentProducts] = useState<AdminContentProductView[]>([]);
  const [contentVideoJobs, setContentVideoJobs] = useState<AdminContentVideoJobView[]>([]);
  const [trafficOverview, setTrafficOverview] = useState<AdminTrafficOverviewResponse | undefined>();
  const [trafficSources, setTrafficSources] = useState<AdminTrafficSourcesResponse | undefined>();
  const [trafficPages, setTrafficPages] = useState<AdminTrafficPagesResponse | undefined>();
  const [trafficIndexing, setTrafficIndexing] = useState<AdminTrafficIndexingResponse | undefined>();
  const [trafficSettings, setTrafficSettings] = useState<AdminTrafficSettingsResponse | undefined>();
  const [trafficSearch, setTrafficSearch] = useState<AdminTrafficSearchResponse | undefined>();
  const [trafficCloudflare, setTrafficCloudflare] = useState<AdminTrafficCloudflareResponse | undefined>();
  const [trafficGeoSummary, setTrafficGeoSummary] = useState<AdminTrafficGeoSummaryResponse | undefined>();
  const [modelPricingCatalog, setModelPricingCatalog] = useState<AdminModelPricingCatalogResponse | undefined>();
  const [siteSettings, setSiteSettings] = useState<AdminSiteSettingsResponse | undefined>();

  useEffect(() => {
    return subscribeAuthenticationRequired(expireAdminSession);
  }, []);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    function syncAdminLocale(locale: string) {
      if (supportedLocales.includes(locale as AppLocale)) {
        setAdminLocale(locale as AppLocale);
      }
    }

    i18n.on("languageChanged", syncAdminLocale);
    return () => {
      i18n.off("languageChanged", syncAdminLocale);
    };
  }, []);

  useEffect(() => {
    if (otpCooldownSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setOtpCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [otpCooldownSeconds]);

  async function bootstrap() {
    setBusy(true);
    try {
      const nextSession = await getJson<AuthSession>("/api/auth/session");
      setSession(nextSession);
      if (nextSession.authenticated) {
        await refreshOverview();
      } else {
        setStatus("");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function refreshOverview() {
    setBusy(true);
    setForbidden(false);
    try {
      const nextOverview = await getJson<AdminOverview>("/api/admin/overview");
      setOverview(nextOverview);
      const failedModules: string[] = [];
      await Promise.all([
        loadAdminModule(tAdmin("navigation.modelServices.label"), () => getJson<ModelServiceAdminConfigResponse>("/api/admin/platform-model-configs"), (modelServices) => {
          setPlatformConfig(platformConfigLedgerFromResponse(modelServices));
        }, failedModules),
        loadAdminModule(tAdmin("navigation.finance.label"), () => getJson<AdminPaymentMethodsResponse>("/api/admin/payment-methods"), (paymentMethodsResponse) => {
          setPaymentMethods(paymentMethodsResponse.methods);
        }, failedModules),
        loadAdminModule(tAdmin("navigation.finance.label"), () => getJson<AdminWalletsResponse>("/api/admin/wallets"), (walletsResponse) => {
          setAdminWallets(walletsResponse.wallets);
        }, failedModules),
        loadAdminModule(tAdmin("navigation.finance.label"), () => getJson<AdminWalletTransactionsResponse>("/api/admin/wallet-transactions"), (walletTransactionsResponse) => {
          setWalletTransactions(walletTransactionsResponse.transactions);
        }, failedModules),
        loadAdminModule(tAdmin("navigation.finance.label"), () => getJson<AdminRechargeOrdersResponse>("/api/admin/recharge-orders"), (rechargeOrdersResponse) => {
          setRechargeOrders(rechargeOrdersResponse.orders);
        }, failedModules),
        loadAdminModule(tAdmin("navigation.finance.label"), () => getJson<AdminBillingSettingsResponse>("/api/admin/billing-settings"), (billingSettingsResponse) => {
          setBillingSettings(billingSettingsResponse.settings);
        }, failedModules),
        loadAdminModule(tAdmin("navigation.content.label"), () => getJson<AdminContentSummaryResponse>("/api/admin/content/summary"), (contentSummaryResponse) => {
          setContentSummary(contentSummaryResponse);
        }, failedModules),
        loadAdminModule(tAdmin("navigation.content.label"), () => getJson<AdminContentProductsResponse>("/api/admin/content/products"), (contentProductsResponse) => {
          setContentProducts(contentProductsResponse.products);
        }, failedModules),
        loadAdminModule(tAdmin("navigation.content.label"), () => getJson<AdminContentVideoJobsResponse>("/api/admin/content/video-jobs"), (contentVideoJobsResponse) => {
          setContentVideoJobs(contentVideoJobsResponse.videoJobs);
        }, failedModules),
        loadAdminModule(tAdmin("navigation.traffic.label"), () => getJson<AdminTrafficOverviewResponse>("/api/admin/traffic/overview"), (trafficResponse) => {
          setTrafficOverview(trafficResponse);
        }, failedModules),
        loadAdminModule(tAdmin("navigation.traffic.label"), () => getJson<AdminTrafficSourcesResponse>("/api/admin/traffic/sources"), (trafficResponse) => {
          setTrafficSources(trafficResponse);
        }, failedModules),
        loadAdminModule(tAdmin("navigation.traffic.label"), () => getJson<AdminTrafficPagesResponse>("/api/admin/traffic/pages"), (trafficResponse) => {
          setTrafficPages(trafficResponse);
        }, failedModules),
        loadAdminModule(tAdmin("navigation.traffic.label"), () => getJson<AdminTrafficIndexingResponse>("/api/admin/traffic/indexing"), (trafficResponse) => {
          setTrafficIndexing(trafficResponse);
        }, failedModules),
        loadAdminModule(tAdmin("navigation.traffic.label"), () => getJson<AdminTrafficSearchResponse>("/api/admin/traffic/search"), (trafficResponse) => {
          setTrafficSearch(trafficResponse);
        }, failedModules),
        loadAdminModule(tAdmin("navigation.traffic.label"), () => getJson<AdminTrafficSettingsResponse>("/api/admin/traffic/settings"), (trafficResponse) => {
          setTrafficSettings(trafficResponse);
        }, failedModules),
        loadAdminModule(tAdmin("navigation.traffic.label"), () => getJson<AdminTrafficCloudflareResponse>("/api/admin/traffic/cloudflare"), (trafficResponse) => {
          setTrafficCloudflare(trafficResponse);
        }, failedModules),
        loadAdminModule(tAdmin("navigation.traffic.label"), () => getJson<AdminTrafficGeoSummaryResponse>("/api/admin/traffic/geo-summary"), (trafficResponse) => {
          setTrafficGeoSummary(trafficResponse);
        }, failedModules),
        loadAdminModule(tAdmin("navigation.modelPricing.label"), () => getJson<AdminModelPricingCatalogResponse>("/api/admin/model-pricing-catalog"), (modelPricingCatalogResponse) => {
          setModelPricingCatalog(modelPricingCatalogResponse);
        }, failedModules),
        loadAdminModule(tAdmin("navigation.siteSettings.label"), () => getJson<AdminSiteSettingsResponse>("/api/admin/site-settings"), (siteSettingsResponse) => {
          setSiteSettings(siteSettingsResponse);
        }, failedModules)
      ]);
      if (failedModules.length > 0) {
        setStatus(tAdmin("status.partialLoadFailed", { modules: Array.from(new Set(failedModules)).join(tAdmin("status.moduleSeparator")) }));
      } else {
        setStatus("");
      }
    } catch (error) {
      if (error instanceof HttpError && error.status === 403) {
        setForbidden(true);
        setStatus("");
      } else if (error instanceof HttpError && error.status === 401) {
        // Session expiry is confirmed centrally before changing auth state.
        return;
      } else {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setBusy(false);
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const nextSession = await postJson<AuthEntryResponse>("/api/auth/enter", {
        email: email.trim() || undefined,
        password
      });
      if (nextSession.verificationRequired) {
        setAuthMode("verify-email");
        setEmail(nextSession.email ?? email.trim());
        setOtp("");
        setOtpCooldownSeconds(authOtpCooldownDurationSeconds);
        return;
      }
      setSession(nextSession);
      setEmail("");
      setPassword("");
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function expireAdminSession() {
    setSession({ authEnabled: true, authenticated: false });
    setForbidden(false);
    setStatus(tAdmin("status.authExpired"));
  }

  async function verifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const nextSession = await postJson<AuthSession>("/api/auth/verify-email", {
        email: email.trim() || undefined,
        otp: otp.trim()
      });
      setSession(nextSession);
      setAuthMode("entry");
      setEmail("");
      setPassword("");
      setOtp("");
      setOtpCooldownSeconds(0);
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function resendVerificationCode() {
    if (otpCooldownSeconds > 0) return;
    setBusy(true);
    setStatus("");
    try {
      const nextSession = await postJson<AuthEntryResponse>("/api/auth/enter", {
        email: email.trim() || undefined,
        password
      });
      if (nextSession.verificationRequired) {
        setOtpCooldownSeconds(authOtpCooldownDurationSeconds);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      const nextSession = await postJson<AuthSession>("/api/auth/logout", {});
      setSession(nextSession);
      setOverview(undefined);
      setForbidden(false);
      setEmail("");
      setPassword("");
      setOtp("");
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function updatePlatformDraft(providerId: ModelConfigProviderId, patch: Partial<ModelConfigDraft>) {
    setPlatformDrafts((current) => {
      return {
        ...current,
        [providerId]: {
          ...current[providerId],
          ...patch
        }
      };
    });
  }

  function applyPlatformPreset(providerId: ModelConfigProviderId, preset: ModelConfigDraft) {
    updatePlatformDraft(providerId, {
      ...preset,
      configId: platformDrafts[providerId]?.configId,
      apiKey: "",
      keyPreview: platformDrafts[providerId]?.keyPreview,
      enabled: platformDrafts[providerId]?.enabled ?? preset.enabled
    });
  }

  function addPlatformModelService(providerId: ModelConfigProviderId) {
    updatePlatformDraft(providerId, resetModelConfigDraft(providerId));
    setEditingPlatformProviderId(providerId);
  }

  function editPlatformModelService(providerId: ModelConfigProviderId, model: ProviderConfigItem, models: ProviderConfigItem[]) {
    updatePlatformDraft(providerId, draftFromProviderConfig(providerId, model, models));
    setEditingPlatformProviderId(providerId);
  }

  async function savePlatformModelConfig(providerId: ModelConfigProviderId, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft = platformDrafts[providerId];
    if (!draft) {
      setStatus(tAdmin("status.noPlatformConfig"));
      return;
    }
    if (!draft.apiKey.trim() && !draft.configId) {
      setStatus(tAdmin("status.platformKeyRequired"));
      return;
    }
    if (draft.models.length === 0) {
      setStatus(tAdmin("status.modelVersionRequired"));
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      await putJson(modelServicesEndpoint(providerId), {
        configId: draft.configId,
        apiKey: draft.apiKey.trim() || undefined,
        name: draft.name.trim(),
        vendor: draft.vendor.trim(),
        baseUrl: draft.baseUrl.trim(),
        model: draft.models,
        apiMode: apiModeForProviderDraft(providerId, draft),
        enabled: draft.enabled
      });
      await refreshOverview();
      setEditingPlatformProviderId(undefined);
      setStatus(tAdmin("status.platformSaved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function togglePlatformModelConfigEnabled(providerId: ModelConfigProviderId, service: ProviderConfigServiceItem, enabled: boolean) {
    setBusy(true);
    setStatus("");
    try {
      await putJson(modelServicesEndpoint(providerId), {
        configId: service.configId,
        name: service.label || service.serviceLabel,
        vendor: service.providerLabel,
        baseUrl: service.baseUrl,
        model: service.models.map((model) => model.model).filter(Boolean),
        apiMode: service.apiMode,
        enabled
      });
      await refreshOverview();
      setStatus(enabled ? tAdmin("status.platformEnabled") : tAdmin("status.platformDisabled"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function clearPlatformModelConfig(providerId: ModelConfigProviderId, configIds?: string[]) {
    setBusy(true);
    setStatus("");
    try {
      const suffix = modelConfigDeleteQuery(configIds);
      const response = await fetch(`${modelServicesEndpoint(providerId)}${suffix}`, {
        method: "DELETE"
      });
      await readJsonResponse<{ provider: Pick<ProviderConfigItem, "id" | "configId" | "configured" | "keySource" | "keyPreview"> }>(response, `${modelServicesEndpoint(providerId)}${suffix}`);
      await refreshOverview();
      setStatus(tAdmin("status.platformDeleted"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function revealPlatformModelConfigApiKey(providerId: ModelConfigProviderId, configId: string) {
    const response = await getJson<ModelConfigKeyRevealResponse>(
      `${modelServicesEndpoint(providerId)}/key?configId=${encodeURIComponent(configId)}`
    );
    updatePlatformDraft(providerId, {
      keyPreview: response.keyPreview
    });
    return response.apiKey;
  }

  async function togglePaymentMethodEnabled(methodId: PaymentMethodView["id"], enabled: boolean) {
    setBusy(true);
    setStatus("");
    try {
      const response = await putJson<AdminPaymentMethodsResponse>("/api/admin/payment-methods", {
        methods: paymentMethods.map((method) => ({
          id: method.id,
          enabled: method.id === methodId ? enabled : method.enabled
        }))
      });
      setPaymentMethods(response.methods);
      setStatus(enabled ? tAdmin("status.paymentEnabled") : tAdmin("status.paymentDisabled"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitWalletAdjustment(input: { workspaceId: string; amountCny: number; reason: string }) {
    setBusy(true);
    setStatus("");
    try {
      await postJson<AdminWalletAdjustmentResponse>("/api/admin/wallet-adjustments", input);
      const [walletsResponse, walletTransactionsResponse] = await Promise.all([
        getJson<AdminWalletsResponse>("/api/admin/wallets"),
        getJson<AdminWalletTransactionsResponse>("/api/admin/wallet-transactions")
      ]);
      setAdminWallets(walletsResponse.wallets);
      setWalletTransactions(walletTransactionsResponse.transactions);
      setStatus(tAdmin("status.walletAdjusted"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveBillingSettings(rules: Array<Pick<BillingPriceRuleView, "usageKind" | "serviceFeeCny" | "enabled">>) {
    setBusy(true);
    setStatus("");
    try {
      const response = await putJson<AdminBillingSettingsResponse>("/api/admin/billing-settings", {
        rules
      });
      setBillingSettings(response.settings);
      setStatus(tAdmin("status.billingSettingsSaved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveModelPricingDraft(input: { version: string; entries: AdminModelPricingEntry[] }) {
    setBusy(true);
    setStatus("");
    try {
      const response = await putJson<AdminModelPricingDraftResponse>("/api/admin/model-pricing-catalog/draft", input);
      setStatus(tAdmin("status.modelPricingDraftSaved", { version: response.draft.version }));
      return response.draft.id;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function publishModelPricingDraft(draftId: string) {
    setBusy(true);
    setStatus("");
    try {
      const response = await postJson<AdminModelPricingCatalogResponse>("/api/admin/model-pricing-catalog/publish", { draftId });
      setModelPricingCatalog(response);
      const siteSettingsResponse = await getJson<AdminSiteSettingsResponse>("/api/admin/site-settings");
      setSiteSettings(siteSettingsResponse);
      setStatus(tAdmin("status.modelPricingPublished", { version: response.active.version }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function syncTrafficData() {
    setBusy(true);
    setStatus("");
    try {
      const response = await postJson<AdminTrafficActionResponse>("/api/admin/traffic/sync", {});
      setStatus(tAdmin("traffic.actions.syncResult", { status: response.status }));
      await refreshOverview();
      return response;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function submitIndexNowUrls(urls: string[]) {
    setBusy(true);
    setStatus("");
    try {
      const response = await postJson<AdminTrafficActionResponse>("/api/admin/traffic/indexnow/submit", { urls });
      setStatus(tAdmin("traffic.actions.indexNowResult", { status: response.statusCode ?? response.status }));
      await refreshOverview();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  if (session && !session.authenticated) {
    return (
      <AdminLoginScreen
        mode={authMode}
        setMode={setAuthMode}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        otp={otp}
        setOtp={setOtp}
        status={status}
        isBusy={busy}
        authOtpCooldownSeconds={otpCooldownSeconds}
        onLogin={login}
        onVerifyEmail={verifyEmail}
        onResendVerificationCode={resendVerificationCode}
      />
    );
  }

  if (forbidden) {
    return <AdminForbidden email={session?.user?.email} isBusy={busy} onLogout={() => void logout()} />;
  }

  return (
    <AdminDashboard
      checkingSession={!session}
      email={session?.user?.email}
      overview={overview}
      status={status}
      isBusy={busy}
      onRefresh={() => void refreshOverview()}
      onLogout={() => void logout()}
      platformConfig={platformConfig}
      platformDrafts={platformDrafts}
      onPlatformDraftChange={updatePlatformDraft}
      onPlatformPresetApply={applyPlatformPreset}
      onAddPlatformModelService={addPlatformModelService}
      onEditPlatformModelService={editPlatformModelService}
      onSavePlatformModelConfig={savePlatformModelConfig}
      onClearPlatformModelConfig={clearPlatformModelConfig}
      onTogglePlatformModelConfigEnabled={togglePlatformModelConfigEnabled}
      onRevealPlatformModelConfigKey={revealPlatformModelConfigApiKey}
      editingPlatformProviderId={editingPlatformProviderId}
      platformTestStatus={platformTestStatus}
      onClosePlatformModelDialog={() => setEditingPlatformProviderId(undefined)}
      paymentMethods={paymentMethods}
      billingSettings={billingSettings}
      adminWallets={adminWallets}
      walletTransactions={walletTransactions}
      rechargeOrders={rechargeOrders}
      contentSummary={contentSummary}
      contentProducts={contentProducts}
      contentVideoJobs={contentVideoJobs}
      trafficOverview={trafficOverview}
      trafficSources={trafficSources}
      trafficPages={trafficPages}
      trafficIndexing={trafficIndexing}
      trafficSettings={trafficSettings}
      trafficSearch={trafficSearch}
      trafficCloudflare={trafficCloudflare}
      trafficGeoSummary={trafficGeoSummary}
      modelPricingCatalog={modelPricingCatalog}
      siteSettings={siteSettings}
      onTogglePaymentMethodEnabled={togglePaymentMethodEnabled}
      onSubmitWalletAdjustment={submitWalletAdjustment}
      onSaveBillingSettings={saveBillingSettings}
      onSaveModelPricingDraft={saveModelPricingDraft}
      onPublishModelPricingDraft={publishModelPricingDraft}
      onSyncTrafficData={syncTrafficData}
      onSubmitIndexNowUrls={submitIndexNowUrls}
    />
  );
}

function AdminLoginScreen({
  authOtpCooldownSeconds,
  email,
  isBusy,
  mode,
  onLogin,
  onResendVerificationCode,
  onVerifyEmail,
  otp,
  password,
  setEmail,
  setMode,
  setOtp,
  setPassword,
  status
}: {
  authOtpCooldownSeconds: number;
  email: string;
  isBusy: boolean;
  mode: AuthFlowMode;
  onLogin: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onResendVerificationCode: () => Promise<void>;
  onVerifyEmail: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  otp: string;
  password: string;
  setEmail: (value: string) => void;
  setMode: (value: AuthFlowMode) => void;
  setOtp: (value: string) => void;
  setPassword: (value: string) => void;
  status: string;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--bg)] px-4 py-8 text-[var(--text)]">
      <Card className="w-full max-w-[420px] bg-[var(--panel)] p-5 shadow-[0_22px_60px_rgba(96,64,43,.14)]">
        <div className="mb-5 flex items-center gap-3">
          <img src={brandLogoUrl} alt="Haitu" className="h-11 w-11 rounded-[10px]" />
          <div className="min-w-0">
            <h1 className="m-0 text-xl font-black leading-tight">Haitu Admin</h1>
            <p className="m-0 mt-1 text-xs font-semibold text-[var(--muted)]">{tAdmin("auth.subtitle")}</p>
          </div>
        </div>

        {mode === "entry" ? (
          <form className="grid gap-4" onSubmit={onLogin}>
            <Field label={tAdmin("auth.email")}>
              <Input
                autoFocus
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={tAdmin("auth.emailPlaceholder")}
              />
            </Field>
            <Field label={tAdmin("auth.password")}>
              <Input
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={tAdmin("auth.passwordPlaceholder")}
              />
            </Field>
            <Button variant="primary" type="submit" disabled={isBusy || !email.trim() || !password.trim()}>
              <KeyRound size={15} />
              {tAdmin("auth.enterAdmin")}
            </Button>
            <AdminStatus status={status} />
          </form>
        ) : null}

        {mode === "verify-email" ? (
          <form className="grid gap-4" onSubmit={onVerifyEmail}>
            <Field label={tAdmin("auth.email")}>
              <Input
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field label={tAdmin("auth.otp")}>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <Input
                  autoFocus
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  placeholder={tAdmin("auth.otpPlaceholder")}
                />
                <Button
                  variant="soft"
                  type="button"
                  className="min-w-[132px] px-3"
                  disabled={isBusy || !email.trim() || !password.trim() || authOtpCooldownSeconds > 0}
                  onClick={() => void onResendVerificationCode()}
                >
                  <RefreshCcw size={15} />
                  {authOtpCooldownSeconds > 0 ? tAdmin("auth.cooldown", { seconds: authOtpCooldownSeconds }) : tAdmin("auth.resendOtp")}
                </Button>
              </div>
            </Field>
            <Button variant="primary" type="submit" disabled={isBusy || !email.trim() || !otp.trim()}>
              <MailCheck size={15} />
              {tAdmin("auth.verifyEmail")}
            </Button>
            <button
              type="button"
              className="justify-self-center text-xs font-black text-[var(--accent)] hover:underline"
              onClick={() => setMode("entry")}
            >
              {tAdmin("auth.backToLogin")}
            </button>
            <AdminStatus status={status} />
          </form>
        ) : null}
      </Card>
    </main>
  );
}

function AdminDashboard({
  checkingSession,
  email,
  editingPlatformProviderId,
  isBusy,
  onAddPlatformModelService,
  onClearPlatformModelConfig,
  onTogglePlatformModelConfigEnabled,
  onClosePlatformModelDialog,
  onEditPlatformModelService,
  onLogout,
  onPlatformDraftChange,
  onPlatformPresetApply,
  onRevealPlatformModelConfigKey,
  onRefresh,
  onSavePlatformModelConfig,
  onSaveBillingSettings,
  onSaveModelPricingDraft,
  onPublishModelPricingDraft,
  onSyncTrafficData,
  onSubmitIndexNowUrls,
  onSubmitWalletAdjustment,
  onTogglePaymentMethodEnabled,
  overview,
  adminWallets,
  walletTransactions,
  rechargeOrders,
  billingSettings,
  contentSummary,
  contentProducts,
  contentVideoJobs,
  trafficOverview,
  trafficSources,
  trafficPages,
  trafficIndexing,
  trafficSettings,
  trafficSearch,
  trafficCloudflare,
  trafficGeoSummary,
  modelPricingCatalog,
  siteSettings,
  paymentMethods,
  platformConfig,
  platformDrafts,
  platformTestStatus,
  status
}: {
  checkingSession: boolean;
  email?: string;
  editingPlatformProviderId?: ModelConfigProviderId;
  isBusy: boolean;
  onLogout: () => void;
  onPlatformDraftChange: (providerId: ModelConfigProviderId, patch: Partial<ModelConfigDraft>) => void;
  onPlatformPresetApply: (providerId: ModelConfigProviderId, preset: ModelConfigDraft) => void;
  onAddPlatformModelService: (providerId: ModelConfigProviderId) => void;
  onEditPlatformModelService: (providerId: ModelConfigProviderId, model: ProviderConfigItem, models: ProviderConfigItem[]) => void;
  onClearPlatformModelConfig: (providerId: ModelConfigProviderId, configIds?: string[]) => Promise<void>;
  onTogglePlatformModelConfigEnabled: (providerId: ModelConfigProviderId, service: ProviderConfigServiceItem, enabled: boolean) => Promise<void>;
  onRevealPlatformModelConfigKey: (providerId: ModelConfigProviderId, configId: string) => Promise<string>;
  onClosePlatformModelDialog: () => void;
  onRefresh: () => void;
  onSavePlatformModelConfig: (providerId: ModelConfigProviderId, event: FormEvent<HTMLFormElement>) => Promise<void>;
  onTogglePaymentMethodEnabled: (methodId: PaymentMethodView["id"], enabled: boolean) => Promise<void>;
  onSubmitWalletAdjustment: (input: { workspaceId: string; amountCny: number; reason: string }) => Promise<void>;
  onSaveBillingSettings: (rules: Array<Pick<BillingPriceRuleView, "usageKind" | "serviceFeeCny" | "enabled">>) => Promise<void>;
  onSaveModelPricingDraft: (input: { version: string; entries: AdminModelPricingEntry[] }) => Promise<string | undefined>;
  onPublishModelPricingDraft: (draftId: string) => Promise<void>;
  onSyncTrafficData: () => Promise<AdminTrafficActionResponse | undefined>;
  onSubmitIndexNowUrls: (urls: string[]) => Promise<void>;
  overview?: AdminOverview;
  adminWallets: AdminWalletSummary[];
  walletTransactions: AdminWalletTransactionView[];
  rechargeOrders: AdminRechargeOrderView[];
  billingSettings?: BillingSettingsView;
  contentSummary?: AdminContentSummaryResponse;
  contentProducts: AdminContentProductView[];
  contentVideoJobs: AdminContentVideoJobView[];
  trafficOverview?: AdminTrafficOverviewResponse;
  trafficSources?: AdminTrafficSourcesResponse;
  trafficPages?: AdminTrafficPagesResponse;
  trafficIndexing?: AdminTrafficIndexingResponse;
  trafficSettings?: AdminTrafficSettingsResponse;
  trafficSearch?: AdminTrafficSearchResponse;
  trafficCloudflare?: AdminTrafficCloudflareResponse;
  trafficGeoSummary?: AdminTrafficGeoSummaryResponse;
  modelPricingCatalog?: AdminModelPricingCatalogResponse;
  siteSettings?: AdminSiteSettingsResponse;
  paymentMethods: PaymentMethodView[];
  platformConfig: ProviderConfigLedger;
  platformDrafts: Record<ModelConfigProviderId, ModelConfigDraft>;
  platformTestStatus: Partial<Record<ModelConfigProviderId, ModelConfigTestStatus>>;
  status: string;
}) {
  const adminShellStatus = checkingSession ? tAdmin("shell.checkingSession") : isBusy ? tAdmin("shell.refreshing") : "";
  const growthOption = useMemo(() => buildGrowthOption(overview), [overview]);
  const activityOption = useMemo(() => buildActivityOption(overview), [overview]);
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");
  const [globalSearch, setGlobalSearch] = useState("");
  const [timeRange, setTimeRange] = useState("30d");
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | undefined>();
  const [selectedUserDetail, setSelectedUserDetail] = useState<AdminUserDetail | undefined>();
  const [detailStatus, setDetailStatus] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const activeNavigationItem = adminNavigationItems.find((item) => item.id === activeSection) ?? adminNavigationItems[0];

  async function openUserDetail(user: AdminUserSummary) {
    if (selectedUser?.id === user.id) {
      setSelectedUser(undefined);
      setSelectedUserDetail(undefined);
      setDetailStatus("");
      setDetailLoading(false);
      return;
    }

    setSelectedUser(user);
    setSelectedUserDetail(undefined);
    setDetailStatus("");
    setDetailLoading(true);
    try {
      const detail = await getJson<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(user.id)}`);
      setSelectedUserDetail(detail);
    } catch (error) {
      setDetailStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setDetailLoading(false);
    }
  }

  function prepareUserOperationalFilter(user: AdminUserSummary) {
    setSelectedUser(user);
    setGlobalSearch(user.email);
  }

  function openUserContentView(user: AdminUserSummary) {
    prepareUserOperationalFilter(user);
    setActiveSection("content");
  }

  function openUserFinanceView(user: AdminUserSummary) {
    prepareUserOperationalFilter(user);
    setActiveSection("finance");
  }

  function renderAdminSection() {
    if (!overview) {
      return <AdminDashboardSkeleton checkingSession={checkingSession} />;
    }
    if (activeSection === "overview") {
      return (
        <section className="grid gap-4" aria-label={tAdmin("overview.ariaLabel")}>
          <AdminMetricGrid overview={overview} />
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="bg-[var(--card)]">
              <CardHeader heading={tAdmin("overview.registrationTrend")} icon={<BarChart3 size={16} />} right={<Badge>{tAdmin("overview.days30")}</Badge>} />
              <AdminChart option={growthOption} empty={overview.growth.every((row) => row.registrations === 0)} />
            </Card>
            <Card className="bg-[var(--card)]">
              <CardHeader heading={tAdmin("overview.activityTrend")} icon={<Activity size={16} />} right={<Badge>{tAdmin("overview.days30")}</Badge>} />
              <AdminChart option={activityOption} empty={overview.activity.every((row) => row.events === 0)} />
            </Card>
          </div>
        </section>
      );
    }
    if (activeSection === "users") {
      return (
        <AdminUsersPanel
          globalSearch={globalSearch}
          loading={detailLoading}
          overview={overview}
          rechargeOrders={rechargeOrders}
          selectedUser={selectedUser}
          selectedUserDetail={selectedUserDetail}
          status={detailStatus}
          walletTransactions={walletTransactions}
          wallets={adminWallets}
          onOpenContent={openUserContentView}
          onOpenFinance={openUserFinanceView}
          onSelectUser={(user) => void openUserDetail(user)}
        />
      );
    }
    if (activeSection === "content") {
      return (
        <AdminContentPanel
          globalSearch={globalSearch}
          summary={contentSummary}
          products={contentProducts}
          videoJobs={contentVideoJobs}
        />
      );
    }
    if (activeSection === "traffic") {
      return (
        <AdminTrafficPanel
          indexing={trafficIndexing}
          overview={trafficOverview}
          pages={trafficPages}
          search={trafficSearch}
          settings={trafficSettings}
          sources={trafficSources}
          cloudflare={trafficCloudflare}
          geoSummary={trafficGeoSummary}
          onSubmitIndexNowUrls={onSubmitIndexNowUrls}
          onSyncTrafficData={onSyncTrafficData}
        />
      );
    }
    if (activeSection === "finance") {
      return (
        <AdminFinancePanel
          globalSearch={globalSearch}
          wallets={adminWallets}
          walletTransactions={walletTransactions}
          rechargeOrders={rechargeOrders}
          isBusy={isBusy}
          onSubmitWalletAdjustment={onSubmitWalletAdjustment}
        />
      );
    }
    if (activeSection === "payment-billing") {
      return (
        <AdminPaymentBillingPanel
          billingSettings={billingSettings}
          isBusy={isBusy}
          paymentMethods={paymentMethods}
          onSaveBillingSettings={onSaveBillingSettings}
          onTogglePaymentMethodEnabled={onTogglePaymentMethodEnabled}
        />
      );
    }
    if (activeSection === "model-services") {
      return (
        <section className="grid gap-4" aria-label={tAdmin("modelServices.ariaLabel")}>
          <AdminModelServicesPanel
            config={platformConfig}
            drafts={platformDrafts}
            editingProviderId={editingPlatformProviderId}
            isBusy={isBusy}
            testStatuses={platformTestStatus}
            onAdd={onAddPlatformModelService}
            onApplyPreset={onPlatformPresetApply}
            onClear={onClearPlatformModelConfig}
            onToggleEnabled={onTogglePlatformModelConfigEnabled}
            onCloseDialog={onClosePlatformModelDialog}
            onDraftChange={onPlatformDraftChange}
            onEdit={onEditPlatformModelService}
            onRevealApiKey={onRevealPlatformModelConfigKey}
            onSave={onSavePlatformModelConfig}
          />
        </section>
      );
    }
    if (activeSection === "model-pricing") {
      return (
        <AdminModelPricingPanel
          catalog={modelPricingCatalog}
          isBusy={isBusy}
          onSaveDraft={onSaveModelPricingDraft}
          onPublishDraft={onPublishModelPricingDraft}
        />
      );
    }
    if (activeSection === "site-settings") {
      return <AdminSiteSettingsPanel settings={siteSettings} />;
    }
    return (
      <AdminPlaceholderSection
        icon={<Settings2 size={18} />}
        title={tAdmin("system.title")}
        badge={tAdmin("system.badge")}
        items={adminStringArray("system.items")}
      />
    );
  }

  return (
    <main className="grid h-dvh grid-cols-[280px_minmax(0,1fr)] overflow-hidden bg-[var(--bg)] text-[var(--text)] max-[900px]:grid-cols-1 max-[900px]:grid-rows-[auto_minmax(0,1fr)]">
      <AdminSidebar
        activeSection={activeSection}
        email={email}
        onSectionChange={setActiveSection}
      />
      <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <AdminTopBar
          activeNavigationItem={activeNavigationItem}
          adminShellStatus={adminShellStatus}
          globalSearch={globalSearch}
          isBusy={isBusy}
          timeRange={timeRange}
          onGlobalSearchChange={setGlobalSearch}
          onLogout={onLogout}
          onRefresh={onRefresh}
          onTimeRangeChange={setTimeRange}
        />

        <div className="min-h-0 overflow-y-auto px-4 py-4 min-[1100px]:px-6">
          {status ? <AdminStatus status={status} /> : null}
          {renderAdminSection()}
        </div>
      </section>
    </main>
  );
}

function modelServicesEndpoint(providerId: ModelConfigProviderId): string {
  return modelServiceAdminProviders.find((provider) => provider.providerId === providerId)?.endpoint
    ?? `/api/admin/platform-model-configs/${providerId}`;
}

function AdminTopBar({
  activeNavigationItem,
  adminShellStatus,
  globalSearch,
  isBusy,
  onGlobalSearchChange,
  onLogout,
  onRefresh,
  onTimeRangeChange,
  timeRange
}: {
  activeNavigationItem: (typeof adminNavigationItems)[number];
  adminShellStatus: string;
  globalSearch: string;
  isBusy: boolean;
  onGlobalSearchChange: (value: string) => void;
  onLogout: () => void;
  onRefresh: () => void;
  onTimeRangeChange: (value: string) => void;
  timeRange: string;
}) {
  return (
    <header className="grid min-h-[84px] gap-3 border-b border-[var(--border)] bg-[var(--panel)]/96 px-4 py-3 backdrop-blur min-[900px]:grid-cols-[minmax(0,1fr)_minmax(360px,620px)] min-[900px]:items-center min-[1100px]:px-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="m-0 text-xl font-black leading-tight">{adminLabel(activeNavigationItem)}</h1>
          <Badge tone="ok">{tAdmin("shell.adminBadge")}</Badge>
        </div>
        <p className="m-0 mt-1 truncate text-[12px] font-medium text-[var(--muted)]">{adminDescription(activeNavigationItem)}</p>
      </div>
      <div className="grid gap-2 min-[720px]:grid-cols-[minmax(180px,1fr)_128px_auto_auto]">
        <label className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={15} />
          <Input
            className="pl-9"
            value={globalSearch}
            placeholder={tAdmin("shell.globalSearch")}
            onChange={(event) => onGlobalSearchChange(event.target.value)}
          />
        </label>
        <Select value={timeRange} onChange={(event) => onTimeRangeChange(event.target.value)} aria-label={tAdmin("shell.timeRange")}>
          <option value="24h">{tAdmin("shell.ranges.24h")}</option>
          <option value="7d">{tAdmin("shell.ranges.7d")}</option>
          <option value="30d">{tAdmin("shell.ranges.30d")}</option>
          <option value="all">{tAdmin("shell.ranges.all")}</option>
        </Select>
        <Button onClick={onRefresh} disabled={isBusy}>
          <RefreshCcw className={isBusy ? "animate-spin" : undefined} size={14} />
          {adminShellStatus || tAdmin("shell.refresh")}
        </Button>
        <Button variant="ghost" onClick={onLogout} disabled={isBusy}>
          <LogOut size={14} />
          {tAdmin("shell.logout")}
        </Button>
      </div>
    </header>
  );
}

function AdminSidebar({
  activeSection,
  email,
  onSectionChange
}: {
  activeSection: AdminSection;
  email?: string;
  onSectionChange: (section: AdminSection) => void;
}) {
  return (
    <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] border-r border-[var(--border)] bg-[var(--panel)] max-[900px]:grid-rows-none max-[900px]:border-b max-[900px]:border-r-0">
      <div className="flex min-w-0 items-center gap-3 border-b border-[var(--border)] px-4 py-4 max-[900px]:border-b-0">
        <img src={brandLogoUrl} alt="Haitu" className="h-9 w-9 rounded-[8px]" />
        <div className="min-w-0">
          <div className="truncate text-[16px] font-black leading-tight">{tAdmin("shell.title")}</div>
          <div className="mt-0.5 truncate text-[11px] font-semibold text-[var(--muted)]">{email ?? "admin"}</div>
        </div>
      </div>
      <nav className="min-h-0 overflow-y-auto px-3 py-3 max-[900px]:overflow-x-auto max-[900px]:overflow-y-hidden max-[900px]:px-4 max-[900px]:pt-0" aria-label={tAdmin("shell.navigationLabel")}>
        <div className="grid gap-4 max-[900px]:flex max-[900px]:min-w-max">
          {adminNavigationGroups.map((group) => (
            <div key={group.id} className="grid gap-1.5 max-[900px]:min-w-[170px]">
              <div className="px-2 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)]">{tAdmin(group.labelKey)}</div>
              {adminNavigationItems.filter((item) => item.group === group.id).map((item) => {
                const Icon = item.icon;
                const active = item.id === activeSection;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "grid min-h-[56px] grid-cols-[30px_minmax(0,1fr)] items-center gap-2 rounded-lg border px-2.5 text-left transition",
                      active
                        ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--field))] text-[var(--text)] shadow-[inset_3px_0_0_var(--accent)]"
                        : "border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--field)]",
                      "max-[900px]:grid-cols-[22px_minmax(0,1fr)] max-[900px]:shadow-none"
                    )}
                    aria-current={active ? "page" : undefined}
                    onClick={() => onSectionChange(item.id)}
                  >
                    <span className={cn("grid h-7 w-7 place-items-center rounded-[8px]", active ? "bg-[var(--accent)] text-white" : "bg-[var(--panel2)] text-[var(--accent)]")}>
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-black">{adminLabel(item)}</span>
                      <span className="mt-0.5 block truncate text-[10px] font-semibold opacity-80">{adminDescription(item)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </nav>
      <div className="grid gap-2 border-t border-[var(--border)] px-4 py-3 max-[900px]:hidden">
        <div className="text-[11px] font-semibold leading-5 text-[var(--muted)]">
          {tAdmin("shell.keyHint")}
        </div>
        <AdminLanguageSwitcher />
      </div>
    </aside>
  );
}

function AdminLanguageSwitcher() {
  const initialLocale = supportedLocales.includes(i18n.language as AppLocale) ? i18n.language as AppLocale : "zh";
  const [open, setOpen] = useState(false);
  const [currentLocale, setCurrentLocale] = useState<AppLocale>(initialLocale);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function syncLanguage(locale: string) {
      if (supportedLocales.includes(locale as AppLocale)) {
        setCurrentLocale(locale as AppLocale);
      }
    }

    i18n.on("languageChanged", syncLanguage);
    return () => {
      i18n.off("languageChanged", syncLanguage);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function selectLocale(locale: AppLocale) {
    setCurrentLocale(locale);
    window.localStorage.setItem(clientLocaleStorageKey, locale);
    void i18n.changeLanguage(locale);
    setOpen(false);
  }

  const languageChangeLabel = i18n.t("common:language.change", { lng: currentLocale });

  return (
    <div ref={menuRef} className="app-language-switcher relative z-40 min-w-0">
      <button
        type="button"
        aria-label={languageChangeLabel}
        aria-expanded={open}
        title={languageChangeLabel}
        className={cn(
          "grid min-h-9 w-full min-w-0 grid-cols-[26px_minmax(0,1fr)] items-center gap-2 rounded-[8px] border border-[var(--border-strong)] bg-[var(--field)] px-2 text-left text-xs font-black text-[var(--accent2)] shadow-[0_8px_18px_rgba(96,64,43,.08)] transition hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--border-strong))] hover:bg-[color-mix(in_srgb,var(--accent)_7%,var(--field))] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(10,163,148,.18)]",
          open && "border-[color-mix(in_srgb,var(--accent)_55%,var(--border-strong))] bg-[color-mix(in_srgb,var(--accent)_9%,var(--field))] text-[var(--accent)]"
        )}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_9%,var(--field))]">
          <Globe2 size={17} strokeWidth={2.1} />
        </span>
        <span className="min-w-0 truncate">{getLocaleMeta(currentLocale).label}</span>
      </button>

      {open ? (
        <div className="app-language-menu absolute bottom-[calc(100%+8px)] left-0 top-auto z-50 grid min-w-[136px] gap-1 rounded-[8px] border border-[var(--border-strong)] bg-[var(--panel)] p-1.5 shadow-[0_18px_46px_rgba(96,64,43,.16)]">
          {supportedLocales.map((locale) => (
            <button
              key={locale}
              type="button"
              aria-current={locale === currentLocale ? "true" : undefined}
              className={cn(
                "grid min-h-8 grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-[7px] px-2 text-left text-[12px] font-black transition",
                locale === currentLocale
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:bg-[var(--panel2)] hover:text-[var(--text)]"
              )}
              onClick={() => selectLocale(locale)}
            >
              <span className="grid h-[18px] w-[18px] place-items-center rounded-full border border-current/25 text-[10px]">
                {locale.toUpperCase()}
              </span>
              <span className="truncate">{getLocaleMeta(locale).label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AdminModelServicesPanel({
  config,
  drafts,
  editingProviderId,
  isBusy,
  testStatuses,
  onAdd,
  onApplyPreset,
  onClear,
  onToggleEnabled,
  onCloseDialog,
  onDraftChange,
  onEdit,
  onRevealApiKey,
  onSave
}: {
  config: ProviderConfigLedger;
  drafts: Record<ModelConfigProviderId, ModelConfigDraft>;
  editingProviderId?: ModelConfigProviderId;
  isBusy: boolean;
  testStatuses: Partial<Record<ModelConfigProviderId, ModelConfigTestStatus>>;
  onAdd: (providerId: ModelConfigProviderId) => void;
  onApplyPreset: (providerId: ModelConfigProviderId, preset: ModelConfigDraft) => void;
  onClear: (providerId: ModelConfigProviderId, configIds?: string[]) => Promise<void>;
  onToggleEnabled: (providerId: ModelConfigProviderId, service: ProviderConfigServiceItem, enabled: boolean) => Promise<void>;
  onCloseDialog: () => void;
  onDraftChange: (providerId: ModelConfigProviderId, patch: Partial<ModelConfigDraft>) => void;
  onEdit: (providerId: ModelConfigProviderId, model: ProviderConfigItem, models: ProviderConfigItem[]) => void;
  onRevealApiKey: (providerId: ModelConfigProviderId, configId: string) => Promise<string>;
  onSave: (providerId: ModelConfigProviderId, event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const groups: ModelServiceGroup[] = modelServiceAdminProviders.map((provider) => ({
    kind: provider.providerId === "openai-compatible-text" ? "text" : provider.providerId === "openai-compatible-image" ? "image" : "video",
    title: modelServicesGroupTitle(provider.groupKey),
    description: modelServicesGroupDescription(provider.groupKey),
    models: modelServicesForProvider(config, provider.providerId),
    providerId: provider.providerId,
    badge: modelServicesGroupBadge(provider.groupKey)
  }));
  const editingGroup = groups.find((group) => group.providerId === editingProviderId);
  const configuredCount = groups.reduce(
    (total, group) => total + groupConfiguredModelServices(group.providerId, group.models.filter((model) => model.configured)).length,
    0
  );
  return (
    <Card className="bg-[var(--card)]">
      <CardHeader
        heading={tAdmin("modelServices.title")}
        icon={<KeyRound size={16} />}
        right={<Badge tone={configuredCount > 0 ? "ok" : "neutral"}>{tAdmin("modelServices.configuredCount", { count: configuredCount })}</Badge>}
      />
      <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-2 text-[12px] font-semibold leading-5 text-[var(--muted)]">
        {tAdmin("modelServices.hint")}
      </div>
      <div className="grid gap-3">
        {groups.map((group) => (
          <SharedModelServiceGroup
            key={group.providerId}
            title={group.title}
            badge={group.badge}
            description={group.description}
            providerId={group.providerId}
            models={group.models}
            apiOwner="platform"
            keyBadgeLabel={tAdmin("modelServices.keyBadge")}
            addButtonLabel={(badge) => tAdmin("modelServices.addService", { badge })}
            emptyText={tAdmin("modelServices.empty")}
            canManageServices
            isBusy={isBusy}
            onAdd={() => onAdd(group.providerId)}
            onEdit={(model) => onEdit(group.providerId, model, group.models)}
            onClear={onClear}
            onToggleEnabled={onToggleEnabled}
          />
        ))}
      </div>
      {editingGroup ? (
        <SharedModelConfigDialog
          title={tAdmin("modelServices.dialogTitle", { badge: editingGroup.badge })}
          badge={editingGroup.badge}
          providerId={editingGroup.providerId}
          draft={drafts[editingGroup.providerId]}
          testStatus={testStatuses[editingGroup.providerId]}
          presets={modelConfigPresets[editingGroup.providerId]}
          apiKeyLabel={tAdmin("modelServices.apiKeyLabel")}
          onDraftChange={onDraftChange}
          onApplyPreset={onApplyPreset}
          onClose={onCloseDialog}
          onRevealApiKey={onRevealApiKey}
          onSave={onSave}
          isBusy={isBusy}
        />
      ) : null}
    </Card>
  );
}

function modelServicesGroupTitle(groupKey: "text" | "image" | "video"): string {
  if (groupKey === "text") return tAdmin("modelServices.groups.text.title");
  if (groupKey === "image") return tAdmin("modelServices.groups.image.title");
  return tAdmin("modelServices.groups.video.title");
}

function modelServicesGroupDescription(groupKey: "text" | "image" | "video"): string {
  if (groupKey === "text") return tAdmin("modelServices.groups.text.description");
  if (groupKey === "image") return tAdmin("modelServices.groups.image.description");
  return tAdmin("modelServices.groups.video.description");
}

function modelServicesGroupBadge(groupKey: "text" | "image" | "video"): string {
  if (groupKey === "text") return tAdmin("modelServices.groups.text.badge");
  if (groupKey === "image") return tAdmin("modelServices.groups.image.badge");
  return tAdmin("modelServices.groups.video.badge");
}

function AdminContentPanel({
  globalSearch,
  products,
  summary,
  videoJobs
}: {
  globalSearch: string;
  products: AdminContentProductView[];
  summary?: AdminContentSummaryResponse;
  videoJobs: AdminContentVideoJobView[];
}) {
  const [activeContentView, setActiveContentView] = useState<AdminContentView>("videoJobs");
  const visibleProducts = filterAdminContentProducts(products, globalSearch);
  const visibleVideoJobs = filterAdminContentVideoJobs(videoJobs, globalSearch);
  const isProductsView = activeContentView === "products";
  return (
    <AdminWorkbench
      summary={(
        <AdminSummaryStrip
          items={[
            { label: tAdmin("content.totalProducts"), value: summary?.metrics.totalProducts ?? 0, hint: tAdmin("content.productHint") },
            { label: tAdmin("content.totalVideoJobs"), value: summary?.metrics.totalVideoJobs ?? 0, hint: tAdmin("content.completedFailed", { completed: summary?.metrics.completedVideoJobs ?? 0, failed: summary?.metrics.failedVideoJobs ?? 0 }) },
            { label: tAdmin("content.totalAssets"), value: summary?.metrics.totalVideoAssets ?? 0, hint: tAdmin("content.assetHint") },
            { label: tAdmin("content.totalStoryboards"), value: summary?.metrics.totalStoryboards ?? 0, hint: tAdmin("content.storyboardHint") }
          ]}
        />
      )}
    >
      <AdminDataPanel
        title={isProductsView ? tAdmin("content.products") : tAdmin("content.videoJobs")}
        icon={isProductsView ? <Package size={16} /> : <Video size={16} />}
        right={(
          <AdminSegmentedControl<AdminContentView>
            value={activeContentView}
            onChange={setActiveContentView}
            options={[
              { value: "videoJobs", label: tAdmin("content.videoJobs"), count: visibleVideoJobs.length },
              { value: "products", label: tAdmin("content.products"), count: visibleProducts.length }
            ]}
          />
        )}
      >
        <AdminContentSignalStrip summary={summary} activeView={activeContentView} />
        {isProductsView ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-xs">
                <thead className="bg-[var(--panel2)] text-[var(--muted)]">
                  <tr>
                    <AdminTh>{tAdmin("content.productTable.product")}</AdminTh>
                    <AdminTh>{tAdmin("content.productTable.workspace")}</AdminTh>
                    <AdminTh>{tAdmin("content.productTable.jobs")}</AdminTh>
                    <AdminTh>{tAdmin("content.productTable.assets")}</AdminTh>
                    <AdminTh>{tAdmin("content.productTable.updatedAt")}</AdminTh>
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map((product) => (
                    <tr key={product.id} className="bg-[var(--card)]">
                      <AdminTd>
                        <div className="font-black text-[var(--text)]">{product.sku}</div>
                        <div className="mt-0.5 text-[11px] text-[var(--muted)]">{product.title ?? "-"}</div>
                      </AdminTd>
                      <AdminTd>
                        <div className="font-black text-[var(--text)]">{adminBusinessSpaceName(product.workspaceName)}</div>
                        <div className="mt-0.5 text-[11px] text-[var(--muted)]">{product.ownerEmail ?? product.workspaceId}</div>
                      </AdminTd>
                      <AdminTd>{formatNumber(product.videoJobCount)}</AdminTd>
                      <AdminTd>{formatNumber(product.assetCount)}</AdminTd>
                      <AdminTd>{formatDateTime(product.updatedAt)}</AdminTd>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visibleProducts.length === 0 ? <div className="p-4"><EmptyAdminDetail text={tAdmin("content.emptyProducts")} /></div> : null}
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left text-xs">
              <thead className="bg-[var(--panel2)] text-[var(--muted)]">
                <tr>
                  <AdminTh>{tAdmin("content.jobTable.job")}</AdminTh>
                  <AdminTh>{tAdmin("content.jobTable.workspace")}</AdminTh>
                  <AdminTh>{tAdmin("content.jobTable.status")}</AdminTh>
                  <AdminTh>{tAdmin("content.jobTable.model")}</AdminTh>
                  <AdminTh>{tAdmin("content.jobTable.assets")}</AdminTh>
                  <AdminTh>{tAdmin("content.jobTable.createdAt")}</AdminTh>
                </tr>
              </thead>
              <tbody>
                {visibleVideoJobs.map((job) => (
                  <tr key={job.id} className="bg-[var(--card)]">
                    <AdminTd>
                      <div className="font-black text-[var(--text)]">{job.productSku ?? job.id}</div>
                      <div className="mt-0.5 text-[11px] text-[var(--muted)]">{job.productTitle ?? job.jobDir}</div>
                    </AdminTd>
                    <AdminTd>
                      <div className="font-black text-[var(--text)]">{adminBusinessSpaceName(job.workspaceName)}</div>
                      <div className="mt-0.5 text-[11px] text-[var(--muted)]">{job.ownerEmail ?? job.workspaceId}</div>
                    </AdminTd>
                    <AdminTd><Badge tone={adminJobStatusTone(job.status)}>{adminJobStatusLabel(job.status)}</Badge></AdminTd>
                    <AdminTd>{job.model ?? "-"}</AdminTd>
                    <AdminTd>{formatNumber(job.assetCount)}</AdminTd>
                    <AdminTd>{formatDateTime(job.createdAt)}</AdminTd>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!isProductsView && visibleVideoJobs.length === 0 ? <div className="p-4"><EmptyAdminDetail text={tAdmin("content.emptyJobs")} /></div> : null}
      </AdminDataPanel>
    </AdminWorkbench>
  );
}

function AdminContentSignalStrip({
  activeView,
  summary
}: {
  activeView: AdminContentView;
  summary?: AdminContentSummaryResponse;
}) {
  const recentJobs = (summary?.recentVideoJobs ?? []).slice(0, 3);
  return (
    <div className="grid gap-3 border-b border-[var(--border)] bg-[var(--panel2)] px-4 py-3 text-xs min-[960px]:grid-cols-[minmax(0,1fr)_minmax(320px,0.86fr)]">
      <div className="min-w-0">
        <div className="mb-2 flex min-w-0 items-center gap-2 font-black text-[var(--text)]">
          <Activity size={14} className="text-[var(--accent)]" />
          <span>{tAdmin("content.statusDistribution")}</span>
        </div>
        <div className="mb-2 flex flex-wrap gap-2">
          {(summary?.statusCounts ?? []).map((item) => (
            <Badge key={item.status} tone={adminJobStatusTone(item.status)}>{adminJobStatusLabel(item.status)} {formatNumber(item.count)}</Badge>
          ))}
          {summary?.statusCounts.length === 0 ? <span className="font-semibold text-[var(--muted)]">{tAdmin("content.emptyStatus")}</span> : null}
        </div>
        <div className="font-semibold leading-5 text-[var(--muted)]">
          {activeView === "products" ? tAdmin("content.productsWorkbenchHint") : tAdmin("content.videoJobsWorkbenchHint")}
        </div>
      </div>
      <div className="min-w-0 border-t border-[var(--border)] pt-3 min-[960px]:border-l min-[960px]:border-t-0 min-[960px]:pl-4 min-[960px]:pt-0">
        <div className="mb-2 font-black text-[var(--text)]">{tAdmin("content.recentJobs")}</div>
        <div className="grid gap-2">
          {recentJobs.map((job) => (
            <div key={job.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <div className="truncate font-black text-[var(--text)]">{job.productSku ?? job.id}</div>
                <div className="mt-0.5 truncate font-semibold text-[var(--muted)]">{adminBusinessSpaceName(job.workspaceName)}</div>
              </div>
              <Badge tone={adminJobStatusTone(job.status)}>{adminJobStatusLabel(job.status)}</Badge>
            </div>
          ))}
          {recentJobs.length === 0 ? <span className="font-semibold text-[var(--muted)]">{tAdmin("content.emptyJobs")}</span> : null}
        </div>
      </div>
    </div>
  );
}

function AdminTrafficPanel({
  cloudflare,
  geoSummary,
  indexing,
  overview,
  pages,
  search,
  settings,
  sources,
  onSubmitIndexNowUrls,
  onSyncTrafficData
}: {
  cloudflare?: AdminTrafficCloudflareResponse;
  geoSummary?: AdminTrafficGeoSummaryResponse;
  indexing?: AdminTrafficIndexingResponse;
  overview?: AdminTrafficOverviewResponse;
  pages?: AdminTrafficPagesResponse;
  search?: AdminTrafficSearchResponse;
  settings?: AdminTrafficSettingsResponse;
  sources?: AdminTrafficSourcesResponse;
  onSubmitIndexNowUrls: (urls: string[]) => Promise<void>;
  onSyncTrafficData: () => Promise<AdminTrafficActionResponse | undefined>;
}) {
  const trafficTrendOption = useMemo(() => buildTrafficTrendOption(overview?.trend ?? []), [overview]);
  const topPage = pages?.pages[0];
  const configuredIntegrations = settings?.integrations.filter((integration) => integration.configured).length ?? 0;
  const [lastSyncResult, setLastSyncResult] = useState<AdminTrafficActionResponse | undefined>();
  const indexNowUrls = (pages?.pages ?? [])
    .filter((page) => page.path.startsWith("/"))
    .slice(0, 10)
    .map((page) => `https://haitu.online${page.path === "/" ? "/" : page.path}`);
  return (
    <AdminWorkbench
      summary={(
        <AdminSummaryStrip
          items={[
            { label: tAdmin("traffic.metrics.visitors"), value: overview?.metrics.visitors ?? 0, hint: tAdmin("traffic.hints.firstParty") },
            { label: tAdmin("traffic.metrics.pageViews"), value: overview?.metrics.pageViews ?? 0, hint: tAdmin("traffic.hints.publicPages") },
            { label: tAdmin("traffic.metrics.ctaClicks"), value: overview?.metrics.ctaClicks ?? 0, hint: tAdmin("traffic.hints.cta") },
            { label: tAdmin("traffic.metrics.signups"), value: overview?.metrics.signups ?? 0, hint: tAdmin("traffic.hints.conversion") },
            { label: tAdmin("traffic.metrics.paidRecharges"), value: overview?.metrics.paidRecharges ?? 0, hint: tAdmin("traffic.hints.revenue") },
            { label: tAdmin("traffic.metrics.completedCreativeJobs"), value: overview?.metrics.completedCreativeJobs ?? 0, hint: tAdmin("traffic.hints.jobs") },
            { label: tAdmin("traffic.metrics.indexSubmissions"), value: overview?.metrics.indexSubmissions ?? 0, hint: tAdmin("traffic.hints.indexing") }
          ]}
        />
      )}
      side={(
        <AdminSidePanel title={tAdmin("traffic.settings.title")} icon={<Settings2 size={16} />}>
          <div className="grid gap-2">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" onClick={() => void onSyncTrafficData().then((result) => {
                if (result) setLastSyncResult(result);
              })}>
                <RefreshCcw size={14} />
                {tAdmin("traffic.actions.sync")}
              </Button>
              <Button type="button" disabled={indexNowUrls.length === 0} onClick={() => void onSubmitIndexNowUrls(indexNowUrls)}>
                <Search size={14} />
                {tAdmin("traffic.actions.indexNow")}
              </Button>
            </div>
            {lastSyncResult ? (
              <div className="rounded-[8px] border border-[var(--border)] bg-[var(--card)] p-3 text-[11px] font-semibold text-[var(--muted)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <strong className="text-[var(--text)]">{tAdmin("traffic.actions.syncResult", { status: lastSyncResult.status })}</strong>
                  <Badge tone={lastSyncResult.status === "synced" ? "ok" : lastSyncResult.status === "partial_error" || lastSyncResult.status === "error" ? "warn" : "neutral"}>{lastSyncResult.status}</Badge>
                </div>
                <div className="grid gap-1">
                  {(lastSyncResult.providers ?? []).map((provider) => (
                    <div key={provider.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <span className="truncate">{provider.id}</span>
                      <span>{provider.status === "synced" ? tAdmin("traffic.actions.rowsSynced", { count: provider.rowsSynced }) : provider.error ?? provider.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <Badge tone={configuredIntegrations > 0 ? "ok" : "neutral"}>{tAdmin("traffic.settings.configuredCount", { count: configuredIntegrations, total: settings?.integrations.length ?? 0 })}</Badge>
            {(settings?.integrations ?? []).map((integration) => (
              <div key={integration.id} className="rounded-[8px] border border-[var(--border)] bg-[var(--panel2)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-[12px]">{integration.label}</strong>
                  <Badge tone={integration.configured ? "ok" : "neutral"}>{integration.configured ? tAdmin("traffic.settings.configured") : tAdmin("traffic.settings.notConfigured")}</Badge>
                </div>
                <p className="m-0 mt-1 text-[11px] font-semibold leading-5 text-[var(--muted)]">{integration.description}</p>
              </div>
            ))}
            {settings?.integrations.length === 0 || !settings ? <EmptyAdminDetail text={tAdmin("traffic.emptySettings")} /> : null}
          </div>
        </AdminSidePanel>
      )}
    >
      <div className="grid gap-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <AdminDataPanel
            title={tAdmin("traffic.trend")}
            icon={<BarChart3 size={16} />}
            right={<Badge>{tAdmin("traffic.range")}</Badge>}
          >
            <AdminChart option={trafficTrendOption} empty={(overview?.trend ?? []).length === 0} />
          </AdminDataPanel>
          <AdminDataPanel
            title={tAdmin("traffic.sources.title")}
            icon={<Route size={16} />}
            right={<Badge>{tAdmin("traffic.sources.badge", { count: sources?.sources.length ?? 0 })}</Badge>}
          >
            <div className="divide-y divide-[var(--border)]">
              {(sources?.sources ?? []).map((source) => (
                <div key={source.source} className="grid gap-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-sm">{source.source}</strong>
                    <Badge>{formatNumber(source.visitors)} {tAdmin("traffic.metrics.visitors")}</Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-[11px] font-semibold text-[var(--muted)]">
                    <span>{tAdmin("traffic.metrics.pageViews")}: {formatNumber(source.pageViews)}</span>
                    <span>{tAdmin("traffic.metrics.ctaClicks")}: {formatNumber(source.ctaClicks)}</span>
                    <span>{tAdmin("traffic.metrics.signups")}: {formatNumber(source.signups)}</span>
                    <span>{tAdmin("traffic.metrics.paidRecharges")}: {formatNumber(source.paidRecharges)}</span>
                  </div>
                </div>
              ))}
              {sources?.sources.length === 0 || !sources ? <div className="p-4"><EmptyAdminDetail text={tAdmin("traffic.emptySources")} /></div> : null}
            </div>
          </AdminDataPanel>
        </div>

        <AdminDataPanel
          title={tAdmin("traffic.pages.title")}
          icon={<Globe2 size={16} />}
          right={<Badge tone={topPage ? "ok" : "neutral"}>{topPage ? topPage.path : tAdmin("traffic.pages.noTopPage")}</Badge>}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-separate border-spacing-0 text-left text-xs">
              <thead className="bg-[var(--panel2)] text-[var(--muted)]">
                <tr>
                  <AdminTh>{tAdmin("traffic.pages.path")}</AdminTh>
                  <AdminTh>{tAdmin("traffic.pages.type")}</AdminTh>
                  <AdminTh>{tAdmin("traffic.metrics.visitors")}</AdminTh>
                  <AdminTh>{tAdmin("traffic.metrics.pageViews")}</AdminTh>
                  <AdminTh>{tAdmin("traffic.search.clicks")}</AdminTh>
                  <AdminTh>{tAdmin("traffic.search.impressions")}</AdminTh>
                  <AdminTh>{tAdmin("traffic.search.position")}</AdminTh>
                  <AdminTh>{tAdmin("traffic.metrics.ctaClicks")}</AdminTh>
                  <AdminTh>{tAdmin("traffic.metrics.signups")}</AdminTh>
                  <AdminTh>{tAdmin("traffic.metrics.paidRecharges")}</AdminTh>
                  <AdminTh>{tAdmin("traffic.metrics.completedCreativeJobs")}</AdminTh>
                </tr>
              </thead>
              <tbody>
                {(pages?.pages ?? []).map((page) => (
                  <tr key={`${page.path}-${page.locale ?? "all"}`} className="bg-[var(--card)]">
                    <AdminTd>
                      <div className="font-black text-[var(--text)]">{page.path}</div>
                      <div className="mt-0.5 text-[11px] text-[var(--muted)]">{page.locale ?? "-"}</div>
                    </AdminTd>
                    <AdminTd><Badge>{page.pageType}</Badge></AdminTd>
                    <AdminTd>{formatNumber(page.visitors)}</AdminTd>
                    <AdminTd>{formatNumber(page.pageViews)}</AdminTd>
                    <AdminTd>{formatNumber(page.searchClicks)}</AdminTd>
                    <AdminTd>{formatNumber(page.searchImpressions)}</AdminTd>
                    <AdminTd>{page.averagePosition ? page.averagePosition.toFixed(1) : "-"}</AdminTd>
                    <AdminTd>{formatNumber(page.ctaClicks)}</AdminTd>
                    <AdminTd>{formatNumber(page.signups)}</AdminTd>
                    <AdminTd>{formatNumber(page.paidRecharges)}</AdminTd>
                    <AdminTd>{formatNumber(page.completedCreativeJobs)}</AdminTd>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages?.pages.length === 0 || !pages ? <div className="p-4"><EmptyAdminDetail text={tAdmin("traffic.emptyPages")} /></div> : null}
        </AdminDataPanel>

        <AdminDataPanel
          title={tAdmin("traffic.search.title")}
          icon={<Search size={16} />}
          right={<Badge>{tAdmin("traffic.search.badge", { count: search?.rows.length ?? 0 })}</Badge>}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-separate border-spacing-0 text-left text-xs">
              <thead className="bg-[var(--panel2)] text-[var(--muted)]">
                <tr>
                  <AdminTh>{tAdmin("traffic.search.query")}</AdminTh>
                  <AdminTh>{tAdmin("traffic.search.page")}</AdminTh>
                  <AdminTh>{tAdmin("traffic.search.clicks")}</AdminTh>
                  <AdminTh>{tAdmin("traffic.search.impressions")}</AdminTh>
                  <AdminTh>{tAdmin("traffic.search.ctr")}</AdminTh>
                  <AdminTh>{tAdmin("traffic.search.position")}</AdminTh>
                  <AdminTh>{tAdmin("traffic.search.date")}</AdminTh>
                </tr>
              </thead>
              <tbody>
                {(search?.rows ?? []).slice(0, 40).map((row) => (
                  <tr key={`${row.date}-${row.query}-${row.page}`} className="bg-[var(--card)]">
                    <AdminTd>
                      <div className="max-w-[300px] truncate font-black text-[var(--text)]">{row.query}</div>
                      <div className="mt-0.5 text-[11px] text-[var(--muted)]">{[row.country, row.device].filter(Boolean).join(" / ") || "-"}</div>
                    </AdminTd>
                    <AdminTd><div className="max-w-[360px] truncate">{row.page}</div></AdminTd>
                    <AdminTd>{formatNumber(row.clicks)}</AdminTd>
                    <AdminTd>{formatNumber(row.impressions)}</AdminTd>
                    <AdminTd>{row.ctr !== undefined ? `${(row.ctr * 100).toFixed(1)}%` : "-"}</AdminTd>
                    <AdminTd>{row.position !== undefined ? row.position.toFixed(1) : "-"}</AdminTd>
                    <AdminTd>{row.date}</AdminTd>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {search?.rows.length === 0 || !search ? <div className="p-4"><EmptyAdminDetail text={tAdmin("traffic.emptySearch")} /></div> : null}
        </AdminDataPanel>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
          <AdminDataPanel
            title={tAdmin("traffic.cloudflare.title")}
            icon={<Globe2 size={16} />}
            right={<Badge>{tAdmin("traffic.cloudflare.badge", { count: cloudflare?.rows.length ?? 0 })}</Badge>}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-xs">
                <thead className="bg-[var(--panel2)] text-[var(--muted)]">
                  <tr>
                    <AdminTh>{tAdmin("traffic.search.date")}</AdminTh>
                    <AdminTh>{tAdmin("traffic.cloudflare.country")}</AdminTh>
                    <AdminTh>{tAdmin("traffic.cloudflare.status")}</AdminTh>
                    <AdminTh>{tAdmin("traffic.cloudflare.crawler")}</AdminTh>
                    <AdminTh>{tAdmin("traffic.cloudflare.requests")}</AdminTh>
                  </tr>
                </thead>
                <tbody>
                  {(cloudflare?.rows ?? []).slice(0, 20).map((row) => (
                    <tr key={`${row.date}-${row.country ?? "-"}-${row.status ?? "-"}-${row.crawler ?? "-"}`} className="bg-[var(--card)]">
                      <AdminTd>{row.date}</AdminTd>
                      <AdminTd>{row.country ?? "-"}</AdminTd>
                      <AdminTd>{row.status ?? "-"}</AdminTd>
                      <AdminTd>{row.crawler ?? "-"}</AdminTd>
                      <AdminTd>{formatNumber(row.requests)}</AdminTd>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cloudflare?.rows.length === 0 || !cloudflare ? <div className="p-4"><EmptyAdminDetail text={tAdmin("traffic.emptyCloudflare")} /></div> : null}
          </AdminDataPanel>
          <AdminDataPanel
            title={tAdmin("traffic.geo.title")}
            icon={<Activity size={16} />}
            right={<Badge>{tAdmin("traffic.geo.badge", { count: geoSummary?.opportunities.length ?? 0 })}</Badge>}
          >
            <div className="grid gap-3 p-4 text-xs">
              <div className="grid gap-2 min-[760px]:grid-cols-4">
                <Badge>{tAdmin("traffic.geo.pagesReviewed", { count: geoSummary?.pagesReviewed ?? 0 })}</Badge>
                <Badge>{tAdmin("traffic.search.clicks")}: {formatNumber(geoSummary?.searchClicks ?? 0)}</Badge>
                <Badge>{tAdmin("traffic.search.impressions")}: {formatNumber(geoSummary?.searchImpressions ?? 0)}</Badge>
                <Badge>{tAdmin("traffic.cloudflare.requests")}: {formatNumber(geoSummary?.edgeRequests ?? 0)}</Badge>
              </div>
              <div className="grid gap-2">
                {(geoSummary?.opportunities ?? []).slice(0, 8).map((item) => (
                  <div key={item.path} className="grid gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--panel2)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="truncate text-[var(--text)]">{item.path}</strong>
                      <Badge tone="warn">{item.reason}</Badge>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-[11px] font-semibold text-[var(--muted)]">
                      <span>{tAdmin("traffic.search.clicks")}: {formatNumber(item.searchClicks)}</span>
                      <span>{tAdmin("traffic.search.impressions")}: {formatNumber(item.searchImpressions)}</span>
                      <span>{tAdmin("traffic.metrics.pageViews")}: {formatNumber(item.pageViews)}</span>
                      <span>{tAdmin("traffic.metrics.ctaClicks")}: {formatNumber(item.ctaClicks)}</span>
                    </div>
                  </div>
                ))}
                {geoSummary?.opportunities.length === 0 || !geoSummary ? <EmptyAdminDetail text={tAdmin("traffic.emptyGeoSummary")} /> : null}
              </div>
            </div>
          </AdminDataPanel>
        </div>

        <AdminDataPanel
          title={tAdmin("traffic.indexing.title")}
          icon={<Search size={16} />}
          right={<Badge>{tAdmin("traffic.indexing.badge", { count: indexing?.submissions.length ?? 0 })}</Badge>}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-separate border-spacing-0 text-left text-xs">
              <thead className="bg-[var(--panel2)] text-[var(--muted)]">
                <tr>
                  <AdminTh>{tAdmin("traffic.indexing.url")}</AdminTh>
                  <AdminTh>{tAdmin("traffic.indexing.provider")}</AdminTh>
                  <AdminTh>{tAdmin("traffic.indexing.status")}</AdminTh>
                  <AdminTh>{tAdmin("traffic.indexing.submittedAt")}</AdminTh>
                  <AdminTh>{tAdmin("traffic.indexing.message")}</AdminTh>
                </tr>
              </thead>
              <tbody>
                {(indexing?.submissions ?? []).map((submission) => (
                  <tr key={submission.id} className="bg-[var(--card)]">
                    <AdminTd>
                      <div className="max-w-[420px] truncate font-black text-[var(--text)]">{submission.url}</div>
                      <div className="mt-0.5 text-[11px] text-[var(--muted)]">{submission.submissionType}</div>
                    </AdminTd>
                    <AdminTd>{submission.provider}</AdminTd>
                    <AdminTd><Badge tone={submission.errorMessage ? "warn" : "ok"}>{submission.statusCode ?? "-"}</Badge></AdminTd>
                    <AdminTd>{formatDateTime(submission.submittedAt)}</AdminTd>
                    <AdminTd>{submission.errorMessage ?? submission.responseExcerpt ?? "-"}</AdminTd>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {indexing?.submissions.length === 0 || !indexing ? <div className="p-4"><EmptyAdminDetail text={tAdmin("traffic.emptyIndexing")} /></div> : null}
        </AdminDataPanel>
      </div>
    </AdminWorkbench>
  );
}

function buildTrafficTrendOption(rows: AdminTrafficOverviewResponse["trend"]): EChartsOption {
  return {
    color: ["#0aa394", "#315c75", "#d07a2d", "#6f7f3f"],
    tooltip: { trigger: "axis" },
    legend: {
      bottom: 4,
      textStyle: { color: "#7b7068", fontSize: 11 }
    },
    grid: { left: 36, right: 18, top: 22, bottom: 62 },
    xAxis: {
      type: "category",
      data: rows.map((row) => row.date),
      axisLabel: { color: "#7b7068" }
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: { color: "#7b7068" },
      splitLine: { lineStyle: { color: "rgba(117,105,95,.18)" } }
    },
    series: [
      {
        name: tAdmin("traffic.metrics.pageViews"),
        type: "line",
        smooth: true,
        data: rows.map((row) => row.pageViews)
      },
      {
        name: tAdmin("traffic.metrics.visitors"),
        type: "line",
        smooth: true,
        data: rows.map((row) => row.visitors)
      },
      {
        name: tAdmin("traffic.metrics.signups"),
        type: "bar",
        data: rows.map((row) => row.signups)
      },
      {
        name: tAdmin("traffic.metrics.paidRecharges"),
        type: "bar",
        data: rows.map((row) => row.paidRecharges)
      }
    ]
  };
}

function AdminFinancePanel({
  globalSearch,
  isBusy,
  onSubmitWalletAdjustment,
  rechargeOrders,
  walletTransactions,
  wallets
}: {
  globalSearch: string;
  isBusy: boolean;
  onSubmitWalletAdjustment: (input: { workspaceId: string; amountCny: number; reason: string }) => Promise<void>;
  rechargeOrders: AdminRechargeOrderView[];
  walletTransactions: AdminWalletTransactionView[];
  wallets: AdminWalletSummary[];
}) {
  const [adjustingWallet, setAdjustingWallet] = useState<AdminWalletSummary | undefined>();
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [activeLedgerView, setActiveLedgerView] = useState<AdminFinanceLedgerView>("wallets");
  const visibleWallets = filterAdminWallets(wallets, globalSearch);
  const visibleRechargeOrders = filterAdminRechargeOrders(rechargeOrders, globalSearch);
  const visibleWalletTransactions = filterAdminWalletTransactions(walletTransactions, globalSearch);
  const totalBalanceCny = visibleWallets.reduce((total, wallet) => total + wallet.balanceCny, 0);
  const totalReservedCny = visibleWallets.reduce((total, wallet) => total + wallet.reservedCny, 0);
  const paidRechargeCny = visibleRechargeOrders.filter((order) => order.status === "paid").reduce((total, order) => total + order.creditCny, 0);
  const totalSpendCny = visibleWalletTransactions
    .filter((transaction) => transaction.amountCny < 0)
    .reduce((total, transaction) => total + Math.abs(transaction.amountCny), 0);
  const activeLedgerTitle = activeLedgerView === "wallets"
    ? tAdmin("finance.userBalances")
    : activeLedgerView === "rechargeOrders"
      ? tAdmin("finance.rechargeOrders")
      : tAdmin("finance.walletTransactions");
  const activeLedgerIcon = activeLedgerView === "wallets"
    ? <DollarSign size={16} />
    : activeLedgerView === "rechargeOrders"
      ? <CreditCard size={16} />
      : <Activity size={16} />;

  function openWalletAdjustment(wallet: AdminWalletSummary) {
    setAdjustingWallet(wallet);
    setAdjustAmount("");
    setAdjustReason("");
  }

  function closeWalletAdjustment() {
    setAdjustingWallet(undefined);
    setAdjustAmount("");
    setAdjustReason("");
  }

  async function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adjustingWallet) {
      return;
    }
    await onSubmitWalletAdjustment({
      workspaceId: adjustingWallet.workspaceId,
      amountCny: Number(adjustAmount),
      reason: adjustReason
    });
    closeWalletAdjustment();
  }

  return (
    <AdminWorkbench
      summary={(
        <AdminSummaryStrip
          items={[
            { label: tAdmin("finance.totalBalance"), value: `¥${money(totalBalanceCny)}`, hint: tAdmin("finance.workspaceCount", { count: visibleWallets.length }) },
            { label: tAdmin("finance.reserved"), value: `¥${money(totalReservedCny)}`, hint: tAdmin("finance.reservedHint") },
            { label: tAdmin("finance.paidRecharge"), value: `¥${money(paidRechargeCny)}`, hint: tAdmin("finance.rechargeCount", { count: visibleRechargeOrders.length }) },
            { label: tAdmin("finance.totalSpend"), value: `¥${money(totalSpendCny)}`, hint: tAdmin("finance.transactionCount", { count: visibleWalletTransactions.length }) }
          ]}
        />
      )}
    >
      <AdminDataPanel
        title={activeLedgerTitle}
        icon={activeLedgerIcon}
        right={(
          <AdminSegmentedControl<AdminFinanceLedgerView>
            value={activeLedgerView}
            onChange={setActiveLedgerView}
            options={[
              { value: "wallets", label: tAdmin("finance.userBalances"), count: visibleWallets.length },
              { value: "rechargeOrders", label: tAdmin("finance.rechargeOrders"), count: visibleRechargeOrders.length },
              { value: "walletTransactions", label: tAdmin("finance.walletTransactions"), count: visibleWalletTransactions.length }
            ]}
          />
        )}
      >
        {activeLedgerView === "wallets" ? <AdminFinanceWalletsTable wallets={visibleWallets} isBusy={isBusy} onAdjust={openWalletAdjustment} /> : null}
        {activeLedgerView === "rechargeOrders" ? <AdminFinanceRechargeOrdersTable orders={visibleRechargeOrders} /> : null}
        {activeLedgerView === "walletTransactions" ? <AdminFinanceWalletTransactionsTable transactions={visibleWalletTransactions} /> : null}
      </AdminDataPanel>
      <AdminWalletAdjustmentDialog
        amount={adjustAmount}
        isBusy={isBusy}
        reason={adjustReason}
        wallet={adjustingWallet}
        onAmountChange={setAdjustAmount}
        onClose={closeWalletAdjustment}
        onReasonChange={setAdjustReason}
        onSubmit={submitAdjustment}
      />
    </AdminWorkbench>
  );
}

function AdminPaymentBillingPanel({
  billingSettings,
  isBusy,
  onTogglePaymentMethodEnabled,
  paymentMethods,
  onSaveBillingSettings
}: {
  billingSettings?: BillingSettingsView;
  isBusy: boolean;
  onTogglePaymentMethodEnabled: (methodId: PaymentMethodView["id"], enabled: boolean) => Promise<void>;
  paymentMethods: PaymentMethodView[];
  onSaveBillingSettings: (rules: Array<Pick<BillingPriceRuleView, "usageKind" | "serviceFeeCny" | "enabled">>) => Promise<void>;
}) {
  const [billingDrafts, setBillingDrafts] = useState<Record<BillingUsageKind, { serviceFeeCny: string; enabled: boolean }>>(() => defaultBillingDrafts());
  const enabledPaymentCount = paymentMethods.filter((method) => method.enabled).length;
  const configuredPaymentCount = paymentMethods.filter((method) => method.configured).length;

  useEffect(() => {
    if (!billingSettings) {
      return;
    }
    setBillingDrafts(draftsFromBillingRules(billingSettings.rules));
  }, [billingSettings]);

  function updateBillingDraft(usageKind: BillingUsageKind, patch: Partial<{ serviceFeeCny: string; enabled: boolean }>) {
    setBillingDrafts((current) => ({
      ...current,
      [usageKind]: {
        ...current[usageKind],
        ...patch
      }
    }));
  }

  async function submitBillingSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSaveBillingSettings(billingUsageKinds.map((usageKind) => ({
      usageKind,
      serviceFeeCny: Number(billingDrafts[usageKind].serviceFeeCny),
      enabled: billingDrafts[usageKind].enabled
    })));
  }

  return (
    <AdminWorkbench
      summary={(
        <AdminSummaryStrip
          items={[
            { label: tAdmin("paymentBilling.paymentMethods"), value: `${enabledPaymentCount}/${paymentMethods.length}`, hint: tAdmin("paymentBilling.configuredMethods", { count: configuredPaymentCount }) },
            { label: tAdmin("paymentBilling.billingPolicy"), value: billingSettings?.policy.enabled ? tAdmin("paymentBilling.toggleOn") : tAdmin("paymentBilling.toggleOff"), hint: billingSettings?.policy.label ?? tAdmin("paymentBilling.meteredPolicy") },
            { label: tAdmin("paymentBilling.usageKinds.video"), value: `¥${billingDrafts.video.serviceFeeCny}`, hint: tAdmin("paymentBilling.serviceFeeUnits.perVideo") },
            { label: tAdmin("paymentBilling.usageKinds.image"), value: `¥${billingDrafts.image.serviceFeeCny}`, hint: tAdmin("paymentBilling.serviceFeeUnits.perImage") }
          ]}
        />
      )}
    >
      <div className="grid gap-3">
        <AdminPaymentBillingSettingsPanel
          billingDrafts={billingDrafts}
          billingSettings={billingSettings}
          isBusy={isBusy}
          onBillingDraftChange={updateBillingDraft}
          onSubmitBillingSettings={submitBillingSettings}
        />
        <AdminPaymentMethodsPanel
          enabledPaymentCount={enabledPaymentCount}
          isBusy={isBusy}
          paymentMethods={paymentMethods}
          onTogglePaymentMethodEnabled={onTogglePaymentMethodEnabled}
        />
      </div>
    </AdminWorkbench>
  );
}

function AdminPaymentBillingSettingsPanel({
  billingDrafts,
  billingSettings,
  isBusy,
  onBillingDraftChange,
  onSubmitBillingSettings
}: {
  billingDrafts: Record<BillingUsageKind, { serviceFeeCny: string; enabled: boolean }>;
  billingSettings?: BillingSettingsView;
  isBusy: boolean;
  onBillingDraftChange: (usageKind: BillingUsageKind, patch: Partial<{ serviceFeeCny: string; enabled: boolean }>) => void;
  onSubmitBillingSettings: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <AdminDataPanel
      title={tAdmin("paymentBilling.serviceFees")}
      icon={<SlidersHorizontal size={16} />}
      right={<Badge>{billingSettings?.policy.label ?? tAdmin("paymentBilling.meteredPolicy")}</Badge>}
    >
      <form className="grid gap-0" onSubmit={onSubmitBillingSettings}>
        <div className="border-b border-[var(--border)] px-4 py-3 text-[12px] font-semibold leading-5 text-[var(--muted)]">
          {tAdmin("paymentBilling.officialCostHint")}
        </div>
        <div className="divide-y divide-[var(--border)]">
          {billingUsageKinds.map((usageKind) => {
            const draft = billingDrafts[usageKind];
            return (
              <div key={usageKind} className="grid gap-3 px-4 py-3 min-[720px]:grid-cols-[minmax(0,1fr)_180px_auto] min-[720px]:items-center">
                <div className="min-w-0">
                  <div className="text-sm font-black text-[var(--text)]">{billingUsageKindLabel(usageKind)}</div>
                  <div className="mt-1 text-[11px] font-semibold text-[var(--muted)]">{billingServiceFeeUnitLabel(usageKind)}</div>
                </div>
                <Input
                  inputMode="decimal"
                  value={draft.serviceFeeCny}
                  onChange={(event) => onBillingDraftChange(usageKind, { serviceFeeCny: event.target.value })}
                  disabled={isBusy}
                />
                <AdminToggle
                  checked={draft.enabled}
                  disabled={isBusy}
                  onChange={(enabled) => onBillingDraftChange(usageKind, { enabled })}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-end border-t border-[var(--border)] bg-[var(--panel)] px-4 py-3">
          <Button variant="primary" type="submit" disabled={isBusy || !billingSettings}>
            <CreditCard size={14} />
            {tAdmin("paymentBilling.savePricing")}
          </Button>
        </div>
      </form>
    </AdminDataPanel>
  );
}

function AdminPaymentMethodsPanel({
  enabledPaymentCount,
  isBusy,
  onTogglePaymentMethodEnabled,
  paymentMethods
}: {
  enabledPaymentCount: number;
  isBusy: boolean;
  onTogglePaymentMethodEnabled: (methodId: PaymentMethodView["id"], enabled: boolean) => Promise<void>;
  paymentMethods: PaymentMethodView[];
}) {
  return (
    <AdminDataPanel
      title={tAdmin("paymentBilling.paymentMethods")}
      icon={<CreditCard size={16} />}
      right={<Badge>{tAdmin("paymentBilling.enabledCount", { enabled: enabledPaymentCount, total: paymentMethods.length })}</Badge>}
    >
      <div className="divide-y divide-[var(--border)]">
        {paymentMethods.map((method) => (
          <div key={method.id} className="grid gap-2 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">{method.label}</strong>
                  <Badge tone={method.kind === "rmb" ? "ok" : "neutral"}>{method.kind === "rmb" ? tAdmin("paymentBilling.rmbPayment") : tAdmin("paymentBilling.cryptoPayment")}</Badge>
                  <Badge tone={method.configured ? "ok" : "warn"}>{method.configured ? tAdmin("paymentBilling.configured") : tAdmin("paymentBilling.notConfigured")}</Badge>
                </div>
                <p className="m-0 mt-1 text-[12px] font-semibold leading-5 text-[var(--muted)]">{method.description}</p>
              </div>
              <AdminToggle
                checked={method.enabled}
                disabled={isBusy}
                onChange={(enabled) => void onTogglePaymentMethodEnabled(method.id, enabled)}
              />
            </div>
            {method.unavailableReason ? (
              <p className="m-0 text-[11px] font-black text-[var(--warn)]">{method.unavailableReason}</p>
            ) : null}
          </div>
        ))}
        {paymentMethods.length === 0 ? <div className="p-4"><EmptyAdminDetail text={tAdmin("paymentBilling.emptyPaymentMethods")} /></div> : null}
      </div>
    </AdminDataPanel>
  );
}

function AdminToggle({
  checked,
  disabled,
  onChange
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "relative inline-flex h-7 w-[62px] items-center rounded-full border px-1 transition focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(10,163,148,.18)] disabled:cursor-not-allowed disabled:opacity-55",
        checked ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border)] bg-[var(--field)]"
      )}
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span
        className={cn(
          "grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-black shadow-[0_4px_10px_rgba(42,33,27,.16)] transition-transform",
          checked ? "translate-x-[33px] text-[var(--accent)]" : "translate-x-0 text-[var(--muted)]"
        )}
      >
        {checked ? tAdmin("paymentBilling.toggleOn") : tAdmin("paymentBilling.toggleOff")}
      </span>
    </button>
  );
}

function AdminModelPricingPanel({
  catalog,
  isBusy,
  onPublishDraft,
  onSaveDraft
}: {
  catalog?: AdminModelPricingCatalogResponse;
  isBusy: boolean;
  onPublishDraft: (draftId: string) => Promise<void>;
  onSaveDraft: (input: { version: string; entries: AdminModelPricingEntry[] }) => Promise<string | undefined>;
}) {
  const active = catalog?.active;
  const [version, setVersion] = useState("");
  const [draftId, setDraftId] = useState<string | undefined>();
  const [entries, setEntries] = useState<AdminModelPricingEntry[]>([]);

  useEffect(() => {
    if (!active) {
      return;
    }
    setVersion(nextModelPricingVersion(active.version));
    setEntries(active.entries.map((entry) => ({ ...entry })));
    setDraftId(undefined);
  }, [active]);

  function updateEntry(model: string, patch: Partial<AdminModelPricingEntry>) {
    setEntries((current) => current.map((entry) => entry.model === model ? { ...entry, ...patch } : entry));
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextDraftId = await onSaveDraft({ version, entries });
    if (nextDraftId) {
      setDraftId(nextDraftId);
    }
  }

  async function publishDraft() {
    if (!draftId) {
      return;
    }
    await onPublishDraft(draftId);
    setDraftId(undefined);
  }

  const providerCounts = entries.reduce<Record<string, number>>((current, entry) => {
    current[entry.providerId] = (current[entry.providerId] ?? 0) + 1;
    return current;
  }, {});
  const providerSummaryItems = Array.from(new Set(entries.map((entry) => entry.providerId))).map((providerId) => ({
    label: modelPricingProviderLabel(providerId),
    value: providerCounts[providerId] ?? 0,
    hint: tAdmin("modelPricing.providerEntries")
  }));

  return (
    <AdminWorkbench
      summary={(
        <AdminSummaryStrip
          items={[
            { label: tAdmin("modelPricing.activeVersion"), value: active?.version ?? "-", hint: active ? modelPricingSourceLabel(active.source) : "-" },
            ...providerSummaryItems
          ]}
        />
      )}
      side={(
        <AdminModelPricingPublishPanel
          draftId={draftId}
          entriesCount={entries.length}
          isBusy={isBusy}
          version={version}
          onPublishDraft={publishDraft}
          onSaveDraft={saveDraft}
          onVersionChange={setVersion}
        />
      )}
    >
      <AdminDataPanel
        title={tAdmin("modelPricing.catalogEditor")}
        icon={<DollarSign size={16} />}
        right={<Badge tone={draftId ? "warn" : "neutral"}>{draftId ? tAdmin("modelPricing.draftReady") : tAdmin("modelPricing.noDraft")}</Badge>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-left text-xs">
            <thead className="bg-[var(--panel2)] text-[var(--muted)]">
              <tr>
                <AdminTh>{tAdmin("modelPricing.table.model")}</AdminTh>
                <AdminTh>{tAdmin("modelPricing.table.kind")}</AdminTh>
                <AdminTh>{tAdmin("modelPricing.table.input")}</AdminTh>
                <AdminTh>{tAdmin("modelPricing.table.output")}</AdminTh>
                <AdminTh>{tAdmin("modelPricing.table.cached")}</AdminTh>
                <AdminTh>{tAdmin("modelPricing.table.image")}</AdminTh>
                <AdminTh>{tAdmin("modelPricing.table.video")}</AdminTh>
                <AdminTh>{tAdmin("modelPricing.table.source")}</AdminTh>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={`${entry.providerId}-${entry.model}`} className="bg-[var(--card)]">
                  <AdminTd>
                    <div className="font-black text-[var(--text)]">{entry.model}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--muted)]">{modelPricingProviderLabel(entry.providerId)} · {entry.label}</div>
                  </AdminTd>
                  <AdminTd><Badge>{modelPricingKindLabel(entry.kind)}</Badge></AdminTd>
                  <AdminTd>
                    <AdminPriceInput value={entry.inputPriceCnyPerMillion} disabled={isBusy || entry.kind !== "text"} onChange={(value) => updateEntry(entry.model, { inputPriceCnyPerMillion: value })} />
                  </AdminTd>
                  <AdminTd>
                    <AdminPriceInput value={entry.outputPriceCnyPerMillion} disabled={isBusy || entry.kind !== "text"} onChange={(value) => updateEntry(entry.model, { outputPriceCnyPerMillion: value })} />
                  </AdminTd>
                  <AdminTd>
                    <AdminPriceInput value={entry.cachedInputPriceCnyPerMillion} disabled={isBusy || entry.kind !== "text"} onChange={(value) => updateEntry(entry.model, { cachedInputPriceCnyPerMillion: value })} />
                  </AdminTd>
                  <AdminTd>
                    <AdminPriceInput value={entry.imagePriceCnyPerImage} disabled={isBusy || entry.kind !== "image"} onChange={(value) => updateEntry(entry.model, { imagePriceCnyPerImage: value })} />
                  </AdminTd>
                  <AdminTd>
                    <AdminPriceInput value={entry.videoTokenPriceCnyPerMillion} disabled={isBusy || entry.kind !== "video"} onChange={(value) => updateEntry(entry.model, { videoTokenPriceCnyPerMillion: value })} />
                  </AdminTd>
                  <AdminTd>
                    <a className="font-black text-[var(--accent)] hover:underline" href={entry.sourceUrl} target="_blank" rel="noreferrer">{tAdmin("modelPricing.source")}</a>
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {entries.length === 0 ? <div className="p-4"><EmptyAdminDetail text={tAdmin("modelPricing.emptyEntries")} /></div> : null}
      </AdminDataPanel>
    </AdminWorkbench>
  );
}

function AdminModelPricingPublishPanel({
  draftId,
  entriesCount,
  isBusy,
  onPublishDraft,
  onSaveDraft,
  onVersionChange,
  version
}: {
  draftId?: string;
  entriesCount: number;
  isBusy: boolean;
  onPublishDraft: () => Promise<void>;
  onSaveDraft: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onVersionChange: (value: string) => void;
  version: string;
}) {
  return (
    <AdminSidePanel title={tAdmin("modelPricing.publishPanel")} icon={<CheckCircle2 size={16} />}>
      <form className="grid gap-3" onSubmit={onSaveDraft}>
        <Field label={tAdmin("modelPricing.version")}>
          <Input value={version} onChange={(event) => onVersionChange(event.target.value)} disabled={isBusy} />
        </Field>
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--panel2)] p-3 text-[12px] font-semibold leading-5 text-[var(--muted)]">
          {tAdmin("modelPricing.publishHint")}
        </div>
        <Button variant="primary" type="submit" disabled={isBusy || entriesCount === 0 || !version.trim()}>
          <DollarSign size={14} />
          {tAdmin("modelPricing.saveDraft")}
        </Button>
        <Button type="button" disabled={isBusy || !draftId} onClick={() => void onPublishDraft()}>
          <CheckCircle2 size={14} />
          {tAdmin("modelPricing.publish")}
        </Button>
      </form>
    </AdminSidePanel>
  );
}

function AdminPriceInput({
  disabled,
  onChange,
  value
}: {
  disabled?: boolean;
  onChange: (value: number | undefined) => void;
  value?: number;
}) {
  return (
    <Input
      className="min-h-8 px-2 text-xs"
      disabled={disabled}
      inputMode="decimal"
      value={value ?? ""}
      onChange={(event) => {
        const raw = event.target.value.trim();
        onChange(raw === "" ? undefined : Number(raw));
      }}
    />
  );
}

function AdminSiteSettingsPanel({ settings }: { settings?: AdminSiteSettingsResponse }) {
  const enabledPaymentCount = (settings?.paymentMethods ?? []).filter((method) => method.enabled).length;
  const enabledBillingRuleCount = (settings?.billing.rules ?? []).filter((rule) => rule.enabled).length;
  return (
    <AdminWorkbench
      summary={(
        <AdminSummaryStrip
          items={[
            { label: tAdmin("siteSettings.sections"), value: settings?.sections.length ?? 0, hint: tAdmin("siteSettings.sectionHint") },
            { label: tAdmin("siteSettings.publicPages"), value: settings?.publicPages.length ?? 0, hint: tAdmin("siteSettings.publicPageHint") },
            { label: tAdmin("siteSettings.modelPricing"), value: settings?.modelPricing.entryCount ?? 0, hint: settings?.modelPricing.activeVersion ?? "-" },
            { label: tAdmin("siteSettings.paymentMethods"), value: `${enabledPaymentCount}/${settings?.paymentMethods.length ?? 0}`, hint: tAdmin("siteSettings.billingRules", { count: enabledBillingRuleCount }) }
          ]}
        />
      )}
      side={<AdminSiteSettingsSidePanel settings={settings} />}
    >
      <AdminDataPanel
        title={tAdmin("siteSettings.configSections")}
        icon={<Settings2 size={16} />}
        right={<Badge>{tAdmin("siteSettings.statusOnly")}</Badge>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-xs">
            <thead className="bg-[var(--panel2)] text-[var(--muted)]">
              <tr>
                <AdminTh>{tAdmin("siteSettings.table.section")}</AdminTh>
                <AdminTh>{tAdmin("siteSettings.table.description")}</AdminTh>
                <AdminTh>{tAdmin("siteSettings.table.status")}</AdminTh>
              </tr>
            </thead>
            <tbody>
              {(settings?.sections ?? []).map((section) => (
                <tr key={section.id} className="bg-[var(--card)]">
                  <AdminTd>
                    <div className="font-black text-[var(--text)]">{section.label}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--muted)]">{section.id}</div>
                  </AdminTd>
                  <AdminTd>{section.description}</AdminTd>
                  <AdminTd><Badge tone={siteSettingsTone(section.status)}>{siteSettingsStatusLabel(section.status)}</Badge></AdminTd>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(settings?.sections ?? []).length === 0 ? <div className="p-4"><EmptyAdminDetail text={tAdmin("siteSettings.emptySections")} /></div> : null}
      </AdminDataPanel>
    </AdminWorkbench>
  );
}

function AdminSiteSettingsSidePanel({ settings }: { settings?: AdminSiteSettingsResponse }) {
  return (
    <AdminSidePanel title={tAdmin("siteSettings.sidePanel")} icon={<Globe2 size={16} />}>
      <div className="grid gap-4">
        <section>
          <h3 className="m-0 mb-3 text-sm font-black text-[var(--text)]">{tAdmin("siteSettings.publicPages")}</h3>
          <div className="divide-y divide-[var(--border)] rounded-[8px] border border-[var(--border)] bg-[var(--panel2)]">
            {(settings?.publicPages ?? []).map((page) => (
              <div key={page.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm font-black">
                <span className="truncate">{page.label}</span>
                <Badge tone={siteSettingsTone(page.status)}>{siteSettingsStatusLabel(page.status)}</Badge>
              </div>
            ))}
            {(settings?.publicPages ?? []).length === 0 ? <div className="p-3"><EmptyAdminDetail text={tAdmin("siteSettings.emptyPublicPages")} /></div> : null}
          </div>
        </section>

        <section className="border-t border-[var(--border)] pt-4">
          <h3 className="m-0 mb-3 flex items-center gap-2 text-sm font-black text-[var(--text)]">
            <Search size={15} className="text-[var(--accent)]" />
            {tAdmin("siteSettings.seoGeo")}
          </h3>
          <div className="grid gap-2 text-xs font-semibold leading-5 text-[var(--muted)]">
            <Badge tone={siteSettingsTone(settings?.seoGeo.status ?? "planned")}>{siteSettingsStatusLabel(settings?.seoGeo.status ?? "planned")}</Badge>
            <div className="rounded-[8px] border border-[var(--border)] bg-[var(--panel2)] p-3">
              <div className="font-black text-[var(--text)]">{tAdmin("siteSettings.roadmapPath")}</div>
              <div className="mt-1 break-words">{settings?.seoGeo.roadmapPath ?? "-"}</div>
            </div>
            <div className="rounded-[8px] border border-[var(--border)] bg-[var(--panel2)] p-3">
              <div className="font-black text-[var(--text)]">{tAdmin("siteSettings.productionCheck")}</div>
              <div className="mt-1 break-words">{settings?.seoGeo.productionCheck ?? "-"}</div>
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--border)] pt-4">
          <h3 className="m-0 mb-3 flex items-center gap-2 text-sm font-black text-[var(--text)]">
            <CreditCard size={15} className="text-[var(--accent)]" />
            {tAdmin("siteSettings.commerce")}
          </h3>
          <div className="divide-y divide-[var(--border)] rounded-[8px] border border-[var(--border)] bg-[var(--panel2)] text-xs font-semibold text-[var(--muted)]">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span>{tAdmin("siteSettings.paymentMethods")}</span>
              <strong className="text-[var(--text)]">{(settings?.paymentMethods ?? []).filter((method) => method.enabled).length}/{settings?.paymentMethods.length ?? 0}</strong>
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span>{settings?.billing.label ?? tAdmin("paymentBilling.meteredPolicy")}</span>
              <Badge tone={settings?.billing.enabled ? "ok" : "warn"}>{settings?.billing.enabled ? tAdmin("paymentBilling.toggleOn") : tAdmin("paymentBilling.toggleOff")}</Badge>
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span>{tAdmin("siteSettings.modelPricing")}</span>
              <strong className="text-[var(--text)]">{settings?.modelPricing.activeVersion ?? "-"}</strong>
            </div>
          </div>
        </section>
      </div>
    </AdminSidePanel>
  );
}

function AdminFinanceWalletsTable({
  isBusy,
  onAdjust,
  wallets
}: {
  isBusy: boolean;
  onAdjust: (wallet: AdminWalletSummary) => void;
  wallets: AdminWalletSummary[];
}) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-separate border-spacing-0 text-left text-xs">
          <thead className="bg-[var(--panel2)] text-[var(--muted)]">
            <tr>
              <AdminTh>{tAdmin("finance.walletTable.workspace")}</AdminTh>
              <AdminTh>{tAdmin("finance.walletTable.user")}</AdminTh>
              <AdminTh>{tAdmin("finance.walletTable.balance")}</AdminTh>
              <AdminTh>{tAdmin("finance.walletTable.reserved")}</AdminTh>
              <AdminTh>{tAdmin("finance.walletTable.available")}</AdminTh>
              <AdminTh>{tAdmin("finance.walletTable.ledger")}</AdminTh>
              <AdminTh>{tAdmin("finance.walletTable.lastChange")}</AdminTh>
              <AdminTh>{tAdmin("finance.walletTable.action")}</AdminTh>
            </tr>
          </thead>
          <tbody>
            {wallets.map((wallet) => (
              <tr key={wallet.workspaceId} className="bg-[var(--card)]">
                <AdminTd>
                  <div className="font-black text-[var(--text)]">{adminBusinessSpaceName(wallet.workspaceName)}</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">{wallet.workspaceId}</div>
                </AdminTd>
                <AdminTd>{wallet.ownerEmail ?? "-"}</AdminTd>
                <AdminTd>¥{money(wallet.balanceCny)}</AdminTd>
                <AdminTd>¥{money(wallet.reservedCny)}</AdminTd>
                <AdminTd>
                  <strong className={wallet.availableCny > 0 ? "text-[var(--ok)]" : "text-[var(--muted)]"}>¥{money(wallet.availableCny)}</strong>
                </AdminTd>
                <AdminTd>{formatNumber(wallet.transactionCount)}</AdminTd>
                <AdminTd>
                  <div>{formatDateTime(wallet.lastTransactionAt)}</div>
                  <div className="mt-0.5 text-[11px] text-[var(--muted)]">{adminWalletTransactionTypeLabel(wallet.lastTransactionType)}</div>
                </AdminTd>
                <AdminTd>
                  <Button type="button" variant="ghost" size="sm" disabled={isBusy} onClick={() => onAdjust(wallet)}>
                    <CreditCard size={14} />
                    {tAdmin("finance.adjustment")}
                  </Button>
                </AdminTd>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {wallets.length === 0 ? <div className="p-4"><EmptyAdminDetail text={tAdmin("finance.emptyWallets")} /></div> : null}
    </>
  );
}

function AdminWalletAdjustmentDialog({
  amount,
  isBusy,
  onAmountChange,
  onClose,
  onReasonChange,
  onSubmit,
  reason,
  wallet
}: {
  amount: string;
  isBusy: boolean;
  onAmountChange: (value: string) => void;
  onClose: () => void;
  onReasonChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  reason: string;
  wallet?: AdminWalletSummary;
}) {
  if (!wallet) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(42,33,27,.35)] p-4">
      <form className="w-full max-w-[520px] overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--card)] shadow-[0_24px_70px_rgba(42,33,27,.24)]" role="dialog" aria-modal="true" aria-label={tAdmin("finance.adjustment")} onSubmit={onSubmit}>
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="m-0 text-base font-black text-[var(--text)]">{tAdmin("finance.adjustment")}</h2>
            <p className="m-0 mt-1 truncate text-xs font-semibold text-[var(--muted)]">{adminBusinessSpaceName(wallet.workspaceName)} / ¥{money(wallet.availableCny)}</p>
          </div>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isBusy}>{tAdmin("finance.cancelAdjustment")}</Button>
        </div>
        <div className="grid gap-3 px-4 py-4">
          <Field label={tAdmin("finance.amount")}>
            <Input
              inputMode="decimal"
              placeholder={tAdmin("finance.amountPlaceholder")}
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
              disabled={isBusy}
            />
          </Field>
          <Field label={tAdmin("finance.reason")}>
            <Textarea
              placeholder={tAdmin("finance.reasonPlaceholder")}
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              disabled={isBusy}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--panel)] px-4 py-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isBusy}>{tAdmin("finance.cancelAdjustment")}</Button>
          <Button variant="primary" type="submit" disabled={isBusy || !amount.trim() || !reason.trim()}>
            <CreditCard size={14} />
            {tAdmin("finance.submitAdjustment")}
          </Button>
        </div>
      </form>
    </div>
  );
}

function AdminFinanceRechargeOrdersTable({ orders }: { orders: AdminRechargeOrderView[] }) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-xs">
          <thead className="bg-[var(--panel2)] text-[var(--muted)]">
            <tr>
              <AdminTh>{tAdmin("finance.orderTable.order")}</AdminTh>
              <AdminTh>{tAdmin("finance.orderTable.workspace")}</AdminTh>
              <AdminTh>{tAdmin("finance.orderTable.amount")}</AdminTh>
              <AdminTh>{tAdmin("finance.orderTable.provider")}</AdminTh>
              <AdminTh>{tAdmin("finance.orderTable.status")}</AdminTh>
              <AdminTh>{tAdmin("finance.orderTable.createdAt")}</AdminTh>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="bg-[var(--card)]">
                <AdminTd>
                  <div className="font-black text-[var(--text)]">{order.id}</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">{order.providerSessionId ?? "-"}</div>
                </AdminTd>
                <AdminTd>
                  <div className="font-black text-[var(--text)]">{adminBusinessSpaceName(order.workspaceName)}</div>
                  <div className="mt-0.5 text-[11px] text-[var(--muted)]">{order.ownerEmail ?? order.workspaceId}</div>
                </AdminTd>
                <AdminTd>
                  <div className="font-black text-[var(--text)]">¥{money(order.creditCny)}</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">
                    {order.paymentCurrency.toUpperCase()} {money(order.paymentAmount)}
                  </div>
                </AdminTd>
                <AdminTd>{order.provider}</AdminTd>
                <AdminTd><Badge tone={rechargeOrderTone(order.status)}>{rechargeOrderStatusLabel(order.status)}</Badge></AdminTd>
                <AdminTd>{formatDateTime(order.createdAt)}</AdminTd>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {orders.length === 0 ? <div className="p-4"><EmptyAdminDetail text={tAdmin("finance.emptyRechargeOrders")} /></div> : null}
    </>
  );
}

function AdminFinanceWalletTransactionsTable({ transactions }: { transactions: AdminWalletTransactionView[] }) {
  const [selectedTransaction, setSelectedTransaction] = useState<AdminWalletTransactionView | undefined>();
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left text-xs">
          <thead className="bg-[var(--panel2)] text-[var(--muted)]">
            <tr>
              <AdminTh>{tAdmin("finance.transactionTable.type")}</AdminTh>
              <AdminTh>{tAdmin("finance.transactionTable.workspace")}</AdminTh>
              <AdminTh>{tAdmin("finance.transactionTable.amount")}</AdminTh>
              <AdminTh>{tAdmin("finance.transactionTable.balance")}</AdminTh>
              <AdminTh>{tAdmin("finance.transactionTable.job")}</AdminTh>
              <AdminTh>{tAdmin("finance.transactionTable.createdAt")}</AdminTh>
              <AdminTh>{tAdmin("finance.transactionTable.action")}</AdminTh>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.id} className="bg-[var(--card)]">
                <AdminTd>
                  <Badge tone={transaction.amountCny < 0 ? "danger" : "ok"}>{adminWalletTransactionTypeLabel(transaction.type)}</Badge>
                  <div className="mt-1 text-[11px] text-[var(--muted)]">{transaction.description ?? transaction.id}</div>
                </AdminTd>
                <AdminTd>
                  <div className="font-black text-[var(--text)]">{adminBusinessSpaceName(transaction.workspaceName)}</div>
                  <div className="mt-0.5 text-[11px] text-[var(--muted)]">{transaction.ownerEmail ?? transaction.workspaceId}</div>
                </AdminTd>
                <AdminTd>
                  <strong className={transaction.amountCny < 0 ? "text-[var(--danger)]" : "text-[var(--ok)]"}>{transaction.amountCny < 0 ? "-" : "+"}¥{money(Math.abs(transaction.amountCny))}</strong>
                </AdminTd>
                <AdminTd>¥{money(transaction.balanceAfterCny)}</AdminTd>
                <AdminTd>{transaction.jobId ?? transaction.reservationId ?? "-"}</AdminTd>
                <AdminTd>{formatDateTime(transaction.createdAt)}</AdminTd>
                <AdminTd>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedTransaction(transaction)}>
                    <Database size={14} />
                    {tAdmin("finance.transactionTable.details")}
                  </Button>
                </AdminTd>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {transactions.length === 0 ? <div className="p-4"><EmptyAdminDetail text={tAdmin("finance.emptyWalletTransactions")} /></div> : null}
      <AdminWalletTransactionDetailDialog
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(undefined)}
      />
    </>
  );
}

function AdminWalletTransactionDetailDialog({
  onClose,
  transaction
}: {
  onClose: () => void;
  transaction?: AdminWalletTransactionView;
}) {
  if (!transaction) return null;
  const metadata = transaction.metadata ?? {};
  const priceSnapshot = adminRecordValue(metadata.priceSnapshot);
  const rows = adminWalletTransactionDetailRows(transaction, metadata, priceSnapshot);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(42,33,27,.35)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label={tAdmin("finance.transactionDetail.title")}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="grid w-full max-w-[680px] overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--card)] shadow-[0_24px_70px_rgba(42,33,27,.24)]">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={transaction.amountCny < 0 ? "danger" : "ok"}>{adminWalletTransactionTypeLabel(transaction.type)}</Badge>
              <span className="text-[12px] font-bold text-[var(--muted)]">{formatDateTime(transaction.createdAt)}</span>
            </div>
            <h2 className="m-0 mt-2 text-base font-black text-[var(--text)]">{tAdmin("finance.transactionDetail.title")}</h2>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label={tAdmin("finance.transactionDetail.close")} onClick={onClose}>
            <X size={15} />
          </Button>
        </header>
        <div className="grid gap-4 px-4 py-4">
          <div className="grid grid-cols-3 overflow-hidden rounded-[8px] border border-[var(--border)]">
            <AdminTransactionDetailMetric label={tAdmin("finance.transactionDetail.amount")} value={`${transaction.amountCny < 0 ? "-" : "+"}¥${money(Math.abs(transaction.amountCny))}`} />
            <AdminTransactionDetailMetric label={tAdmin("finance.transactionDetail.balanceAfter")} value={`¥${money(transaction.balanceAfterCny)}`} />
            <AdminTransactionDetailMetric label={tAdmin("finance.transactionDetail.reservedAfter")} value={`¥${money(transaction.reservedAfterCny)}`} />
          </div>
          <div className="grid gap-2">
            {rows.map((row) => (
              <AdminTransactionDetailRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function AdminTransactionDetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-r border-[var(--border)] bg-[var(--panel2)] px-3 py-2.5 last:border-r-0">
      <div className="truncate text-[10px] font-black uppercase text-[var(--muted)]">{label}</div>
      <div className="mt-1 truncate text-[17px] font-black tabular-nums text-[var(--text)]">{value}</div>
    </div>
  );
}

function AdminTransactionDetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-xs min-[560px]:grid-cols-[160px_minmax(0,1fr)] min-[560px]:items-center">
      <div className="font-black text-[var(--muted)]">{label}</div>
      <div className="min-w-0 break-words font-semibold text-[var(--text)]">{value}</div>
    </div>
  );
}

const billingUsageKinds: BillingUsageKind[] = ["text", "image", "video"];

function defaultBillingDrafts(): Record<BillingUsageKind, { serviceFeeCny: string; enabled: boolean }> {
  return {
    text: { serviceFeeCny: "0.20", enabled: true },
    image: { serviceFeeCny: "0.30", enabled: true },
    video: { serviceFeeCny: "1.00", enabled: true }
  };
}

function draftsFromBillingRules(rules: BillingPriceRuleView[]): Record<BillingUsageKind, { serviceFeeCny: string; enabled: boolean }> {
  const next = defaultBillingDrafts();
  for (const rule of rules) {
    next[rule.usageKind] = {
      serviceFeeCny: money(rule.serviceFeeCny),
      enabled: rule.enabled
    };
  }
  return next;
}

function billingUsageKindLabel(usageKind: BillingUsageKind): string {
  if (usageKind === "text") return tAdmin("paymentBilling.usageKinds.text");
  if (usageKind === "image") return tAdmin("paymentBilling.usageKinds.image");
  return tAdmin("paymentBilling.usageKinds.video");
}

function billingServiceFeeUnitLabel(usageKind: BillingUsageKind): string {
  if (usageKind === "text") return tAdmin("paymentBilling.serviceFeeUnits.perTextCall");
  if (usageKind === "image") return tAdmin("paymentBilling.serviceFeeUnits.perImage");
  return tAdmin("paymentBilling.serviceFeeUnits.perVideo");
}

function AdminMetricGrid({ overview }: { overview: AdminOverview }) {
  const metrics = [
    { label: tAdmin("overview.metrics.totalUsers"), value: overview.metrics.totalUsers, hint: tAdmin("overview.metrics.verifiedUsers", { count: overview.metrics.verifiedUsers }), icon: Users },
    { label: tAdmin("overview.metrics.newToday"), value: overview.metrics.newUsersToday, hint: tAdmin("overview.metrics.new7d", { count: overview.metrics.newUsers7d }), icon: CheckCircle2 },
    { label: tAdmin("overview.metrics.active7d"), value: overview.metrics.activeUsers7d, hint: tAdmin("overview.metrics.activeHint"), icon: Activity },
    { label: tAdmin("overview.metrics.workspaces"), value: overview.metrics.totalWorkspaces, hint: tAdmin("overview.metrics.siteWide"), icon: Database },
    { label: tAdmin("overview.metrics.products"), value: overview.metrics.totalProducts, hint: tAdmin("overview.metrics.productLibrary"), icon: BarChart3 },
    { label: tAdmin("overview.metrics.videoJobs"), value: overview.metrics.totalVideoJobs, hint: tAdmin("overview.metrics.generationRecords"), icon: Video }
  ];
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-label={tAdmin("overview.metricsAriaLabel")}>
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <Card key={metric.label} className="bg-[var(--card)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12px] font-black text-[var(--muted)]">{metric.label}</div>
                <div className="mt-1 text-2xl font-black tabular-nums leading-tight">{formatNumber(metric.value)}</div>
                <div className="mt-1 truncate text-[11px] font-semibold text-[var(--muted)]">{metric.hint}</div>
              </div>
              <span className="grid h-9 w-9 place-items-center rounded-[8px] bg-[var(--panel2)] text-[var(--accent)]">
                <Icon size={17} />
              </span>
            </div>
          </Card>
        );
      })}
    </section>
  );
}

function AdminCompactMetric({ hint, label, value }: { hint: string; label: string; value: number }) {
  return (
    <Card className="bg-[var(--card)] p-3">
      <div className="text-[12px] font-black text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-[22px] font-black tabular-nums leading-tight">{formatNumber(value)}</div>
      <div className="mt-1 truncate text-[11px] font-semibold text-[var(--muted)]">{hint}</div>
    </Card>
  );
}

function AdminPlaceholderSection({
  badge,
  icon,
  items,
  title
}: {
  badge: string;
  icon: React.ReactNode;
  items: string[];
  title: string;
}) {
  return (
    <Card className="bg-[var(--card)]">
      <CardHeader heading={title} icon={icon} right={<Badge>{badge}</Badge>} />
      <div className="grid gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item} className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--panel2)] px-3 py-4 text-center text-xs font-black text-[var(--muted)]">
            {item}
          </div>
        ))}
      </div>
    </Card>
  );
}

function AdminWorkbench({
  children,
  side,
  summary
}: {
  children: React.ReactNode;
  side?: React.ReactNode;
  summary?: React.ReactNode;
}) {
  return (
    <section className="grid min-h-0 gap-3">
      {summary ? <div className="min-w-0">{summary}</div> : null}
      <div className={cn(
        "grid min-h-0 gap-3",
        side ? "xl:grid-cols-[minmax(0,1fr)_360px]" : "xl:grid-cols-1"
      )}>
        <div className="min-w-0">{children}</div>
        {side ? <aside className="min-w-0">{side}</aside> : null}
      </div>
    </section>
  );
}

function AdminSummaryStrip({
  items
}: {
  items: Array<{ label: string; value: number | string; hint: string }>;
}) {
  return (
    <div className="grid overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)] sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 border-b border-[var(--border)] px-4 py-3 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0 xl:border-r xl:last:border-r-0">
          <div className="truncate text-[11px] font-black uppercase text-[var(--muted)]">{item.label}</div>
          <div className="mt-1 truncate text-[22px] font-black tabular-nums leading-tight">{typeof item.value === "number" ? formatNumber(item.value) : item.value}</div>
          <div className="mt-1 truncate text-[11px] font-semibold text-[var(--muted)]">{item.hint}</div>
        </div>
      ))}
    </div>
  );
}

function AdminSegmentedControl<T extends string>({
  onChange,
  options,
  value
}: {
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; count?: number }>;
  value: T;
}) {
  return (
    <div className="inline-flex min-w-0 flex-wrap gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--panel2)] p-1">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 rounded-[7px] px-3 text-xs font-black transition",
              selected ? "bg-[var(--accent)] text-white shadow-[0_8px_18px_rgba(10,163,148,.16)]" : "text-[var(--muted)] hover:bg-[var(--field)] hover:text-[var(--text)]"
            )}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
          >
            <span>{option.label}</span>
            {option.count !== undefined ? (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", selected ? "bg-white/20 text-white" : "bg-[var(--field)] text-[var(--muted)]")}>
                {formatNumber(option.count)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function AdminDataPanel({
  children,
  icon,
  right,
  title
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  title: string;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
      <div className="flex min-h-[58px] flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-3">
        <h2 className="m-0 flex min-w-0 items-center gap-2 text-[15px] font-black">
          {icon ? <span className="grid h-8 w-8 place-items-center rounded-[8px] bg-[var(--panel2)] text-[var(--accent)]">{icon}</span> : null}
          <span className="truncate">{title}</span>
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function AdminSidePanel({
  children,
  icon,
  title
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  title: string;
}) {
  return (
    <section className="min-w-0 rounded-[8px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
      <h2 className="m-0 mb-3 flex min-w-0 items-center gap-2 text-[15px] font-black">
        {icon ? <span className="grid h-8 w-8 place-items-center rounded-[8px] bg-[var(--panel2)] text-[var(--accent)]">{icon}</span> : null}
        <span className="truncate">{title}</span>
      </h2>
      {children}
    </section>
  );
}

function AdminDashboardSkeleton({ checkingSession }: { checkingSession: boolean }) {
  const label = checkingSession ? tAdmin("shell.checkingSession") : tAdmin("shell.refreshing");
  return (
    <section className="grid gap-4" aria-label={label}>
      <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-black text-[var(--muted)]">
        <RefreshCcw className="animate-spin text-[var(--accent)]" size={14} />
        {label}
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-label={tAdmin("overview.metricsPlaceholderAriaLabel")}>
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="bg-[var(--card)] p-3">
            <div className="grid gap-2">
              <div className="h-3 w-16 rounded bg-[var(--panel2)]" />
              <div className="h-7 w-12 rounded bg-[var(--panel2)]" />
              <div className="h-3 w-20 rounded bg-[var(--panel2)]" />
            </div>
          </Card>
        ))}
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <AdminSkeletonPanel />
        <AdminSkeletonPanel />
      </div>
      <Card className="overflow-hidden bg-[var(--card)] p-0">
        <div className="border-b border-[var(--border)] p-4">
          <div className="h-5 w-24 rounded bg-[var(--panel2)]" />
        </div>
        <div className="grid gap-3 p-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-10 rounded bg-[var(--panel2)]" />
          ))}
        </div>
      </Card>
    </section>
  );
}

function AdminSkeletonPanel() {
  return (
    <Card className="bg-[var(--card)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="h-5 w-24 rounded bg-[var(--panel2)]" />
        <div className="h-6 w-12 rounded-full bg-[var(--panel2)]" />
      </div>
      <div className="grid h-[280px] content-end gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--field)] p-4">
        <div className="h-[42%] w-full rounded bg-[var(--panel2)]" />
        <div className="h-[26%] w-full rounded bg-[var(--panel2)]" />
        <div className="h-[58%] w-full rounded bg-[var(--panel2)]" />
      </div>
    </Card>
  );
}

function AdminChart({ empty, option }: { empty: boolean; option: EChartsOption }) {
  if (empty) {
    return (
      <div className="grid h-[280px] place-items-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--panel2)] text-xs font-bold text-[var(--muted)]">
        {tAdmin("overview.empty")}
      </div>
    );
  }
  return (
    <ReactECharts
      className="min-w-0"
      option={option}
      notMerge
      lazyUpdate
      style={{ height: 280, width: "100%" }}
    />
  );
}

function AdminUsersPanel({
  globalSearch,
  loading,
  onOpenContent,
  onOpenFinance,
  onSelectUser,
  overview,
  rechargeOrders,
  selectedUser,
  selectedUserDetail,
  status,
  walletTransactions,
  wallets
}: {
  globalSearch: string;
  loading: boolean;
  onOpenContent: (user: AdminUserSummary) => void;
  onOpenFinance: (user: AdminUserSummary) => void;
  onSelectUser: (user: AdminUserSummary) => void;
  overview: AdminOverview;
  rechargeOrders: AdminRechargeOrderView[];
  selectedUser?: AdminUserSummary;
  selectedUserDetail?: AdminUserDetail;
  status: string;
  walletTransactions: AdminWalletTransactionView[];
  wallets: AdminWalletSummary[];
}) {
  const visibleUsers = filterAdminUsers(overview.users, globalSearch);
  return (
    <section className="grid min-h-0 gap-3">
      <div className="min-w-0">
        <AdminSummaryStrip
          items={[
            { label: tAdmin("users.users"), value: overview.metrics.totalUsers, hint: tAdmin("overview.metrics.verifiedUsers", { count: overview.metrics.verifiedUsers }) },
            { label: tAdmin("users.workspaces"), value: overview.metrics.totalWorkspaces, hint: tAdmin("users.siteWorkspaces") },
            { label: tAdmin("users.videoJobs"), value: overview.metrics.totalVideoJobs, hint: tAdmin("users.userGeneratedRecords") },
            { label: tAdmin("users.active7d"), value: overview.metrics.activeUsers7d, hint: tAdmin("overview.metrics.activeHint") }
          ]}
        />
      </div>
      <AdminUsersPanelFrame
        users={visibleUsers}
        selectedUserId={selectedUser?.id}
        selectedUserDetail={selectedUserDetail}
        loading={loading}
        rechargeOrders={rechargeOrders}
        status={status}
        walletTransactions={walletTransactions}
        wallets={wallets}
        onSelectUser={onSelectUser}
        onOpenContent={onOpenContent}
        onOpenFinance={onOpenFinance}
      />
    </section>
  );
}

function AdminUsersPanelFrame({
  loading,
  onSelectUser,
  onOpenContent,
  onOpenFinance,
  rechargeOrders,
  selectedUserId,
  selectedUserDetail,
  status,
  walletTransactions,
  wallets,
  users
}: {
  loading: boolean;
  onOpenContent: (user: AdminUserSummary) => void;
  onOpenFinance: (user: AdminUserSummary) => void;
  onSelectUser: (user: AdminUserSummary) => void;
  rechargeOrders: AdminRechargeOrderView[];
  selectedUserId?: string;
  selectedUserDetail?: AdminUserDetail;
  status: string;
  walletTransactions: AdminWalletTransactionView[];
  wallets: AdminWalletSummary[];
  users: AdminUserSummary[];
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
      <div className="flex min-h-[58px] items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-3">
        <h2 className="m-0 flex min-w-0 items-center gap-2 text-[15px] font-black">
          <span className="grid h-8 w-8 place-items-center rounded-[8px] bg-[var(--panel2)] text-[var(--accent)]"><Users size={16} /></span>
          <span className="truncate">{tAdmin("users.title")}</span>
        </h2>
        <Badge>{tAdmin("users.count", { count: users.length })}</Badge>
      </div>
      <AdminUsersTable
        users={users}
        selectedUserId={selectedUserId}
        selectedUserDetail={selectedUserDetail}
        loading={loading}
        rechargeOrders={rechargeOrders}
        status={status}
        walletTransactions={walletTransactions}
        wallets={wallets}
        onSelectUser={onSelectUser}
        onOpenContent={onOpenContent}
        onOpenFinance={onOpenFinance}
      />
    </section>
  );
}

function AdminUsersTable({
  loading,
  onOpenContent,
  onOpenFinance,
  onSelectUser,
  rechargeOrders,
  selectedUserId,
  selectedUserDetail,
  status,
  walletTransactions,
  wallets,
  users
}: {
  loading: boolean;
  onOpenContent: (user: AdminUserSummary) => void;
  onOpenFinance: (user: AdminUserSummary) => void;
  onSelectUser: (user: AdminUserSummary) => void;
  rechargeOrders: AdminRechargeOrderView[];
  selectedUserId?: string;
  selectedUserDetail?: AdminUserDetail;
  status: string;
  walletTransactions: AdminWalletTransactionView[];
  wallets: AdminWalletSummary[];
  users: AdminUserSummary[];
}) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-xs">
        <thead className="bg-[var(--panel2)] text-[var(--muted)]">
          <tr>
            <AdminTh>{tAdmin("users.columns.user")}</AdminTh>
            <AdminTh>{tAdmin("users.columns.status")}</AdminTh>
            <AdminTh>{tAdmin("users.columns.workspace")}</AdminTh>
            <AdminTh>{tAdmin("finance.totalBalance")}</AdminTh>
            <AdminTh>{tAdmin("finance.paidRecharge")}</AdminTh>
            <AdminTh>{tAdmin("users.workbench.spend")}</AdminTh>
            <AdminTh>{tAdmin("users.columns.videoJobs")}</AdminTh>
            <AdminTh>{tAdmin("users.columns.lastActive")}</AdminTh>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const selected = user.id === selectedUserId;
            return (
              <Fragment key={user.id}>
                <tr
                  tabIndex={0}
                  className={cn(
                    "cursor-pointer bg-[var(--card)] outline-none transition hover:bg-[var(--field2)] focus:bg-[var(--field2)] focus-visible:shadow-[inset_3px_0_0_var(--accent)]",
                    selected ? "bg-[color-mix(in_srgb,var(--accent)_7%,var(--card))] shadow-[inset_3px_0_0_var(--accent)]" : ""
                  )}
                  onClick={() => onSelectUser(user)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectUser(user);
                    }
                  }}
                >
                  <AdminTd>
                    <div className="max-w-[240px] truncate font-black text-[var(--text)]">{user.email}</div>
                    <div className="mt-0.5 max-w-[240px] truncate text-[11px] font-semibold text-[var(--muted)]">{user.displayName || user.id}</div>
                  </AdminTd>
                  <AdminTd>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={user.role === "admin" ? "ok" : "neutral"}>{user.role === "admin" ? tAdmin("users.roleAdmin") : tAdmin("users.roleUser")}</Badge>
                      <Badge tone={user.emailVerified ? "ok" : "warn"}>{user.emailVerified ? tAdmin("users.verified") : tAdmin("users.unverified")}</Badge>
                    </div>
                  </AdminTd>
                  <AdminTd>{formatNumber(user.workspaceCount)}</AdminTd>
                  <AdminTd>¥{money(user.totalBalanceCny)}</AdminTd>
                  <AdminTd>¥{money(user.totalRechargeCny)}</AdminTd>
                  <AdminTd>¥{money(user.totalSpendCny)}</AdminTd>
                  <AdminTd>{formatNumber(user.videoJobCount)}</AdminTd>
                  <AdminTd>{formatDateTime(user.lastActiveAt)}</AdminTd>
                </tr>
                {selected ? (
                  <tr className="bg-[color-mix(in_srgb,var(--accent)_4%,var(--card))]">
                    <td colSpan={8} className="border-b border-[var(--border)] p-0">
                      <AdminUserExpandedRow
                        detail={selectedUserDetail}
                        fallbackUser={user}
                        loading={loading}
                        rechargeOrders={rechargeOrders}
                        status={status}
                        walletTransactions={walletTransactions}
                        wallets={wallets}
                        onOpenContent={onOpenContent}
                        onOpenFinance={onOpenFinance}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AdminUserExpandedRow({
  detail,
  fallbackUser,
  loading,
  rechargeOrders,
  status,
  walletTransactions,
  wallets,
  onOpenContent,
  onOpenFinance
}: {
  detail?: AdminUserDetail;
  fallbackUser?: AdminUserSummary;
  loading: boolean;
  rechargeOrders: AdminRechargeOrderView[];
  status: string;
  walletTransactions: AdminWalletTransactionView[];
  wallets: AdminWalletSummary[];
  onOpenContent: (user: AdminUserSummary) => void;
  onOpenFinance: (user: AdminUserSummary) => void;
}) {
  if (!fallbackUser) {
    return (
      <section className="p-4">
        <div className="grid min-h-[120px] place-items-center">
          <EmptyAdminDetail text={tAdmin("users.workbench.emptyHint")} />
        </div>
      </section>
    );
  }
  const user = detail?.user ?? fallbackUser;
  const statusEntries = Object.entries(detail?.videoStatusCounts ?? {}).sort(([left], [right]) => left.localeCompare(right));
  const userWallets = adminWalletsForUserDetail(detail, wallets);
  const userRechargeOrders = adminRechargeOrdersForUserDetail(detail, rechargeOrders);
  const userWalletTransactions = adminWalletTransactionsForUserDetail(detail, walletTransactions);
  const finance = adminUserFinanceSnapshot(userWallets, userRechargeOrders, userWalletTransactions);
  const recentJobs = detail?.videoJobs.slice(0, 3) ?? [];
  const recentProducts = detail?.products.slice(0, 3) ?? [];

  return (
    <section className="admin-user-expanded-profile grid gap-0 bg-[var(--field)]">
      {loading ? (
        <div className="grid min-h-[96px] place-items-center border-b border-dashed border-[var(--border)] bg-[var(--panel2)] px-4 py-5">
          <div className="grid justify-items-center gap-2 text-xs font-black text-[var(--muted)]">
            <RefreshCcw className="animate-spin text-[var(--accent)]" size={24} />
            {tAdmin("users.drawer.loading")}
          </div>
        </div>
      ) : null}

      {status ? <AdminStatus status={status} /> : null}

      <header className="grid gap-4 border-b border-[var(--border)] bg-[var(--card)] px-4 py-4 min-[980px]:grid-cols-[minmax(280px,1fr)_minmax(520px,1.25fr)] min-[980px]:items-center">
        <div className="min-w-0 border-l-4 border-[var(--accent)] pl-3">
          <div className="truncate text-[18px] font-black leading-tight text-[var(--text)]">{user.email}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={user.role === "admin" ? "ok" : "neutral"}>{user.role === "admin" ? tAdmin("users.roleAdmin") : tAdmin("users.roleUser")}</Badge>
            <Badge tone={user.emailVerified ? "ok" : "warn"}>{user.emailVerified ? tAdmin("users.verified") : tAdmin("users.unverified")}</Badge>
          </div>
          <div className="mt-3 grid gap-x-5 gap-y-1 text-[12px] font-semibold leading-5 text-[var(--muted)] min-[720px]:grid-cols-2">
            <span>{tAdmin("users.columns.createdAt")} {formatDateTime(user.createdAt)}</span>
            <span>{tAdmin("users.columns.lastActive")} {formatDateTime(user.lastActiveAt)}</span>
          </div>
        </div>
        <div className="grid gap-y-3 border-t border-[var(--border)] pt-3 min-[620px]:grid-cols-4 min-[980px]:border-t-0 min-[980px]:pt-0">
          <AdminHeaderMetric label={tAdmin("users.workspaces")} value={user.workspaceCount} />
          <AdminHeaderMetric label={tAdmin("users.columns.products")} value={user.productCount} />
          <AdminHeaderMetric label={tAdmin("users.videoJobs")} value={user.videoJobCount} />
          <AdminHeaderMetric label={tAdmin("finance.totalBalance")} value={`¥${money(finance.totalBalanceCny)}`} emphasis />
        </div>
      </header>

      {detail ? (
        <div className="grid gap-0 divide-y divide-[var(--border)] bg-[var(--card)] min-[1180px]:grid-cols-[0.95fr_1.35fr_0.95fr] min-[1180px]:divide-x min-[1180px]:divide-y-0">
          <AdminUserDetailColumn
            title={tAdmin("users.profile.businessContext")}
            right={<span className="shrink-0 text-[11px] font-black text-[var(--muted)]">{tAdmin("users.profile.contextSummary", {
              workspaces: detail.workspaces.length,
              products: detail.products.length,
              jobs: detail.videoJobs.length
            })}</span>}
          >
            <AdminWorkspaceMiniList workspaces={detail.workspaces.slice(0, 3)} />
            <AdminProductMiniList products={recentProducts} />
          </AdminUserDetailColumn>

          <AdminUserDetailColumn title={tAdmin("users.profile.videoHealth")} right={<Badge>{tAdmin("users.drawer.statusKinds", { count: statusEntries.length })}</Badge>}>
            <div className="flex flex-wrap gap-1.5">
              {statusEntries.length > 0 ? statusEntries.map(([name, count]) => (
                <Badge key={name} tone={adminJobStatusTone(name)}>{adminJobStatusLabel(name)} {formatNumber(count)}</Badge>
              )) : <span className="text-xs font-semibold text-[var(--muted)]">{tAdmin("users.drawer.emptyVideoJobs")}</span>}
            </div>
            <div className="grid gap-2">
              {recentJobs.map((job) => <AdminVideoJobCard key={job.id} job={job} />)}
              {recentJobs.length === 0 ? <EmptyAdminDetail text={tAdmin("users.drawer.emptyVideoJobs")} /> : null}
            </div>
          </AdminUserDetailColumn>

          <AdminUserDetailColumn title={tAdmin("users.profile.recentLedger")} right={<Badge>{tAdmin("finance.transactionCount", { count: userWalletTransactions.length })}</Badge>}>
            <div className="grid grid-cols-3 overflow-hidden rounded-[8px] border border-[var(--border)]">
              <AdminInlineMetric label={tAdmin("finance.paidRecharge")} value={`¥${money(finance.totalRechargeCny)}`} />
              <AdminInlineMetric label={tAdmin("users.workbench.spend")} value={`¥${money(finance.totalSpendCny)}`} />
              <AdminInlineMetric label={tAdmin("finance.walletTransactions")} value={userWalletTransactions.length} />
            </div>
            <AdminUserRecentLedgerList transactions={userWalletTransactions.slice(0, 4)} />
          </AdminUserDetailColumn>
        </div>
      ) : !loading ? <div className="p-4"><EmptyAdminDetail text={tAdmin("users.workbench.loadHint")} /></div> : null}

      {detail ? (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--panel)] px-4 py-3">
          <div className="min-w-0 text-xs font-semibold text-[var(--muted)]">
            {tAdmin("users.drawer.registered", { date: formatDateTime(user.createdAt), lastActive: formatDateTime(user.lastActiveAt) })}
          </div>
          <div className="grid w-full grid-cols-2 gap-2 min-[760px]:w-auto min-[760px]:min-w-[420px]">
            <Button type="button" onClick={() => onOpenContent(user)}>
              <Video size={14} />
              {tAdmin("users.profile.openContent")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => onOpenFinance(user)}>
              <CreditCard size={14} />
              {tAdmin("users.profile.openFinance")}
            </Button>
          </div>
        </footer>
      ) : null}
    </section>
  );
}

function AdminUserDetailColumn({
  children,
  right,
  title
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  title: string;
}) {
  return (
    <section className="grid min-w-0 content-start gap-3 px-4 py-4">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h3 className="m-0 truncate text-[12px] font-black uppercase text-[var(--muted)]">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function AdminHeaderMetric({ emphasis, label, value }: { emphasis?: boolean; label: string; value: number | string }) {
  return (
    <div className="min-w-0 border-l border-[var(--border)] pl-4 first:border-l-0 first:pl-0 max-[619px]:border-l-0 max-[619px]:pl-0">
      <div className="truncate text-[10px] font-black uppercase text-[var(--muted)]">{label}</div>
      <div className={cn("mt-1 truncate text-xl font-black tabular-nums leading-tight", emphasis ? "text-[var(--accent)]" : "text-[var(--text)]")}>
        {typeof value === "number" ? formatNumber(value) : value}
      </div>
    </div>
  );
}

function AdminInlineMetric({ emphasis, label, value }: { emphasis?: boolean; label: string; value: number | string }) {
  return (
    <div className="min-w-0 border-r border-[var(--border)] bg-[var(--panel2)] px-3 py-2.5 last:border-r-0">
      <div className="truncate text-[10px] font-black uppercase text-[var(--muted)]">{label}</div>
      <div className={cn("mt-1 truncate text-[17px] font-black tabular-nums leading-tight", emphasis ? "text-[var(--accent)]" : "text-[var(--text)]")}>
        {typeof value === "number" ? formatNumber(value) : value}
      </div>
    </div>
  );
}

function AdminWorkspaceMiniList({ workspaces }: { workspaces: AdminUserWorkspaceSummary[] }) {
  return (
    <div className="grid gap-2">
      {workspaces.map((workspace) => (
        <div key={workspace.id} className="grid gap-2 border-b border-[var(--border)] pb-2 last:border-b-0 last:pb-0">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <strong className="min-w-0 truncate text-sm text-[var(--text)]">{adminBusinessSpaceName(workspace.name)}</strong>
            <Badge>{workspace.role}</Badge>
          </div>
          <div className="grid grid-cols-3 overflow-hidden rounded-[8px] border border-[var(--border)]">
            <AdminMiniFact label={tAdmin("users.drawer.products")} value={workspace.productCount} />
            <AdminMiniFact label={tAdmin("users.drawer.videoJobs")} value={workspace.videoJobCount} />
            <AdminMiniFact label={tAdmin("users.drawer.membersLabel")} value={workspace.memberCount} />
          </div>
        </div>
      ))}
      {workspaces.length === 0 ? <EmptyAdminDetail text={tAdmin("users.drawer.emptyWorkspaces")} /> : null}
    </div>
  );
}

function AdminMiniFact({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-0 border-r border-[var(--border)] bg-[var(--panel2)] px-2 py-1.5 last:border-r-0">
      <div className="truncate text-[10px] font-black text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 truncate text-sm font-black tabular-nums text-[var(--text)]">{typeof value === "number" ? formatNumber(value) : value}</div>
    </div>
  );
}

function AdminProductMiniList({ products }: { products: AdminUserProductSummary[] }) {
  return (
    <div className="grid gap-2 border-t border-[var(--border)] pt-3">
      <div className="text-[11px] font-black uppercase text-[var(--muted)]">{tAdmin("users.drawer.recentProducts")}</div>
      {products.map((product) => (
        <div key={product.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-xs">
          <div className="min-w-0">
            <div className="truncate font-black text-[var(--text)]">{product.sku}</div>
            <div className="mt-0.5 truncate font-semibold text-[var(--muted)]">{product.title ?? product.id}</div>
          </div>
          <span className="whitespace-nowrap font-semibold text-[var(--muted)]">{formatDateTime(product.updatedAt)}</span>
        </div>
      ))}
      {products.length === 0 ? <EmptyAdminDetail text={tAdmin("users.drawer.emptyProducts")} /> : null}
    </div>
  );
}

function AdminUserRecentLedgerList({ transactions }: { transactions: AdminWalletTransactionView[] }) {
  return (
    <section className="grid gap-2">
      {transactions.map((transaction) => (
        <div key={transaction.id} className="grid gap-1 border-b border-[var(--border)] pb-2 text-xs last:border-b-0 last:pb-0">
          <div className="flex items-center justify-between gap-2">
            <Badge tone={transaction.amountCny < 0 ? "danger" : "ok"}>{adminWalletTransactionTypeLabel(transaction.type)}</Badge>
            <strong className={transaction.amountCny < 0 ? "text-[var(--danger)]" : "text-[var(--ok)]"}>{transaction.amountCny < 0 ? "-" : "+"}¥{money(Math.abs(transaction.amountCny))}</strong>
          </div>
          <div className="truncate font-semibold text-[var(--muted)]">{transaction.description ?? transaction.id}</div>
          <div className="truncate text-[11px] font-semibold text-[var(--muted)]">{formatDateTime(transaction.createdAt)}</div>
        </div>
      ))}
      {transactions.length === 0 ? <EmptyAdminDetail text={tAdmin("finance.emptyWalletTransactions")} /> : null}
    </section>
  );
}

function AdminVideoJobCard({ job }: { job: AdminUserVideoJobSummary }) {
  const error = job.readableError ?? job.error;
  return (
    <article className="grid min-w-0 gap-3 rounded-lg border border-[var(--border)] bg-[var(--field)] p-3 text-xs min-[720px]:grid-cols-[minmax(0,1fr)_148px]">
      <div className="min-w-0">
        <div className="break-words font-black leading-5 text-[var(--text)]">{job.productSku ?? job.id}</div>
        <div className="mt-1 break-words font-semibold leading-5 text-[var(--muted)]">
          {job.model ?? "-"} / {job.language ?? "-"} / {formatDuration(job.durationSeconds)}
        </div>
        <div className="mt-1 break-words font-semibold leading-5 text-[var(--muted)]">
          {tAdmin("users.drawer.createdCompleted", { created: formatDateTime(job.createdAt), completed: formatDateTime(job.completedAt) })}
        </div>
        {error ? (
          <div className="mt-2 flex min-w-0 items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-2.5 py-2 font-bold leading-5 text-red-700">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        ) : null}
      </div>
      <AdminJobMetaRail job={job} />
    </article>
  );
}

function AdminJobMetaRail({ job }: { job: AdminUserVideoJobSummary }) {
  return (
    <div className="grid min-w-0 grid-cols-3 gap-1.5 min-[720px]:grid-cols-1 min-[720px]:content-start">
      <span
        className={cn(
          "grid min-h-8 place-items-center rounded-[8px] border px-2 text-center text-[11px] font-black leading-4",
          adminJobStatusToneClass(job.status)
        )}
      >
        {adminJobStatusLabel(job.status)}
      </span>
      <span className="admin-provider-chip min-w-0 truncate rounded-[8px] border border-[var(--border)] bg-[var(--panel2)] px-2 py-2 text-center text-[11px] font-black leading-4 text-[var(--muted)]">
        {job.provider ?? "-"}
      </span>
      <span className="rounded-[8px] border border-[var(--border)] bg-[var(--panel2)] px-2 py-2 text-center text-[11px] font-black leading-4 text-[var(--muted)]">
        {tAdmin("users.drawer.outputs", { count: formatNumber(job.outputCount) })}
      </span>
    </div>
  );
}

function DetailMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex items-center gap-2 text-[12px] font-black text-[var(--muted)]">
        <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-[var(--panel2)] text-[var(--accent)]">{icon}</span>
        {label}
      </div>
      <div className="text-lg font-black leading-tight">{typeof value === "number" ? formatNumber(value) : value}</div>
    </div>
  );
}

function EmptyAdminDetail({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--panel2)] p-4 text-center text-xs font-bold text-[var(--muted)]">
      {text}
    </div>
  );
}

function AdminForbidden({ email, isBusy, onLogout }: { email?: string; isBusy: boolean; onLogout: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--bg)] px-4 py-8 text-[var(--text)]">
      <Card className="w-full max-w-[460px] bg-[var(--panel)] p-5">
        <div className="grid gap-3 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-[10px] bg-red-50 text-[var(--danger)]">
            <ShieldAlert size={24} />
          </div>
          <div>
            <h1 className="m-0 text-xl font-black">{tAdmin("forbidden.title")}</h1>
            <p className="m-0 mt-2 text-xs font-semibold leading-5 text-[var(--muted)]">{tAdmin("forbidden.description", { email: email ?? tAdmin("forbidden.fallbackAccount") })}</p>
          </div>
          <div className="flex justify-center gap-2">
            <Button asChild>
              <a href="/console">{tAdmin("forbidden.backToConsole")}</a>
            </Button>
            <Button variant="ghost" disabled={isBusy} onClick={onLogout}>
              <LogOut size={14} />
              {tAdmin("shell.logout")}
            </Button>
          </div>
        </div>
      </Card>
    </main>
  );
}

function AdminStatus({ status }: { status: string }) {
  if (!status) return null;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3 text-xs font-semibold leading-5 text-[var(--muted)]">
      {status}
    </div>
  );
}

function AdminTh({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-[var(--border)] px-3 py-2 font-black">{children}</th>;
}

function AdminTd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("border-b border-[var(--border)] px-3 py-3 align-middle font-semibold", className)}>{children}</td>;
}

function buildGrowthOption(overview?: AdminOverview): EChartsOption {
  const rows = overview?.growth ?? [];
  return {
    color: ["#0aa394"],
    grid: { left: 36, right: 18, top: 22, bottom: 34 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: rows.map((row) => row.date.slice(5)),
      axisLine: { lineStyle: { color: "#dbc2ab" } },
      axisLabel: { color: "#76685c" }
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: { color: "#76685c" },
      splitLine: { lineStyle: { color: "#ead7c4" } }
    },
    series: [{
      name: tAdmin("overview.charts.registrations"),
      type: "bar",
      barMaxWidth: 18,
      data: rows.map((row) => row.registrations),
      itemStyle: { borderRadius: [4, 4, 0, 0] }
    }]
  };
}

function buildActivityOption(overview?: AdminOverview): EChartsOption {
  const rows = overview?.activity ?? [];
  return {
    color: ["#c65a36", "#0aa394"],
    grid: { left: 36, right: 18, top: 22, bottom: 62 },
    tooltip: { trigger: "axis" },
    legend: {
      bottom: 4,
      textStyle: { color: "#76685c", fontWeight: 700 }
    },
    xAxis: {
      type: "category",
      data: rows.map((row) => row.date.slice(5)),
      axisLine: { lineStyle: { color: "#dbc2ab" } },
      axisLabel: { color: "#76685c" }
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: { color: "#76685c" },
      splitLine: { lineStyle: { color: "#ead7c4" } }
    },
    series: [
      {
        name: tAdmin("overview.charts.activeUsers"),
        type: "line",
        smooth: true,
        data: rows.map((row) => row.activeUsers)
      },
      {
        name: tAdmin("overview.charts.events"),
        type: "bar",
        barMaxWidth: 16,
        data: rows.map((row) => row.events),
        itemStyle: { borderRadius: [4, 4, 0, 0] }
      }
    ]
  };
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin" });
  return readJsonResponse<T>(response, path);
}

async function loadAdminModule<T>(
  moduleName: string,
  load: () => Promise<T>,
  apply: (value: T) => void,
  failedModules: string[]
): Promise<void> {
  try {
    apply(await load());
  } catch (error) {
    if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
      throw error;
    }
    failedModules.push(moduleName);
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return readJsonResponse<T>(response, path);
}

async function putJson<T = unknown>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return readJsonResponse<T>(response, path);
}

async function readJsonResponse<T>(response: Response, requestPath?: string): Promise<T> {
  if (!response.ok) {
    notifyAuthenticationRequired(response, requestPath);
  }
  const body = await response.json();
  if (!response.ok) {
    throw new HttpError(body.error || `HTTP ${response.status}`, response.status);
  }
  notifyAuthenticationEstablished(response, requestPath, body);
  return body as T;
}

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatNumber(value?: number) {
  if (value === undefined || value === null) return "-";
  return new Intl.NumberFormat("zh-CN").format(value);
}

function money(value?: number) {
  return Number(value || 0).toFixed(2);
}

function formatDuration(value?: number) {
  return value === undefined ? "-" : `${value}s`;
}

function adminBusinessSpaceName(name?: string): string {
  return (name ?? "-").replace(/工作区/g, "业务空间").replace(/\bWorkspace\b/g, "Space");
}

function adminSearchMatch(query: string, values: Array<string | undefined>): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return values.some((value) => (value ?? "").toLowerCase().includes(normalizedQuery));
}

function filterAdminContentProducts(products: AdminContentProductView[], query: string): AdminContentProductView[] {
  return products.filter((product) => adminSearchMatch(query, [
    product.sku,
    product.title,
    product.workspaceId,
    product.workspaceName,
    product.ownerEmail
  ]));
}

function filterAdminUsers(users: AdminUserSummary[], query: string): AdminUserSummary[] {
  return users.filter((user) => adminSearchMatch(query, [
    user.id,
    user.email,
    user.displayName,
    user.role
  ]));
}

function filterAdminContentVideoJobs(videoJobs: AdminContentVideoJobView[], query: string): AdminContentVideoJobView[] {
  return videoJobs.filter((job) => adminSearchMatch(query, [
    job.id,
    job.productSku,
    job.productTitle,
    job.workspaceId,
    job.workspaceName,
    job.ownerEmail,
    job.status,
    job.model
  ]));
}

function filterAdminWallets(wallets: AdminWalletSummary[], query: string): AdminWalletSummary[] {
  return wallets.filter((wallet) => adminSearchMatch(query, [
    wallet.workspaceId,
    wallet.workspaceName,
    wallet.ownerEmail
  ]));
}

function filterAdminRechargeOrders(orders: AdminRechargeOrderView[], query: string): AdminRechargeOrderView[] {
  return orders.filter((order) => adminSearchMatch(query, [
    order.id,
    order.workspaceId,
    order.workspaceName,
    order.ownerEmail,
    order.provider,
    order.status
  ]));
}

function filterAdminWalletTransactions(transactions: AdminWalletTransactionView[], query: string): AdminWalletTransactionView[] {
  return transactions.filter((transaction) => adminSearchMatch(query, [
    transaction.id,
    transaction.workspaceId,
    transaction.workspaceName,
    transaction.ownerEmail,
    transaction.type,
    transaction.description,
    transaction.jobId,
    transaction.reservationId
  ]));
}

function adminWorkspaceIdsForUserDetail(detail?: AdminUserDetail): Set<string> {
  return new Set((detail?.workspaces ?? []).map((workspace) => workspace.id));
}

function adminWalletsForUserDetail(detail: AdminUserDetail | undefined, wallets: AdminWalletSummary[]): AdminWalletSummary[] {
  const workspaceIds = adminWorkspaceIdsForUserDetail(detail);
  return wallets.filter((wallet) => workspaceIds.has(wallet.workspaceId));
}

function adminRechargeOrdersForUserDetail(detail: AdminUserDetail | undefined, orders: AdminRechargeOrderView[]): AdminRechargeOrderView[] {
  const workspaceIds = adminWorkspaceIdsForUserDetail(detail);
  return orders.filter((order) => workspaceIds.has(order.workspaceId));
}

function adminWalletTransactionsForUserDetail(detail: AdminUserDetail | undefined, transactions: AdminWalletTransactionView[]): AdminWalletTransactionView[] {
  const workspaceIds = adminWorkspaceIdsForUserDetail(detail);
  return transactions.filter((transaction) => workspaceIds.has(transaction.workspaceId));
}

function adminUserFinanceSnapshot(
  wallets: AdminWalletSummary[],
  rechargeOrders: AdminRechargeOrderView[],
  walletTransactions: AdminWalletTransactionView[]
): { totalBalanceCny: number; totalRechargeCny: number; totalSpendCny: number } {
  return {
    totalBalanceCny: wallets.reduce((total, wallet) => total + wallet.balanceCny, 0),
    totalRechargeCny: rechargeOrders
      .filter((order) => order.status === "paid")
      .reduce((total, order) => total + order.creditCny, 0),
    totalSpendCny: walletTransactions
      .filter((transaction) => transaction.amountCny < 0)
      .reduce((total, transaction) => total + Math.abs(transaction.amountCny), 0)
  };
}

function adminWalletTransactionDetailRows(
  transaction: AdminWalletTransactionView,
  metadata: Record<string, unknown>,
  priceSnapshot: Record<string, unknown> | undefined
): Array<{ label: string; value: React.ReactNode }> {
  const paymentRows = [
    { label: tAdmin("finance.transactionDetail.paymentMethod"), value: adminDetailText(metadata.paymentMethodLabel), rawValue: metadata.paymentMethodLabel },
    { label: tAdmin("finance.transactionDetail.paymentCurrency"), value: adminDetailText(metadata.paymentCurrency), rawValue: metadata.paymentCurrency },
    { label: tAdmin("finance.transactionDetail.cryptoCurrency"), value: adminDetailText(metadata.cryptoCurrency), rawValue: metadata.cryptoCurrency },
    { label: tAdmin("finance.transactionDetail.cryptoNetwork"), value: adminDetailText(metadata.cryptoNetwork), rawValue: metadata.cryptoNetwork },
    { label: tAdmin("finance.transactionDetail.cryptoTxHash"), value: adminDetailText(metadata.cryptoTxHash ?? metadata.cryptoTxHashShort), rawValue: metadata.cryptoTxHash ?? metadata.cryptoTxHashShort },
    { label: tAdmin("finance.transactionDetail.stripeCharge"), value: adminDetailText(metadata.stripeChargeId), rawValue: metadata.stripeChargeId }
  ].filter((row) => adminHasDetailValue(row.rawValue));
  return [
    { label: tAdmin("finance.transactionDetail.workspace"), value: `${adminBusinessSpaceName(transaction.workspaceName)} / ${transaction.ownerEmail ?? transaction.workspaceId}` },
    { label: tAdmin("finance.transactionDetail.description"), value: transaction.description ?? transaction.id },
    ...paymentRows.map(({ label, value }) => ({ label, value })),
    { label: tAdmin("finance.transactionDetail.billingMode"), value: adminDetailText(metadata.apiBillingMode) },
    { label: tAdmin("finance.transactionDetail.usageKind"), value: adminDetailText(metadata.usageKind ?? priceSnapshot?.kind) },
    { label: tAdmin("finance.transactionDetail.model"), value: adminDetailText(metadata.model ?? priceSnapshot?.requestedModel ?? priceSnapshot?.model) },
    { label: tAdmin("finance.transactionDetail.serviceFee"), value: adminMoneyText(metadata.platformFeeCny) },
    { label: tAdmin("finance.transactionDetail.upstreamCost"), value: adminMoneyText(metadata.upstreamActualCostCny ?? metadata.upstreamCostCny ?? metadata.upstreamEstimatedCostCny) },
    { label: tAdmin("finance.transactionDetail.units"), value: adminDetailText(metadata.actualUnits ?? metadata.estimatedUnits ?? priceSnapshot?.totalTokens) },
    { label: tAdmin("finance.transactionDetail.catalogVersion"), value: adminDetailText(priceSnapshot?.catalogVersion) },
    { label: tAdmin("finance.transactionDetail.unitPrice"), value: adminMoneyText(priceSnapshot?.unitPriceCny ?? priceSnapshot?.inputPriceCnyPerMillion ?? priceSnapshot?.outputPriceCnyPerMillion ?? priceSnapshot?.videoTokenPriceCnyPerMillion) },
    { label: tAdmin("finance.transactionDetail.source"), value: adminSourceLink(priceSnapshot?.sourceUrl) },
    { label: tAdmin("finance.transactionDetail.job"), value: adminDetailText(transaction.jobId ?? transaction.reservationId) }
  ];
}

function adminRecordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function adminDetailText(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function adminHasDetailValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function adminMoneyText(value: unknown): string {
  return typeof value === "number" ? `¥${money(value)}` : adminDetailText(value);
}

function adminSourceLink(value: unknown): React.ReactNode {
  const href = typeof value === "string" ? value : "";
  if (!href) return "-";
  return <a className="font-black text-[var(--accent)] hover:underline" href={href} target="_blank" rel="noreferrer">{href}</a>;
}

function adminWalletTransactionTypeLabel(type?: string) {
  if (type === "adjustment") return tAdmin("finance.transactionTypes.adjustment");
  if (type === "bonus") return tAdmin("finance.transactionTypes.bonus");
  if (type === "charge") return tAdmin("finance.transactionTypes.charge");
  if (type === "recharge") return tAdmin("finance.transactionTypes.recharge");
  if (type === "refund") return tAdmin("finance.transactionTypes.refund");
  if (type === "reserve") return tAdmin("finance.transactionTypes.reserve");
  return "-";
}

function rechargeOrderTone(status: string): "neutral" | "ok" | "danger" | "warn" {
  if (status === "paid") return "ok";
  if (status === "failed" || status === "expired") return "danger";
  if (status === "pending") return "warn";
  return "neutral";
}

function rechargeOrderStatusLabel(status: string): string {
  if (status === "paid") return tAdmin("finance.rechargeStatus.paid");
  if (status === "pending") return tAdmin("finance.rechargeStatus.pending");
  if (status === "expired") return tAdmin("finance.rechargeStatus.expired");
  if (status === "failed") return tAdmin("finance.rechargeStatus.failed");
  return status;
}

function modelPricingKindLabel(kind: AdminModelPricingKind): string {
  if (kind === "text") return tAdmin("modelPricing.kinds.text");
  if (kind === "image") return tAdmin("modelPricing.kinds.image");
  return tAdmin("modelPricing.kinds.video");
}

function modelPricingProviderLabel(providerId: AdminModelPricingProviderId): string {
  if (providerId === "openai") return "OpenAI";
  if (providerId === "deepseek") return "DeepSeek";
  if (providerId === "gemini") return "Gemini";
  return tAdmin("modelPricing.volcengine");
}

function modelPricingSourceLabel(source: AdminModelPricingCatalogResponse["active"]["source"]): string {
  if (source === "database") return tAdmin("modelPricing.sources.database");
  return tAdmin("modelPricing.sources.builtIn");
}

function nextModelPricingVersion(currentVersion: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return currentVersion === today ? `${today}-draft` : today;
}

function siteSettingsTone(status: "configured" | "attention" | "planned"): "neutral" | "ok" | "warn" {
  if (status === "configured") return "ok";
  if (status === "attention") return "warn";
  return "neutral";
}

function siteSettingsStatusLabel(status: "configured" | "attention" | "planned"): string {
  if (status === "configured") return tAdmin("siteSettings.status.configured");
  if (status === "attention") return tAdmin("siteSettings.status.attention");
  return tAdmin("siteSettings.status.planned");
}

function adminJobStatusTone(status: string): "neutral" | "ok" | "danger" | "warn" {
  if (status === "completed") return "ok";
  if (status === "failed" || status === "canceled") return "danger";
  if (status === "queued" || status === "running") return "warn";
  return "neutral";
}

function adminJobStatusToneClass(status: string): string {
  const tone = adminJobStatusTone(status);
  if (tone === "ok") return "border-emerald-200 bg-emerald-50 text-[var(--ok)]";
  if (tone === "danger") return "border-red-200 bg-red-50 text-[var(--danger)]";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-[var(--warn)]";
  return "border-[var(--border)] bg-[var(--panel2)] text-[var(--muted)]";
}

function adminJobStatusLabel(status: string) {
  if (status === "canceled") return tAdmin("jobStatus.canceled");
  if (status === "completed") return tAdmin("jobStatus.completed");
  if (status === "expired") return tAdmin("jobStatus.expired");
  if (status === "failed") return tAdmin("jobStatus.failed");
  if (status === "queued") return tAdmin("jobStatus.queued");
  if (status === "running") return tAdmin("jobStatus.running");
  if (status === "unknown") return tAdmin("jobStatus.unknown");
  return status;
}
