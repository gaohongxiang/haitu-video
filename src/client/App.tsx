import {
  AlertTriangle,
  BadgeJapaneseYen,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clapperboard,
  Clock,
  ClipboardCheck,
  Copy,
  CreditCard,
  Database,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FileSpreadsheet,
  FileArchive,
  FileVideo,
  Gauge,
  Globe2,
  Image as ImageIcon,
  Languages,
  Plus,
  KeyRound,
  LayoutDashboard,
  Monitor,
  Package,
  MailCheck,
  Play,
  RectangleHorizontal,
  RefreshCcw,
  Rows3,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  StopCircle,
  WalletCards,
  X
} from "lucide-react";
import ReactEChartsCore from "echarts-for-react/esm/core.js";
import * as echartsCore from "echarts/core";
import type { EChartsOption } from "echarts";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { FormEvent, ReactNode, type CSSProperties, type ClipboardEvent, type ComponentType, type Dispatch, type DragEvent, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "./components/ui/badge.js";
import { Button } from "./components/ui/button.js";
import { Card, CardHeader } from "./components/ui/card.js";
import { Field, Input, Select, Textarea } from "./components/ui/field.js";
import { ApiModelConfigPanel } from "./components/apiModelConfigPanel.js";
import { CompactChoiceDropdown } from "./components/compactChoiceDropdown.js";
import {
  consoleSectionFromUrl,
  consoleSectionUrl,
  defaultConsoleSection,
  productStudioProductSkuFromUrl,
  productStudioProductUrl,
  type ConsoleSection
} from "./consoleNavigation.js";
import {
  detectCompletedVideoJobTransitions,
  isActiveVideoJobStatus,
  type CompletedVideoJobTransitions
} from "./videoJobRefresh.js";
import {
  buildLatestCreativeJobs,
  hasPlayableVideo,
  isActiveCreativeVersion,
  isExpiredVideo,
  mergeLedgerJobs,
  mergeVideoJobs,
  removeLedgerJob,
  type CreativeVersionItem,
  type JobContentReviewSnapshot,
  type Ledger,
  type LedgerJob,
  type ProductGroup,
  type VideoJob
} from "./videoCreativeVersions.js";
import {
  buildDashboardAnalytics,
  type DashboardAnalytics,
  type DashboardGranularity,
  type DashboardRange,
} from "./dashboardAnalytics.js";
import {
  buildProviderChartOption,
  buildRecentChartOption,
  buildTrendChartOption
} from "./dashboardChartOptions.js";
import {
  dedupeProductSummaries,
  fileImportCanSelect,
  fileImportProductIdLabel,
  fileImportRowLabel,
  fileImportRowTone,
  fileImportSourceRowsLabel,
  isProductImportFile,
  productActionSummary,
  productReferenceCount,
  type ProductAutoSaveStatus,
  type ProductDetail,
  type ProductFactsResponse,
  type ProductFileImportRow,
  type ProductFileImportRowStatus,
  type ProductImportQuality,
  type ProductSummary,
  type ReferenceImageStatus,
  type StoryboardDraftSource
} from "./productWorkflowViewModel.js";
import {
  isStoryboardTemplateName,
  splitDraftLines,
  templateLabel,
  type StoryboardTemplateName
} from "./storyboardDrafts.js";
import {
  isReferenceImageFile,
  isSameOriginMediaReference,
  mediaReferenceToFile
} from "./referenceMediaFiles.js";
import { videoDownloadFileName, type VideoDownloadProductContext } from "./videoDownloadName.js";
import {
  creativeVersionDisplayStatus,
  creativeVersionFailureReason,
  creativeVersionLifecycleHint,
  formatDeletionTime,
  formatCreativeVersionTime,
  formatHistoryTime,
  readableVideoJobError,
  statusLabel,
  videoDownloadProductContext,
  videoJobDownloadProductContext,
  videoJobResultHint,
  videoLabel
} from "./videoDisplayViewModel.js";
import { filterProductLibraryProducts } from "./productLibrarySearch.js";
import {
  deleteJson,
  fetchConsoleSnapshotPrimary,
  fetchConsoleSnapshotPolling,
  fetchConsoleSnapshotSecondary,
  getJson,
  postJson,
  postJsonWithSignal,
  putJson,
  readJsonResponse
} from "./consoleApiClient.js";
import {
  defaultProductDraft,
  draftReferenceImageStatuses,
  isStructuredProductComposerText,
  productComposerTextToDraft,
  productDraftToComposerText,
  extractProductComposerImageReferences,
  removeDraftReferenceImage,
  removeReferenceFromComposerText,
  updateComposerReferenceOrder,
  type ProductDraft
} from "./productComposerText.js";
import {
  productDraftToFacts,
  productDraftToProductDetail,
  productDraftToPreviewProduct,
  productFactsToDraft,
  splitLines
} from "./productDraftFacts.js";
import {
  buildProductCreativeWorkspace,
  type ProductCreativeWorkspace,
  type ProductCreativeWorkspaceMode
} from "./productCreativeWorkspace.js";
import {
  apiModeForProviderDraft,
  defaultModelConfigPreset,
  modelConfigDeleteQuery,
  syncModelConfigDraftsFromLedger,
  updateProviderConfigStatus,
  type ModelConfigDraft,
  type ModelConfigProviderId,
  type ModelConfigTestStatus,
  type ProviderConfigServiceItem,
  type ProviderConfigItem,
  type ProviderConfigLedger
} from "./components/modelServiceConfig.js";
import {
  byokConfiguredModels,
  configuredModelOptions,
  effectiveModelConfigChoice,
  platformConfiguredModels,
  type ModelConfigChoice,
  type ModelServicePreference
} from "./modelServiceSelection.js";
import {
  modelLabelForId
} from "../providers/modelCatalog.js";
import { compileProductPrompt } from "../core/productPromptCompiler.js";
import { cn } from "./lib/utils.js";
import {
  localizedModelPricingEntry,
  localizedModelPricingProvider,
  modelPricingProviders,
  pricingEntriesForProvider,
  type ModelPricingEntry,
  type ModelPricingKind,
  type ModelPricingProviderId
} from "./modelPricingCatalog.js";
import {
  getLocaleMeta,
  supportedLocales,
  type AppLocale
} from "../i18n/config.js";
import {
  clientLocaleStorageKey,
  i18n
} from "../i18n/client.js";
import {
  walletTransactionBillingBreakdown,
  walletTransactionDescriptionLabel,
  walletTransactionIsConsumptionRecord,
  walletVisibleConsumptionTransactions
} from "./walletDisplayViewModel.js";

type NavLabelKey = "dashboard" | "creative" | "video" | "image" | "ledger" | "wallet" | "pricing" | "settings";
type AppTranslator = (key: string, options?: Record<string, unknown>) => string;
type VideoStudioTranslator = (key: string, options?: Record<string, unknown>) => string;

echartsCore.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer
]);

const ReactECharts = ReactEChartsCore as unknown as ComponentType<{
  className?: string;
  echarts: typeof echartsCore;
  option: EChartsOption;
  notMerge?: boolean;
  lazyUpdate?: boolean;
  style?: CSSProperties;
}>;

const brandLogoUrl = new URL("./assets/logo.svg", import.meta.url).href;
const floatingTooltipClass =
  "pointer-events-none absolute whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--field)] px-2.5 py-1.5 text-[11px] font-black text-[var(--muted)] opacity-0 shadow-[0_10px_24px_rgba(96,64,43,.12)] transition";

type ProviderName = "mock" | "volcengine-seedance";
type CreativeStyleName = "auto" | "lifestyle" | "detail" | StoryboardTemplateName;
type TemplateName = CreativeStyleName;
type VideoResolution = "480p" | "720p" | "1080p" | "4k";
type VideoAspectRatio = "9:16" | "16:9";
type ProductComposerSource = "structured" | "freeform";
type AuthFlowMode = "entry" | "verify-email" | "forgot-password";
interface AuthSession {
  authEnabled: boolean;
  authenticated: boolean;
  user?: {
    email?: string;
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

interface ProductImportPreviewResponse {
  product: ProductFactsResponse;
  notes: string[];
  quality: ProductImportQuality;
}

interface ProductImportSaveResponse {
  product: ProductDetail;
  notes: string[];
  quality: ProductImportQuality;
}

interface StoryboardDraftResponse {
  scriptLines: string[];
  storyboardLines: string[];
  storyboardCnLines: string[];
  notes: string[];
}

interface ImagePromptDraftResponse {
  prompt: string;
  notes: string[];
}

interface StoryboardHistoryRecord {
  id: string;
  createdAt: string;
  style: TemplateName;
  duration: number;
  script: string;
}

interface ProductImportBatchResponse {
  summary: {
    total: number;
    imported: number;
    failed: number;
  };
  results: Array<
    | {
        index: number;
        status: "imported";
        product: ProductDetail;
        notes: string[];
        quality?: ProductImportQuality;
      }
    | {
        index: number;
        status: "failed";
        error: string;
      }
  >;
}

type ProductFileImportDiagnosticsReason = "empty" | "sku-only" | "no-product-fields";

interface ProductFileImportPreviewResponse {
  fileName: string;
  sheetName?: string;
  summary: {
    total: number;
    ready: number;
    needsAi: number;
    needsInput: number;
    duplicateSku: number;
    failed: number;
  };
  diagnostics: {
    scannedRows: number;
    candidateRows: number;
    skippedRows: number;
    headers: string[];
    reason?: ProductFileImportDiagnosticsReason;
    message?: string;
  };
  rows: ProductFileImportRow[];
}

interface ProductFileImportCommitResponse {
  summary: {
    requested: number;
    imported: number;
    failed: number;
  };
  results: Array<
    | {
        rowId: string;
        rowNumber: number;
        status: "imported";
        product: ProductDetail;
      }
    | {
        rowId: string;
        rowNumber: number;
        status: "failed";
        error: string;
      }
  >;
}

interface DeleteLedgerVideoResponse {
  deleted: true;
  jobId: string;
  path: string;
}

type FinalVideoLanguage = "ja" | "zh" | "en";

interface SettingsState {
  defaultLanguage: FinalVideoLanguage;
  defaultDurationSeconds: number;
  defaultTemplate: TemplateName;
  enabledTemplates: TemplateName[];
  defaultCta: string;
  defaultProvider: ProviderName;
  maxEstimatedCostCnyPerVideo: number;
  testCreditBalanceCny: number;
  forbiddenWords: string[];
  exaggerationRules: string[];
}

interface Billing {
  totalTokens?: number;
  estimatedCostCny?: number;
}

interface Report {
  path: string;
  productSku?: string;
  provider?: ProviderName | string;
  status?: string;
  durationSeconds?: number;
  rawManifestPath?: string;
  rawOutputPath?: string;
  finalOutputPath?: string;
  finalVideoUrl?: string;
  billing?: Billing;
  totalCost?: {
    amount?: number;
    currency?: string;
  };
  taskId?: string;
  reusedRawManifest?: boolean;
}

interface FeeProductCostRow {
  productSku: string;
  jobs: number;
  paidJobs: number;
  mockJobs: number;
  estimatedCostCny: number;
  finalVideos: number;
}

interface ProductVideoGenerationOptions {
  provider?: ProviderName;
  providerModelConfigId?: ModelConfigChoice;
  providerModel?: string;
  resolution?: VideoResolution;
  aspectRatio?: VideoAspectRatio;
  referenceImages?: string[];
  storyboardLines?: string[];
}

interface ProductImageGenerationOptions {
  prompt?: string;
  referenceImages?: string[];
  locale?: AppLocale;
}

interface Preflight {
  productSku: string;
  title_ja: string;
  provider: string;
  durationSeconds: number;
  resolution?: VideoResolution;
  aspectRatio: string;
  template: TemplateName;
  cta: string;
  paidProvider: boolean;
  apiBillingMode?: "byok" | "platform";
  requiresPaidConfirmation: boolean;
  assetSummary: {
    total: number;
    previewable: number;
    missing: number;
    outsideProjectRoot: number;
    remote: number;
  };
  script: {
    voiceover: string;
    subtitleLines: string[];
  };
  prompt: string;
  estimatedTokens: {
    low: number;
    expected: number;
    high: number;
  };
  estimatedCostCny: {
    low: number;
    expected: number;
    high: number;
  };
  upstreamEstimatedCostCny?: {
    low: number;
    expected: number;
    high: number;
  };
  serviceFeeCny?: {
    low: number;
    expected: number;
    high: number;
  };
  walletEstimatedChargeCny?: {
    low: number;
    expected: number;
    high: number;
  };
  credit: {
    testCreditBalanceCny: number;
    usedEstimatedCostCny: number;
    availableEstimatedCostCny: number;
    estimatedCostCny: number;
    enoughCredit: boolean;
  };
  readiness: {
    readyForPaidGeneration: boolean;
    blockingReasons: string[];
    warnings: string[];
  };
  warnings: string[];
}

interface BillingActionEstimate {
  usageKind: "text" | "image" | "video";
  apiBillingMode: "platform" | "byok";
  units: number;
  serviceFeeCny: number;
  upstreamEstimatedCostCny: number;
  walletEstimatedChargeCny: number;
  model?: string;
}

interface BillingEstimatesResponse {
  estimates: {
    organizeProduct: BillingActionEstimate;
    storyboard: BillingActionEstimate;
    referenceImages: BillingActionEstimate;
    video: BillingActionEstimate;
  };
}

type BillingEstimatesStatus = "idle" | "loading" | "ready" | "error";
type ConsoleSecondarySnapshotStatus = "idle" | "loading" | "ready" | "error";
type GeneratedReferenceImageResult = { reference: string };

interface Filters {
  productSku: string;
  provider: string;
  status: string;
  finalOnly: boolean;
}

type RefreshConsoleReason = "manual" | "polling";

interface ProviderUsageItem {
  id: string;
  model?: string;
  status?: string;
  completionTokens?: number;
  totalTokens: number;
  estimatedCostCny: number;
  createdAt?: number;
  updatedAt?: number;
  resolution?: string;
  ratio?: string;
  durationSeconds?: number;
  serviceTier?: string;
}

interface ProviderUsageReport {
  total: number;
  items: ProviderUsageItem[];
  totalTokens: number;
  estimatedCostCny: number;
  tokenPriceCnyPerMillion: number;
}

interface VideoProviderConfigItem extends ProviderConfigItem {
  id: "volcengine-seedance";
  modelKind: "video";
  resolution: string;
  tokenPriceCnyPerMillion: number;
  estimatedCostCnyPerSecond: number;
  watermark: boolean;
  docsUrl: string;
}

interface WalletTransaction {
  id: string;
  type: "recharge" | "reserve" | "charge" | "refund" | "adjustment" | "bonus";
  amountCny: number;
  balanceAfterCny: number;
  reservedAfterCny: number;
  reservationId?: string;
  jobId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

type WalletCenterTab = "recharge" | "consumption";
type WalletConsumptionFilter = "all" | "charge" | "reserve" | "refund" | "adjustment";

interface WalletLedger {
  balanceCny: number;
  reservedCny: number;
  availableCny: number;
  transactions: WalletTransaction[];
}

interface WalletRechargeOrder {
  id: string;
  workspaceId?: string;
  provider: "stripe" | "infini";
  providerSessionId?: string;
  providerPaymentIntentId?: string;
  paymentAmount: number;
  paymentAmountCents: number;
  paymentCurrency: string;
  walletCurrency: "cny";
  creditCny: number;
  creditCents: number;
  fxRateSnapshot?: Record<string, unknown>;
  status: "pending" | "paid" | "expired" | "failed";
  checkoutUrl?: string;
  failureReason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  expiresAt?: string;
}

interface WalletRechargeOrdersResponse {
  orders: WalletRechargeOrder[];
}

interface WalletRechargeOrderResponse {
  order: WalletRechargeOrder;
  checkoutUrl: string;
}

interface WalletRechargeOrderSyncResponse {
  synced: boolean;
  order: WalletRechargeOrder;
  wallet: WalletLedger;
}

interface PaymentMethodView {
  id: "stripe" | "infini";
  label: string;
  kind: "rmb" | "crypto";
  enabled: boolean;
  configured: boolean;
  available: boolean;
  paymentCurrency: string;
  quote?: RechargePaymentQuote;
  description: string;
  unavailableReason?: string;
}

interface RechargePaymentQuote {
  walletCurrency: "cny";
  creditCny: number;
  creditCents: number;
  paymentCurrency: string;
  paymentAmount: number;
  paymentAmountCents: number;
  fxRateSnapshot: {
    from: "cny";
    to: string;
    rate: number;
    source?: "identity" | "frankfurter" | "env";
    sourceLabel?: string;
    sourceUrl?: string;
    asOfDate?: string;
    fetchedAt?: string;
  };
}

interface PaymentMethodsResponse {
  methods: PaymentMethodView[];
}

interface ModelPricingCatalogResponse {
  active: ActiveModelPricingCatalogView;
}

interface ActiveModelPricingCatalogView {
  id?: string;
  version: string;
  source: "built_in" | "database";
  publishedAt?: string;
  entries: ModelPricingEntry[];
}

interface ModelConfigStatusResponse {
  provider: Pick<ProviderConfigItem, "id" | "configId" | "configured" | "keySource" | "keyPreview">;
}

interface ProviderConfigTestResponse {
  ok: true;
  provider: ModelConfigProviderId;
  model: string;
  message: string;
}

interface ProviderModelDiscoveryResponse {
  ok: true;
  provider: ModelConfigProviderId;
  models: Array<{
    id: string;
    label?: string;
    known: boolean;
    source: "models_api" | "catalog";
  }>;
}

interface ModelConfigKeyRevealResponse {
  ok: true;
  provider: ModelConfigProviderId;
  configId: string;
  apiKey: string;
  keyPreview?: string;
}

interface VideoAsset {
  kind: "raw" | "final" | "publish";
  path: string;
  productSku?: string;
  jobId: string;
  provider?: string;
  taskId?: string;
  durationSeconds?: number;
  source: "report" | "publish-package";
  sourcePath: string;
  exists: boolean;
  sizeBytes: number;
  url?: string;
}

interface VideoAssetLedger {
  summary: {
    totalAssets: number;
    totalBytes: number;
    rawAssets: number;
    finalAssets: number;
    publishAssets: number;
    missingAssets: number;
  };
  assets: VideoAsset[];
}

interface StorageBackupScope {
  id: "products" | "settings" | "system" | "job-metadata";
  label: string;
  path: string;
  mustBackup: boolean;
  fileCount: number;
  totalBytes: number;
  videoFiles: number;
  manifestFiles: number;
  jsonFiles: number;
  productFiles: number;
  referenceImages: number;
}

interface StorageBackupReport {
  summary: {
    totalFiles: number;
    totalBytes: number;
    videoFiles: number;
    manifestFiles: number;
    productFiles: number;
    referenceImages: number;
  };
  scopes: StorageBackupScope[];
  backupCommands: string[];
  notes: string[];
}

interface LocalBackupItem {
  fileName: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
  url: string;
}

interface LocalBackupLedger {
  summary: {
    totalBackups: number;
    totalBytes: number;
    latestCreatedAt?: string;
  };
  backups: LocalBackupItem[];
}

interface AuditLogEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
}

interface AuditLogLedger {
  summary: {
    totalEvents: number;
  };
  events: AuditLogEvent[];
}

type QcResult = "pass" | "warning" | "fail" | "missing";

interface QcSummaryItem {
  jobId: string;
  reportPath: string;
  rawManifestPath?: string;
  productSku?: string;
  provider?: string;
  durationSeconds?: number;
  result: QcResult;
  failedChecks: string[];
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
  }>;
}

interface QcSummaryLedger {
  summary: {
    totalJobs: number;
    passJobs: number;
    warningJobs: number;
    failJobs: number;
    missingJobs: number;
  };
  items: QcSummaryItem[];
}

interface ConsoleToastState {
  id: number;
  title: string;
  message: string;
  tone: "warn" | "ok" | "neutral";
}

type ConsoleToastFn = (message: string, tone?: ConsoleToastState["tone"]) => void;

interface ConfirmActionState {
  id: number;
  title: string;
  message: string;
  details?: string[];
  confirmLabel: string;
  cancelLabel?: string;
  tone: "danger" | "paid" | "neutral";
}

type ConfirmActionRequest = Omit<ConfirmActionState, "id">;

type ProductEditorMode = "import" | "manual";
type ProductLibraryDialogMode = ProductEditorMode | "edit" | undefined;

const dashboardNavItems: Array<{ id: ConsoleSection; labelKey: NavLabelKey; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", labelKey: "dashboard", icon: LayoutDashboard }
];

const primaryNavItems: Array<{ id: ConsoleSection; labelKey: NavLabelKey; icon: typeof LayoutDashboard }> = [
  { id: "video", labelKey: "creative", icon: Clapperboard },
  { id: "ledger", labelKey: "ledger", icon: ClipboardCheck }
];

const managementNavItems: Array<{ id: ConsoleSection; labelKey: NavLabelKey; icon: typeof LayoutDashboard }> = [
  { id: "wallet", labelKey: "wallet", icon: CircleDollarSign },
  { id: "pricing", labelKey: "pricing", icon: BadgeJapaneseYen },
  { id: "settings", labelKey: "settings", icon: Settings }
];

const navItems = [...dashboardNavItems, ...primaryNavItems, ...managementNavItems] as const;

const navGroups = [
  { labelKey: "", items: dashboardNavItems },
  { labelKey: "workflow", items: primaryNavItems },
  { labelKey: "management", items: managementNavItems }
];

function isCreativeWorkspaceSection(section: ConsoleSection): section is Extract<ConsoleSection, "image" | "video"> {
  return section === "image" || section === "video";
}

const defaultFilters: Filters = {
  productSku: "all",
  provider: "all",
  status: "all",
  finalOnly: false
};

const defaultSettings: SettingsState = {
  defaultLanguage: "ja",
  defaultDurationSeconds: 10,
  defaultTemplate: "scene",
  enabledTemplates: ["scene", "pain-point", "benefit", "ugc", "unboxing"],
  defaultCta: "今すぐチェック",
  defaultProvider: "volcengine-seedance",
  maxEstimatedCostCnyPerVideo: 5,
  testCreditBalanceCny: 0,
  forbiddenWords: ["日本で大人気", "ランキング1位", "完全防水", "医療用"],
  exaggerationRules: ["商品资料未确认的销量、排名、功效、耐荷重、防水、UV 数值不得出现在脚本和字幕里。"]
};

const defaultVideoDurationSeconds = 10;
const defaultVideoTemplate: TemplateName = "auto";
const creativeStyleBaseOptions: TemplateName[] = ["auto", "lifestyle", "scene", "pain-point", "benefit", "ugc", "unboxing", "detail"];
const defaultVideoResolution: VideoResolution = "480p";
const videoResolutionOptions: VideoResolution[] = ["480p", "720p", "1080p", "4k"];
const defaultVideoAspectRatio: VideoAspectRatio = "9:16";
const videoAspectRatioOptions: VideoAspectRatio[] = ["9:16", "16:9"];
const PRODUCT_LIBRARY_DEFAULT_WIDTH = 232;
const PRODUCT_LIBRARY_COLLAPSED_WIDTH = 44;

const authOtpCooldownDurationSeconds = 60;

function tAppGlobal(key: string, options?: Record<string, unknown>): string {
  return i18n.t(`app:${key}`, options);
}

function tCurrentApp(locale: AppLocale, key: string, options?: Record<string, unknown>): string {
  return i18n.t(`app:${key}`, { lng: locale, ...options });
}

function makeAppTranslator(scope: string): AppTranslator {
  return (key, options) => tAppGlobal(`${scope}.${key}`, options);
}

const tVideoGlobal: VideoStudioTranslator = (key, options) => tAppGlobal(`videoStudio.${key}`, options);

function isTemplateName(value: unknown): value is TemplateName {
  return value === "auto" || value === "lifestyle" || value === "detail" || isStoryboardTemplateName(value);
}

function creativeStyleOptions(current: TemplateName, enabledTemplates: TemplateName[]): TemplateName[] {
  const allowed = creativeStyleBaseOptions.filter((option) => (
    option === "auto" ||
    option === "lifestyle" ||
    option === "detail" ||
    enabledTemplates.includes(option)
  ));
  return allowed.includes(current) ? allowed : [current, ...allowed];
}

function legacyTemplateForVideoJob(value: TemplateName): StoryboardTemplateName {
  if (isStoryboardTemplateName(value)) {
    return value;
  }
  return "scene";
}

function restoreProductStudioSku(availableProducts: ProductSummary[], preferredSku?: string): string {
  if (availableProducts.length === 0 || typeof window === "undefined") return "";
  const preferred = preferredSku?.trim();
  if (preferred && availableProducts.some((product) => product.sku === preferred)) return preferred;
  const urlSku = productStudioProductSkuFromUrl(window.location.href);
  if (urlSku && availableProducts.some((product) => product.sku === urlSku)) return urlSku;
  return availableProducts[0]?.sku ?? "";
}

export function App() {
  const [authSession, setAuthSession] = useState<AuthSession>({ authEnabled: false, authenticated: true });
  const [authFlowMode, setAuthFlowMode] = useState<AuthFlowMode>("entry");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authOtp, setAuthOtp] = useState("");
  const [authNewPassword, setAuthNewPassword] = useState("");
  const [authStatus, setAuthStatus] = useState(() => tAppGlobal("shell.loading"));
  const [authOtpCooldownSeconds, setAuthOtpCooldownSeconds] = useState(0);
  const [forgotPasswordOtpSent, setForgotPasswordOtpSent] = useState(false);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [ledger, setLedger] = useState<Ledger | undefined>();
  const [videoJobs, setVideoJobs] = useState<VideoJob[]>([]);
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [productPath, setProductPath] = useState("");
  const [selectedTextModelConfigId, setSelectedTextModelConfigId] = useState<ModelConfigChoice>("auto");
  const [selectedImageModelConfigId, setSelectedImageModelConfigId] = useState<ModelConfigChoice>("auto");
  const [selectedVideoModelConfigId, setSelectedVideoModelConfigId] = useState<ModelConfigChoice>("auto");
  const [duration, setDuration] = useState(defaultVideoDurationSeconds);
  const [selectedVideoResolution, setSelectedVideoResolution] = useState<VideoResolution>(defaultVideoResolution);
  const [selectedVideoAspectRatio, setSelectedVideoAspectRatio] = useState<VideoAspectRatio>(defaultVideoAspectRatio);
  const [versionCount, setVersionCount] = useState(1);
  const [template, setTemplate] = useState<TemplateName>(defaultVideoTemplate);
  const [finalLanguage, setFinalLanguage] = useState<FinalVideoLanguage>("ja");
  const [appLocale, setAppLocale] = useState<AppLocale>(supportedLocales.includes(i18n.language as AppLocale) ? i18n.language as AppLocale : "zh");
  const [cta, setCta] = useState("今すぐチェック");
  const [studioScriptDraft, setStudioScriptDraft] = useState("");
  const [studioStoryboardDraft, setStudioStoryboardDraft] = useState("");
  const [storyboardDraftSource, setStoryboardDraftSource] = useState<StoryboardDraftSource>("default");
  const [studioStoryboardCnDraft, setStudioStoryboardCnDraft] = useState("");
  const [storyboardHistory, setStoryboardHistory] = useState<StoryboardHistoryRecord[]>([]);
  const [isGeneratingImagePrompt, setIsGeneratingImagePrompt] = useState(false);
  const [reuseManifest, setReuseManifest] = useState("");
  const [preflight, setPreflight] = useState<Preflight | undefined>();
  const [preflightSignature, setPreflightSignature] = useState("");
  const [billingEstimates, setBillingEstimates] = useState<BillingEstimatesResponse | undefined>();
  const [billingEstimatesStatus, setBillingEstimatesStatus] = useState<BillingEstimatesStatus>("idle");
  const [statusText, setStatusText] = useState(() => tAppGlobal("status.idle"));
  const [consoleToast, setConsoleToast] = useState<ConsoleToastState | undefined>();
  const consoleToastCloseRef = useRef<() => void>(() => undefined);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | undefined>();
  const [selectedProduct, setSelectedProduct] = useState<ProductDetail | undefined>();
  const [productStudioLoadError, setProductStudioLoadError] = useState("");
  const [productDraft, setProductDraft] = useState<ProductDraft>(defaultProductDraft);
  const [productImportText, setProductImportText] = useState("");
  const [pendingImageFiles, setPendingImageFiles] = useState<File[]>([]);
  const [productComposerSource, setProductComposerSource] = useState<ProductComposerSource>("freeform");
  const [productAutoSaveStatus, setProductAutoSaveStatus] = useState<ProductAutoSaveStatus>("idle");
  const [importNotes, setImportNotes] = useState<string[]>([]);
  const [importQuality, setImportQuality] = useState<ProductImportQuality | undefined>();
  const [productEditorMode, setProductEditorMode] = useState<ProductEditorMode>("import");
  const [productLibraryDialogMode, setProductLibraryDialogMode] = useState<ProductLibraryDialogMode>();
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [dashboardRange, setDashboardRange] = useState<DashboardRange>("24h");
  const [dashboardGranularity, setDashboardGranularity] = useState<DashboardGranularity>("hour");
  const [providerUsage, setProviderUsage] = useState<ProviderUsageReport | undefined>();
  const [providerUsageStatus, setProviderUsageStatus] = useState("succeeded");
  const [providerUsageModel, setProviderUsageModel] = useState("doubao-seedance-2-0-260128");
  const [providerConfig, setProviderConfig] = useState<ProviderConfigLedger>({
    textModels: [],
    imageModels: [],
    videoModels: [],
    providers: [],
    runtime: {
      textConfigured: false,
      imageConfigured: false,
      videoConfigured: false
    }
  });
  const [wallet, setWallet] = useState<WalletLedger>({
    balanceCny: 0,
    reservedCny: 0,
    availableCny: 0,
    transactions: []
  });
  const [walletRechargeOrders, setWalletRechargeOrders] = useState<WalletRechargeOrder[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodView[]>([]);
  const [pendingRechargeAmountCny, setPendingRechargeAmountCny] = useState<number | undefined>();
  const [modelPricingCatalog, setModelPricingCatalog] = useState<ActiveModelPricingCatalogView>({
    version: "",
    source: "built_in",
    entries: []
  });
  const [modelServicePreference, setModelServicePreference] = useState<ModelServicePreference>({
    serviceMode: "byok"
  });
  const [modelConfigDrafts, setModelConfigDrafts] = useState<Record<ModelConfigProviderId, ModelConfigDraft>>(() => defaultModelConfigDrafts());
  const [modelConfigTestStatus, setModelConfigTestStatus] = useState<Partial<Record<ModelConfigProviderId, ModelConfigTestStatus>>>({});
  const [videoAssets, setVideoAssets] = useState<VideoAssetLedger | undefined>();
  const [storageBackup, setStorageBackup] = useState<StorageBackupReport | undefined>();
  const [localBackups, setLocalBackups] = useState<LocalBackupLedger | undefined>();
  const [auditLog, setAuditLog] = useState<AuditLogLedger | undefined>();
  const [secondarySnapshotStatus, setSecondarySnapshotStatus] = useState<ConsoleSecondarySnapshotStatus>("idle");
  const [consoleReady, setConsoleReady] = useState(false);
  const [consoleLoadError, setConsoleLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isGeneratingStoryboard, setIsGeneratingStoryboard] = useState(false);
  const [activeSectionState, setActiveSectionState] = useState<ConsoleSection>(() => {
    if (typeof window === "undefined") return defaultConsoleSection;
    return consoleSectionFromUrl(window.location.href);
  });
  const [creativeWorkspaceMode, setCreativeWorkspaceMode] = useState<ProductCreativeWorkspaceMode>(() => {
    if (typeof window === "undefined") return "video";
    const section = consoleSectionFromUrl(window.location.href);
    return isCreativeWorkspaceSection(section) ? section : "video";
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const contentScrollerRef = useRef<HTMLDivElement | null>(null);
  const videoJobsRef = useRef<VideoJob[]>([]);
  const confirmActionResolverRef = useRef<((confirmed: boolean) => void) | undefined>(undefined);
  const selectedProductSkuRef = useRef<string | undefined>(undefined);
  const selectedProductRef = useRef<ProductDetail | undefined>(undefined);
  const productDraftRef = useRef<ProductDraft>(defaultProductDraft);
  const productImportTextRef = useRef("");
  const productComposerSourceRef = useRef<ProductComposerSource>("freeform");
  const productAutoSaveTimerRef = useRef<number | undefined>(undefined);
  const productAutoSaveStatusRef = useRef<ProductAutoSaveStatus>("idle");
  const productAutoSaveSignatureRef = useRef("");
  const productAutoSaveInFlightRef = useRef<Promise<ProductDetail | undefined> | undefined>(undefined);
  const modelServicePreferenceSaveInFlightRef = useRef(false);
  const modelServicePreferenceMutationSeqRef = useRef(0);
  const handledWalletPaymentReturnRef = useRef(false);

  const enabledTemplateOptions = settings.enabledTemplates;
  const selectedProductSummary = products.find((product) => product.path === productPath);
  const selectedProductGroup = selectedProduct
    ? ledger?.products.find((group) => group.productSku === selectedProduct.sku)
    : undefined;
  const productOptions = useMemo(() => unique(reports.map((report) => report.productSku)), [reports]);
  const providerOptions = useMemo(() => unique(reports.map((report) => report.provider)), [reports]);
  const statusOptions = useMemo(() => unique(reports.map((report) => report.status)), [reports]);
  const hasActiveVideoJobs = videoJobs.some((job) => isActiveVideoJobStatus(job.status));
  const dashboardAnalytics = useMemo(
    () => buildDashboardAnalytics({ ledger, videoJobs, range: dashboardRange, granularity: dashboardGranularity, locale: appLocale }),
    [ledger, videoJobs, dashboardRange, dashboardGranularity, appLocale]
  );
  const filteredReports = reports.filter((report) => {
    if (filters.productSku !== "all" && report.productSku !== filters.productSku) return false;
    if (filters.provider !== "all" && report.provider !== filters.provider) return false;
    if (filters.status !== "all" && report.status !== filters.status) return false;
    if (filters.finalOnly && !report.finalVideoUrl) return false;
    return true;
  });
  const tApp: AppTranslator = (key, options) => i18n.t(`app:${key}`, { lng: appLocale, ...options });
  const tVideoApp: VideoStudioTranslator = (key, options) => i18n.t(`app:videoStudio.${key}`, { lng: appLocale, ...options });
  const activeSection = activeSectionState;
  const activeSectionIsCreativeWorkspace = isCreativeWorkspaceSection(activeSection);
  const activeSectionLabelKey = activeSectionIsCreativeWorkspace ? "creative" : navItems.find((item) => item.id === activeSection)?.labelKey ?? "creative";
  const activeSectionLabel = tApp(`navigation.${activeSectionLabelKey}`);
  const apiOwner = modelServicePreference.serviceMode;
  const platformTextModelOptions = useMemo(
    () => platformConfiguredModels(providerConfig.textModels),
    [providerConfig.textModels]
  );
  const platformImageModelOptions = useMemo(
    () => platformConfiguredModels(providerConfig.imageModels),
    [providerConfig.imageModels]
  );
  const platformVideoModelOptions = useMemo(
    () => platformConfiguredModels(providerConfig.videoModels),
    [providerConfig.videoModels]
  );
  const byokTextModelOptions = useMemo(
    () => byokConfiguredModels(providerConfig.textModels),
    [providerConfig.textModels]
  );
  const byokImageModelOptions = useMemo(
    () => byokConfiguredModels(providerConfig.imageModels),
    [providerConfig.imageModels]
  );
  const byokVideoModelOptions = useMemo(
    () => byokConfiguredModels(providerConfig.videoModels),
    [providerConfig.videoModels]
  );
  const textModelOptions = apiOwner === "platform" ? platformTextModelOptions : byokTextModelOptions;
  const imageModelOptions = apiOwner === "platform" ? platformImageModelOptions : byokImageModelOptions;
  const videoModelOptions = apiOwner === "platform" ? platformVideoModelOptions : byokVideoModelOptions;
  const effectiveSelectedTextModelConfigId = effectiveModelConfigChoice(selectedTextModelConfigId, textModelOptions);
  const effectiveSelectedImageModelConfigId = effectiveModelConfigChoice(selectedImageModelConfigId, imageModelOptions);
  const effectiveSelectedVideoModelConfigId = effectiveModelConfigChoice(selectedVideoModelConfigId, videoModelOptions);
  const textModelConfigured = textModelOptions.length > 0;
  const imageModelConfigured = imageModelOptions.length > 0;
  const videoModelConfigured = videoModelOptions.length > 0;
  const canEstimateBilling = textModelConfigured || imageModelConfigured || videoModelConfigured;
  const currentSignature = JSON.stringify({ productPath, provider: "volcengine-seedance", providerModelConfigId: effectiveSelectedVideoModelConfigId, duration, resolution: selectedVideoResolution, aspectRatio: selectedVideoAspectRatio, template, finalLanguage, cta, studioScriptDraft, studioStoryboardDraft });
  const freshPreflight = preflight && currentSignature === preflightSignature ? preflight : undefined;
  const safeVersionCount = Math.max(1, Math.min(5, Math.floor(versionCount || 1)));
  const referenceImageEstimateCount = selectedProduct ? estimatedReferenceImageGenerationCount(selectedProduct.reference_images.length) : 1;
  const batchEstimatedCostCny = freshPreflight
    ? roundMoney(((freshPreflight.walletEstimatedChargeCny?.expected ?? freshPreflight.estimatedCostCny.expected) || 0) * safeVersionCount)
    : undefined;

  consoleToastCloseRef.current = () => setConsoleToast(undefined);
  const handleConsoleToastClose = useMemo(
    () => () => consoleToastCloseRef.current(),
    []
  );

  function setActiveSection(section: ConsoleSection) {
    setActiveSectionState(section);
    if (isCreativeWorkspaceSection(section)) {
      setCreativeWorkspaceMode(section);
    }
    setConsoleToast(undefined);
    contentScrollerRef.current?.scrollTo({ top: 0, behavior: "instant" });
    if (typeof window === "undefined") return;
    const nextUrl = consoleSectionUrl(window.location.href, section);
    if (nextUrl !== window.location.href) {
      window.history.replaceState({}, "", nextUrl);
    }
  }

  function persistProductStudioSku(sku: string) {
    selectedProductSkuRef.current = sku || undefined;
    if (typeof window === "undefined") return;
    const nextUrl = productStudioProductUrl(window.location.href, sku);
    if (nextUrl !== window.location.href) {
      window.history.replaceState({}, "", nextUrl);
    }
  }

  function showConsoleToast(message: string, tone: ConsoleToastState["tone"] = "warn") {
    setConsoleToast({
      id: Date.now(),
      title: tApp("shell.toastTitle"),
      message,
      tone
    });
  }

  function requestConfirmAction(request: ConfirmActionRequest): Promise<boolean> {
    confirmActionResolverRef.current?.(false);
    return new Promise((resolve) => {
      confirmActionResolverRef.current = resolve;
      setConfirmAction({ ...request, id: Date.now() });
    });
  }

  function resolveConfirmAction(confirmed: boolean) {
    confirmActionResolverRef.current?.(confirmed);
    confirmActionResolverRef.current = undefined;
    setConfirmAction(undefined);
  }

  function ensureTextModelConfigured(options: { toast?: boolean } = {}): boolean {
    if (textModelConfigured) {
      return true;
    }
    if (options.toast !== false) {
      showConsoleToast(tApp("status.textModelRequired"));
    }
    return false;
  }

  function ensureImageModelConfigured(options: { toast?: boolean } = {}): boolean {
    if (imageModelConfigured) {
      return true;
    }
    if (options.toast !== false) {
      showConsoleToast(tApp("status.imageModelRequired"));
    }
    return false;
  }

  function ensureVideoModelConfigured(options: { toast?: boolean } = {}): boolean {
    if (videoModelConfigured) {
      return true;
    }
    if (options.toast !== false) {
      showConsoleToast(tApp("status.videoModelRequired"));
    }
    return false;
  }

  useEffect(() => {
    function syncAppLocale(locale: string) {
      if (supportedLocales.includes(locale as AppLocale)) {
        setAppLocale(locale as AppLocale);
      }
    }

    i18n.on("languageChanged", syncAppLocale);
    return () => {
      i18n.off("languageChanged", syncAppLocale);
    };
  }, []);

  useEffect(() => {
    if (
      !consoleReady ||
      !activeSectionIsCreativeWorkspace ||
      !canEstimateBilling
    ) {
      setBillingEstimates(undefined);
      setBillingEstimatesStatus("idle");
      return;
    }
    let cancelled = false;
    setBillingEstimatesStatus("loading");
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await postJson<BillingEstimatesResponse>("/api/billing-estimates", {
            textModelConfigId: effectiveSelectedTextModelConfigId,
            imageModelConfigId: effectiveSelectedImageModelConfigId,
            videoModelConfigId: effectiveSelectedVideoModelConfigId,
            referenceImageCount: referenceImageEstimateCount,
            videoDurationSeconds: duration,
            videoResolution: selectedVideoResolution,
            videoAspectRatio: selectedVideoAspectRatio,
            videoCount: safeVersionCount
          });
          if (!cancelled) {
            setBillingEstimates(response);
            setBillingEstimatesStatus("ready");
          }
        } catch {
          if (!cancelled) {
            setBillingEstimates(undefined);
            setBillingEstimatesStatus("error");
          }
        }
      })();
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    activeSectionIsCreativeWorkspace,
    canEstimateBilling,
    consoleReady,
    duration,
    referenceImageEstimateCount,
    safeVersionCount,
    selectedVideoAspectRatio,
    selectedVideoResolution,
    textModelConfigured,
    imageModelConfigured,
    videoModelConfigured,
    effectiveSelectedImageModelConfigId,
    effectiveSelectedTextModelConfigId,
    effectiveSelectedVideoModelConfigId
  ]);

  useEffect(() => {
    void bootConsole();
  }, []);

  useEffect(() => {
    if (authOtpCooldownSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setAuthOtpCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [authOtpCooldownSeconds]);

  useEffect(() => {
    videoJobsRef.current = videoJobs;
  }, [videoJobs]);

  useEffect(() => {
    selectedProductSkuRef.current = selectedProduct?.sku;
  }, [selectedProduct?.sku]);

  useEffect(() => {
    selectedProductRef.current = selectedProduct;
  }, [selectedProduct]);

  useEffect(() => {
    productDraftRef.current = productDraft;
  }, [productDraft]);

  useEffect(() => {
    productImportTextRef.current = productImportText;
  }, [productImportText]);

  useEffect(() => {
    productComposerSourceRef.current = productComposerSource;
  }, [productComposerSource]);

  useEffect(() => {
    productAutoSaveStatusRef.current = productAutoSaveStatus;
  }, [productAutoSaveStatus]);

  useEffect(() => {
    if (typeof window === "undefined" || handledWalletPaymentReturnRef.current || !consoleReady) return;
    const url = new URL(window.location.href);
    const payment = url.searchParams.get("payment");
    if (!["stripe-success", "stripe-cancel", "infini-success", "infini-cancel"].includes(payment ?? "")) return;
    const orderId = url.searchParams.get("orderId");
    handledWalletPaymentReturnRef.current = true;
    if (payment === "stripe-success" || payment === "infini-success") {
      if (payment === "infini-success" && orderId) {
        void syncInfiniRechargeReturn(orderId);
      } else {
        showConsoleToast(tApp("status.paymentReturned"), "ok");
        void refreshConsole({ reason: "manual" });
      }
    } else {
      showConsoleToast(tApp("status.paymentCancelled"));
    }
    url.searchParams.delete("payment");
    url.searchParams.delete("orderId");
    window.history.replaceState({}, "", url.toString());
  }, [consoleReady]);

  useEffect(() => {
    return () => {
      clearProductFactsAutoSaveTimer();
    };
  }, []);

  useEffect(() => {
    if (!selectedProduct) {
      setStudioScriptDraft("");
      setStudioStoryboardDraft("");
      setStoryboardDraftSource("default");
      setStudioStoryboardCnDraft("");
      return;
    }
    setStudioScriptDraft("");
    setStudioStoryboardDraft("");
    setStoryboardDraftSource("default");
    setStudioStoryboardCnDraft("");
  }, [selectedProduct?.sku]);

  useEffect(() => {
    if (!authSession.authenticated || !hasActiveVideoJobs) return;
    const timer = window.setInterval(() => {
      void refreshConsole({ reason: "polling" });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [authSession.authenticated, hasActiveVideoJobs]);

  async function bootConsole() {
    setIsLoading(true);
    try {
      const session = await getJson<AuthSession>("/api/auth/session");
      setAuthSession(session);
      if (session.authenticated) {
        await refreshConsole({ applySettings: true, showLoading: true });
      } else {
        setConsoleReady(false);
        setAuthStatus("");
      }
    } catch (error) {
      showError(error);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    try {
      const session = await postJson<AuthEntryResponse>("/api/auth/enter", {
        email: authEmail.trim() || undefined,
        password: authPassword
      });
      if (session.verificationRequired) {
        setAuthFlowMode("verify-email");
        setAuthEmail(session.email ?? authEmail.trim());
        setAuthOtp("");
        setForgotPasswordOtpSent(false);
        startAuthOtpCooldown();
        setAuthStatus("");
        return;
      }
      await enterConsoleAfterAuth(session);
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function verifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    try {
      const session = await postJson<AuthSession>("/api/auth/verify-email", {
        email: authEmail.trim() || undefined,
        otp: authOtp.trim()
      });
      await enterConsoleAfterAuth(session);
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function resendVerificationCode() {
    if (authOtpCooldownSeconds > 0) return;
    setIsBusy(true);
    try {
      const session = await postJson<AuthEntryResponse>("/api/auth/enter", {
        email: authEmail.trim() || undefined,
        password: authPassword
      });
      if (session.verificationRequired) {
        setAuthFlowMode("verify-email");
        setAuthEmail(session.email ?? authEmail.trim());
        setAuthOtp("");
        setForgotPasswordOtpSent(false);
        startAuthOtpCooldown();
        setAuthStatus("");
        return;
      }
      await enterConsoleAfterAuth(session);
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function requestPasswordReset() {
    if (authOtpCooldownSeconds > 0) return;
    setIsBusy(true);
    try {
      await postJson<{ success: true }>("/api/auth/request-password-reset", {
        email: authEmail.trim() || undefined
      });
      setAuthOtp("");
      setForgotPasswordOtpSent(true);
      startAuthOtpCooldown();
      setAuthStatus("");
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    try {
      await postJson<{ success: true }>("/api/auth/reset-password", {
        email: authEmail.trim() || undefined,
        otp: authOtp.trim(),
        password: authNewPassword
      });
      setAuthFlowMode("entry");
      setAuthPassword("");
      setAuthOtp("");
      setAuthNewPassword("");
      setAuthOtpCooldownSeconds(0);
      setForgotPasswordOtpSent(false);
      setAuthStatus(tApp("auth.reset.success"));
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function logout() {
    setIsBusy(true);
    try {
      const session = await postJson<AuthSession>("/api/auth/logout", {});
      setAuthSession(session);
      setAuthFlowMode("entry");
      setAuthEmail("");
      setAuthPassword("");
      setAuthOtp("");
      setAuthNewPassword("");
      setAuthOtpCooldownSeconds(0);
      setForgotPasswordOtpSent(false);
      setConsoleReady(false);
      setAuthStatus("");
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function enterConsoleAfterAuth(session: AuthSession) {
    setAuthSession(session);
    setAuthEmail("");
    setAuthPassword("");
    setAuthOtp("");
    setAuthNewPassword("");
    setAuthFlowMode("entry");
    setAuthOtpCooldownSeconds(0);
    setForgotPasswordOtpSent(false);
    setActiveSection(defaultConsoleSection);
    setAuthStatus(tApp("status.loadingConsole"));
    setConsoleReady(false);
    await refreshConsole({ applySettings: true, showLoading: true });
  }

  function changeAuthFlowMode(mode: AuthFlowMode) {
    setAuthFlowMode(mode);
    setAuthStatus("");
    if (mode === "entry") {
      setAuthOtpCooldownSeconds(0);
      setForgotPasswordOtpSent(false);
    }
    if (mode === "forgot-password") {
      setForgotPasswordOtpSent(false);
    }
  }

  function startAuthOtpCooldown() {
    setAuthOtpCooldownSeconds(authOtpCooldownDurationSeconds);
  }

  async function refreshConsole(options: { applySettings?: boolean; reason?: RefreshConsoleReason; showLoading?: boolean } = {}) {
    const polling = options.reason === "polling";
    const showLoading = options.showLoading === true && !polling;
    const modelServicePreferenceMutationSeq = modelServicePreferenceMutationSeqRef.current;
    if (showLoading) {
      setIsLoading(true);
    }
    try {
      setConsoleLoadError("");
      if (polling) {
        const {
          videoJobsResponse,
          walletResponse
        } = await fetchConsoleSnapshotPolling<{
          videoJobsResponse: { jobs: VideoJob[] };
          walletResponse: WalletLedger;
        }>();
        const completedTransitions = detectCompletedVideoJobTransitions(videoJobsRef.current, videoJobsResponse.jobs);
        setVideoJobs(videoJobsResponse.jobs);
        videoJobsRef.current = videoJobsResponse.jobs;
        setWallet(walletResponse);
        const selectedSku = selectedProductSkuRef.current;
        if (selectedSku && shouldRefreshSelectedProductForStudio(completedTransitions, selectedSku)) {
          await refreshSelectedProductForStudio(selectedSku);
        }
        if (completedTransitions.completedJobIds.length > 0) {
          setStatusText(formatStudioAutoRefreshStatus(completedTransitions));
          void refreshConsoleSecondarySnapshot({ toastOnError: false });
        }
        setConsoleReady(true);
        return;
      }
      const {
        productsResponse,
        providerConfigResponse,
        settingsResponse,
        videoJobsResponse,
        walletResponse,
        walletRechargeOrdersResponse,
        paymentMethodsResponse,
        modelPricingCatalogResponse,
        modelServicePreferenceResponse
      } = await fetchConsoleSnapshotPrimary<{
        productsResponse: { products: ProductSummary[] };
        providerConfigResponse: ProviderConfigLedger;
        settingsResponse: { settings: SettingsState };
        videoJobsResponse: { jobs: VideoJob[] };
        walletResponse: WalletLedger;
        walletRechargeOrdersResponse: WalletRechargeOrdersResponse;
        paymentMethodsResponse: PaymentMethodsResponse;
        modelPricingCatalogResponse: ModelPricingCatalogResponse;
        modelServicePreferenceResponse: { preference: ModelServicePreference };
      }>();
      const completedTransitions = polling
        ? detectCompletedVideoJobTransitions(videoJobsRef.current, videoJobsResponse.jobs)
        : { completedJobIds: [], affectedProductSkus: [] };
      setProducts(productsResponse.products);
      setProviderConfig(providerConfigResponse);
      setWallet(walletResponse);
      setWalletRechargeOrders(walletRechargeOrdersResponse.orders);
      setPaymentMethods(paymentMethodsResponse.methods);
      setModelPricingCatalog(modelPricingCatalogResponse.active);
      if (
        !modelServicePreferenceSaveInFlightRef.current
        && modelServicePreferenceMutationSeq === modelServicePreferenceMutationSeqRef.current
      ) {
        setModelServicePreference(modelServicePreferenceResponse.preference);
        setSelectedTextModelConfigId(modelServicePreferenceResponse.preference.textModelConfigId ?? "auto");
        setSelectedImageModelConfigId(modelServicePreferenceResponse.preference.imageModelConfigId ?? "auto");
        setSelectedVideoModelConfigId(modelServicePreferenceResponse.preference.videoModelConfigId ?? "auto");
      }
      setModelConfigDrafts((current) => syncModelConfigDraftsFromLedger(providerConfigResponse, current));
      setSettings(settingsResponse.settings);
      setVideoJobs(videoJobsResponse.jobs);
      videoJobsRef.current = videoJobsResponse.jobs;
      const currentStudioSku = selectedProductRef.current?.sku ?? selectedProductSkuRef.current;
      const restoredStudioSku = activeSectionIsCreativeWorkspace ? restoreProductStudioSku(productsResponse.products, currentStudioSku) : "";
      const restoredStudioProduct = productsResponse.products.find((product) => product.sku === restoredStudioSku);
      const nextProductPath = restoredStudioProduct?.path ?? (productPath && productsResponse.products.some((product) => product.path === productPath) ? productPath : "");
      setProductPath(nextProductPath);
      if (restoredStudioSku) {
        selectedProductSkuRef.current = restoredStudioSku;
      } else if (!nextProductPath && selectedProduct) {
        setSelectedProduct(undefined);
        selectedProductSkuRef.current = undefined;
      }
      const selectedSku = selectedProductSkuRef.current;
      if (!polling && activeSectionIsCreativeWorkspace && selectedSku && selectedProduct?.sku !== selectedSku) {
        await refreshSelectedProductForStudio(selectedSku);
      }
      if (selectedSku && shouldRefreshSelectedProductForStudio(completedTransitions, selectedSku)) {
        await refreshSelectedProductForStudio(selectedSku);
      }
      if (completedTransitions.completedJobIds.length > 0) {
        setStatusText(formatStudioAutoRefreshStatus(completedTransitions));
      }
      if (options.applySettings) {
        applySettings(settingsResponse.settings);
      }
      setConsoleReady(true);
      if (!polling || completedTransitions.completedJobIds.length > 0) {
        void refreshConsoleSecondarySnapshot({ toastOnError: !polling });
      }
    } catch (error) {
      const message = errorMessage(error);
      showError(error);
      if (!polling && message !== "Authentication required") {
        setConsoleLoadError(message);
        setConsoleReady(false);
      }
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }

  async function refreshConsoleSecondarySnapshot(options: { toastOnError?: boolean } = {}) {
    setSecondarySnapshotStatus("loading");
    try {
      const {
        reportsResponse,
        ledgerResponse,
        qcSummaryResponse,
        videoAssetsResponse,
        storageBackupResponse,
        localBackupsResponse,
        auditLogResponse
      } = await fetchConsoleSnapshotSecondary<{
        reportsResponse: { reports: Report[] };
        ledgerResponse: Ledger;
        qcSummaryResponse: QcSummaryLedger;
        videoAssetsResponse: VideoAssetLedger;
        storageBackupResponse: StorageBackupReport;
        localBackupsResponse: LocalBackupLedger;
        auditLogResponse: AuditLogLedger;
      }>();
      setReports(reportsResponse.reports);
      setLedger(attachQcToLedger(ledgerResponse, qcSummaryResponse));
      setVideoAssets(videoAssetsResponse);
      setStorageBackup(storageBackupResponse);
      setLocalBackups(localBackupsResponse);
      setAuditLog(auditLogResponse);
      setSecondarySnapshotStatus("ready");
    } catch (error) {
      setSecondarySnapshotStatus("error");
      if (options.toastOnError !== false) {
        showConsoleToast(tApp("status.backgroundSyncFailed", { message: errorMessage(error) }));
      }
    }
  }

  function applySettings(nextSettings = settings) {
    setDuration(defaultVideoDurationSeconds);
    setSelectedVideoResolution(defaultVideoResolution);
    setSelectedVideoAspectRatio(defaultVideoAspectRatio);
    setTemplate(defaultVideoTemplate);
    setFinalLanguage(nextSettings.defaultLanguage);
    setCta(nextSettings.defaultCta);
    setPreflight(undefined);
    setPreflightSignature("");
  }

  function markPreflightStale() {
    if (!preflight) return;
    setPreflightSignature("");
    setStatusText(tApp("status.formChanged"));
  }

  async function loadProductStoryboards(sku: string) {
    try {
      const response = await getJson<{ storyboards: StoryboardHistoryRecord[] }>(`/api/products/${encodeURIComponent(sku)}/storyboards`);
      setStoryboardHistory(response.storyboards);
    } catch (error) {
      showError(error);
    }
  }

  async function pushStoryboardHistory(input: { style: TemplateName; duration: number; script: string }, product = selectedProduct) {
    if (!product) return;
    const response = await postJson<{ storyboard: StoryboardHistoryRecord }>(
      `/api/products/${encodeURIComponent(product.sku)}/storyboards`,
      input
    );
    setStoryboardHistory((current) => [response.storyboard, ...current.filter((item) => item.id !== response.storyboard.id)]);
  }

  function applyStoryboardHistory(record: StoryboardHistoryRecord) {
    setTemplate(record.style);
    setDuration(record.duration);
    setStudioScriptDraft("");
    setStudioStoryboardDraft(record.script);
    setStoryboardDraftSource("ai");
    setStudioStoryboardCnDraft("");
    markPreflightStale();
    setStatusText(tApp("status.storyboardApplied", { template: localizedTemplateLabel(record.style, tVideoApp), duration: formatDuration(record.duration) }));
  }

  async function deleteStoryboardHistory(recordId: string) {
    if (!selectedProduct) return;
    await deleteJson(`/api/products/${encodeURIComponent(selectedProduct.sku)}/storyboards/${encodeURIComponent(recordId)}`);
    setStoryboardHistory((current) => current.filter((record) => record.id !== recordId));
    showConsoleToast(tApp("status.storyboardDeleted"), "ok");
  }

  function productTitleForSku(sku: string): string {
    return products.find((product) => product.sku === sku)?.title_ja || tApp("status.currentProduct");
  }

  async function runPreflight() {
    if (!productPath) {
      setStatusText(tApp("status.selectProduct"));
      return;
    }
    setIsBusy(true);
    try {
      setStatusText(tApp("status.preflighting"));
      const response = await postJson<{ preflight: Preflight }>("/api/preflight", {
        productPath,
        provider: "volcengine-seedance",
        providerModelConfigId: effectiveSelectedVideoModelConfigId,
        duration,
        resolution: selectedVideoResolution,
        aspectRatio: selectedVideoAspectRatio,
        template: legacyTemplateForVideoJob(template),
        finalLanguage,
        cta,
        scriptLines: splitDraftLines(studioScriptDraft),
        storyboardLines: splitDraftLines(studioStoryboardDraft)
      });
      setPreflight(response.preflight);
      setPreflightSignature(currentSignature);
      setStatusText(formatPreflightStatus(response.preflight, appLocale));
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function runPipeline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProductSummary) {
      setStatusText(tApp("status.selectProduct"));
      return;
    }
    if (!ensureVideoModelConfigured()) {
      setStatusText(tApp("status.videoModelRequired"));
      return;
    }
    setIsBusy(true);
    try {
      setStatusText(tApp("status.creatingJob"));
      const requestBody = {
        productPath,
        outDirName: `${selectedProductSummary.sku}-${Date.now()}`,
        provider: "volcengine-seedance",
        providerModelConfigId: effectiveSelectedVideoModelConfigId,
        duration,
        template: legacyTemplateForVideoJob(template),
        finalLanguage,
        cta,
        scriptLines: splitDraftLines(studioScriptDraft),
        storyboardLines: splitDraftLines(studioStoryboardDraft),
        confirmPaid: true,
        reuseManifest: reuseManifest.trim() || undefined
      };
      if (safeVersionCount > 1) {
        const response = await postJson<{ jobs: VideoJob[] }>("/api/video-jobs/batch", {
          ...requestBody,
          versions: safeVersionCount
        });
        setStatusText([
          tApp("status.batchJobsQueued", { count: response.jobs.length }),
          ...response.jobs.map((job, index) => tApp("status.batchJobLine", { version: versionLabel(index, tVideoApp), id: job.id, status: localizedJobStatusLabel(job.status, appLocale), outDir: job.outDir }))
        ].join("\n"));
      } else {
        const response = await postJson<{ job: VideoJob }>("/api/video-jobs", requestBody);
        setStatusText(tApp("status.jobCreated", { id: response.job.id, status: localizedJobStatusLabel(response.job.status, appLocale), outDir: response.job.outDir }));
      }
      await refreshConsole();
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    try {
      const response = await putJson<{ settings: SettingsState }>("/api/settings", {
        defaultProvider: settings.defaultProvider,
        defaultDurationSeconds: settings.defaultDurationSeconds,
        defaultTemplate: settings.defaultTemplate,
        enabledTemplates: settings.enabledTemplates,
        defaultCta: settings.defaultCta,
        maxEstimatedCostCnyPerVideo: settings.maxEstimatedCostCnyPerVideo,
        testCreditBalanceCny: settings.testCreditBalanceCny,
        forbiddenWords: settings.forbiddenWords,
        exaggerationRules: settings.exaggerationRules
      });
      setSettings(response.settings);
      applySettings(response.settings);
      setStatusText(tApp("status.settingsSaved"));
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function saveModelConfig(providerId: ModelConfigProviderId, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft = modelConfigDrafts[providerId];
    if (!draft.configId && !draft.apiKey.trim()) {
      setStatusText(tApp("status.apiKeyRequired"));
      return;
    }
    if (draft.models.length === 0) {
      setStatusText(tApp("status.modelVersionRequired"));
      return;
    }
    setIsBusy(true);
    try {
      const response = await putJson<ModelConfigStatusResponse>(`/api/model-configs/${providerId}`, {
        configId: draft.configId,
        apiKey: draft.apiKey.trim() || undefined,
        name: draft.name.trim(),
        vendor: draft.vendor.trim(),
        baseUrl: draft.baseUrl.trim(),
        model: draft.models,
        apiMode: apiModeForProviderDraft(providerId, draft),
        enabled: draft.enabled
      });
      setModelConfigDrafts((current) => ({
        ...current,
        [providerId]: {
          ...current[providerId],
          apiKey: "",
          keyPreview: response.provider.keyPreview ?? current[providerId].keyPreview
        }
      }));
      setProviderConfig((current) => updateProviderConfigStatus(current, response.provider));
      setStatusText(tApp("status.modelSaved", { preview: response.provider.keyPreview || tApp("status.configured") }));
      await refreshConsole();
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function toggleModelConfigEnabled(providerId: ModelConfigProviderId, service: ProviderConfigServiceItem, enabled: boolean) {
    setIsBusy(true);
    try {
      await putJson<ModelConfigStatusResponse>(`/api/model-configs/${providerId}`, {
        configId: service.configId,
        name: service.label || service.serviceLabel,
        vendor: service.providerLabel,
        baseUrl: service.baseUrl,
        model: service.models.map((model) => model.model).filter(Boolean),
        apiMode: service.apiMode,
        enabled
      });
      setStatusText(enabled ? tApp("status.modelEnabled") : tApp("status.modelDisabled"));
      await refreshConsole();
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function saveModelServicePreference(patch: Partial<ModelServicePreference>) {
    const previousPreference = modelServicePreference;
    const optimisticPreference = {
      ...modelServicePreference,
      ...patch
    };
    modelServicePreferenceSaveInFlightRef.current = true;
    setModelServicePreference(optimisticPreference);
    setIsBusy(true);
    try {
      const preference = await persistModelServicePreference(patch);
      setSelectedTextModelConfigId(preference.textModelConfigId ?? "auto");
      setSelectedImageModelConfigId(preference.imageModelConfigId ?? "auto");
      setSelectedVideoModelConfigId(preference.videoModelConfigId ?? "auto");
      setStatusText(preference.serviceMode === "platform" ? tApp("status.platformMode") : tApp("status.byokMode"));
      await refreshConsole();
    } catch (error) {
      setModelServicePreference(previousPreference);
      showError(error);
    } finally {
      modelServicePreferenceSaveInFlightRef.current = false;
      setIsBusy(false);
    }
  }

  async function persistModelServicePreference(patch: Partial<ModelServicePreference>): Promise<ModelServicePreference> {
    modelServicePreferenceMutationSeqRef.current += 1;
    const nextPreference = {
      ...modelServicePreference,
      ...patch
    };
    const response = await putJson<{ preference: ModelServicePreference }>("/api/model-service-preference", nextPreference);
    setModelServicePreference(response.preference);
    markPreflightStale();
    return response.preference;
  }

  async function testModelConfig(providerId: ModelConfigProviderId) {
    const draft = modelConfigDrafts[providerId];
    if (!draft.configId && !draft.apiKey.trim()) {
      setModelConfigTestStatus((current) => ({
        ...current,
        [providerId]: {
          tone: "danger",
          message: tApp("status.testFailedApiKey")
        }
      }));
      setStatusText(tApp("status.apiKeyRequired"));
      return;
    }
    setIsBusy(true);
    try {
      setModelConfigTestStatus((current) => ({
        ...current,
        [providerId]: {
          tone: "neutral",
          message: tApp("status.testing")
        }
      }));
      setStatusText(tApp("status.testing"));
      const response = await postJson<ProviderConfigTestResponse>(`/api/model-configs/${providerId}/test`, {
        configId: draft.configId,
        apiKey: draft.apiKey.trim() || undefined,
        baseUrl: draft.baseUrl.trim(),
        model: draft.models,
        apiMode: apiModeForProviderDraft(providerId, draft)
      });
      setModelConfigTestStatus((current) => ({
        ...current,
        [providerId]: {
          tone: "ok",
          message: tApp("status.testSuccess", { message: response.message, model: response.model })
        }
      }));
      setStatusText(tApp("status.testSuccess", { message: response.message, model: response.model }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setModelConfigTestStatus((current) => ({
        ...current,
        [providerId]: {
          tone: "danger",
          message: tApp("status.testFailed", { message })
        }
      }));
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function refreshModelCatalog(providerId: ModelConfigProviderId) {
    const draft = modelConfigDrafts[providerId];
    if (!draft.configId && !draft.apiKey.trim()) {
      setModelConfigTestStatus((current) => ({
        ...current,
        [providerId]: {
          tone: "danger",
          message: tApp("status.refreshFailedApiKey")
        }
      }));
      setStatusText(tApp("status.apiKeyRequired"));
      return;
    }
    setIsBusy(true);
    try {
      setModelConfigTestStatus((current) => ({
        ...current,
        [providerId]: {
          tone: "neutral",
          message: tApp("status.refreshingModels")
        }
      }));
      const response = await postJson<ProviderModelDiscoveryResponse>(`/api/model-configs/${providerId}/models`, {
        configId: draft.configId,
        apiKey: draft.apiKey.trim() || undefined,
        baseUrl: draft.baseUrl.trim(),
        model: draft.models,
        apiMode: apiModeForProviderDraft(providerId, draft)
      });
      const knownCount = response.models.filter((model) => model.known).length;
      const message = tApp("status.refreshModelsSuccess", { total: response.models.length, known: knownCount });
      setModelConfigTestStatus((current) => ({
        ...current,
        [providerId]: {
          tone: "ok",
          message
        }
      }));
      setStatusText(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setModelConfigTestStatus((current) => ({
        ...current,
        [providerId]: {
          tone: "danger",
          message: tApp("status.refreshFailed", { message })
        }
      }));
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function clearModelConfig(providerId: ModelConfigProviderId, configIds?: string[]) {
    setIsBusy(true);
    try {
      const suffix = modelConfigDeleteQuery(configIds);
      const response = await fetch(`/api/model-configs/${providerId}${suffix}`, {
        method: "DELETE"
      });
      const body = await readJsonResponse<ModelConfigStatusResponse>(response);
      setProviderConfig((current) => updateProviderConfigStatus(current, body.provider));
      setModelConfigDrafts((current) => ({
        ...current,
        [providerId]: {
          ...current[providerId],
          apiKey: ""
        }
      }));
      setStatusText(tApp("status.apiKeyCleared"));
      await refreshConsole();
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  function openRechargeDialog(amountCny = 50) {
    setPendingRechargeAmountCny(amountCny);
  }

  function closeRechargeDialog() {
    if (isBusy) return;
    setPendingRechargeAmountCny(undefined);
  }

  async function continueWalletRecharge(paymentMethodId: PaymentMethodView["id"]) {
    if (!pendingRechargeAmountCny) {
      return;
    }
    await topUpWallet(pendingRechargeAmountCny, paymentMethodId);
  }

  async function topUpWallet(amountCny = 50, paymentMethodId: PaymentMethodView["id"] = "stripe") {
    setIsBusy(true);
    try {
      const response = await postJson<WalletRechargeOrderResponse>("/api/wallet/recharge-orders", {
        amountCny,
        paymentMethodId
      });
      showConsoleToast(tApp("status.openingPayment", { method: paymentMethodLabel(paymentMethodId) }), "ok");
      window.location.assign(response.checkoutUrl);
    } catch (error) {
      showConsoleToast(errorMessage(error));
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function syncInfiniRechargeReturn(orderId: string) {
    try {
      const response = await postJson<WalletRechargeOrderSyncResponse>(
        `/api/wallet/recharge-orders/${encodeURIComponent(orderId)}/sync`,
        {}
      );
      setWallet(response.wallet);
      showConsoleToast(
        response.synced ? tApp("status.infiniSynced") : tApp("status.paymentReturned"),
        "ok"
      );
    } catch (error) {
      showConsoleToast(tApp("status.waitingPayment"), "ok");
      await refreshConsole({ reason: "manual" });
    }
  }

  async function revealModelConfigApiKey(providerId: ModelConfigProviderId, configId: string) {
    const response = await getJson<ModelConfigKeyRevealResponse>(
      `/api/model-configs/${providerId}/key?configId=${encodeURIComponent(configId)}`
    );
    setModelConfigDrafts((current) => ({
      ...current,
      [providerId]: {
        ...current[providerId],
        keyPreview: response.keyPreview ?? current[providerId].keyPreview
      }
    }));
    return response.apiKey;
  }

  function updateModelConfigDraft(providerId: ModelConfigProviderId, patch: Partial<ModelConfigDraft>) {
    setModelConfigTestStatus((current) => ({
      ...current,
      [providerId]: undefined
    }));
    setModelConfigDrafts((current) => ({
      ...current,
      [providerId]: {
        ...current[providerId],
        ...patch
      }
    }));
  }

  function applyModelPreset(providerId: ModelConfigProviderId, preset: ModelConfigDraft) {
    setModelConfigTestStatus((current) => ({
      ...current,
      [providerId]: undefined
    }));
    setModelConfigDrafts((current) => ({
      ...current,
      [providerId]: {
        ...current[providerId],
        ...preset,
        apiKey: current[providerId].apiKey
      }
    }));
  }

  async function loadProductFacts(sku: string) {
    setIsBusy(true);
    try {
      const response = await getJson<{ product: ProductDetail }>(`/api/products/${encodeURIComponent(sku)}`);
      setSelectedProduct(response.product);
      setStatusText(formatProductFacts(response.product, appLocale));
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  function applyProductToCreationComposer(product: ProductDetail) {
    const nextDraft = productFactsToDraft(product);
    setSelectedProduct(product);
    setProductPath(product.path);
    setProductDraft(nextDraft);
    setProductImportText(productDraftToComposerText(nextDraft));
    setPendingImageFiles([]);
    setProductComposerSource("structured");
    setImportQuality(product.importQuality);
    productDraftRef.current = nextDraft;
    productImportTextRef.current = productDraftToComposerText(nextDraft);
    productComposerSourceRef.current = "structured";
    resetProductFactsAutoSaveState("idle");
  }

  function clearProductFactsAutoSaveTimer() {
    if (productAutoSaveTimerRef.current !== undefined) {
      window.clearTimeout(productAutoSaveTimerRef.current);
      productAutoSaveTimerRef.current = undefined;
    }
  }

  function resetProductFactsAutoSaveState(nextStatus: ProductAutoSaveStatus = "idle") {
    clearProductFactsAutoSaveTimer();
    productAutoSaveSignatureRef.current = "";
    productAutoSaveStatusRef.current = nextStatus;
    setProductAutoSaveStatus(nextStatus);
  }

  function applyAutoSavedProductToCreationComposer(product: ProductDetail, draftToSave: ProductDraft) {
    const nextDraft = {
      ...draftToSave,
      sku: product.sku,
      reference_images: product.reference_images.join("\n"),
      source_text: product.source_text ?? draftToSave.source_text
    };
    setSelectedProduct(product);
    setProductPath(product.path);
    setProductDraft(nextDraft);
    setProductComposerSource("structured");
    setImportQuality(product.importQuality);
    setImportNotes([]);
    selectedProductRef.current = product;
    productDraftRef.current = nextDraft;
    productComposerSourceRef.current = "structured";
    persistProductStudioSku(product.sku);
    setPreflight(undefined);
    setPreflightSignature("");
  }

  async function applyProductToCreationComposerWithStoryboards(product: ProductDetail) {
    applyProductToCreationComposer(product);
    await loadProductStoryboards(product.sku);
  }

  function productFactsAutoSaveDraft() {
    const importText = productImportTextRef.current.trim();
    if (!importText || productComposerSourceRef.current !== "structured") {
      return undefined;
    }
    const currentDraft = productDraftRef.current;
    const currentProduct = selectedProductRef.current;
    const draftToSave = productComposerTextToDraft(productImportTextRef.current, currentDraft);
    if (!draftToSave.title_ja.trim()) {
      return undefined;
    }
    return {
      ...draftToSave,
      source_text: draftToSave.source_text || currentDraft.source_text || currentProduct?.source_text || ""
    };
  }

  function productFactsAutoSaveSignature(draftToSave: ProductDraft) {
    return JSON.stringify(productDraftToFacts(draftToSave));
  }

  async function autoSaveProductFacts(): Promise<ProductDetail | undefined> {
    clearProductFactsAutoSaveTimer();
    const draftToSave = productFactsAutoSaveDraft();
    if (!draftToSave) {
      resetProductFactsAutoSaveState("idle");
      return undefined;
    }
    const signature = productFactsAutoSaveSignature(draftToSave);
    if (signature === productAutoSaveSignatureRef.current && productAutoSaveStatusRef.current === "saved") {
      return selectedProductRef.current;
    }
    if (productAutoSaveInFlightRef.current) {
      await productAutoSaveInFlightRef.current;
      if (signature === productAutoSaveSignatureRef.current && productAutoSaveStatusRef.current === "saved") {
        return selectedProductRef.current;
      }
    }
    productAutoSaveStatusRef.current = "saving";
    setProductAutoSaveStatus("saving");
    const savePromise = (async () => {
      const response = await postJson<{ product: ProductDetail }>("/api/products", productDraftToFacts(draftToSave));
      applyAutoSavedProductToCreationComposer(response.product, draftToSave);
      productAutoSaveSignatureRef.current = signature;
      productAutoSaveStatusRef.current = "saved";
      setProductAutoSaveStatus("saved");
      setProducts((current) => dedupeProductSummaries([productActionSummary(response.product), ...current]));
      setStatusText(tApp("status.autoSaved", { title: response.product.title_ja }));
      return response.product;
    })();
    productAutoSaveInFlightRef.current = savePromise;
    try {
      return await savePromise;
    } catch (error) {
      productAutoSaveStatusRef.current = "failed";
      setProductAutoSaveStatus("failed");
      setStatusText(tApp("status.autoSaveFailed", { message: errorMessage(error) }));
      return undefined;
    } finally {
      if (productAutoSaveInFlightRef.current === savePromise) {
        productAutoSaveInFlightRef.current = undefined;
      }
      const latestDraft = productFactsAutoSaveDraft();
      if (latestDraft && productFactsAutoSaveSignature(latestDraft) !== productAutoSaveSignatureRef.current) {
        scheduleProductFactsAutoSave();
      }
    }
  }

  function scheduleProductFactsAutoSave() {
    clearProductFactsAutoSaveTimer();
    if (productComposerSourceRef.current !== "structured") {
      resetProductFactsAutoSaveState("idle");
      return;
    }
    productAutoSaveStatusRef.current = "dirty";
    setProductAutoSaveStatus("dirty");
    productAutoSaveTimerRef.current = window.setTimeout(() => {
      void autoSaveProductFacts();
    }, 1000);
  }

  async function flushProductFactsAutoSave(): Promise<ProductDetail | undefined> {
    if (productAutoSaveTimerRef.current !== undefined || productAutoSaveStatusRef.current === "dirty") {
      return autoSaveProductFacts();
    }
    if (productAutoSaveInFlightRef.current) {
      return productAutoSaveInFlightRef.current;
    }
    return selectedProductRef.current;
  }

  function updateProductComposerText(text: string, draftOverride?: ProductDraft) {
    setProductImportText(text);
    productImportTextRef.current = text;
    if (draftOverride) {
      setProductDraft(draftOverride);
      productDraftRef.current = draftOverride;
      setProductComposerSource("structured");
      productComposerSourceRef.current = "structured";
      scheduleProductFactsAutoSave();
      return;
    }
    if (isStructuredProductComposerText(text)) {
      const nextDraft = productComposerTextToDraft(text, productDraftRef.current);
      setProductDraft(nextDraft);
      productDraftRef.current = nextDraft;
      setProductComposerSource("structured");
      productComposerSourceRef.current = "structured";
      scheduleProductFactsAutoSave();
      return;
    }
    setProductComposerSource("freeform");
    productComposerSourceRef.current = "freeform";
    resetProductFactsAutoSaveState("idle");
  }

  async function refreshSelectedProductForStudio(sku = selectedProductSkuRef.current) {
    if (!sku) return;
    const response = await getJson<{ product: ProductDetail }>(`/api/products/${encodeURIComponent(sku)}`);
    await applyProductToCreationComposerWithStoryboards(response.product);
    persistProductStudioSku(response.product.sku);
  }

  async function loadProductIntoDraft(sku: string) {
    setIsBusy(true);
    try {
      const response = await getJson<{ product: ProductDetail }>(`/api/products/${encodeURIComponent(sku)}`);
      if (activeSectionIsCreativeWorkspace) {
        await applyProductToCreationComposerWithStoryboards(response.product);
        persistProductStudioSku(response.product.sku);
        setImportNotes([]);
        setProductLibraryDialogMode(undefined);
      } else {
        setProductDraft(productFactsToDraft(response.product));
        setProductEditorMode("manual");
        setProductLibraryDialogMode("edit");
      }
      setStatusText(tApp("status.productLoaded", { title: response.product.title_ja }));
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function openProductStudio(product: ProductSummary) {
    setProductPath(product.path);
    setPreflight(undefined);
    setPreflightSignature("");
    setProductStudioLoadError("");
    setActiveSection(creativeWorkspaceMode);
    setIsBusy(true);
    try {
      const response = await getJson<{ product: ProductDetail }>(`/api/products/${encodeURIComponent(product.sku)}`);
      await applyProductToCreationComposerWithStoryboards(response.product);
      setImportNotes([]);
      persistProductStudioSku(response.product.sku);
      setProductStudioLoadError("");
      setStatusText(tApp("status.enteredVideo", { title: response.product.title_ja }));
    } catch (error) {
      setSelectedProduct(undefined);
      persistProductStudioSku("");
      setProductStudioLoadError(errorMessage(error));
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  function startNewVideoProduct() {
    setSelectedProduct(undefined);
    setProductPath("");
    persistProductStudioSku("");
    setProductDraft(defaultProductDraft);
    setProductImportText("");
    setPendingImageFiles([]);
    setProductComposerSource("freeform");
    productDraftRef.current = defaultProductDraft;
    productImportTextRef.current = "";
    productComposerSourceRef.current = "freeform";
    selectedProductRef.current = undefined;
    resetProductFactsAutoSaveState("idle");
    setImportNotes([]);
    setImportQuality(undefined);
    setProductEditorMode("import");
    setProductLibraryDialogMode(undefined);
    setProductStudioLoadError("");
    setPreflight(undefined);
    setPreflightSignature("");
    setStudioScriptDraft("");
    setStudioStoryboardDraft("");
    setStoryboardDraftSource("default");
    setStudioStoryboardCnDraft("");
    setStoryboardHistory([]);
    setActiveSection(creativeWorkspaceMode);
    setStatusText(tApp("status.newProduct"));
  }

  async function organizeProductPackage(): Promise<ProductDetail | undefined> {
    const importText = productImportText.trim();
    if (importText && !ensureTextModelConfigured()) {
      return undefined;
    }
    if (!importText) {
      return selectedProduct;
    }

    setIsBusy(true);
    try {
      const preview = await postJson<ProductImportPreviewResponse>("/api/products/import-ai-preview", {
        text: importText,
        textModelConfigId: effectiveSelectedTextModelConfigId
      });
      const response = await postJson<{ product: ProductDetail }>("/api/products", preview.product);
      await applyProductToCreationComposerWithStoryboards(response.product);
      setProductComposerSource("structured");
      productComposerSourceRef.current = "structured";
      resetProductFactsAutoSaveState("idle");
      setImportNotes(preview.notes);
      setImportQuality(preview.quality);
      persistProductStudioSku(response.product.sku);
      setPreflight(undefined);
      setPreflightSignature("");
      setStatusText([
        tApp("status.aiOrganized", { title: response.product.title_ja }),
        preview.quality.summary,
        ...preview.notes.map((note) => `- ${note}`)
      ].join("\n"));
      await refreshConsole();
      return response.product;
    } catch (error) {
      showError(error);
      throw error;
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteProduct(sku: string) {
    const productTitle = productTitleForSku(sku);
    const confirmed = await requestConfirmAction({
      title: tApp("status.deleteProductTitle"),
      message: productTitle || sku,
      details: [tApp("status.deleteProductDetail")],
      confirmLabel: tApp("commonActions.confirmDelete"),
      tone: "danger"
    });
    if (!confirmed) return;
    setIsBusy(true);
    try {
      const response = await deleteJson<{ deleted: true; sku: string; path: string }>(`/api/products/${encodeURIComponent(sku)}`);
      if (selectedProduct?.sku === sku) {
        startNewVideoProduct();
      }
      setStatusText(tApp("status.productDeleted", { title: productTitle || response.sku }));
      await refreshConsole();
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function queueProductVideoJobs(product: ProductSummary, options?: ProductVideoGenerationOptions) {
    if (!ensureVideoModelConfigured()) {
      throw new Error(tApp("status.videoModelRequired"));
    }
    const videoGenerationOptions: ProductVideoGenerationOptions = options ?? {
      provider: "volcengine-seedance",
      providerModelConfigId: effectiveSelectedVideoModelConfigId
    };
    const selectedDuration = Math.max(4, Math.min(15, Math.floor(duration || 8)));
    const selectedVersionCount = Math.max(1, Math.min(5, Math.floor(versionCount || 1)));
    setIsBusy(true);
    try {
      setProductPath(product.path);
      persistProductStudioSku(product.sku);
      setPreflight(undefined);
      setPreflightSignature("");
      const response = await postJson<{ productSku: string; jobs: VideoJob[] }>(`/api/products/${encodeURIComponent(product.sku)}/video-jobs`, {
        provider: videoGenerationOptions.provider,
        providerModelConfigId: videoGenerationOptions.providerModelConfigId,
        providerModel: videoGenerationOptions.providerModel,
        duration: selectedDuration,
        resolution: videoGenerationOptions.resolution ?? selectedVideoResolution,
        aspectRatio: videoGenerationOptions.aspectRatio ?? selectedVideoAspectRatio,
        referenceImages: videoGenerationOptions.referenceImages,
        template: legacyTemplateForVideoJob(template),
        finalLanguage,
        cta,
        storyboardLines: videoGenerationOptions.storyboardLines ?? splitDraftLines(studioStoryboardDraft),
        confirmPaid: (videoGenerationOptions.provider ?? "volcengine-seedance") !== "mock",
        versions: selectedVersionCount
      });
      setVideoJobs((current) => mergeVideoJobs(response.jobs, current));
      videoJobsRef.current = mergeVideoJobs(response.jobs, videoJobsRef.current);
      setStatusText(tApp("status.videoStarted", { count: response.jobs.length }));
      await refreshConsole();
      await refreshSelectedProductForStudio(product.sku);
    } catch (error) {
      showError(error);
      throw error;
    } finally {
      setIsBusy(false);
    }
  }

  async function importProductPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!productImportText.trim()) {
      setStatusText(tApp("status.pasteProductFirst"));
      return;
    }
    setIsBusy(true);
    try {
      const response = await postJson<ProductImportPreviewResponse>("/api/products/import-preview", {
        text: productImportText
      });
      setProductDraft(productFactsToDraft(response.product));
      setProductImportText(productDraftToComposerText(productFactsToDraft(response.product)));
      setProductComposerSource("structured");
      setImportNotes(response.notes);
      setImportQuality(response.quality);
      setStatusText([
        tApp("status.importPreviewReady"),
        response.quality.summary,
        ...response.notes.map((note) => `- ${note}`)
      ].join("\n"));
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function importProductAndSave() {
    if (!productImportText.trim()) {
      setStatusText(tApp("status.pasteProductFirst"));
      return;
    }
    if (!ensureTextModelConfigured()) {
      return;
    }
    setIsBusy(true);
    try {
      const preview = await postJson<ProductImportPreviewResponse>("/api/products/import-ai-preview", {
        text: productImportText,
        textModelConfigId: effectiveSelectedTextModelConfigId
      });
      const response = await postJson<{ product: ProductDetail }>("/api/products", preview.product);
      if (activeSectionIsCreativeWorkspace) {
        await applyProductToCreationComposerWithStoryboards(response.product);
        persistProductStudioSku(response.product.sku);
      } else {
        setSelectedProduct(undefined);
        setProductPath(response.product.path);
        setProductDraft(productFactsToDraft(response.product));
      }
      setProductImportText(productDraftToComposerText(productFactsToDraft(response.product)));
      setProductComposerSource("structured");
      setImportNotes(preview.notes);
      setImportQuality(preview.quality);
      setProductLibraryDialogMode(undefined);
      setPreflight(undefined);
      setPreflightSignature("");
      setStatusText([
        activeSectionIsCreativeWorkspace ? tApp("status.importedAndEnteredVideo", { title: response.product.title_ja }) : tApp("status.importedProduct", { title: response.product.title_ja }),
        preview.quality.summary,
        ...preview.notes.map((note) => `- ${note}`)
      ].join("\n"));
      await refreshConsole();
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function importProductsBatch() {
    if (!productImportText.trim()) {
      setStatusText(tApp("status.pasteProductFirst"));
      return;
    }
    setIsBusy(true);
    try {
      const response = await postJson<ProductImportBatchResponse>("/api/products/import-batch", {
        text: productImportText
      });
      const importedResults = response.results.filter((item) => item.status === "imported");
      const lastImported = importedResults.at(-1);
      if (lastImported?.status === "imported") {
        setSelectedProduct(undefined);
        setProductPath(lastImported.product.path);
        setProductDraft(productFactsToDraft(lastImported.product));
        setProductImportText(productDraftToComposerText(productFactsToDraft(lastImported.product)));
        setProductComposerSource("structured");
        setImportNotes(lastImported.notes);
        setImportQuality(lastImported.quality);
      }
      setProductLibraryDialogMode(undefined);
      setPreflight(undefined);
      setPreflightSignature("");
      setStatusText([
        tApp("status.batchImportDone", { imported: response.summary.imported, total: response.summary.total, failed: response.summary.failed }),
        ...response.results.map((item) =>
          item.status === "imported"
            ? tApp("status.batchItemSaved", { index: item.index, title: item.product.title_ja })
            : tApp("status.batchItemFailed", { index: item.index, error: item.error })
        )
      ].join("\n"));
      await refreshConsole();
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function previewProductFileImport(file: File): Promise<ProductFileImportPreviewResponse> {
    setIsBusy(true);
    try {
      const preview = await postJson<ProductFileImportPreviewResponse>("/api/products/import-file-preview", {
        fileName: file.name,
        mimeType: file.type,
        base64: await fileToBase64(file)
      });
      setStatusText(tApp("status.filePreviewParsed", { count: preview.summary.total }));
      return preview;
    } catch (error) {
      showError(error);
      throw error;
    } finally {
      setIsBusy(false);
    }
  }

  async function fillCurrentProductFromFileRow(row: ProductFileImportRow): Promise<void> {
    if (!row.product) {
      setStatusText(tApp("status.selectParsedRow"));
      return;
    }
    const nextDraft = productFactsToDraft(row.product);
    const nextText = row.sourceText.trim() || productDraftToComposerText(nextDraft);
    updateProductComposerText(nextText, {
      ...nextDraft,
      source_text: nextText
    });
    setImportNotes(row.notes);
    setImportQuality(row.quality);
    setSelectedProduct(undefined);
    selectedProductRef.current = undefined;
    setProductPath("");
    persistProductStudioSku("");
    setPreflight(undefined);
    setPreflightSignature("");
    setStatusText(tApp("status.filledFromFile", { title: row.product.title_ja }));
  }

  async function commitProductFileImportRows(rows: ProductFileImportRow[], rowIds: string[]): Promise<ProductFileImportCommitResponse> {
    setIsBusy(true);
    try {
      const response = await postJson<ProductFileImportCommitResponse>("/api/products/import-file-commit", {
        rows,
        rowIds
      });
      const importedProducts = response.results
        .filter((result): result is Extract<ProductFileImportCommitResponse["results"][number], { status: "imported" }> => result.status === "imported")
        .map((result) => result.product);
      if (importedProducts.length > 0) {
        setProducts((current) => dedupeProductSummaries([
          ...importedProducts.map((product) => productActionSummary(product)),
          ...current
        ]));
      }
      setStatusText(tApp("status.fileImportDone", { imported: response.summary.imported, requested: response.summary.requested, failed: response.summary.failed }));
      await refreshConsole();
      return response;
    } catch (error) {
      showError(error);
      throw error;
    } finally {
      setIsBusy(false);
    }
  }

  async function generateStoryboardDraft(product = selectedProduct, options: {
    prompt?: string;
    referenceImages?: string[];
  } = {}) {
    if (!product) {
      setStatusText(tApp("status.selectProduct"));
      return;
    }
    if (isGeneratingStoryboard) {
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    setIsGeneratingStoryboard(true);
    try {
      const response = await postJsonWithSignal<StoryboardDraftResponse>(
        `/api/products/${encodeURIComponent(product.sku)}/storyboard-draft`,
        {
          duration,
          aspectRatio: selectedVideoAspectRatio,
          finalLanguage,
          template: legacyTemplateForVideoJob(template),
          creativeStyle: template,
          videoModelConfigId: effectiveSelectedVideoModelConfigId,
          prompt: options.prompt?.trim() || undefined,
          referenceImages: options.referenceImages ?? [],
          locale: appLocale
        },
        controller.signal
      );
      const nextScriptDraft = response.scriptLines.join("\n");
      const nextStoryboardDraft = response.storyboardLines.join("\n");
      setStudioScriptDraft(nextScriptDraft);
      setStudioStoryboardDraft(nextStoryboardDraft);
      setStoryboardDraftSource("ai");
      setStudioStoryboardCnDraft("");
      await pushStoryboardHistory({
        style: legacyTemplateForVideoJob(template),
        duration,
        script: nextStoryboardDraft
      }, product);
      setPreflight(undefined);
      setPreflightSignature("");
      setStatusText([
        tApp("status.storyboardGenerated"),
        ...response.notes.map((note) => `- ${note}`)
      ].join("\n"));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        const timeoutError = new Error(tApp("status.storyboardTimeout"));
        showError(timeoutError);
        throw timeoutError;
      } else {
        showError(error);
        throw error;
      }
    } finally {
      window.clearTimeout(timeout);
      setIsGeneratingStoryboard(false);
    }
  }

  async function generateImagePromptDraft(product: ProductDetail, options: { prompt?: string; targetImage?: string; referenceImages?: string[] } = {}) {
    if (!product) {
      setStatusText(tApp("status.selectProduct"));
      return undefined;
    }
    if (isGeneratingImagePrompt) {
      return undefined;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    setIsGeneratingImagePrompt(true);
    try {
      const response = await postJsonWithSignal<ImagePromptDraftResponse>(
        `/api/products/${encodeURIComponent(product.sku)}/image-prompt-draft`,
        {
          prompt: options.prompt?.trim() || undefined,
          targetImage: options.targetImage?.trim() || undefined,
          imageModelConfigId: effectiveSelectedImageModelConfigId,
          referenceImages: options.referenceImages ?? [],
          locale: appLocale
        },
        controller.signal
      );
      setStatusText([
        "模型提示词已预览。",
        ...response.notes.map((note) => `- ${note}`)
      ].join("\n"));
      return response;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        const timeoutError = new Error(tApp("status.storyboardTimeout"));
        showError(timeoutError);
        throw timeoutError;
      } else {
        showError(error);
        throw error;
      }
      return undefined;
    } finally {
      window.clearTimeout(timeout);
      setIsGeneratingImagePrompt(false);
    }
  }

  async function saveProductDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    try {
      const editingCurrentProduct = productLibraryDialogMode === "edit";
      const response = await postJson<{ product: ProductDetail }>("/api/products", productDraftToFacts({
        ...productDraft,
        source_text: productDraft.source_text || selectedProduct?.source_text || ""
      }));
      const continueCreation = activeSectionIsCreativeWorkspace;
      if (editingCurrentProduct || continueCreation) {
        if (continueCreation) {
          await applyProductToCreationComposerWithStoryboards(response.product);
        } else {
          setSelectedProduct(response.product);
          setProductPath(response.product.path);
          setProductDraft(productFactsToDraft(response.product));
        }
        persistProductStudioSku(response.product.sku);
      } else {
        setSelectedProduct(undefined);
        setProductPath(response.product.path);
        setProductDraft(defaultProductDraft);
      }
      setImportQuality(undefined);
      setProductLibraryDialogMode(undefined);
      setPreflight(undefined);
      setPreflightSignature("");
      setStatusText(`${editingCurrentProduct ? tApp("status.productUpdated") : continueCreation ? tApp("status.productSavedAndVideo") : tApp("status.productSaved")}: ${response.product.title_ja}`);
      await refreshConsole();
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function importProductAssets(sku: string) {
    setIsBusy(true);
    try {
      const response = await postJson<{ imported: Array<{ original: string; reference: string }>; product: ProductDetail }>(
        `/api/products/${encodeURIComponent(sku)}/import-assets`,
        {}
      );
      await applyProductToCreationComposerWithStoryboards(response.product);
      setStatusText([
        tApp("status.importedReferences", { count: response.imported.length }),
        ...response.imported.map((item) => `- ${item.original} -> ${item.reference}`)
      ].join("\n"));
      await refreshConsole();
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function uploadProductReferenceImages(sku: string, files: FileList | File[] | null): Promise<ProductDetail | undefined> {
    if (!sku || !files || files.length === 0) {
      return undefined;
    }
    setIsBusy(true);
    try {
      const payloadFiles = await Promise.all(
        Array.from(files).map(async (file) => ({
          fileName: file.name,
          mimeType: file.type,
          base64: await fileToBase64(file)
        }))
      );
      const response = await postJson<{
        uploaded: Array<{ originalName: string; reference: string }>;
        product: ProductDetail;
      }>(`/api/products/${encodeURIComponent(sku)}/reference-images`, {
        files: payloadFiles
      });
      await applyProductToCreationComposerWithStoryboards(response.product);
      setStatusText([
        tApp("status.uploadedReferences", { count: response.uploaded.length }),
        ...response.uploaded.map((item) => `- ${item.originalName} -> ${item.reference}`)
      ].join("\n"));
      await refreshConsole();
      return response.product;
    } catch (error) {
      showError(error);
      throw error;
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteProductReferenceImage(sku: string, index: number) {
    if (!sku) return;
    setIsBusy(true);
    try {
      const response = await deleteJson<{
        deleted: { index: number; reference: string };
        product: ProductDetail;
      }>(`/api/products/${encodeURIComponent(sku)}/reference-images/${index}`);
      await applyProductToCreationComposerWithStoryboards(response.product);
      setStatusText(tApp("status.deletedReference", { reference: response.deleted.reference }));
      await refreshConsole();
    } catch (error) {
      showError(error);
      throw error;
    } finally {
      setIsBusy(false);
    }
  }

  async function reorderProductReferenceImages(sku: string, referenceImages: string[]): Promise<ProductDetail | undefined> {
    if (!sku || referenceImages.length === 0) {
      return undefined;
    }
    setIsBusy(true);
    try {
      const response = await putJson<{ product: ProductDetail }>(`/api/products/${encodeURIComponent(sku)}/reference-images/order`, {
        referenceImages
      });
      await applyProductToCreationComposerWithStoryboards(response.product);
      setStatusText(tApp("status.reorderedReferences"));
      await refreshConsole();
      return response.product;
    } catch (error) {
      showError(error);
      throw error;
    } finally {
      setIsBusy(false);
    }
  }

  async function generateProductReferenceImages(sku: string, options: ProductImageGenerationOptions = {}): Promise<GeneratedReferenceImageResult[] | undefined> {
    if (!sku) {
      return;
    }
    if (!ensureImageModelConfigured({ toast: false })) {
      throw new Error(tApp("status.imageModelRequired"));
    }
    setIsBusy(true);
    try {
      const response = await postJson<{
        generated: GeneratedReferenceImageResult[];
        product: ProductDetail;
      }>(`/api/products/${encodeURIComponent(sku)}/reference-images/generate`, {
        imageModelConfigId: effectiveSelectedImageModelConfigId,
        prompt: options.prompt?.trim() || undefined,
        referenceImages: options.referenceImages ?? [],
        locale: options.locale ?? appLocale
      });
      if (response.generated.length === 0) {
        throw new Error(tApp("status.noGeneratedReferences"));
      }
      await applyProductToCreationComposerWithStoryboards(response.product);
      setStatusText([
        tApp("status.generatedReferences", { count: response.generated.length }),
        ...response.generated.map((item) => `- ${item.reference}`)
      ].join("\n"));
      await refreshConsole();
      return response.generated;
    } catch (error) {
      throw error;
    } finally {
      setIsBusy(false);
    }
  }

  async function showProviderUsage(taskId: string) {
    setIsBusy(true);
    try {
      const response = await getJson<{ task: Record<string, unknown> }>(`/api/provider-tasks/${encodeURIComponent(taskId)}`);
      setStatusText(formatProviderTask(response.task, appLocale));
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function refreshProviderUsage() {
    setIsBusy(true);
    try {
      const params = new URLSearchParams({
        pageSize: "20"
      });
      if (providerUsageStatus !== "all") {
        params.set("status", providerUsageStatus);
      }
      if (providerUsageModel.trim()) {
        params.set("model", providerUsageModel.trim());
      }
      const response = await getJson<{ usage: ProviderUsageReport }>(`/api/provider-tasks?${params.toString()}`);
      setProviderUsage(response.usage);
      setStatusText(formatProviderUsageReport(response.usage, appLocale));
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function cancelProviderTask(taskId: string) {
    setIsBusy(true);
    try {
      const response = await postJson<{ taskId: string }>(`/api/provider-tasks/${encodeURIComponent(taskId)}/cancel`, {});
      setStatusText(tApp("status.cancelledTask", { taskId: response.taskId }));
      await refreshConsole();
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function cancelVideoJob(jobId: string) {
    setIsBusy(true);
    try {
      const response = await postJson<{ job: VideoJob }>(`/api/video-jobs/${encodeURIComponent(jobId)}/cancel`, {});
      const deletedJobId = response.job.id;
      setVideoJobs((current) => current.filter((job) => job.id !== deletedJobId));
      videoJobsRef.current = videoJobsRef.current.filter((job) => job.id !== deletedJobId);
      setStatusText(tApp("status.deletedVideoRecord", { jobId: deletedJobId }));
      await refreshConsole();
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteLedgerVideo(jobId: string) {
    setIsBusy(true);
    try {
      const response = await deleteJson<DeleteLedgerVideoResponse>(`/api/job-ledger/${encodeURIComponent(jobId)}`);
      setLedger((current) => current ? removeLedgerJob(current, response.jobId) : current);
      setStatusText(tApp("status.deletedHistoryVideo", { jobId: response.jobId }));
      await refreshConsole();
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function retryVideoJob(job: VideoJob) {
    const paidRetry = Boolean(job.provider && job.provider !== "mock");
    if (paidRetry && !ensureVideoModelConfigured()) {
      setStatusText(tApp("status.videoModelRequired"));
      return;
    }
    if (paidRetry) {
      const confirmed = await requestConfirmAction({
        title: tApp("status.retryTitle"),
        message: `${videoModelLabel(job.provider, job.providerModel)} / ${formatDuration(job.durationSeconds)}`,
        details: [tApp("status.retryDetail")],
        confirmLabel: tApp("commonActions.confirmDelete"),
        tone: "paid"
      });
      if (!confirmed) {
        setStatusText(tApp("status.retryCancelled"));
        return;
      }
    }

    setIsBusy(true);
    try {
      const response = await postJson<{ job: VideoJob }>(
        `/api/video-jobs/${encodeURIComponent(job.id)}/retry`,
        {
          confirmPaid: paidRetry
        }
      );
      setVideoJobs((current) => mergeVideoJobs([response.job], current));
      videoJobsRef.current = mergeVideoJobs([response.job], videoJobsRef.current);
      setStatusText(tApp("status.retriedTask", { jobId: response.job.id }));
      if (activeSectionIsCreativeWorkspace) {
        await refreshSelectedProductForStudio();
      }
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function recoverVideoJobDownload(job: VideoJob) {
    if (!job.canRecoverDownload) {
      setStatusText(tApp("status.noRecoverableDownload"));
      return;
    }
    setIsBusy(true);
    try {
      const response = await postJson<{ job: VideoJob }>(
        `/api/video-jobs/${encodeURIComponent(job.id)}/recover-download`,
        {}
      );
      setVideoJobs((current) => mergeVideoJobs([response.job], current));
      videoJobsRef.current = mergeVideoJobs([response.job], videoJobsRef.current);
      setStatusText(tApp("status.recoverDownloadStarted"));
      if (activeSectionIsCreativeWorkspace) {
        await refreshSelectedProductForStudio();
      }
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function createBackupArchive() {
    setIsBusy(true);
    try {
      const response = await postJson<{ backup: LocalBackupItem }>("/api/backups", {});
      setStatusText([
        tApp("status.backupCreated", { fileName: response.backup.fileName }),
        tApp("status.size", { size: formatBytes(response.backup.sizeBytes) }),
        tApp("status.path", { path: response.backup.path })
      ].join("\n"));
      await refreshConsole();
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteVideoAsset(asset: VideoAsset) {
    if (!asset.exists) {
      setStatusText(tApp("status.assetMissing"));
      return;
    }
    const confirmed = await requestConfirmAction({
      title: tApp("status.deleteAssetTitle"),
      message: asset.path,
      details: [tApp("status.deleteAssetDetail")],
      confirmLabel: tApp("commonActions.confirmDelete"),
      tone: "danger"
    });
    if (!confirmed) {
      return;
    }
    setIsBusy(true);
    try {
      const response = await fetch("/api/video-assets", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: asset.path,
          confirm: true
        })
      });
      const body = await readJsonResponse<{ deleted: true; path: string; sizeBytes: number }>(response);
      setStatusText(tApp("status.assetDeleted", { path: body.path, size: formatBytes(body.sizeBytes) }));
      await refreshConsole();
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  function showError(error: unknown) {
    const message = errorMessage(error);
    if (message === "Authentication required") {
      setAuthSession({ authEnabled: true, authenticated: false });
      setAuthStatus(tApp("status.authExpired"));
      return;
    }
    setStatusText(message);
  }

  function renderCreativeWorkspace() {
    return (
      <section className="grid gap-4" aria-label={tApp("navigation.creative")}>
        <ProductCreationWorkspace
          mode={creativeWorkspaceMode}
          onModeChange={(nextMode) => setActiveSection(nextMode)}
          appLocale={appLocale}
          products={products}
          pendingProductSku={selectedProduct?.sku ?? selectedProductSkuRef.current ?? selectedProductSummary?.sku}
          selectedProduct={selectedProduct}
          loadError={productStudioLoadError}
          selectedProductGroup={selectedProductGroup}
          ledgerJobs={ledger?.jobs ?? []}
          videoJobs={videoJobs}
          draft={productDraft}
          importText={productImportText}
          setImportText={updateProductComposerText}
          pendingImageFiles={pendingImageFiles}
          setPendingImageFiles={setPendingImageFiles}
          importNotes={importNotes}
          productAutoSaveStatus={productAutoSaveStatus}
          billingEstimates={billingEstimates}
          billingEstimatesStatus={billingEstimatesStatus}
          onOrganizeProductPackage={organizeProductPackage}
          onFlushProductFactsAutoSave={flushProductFactsAutoSave}
          onSelectProduct={openProductStudio}
          onStartNewProduct={startNewVideoProduct}
          onDeleteProduct={deleteProduct}
          onGenerateVideo={queueProductVideoJobs}
          onCancelVideoJob={cancelVideoJob}
          onDeleteLedgerVideo={deleteLedgerVideo}
          onRetryVideoJob={retryVideoJob}
          onRecoverVideoJobDownload={recoverVideoJobDownload}
          onGenerateStoryboardDraft={generateStoryboardDraft}
          isGeneratingStoryboard={isGeneratingStoryboard}
          onGenerateImagePromptDraft={generateImagePromptDraft}
          isGeneratingImagePrompt={isGeneratingImagePrompt}
          onImportAssets={importProductAssets}
          onUploadImages={uploadProductReferenceImages}
          onGenerateReferenceImages={generateProductReferenceImages}
          onDeleteReferenceImage={deleteProductReferenceImage}
          onReorderReferenceImage={reorderProductReferenceImages}
          textModelOptions={textModelOptions}
          selectedTextModelConfigId={selectedTextModelConfigId}
          imageModelOptions={imageModelOptions}
          selectedImageModelConfigId={selectedImageModelConfigId}
          onImageModelConfigChange={(nextConfigId) => {
            setSelectedImageModelConfigId(nextConfigId);
            void persistModelServicePreference({ imageModelConfigId: nextConfigId });
            markPreflightStale();
          }}
          videoModelOptions={videoModelOptions}
          selectedVideoModelConfigId={selectedVideoModelConfigId}
          onVideoModelConfigChange={(nextConfigId) => {
            setSelectedVideoModelConfigId(nextConfigId);
            void persistModelServicePreference({ videoModelConfigId: nextConfigId });
            markPreflightStale();
          }}
          duration={duration}
          onDurationChange={(nextDuration) => {
            setDuration(nextDuration);
            markPreflightStale();
          }}
          selectedVideoResolution={selectedVideoResolution}
          onVideoResolutionChange={(nextResolution) => {
            setSelectedVideoResolution(nextResolution);
            markPreflightStale();
          }}
          selectedVideoAspectRatio={selectedVideoAspectRatio}
          onVideoAspectRatioChange={(nextAspectRatio) => {
            setSelectedVideoAspectRatio(nextAspectRatio);
            markPreflightStale();
          }}
          versionCount={versionCount}
          onVersionCountChange={setVersionCount}
          template={template}
          enabledTemplateOptions={enabledTemplateOptions}
          onTemplateChange={(nextTemplate) => {
            setTemplate(nextTemplate);
            markPreflightStale();
          }}
          finalLanguage={finalLanguage}
          onFinalLanguageChange={(nextLanguage) => {
            setFinalLanguage(nextLanguage);
            markPreflightStale();
          }}
          storyboardDraft={studioStoryboardDraft}
          storyboardDraftSource={storyboardDraftSource}
          onStoryboardDraftChange={(nextDraft, source = "manual") => {
            setStoryboardDraftSource(source);
            setStudioStoryboardDraft(nextDraft);
            markPreflightStale();
          }}
          onPreviewProductFileImport={previewProductFileImport}
          onFillCurrentProductFromFileRow={fillCurrentProductFromFileRow}
          onCommitProductFileImportRows={commitProductFileImportRows}
          onToast={showConsoleToast}
        />
      </section>
    );
  }

  function renderActiveSection() {
    if (!consoleReady) {
      return consoleLoadError
        ? <ConsoleSectionErrorState label={activeSectionLabel} message={consoleLoadError} onRetry={() => void refreshConsole({ applySettings: true, showLoading: true })} />
        : <ConsoleSectionLoadingState label={activeSectionLabel} />;
    }
    switch (activeSection) {
      case "dashboard":
        return (
          <section className="grid gap-4" aria-label={tApp("dashboard.ariaLabel")}>
            <KpiGrid
              items={[
                { label: tApp("dashboard.kpi.products"), value: formatNumber(products.length), hint: tApp("dashboard.kpi.productsHint"), icon: Package, tone: "clay" },
                { label: tApp("dashboard.kpi.jobs"), value: formatNumber(ledger?.summary.totalJobs), hint: ledger ? tApp("dashboard.kpi.completedHint", { count: formatNumber(ledger.summary.completedJobs) }) : tApp("status.backgroundSyncing"), icon: Clapperboard, tone: "green" },
                { label: tApp("dashboard.kpi.paidJobs"), value: formatNumber(ledger?.summary.paidJobs), hint: ledger ? tApp("dashboard.kpi.mockHint", { count: formatNumber(ledger.summary.mockJobs) }) : tApp("status.backgroundSyncing"), icon: CircleDollarSign, tone: "ember" },
                { label: tApp("dashboard.kpi.tokens"), value: formatNumber(ledger?.summary.totalTokens), hint: ledger ? `¥${money(ledger.summary.estimatedCostCny)}` : tApp("status.backgroundSyncing"), icon: Gauge, tone: "ochre" },
                { label: tApp("dashboard.kpi.finalVideos"), value: formatNumber(ledger?.summary.finalVideos), hint: ledger ? tApp("dashboard.kpi.finalVideosHint") : tApp("status.backgroundSyncing"), icon: FileVideo, tone: "coral" },
                { label: tApp("dashboard.kpi.reusedRaw"), value: formatNumber(ledger?.summary.reusedRawManifests), hint: ledger ? tApp("dashboard.kpi.reusedRawHint") : tApp("status.backgroundSyncing"), icon: Database, tone: "sage" }
              ]}
            />
            <ConsoleSecondarySyncNotice
              status={secondarySnapshotStatus}
              onRetry={() => void refreshConsoleSecondarySnapshot({ toastOnError: true })}
            />

            <DashboardStatsPanel
              analytics={dashboardAnalytics}
              range={dashboardRange}
              granularity={dashboardGranularity}
              onRangeChange={setDashboardRange}
              onGranularityChange={setDashboardGranularity}
              onRefresh={() => void refreshConsole()}
              isBusy={isBusy || isLoading || secondarySnapshotStatus === "loading"}
            />
          </section>
        );
      case "video":
      case "image":
        return renderCreativeWorkspace();
      case "ledger":
        return (
          <section className="grid gap-4" aria-label={tApp("ledger.ariaLabel")}>
            <ConsoleSecondarySyncNotice
              status={secondarySnapshotStatus}
              onRetry={() => void refreshConsoleSecondarySnapshot({ toastOnError: true })}
            />
            <VideoJobsPanel appLocale={appLocale} jobs={videoJobs} products={products} onCancel={cancelVideoJob} onRetry={retryVideoJob} onRecoverDownload={recoverVideoJobDownload} />
            <VideoAssetsPanel assets={videoAssets} onDelete={deleteVideoAsset} isBusy={isBusy} />
          </section>
        );
      case "wallet":
        return (
          <section className="grid gap-4" aria-label={tApp("wallet.ariaLabel")}>
            <WalletRechargePanel appLocale={appLocale} wallet={wallet} walletRechargeOrders={walletRechargeOrders} onRequestRecharge={openRechargeDialog} isBusy={isBusy} />
          </section>
        );
      case "pricing":
        return (
          <section className="grid gap-4" aria-label={tApp("pricing.ariaLabel")}>
            <ModelPricingPanel appLocale={appLocale} catalog={modelPricingCatalog} />
          </section>
        );
      case "settings":
        return (
          <section className="grid gap-4" aria-label={tApp("settings.ariaLabel")}>
            <ApiModelConfigPanel
              config={providerConfig}
              servicePreference={modelServicePreference}
              drafts={modelConfigDrafts}
              testStatuses={modelConfigTestStatus}
              onDraftChange={updateModelConfigDraft}
              onApplyPreset={applyModelPreset}
              onSave={saveModelConfig}
              onTest={testModelConfig}
              onRefreshModels={refreshModelCatalog}
              onRevealApiKey={revealModelConfigApiKey}
              onClear={clearModelConfig}
              onToggleEnabled={toggleModelConfigEnabled}
              onServicePreferenceChange={saveModelServicePreference}
              isBusy={isBusy}
            />
          </section>
        );
    }
  }

  if (authSession.authEnabled && !authSession.authenticated) {
    return (
      <LoginScreen
        mode={authFlowMode}
        setMode={changeAuthFlowMode}
        email={authEmail}
        setEmail={setAuthEmail}
        password={authPassword}
        setPassword={setAuthPassword}
        otp={authOtp}
        setOtp={setAuthOtp}
        newPassword={authNewPassword}
        setNewPassword={setAuthNewPassword}
        status={authStatus}
        authOtpCooldownSeconds={authOtpCooldownSeconds}
        forgotPasswordOtpSent={forgotPasswordOtpSent}
        isBusy={isBusy || isLoading}
        onLogin={login}
        onVerifyEmail={verifyEmail}
        onResendVerificationCode={resendVerificationCode}
        onRequestPasswordReset={requestPasswordReset}
        onResetPassword={resetPassword}
      />
    );
  }

  return (
    <main
      className={cn(
        "relative grid h-dvh overflow-hidden bg-[radial-gradient(circle_at_0_0,rgba(224,178,134,.28),transparent_30%),radial-gradient(circle_at_100%_0,rgba(198,90,54,.10),transparent_32%),linear-gradient(180deg,#f8efe7_0%,var(--bg)_52%,#f3e5d8_100%)] text-[var(--text)] transition-[grid-template-columns] duration-200",
        sidebarCollapsed
          ? "min-[900px]:grid-cols-[56px_minmax(0,1fr)]"
          : "min-[900px]:grid-cols-[232px_minmax(0,1fr)]"
      )}
    >
      <aside
        className={cn(
          "relative z-40 hidden h-dvh min-h-0 border-r border-[var(--border)] bg-[var(--panel)] transition-[width] duration-200 min-[900px]:grid min-[900px]:grid-rows-[auto_minmax(0,1fr)_auto]",
          sidebarCollapsed ? "w-[56px] overflow-visible" : "w-[232px] overflow-visible"
        )}
      >
        <button
          type="button"
          className="app-sidebar-collapse-rail group absolute inset-y-0 right-[-10px] z-30 hidden w-5 cursor-pointer bg-transparent text-[var(--muted)] transition-colors hover:text-[var(--accent)] focus-visible:outline-none min-[900px]:flex min-[900px]:items-center min-[900px]:justify-center"
          aria-label={sidebarCollapsed ? tApp("shell.sidebarExpand") : tApp("shell.sidebarCollapse")}
          title={sidebarCollapsed ? tApp("shell.sidebarExpand") : tApp("shell.sidebarCollapse")}
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        >
          <span className="app-sidebar-collapse-button pointer-events-none grid h-8 w-8 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--panel)]/95 opacity-0 shadow-[0_10px_24px_rgba(96,64,43,.14)] transition group-hover:opacity-100 group-focus-visible:opacity-100 group-hover:border-[color-mix(in_srgb,var(--accent)_42%,var(--border-strong))] group-hover:bg-[color-mix(in_srgb,var(--accent)_5%,var(--panel))]">
            {sidebarCollapsed ? <ChevronRight size={16} strokeWidth={2.4} /> : <ChevronLeft size={16} strokeWidth={2.4} />}
          </span>
        </button>
        <div className={cn("relative flex h-[72px] items-center", sidebarCollapsed ? "justify-center px-2" : "gap-2.5 px-3.5")}>
          <BrandLogo className="h-10 w-10" />
          <div className={cn("min-w-0", sidebarCollapsed && "sr-only")}>
            <div className="truncate text-[20px] font-black leading-tight">Haitu</div>
            <div className="truncate text-xs font-semibold text-[var(--muted)]">{tApp("shell.tagline")}</div>
          </div>
        </div>
        <nav
          className={cn(
            "grid min-h-0 content-start gap-4 py-4",
            sidebarCollapsed ? "overflow-visible" : "overflow-y-auto overflow-x-hidden",
            sidebarCollapsed ? "px-1.5" : "px-2.5"
          )}
          aria-label={tApp("shell.navigationLabel")}
        >
          {navGroups.map((group) => (
            <div key={group.labelKey || "dashboard"} className="grid gap-1">
              {group.labelKey ? (
                <div className={cn("px-3 text-[11px] font-black uppercase tracking-[.12em] text-[var(--muted)]", sidebarCollapsed && "sr-only")}>{tApp(`navigation.${group.labelKey}`)}</div>
              ) : null}
              {group.items.map(({ id, labelKey, icon: Icon }) => {
                const active = id === "video" ? activeSectionIsCreativeWorkspace : activeSection === id;
                const label = tApp(`navigation.${labelKey}`);
                return (
                  <button
                    key={id}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    title={sidebarCollapsed ? label : undefined}
                    onClick={() => setActiveSection(id)}
                    className={cn(
                      "group/sidebar-nav-item relative grid min-h-9 w-full min-w-0 overflow-hidden items-center rounded-lg border text-left text-[13px] font-bold transition",
                      sidebarCollapsed
                        ? "grid-cols-1 justify-items-center px-0"
                        : "grid-cols-[28px_minmax(0,1fr)] gap-2 px-3",
                      active
                        ? "border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--field))] text-[var(--text)]"
                        : "border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--panel2)] hover:text-[var(--text)]"
                    )}
                  >
                    <Icon size={17} strokeWidth={2} />
                    <span className={cn("min-w-0 truncate", sidebarCollapsed && "sr-only")}>{label}</span>
                    {sidebarCollapsed ? (
                      <span
                        className={cn(
                          floatingTooltipClass,
                          "app-sidebar-nav-tooltip left-[calc(100%+10px)] top-1/2 z-40 -translate-y-1/2 group-hover/sidebar-nav-item:opacity-100 group-focus-visible/sidebar-nav-item:opacity-100",
                        )}
                      >
                        {label}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className={cn(
          "app-sidebar-account border-t border-[var(--border)] py-2",
          sidebarCollapsed ? "grid gap-1.5 px-1.5" : "grid gap-1.5 px-2.5"
        )}>
          {authSession.authEnabled ? (
            <AccountMenu
              email={authSession.user?.email}
              disabled={isBusy}
              collapsed={sidebarCollapsed}
              onLogout={() => void logout()}
            />
          ) : null}
          <AppLanguageSwitcher collapsed={sidebarCollapsed} />
        </div>
      </aside>

      <section className="grid h-dvh min-w-0 grid-rows-[minmax(0,1fr)] overflow-hidden">
        <div
          ref={contentScrollerRef}
          className={cn(
            "min-h-0",
            activeSectionIsCreativeWorkspace
              ? "overflow-hidden p-0"
              : "overflow-y-auto px-4 py-4 min-[1100px]:px-6"
          )}
        >
          {renderActiveSection()}
        </div>
        <ConsoleToast consoleToast={consoleToast} onClose={handleConsoleToastClose} />
        <ConfirmActionDialog
          action={confirmAction}
          isBusy={isBusy}
          onCancel={() => resolveConfirmAction(false)}
          onConfirm={() => resolveConfirmAction(true)}
        />
        <PaymentMethodDialog
          amountCny={pendingRechargeAmountCny}
          isBusy={isBusy}
          paymentMethods={paymentMethods}
          onClose={closeRechargeDialog}
          onContinue={continueWalletRecharge}
        />
      </section>
    </main>
  );
}

function AppLanguageSwitcher({ collapsed = false }: { collapsed?: boolean }) {
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
    <div
      ref={menuRef}
      className={cn(
        "app-language-switcher relative z-40",
        collapsed ? "mx-auto" : "min-w-0"
      )}
    >
      <button
        type="button"
        aria-label={languageChangeLabel}
        aria-expanded={open}
        title={languageChangeLabel}
        className={cn(
          "grid min-h-9 w-full min-w-0 grid-cols-[26px_minmax(0,1fr)] items-center gap-2 rounded-[8px] border border-[var(--border-strong)] bg-[var(--field)] px-2 text-left text-xs font-black text-[var(--accent2)] shadow-[0_8px_18px_rgba(96,64,43,.08)] transition hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--border-strong))] hover:bg-[color-mix(in_srgb,var(--accent)_7%,var(--field))] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(10,163,148,.18)]",
          collapsed && "h-9 w-9 min-w-0 grid-cols-1 place-items-center rounded-full px-0",
          open && "border-[color-mix(in_srgb,var(--accent)_55%,var(--border-strong))] bg-[color-mix(in_srgb,var(--accent)_9%,var(--field))] text-[var(--accent)]"
        )}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_9%,var(--field))]">
          <Globe2 size={17} strokeWidth={2.1} />
        </span>
        {!collapsed ? <span className="min-w-0 truncate">{getLocaleMeta(currentLocale).label}</span> : null}
      </button>

      {open ? (
        <div
          className="app-language-menu absolute bottom-[calc(100%+8px)] left-0 top-auto z-50 grid min-w-[136px] gap-1 rounded-[8px] border border-[var(--border-strong)] bg-[var(--panel)] p-1.5 shadow-[0_18px_46px_rgba(96,64,43,.16)]"
        >
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

function AccountMenu({ email, disabled, collapsed = false, onLogout }: { email?: string; disabled?: boolean; collapsed?: boolean; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const tAccount = makeAppTranslator("account");
  const accountLabel = email?.trim() || tAccount("fallback");
  const accountInitial = accountLabel.slice(0, 1).toUpperCase();

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

  function handleLogout() {
    setOpen(false);
    onLogout();
  }

  return (
    <div ref={menuRef} className="relative min-w-0">
      <button
        type="button"
        aria-label={tAccount("menu")}
        aria-expanded={open}
        title={collapsed ? accountLabel : undefined}
        className={cn(
          "grid min-h-8 max-w-[min(260px,calc(100vw-48px))] grid-cols-[24px_minmax(0,1fr)_14px] items-center gap-2 rounded-[8px] border border-[var(--border-strong)] bg-[var(--panel)] px-2 py-1.5 text-left text-xs font-black text-[var(--text)] shadow-[0_8px_18px_rgba(96,64,43,.05)] transition hover:border-[color-mix(in_srgb,var(--accent)_42%,var(--border-strong))] hover:bg-[color-mix(in_srgb,var(--accent)_5%,var(--panel))] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(10,163,148,.18)] disabled:cursor-not-allowed disabled:opacity-55",
          collapsed && "mx-auto h-9 w-9 max-w-none grid-cols-1 place-items-center px-0 py-0",
          open && "border-[color-mix(in_srgb,var(--accent)_55%,var(--border-strong))] bg-[color-mix(in_srgb,var(--accent)_7%,var(--panel))]"
        )}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="grid h-6 w-6 place-items-center rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,var(--field))] text-[11px] font-black text-[var(--accent)]">
          {accountInitial}
        </span>
        <span className={cn("truncate", collapsed && "sr-only")}>{accountLabel}</span>
        <ChevronDown className={cn("text-[var(--muted)] transition-transform", collapsed && "sr-only", open && "rotate-180")} size={14} strokeWidth={2.4} />
      </button>

      {open ? (
        <div className={cn(
          "absolute bottom-[calc(100%+8px)] z-50 w-[min(280px,calc(100vw-32px))] overflow-hidden rounded-[8px] border border-[var(--border-strong)] bg-[var(--panel)] shadow-[0_18px_46px_rgba(96,64,43,.16)]",
          collapsed ? "left-0" : "left-0 right-0"
        )}>
          <div className="grid gap-1.5 border-b border-[var(--border)] bg-[linear-gradient(180deg,var(--panel),var(--panel2))] px-3 py-3">
            <div className="text-[11px] font-black text-[var(--muted)]">{tAccount("label")}</div>
            <div className="truncate text-[13px] font-black text-[var(--text)]">{accountLabel}</div>
          </div>
          <div className="p-1.5">
            <button
              type="button"
              className="flex min-h-9 w-full items-center gap-2 rounded-[7px] px-2.5 text-left text-[13px] font-black text-[var(--danger)] transition hover:bg-red-50 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(239,68,68,.14)] disabled:cursor-not-allowed disabled:opacity-55"
              disabled={disabled}
              onClick={handleLogout}
            >
              <KeyRound size={15} />
              <span>{tAccount("logout")}</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ConsoleToast({ consoleToast, onClose }: { consoleToast?: ConsoleToastState; onClose: () => void }) {
  const tDialogs = makeAppTranslator("dialogs");
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!consoleToast || paused) {
      return;
    }
    const timeout = window.setTimeout(onClose, 3000);
    return () => window.clearTimeout(timeout);
  }, [consoleToast?.id, onClose, paused]);

  if (!consoleToast) {
    return null;
  }

  const warn = consoleToast.tone === "warn";
  const ok = consoleToast.tone === "ok";
  return (
    <div className="pointer-events-none fixed right-5 top-[86px] z-[100] w-[min(360px,calc(100vw-32px))]">
      <div
        className={cn(
          "pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 shadow-[0_18px_46px_rgba(15,23,42,.14)] backdrop-blur-md",
          warn
            ? "border-amber-200 bg-amber-50/88 text-amber-900"
            : ok
              ? "border-emerald-200 bg-emerald-50/90 text-emerald-950"
              : "border-[var(--border)] bg-[var(--field)]/90 text-[var(--text)]"
        )}
        role="status"
        aria-live="polite"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {ok ? (
          <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={15} />
        ) : (
          <AlertTriangle className={cn("mt-0.5 shrink-0", warn ? "text-amber-600" : "text-[var(--accent)]")} size={15} />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-black leading-5">{consoleToast.title}</div>
          <div className="text-[12px] font-semibold leading-5">{consoleToast.message}</div>
        </div>
        <button
          type="button"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-current opacity-65 transition hover:bg-[var(--field2)] hover:opacity-100"
          aria-label={tDialogs("closeToast")}
          onClick={onClose}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

function ConfirmActionDialog({
  action,
  isBusy,
  onCancel,
  onConfirm
}: {
  action?: ConfirmActionState;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const tDialogs = makeAppTranslator("dialogs");
  const tActions = makeAppTranslator("commonActions");
  useEffect(() => {
    if (!action || isBusy) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [action, isBusy, onCancel]);

  if (!action) {
    return null;
  }

  const paid = action.tone === "paid";
  const danger = action.tone === "danger";
  const Icon = paid ? CircleDollarSign : danger ? AlertTriangle : ShieldCheck;
  const iconClass = paid ? "text-amber-700" : danger ? "text-[var(--danger)]" : "text-[var(--accent)]";
  const iconBgClass = paid ? "bg-amber-50" : danger ? "bg-red-50" : "bg-[color-mix(in_srgb,var(--accent)_10%,var(--field))]";
  const confirmVariant = danger ? "danger" : paid ? "primary" : "primary";

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-[rgba(23,32,51,.45)] p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={action.title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) {
          onCancel();
        }
      }}
    >
      <section className="grid w-full max-w-[500px] gap-4 rounded-[18px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_28px_90px_rgba(96,64,43,.18)]">
        <div className="flex items-start justify-between gap-3">
          <div className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)] gap-3">
            <div className={cn("grid h-10 w-10 place-items-center rounded-xl border border-[var(--field)] shadow-[0_12px_24px_rgba(96,64,43,.08)]", iconBgClass)}>
              <Icon className={iconClass} size={19} strokeWidth={2.4} />
            </div>
            <div className="min-w-0">
              <div className="text-[17px] font-black leading-6 text-[var(--text)]">{action.title}</div>
              <div className="mt-2 break-words text-[13px] font-bold leading-6 text-[var(--text)]">{action.message}</div>
            </div>
          </div>
          <Button className="w-fit" size="icon" variant="ghost" aria-label={tDialogs("closeConfirm")} disabled={isBusy} onClick={onCancel}>
            <X size={15} />
          </Button>
        </div>
        {action.details?.length ? (
          <div className="grid gap-1.5 rounded-[12px] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-xs font-semibold leading-5 text-[var(--muted)]">
            {action.details.map((detail) => (
              <div key={detail}>{detail}</div>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button className="w-fit" variant="ghost" disabled={isBusy} onClick={onCancel}>
            {action.cancelLabel ?? tActions("cancel")}
          </Button>
          <Button className="w-fit" variant={confirmVariant} disabled={isBusy} onClick={onConfirm}>
            {danger ? <X size={13} /> : paid ? <CircleDollarSign size={13} /> : <ShieldCheck size={13} />}
            {action.confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}

function PaymentMethodDialog({
  amountCny,
  isBusy,
  onClose,
  onContinue,
  paymentMethods
}: {
  amountCny?: number;
  isBusy: boolean;
  onClose: () => void;
  onContinue: (paymentMethodId: PaymentMethodView["id"]) => Promise<void>;
  paymentMethods: PaymentMethodView[];
}) {
  const tDialog = makeAppTranslator("dialogs");
  const tPayment = makeAppTranslator("dialogs.payment");
  const tWallet = makeAppTranslator("wallet");
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<PaymentMethodView["id"]>("stripe");
  const [selectedPaymentKind, setSelectedPaymentKind] = useState<PaymentMethodView["kind"]>("rmb");
  const [quotedPaymentMethods, setQuotedPaymentMethods] = useState<PaymentMethodView[]>(paymentMethods);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [quoteLoadFailed, setQuoteLoadFailed] = useState(false);
  const quoteRequestSeqRef = useRef(0);
  const displayPaymentMethods = quotedPaymentMethods.length > 0 ? quotedPaymentMethods : paymentMethods;
  const rmbMethods = displayPaymentMethods.filter((method) => method.kind === "rmb");
  const cryptoMethods = displayPaymentMethods.filter((method) => method.kind === "crypto");
  const selectedMethodInAllMethods = displayPaymentMethods.find((method) => method.id === selectedPaymentMethodId);
  const visibleMethods = selectedPaymentKind === "crypto" ? cryptoMethods : rmbMethods;
  const selectedMethod = visibleMethods.find((method) => method.id === selectedPaymentMethodId) ?? visibleMethods[0];
  const selectedQuote = selectedMethod?.quote;
  const selectedQuoteReady = Boolean(selectedQuote) || (selectedMethod?.paymentCurrency === "cny" && !isLoadingQuote && !quoteLoadFailed);
  const canContinue = Boolean(selectedMethod?.available && selectedQuoteReady);
  const methodGroups = [
    { kind: "rmb" as const, title: tPayment("rmb"), emptyText: tPayment("rmbEmpty"), methods: rmbMethods },
    { kind: "crypto" as const, title: tPayment("crypto"), emptyText: tPayment("cryptoEmpty"), methods: cryptoMethods }
  ];

  function refreshPaymentQuote() {
    if (!amountCny) {
      setQuotedPaymentMethods(paymentMethods);
      return;
    }
    const requestSeq = quoteRequestSeqRef.current + 1;
    quoteRequestSeqRef.current = requestSeq;
    setIsLoadingQuote(true);
    setQuoteLoadFailed(false);
    void getJson<PaymentMethodsResponse>(`/api/payment-methods?amountCny=${encodeURIComponent(String(amountCny))}&methodId=${encodeURIComponent(selectedPaymentMethodId)}`)
      .then((response) => {
        if (quoteRequestSeqRef.current === requestSeq) {
          setQuotedPaymentMethods(response.methods);
        }
      })
      .catch(() => {
        if (quoteRequestSeqRef.current === requestSeq) {
          setQuotedPaymentMethods(paymentMethods);
          setQuoteLoadFailed(true);
        }
      })
      .finally(() => {
        if (quoteRequestSeqRef.current === requestSeq) {
          setIsLoadingQuote(false);
        }
      });
  }

  useEffect(() => {
    if (!amountCny) return;
    if (selectedMethodInAllMethods) return;
    const fallback = rmbMethods[0] ?? cryptoMethods[0] ?? paymentMethods[0];
    if (!fallback) return;
    setSelectedPaymentMethodId(fallback?.id ?? "stripe");
    setSelectedPaymentKind(fallback?.kind ?? "rmb");
  }, [amountCny, displayPaymentMethods.length]);

  useEffect(() => {
    refreshPaymentQuote();
  }, [amountCny, paymentMethods, selectedPaymentMethodId]);

  if (!amountCny) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-[rgba(23,32,51,.45)] p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={tPayment("ariaLabel")}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) {
          onClose();
        }
      }}
    >
      <section className="grid w-full max-w-[520px] gap-4 rounded-[18px] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_28px_90px_rgba(96,64,43,.18)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[18px] font-black leading-6 text-[var(--text)]">{tPayment("title")}</div>
            <div className="mt-1 text-[12px] font-bold text-[var(--muted)]">{tPayment("subtitle")}</div>
          </div>
          <Button className="w-fit" size="icon" variant="ghost" aria-label={tDialog("closePayment")} disabled={isBusy} onClick={onClose}>
            <X size={15} />
          </Button>
        </div>

        <div className="grid gap-2 rounded-[12px] border border-[var(--border)] bg-[var(--card)] p-3 sm:grid-cols-[1fr_1fr_1.15fr]">
          <MetricInline label={tPayment("credit")} value={`¥${money(selectedQuote?.creditCny ?? amountCny)}`} />
          <MetricInline label={tPayment("amount")} value={paymentMethodPaymentAmountText(selectedMethod, amountCny, isLoadingQuote)} />
          <PaymentRateMetric
            label={tPayment("rate")}
            value={paymentMethodFxRateText(selectedQuote, isLoadingQuote)}
            refreshLabel={tPayment("refreshRate")}
            loading={isLoadingQuote}
            onRefresh={refreshPaymentQuote}
          />
        </div>

        <div className="payment-kind-card-grid grid gap-2 sm:grid-cols-2">
          {methodGroups.map((group) => {
            const groupSelected = selectedPaymentKind === group.kind;
            const groupMethod = group.methods.find((method) => method.id === selectedPaymentMethodId) ?? group.methods[0];
            const icon = group.kind === "crypto" ? <WalletCards size={18} /> : <CreditCard size={18} />;
            const statusLabel = groupMethod
              ? groupMethod.available
                  ? groupSelected
                  ? tPayment("selected")
                  : tPayment("selectable")
                : tPayment("notConfigured")
              : tPayment("disabled");
            return (
              <button
                key={group.kind}
                type="button"
                className={cn(
                  "payment-kind-card grid min-h-[148px] content-start gap-3 rounded-[14px] border bg-[var(--card)] p-3 text-left transition hover:border-[var(--accent)] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(10,163,148,.18)]",
                  groupSelected ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_5%,var(--card))] shadow-[0_12px_28px_rgba(10,163,148,.12)]" : "border-[var(--border)]"
                )}
                onClick={() => {
                  setSelectedPaymentKind(group.kind);
                  setSelectedPaymentMethodId(groupMethod?.id ?? (group.kind === "crypto" ? "infini" : "stripe"));
                }}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="payment-kind-card-heading-icon grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[color-mix(in_srgb,var(--accent)_10%,var(--field))] text-[var(--accent)]">
                      {icon}
                    </span>
                    <span className="min-w-0 text-sm font-black text-[var(--text)]">{group.title}</span>
                  </span>
                  <Badge tone={groupMethod?.available ? (groupSelected ? "ok" : "neutral") : "warn"}>
                    {statusLabel}
                  </Badge>
                </span>
                {groupMethod ? (
                  <span className="grid gap-3">
                    <span className="min-w-0">
                      <span className="block text-[13px] font-black text-[var(--text)]">{groupMethod.label}</span>
                      <span className="mt-1 block text-[12px] font-semibold leading-5 text-[var(--muted)]">{groupMethod.description}</span>
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      {paymentMethodBadges(groupMethod.id, tWallet).map((label) => <Badge key={label}>{label}</Badge>)}
                    </span>
                  </span>
                ) : (
                  <span className="grid min-h-[72px] place-items-center rounded-[10px] border border-dashed border-[var(--border)] px-3 text-center text-[12px] font-bold leading-5 text-[var(--muted)]">
                    {group.emptyText}
                  </span>
                )}
              </button>
            );
          })}
          {selectedMethod && (!selectedMethod.available || quoteLoadFailed) ? (
            <div className="rounded-[10px] border border-[color-mix(in_srgb,#f59e0b_36%,var(--border))] bg-[color-mix(in_srgb,#f59e0b_10%,var(--panel))] px-3 py-2 text-[12px] font-bold leading-5 text-[var(--muted)]">
              {quoteLoadFailed ? tPayment("quoteUnavailable") : selectedMethod.unavailableReason ?? tPayment("unavailable")}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button className="w-fit" variant="ghost" disabled={isBusy} onClick={onClose}>{tAppGlobal("commonActions.cancel")}</Button>
          <Button className="min-w-[96px]" variant="primary" disabled={isBusy || !canContinue} onClick={() => selectedMethod && selectedMethod.available ? void onContinue(selectedMethod.id) : undefined}>
            {isBusy ? <RefreshCcw className="h-3.5 w-3.5 animate-spin" /> : <CreditCard size={14} />}
            {isBusy ? tPayment("processing") : tPayment("pay")}
          </Button>
        </div>
      </section>
    </div>
  );
}

function LoginScreen({
  mode,
  setMode,
  email,
  setEmail,
  password,
  setPassword,
  otp,
  setOtp,
  newPassword,
  setNewPassword,
  status,
  authOtpCooldownSeconds,
  forgotPasswordOtpSent,
  isBusy,
  onLogin,
  onVerifyEmail,
  onResendVerificationCode,
  onRequestPasswordReset,
  onResetPassword
}: {
  mode: AuthFlowMode;
  setMode: (value: AuthFlowMode) => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  otp: string;
  setOtp: (value: string) => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  status: string;
  authOtpCooldownSeconds: number;
  forgotPasswordOtpSent: boolean;
  isBusy: boolean;
  onLogin: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onVerifyEmail: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onResendVerificationCode: () => Promise<void>;
  onRequestPasswordReset: () => Promise<void>;
  onResetPassword: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const tAuth = (key: string, options?: Record<string, unknown>) => i18n.t(`app:auth.${key}`, options);
  const resetDisabled = isBusy || !email.trim() || !otp.trim() || !newPassword.trim();
  const verifiedEmailOtpLabel = authOtpSendLabel({
    cooldownSeconds: authOtpCooldownSeconds,
    sent: true
  });
  const passwordResetOtpLabel = authOtpSendLabel({
    cooldownSeconds: authOtpCooldownSeconds,
    sent: forgotPasswordOtpSent
  });
  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_15%_10%,rgba(224,178,134,.28),transparent_28%),radial-gradient(circle_at_86%_4%,rgba(198,90,54,.12),transparent_30%),radial-gradient(circle_at_50%_100%,rgba(10,163,148,.10),transparent_34%),var(--bg)] px-4 py-8 text-[var(--text)]">
      <Card className="w-full max-w-[420px] p-5 shadow-[0_22px_60px_rgba(96,64,43,.14)]">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo className="h-11 w-11" />
            <div className="min-w-0">
              <h1 className="m-0 text-xl font-black leading-tight">{tAuth("title")}</h1>
              <p className="m-0 mt-1 text-xs font-semibold text-[var(--muted)]">
                {mode === "forgot-password"
                  ? tAuth("reset.subtitle")
                  : mode === "verify-email"
                    ? tAuth("verify.subtitle")
                    : tAuth("entry.subtitle")}
              </p>
            </div>
          </div>
          <div className="w-9 shrink-0">
            <AppLanguageSwitcher collapsed />
          </div>
        </div>
        {mode === "entry" ? (
          <form className="grid gap-4" onSubmit={onLogin}>
            <Field label={tAuth("email")}>
              <Input
                autoFocus
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={tAuth("emailPlaceholder")}
              />
            </Field>
            <Field label={tAuth("password")}>
              <Input
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={tAuth("passwordPlaceholder")}
              />
            </Field>
            <Button variant="primary" type="submit" disabled={isBusy || !email.trim() || !password.trim()}>
              <KeyRound size={15} />
              {tAuth("entry.submit")}
            </Button>
            <div className="flex items-center justify-between gap-3 text-xs font-semibold">
              <span className="text-[var(--muted)]">{tAuth("entry.newEmailHint")}</span>
              <button
                type="button"
                className="font-black text-[var(--accent)] hover:underline"
                onClick={() => {
                  setMode("forgot-password");
                  setOtp("");
                  setNewPassword("");
                }}
              >
                {tAuth("entry.forgotPassword")}
              </button>
            </div>
            <AuthStatus status={status} />
          </form>
        ) : null}

        {mode === "verify-email" ? (
          <form className="grid gap-4" onSubmit={onVerifyEmail}>
            <Field label={tAuth("email")}>
              <Input
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={tAuth("emailPlaceholder")}
              />
            </Field>
            <AuthOtpField
              autoFocus
              label={tAuth("otp.label")}
              placeholder={tAuth("otp.placeholder")}
              value={otp}
              onChange={setOtp}
              sendLabel={verifiedEmailOtpLabel}
              disabled={isBusy || !email.trim() || !password.trim() || authOtpCooldownSeconds > 0}
              onSend={onResendVerificationCode}
            />
            <Button variant="primary" type="submit" disabled={isBusy || !email.trim() || !otp.trim()}>
              <MailCheck size={15} />
              {tAuth("verify.submit")}
            </Button>
            <button
              type="button"
              className="justify-self-center text-xs font-black text-[var(--accent)] hover:underline"
              onClick={() => setMode("entry")}
            >
              {tAuth("backToEntry")}
            </button>
            <AuthStatus status={status} />
          </form>
        ) : null}

        {mode === "forgot-password" ? (
          <div className="grid gap-4">
            <Field label={tAuth("email")}>
              <Input
                autoFocus
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={tAuth("emailPlaceholder")}
              />
            </Field>
            <form className="grid gap-4" onSubmit={onResetPassword}>
              <Field label={tAuth("reset.newPassword")}>
                <Input
                  autoComplete="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder={tAuth("reset.newPasswordPlaceholder")}
                />
              </Field>
              <AuthOtpField
                label={tAuth("otp.label")}
                placeholder={tAuth("otp.placeholder")}
                value={otp}
                onChange={setOtp}
                sendLabel={passwordResetOtpLabel}
                disabled={isBusy || !email.trim() || authOtpCooldownSeconds > 0}
                onSend={onRequestPasswordReset}
              />
              <Button variant="primary" type="submit" disabled={resetDisabled}>
                <KeyRound size={15} />
                {tAuth("reset.submit")}
              </Button>
            </form>
            <button
              type="button"
              className="justify-self-center text-xs font-black text-[var(--accent)] hover:underline"
              onClick={() => setMode("entry")}
            >
              {tAuth("backToEntry")}
            </button>
            <AuthStatus status={status} />
          </div>
        ) : null}
      </Card>
    </main>
  );
}

function AuthOtpField({
  autoFocus,
  disabled,
  label,
  onChange,
  onSend,
  placeholder,
  sendLabel,
  value
}: {
  autoFocus?: boolean;
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  onSend: () => Promise<void>;
  placeholder: string;
  sendLabel: string;
  value: string;
}) {
  const tLedger = makeAppTranslator("ledger");
  return (
    <Field label={label}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Input
          autoFocus={autoFocus}
          autoComplete="one-time-code"
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
        <Button
          variant="soft"
          type="button"
          className="min-w-[132px] px-3"
          disabled={disabled}
          onClick={() => void onSend()}
        >
          <RefreshCcw size={15} />
          {sendLabel}
        </Button>
      </div>
    </Field>
  );
}

function authOtpSendLabel({
  cooldownSeconds,
  sent
}: {
  cooldownSeconds: number;
  sent: boolean;
}) {
  if (cooldownSeconds > 0) {
    return i18n.t("app:auth.otp.cooldown", { seconds: cooldownSeconds });
  }
  return sent ? i18n.t("app:auth.otp.resend") : i18n.t("app:auth.otp.send");
}

function AuthStatus({ status }: { status: string }) {
  if (!status) {
    return null;
  }
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3 text-xs font-semibold leading-5 text-[var(--muted)]">
      {status}
    </div>
  );
}

function PreflightPanel({ preflight, fresh }: { preflight?: Preflight; fresh: boolean }) {
  const tPreflight = makeAppTranslator("preflight");
  if (!preflight) {
    return (
      <Card>
        <PanelTitle icon={<ShieldCheck size={16} />} right={<Badge>{tPreflight("notGenerated")}</Badge>}>{tPreflight("title")}</PanelTitle>
        <div className="grid min-h-[260px] place-items-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--panel2)] p-6 text-center">
          <div className="grid max-w-[360px] justify-items-center gap-3">
            <Sparkles className="text-[var(--accent)]" size={32} />
            <div>
              <div className="text-[15px] font-black">{tPreflight("emptyTitle")}</div>
              <p className="m-0 mt-1 text-[12px] text-[var(--muted)]">{tPreflight("emptyDescription")}</p>
            </div>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <PanelTitle
        icon={<ShieldCheck size={16} />}
        right={<Badge tone={preflight.requiresPaidConfirmation ? "danger" : "ok"}>{fresh ? tPreflight("ready") : tPreflight("stale")}</Badge>}
      >
        {tPreflight("title")}
      </PanelTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <MiniMetric label={tPreflight("expectedCost")} value={`¥${money(preflight.walletEstimatedChargeCny?.expected ?? preflight.estimatedCostCny.expected)}`} hint={tPreflight("costRange", { low: money(preflight.walletEstimatedChargeCny?.low ?? preflight.estimatedCostCny.low), high: money(preflight.walletEstimatedChargeCny?.high ?? preflight.estimatedCostCny.high) })} />
        <MiniMetric label={tPreflight("expectedTokens")} value={formatNumber(preflight.estimatedTokens.expected)} hint={`${formatNumber(preflight.estimatedTokens.low)} - ${formatNumber(preflight.estimatedTokens.high)}`} />
        <MiniMetric label={tPreflight("upstreamCost")} value={`¥${money(preflight.upstreamEstimatedCostCny?.expected ?? 0)}`} hint={preflight.apiBillingMode === "platform" ? tPreflight("officialModelPrice") : tPreflight("byokUpstreamHint")} />
        <MiniMetric label={tPreflight("serviceFee")} value={`¥${money(preflight.serviceFeeCny?.expected ?? 0)}`} hint={tPreflight("serviceFeeHint")} />
        <MiniMetric label={tPreflight("duration")} value={`${preflight.durationSeconds}s`} hint={preflight.aspectRatio} />
        <MiniMetric label={tPreflight("provider")} value={providerLabel(preflight.provider, makeAppTranslator("status"))} hint={preflight.paidProvider ? tPreflight("realModel") : tPreflight("mockTask")} />
        <MiniMetric label={tPreflight("currentEstimate")} value={`¥${money(preflight.credit.estimatedCostCny)}`} hint={tPreflight("currentEstimateHint")} />
        <MiniMetric label={tPreflight("historyEstimate")} value={`¥${money(preflight.credit.usedEstimatedCostCny)}`} hint={tPreflight("historyEstimateHint")} />
      </div>
      {preflight.paidProvider ? (
        <div className={cn(
          "mt-3 rounded-lg border p-3 text-xs font-bold leading-5",
          preflight.readiness.readyForPaidGeneration
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-red-200 bg-red-50 text-[var(--danger)]"
        )}>
          <div className="flex items-center gap-2 text-[13px] font-black">
            {preflight.readiness.readyForPaidGeneration ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            {preflight.readiness.readyForPaidGeneration ? tPreflight("readyForPaid") : tPreflight("notReadyForPaid")}
          </div>
          {preflight.readiness.blockingReasons.length > 0 ? (
            <div className="mt-1">{tPreflight("blockingReasons", { reasons: preflight.readiness.blockingReasons.join("、") })}</div>
          ) : null}
          {preflight.readiness.warnings.length > 0 ? (
            <ul className="m-0 mt-2 grid gap-1 pl-4">
              {preflight.readiness.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className={cn("mt-3 rounded-lg border p-3", preflight.warnings.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50")}>
        <div className="flex items-center gap-2 text-[13px] font-black">
          {preflight.warnings.length ? <AlertTriangle size={15} className="text-[var(--warn)]" /> : <CheckCircle2 size={15} className="text-[var(--ok)]" />}
          {tPreflight("referenceSummary", { previewable: formatNumber(preflight.assetSummary.previewable), total: formatNumber(preflight.assetSummary.total) })}
        </div>
        <div className="mt-1 text-xs text-[var(--muted)]">
          {tPreflight("referenceDetails", { missing: formatNumber(preflight.assetSummary.missing), outside: formatNumber(preflight.assetSummary.outsideProjectRoot), remote: formatNumber(preflight.assetSummary.remote) })}
        </div>
      </div>
      <CopyBlock title={tPreflight("scriptPoints")}>
        <p className="m-0 text-[13px] leading-relaxed text-[var(--text)]">{preflight.script.voiceover}</p>
        <ul className="m-0 mt-2 grid gap-1 pl-4 text-xs text-[var(--muted)]">
          {preflight.script.subtitleLines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </CopyBlock>
      <CopyBlock title="Seedance Prompt">
        <pre className="max-h-[250px] overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-[var(--text)]">{preflight.prompt}</pre>
      </CopyBlock>
    </Card>
  );
}

function ProductCreationWorkspace({
  mode,
  onModeChange,
  appLocale,
  products,
  pendingProductSku,
  selectedProduct,
  loadError,
  selectedProductGroup,
  ledgerJobs,
  videoJobs,
  draft,
  importText,
  setImportText,
  pendingImageFiles,
  setPendingImageFiles,
  importNotes,
  productAutoSaveStatus,
  billingEstimates,
  billingEstimatesStatus,
  onOrganizeProductPackage,
  onFlushProductFactsAutoSave,
  onSelectProduct,
  onStartNewProduct,
  onDeleteProduct,
  onGenerateVideo,
  onCancelVideoJob,
  onDeleteLedgerVideo,
  onRetryVideoJob,
  onRecoverVideoJobDownload,
  onGenerateStoryboardDraft,
  isGeneratingStoryboard,
  onGenerateImagePromptDraft,
  isGeneratingImagePrompt,
  onImportAssets,
  onUploadImages,
  onGenerateReferenceImages,
  onDeleteReferenceImage,
  onReorderReferenceImage,
  textModelOptions,
  selectedTextModelConfigId,
  imageModelOptions,
  selectedImageModelConfigId,
  onImageModelConfigChange,
  videoModelOptions,
  selectedVideoModelConfigId,
  onVideoModelConfigChange,
  duration,
  onDurationChange,
  selectedVideoResolution,
  onVideoResolutionChange,
  selectedVideoAspectRatio,
  onVideoAspectRatioChange,
  versionCount,
  onVersionCountChange,
  template,
  enabledTemplateOptions,
  onTemplateChange,
  finalLanguage,
  onFinalLanguageChange,
  storyboardDraft,
  storyboardDraftSource,
  onStoryboardDraftChange,
  onPreviewProductFileImport,
  onFillCurrentProductFromFileRow,
  onCommitProductFileImportRows,
  onToast
}: {
  mode: ProductCreativeWorkspaceMode;
  onModeChange: (mode: ProductCreativeWorkspaceMode) => void;
  appLocale: AppLocale;
  products: ProductSummary[];
  pendingProductSku?: string;
  selectedProduct?: ProductDetail;
  loadError?: string;
  selectedProductGroup?: ProductGroup;
  ledgerJobs: LedgerJob[];
  videoJobs: VideoJob[];
  draft: ProductDraft;
  importText: string;
  setImportText: (text: string, draftOverride?: ProductDraft) => void;
  pendingImageFiles: File[];
  setPendingImageFiles: Dispatch<SetStateAction<File[]>>;
  importNotes: string[];
  productAutoSaveStatus: ProductAutoSaveStatus;
  billingEstimates?: BillingEstimatesResponse;
  billingEstimatesStatus: BillingEstimatesStatus;
  onOrganizeProductPackage: () => Promise<ProductDetail | undefined>;
  onFlushProductFactsAutoSave: () => Promise<ProductDetail | undefined>;
  onSelectProduct: (product: ProductSummary) => Promise<void>;
  onStartNewProduct: () => void;
  onDeleteProduct: (sku: string) => Promise<void>;
  onGenerateVideo: (product: ProductSummary, options: ProductVideoGenerationOptions) => Promise<void>;
  onCancelVideoJob: (jobId: string) => Promise<void>;
  onDeleteLedgerVideo: (jobId: string) => Promise<void>;
  onRetryVideoJob: (job: VideoJob) => Promise<void>;
  onRecoverVideoJobDownload: (job: VideoJob) => Promise<void>;
  onGenerateStoryboardDraft: (product?: ProductDetail, options?: { prompt?: string; referenceImages?: string[] }) => Promise<void>;
  isGeneratingStoryboard: boolean;
  onGenerateImagePromptDraft: (product: ProductDetail, options?: { prompt?: string; targetImage?: string; referenceImages?: string[] }) => Promise<ImagePromptDraftResponse | undefined>;
  isGeneratingImagePrompt: boolean;
  onImportAssets: (sku: string) => Promise<void>;
  onUploadImages: (sku: string, files: FileList | File[] | null) => Promise<ProductDetail | undefined>;
  onGenerateReferenceImages: (sku: string, options?: ProductImageGenerationOptions) => Promise<GeneratedReferenceImageResult[] | undefined>;
  onDeleteReferenceImage: (sku: string, index: number) => Promise<void>;
  onReorderReferenceImage: (sku: string, referenceImages: string[]) => Promise<ProductDetail | undefined>;
  textModelOptions: ProviderConfigItem[];
  selectedTextModelConfigId: ModelConfigChoice;
  imageModelOptions: ProviderConfigItem[];
  selectedImageModelConfigId: ModelConfigChoice;
  onImageModelConfigChange: (configId: ModelConfigChoice) => void;
  videoModelOptions: ProviderConfigItem[];
  selectedVideoModelConfigId: ModelConfigChoice;
  onVideoModelConfigChange: (configId: ModelConfigChoice) => void;
  duration: number;
  onDurationChange: (duration: number) => void;
  selectedVideoResolution: VideoResolution;
  onVideoResolutionChange: (resolution: VideoResolution) => void;
  selectedVideoAspectRatio: VideoAspectRatio;
  onVideoAspectRatioChange: (aspectRatio: VideoAspectRatio) => void;
  versionCount: number;
  onVersionCountChange: (versionCount: number) => void;
  template: TemplateName;
  enabledTemplateOptions: TemplateName[];
  onTemplateChange: (template: TemplateName) => void;
  finalLanguage: FinalVideoLanguage;
  onFinalLanguageChange: (language: FinalVideoLanguage) => void;
  storyboardDraft: string;
  storyboardDraftSource: StoryboardDraftSource;
  onStoryboardDraftChange: (draft: string, source?: StoryboardDraftSource) => void;
  onPreviewProductFileImport: (file: File) => Promise<ProductFileImportPreviewResponse>;
  onFillCurrentProductFromFileRow: (row: ProductFileImportRow) => Promise<void>;
  onCommitProductFileImportRows: (rows: ProductFileImportRow[], rowIds: string[]) => Promise<ProductFileImportCommitResponse>;
  onToast: ConsoleToastFn;
}) {
  const selectedSummary = selectedProduct ? products.find((product) => product.sku === selectedProduct.sku) : undefined;
  const studioProductOptions = dedupeProductSummaries(
    selectedProduct && !products.some((product) => product.sku === selectedProduct.sku)
      ? [productActionSummary(selectedProduct), ...products]
      : products
  );
  const actionProduct = selectedProduct ? productActionSummary(selectedProduct, selectedSummary) : undefined;
  const selectedProductLedgerJobs = selectedProduct
    ? mergeLedgerJobs(
      selectedProductGroup?.jobs ?? [],
      ledgerJobs.filter((job) => job.productSku === selectedProduct.sku)
    )
    : [];
  const latestCreativeJobs = actionProduct
    ? buildLatestCreativeJobs({
      actionProduct,
      ledgerJobs: selectedProductLedgerJobs,
      videoJobs
    })
    : [];
  return (
    <ProductCreationComposer
      mode={mode}
      onModeChange={onModeChange}
      appLocale={appLocale}
      products={studioProductOptions}
      pendingProductSku={pendingProductSku}
      selectedProduct={selectedProduct}
      latestCreativeJobs={latestCreativeJobs}
      loadError={loadError}
      draft={draft}
      importText={importText}
      setImportText={setImportText}
      pendingImageFiles={pendingImageFiles}
      setPendingImageFiles={setPendingImageFiles}
      importNotes={importNotes}
      productAutoSaveStatus={productAutoSaveStatus}
      billingEstimates={billingEstimates}
      billingEstimatesStatus={billingEstimatesStatus}
      onOrganizeProductPackage={onOrganizeProductPackage}
      onFlushProductFactsAutoSave={onFlushProductFactsAutoSave}
      onSelectProduct={onSelectProduct}
      onStartNewProduct={onStartNewProduct}
      onDeleteProduct={onDeleteProduct}
      onGenerateVideo={onGenerateVideo}
      onCancelVideoJob={onCancelVideoJob}
      onDeleteLedgerVideo={onDeleteLedgerVideo}
      onRetryVideoJob={onRetryVideoJob}
      onRecoverVideoJobDownload={onRecoverVideoJobDownload}
      onGenerateStoryboardDraft={onGenerateStoryboardDraft}
      isGeneratingStoryboard={isGeneratingStoryboard}
      onGenerateImagePromptDraft={onGenerateImagePromptDraft}
      isGeneratingImagePrompt={isGeneratingImagePrompt}
      onImportAssets={onImportAssets}
      onUploadImages={onUploadImages}
      onGenerateReferenceImages={onGenerateReferenceImages}
      onDeleteReferenceImage={onDeleteReferenceImage}
      onReorderReferenceImage={onReorderReferenceImage}
      textModelOptions={textModelOptions}
      selectedTextModelConfigId={selectedTextModelConfigId}
      imageModelOptions={imageModelOptions}
      selectedImageModelConfigId={selectedImageModelConfigId}
      onImageModelConfigChange={onImageModelConfigChange}
      videoModelOptions={videoModelOptions}
      selectedVideoModelConfigId={selectedVideoModelConfigId}
      onVideoModelConfigChange={onVideoModelConfigChange}
      duration={duration}
      onDurationChange={onDurationChange}
      selectedVideoResolution={selectedVideoResolution}
      onVideoResolutionChange={onVideoResolutionChange}
      selectedVideoAspectRatio={selectedVideoAspectRatio}
      onVideoAspectRatioChange={onVideoAspectRatioChange}
      versionCount={versionCount}
      onVersionCountChange={onVersionCountChange}
      template={template}
      enabledTemplateOptions={enabledTemplateOptions}
      onTemplateChange={onTemplateChange}
      finalLanguage={finalLanguage}
      onFinalLanguageChange={onFinalLanguageChange}
      storyboardDraft={storyboardDraft}
      storyboardDraftSource={storyboardDraftSource}
      onStoryboardDraftChange={onStoryboardDraftChange}
      onPreviewProductFileImport={onPreviewProductFileImport}
      onFillCurrentProductFromFileRow={onFillCurrentProductFromFileRow}
      onCommitProductFileImportRows={onCommitProductFileImportRows}
      onToast={onToast}
    />
  );
}

function ProductCreationComposer({
  mode,
  onModeChange,
  appLocale,
  products,
  pendingProductSku,
  selectedProduct,
  latestCreativeJobs,
  loadError,
  draft,
  importText,
  setImportText,
  pendingImageFiles,
  setPendingImageFiles,
  importNotes,
  productAutoSaveStatus,
  billingEstimates,
  billingEstimatesStatus,
  onOrganizeProductPackage,
  onFlushProductFactsAutoSave,
  onSelectProduct,
  onStartNewProduct,
  onDeleteProduct,
  onGenerateVideo,
  onCancelVideoJob,
  onDeleteLedgerVideo,
  onRetryVideoJob,
  onRecoverVideoJobDownload,
  onGenerateStoryboardDraft,
  isGeneratingStoryboard,
  onGenerateImagePromptDraft,
  isGeneratingImagePrompt,
  onImportAssets,
  onUploadImages,
  onGenerateReferenceImages,
  onDeleteReferenceImage,
  onReorderReferenceImage,
  textModelOptions,
  selectedTextModelConfigId,
  imageModelOptions,
  selectedImageModelConfigId,
  onImageModelConfigChange,
  videoModelOptions,
  selectedVideoModelConfigId,
  onVideoModelConfigChange,
  duration,
  onDurationChange,
  selectedVideoResolution,
  onVideoResolutionChange,
  selectedVideoAspectRatio,
  onVideoAspectRatioChange,
  versionCount,
  onVersionCountChange,
  template,
  enabledTemplateOptions,
  onTemplateChange,
  finalLanguage,
  onFinalLanguageChange,
  storyboardDraft,
  storyboardDraftSource,
  onStoryboardDraftChange,
  onPreviewProductFileImport,
  onFillCurrentProductFromFileRow,
  onCommitProductFileImportRows,
  onToast
}: {
  mode: ProductCreativeWorkspaceMode;
  onModeChange: (mode: ProductCreativeWorkspaceMode) => void;
  appLocale: AppLocale;
  products: ProductSummary[];
  pendingProductSku?: string;
  selectedProduct?: ProductDetail;
  latestCreativeJobs: CreativeVersionItem[];
  loadError?: string;
  draft: ProductDraft;
  importText: string;
  setImportText: (text: string, draftOverride?: ProductDraft) => void;
  pendingImageFiles: File[];
  setPendingImageFiles: Dispatch<SetStateAction<File[]>>;
  importNotes: string[];
  productAutoSaveStatus: ProductAutoSaveStatus;
  billingEstimates?: BillingEstimatesResponse;
  billingEstimatesStatus: BillingEstimatesStatus;
  onOrganizeProductPackage: () => Promise<ProductDetail | undefined>;
  onFlushProductFactsAutoSave: () => Promise<ProductDetail | undefined>;
  onSelectProduct: (product: ProductSummary) => Promise<void>;
  onStartNewProduct: () => void;
  onDeleteProduct: (sku: string) => Promise<void>;
  onGenerateVideo: (product: ProductSummary, options: ProductVideoGenerationOptions) => Promise<void>;
  onCancelVideoJob: (jobId: string) => Promise<void>;
  onDeleteLedgerVideo: (jobId: string) => Promise<void>;
  onRetryVideoJob: (job: VideoJob) => Promise<void>;
  onRecoverVideoJobDownload: (job: VideoJob) => Promise<void>;
  onGenerateStoryboardDraft: (product?: ProductDetail, options?: { prompt?: string; referenceImages?: string[] }) => Promise<void>;
  isGeneratingStoryboard: boolean;
  onGenerateImagePromptDraft: (product: ProductDetail, options?: { prompt?: string; targetImage?: string; referenceImages?: string[] }) => Promise<ImagePromptDraftResponse | undefined>;
  isGeneratingImagePrompt: boolean;
  onImportAssets: (sku: string) => Promise<void>;
  onUploadImages: (sku: string, files: FileList | File[] | null) => Promise<ProductDetail | undefined>;
  onGenerateReferenceImages: (sku: string, options?: ProductImageGenerationOptions) => Promise<GeneratedReferenceImageResult[] | undefined>;
  onDeleteReferenceImage: (sku: string, index: number) => Promise<void>;
  onReorderReferenceImage: (sku: string, referenceImages: string[]) => Promise<ProductDetail | undefined>;
  textModelOptions: ProviderConfigItem[];
  selectedTextModelConfigId: ModelConfigChoice;
  imageModelOptions: ProviderConfigItem[];
  selectedImageModelConfigId: ModelConfigChoice;
  onImageModelConfigChange: (configId: ModelConfigChoice) => void;
  videoModelOptions: ProviderConfigItem[];
  selectedVideoModelConfigId: ModelConfigChoice;
  onVideoModelConfigChange: (configId: ModelConfigChoice) => void;
  duration: number;
  onDurationChange: (duration: number) => void;
  selectedVideoResolution: VideoResolution;
  onVideoResolutionChange: (resolution: VideoResolution) => void;
  selectedVideoAspectRatio: VideoAspectRatio;
  onVideoAspectRatioChange: (aspectRatio: VideoAspectRatio) => void;
  versionCount: number;
  onVersionCountChange: (versionCount: number) => void;
  template: TemplateName;
  enabledTemplateOptions: TemplateName[];
  onTemplateChange: (template: TemplateName) => void;
  finalLanguage: FinalVideoLanguage;
  onFinalLanguageChange: (language: FinalVideoLanguage) => void;
  storyboardDraft: string;
  storyboardDraftSource: StoryboardDraftSource;
  onStoryboardDraftChange: (draft: string, source?: StoryboardDraftSource) => void;
  onPreviewProductFileImport: (file: File) => Promise<ProductFileImportPreviewResponse>;
  onFillCurrentProductFromFileRow: (row: ProductFileImportRow) => Promise<void>;
  onCommitProductFileImportRows: (rows: ProductFileImportRow[], rowIds: string[]) => Promise<ProductFileImportCommitResponse>;
  onToast: ConsoleToastFn;
}) {
  const [isPacking, setIsPacking] = useState(false);
  const [isSubmittingVideo, setIsSubmittingVideo] = useState(false);
  const [isSubmittingImage, setIsSubmittingImage] = useState(false);
  const [previewJob, setPreviewJob] = useState<CreativeVersionItem | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<CreativeVersionItem | undefined>();
  const [previewReferenceImageIndex, setPreviewReferenceImageIndex] = useState<number | undefined>();
  const [previewImagePromptReferenceIndex, setPreviewImagePromptReferenceIndex] = useState<number | undefined>();
  const [imagePromptReferences, setImagePromptReferences] = useState<ReferenceImageStatus[]>([]);
  const [imagePromptReferenceIndex, setImagePromptReferenceIndex] = useState<number | undefined>();
  const [imagePrompt, setImagePrompt] = useState("");
  const [fileImportOpen, setFileImportOpen] = useState(false);
  const [productLibraryCollapsed, setProductLibraryCollapsed] = useState(false);
  const tVideo = (key: string, options?: Record<string, unknown>) => i18n.t(`app:videoStudio.${key}`, { lng: appLocale, ...options });
  const selectedSku = selectedProduct?.sku ?? pendingProductSku ?? "";
  const productLibraryColumnWidth = productLibraryCollapsed ? PRODUCT_LIBRARY_COLLAPSED_WIDTH : PRODUCT_LIBRARY_DEFAULT_WIDTH;
  const previewReferenceImages = selectedProduct?.reference_image_statuses ?? [];
  const draftReferenceImages = useMemo<ReferenceImageStatus[]>(
    () => draftReferenceImageStatuses(draft),
    [draft.reference_images]
  );
  const pendingReferenceImageStatuses = useMemo<ReferenceImageStatus[]>(
    () => pendingImageFiles.map((file, index) => ({
      original: file.name || tVideo("reference.pendingImageName", { index: index + 1 }),
      resolvedPath: file.name,
      previewUrl: URL.createObjectURL(file),
      status: "previewable"
    })),
    [appLocale, pendingImageFiles]
  );
  const previewableReferenceImages = selectedProduct
    ? previewReferenceImages.length > 0 ? previewReferenceImages : draftReferenceImages
    : draftReferenceImages.length > 0 ? draftReferenceImages : pendingReferenceImageStatuses;
  const durationOptions = ["5", "8", "10", "12", "15"];
  const versionCountOptions = ["1", "2", "3", "4", "5"];
  const languageOptions: FinalVideoLanguage[] = ["ja", "zh", "en"];
  const templateOptions = creativeStyleOptions(template, enabledTemplateOptions);
  const packingDisabled = isPacking || isSubmittingVideo || isSubmittingImage;
  const productFactsBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const productAutoSaveLabel = localizedProductAutoSaveStatusLabel(productAutoSaveStatus, tVideo);
  const generateVideoButtonLabel = versionCount > 1 ? tVideo("generate.buttonWithCount", { count: versionCount }) : tVideo("generate.button");
  const storyboardProductReady = Boolean(selectedProduct || importText.trim());
  const generationReadiness = localizedProductGenerationReadiness({
    selectedProduct,
    importText,
    tVideo
  });
  const generateVideoDisabled = packingDisabled || !generationReadiness.ready;
  const effectiveSelectedImageModelConfigId = effectiveModelConfigChoice(selectedImageModelConfigId, imageModelOptions);
  const effectiveSelectedVideoModelConfigId = effectiveModelConfigChoice(selectedVideoModelConfigId, videoModelOptions);
  const productImageAssetCount = 0;
  const imageModelReady = imageModelOptions.length > 0;
  const videoModelReady = videoModelOptions.length > 0;
  const creativeWorkspace = buildProductCreativeWorkspace({
    mode,
    products,
    selectedProduct,
    draftTitle: draft.title_ja,
    generatedVideoCount: latestCreativeJobs.length,
    imageAssetCount: productImageAssetCount
  });
  const imageModelLabel = localizedModelConfigChoiceLabel(effectiveSelectedImageModelConfigId, imageModelOptions, tVideo);
  const imageGenerateDisabled = packingDisabled || creativeWorkspace.primaryAction.disabled;
  const selectedImagePromptReference = imagePromptReferenceIndex === undefined ? undefined : imagePromptReferences[imagePromptReferenceIndex];
  const selectedImagePromptReferenceNumber = selectedImagePromptReference
    ? Math.max(0, imagePromptReferences.indexOf(selectedImagePromptReference)) + 1
    : 0;
  const generateImageButtonLabel = "生成图片";
  useEffect(() => {
    setImagePromptReferences([]);
    setImagePromptReferenceIndex(undefined);
    setImagePrompt("");
    if (productFactsBodyRef.current) {
      productFactsBodyRef.current.scrollTop = 0;
    }
  }, [selectedProduct?.sku]);

  useEffect(() => {
    if (imagePromptReferenceIndex === undefined) return;
    if (imagePromptReferences.length === 0) {
      setImagePromptReferenceIndex(undefined);
      return;
    }
    if (imagePromptReferenceIndex >= imagePromptReferences.length) {
      setImagePromptReferenceIndex(imagePromptReferences.length - 1);
    }
  }, [imagePromptReferences.length, imagePromptReferenceIndex]);

  useEffect(() => {
    return () => {
      for (const image of pendingReferenceImageStatuses) {
        if (image.previewUrl) {
          URL.revokeObjectURL(image.previewUrl);
        }
      }
    };
  }, [pendingReferenceImageStatuses]);

  async function uploadPendingImages(product: ProductDetail): Promise<ProductDetail> {
    if (pendingImageFiles.length === 0) return product;
    const uploadedProduct = await onUploadImages(product.sku, pendingImageFiles);
    setPendingImageFiles([]);
    return uploadedProduct ?? product;
  }

  async function handleOrganizeProductPackage(options: { silentSuccess?: boolean } = {}) {
    setIsPacking(true);
    try {
      const savedProduct = await onOrganizeProductPackage();
      if (!savedProduct) {
        return undefined;
      }
      const productWithImages = await uploadPendingImages(savedProduct);
      if (!options.silentSuccess) {
        onToast(tVideo("generate.packageReadyToast"), "ok");
      }
      return productWithImages;
    } catch (error) {
      onToast(errorMessage(error));
      return undefined;
    } finally {
      setIsPacking(false);
    }
  }

  async function handleGenerateVideo() {
    if (!generationReadiness.ready) {
      onToast(generationReadiness.label);
      return;
    }
    if (!videoModelReady) {
      onToast(tCurrentApp(appLocale, "status.videoModelRequired"));
      return;
    }
    if (packingDisabled) return;
    setIsSubmittingVideo(true);
    try {
      const autoSavedProduct = await onFlushProductFactsAutoSave();
      const savedProduct = autoSavedProduct ?? await handleOrganizeProductPackage({ silentSuccess: true });
      if (!savedProduct) return;
      const selectedReferenceImages = selectedCreationReferenceImagesForProduct(savedProduct) ?? [];
      const compiledVideoPrompt = compileProductPrompt({
        locale: appLocale,
        mode: "video",
        product: savedProduct,
        userPrompt: storyboardDraft,
        referenceImages: selectedReferenceImages,
        targetModel: targetModelForPromptPreview(videoModelOptions, selectedVideoModelConfigId, "volcengine-seedance"),
        video: {
          durationSeconds: duration,
          aspectRatio: selectedVideoAspectRatio,
          finalLanguage,
          creativeStyle: template
        }
      });
      await onGenerateVideo(productActionSummary(savedProduct), {
        provider: "volcengine-seedance",
        providerModelConfigId: effectiveSelectedVideoModelConfigId,
        resolution: selectedVideoResolution,
        aspectRatio: selectedVideoAspectRatio,
        referenceImages: selectedReferenceImages,
        storyboardLines: splitDraftLines(compiledVideoPrompt.prompt)
      });
      onToast(tVideo("generate.queuedToast"), "ok");
    } catch (error) {
      onToast(errorMessage(error));
    } finally {
      setIsSubmittingVideo(false);
    }
  }

  async function handleGenerateProductImages() {
    if (creativeWorkspace.primaryAction.disabled) {
      onToast(creativeWorkspace.primaryAction.reason ?? generationReadiness.label);
      return;
    }
    if (!imageModelReady) {
      onToast(tCurrentApp(appLocale, "status.imageModelRequired"));
      return;
    }
    if (packingDisabled) return;
    setIsSubmittingImage(true);
    try {
      const autoSavedProduct = await onFlushProductFactsAutoSave();
      const savedProduct = autoSavedProduct ?? selectedProduct ?? await handleOrganizeProductPackage({ silentSuccess: true });
      if (!savedProduct) return;
      const generatedImages = await onGenerateReferenceImages(savedProduct.sku, {
        prompt: imagePrompt,
        referenceImages: selectedCreationReferenceImagesForProduct(savedProduct) ?? [],
        locale: appLocale
      });
      if (!generatedImages || generatedImages.length === 0) {
        return;
      }
      onToast(tVideo("generate.imageGenerated", { count: generatedImages.length }), "ok");
    } catch (error) {
      onToast(errorMessage(error));
    } finally {
      setIsSubmittingImage(false);
    }
  }

  function selectedReferenceImagesForPromptPreview(): string[] {
    return imagePromptReferences.map((reference) => reference.original.trim()).filter(Boolean);
  }

  function targetModelForPromptPreview(models: ProviderConfigItem[], selectedConfigId: ModelConfigChoice, fallbackProviderId: string) {
    const effectiveConfigId = effectiveModelConfigChoice(selectedConfigId, models);
    const model = models.find((item) => item.configId === effectiveConfigId);
    return {
      providerId: model?.id ?? fallbackProviderId,
      vendor: model?.providerLabel,
      model: model?.model,
      baseUrl: model?.baseUrl
    };
  }

  function previewProductForPromptCompiler(): ProductDetail | undefined {
    const fallbackDraft = selectedProduct ? productFactsToDraft(selectedProduct) : draft;
    const previewDraft = productComposerTextToDraft(importText, fallbackDraft);
    const sourceText = previewDraft.source_text || importText.trim() || selectedProduct?.source_text || "";
    if (!sourceText && !previewDraft.title_ja.trim() && !selectedProduct) {
      return undefined;
    }
    const previewProduct = productDraftToPreviewProduct({
      ...previewDraft,
      source_text: sourceText
    });
    if (!selectedProduct) {
      return previewProduct;
    }
    return {
      ...previewProduct,
      path: selectedProduct.path,
      referenceImageCount: previewProduct.reference_images.length || selectedProduct.referenceImageCount,
      importQuality: selectedProduct.importQuality,
      paidReadiness: selectedProduct.paidReadiness,
      reference_image_statuses: selectedProduct.reference_image_statuses,
      reference_images: previewProduct.reference_images.length > 0 ? previewProduct.reference_images : selectedProduct.reference_images
    };
  }

  async function handleGenerateStoryboardDraft() {
    try {
      const productForStoryboard = previewProductForPromptCompiler();
      if (!productForStoryboard) {
        onToast(tVideo("storyboard.previewNeedsFacts"));
        return;
      }
      const response = compileProductPrompt({
        locale: appLocale,
        mode: "video",
        product: productForStoryboard,
        userPrompt: storyboardDraft,
        referenceImages: selectedReferenceImagesForPromptPreview(),
        targetModel: targetModelForPromptPreview(videoModelOptions, selectedVideoModelConfigId, "volcengine-seedance"),
        video: {
          durationSeconds: duration,
          aspectRatio: selectedVideoAspectRatio,
          finalLanguage,
          creativeStyle: template
        }
      });
      onStoryboardDraftChange(response.prompt, "ai");
      onToast(tVideo("storyboard.previewReadyToast"), "ok");
    } catch (error) {
      onToast(errorMessage(error));
    }
  }

  async function handleGenerateImagePromptDraft() {
    try {
      const productForPrompt = previewProductForPromptCompiler();
      if (!productForPrompt) {
        onToast(tVideo("storyboard.previewNeedsFacts"));
        return;
      }
      const response = compileProductPrompt({
        locale: appLocale,
        mode: "image",
        product: productForPrompt,
        userPrompt: imagePrompt,
        referenceImages: selectedReferenceImagesForPromptPreview(),
        targetModel: targetModelForPromptPreview(imageModelOptions, selectedImageModelConfigId, "openai-compatible-image")
      });
      setImagePrompt(response.prompt);
      onToast(tVideo("storyboard.previewReadyToast"), "ok");
    } catch (error) {
      onToast(errorMessage(error));
    }
  }

  function handleReferenceFiles(files: FileList | File[] | null) {
    const acceptedFiles = acceptedReferenceFiles(files);
    if (!acceptedFiles) return;
    if (selectedProduct) {
      void onUploadImages(selectedProduct.sku, acceptedFiles);
      return;
    }
    setPendingImageFiles((current) => [...current, ...acceptedFiles]);
  }

  async function handleImagePromptReferenceFiles(files: FileList | File[] | null) {
    const acceptedFiles = acceptedReferenceFiles(files);
    if (!acceptedFiles) return;
    if (selectedProduct) {
      const productBeforeUploadCount = previewReferenceImages.length;
      const uploadedProduct = await onUploadImages(selectedProduct.sku, acceptedFiles);
      const uploadedReferences = uploadedProduct?.reference_image_statuses?.slice(productBeforeUploadCount) ?? [];
      if (uploadedReferences.length > 0) {
        addImagePromptReferences(uploadedReferences);
      }
      return;
    }
    const pendingReferences = acceptedFiles.map((file, index) => ({
      original: file.name || tVideo("reference.pendingImageName", { index: pendingImageFiles.length + index + 1 }),
      resolvedPath: file.name,
      previewUrl: URL.createObjectURL(file),
      status: "previewable" as const
    }));
    setPendingImageFiles((current) => [...current, ...acceptedFiles]);
    addImagePromptReferences(pendingReferences);
  }

  function acceptedReferenceFiles(files: FileList | File[] | null): File[] | undefined {
    if (!files || files.length === 0) return;
    const incomingFiles = Array.from(files);
    const acceptedFiles = incomingFiles.filter(isReferenceImageFile);
    if (acceptedFiles.length === 0) {
      onToast(tVideo("generate.imageOnlyToast"));
      return;
    }
    if (acceptedFiles.length < incomingFiles.length) {
      onToast(tVideo("generate.ignoredFileToast"));
    }
    return acceptedFiles;
  }

  async function copyPastedMediaReferencesToProduct(references: string[]) {
    if (references.length === 0) return;
    try {
      const files = await Promise.all(references.map((reference) => mediaReferenceToFile(reference)));
      handleReferenceFiles(files);
    } catch (error) {
      onToast(errorMessage(error));
    }
  }

  function clipboardReferenceFiles(clipboardData: DataTransfer): File[] {
    const clipboardFiles = Array.from(clipboardData.files);
    if (clipboardFiles.length > 0) return clipboardFiles;
    return Array.from(clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
  }

  function handleReferencePaste(event: ClipboardEvent<HTMLElement>) {
    const files = clipboardReferenceFiles(event.clipboardData);
    if (!files.some(isReferenceImageFile)) return;
    event.preventDefault();
    const pasteInsidePrompt = event.target instanceof Node
      && event.currentTarget.querySelector(".storyboard-history-dropdown")?.contains(event.target);
    if (pasteInsidePrompt) {
      void handleImagePromptReferenceFiles(files);
      return;
    }
    handleReferenceFiles(files);
  }

  function handleProductFactsPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = clipboardReferenceFiles(event.clipboardData);
    if (files.some(isReferenceImageFile)) {
      event.stopPropagation();
      event.preventDefault();
      handleReferenceFiles(files);
      return;
    }
    const mediaReferences = extractProductComposerImageReferences([
      event.clipboardData.getData("text/plain"),
      event.clipboardData.getData("text/html")
    ].join("\n")).filter((reference) => isSameOriginMediaReference(reference));
    if (mediaReferences.length === 0) return;
    event.stopPropagation();
    event.preventDefault();
    void copyPastedMediaReferencesToProduct(mediaReferences);
  }

  function handleSelectReferenceImage(index: number) {
    const reference = previewableReferenceImages[index];
    if (!reference) return;
    addImagePromptReferences([reference]);
  }

  function handlePreviewReferenceImage(index: number) {
    if (!previewableReferenceImages[index]) return;
    setPreviewReferenceImageIndex(index);
  }

  function handleSelectImagePromptReference(index: number) {
    if (!imagePromptReferences[index]) return;
    setImagePromptReferenceIndex(index);
  }

  function handlePreviewImagePromptReference(index: number) {
    if (!imagePromptReferences[index]) return;
    setPreviewImagePromptReferenceIndex(index);
  }

  function selectedCreationReferenceImagesForProduct(product: ProductDetail): string[] | undefined {
    if (imagePromptReferences.length === 0) return undefined;
    const productReferences: ReferenceImageStatus[] = (product.reference_image_statuses ?? product.reference_images.map((reference) => ({
      original: reference,
      resolvedPath: reference,
      previewUrl: null,
      status: "previewable" as const
    })));
    const recentlyUploadedReferences = productReferences.slice(Math.max(0, productReferences.length - pendingReferenceImageStatuses.length));
    const resolvedReferences = imagePromptReferences
      .map((reference) => {
        const exactReference = productReferences.find((item) => referenceImageKey(item) === referenceImageKey(reference));
        if (exactReference) return exactReference.original;
        const pendingIndex = pendingReferenceImageStatuses.findIndex((item) => referenceImageKey(item) === referenceImageKey(reference));
        if (pendingIndex >= 0) {
          return recentlyUploadedReferences[pendingIndex]?.original ?? reference.original;
        }
        return reference.original;
      })
      .filter(Boolean);
    return resolvedReferences.length > 0 ? resolvedReferences : undefined;
  }

  function addImagePromptReferences(references: ReferenceImageStatus[]) {
    if (references.length === 0) return;
    setImagePromptReferences((current) => {
      const nextReferences = [...current];
      let selectedIndex = current.length;
      for (const reference of references) {
        const existingIndex = nextReferences.findIndex((item) => referenceImageKey(item) === referenceImageKey(reference));
        if (existingIndex >= 0) {
          selectedIndex = existingIndex;
          continue;
        }
        selectedIndex = nextReferences.length;
        nextReferences.push(reference);
      }
      setImagePromptReferenceIndex(selectedIndex);
      return nextReferences;
    });
  }

  function handleRemoveImagePromptReference(index: number) {
    setImagePromptReferences((current) => current.filter((_, promptIndex) => promptIndex !== index));
    setImagePromptReferenceIndex((current) => {
      if (current === undefined) return undefined;
      if (current === index) return undefined;
      if (current > index) return current - 1;
      return current;
    });
  }

  async function handleDeleteCreativeVersion(job: CreativeVersionItem) {
    if (job.source === "video-job") {
      await onCancelVideoJob(job.id);
    } else {
      await onDeleteLedgerVideo(job.id);
    }
    setPreviewJob((current) => (current?.id === job.id ? undefined : current));
    setDeleteTarget((current) => (current?.id === job.id ? undefined : current));
  }

  async function handleDeleteReferenceImage(index: number) {
    const draftImage = draftReferenceImages[index];
    if (previewReferenceImages.length === 0 && draftImage) {
      setImportText(
        removeReferenceFromComposerText(importText, draftImage.original),
        removeDraftReferenceImage(draft, draftImage.original)
      );
      setImagePromptReferences((current) => current.filter((image) => referenceImageKey(image) !== referenceImageKey(draftImage)));
      setImagePromptReferenceIndex(undefined);
      return;
    }
    if (!selectedProduct) return;
    const deletedImage = previewReferenceImages[index];
    await onDeleteReferenceImage(selectedProduct.sku, index);
    if (deletedImage) {
      setImagePromptReferences((current) => current.filter((image) => referenceImageKey(image) !== referenceImageKey(deletedImage)));
    }
    setImagePromptReferenceIndex(undefined);
  }

  async function handleReorderReferenceImage(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    if (selectedProduct && previewReferenceImages.length > 0) {
      const nextReferences = moveArrayItem(previewReferenceImages.map((image) => image.original), fromIndex, toIndex);
      await onReorderReferenceImage(selectedProduct.sku, nextReferences);
      return;
    }
    if (draftReferenceImages.length > 0) {
      const nextReferences = moveArrayItem(draftReferenceImages.map((image) => image.original), fromIndex, toIndex);
      setImportText(
        updateComposerReferenceOrder(importText, nextReferences),
        {
          ...draft,
          reference_images: nextReferences.join("\n")
        }
      );
      return;
    }
    if (pendingImageFiles.length > 0) {
      setPendingImageFiles((current) => moveArrayItem(current, fromIndex, toIndex));
    }
  }

  return (
    <section
      id="video-creation"
      className="video-workspace-shell relative grid h-[100dvh] max-h-[100dvh] min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden bg-[var(--card)] transition-[grid-template-columns] duration-200 min-[900px]:grid-cols-[var(--product-library-column-width)_minmax(0,1fr)]"
      style={{ "--product-library-column-width": `${productLibraryColumnWidth}px` } as CSSProperties}
      onPaste={handleReferencePaste}
    >
      <ProductCreationProductLibrary
        tVideo={tVideo}
        products={products}
        selectedSku={selectedSku}
        draftTitle={draft.title_ja}
        collapsed={productLibraryCollapsed}
        onExpand={() => setProductLibraryCollapsed(false)}
        onSelectProduct={onSelectProduct}
        onAddProduct={onStartNewProduct}
        onDeleteProduct={onDeleteProduct}
        onImportFile={() => setFileImportOpen(true)}
      />
      <button
        type="button"
        className="video-product-library-collapse-rail group absolute inset-y-0 left-[calc(var(--product-library-column-width)-10px)] z-30 hidden w-5 cursor-pointer bg-transparent text-[var(--muted)] transition-[left,color] duration-200 hover:text-[var(--accent)] focus-visible:outline-none min-[900px]:flex min-[900px]:items-center min-[900px]:justify-center"
        aria-label={productLibraryCollapsed ? tVideo("productLibrary.expand") : tVideo("productLibrary.collapse")}
        aria-expanded={!productLibraryCollapsed}
        title={productLibraryCollapsed ? tVideo("productLibrary.expand") : tVideo("productLibrary.collapse")}
        onClick={() => setProductLibraryCollapsed((collapsed) => !collapsed)}
      >
        <span className="video-product-library-collapse-button pointer-events-none grid h-8 w-8 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--panel)]/95 opacity-0 shadow-[0_10px_24px_rgba(96,64,43,.14)] transition group-hover:opacity-100 group-focus-visible:opacity-100 group-hover:border-[color-mix(in_srgb,var(--accent)_42%,var(--border-strong))] group-hover:bg-[color-mix(in_srgb,var(--accent)_5%,var(--panel))]">
          {productLibraryCollapsed ? <ChevronRight size={16} strokeWidth={2.4} /> : <ChevronLeft size={16} strokeWidth={2.4} />}
        </span>
      </button>

      <ProductCreationOperationWorkspace
        title={draft.title_ja.trim() || selectedProduct?.title_ja || tVideo("newProduct.title")}
        badge={tVideo("newProduct.versionCount", { count: latestCreativeJobs.length })}
      >
        {loadError ? (
          <div className="rounded-[12px] border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold leading-5 text-[var(--danger)]">
            {loadError}
          </div>
        ) : null}

        <ProductCreativeWorkbench
          mode={mode}
          onModeChange={onModeChange}
          appLocale={appLocale}
          tVideo={tVideo}
          workspace={creativeWorkspace}
          selectedProduct={selectedProduct}
          pendingImageFiles={pendingImageFiles}
          draftReferenceImages={draftReferenceImages}
          pendingReferenceImageStatuses={pendingReferenceImageStatuses}
          previewableReferenceImages={previewableReferenceImages}
          importText={importText}
          setImportText={setImportText}
          draft={draft}
          importNotes={importNotes}
          productAutoSaveLabel={productAutoSaveLabel}
          isPacking={isPacking}
          packingDisabled={packingDisabled}
          productFactsBodyRef={productFactsBodyRef}
          template={template}
          templateOptions={templateOptions}
          onTemplateChange={onTemplateChange}
          duration={duration}
          durationOptions={durationOptions}
          onDurationChange={onDurationChange}
          selectedVideoResolution={selectedVideoResolution}
          onVideoResolutionChange={onVideoResolutionChange}
          selectedVideoAspectRatio={selectedVideoAspectRatio}
          onVideoAspectRatioChange={onVideoAspectRatioChange}
          finalLanguage={finalLanguage}
          languageOptions={languageOptions}
          onFinalLanguageChange={onFinalLanguageChange}
          versionCount={versionCount}
          versionCountOptions={versionCountOptions}
          onVersionCountChange={onVersionCountChange}
          imageModelLabel={imageModelLabel}
          imageModelOptions={imageModelOptions}
          selectedImageModelConfigId={selectedImageModelConfigId}
          onImageModelConfigChange={onImageModelConfigChange}
          videoModelOptions={videoModelOptions}
          selectedVideoModelConfigId={selectedVideoModelConfigId}
          onVideoModelConfigChange={onVideoModelConfigChange}
          imagePrompt={imagePrompt}
          onImagePromptChange={setImagePrompt}
          imagePromptReferences={imagePromptReferences}
          imagePromptReferenceIndex={imagePromptReferenceIndex}
          selectedImagePromptReference={selectedImagePromptReference}
          onImagePromptReferenceSelect={handleSelectImagePromptReference}
          onImagePromptReferencePreview={handlePreviewImagePromptReference}
          onImagePromptReferenceRemove={handleRemoveImagePromptReference}
          onImagePromptReferenceFilesChange={handleImagePromptReferenceFiles}
          storyboardDraft={storyboardDraft}
          onStoryboardDraftChange={onStoryboardDraftChange}
          isGeneratingStoryboard={isGeneratingStoryboard}
          storyboardProductReady={storyboardProductReady}
          generationReadiness={generationReadiness}
          generateVideoDisabled={generateVideoDisabled}
          imageGenerateDisabled={imageGenerateDisabled}
          generateVideoButtonLabel={generateVideoButtonLabel}
          generateImageButtonLabel={generateImageButtonLabel}
          isSubmittingVideo={isSubmittingVideo}
          isSubmittingImage={isSubmittingImage}
          videoEstimate={billingEstimates?.estimates.video}
          videoEstimateStatus={videoModelOptions.length > 0 ? billingEstimatesStatus : "idle"}
          imageEstimate={billingEstimates?.estimates.referenceImages}
          imageEstimateStatus={imageModelOptions.length > 0 ? billingEstimatesStatus : "idle"}
          organizeProductEstimate={billingEstimates?.estimates.organizeProduct}
          organizeProductEstimateStatus={textModelOptions.length > 0 ? billingEstimatesStatus : "idle"}
          onSelectReferenceImage={handleSelectReferenceImage}
          onPreviewReferenceImage={handlePreviewReferenceImage}
          onPendingSelect={handleSelectReferenceImage}
          onPendingPreview={handlePreviewReferenceImage}
          onDeleteReferenceImage={(index) => void handleDeleteReferenceImage(index)}
          onReorderReferenceImage={(fromIndex, toIndex) => void handleReorderReferenceImage(fromIndex, toIndex)}
          onFilesChange={handleReferenceFiles}
          onClearPendingFile={(index) => setPendingImageFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
          onOrganizeProductPackage={() => void handleOrganizeProductPackage()}
          onProductFactsPaste={handleProductFactsPaste}
          onGenerateStoryboardDraft={handleGenerateStoryboardDraft}
          onGenerateImagePromptDraft={handleGenerateImagePromptDraft}
          isGeneratingImagePrompt={isGeneratingImagePrompt}
          onGenerateVideo={handleGenerateVideo}
          onGenerateProductImages={handleGenerateProductImages}
          jobs={latestCreativeJobs}
          onPreviewVideo={setPreviewJob}
          onDeleteVideo={setDeleteTarget}
          onRetryVideoJob={onRetryVideoJob}
          onRecoverVideoJobDownload={onRecoverVideoJobDownload}
          onToast={onToast}
        />
      </ProductCreationOperationWorkspace>

      <VideoPreviewDialog
        appLocale={appLocale}
        tVideo={tVideo}
        job={previewJob}
        product={selectedProduct}
        draft={draft}
        importText={importText}
        index={Math.max(0, latestCreativeJobs.findIndex((job) => job.id === previewJob?.id))}
        onClose={() => setPreviewJob(undefined)}
        onRequestDelete={setDeleteTarget}
        onRetryVideoJob={onRetryVideoJob}
        onRecoverVideoJobDownload={onRecoverVideoJobDownload}
        onToast={onToast}
      />
      <DeleteCreativeVersionDialog
        appLocale={appLocale}
        tVideo={tVideo}
        job={deleteTarget}
        index={Math.max(0, latestCreativeJobs.findIndex((job) => job.id === deleteTarget?.id))}
        onClose={() => setDeleteTarget(undefined)}
        onConfirm={handleDeleteCreativeVersion}
      />
      <ReferenceImagePreviewDialog
        tVideo={tVideo}
        images={previewableReferenceImages}
        index={previewReferenceImageIndex}
        onIndexChange={setPreviewReferenceImageIndex}
        onClose={() => setPreviewReferenceImageIndex(undefined)}
      />
      <ReferenceImagePreviewDialog
        tVideo={tVideo}
        images={imagePromptReferences}
        index={previewImagePromptReferenceIndex}
        onIndexChange={setPreviewImagePromptReferenceIndex}
        onClose={() => setPreviewImagePromptReferenceIndex(undefined)}
      />
      <ProductFileImportDialog
        locale={appLocale}
        open={fileImportOpen}
        onClose={() => setFileImportOpen(false)}
        onPreviewFile={onPreviewProductFileImport}
        onFillCurrentProduct={async (row) => {
          await onFillCurrentProductFromFileRow(row);
          setFileImportOpen(false);
        }}
        onCommitRows={async (rows, rowIds) => {
          const response = await onCommitProductFileImportRows(rows, rowIds);
          const firstImported = response.results.find((result): result is Extract<ProductFileImportCommitResponse["results"][number], { status: "imported" }> => result.status === "imported")?.product;
          if (response.summary.imported === 1 && firstImported) {
            await onSelectProduct(productActionSummary(firstImported));
          }
          setFileImportOpen(false);
        }}
        onToast={onToast}
      />
    </section>
  );
}

function ProductCreativeWorkbench({
  mode,
  onModeChange,
  appLocale,
  tVideo,
  workspace,
  selectedProduct,
  pendingImageFiles,
  draftReferenceImages,
  pendingReferenceImageStatuses,
  previewableReferenceImages,
  importText,
  setImportText,
  draft,
  importNotes,
  productAutoSaveLabel,
  isPacking,
  packingDisabled,
  productFactsBodyRef,
  template,
  templateOptions,
  onTemplateChange,
  duration,
  durationOptions,
  onDurationChange,
  selectedVideoResolution,
  onVideoResolutionChange,
  selectedVideoAspectRatio,
  onVideoAspectRatioChange,
  finalLanguage,
  languageOptions,
  onFinalLanguageChange,
  versionCount,
  versionCountOptions,
  onVersionCountChange,
  imageModelLabel,
  imageModelOptions,
  selectedImageModelConfigId,
  onImageModelConfigChange,
  videoModelOptions,
  selectedVideoModelConfigId,
  onVideoModelConfigChange,
  imagePrompt,
  onImagePromptChange,
  imagePromptReferences,
  imagePromptReferenceIndex,
  selectedImagePromptReference,
  onImagePromptReferenceSelect,
  onImagePromptReferencePreview,
  onImagePromptReferenceRemove,
  onImagePromptReferenceFilesChange,
  storyboardDraft,
  onStoryboardDraftChange,
  isGeneratingStoryboard,
  storyboardProductReady,
  generationReadiness,
  generateVideoDisabled,
  imageGenerateDisabled,
  generateVideoButtonLabel,
  generateImageButtonLabel,
  isSubmittingVideo,
  isSubmittingImage,
  videoEstimate,
  videoEstimateStatus,
  imageEstimate,
  imageEstimateStatus,
  organizeProductEstimate,
  organizeProductEstimateStatus,
  onSelectReferenceImage,
  onPreviewReferenceImage,
  onPendingSelect,
  onPendingPreview,
  onDeleteReferenceImage,
  onReorderReferenceImage,
  onFilesChange,
  onClearPendingFile,
  onOrganizeProductPackage,
  onProductFactsPaste,
  onGenerateStoryboardDraft,
  onGenerateImagePromptDraft,
  isGeneratingImagePrompt,
  onGenerateVideo,
  onGenerateProductImages,
  jobs,
  onPreviewVideo,
  onDeleteVideo,
  onRetryVideoJob,
  onRecoverVideoJobDownload,
  onToast
}: {
  mode: ProductCreativeWorkspaceMode;
  onModeChange: (mode: ProductCreativeWorkspaceMode) => void;
  appLocale: AppLocale;
  tVideo: VideoStudioTranslator;
  workspace: ProductCreativeWorkspace;
  selectedProduct?: ProductDetail;
  pendingImageFiles: File[];
  draftReferenceImages: ReferenceImageStatus[];
  pendingReferenceImageStatuses: ReferenceImageStatus[];
  previewableReferenceImages: ReferenceImageStatus[];
  importText: string;
  setImportText: (text: string, draftOverride?: ProductDraft) => void;
  draft: ProductDraft;
  importNotes: string[];
  productAutoSaveLabel: string;
  isPacking: boolean;
  packingDisabled: boolean;
  productFactsBodyRef: React.RefObject<HTMLTextAreaElement | null>;
  template: TemplateName;
  templateOptions: TemplateName[];
  onTemplateChange: (template: TemplateName) => void;
  duration: number;
  durationOptions: string[];
  onDurationChange: (duration: number) => void;
  selectedVideoResolution: VideoResolution;
  onVideoResolutionChange: (resolution: VideoResolution) => void;
  selectedVideoAspectRatio: VideoAspectRatio;
  onVideoAspectRatioChange: (aspectRatio: VideoAspectRatio) => void;
  finalLanguage: FinalVideoLanguage;
  languageOptions: FinalVideoLanguage[];
  onFinalLanguageChange: (language: FinalVideoLanguage) => void;
  versionCount: number;
  versionCountOptions: string[];
  onVersionCountChange: (versionCount: number) => void;
  imageModelLabel: string;
  imageModelOptions: ProviderConfigItem[];
  selectedImageModelConfigId: ModelConfigChoice;
  onImageModelConfigChange: (configId: ModelConfigChoice) => void;
  videoModelOptions: ProviderConfigItem[];
  selectedVideoModelConfigId: ModelConfigChoice;
  onVideoModelConfigChange: (configId: ModelConfigChoice) => void;
  imagePrompt: string;
  onImagePromptChange: (prompt: string) => void;
  imagePromptReferences: ReferenceImageStatus[];
  imagePromptReferenceIndex?: number;
  selectedImagePromptReference?: ReferenceImageStatus;
  onImagePromptReferenceSelect: (index: number) => void;
  onImagePromptReferencePreview: (index: number) => void;
  onImagePromptReferenceRemove: (index: number) => void;
  onImagePromptReferenceFilesChange: (files: FileList | File[] | null) => void;
  storyboardDraft: string;
  onStoryboardDraftChange: (draft: string, source?: StoryboardDraftSource) => void;
  isGeneratingStoryboard: boolean;
  storyboardProductReady: boolean;
  generationReadiness: { ready: boolean; label: string };
  generateVideoDisabled: boolean;
  imageGenerateDisabled: boolean;
  generateVideoButtonLabel: string;
  generateImageButtonLabel: string;
  isSubmittingVideo: boolean;
  isSubmittingImage: boolean;
  videoEstimate?: BillingActionEstimate;
  videoEstimateStatus: BillingEstimatesStatus;
  imageEstimate?: BillingActionEstimate;
  imageEstimateStatus: BillingEstimatesStatus;
  organizeProductEstimate?: BillingActionEstimate;
  organizeProductEstimateStatus: BillingEstimatesStatus;
  onSelectReferenceImage: (index: number) => void;
  onPreviewReferenceImage: (index: number) => void;
  onPendingSelect: (index: number) => void;
  onPendingPreview: (index: number) => void;
  onDeleteReferenceImage: (index: number) => void;
  onReorderReferenceImage: (fromIndex: number, toIndex: number) => void;
  onFilesChange: (files: FileList | File[] | null) => void;
  onClearPendingFile: (index: number) => void;
  onOrganizeProductPackage: () => void;
  onProductFactsPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onGenerateStoryboardDraft: (product?: ProductDetail) => Promise<void>;
  onGenerateImagePromptDraft: () => Promise<void>;
  isGeneratingImagePrompt: boolean;
  onGenerateVideo: () => Promise<void>;
  onGenerateProductImages: () => Promise<void>;
  jobs: CreativeVersionItem[];
  onPreviewVideo: (job: CreativeVersionItem) => void;
  onDeleteVideo: (job: CreativeVersionItem) => void;
  onRetryVideoJob: (job: VideoJob) => Promise<void>;
  onRecoverVideoJobDownload: (job: VideoJob) => Promise<void>;
  onToast: ConsoleToastFn;
}) {
  return (
    <section className="product-creative-workbench product-creative-studio grid w-full content-start gap-3">
      <section className="product-creative-compose-panel grid min-w-0 content-start gap-3 rounded-[8px] border border-[var(--border)] bg-[var(--panel)] p-3 shadow-[0_14px_42px_rgba(96,64,43,.06)]">
        <div className="product-creative-context-strip grid min-w-0 items-start gap-2 min-[760px]:grid-cols-[minmax(240px,.82fr)_minmax(0,1.18fr)]">
          <section className="product-creative-product-details grid self-start min-h-0 grid-rows-[36px_minmax(104px,auto)] gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--field)] px-3 py-2">
            <div className="product-facts-header flex h-9 items-center justify-between gap-3 text-xs font-black text-[var(--text)]">
              <span>{tVideo("facts.title")}</span>
              <div className="flex min-w-0 shrink-0 items-center gap-2">
                {productAutoSaveLabel ? <span className="min-w-0 truncate text-[11px] font-bold text-[var(--muted)]">{productAutoSaveLabel}</span> : null}
                <Button className="product-facts-action h-9 min-h-9 justify-center rounded-[8px] px-3 text-xs disabled:opacity-100" size="sm" variant="soft" disabled={packingDisabled} onClick={onOrganizeProductPackage}>
                  {isPacking ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Package size={13} />}
                  {isPacking ? tVideo("facts.organizing") : tVideo("facts.organize")}
                  <ActionButtonCost tVideo={tVideo} estimate={organizeProductEstimate} status={organizeProductEstimateStatus} />
                </Button>
              </div>
            </div>
            <div className="product-facts-editor grid min-w-0 gap-2">
              <Textarea
                ref={productFactsBodyRef}
                className="product-facts-body h-[104px] min-h-[104px] max-h-[104px] resize-none overflow-y-auto border-0 bg-transparent px-0 py-0 text-sm font-bold leading-6 shadow-none focus:border-transparent focus:shadow-none focus-visible:ring-0"
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                onPaste={onProductFactsPaste}
                placeholder={tVideo("facts.placeholder")}
                rows={4}
              />
              {importNotes.length > 0 ? (
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-bold text-[var(--muted)]">
                  {importNotes.slice(0, 3).map((note) => <span key={note} className="truncate">· {note}</span>)}
                </div>
              ) : null}
            </div>
          </section>

          <ProductComposerReferenceTray
            tVideo={tVideo}
            product={selectedProduct}
            pendingFiles={pendingImageFiles}
            draftImages={draftReferenceImages}
            pendingImages={pendingReferenceImageStatuses}
            onSelectReferenceImage={onSelectReferenceImage}
            onPreviewReferenceImage={onPreviewReferenceImage}
            onPendingSelect={onPendingSelect}
            onPendingPreview={onPendingPreview}
            onDeleteReferenceImage={onDeleteReferenceImage}
            onReorderReferenceImage={onReorderReferenceImage}
            onFilesChange={onFilesChange}
            onClearPendingFile={onClearPendingFile}
          />
        </div>

        <ProductModeOutputPanel
          mode={mode}
          onModeChange={onModeChange}
          appLocale={appLocale}
          tVideo={tVideo}
          imageModelLabel={imageModelLabel}
          imageModelOptions={imageModelOptions}
          selectedImageModelConfigId={selectedImageModelConfigId}
          onImageModelConfigChange={onImageModelConfigChange}
          videoModelOptions={videoModelOptions}
          selectedVideoModelConfigId={selectedVideoModelConfigId}
          onVideoModelConfigChange={onVideoModelConfigChange}
          imagePrompt={imagePrompt}
          onImagePromptChange={onImagePromptChange}
          imagePromptReferences={imagePromptReferences}
          imagePromptReferenceIndex={imagePromptReferenceIndex}
          selectedImagePromptReference={selectedImagePromptReference}
          onImagePromptReferenceSelect={onImagePromptReferenceSelect}
          onImagePromptReferencePreview={onImagePromptReferencePreview}
          onImagePromptReferenceRemove={onImagePromptReferenceRemove}
          onImagePromptReferenceFilesChange={onImagePromptReferenceFilesChange}
          template={template}
          templateOptions={templateOptions}
          onTemplateChange={onTemplateChange}
          duration={duration}
          durationOptions={durationOptions}
          onDurationChange={onDurationChange}
          selectedVideoResolution={selectedVideoResolution}
          onVideoResolutionChange={onVideoResolutionChange}
          selectedVideoAspectRatio={selectedVideoAspectRatio}
          onVideoAspectRatioChange={onVideoAspectRatioChange}
          finalLanguage={finalLanguage}
          languageOptions={languageOptions}
          onFinalLanguageChange={onFinalLanguageChange}
          versionCount={versionCount}
          versionCountOptions={versionCountOptions}
          onVersionCountChange={onVersionCountChange}
          storyboardDraft={storyboardDraft}
          onStoryboardDraftChange={onStoryboardDraftChange}
          onGenerateStoryboardDraft={onGenerateStoryboardDraft}
          onGenerateImagePromptDraft={onGenerateImagePromptDraft}
          isGeneratingStoryboard={isGeneratingStoryboard}
          isGeneratingImagePrompt={isGeneratingImagePrompt}
          productReady={storyboardProductReady}
          generationReadiness={generationReadiness}
          generateVideoDisabled={generateVideoDisabled}
          imageGenerateDisabled={imageGenerateDisabled}
          generateVideoButtonLabel={generateVideoButtonLabel}
          generateImageButtonLabel={generateImageButtonLabel}
          isSubmittingVideo={isSubmittingVideo}
          isSubmittingImage={isSubmittingImage}
          videoEstimate={videoEstimate}
          videoEstimateStatus={videoEstimateStatus}
          imageEstimate={imageEstimate}
          imageEstimateStatus={imageEstimateStatus}
          workspacePrimaryActionDisabled={workspace.primaryAction.disabled}
          workspacePrimaryActionReason={workspace.primaryAction.reason}
          onGenerateVideo={onGenerateVideo}
          onGenerateProductImages={onGenerateProductImages}
        />
      </section>

      <details className="product-creative-history group/history rounded-[8px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2" open={jobs.length > 0}>
        <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 text-xs font-black text-[var(--text)] marker:hidden">
          <span>{tVideo("history.title")}</span>
          <span className="flex min-w-0 items-center gap-2 text-[11px] font-bold text-[var(--muted)]">
            <span>{mode === "video" ? tVideo("counts.video", { count: jobs.length }) : tVideo("counts.record", { count: workspace.assetSummary.imageAssets })}</span>
            <ChevronDown size={14} className="transition group-open/history:rotate-180" />
          </span>
        </summary>
        <div className="mt-2 border-t border-[var(--border)] pt-2">
          <ProductModeAssetPanel
            mode={mode}
            surface="workbench"
            appLocale={appLocale}
            tVideo={tVideo}
            jobs={jobs}
            product={selectedProduct}
            draft={draft}
            importText={importText}
            onPreviewVideo={onPreviewVideo}
            onDeleteVideo={onDeleteVideo}
            onRetryVideoJob={onRetryVideoJob}
            onRecoverVideoJobDownload={onRecoverVideoJobDownload}
            onToast={onToast}
          />
        </div>
      </details>
    </section>
  );
}

function ProductCreativeSettingsTray({
  tVideo,
  template,
  templateOptions,
  onTemplateChange,
  duration,
  durationOptions,
  onDurationChange,
  selectedVideoResolution,
  onVideoResolutionChange,
  selectedVideoAspectRatio,
  onVideoAspectRatioChange,
  finalLanguage,
  languageOptions,
  onFinalLanguageChange,
  versionCount,
  versionCountOptions,
  onVersionCountChange
}: {
  tVideo: VideoStudioTranslator;
  template: TemplateName;
  templateOptions: TemplateName[];
  onTemplateChange: (template: TemplateName) => void;
  duration: number;
  durationOptions: string[];
  onDurationChange: (duration: number) => void;
  selectedVideoResolution: VideoResolution;
  onVideoResolutionChange: (resolution: VideoResolution) => void;
  selectedVideoAspectRatio: VideoAspectRatio;
  onVideoAspectRatioChange: (aspectRatio: VideoAspectRatio) => void;
  finalLanguage: FinalVideoLanguage;
  languageOptions: FinalVideoLanguage[];
  onFinalLanguageChange: (language: FinalVideoLanguage) => void;
  versionCount: number;
  versionCountOptions: string[];
  onVersionCountChange: (versionCount: number) => void;
}) {
  return (
    <div className="product-creative-controls prompt-inline-settings flex min-w-0 flex-1 flex-nowrap items-center gap-0.5 overflow-visible rounded-[8px] bg-transparent pr-0.5 text-[11px]">
      <ProductCreativeToolbarChoice
        icon={Clapperboard}
        label={tVideo("controls.creativeStyle")}
        value={template}
        options={templateOptions}
        formatOption={(option) => localizedTemplateLabel(option, tVideo)}
        formatActiveLabel={(option) => localizedTemplateLabel(option, tVideo)}
        onChange={onTemplateChange}
      />
      <ProductCreativeToolbarChoice
        icon={RectangleHorizontal}
        label={tVideo("controls.aspectRatio")}
        value={selectedVideoAspectRatio}
        options={videoAspectRatioOptions}
        formatOption={(option) => videoAspectRatioLabel(option, tVideo).replace(/^.*? /, "")}
        onChange={onVideoAspectRatioChange}
      />
      <ProductCreativeToolbarChoice
        icon={Clock}
        label={tVideo("controls.duration")}
        value={String(duration)}
        options={durationOptions}
        formatOption={(option) => `${option}s`}
        onChange={(option) => onDurationChange(Number(option))}
      />
      <ProductCreativeToolbarChoice
        icon={Monitor}
        label={tVideo("controls.resolution")}
        value={selectedVideoResolution}
        options={videoResolutionOptions}
        formatOption={videoResolutionLabel}
        onChange={onVideoResolutionChange}
      />
      <ProductCreativeToolbarChoice
        icon={Languages}
        label={tVideo("controls.finalLanguage")}
        value={finalLanguage}
        options={languageOptions}
        formatOption={(option) => finalLanguageLabel(option, tVideo)}
        formatActiveLabel={(option) => compactFinalLanguageLabel(option, tVideo)}
        onChange={onFinalLanguageChange}
      />
      <ProductCreativeToolbarChoice
        icon={Rows3}
        label={tVideo("controls.versionCount")}
        value={String(versionCount)}
        options={versionCountOptions}
        formatOption={(option) => `${option} 个`}
        onChange={(option) => onVersionCountChange(Number(option))}
      />
    </div>
  );
}

function ProductCreativeModeSwitch({
  mode,
  onModeChange
}: {
  mode: ProductCreativeWorkspaceMode;
  onModeChange: (mode: ProductCreativeWorkspaceMode) => void;
}) {
  const options: Array<{ mode: ProductCreativeWorkspaceMode; label: string; icon: typeof ImageIcon }> = [
    { mode: "image", label: "图片", icon: ImageIcon },
    { mode: "video", label: "视频", icon: Clapperboard }
  ];

  return (
    <div className="product-creative-mode-switch flex h-10 shrink-0 items-center gap-1.5 rounded-[9px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_72%,transparent)] p-1 text-xs font-black">
      {options.map(({ mode: optionMode, label, icon: Icon }) => {
        const active = mode === optionMode;
        return (
          <button
            key={optionMode}
            type="button"
            className={cn(
              "inline-flex h-8 min-w-[50px] items-center justify-center gap-1 rounded-[7px] px-2 transition",
              active
                ? "bg-[var(--text)] text-[var(--card)] shadow-[0_6px_14px_rgba(96,64,43,.14)]"
                : "text-[var(--muted)] hover:bg-[var(--panel2)] hover:text-[var(--text)]"
            )}
            aria-pressed={active}
            onClick={() => {
              if (!active) {
                onModeChange(optionMode);
              }
            }}
          >
            <Icon size={13} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ProductCreativeToolbarChoice<T extends string>({
  icon: Icon,
  label,
  value,
  options,
  formatOption,
  formatActiveLabel,
  onChange
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: T;
  options: T[];
  formatOption: (option: T) => string;
  formatActiveLabel?: (option: T) => string;
  onChange: (option: T) => void;
}) {
  return (
    <div className="product-creative-toolbar-choice min-w-[42px] max-w-[128px] shrink-0" title={label}>
      <CompactChoiceDropdown
        label={<Icon size={12} className="shrink-0" aria-hidden="true" />}
        value={value}
        options={options}
        formatOption={formatOption}
        formatActiveLabel={formatActiveLabel}
        onChange={onChange}
        layout="pill"
        density="micro"
        menuPlacement="top"
        menuWidth="content"
      />
    </div>
  );
}

type ProductCreativeAssetPanelSurface = "section" | "workbench";

function ProductModeAssetPanel({
  mode,
  surface = "section",
  appLocale,
  tVideo,
  jobs,
  product,
  draft,
  importText,
  onPreviewVideo,
  onDeleteVideo,
  onRetryVideoJob,
  onRecoverVideoJobDownload,
  onToast
}: {
  mode: ProductCreativeWorkspaceMode;
  surface?: ProductCreativeAssetPanelSurface;
  appLocale: AppLocale;
  tVideo: VideoStudioTranslator;
  jobs: CreativeVersionItem[];
  product?: ProductDetail;
  draft: ProductDraft;
  importText: string;
  onPreviewVideo: (job: CreativeVersionItem) => void;
  onDeleteVideo: (job: CreativeVersionItem) => void;
  onRetryVideoJob: (job: VideoJob) => Promise<void>;
  onRecoverVideoJobDownload: (job: VideoJob) => Promise<void>;
  onToast: ConsoleToastFn;
}) {
  if (mode === "video") {
    return (
      <VideoHistoryPanel
        appLocale={appLocale}
        tVideo={tVideo}
        jobs={jobs}
        product={product}
        draft={draft}
        importText={importText}
        surface={surface}
        onPreview={onPreviewVideo}
        onDelete={onDeleteVideo}
        onRetryVideoJob={onRetryVideoJob}
        onRecoverVideoJobDownload={onRecoverVideoJobDownload}
        onToast={onToast}
      />
    );
  }

  return (
    <ProductImageHistoryPanel surface={surface} />
  );
}

function ProductModeOutputPanel({
  mode,
  onModeChange,
  appLocale,
  tVideo,
  imageModelLabel,
  imageModelOptions,
  selectedImageModelConfigId,
  onImageModelConfigChange,
  videoModelOptions,
  selectedVideoModelConfigId,
  onVideoModelConfigChange,
  imagePrompt,
  onImagePromptChange,
  imagePromptReferences,
  imagePromptReferenceIndex,
  selectedImagePromptReference,
  onImagePromptReferenceSelect,
  onImagePromptReferencePreview,
  onImagePromptReferenceRemove,
  onImagePromptReferenceFilesChange,
  template,
  templateOptions,
  onTemplateChange,
  duration,
  durationOptions,
  onDurationChange,
  selectedVideoResolution,
  onVideoResolutionChange,
  selectedVideoAspectRatio,
  onVideoAspectRatioChange,
  finalLanguage,
  languageOptions,
  onFinalLanguageChange,
  versionCount,
  versionCountOptions,
  onVersionCountChange,
  storyboardDraft,
  onStoryboardDraftChange,
  onGenerateStoryboardDraft,
  onGenerateImagePromptDraft,
  isGeneratingStoryboard,
  isGeneratingImagePrompt,
  productReady,
  generationReadiness,
  generateVideoDisabled,
  imageGenerateDisabled,
  generateVideoButtonLabel,
  generateImageButtonLabel,
  isSubmittingVideo,
  isSubmittingImage,
  videoEstimate,
  videoEstimateStatus,
  imageEstimate,
  imageEstimateStatus,
  workspacePrimaryActionDisabled,
  workspacePrimaryActionReason,
  onGenerateVideo,
  onGenerateProductImages
}: {
  mode: ProductCreativeWorkspaceMode;
  onModeChange: (mode: ProductCreativeWorkspaceMode) => void;
  appLocale: AppLocale;
  tVideo: VideoStudioTranslator;
  imageModelLabel: string;
  imageModelOptions: ProviderConfigItem[];
  selectedImageModelConfigId: ModelConfigChoice;
  onImageModelConfigChange: (configId: ModelConfigChoice) => void;
  videoModelOptions: ProviderConfigItem[];
  selectedVideoModelConfigId: ModelConfigChoice;
  onVideoModelConfigChange: (configId: ModelConfigChoice) => void;
  imagePrompt: string;
  onImagePromptChange: (prompt: string) => void;
  imagePromptReferences: ReferenceImageStatus[];
  imagePromptReferenceIndex?: number;
  selectedImagePromptReference?: ReferenceImageStatus;
  onImagePromptReferenceSelect: (index: number) => void;
  onImagePromptReferencePreview: (index: number) => void;
  onImagePromptReferenceRemove: (index: number) => void;
  onImagePromptReferenceFilesChange: (files: FileList | File[] | null) => void;
  template: TemplateName;
  templateOptions: TemplateName[];
  onTemplateChange: (template: TemplateName) => void;
  duration: number;
  durationOptions: string[];
  onDurationChange: (duration: number) => void;
  selectedVideoResolution: VideoResolution;
  onVideoResolutionChange: (resolution: VideoResolution) => void;
  selectedVideoAspectRatio: VideoAspectRatio;
  onVideoAspectRatioChange: (aspectRatio: VideoAspectRatio) => void;
  finalLanguage: FinalVideoLanguage;
  languageOptions: FinalVideoLanguage[];
  onFinalLanguageChange: (language: FinalVideoLanguage) => void;
  versionCount: number;
  versionCountOptions: string[];
  onVersionCountChange: (versionCount: number) => void;
  storyboardDraft: string;
  onStoryboardDraftChange: (draft: string, source?: StoryboardDraftSource) => void;
  onGenerateStoryboardDraft: (product?: ProductDetail) => Promise<void>;
  onGenerateImagePromptDraft: () => Promise<void>;
  isGeneratingStoryboard: boolean;
  isGeneratingImagePrompt: boolean;
  productReady: boolean;
  generationReadiness: { ready: boolean; label: string };
  generateVideoDisabled: boolean;
  imageGenerateDisabled: boolean;
  generateVideoButtonLabel: string;
  generateImageButtonLabel: string;
  isSubmittingVideo: boolean;
  isSubmittingImage: boolean;
  videoEstimate?: BillingActionEstimate;
  videoEstimateStatus: BillingEstimatesStatus;
  imageEstimate?: BillingActionEstimate;
  imageEstimateStatus: BillingEstimatesStatus;
  workspacePrimaryActionDisabled: boolean;
  workspacePrimaryActionReason?: string;
  onGenerateVideo: () => Promise<void>;
  onGenerateProductImages: () => Promise<void>;
}) {
  return (
    <StoryboardComposerPanel
      appLocale={appLocale}
      tVideo={tVideo}
      mode={mode}
      onModeChange={onModeChange}
      imageModelLabel={imageModelLabel}
      imageModelOptions={imageModelOptions}
      selectedImageModelConfigId={selectedImageModelConfigId}
      onImageModelConfigChange={onImageModelConfigChange}
      videoModelOptions={videoModelOptions}
      selectedVideoModelConfigId={selectedVideoModelConfigId}
      onVideoModelConfigChange={onVideoModelConfigChange}
      imagePrompt={imagePrompt}
      onImagePromptChange={onImagePromptChange}
      imagePromptReferences={imagePromptReferences}
      imagePromptReferenceIndex={imagePromptReferenceIndex}
      selectedImagePromptReference={selectedImagePromptReference}
      onImagePromptReferenceSelect={onImagePromptReferenceSelect}
      onImagePromptReferencePreview={onImagePromptReferencePreview}
      onImagePromptReferenceRemove={onImagePromptReferenceRemove}
      onImagePromptReferenceFilesChange={onImagePromptReferenceFilesChange}
      template={template}
      templateOptions={templateOptions}
      onTemplateChange={onTemplateChange}
      duration={duration}
      durationOptions={durationOptions}
      onDurationChange={onDurationChange}
      selectedVideoResolution={selectedVideoResolution}
      onVideoResolutionChange={onVideoResolutionChange}
      selectedVideoAspectRatio={selectedVideoAspectRatio}
      onVideoAspectRatioChange={onVideoAspectRatioChange}
      finalLanguage={finalLanguage}
      languageOptions={languageOptions}
      onFinalLanguageChange={onFinalLanguageChange}
      versionCount={versionCount}
      versionCountOptions={versionCountOptions}
      onVersionCountChange={onVersionCountChange}
      storyboardDraft={storyboardDraft}
      onStoryboardDraftChange={onStoryboardDraftChange}
      onGenerateStoryboardDraft={onGenerateStoryboardDraft}
      onGenerateImagePromptDraft={onGenerateImagePromptDraft}
      isGeneratingStoryboard={isGeneratingStoryboard}
      isGeneratingImagePrompt={isGeneratingImagePrompt}
      productReady={productReady}
      generationReadiness={generationReadiness}
      generateVideoDisabled={generateVideoDisabled}
      imageGenerateDisabled={imageGenerateDisabled}
      generateVideoButtonLabel={generateVideoButtonLabel}
      generateImageButtonLabel={generateImageButtonLabel}
      isSubmittingVideo={isSubmittingVideo}
      isSubmittingImage={isSubmittingImage}
      videoEstimate={videoEstimate}
      videoEstimateStatus={videoEstimateStatus}
      imageEstimate={imageEstimate}
      imageEstimateStatus={imageEstimateStatus}
      workspacePrimaryActionDisabled={workspacePrimaryActionDisabled}
      workspacePrimaryActionReason={workspacePrimaryActionReason}
      onGenerateVideo={onGenerateVideo}
      onGenerateProductImages={onGenerateProductImages}
    />
  );
}

function ProductImageHistoryPanel({
  surface = "section"
}: {
  surface?: ProductCreativeAssetPanelSurface;
}) {
  const compact = surface === "workbench";

  return (
    <section className={cn(
      "product-creative-asset-panel grid min-w-0 gap-3",
      compact
        ? ""
        : "border-t border-[var(--border)] bg-[var(--card)] p-5"
    )}>
      <div className={cn("flex flex-wrap items-center justify-between gap-2", compact && "hidden")}>
        <div>
          <div className="text-base font-black text-[var(--text)]">图片历史</div>
          <div className="mt-1 text-xs font-bold text-[var(--muted)]">当前商品生成过的图片记录会显示在这里。</div>
        </div>
        <Badge>0 条</Badge>
      </div>
      <div className={cn(
        "grid min-h-[118px] place-items-center border border-dashed border-[var(--border)] bg-[var(--field)] px-4 py-5 text-center",
        compact ? "rounded-[8px]" : "rounded-[14px]"
      )}>
        <div className="max-w-[340px]">
          <ImageIcon className="mx-auto text-[var(--accent)]" size={24} />
          <div className="mt-2 text-sm font-black text-[var(--text)]">暂无图片生成记录</div>
          <p className="m-0 mt-1 text-xs font-bold leading-5 text-[var(--muted)]">生成后的图片批次会进入这里；商品素材仍在上方图片区管理。</p>
        </div>
      </div>
    </section>
  );
}

function ProductCreationProductLibrary({
  tVideo,
  products,
  selectedSku,
  draftTitle,
  collapsed,
  onExpand,
  onSelectProduct,
  onAddProduct,
  onDeleteProduct,
  onImportFile
}: {
  tVideo: VideoStudioTranslator;
  products: ProductSummary[];
  selectedSku: string;
  draftTitle?: string;
  collapsed: boolean;
  onExpand: () => void;
  onSelectProduct: (product: ProductSummary) => Promise<void>;
  onAddProduct: () => void;
  onDeleteProduct: (sku: string) => Promise<void>;
  onImportFile: () => void;
}) {
  const tProductStatus = makeAppTranslator("productStatus");
  const productOptions = dedupeProductSummaries(products);
  const draftProductTitle = draftTitle?.trim() ?? "";
  const [productLibrarySearchQuery, setProductLibrarySearchQuery] = useState("");
  const filteredProductOptions = useMemo(
    () => filterProductLibraryProducts(productOptions, productLibrarySearchQuery, (product) => {
      const status = productLibraryStatus(product, tProductStatus);
      return [status.label, status.detail];
    }),
    [productOptions, productLibrarySearchQuery, tProductStatus]
  );
  const trimmedSearchQuery = productLibrarySearchQuery.trim();

  if (collapsed) {
    return (
      <aside className="video-product-library-column grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-r border-[var(--border)] bg-[var(--field)]">
        <div className="grid place-items-center border-b border-[var(--border)] bg-[var(--panel)] px-1.5 py-3">
          <Package className="text-[var(--muted)]" size={15} />
        </div>
        <div className="grid min-h-0 content-start justify-items-center gap-2 overflow-hidden py-2">
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            aria-label={tVideo("productLibrary.expand")}
            title={`${tVideo("productLibrary.title")} · ${tVideo("counts.product", { count: productOptions.length })}`}
            onClick={onExpand}
          >
            <Package size={14} />
          </button>
          <span className="text-[10px] font-black leading-none text-[var(--muted)]">{productOptions.length}</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="video-product-library-column grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-r border-[var(--border)] bg-[var(--field)]">
      <div className="grid gap-2.5 border-b border-[var(--border)] bg-[var(--panel)] px-3 py-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="m-0 truncate text-[15px] font-black leading-5 text-[var(--text)]">{tVideo("productLibrary.title")}</h2>
            <div className="mt-0.5 text-[11px] font-bold text-[var(--muted)]">
              {trimmedSearchQuery
                ? tVideo("productLibrary.filteredCount", { shown: filteredProductOptions.length, total: productOptions.length })
                : tVideo("counts.product", { count: productOptions.length })}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="icon" variant="soft" aria-label={tVideo("productLibrary.importFile")} title={tVideo("productLibrary.importFile")} onClick={onImportFile}>
              <FileSpreadsheet size={14} />
            </Button>
            <Button size="icon" variant="primary" aria-label={tVideo("newProduct.title")} title={tVideo("newProduct.title")} onClick={onAddProduct}>
              <Plus size={14} />
            </Button>
          </div>
        </div>
        <label className="product-library-search group/search relative block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] transition group-focus-within/search:text-[var(--accent)]" size={14} />
          <Input
            className="h-9 min-h-9 rounded-[9px] border-[var(--border-strong)] bg-[var(--field)] pl-8 pr-8 text-[12px] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,.55)] placeholder:text-[var(--muted)]"
            type="search"
            value={productLibrarySearchQuery}
            placeholder={tVideo("productLibrary.search")}
            aria-label={tVideo("productLibrary.search")}
            onChange={(event) => setProductLibrarySearchQuery(event.target.value)}
          />
          {productLibrarySearchQuery ? (
            <button
              type="button"
              className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-[7px] text-[var(--muted)] transition hover:bg-[var(--panel2)] hover:text-[var(--text)]"
              aria-label={tVideo("productLibrary.clearSearch")}
              title={tVideo("productLibrary.clearSearch")}
              onClick={() => setProductLibrarySearchQuery("")}
            >
              <X size={12} />
            </button>
          ) : null}
        </label>
      </div>

      <div className="product-library-scroll min-h-0 overflow-y-auto px-2 py-2">
        <div className="grid gap-1.5">
          {filteredProductOptions.map((product) => {
            const active = product.sku === selectedSku;
            const status = productLibraryStatus(product, tProductStatus);
            const referenceImageCount = productReferenceCount(product);
            const title = active && draftProductTitle ? draftProductTitle : product.title_ja;

            return (
              <article
                key={product.path || product.sku || product.title_ja}
                className={cn(
                  "group/video-product-row grid min-h-[68px] grid-cols-[minmax(0,1fr)_26px] items-start gap-1.5 rounded-[8px] border px-2.5 py-2 transition",
                  active
                    ? "border-[color-mix(in_srgb,var(--accent)_45%,var(--border-strong))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--panel))]"
                    : "border-transparent bg-[var(--panel)] hover:border-[var(--border)] hover:bg-[var(--panel2)]"
                )}
              >
                <button
                  type="button"
                  className="grid min-w-0 gap-1 text-left"
                  aria-current={active ? "true" : undefined}
                  title={title}
                  onClick={() => {
                    if (!active) {
                      void onSelectProduct(product);
                    }
                  }}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded-full", active ? "text-[var(--accent)]" : "text-transparent")}>
                      <CheckCircle2 size={13} />
                    </span>
                    <span className="truncate text-[13px] font-black leading-5 text-[var(--text)]">{title}</span>
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5 pl-5">
                    <Badge className="min-h-5 px-1.5 text-[10px]" tone={status.tone}>{status.label}</Badge>
                    <span className="text-[11px] font-bold text-[var(--muted)]">{tVideo("summary.referenceImages", { count: referenceImageCount })}</span>
                  </span>
                </button>

                <button
                  type="button"
                  className="grid h-6 w-6 place-items-center rounded-[7px] text-red-400 opacity-80 transition hover:bg-red-50 hover:text-red-600 min-[900px]:opacity-0 min-[900px]:group-hover/video-product-row:opacity-100"
                  title={tVideo("productLibrary.deleteProduct")}
                  aria-label={`${tVideo("productLibrary.deleteProduct")} ${product.title_ja}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void onDeleteProduct(product.sku);
                  }}
                >
                  <X size={13} />
                </button>
              </article>
            );
          })}
        </div>

        {productOptions.length === 0 ? (
          <div className="mt-3 rounded-[8px] border border-dashed border-[var(--border)] bg-[var(--panel)] px-3 py-6 text-center text-xs font-bold text-[var(--muted)]">
            {tVideo("productLibrary.empty")}
          </div>
        ) : filteredProductOptions.length === 0 ? (
          <div className="mt-3 grid gap-2 rounded-[8px] border border-dashed border-[var(--border)] bg-[var(--panel)] px-3 py-6 text-center">
            <div className="text-xs font-black text-[var(--text)]">{tVideo("productLibrary.noMatches")}</div>
            <button
              type="button"
              className="mx-auto w-fit rounded-[8px] px-2 py-1 text-[11px] font-black text-[var(--accent)] transition hover:bg-[color-mix(in_srgb,var(--accent)_8%,var(--panel))]"
              onClick={() => setProductLibrarySearchQuery("")}
            >
              {tVideo("productLibrary.clearSearch")}
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function ProductCreationOperationWorkspace({
  title,
  badge,
  children
}: {
  title: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <section className="video-operation-column grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[var(--card)]">
      <div className="grid min-h-[54px] gap-1 border-b border-[var(--border)] bg-[var(--card)] px-4 py-2.5 min-[1180px]:grid-cols-[minmax(0,1fr)_auto] min-[1180px]:items-center">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="m-0 truncate text-[16px] font-black leading-5 text-[var(--text)]">{title}</h2>
            {badge ? <Badge className="shrink-0" tone="neutral">{badge}</Badge> : null}
          </div>
        </div>
      </div>
      <div className="min-h-0 overflow-y-auto p-3 min-[1280px]:p-4">
        <div className="grid content-start gap-3">
          {children}
        </div>
      </div>
    </section>
  );
}

function ProductComposerReferenceTray({
  tVideo,
  className,
  product,
  pendingFiles,
  draftImages,
  pendingImages,
  onSelectReferenceImage,
  onPreviewReferenceImage,
  onPendingSelect,
  onPendingPreview,
  onDeleteReferenceImage,
  onReorderReferenceImage,
  onFilesChange,
  onClearPendingFile
}: {
  tVideo: VideoStudioTranslator;
  className?: string;
  product?: ProductDetail;
  pendingFiles: File[];
  draftImages: ReferenceImageStatus[];
  pendingImages: ReferenceImageStatus[];
  onSelectReferenceImage: (index: number) => void;
  onPreviewReferenceImage: (index: number) => void;
  onPendingSelect: (index: number) => void;
  onPendingPreview: (index: number) => void;
  onDeleteReferenceImage: (index: number) => void;
  onReorderReferenceImage: (fromIndex: number, toIndex: number) => void;
  onFilesChange: (files: FileList | File[] | null) => void;
  onClearPendingFile: (index: number) => void;
}) {
  const images = product?.reference_image_statuses ?? [];
  const visibleDraftImages = images.length > 0 ? [] : draftImages;
  const [dragOver, setDragOver] = useState(false);
  const [draggedReferenceIndex, setDraggedReferenceIndex] = useState<number | undefined>();
  const [dragOverReferenceIndex, setDragOverReferenceIndex] = useState<number | undefined>();
  function acceptReferenceFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    onFilesChange(files);
  }

  function handleReferenceDrag(event: DragEvent<HTMLElement>) {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }

  function handleReferenceDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragOver(false);
    acceptReferenceFiles(event.dataTransfer.files);
  }

  const visibleImages = images.length > 0 ? images : visibleDraftImages;
  const referenceCount = visibleImages.length > 0 ? visibleImages.length : pendingFiles.length;

  return (
    <section
      className={cn(
        "product-reference-inline grid self-start content-start gap-2 rounded-[8px] px-3 py-2",
        referenceCount > 0 ? "grid-rows-[36px_minmax(104px,auto)]" : "grid-rows-[36px]",
        className
      )}
      onDragEnter={handleReferenceDrag}
      onDragOver={handleReferenceDrag}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragOver(false);
        }
      }}
      onDrop={handleReferenceDrop}
    >
      <div className="product-reference-actions flex h-9 min-w-0 flex-nowrap items-center gap-2">
        <span className="product-reference-title shrink-0 whitespace-nowrap text-xs font-black text-[var(--text)]">{tVideo("reference.title")}</span>
        <label
          className={cn(
            "reference-add-button inline-flex h-9 min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[8px] border px-3 text-xs font-black transition",
            dragOver
              ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,var(--field))] text-[var(--accent)] shadow-[0_0_0_3px_rgba(10,163,148,.12)]"
              : "border-[var(--border)] bg-[var(--field)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          )}
        >
          <Plus size={14} />
          {tVideo("reference.add")}
          <span className="text-[11px] font-bold">{referenceCount}</span>
          <input
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(event) => {
              acceptReferenceFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
        </label>
        {referenceCount === 0 ? (
          <span className="text-xs font-bold text-[var(--muted)]">{tVideo("reference.addHint")}</span>
        ) : null}
      </div>
      {visibleImages.length > 0 ? (
        <div className="reference-image-list flex h-[104px] min-h-[104px] min-w-0 items-start gap-1.5 overflow-x-auto pb-1">
          {visibleImages.map((image, index) => (
            <ReferenceImageFigure
              tVideo={tVideo}
              key={`${image.original}-${index}`}
              image={image}
              sku={product?.sku ?? ""}
              index={index}
              dragging={draggedReferenceIndex === index}
              dragOver={dragOverReferenceIndex === index && draggedReferenceIndex !== index}
              onSelect={() => onSelectReferenceImage(index)}
              onPreview={() => onPreviewReferenceImage(index)}
              onDelete={onDeleteReferenceImage}
              onReorder={onReorderReferenceImage}
              onDragStateChange={(dragIndex, overIndex) => {
                if (dragIndex === null) {
                  setDraggedReferenceIndex(undefined);
                } else if (dragIndex !== undefined) {
                  setDraggedReferenceIndex(dragIndex);
                }
                if (overIndex === null) {
                  setDragOverReferenceIndex(undefined);
                } else if (overIndex !== undefined) {
                  setDragOverReferenceIndex(overIndex);
                }
              }}
            />
          ))}
        </div>
      ) : pendingFiles.length > 0 ? (
        <div className="reference-image-list flex h-[104px] min-h-[104px] min-w-0 items-start gap-1.5 overflow-x-auto pb-1">
          {pendingImages.map((image, index) => {
            const file = pendingFiles[index];
            const fileName = file?.name ?? image.original;
            const dragging = draggedReferenceIndex === index;
            const over = dragOverReferenceIndex === index && draggedReferenceIndex !== index;
            return (
              <div
                key={`${fileName}-${index}`}
                className={cn(
                  "relative grid h-[74px] w-[176px] shrink-0 cursor-grab grid-cols-[72px_minmax(0,1fr)_28px] items-center gap-2 overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--field)] p-1 transition active:cursor-grabbing",
                  dragging && "opacity-55",
                  over && "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--field))] shadow-[0_0_0_3px_rgba(10,163,148,.12)]"
                )}
                draggable={pendingImages.length > 1}
                title={tVideo("reference.reorderTitle")}
                onDragStart={(event) => {
                  event.stopPropagation();
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", String(index));
                  setDraggedReferenceIndex(index);
                }}
                onDragOver={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOverReferenceIndex(index);
                }}
                onDrop={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  const fromIndex = Number(event.dataTransfer.getData("text/plain"));
                  if (Number.isInteger(fromIndex)) {
                    onReorderReferenceImage(fromIndex, index);
                  }
                  setDraggedReferenceIndex(undefined);
                  setDragOverReferenceIndex(undefined);
                }}
                onDragEnd={() => {
                  setDraggedReferenceIndex(undefined);
                  setDragOverReferenceIndex(undefined);
                }}
              >
                <ReferenceImageThumbnail
                  image={image}
                  title={tVideo("reference.previewPending")}
                  alt={`${fileName} preview`}
                  className="h-[64px] w-[64px]"
                  onSelect={() => onPendingSelect(index)}
                  onPreview={() => onPendingPreview(index)}
                />
                <div className="min-w-0">
                  <div className="truncate text-xs font-black text-[var(--text)]">{tVideo("reference.pending", { index: index + 1 })}</div>
                  <div className="truncate text-[11px] font-semibold text-[var(--muted)]">{fileName}</div>
                </div>
                <ReferenceImageRemoveButton
                  className="right-2 top-1/2 -translate-y-1/2"
                  title={tVideo("reference.removePending")}
                  ariaLabel={`${tVideo("reference.removePending")} ${fileName}`}
                  onRemove={() => onClearPendingFile(index)}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function StoryboardComposerPanel({
  appLocale,
  tVideo,
  mode,
  onModeChange,
  imageModelLabel,
  imageModelOptions,
  selectedImageModelConfigId,
  onImageModelConfigChange,
  videoModelOptions,
  selectedVideoModelConfigId,
  onVideoModelConfigChange,
  imagePrompt,
  onImagePromptChange,
  imagePromptReferences,
  imagePromptReferenceIndex,
  selectedImagePromptReference,
  onImagePromptReferenceSelect,
  onImagePromptReferencePreview,
  onImagePromptReferenceRemove,
  onImagePromptReferenceFilesChange,
  template,
  templateOptions,
  onTemplateChange,
  duration,
  durationOptions,
  onDurationChange,
  selectedVideoResolution,
  onVideoResolutionChange,
  selectedVideoAspectRatio,
  onVideoAspectRatioChange,
  finalLanguage,
  languageOptions,
  onFinalLanguageChange,
  versionCount,
  versionCountOptions,
  onVersionCountChange,
  storyboardDraft,
  onStoryboardDraftChange,
  onGenerateStoryboardDraft,
  onGenerateImagePromptDraft,
  isGeneratingStoryboard,
  isGeneratingImagePrompt,
  productReady,
  generationReadiness,
  generateVideoDisabled,
  imageGenerateDisabled,
  generateVideoButtonLabel,
  generateImageButtonLabel,
  isSubmittingVideo,
  isSubmittingImage,
  videoEstimate,
  videoEstimateStatus,
  imageEstimate,
  imageEstimateStatus,
  workspacePrimaryActionDisabled,
  workspacePrimaryActionReason,
  onGenerateVideo,
  onGenerateProductImages
}: {
  appLocale: AppLocale;
  tVideo: VideoStudioTranslator;
  mode: ProductCreativeWorkspaceMode;
  onModeChange: (mode: ProductCreativeWorkspaceMode) => void;
  imageModelLabel: string;
  imageModelOptions: ProviderConfigItem[];
  selectedImageModelConfigId: ModelConfigChoice;
  onImageModelConfigChange: (configId: ModelConfigChoice) => void;
  videoModelOptions: ProviderConfigItem[];
  selectedVideoModelConfigId: ModelConfigChoice;
  onVideoModelConfigChange: (configId: ModelConfigChoice) => void;
  imagePrompt: string;
  onImagePromptChange: (prompt: string) => void;
  imagePromptReferences: ReferenceImageStatus[];
  imagePromptReferenceIndex?: number;
  selectedImagePromptReference?: ReferenceImageStatus;
  onImagePromptReferenceSelect: (index: number) => void;
  onImagePromptReferencePreview: (index: number) => void;
  onImagePromptReferenceRemove: (index: number) => void;
  onImagePromptReferenceFilesChange: (files: FileList | File[] | null) => void;
  template: TemplateName;
  templateOptions: TemplateName[];
  onTemplateChange: (template: TemplateName) => void;
  duration: number;
  durationOptions: string[];
  onDurationChange: (duration: number) => void;
  selectedVideoResolution: VideoResolution;
  onVideoResolutionChange: (resolution: VideoResolution) => void;
  selectedVideoAspectRatio: VideoAspectRatio;
  onVideoAspectRatioChange: (aspectRatio: VideoAspectRatio) => void;
  finalLanguage: FinalVideoLanguage;
  languageOptions: FinalVideoLanguage[];
  onFinalLanguageChange: (language: FinalVideoLanguage) => void;
  versionCount: number;
  versionCountOptions: string[];
  onVersionCountChange: (versionCount: number) => void;
  storyboardDraft: string;
  onStoryboardDraftChange: (draft: string, source?: StoryboardDraftSource) => void;
  onGenerateStoryboardDraft: (product?: ProductDetail) => Promise<void>;
  onGenerateImagePromptDraft: () => Promise<void>;
  isGeneratingStoryboard: boolean;
  isGeneratingImagePrompt: boolean;
  productReady: boolean;
  generationReadiness: { ready: boolean; label: string };
  generateVideoDisabled: boolean;
  imageGenerateDisabled: boolean;
  generateVideoButtonLabel: string;
  generateImageButtonLabel: string;
  isSubmittingVideo: boolean;
  isSubmittingImage: boolean;
  videoEstimate?: BillingActionEstimate;
  videoEstimateStatus: BillingEstimatesStatus;
  imageEstimate?: BillingActionEstimate;
  imageEstimateStatus: BillingEstimatesStatus;
  workspacePrimaryActionDisabled: boolean;
  workspacePrimaryActionReason?: string;
  onGenerateVideo: () => Promise<void>;
  onGenerateProductImages: () => Promise<void>;
}) {
  const imagePromptPresets = ["白底主图", "场景图", "细节图", "保留外观"];
  const promptTitle = mode === "image" ? "图片提示词" : tVideo("storyboard.title");
  const promptPreviewActionLoading = mode === "image" ? isGeneratingImagePrompt : isGeneratingStoryboard;
  const promptPreviewActionDisabled = promptPreviewActionLoading || !productReady;
  const promptPreviewActionLabel = promptPreviewActionLoading
    ? tVideo("storyboard.generating")
    : tVideo("storyboard.generate");
  const promptPlaceholder = mode === "image"
    ? "例如：保留商品外观，换成白底主图；或放到日系通勤场景，突出容量和轻便。"
    : tVideo("storyboard.placeholder");
  const activeModelConfigId = mode === "image" ? selectedImageModelConfigId : selectedVideoModelConfigId;
  const activeModelConfigChange = mode === "image" ? onImageModelConfigChange : onVideoModelConfigChange;
  const activeModelOptions = mode === "image" ? imageModelOptions : videoModelOptions;
  const activeModelEffectiveConfigId = effectiveModelConfigChoice(activeModelConfigId, activeModelOptions);
  const activeModelLabel = localizedModelConfigChoiceLabel(activeModelEffectiveConfigId, activeModelOptions, tVideo);
  const activeModelIcon = mode === "image"
    ? <ImageIcon size={12} className="shrink-0" aria-hidden="true" />
    : <Clapperboard size={12} className="shrink-0" aria-hidden="true" />;
  const primaryActionLoading = mode === "video" ? isSubmittingVideo : isSubmittingImage;
  const primaryActionDisabled = mode === "video" ? generateVideoDisabled : imageGenerateDisabled;
  const primaryActionTitle = mode === "video"
    ? generationReadiness.ready ? generateVideoButtonLabel : generationReadiness.label
    : workspacePrimaryActionDisabled ? workspacePrimaryActionReason : generateImageButtonLabel;
  const primaryActionLabel = primaryActionLoading
    ? tVideo("generate.submitting")
    : mode === "video" ? generateVideoButtonLabel : generateImageButtonLabel;
  const primaryActionIcon = primaryActionLoading
    ? <RefreshCcw className="h-4 w-4 animate-spin" />
    : mode === "video" ? <Play size={14} /> : <ImageIcon size={14} />;
  const primaryActionEstimate = mode === "video" ? videoEstimate : imageEstimate;
  const primaryActionEstimateStatus = mode === "video" ? videoEstimateStatus : imageEstimateStatus;

  function onPromptDraftChange(value: string) {
    if (mode === "image") {
      onImagePromptChange(value);
      return;
    }
    onStoryboardDraftChange(value);
  }

  function appendImagePromptPreset(preset: string) {
    const trimmedPrompt = imagePrompt.trim();
    onImagePromptChange(trimmedPrompt ? `${trimmedPrompt}，${preset}` : preset);
  }

  function handleImagePromptReferenceDrop(event: DragEvent<HTMLElement>) {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    onImagePromptReferenceFilesChange(event.dataTransfer.files);
  }

  return (
    <section className="storyboard-side-panel grid min-h-[300px] grid-rows-[auto_minmax(0,1fr)] gap-2 border-t border-[var(--border)] pt-3">
      <div className="storyboard-title-row flex min-h-8 items-center justify-between gap-3">
        <div className="min-w-0 text-sm font-black text-[var(--text)]">{promptTitle}</div>
        <div className="flex min-w-0 shrink items-center justify-end gap-2">
          <Button
            className="storyboard-title-action h-8 min-h-8 w-auto max-w-[112px] justify-center rounded-[8px] px-2 text-[11px] font-bold text-[var(--muted)]"
            size="sm"
            variant="ghost"
            disabled={promptPreviewActionDisabled}
            onClick={() => {
              if (!productReady) {
                return;
              }
              void (mode === "image" ? onGenerateImagePromptDraft() : onGenerateStoryboardDraft());
            }}
          >
            {promptPreviewActionLoading ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Eye size={13} />}
            <span className="truncate">{promptPreviewActionLabel}</span>
          </Button>
        </div>
      </div>

      <div
        className="storyboard-prompt-shell grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[12px] border border-[var(--border-strong)] bg-[var(--card)] storyboard-history-dropdown relative"
      >
        <div
          className="image-prompt-media-strip storyboard-prompt-media-row flex min-h-[82px] border-b border-[var(--border)] min-w-0 items-start gap-2 overflow-x-auto px-2.5 py-2"
          onDragOver={(event) => {
            if (!Array.from(event.dataTransfer.types).includes("Files")) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={handleImagePromptReferenceDrop}
        >
          <label className="image-prompt-add-tile grid h-[70px] w-[184px] shrink-0 cursor-pointer place-items-center rounded-[8px] border border-dashed border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_4%,var(--card))] px-2 text-center text-[var(--accent)] transition hover:bg-[color-mix(in_srgb,var(--accent)_8%,var(--card))]">
            <span className="grid gap-0.5">
              <span className="whitespace-nowrap text-[10px] font-black leading-3 text-[var(--muted)]">本次参考图</span>
              <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap text-[12px] font-black leading-4">
                <Plus size={13} />
                添加图片
              </span>
              <span className="whitespace-nowrap text-[10px] font-bold leading-3 text-[var(--muted)]">点击 / 拖拽 / 粘贴</span>
              <span className="whitespace-nowrap text-[10px] font-bold leading-3 text-[var(--muted)]">点上方商品图加入</span>
            </span>
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(event) => {
                onImagePromptReferenceFilesChange(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
          </label>
          {imagePromptReferences.map((image, index) => (
            <div key={`${image.original}-${index}`} className="image-prompt-reference-item relative h-[70px] w-[70px] shrink-0">
              <ReferenceImageThumbnail
                image={image}
                title={`选择本次参考图 ${index + 1}`}
                alt={image.original}
                className="image-prompt-reference-item"
                selected={imagePromptReferenceIndex === index}
                onSelect={() => onImagePromptReferenceSelect(index)}
                onPreview={() => onImagePromptReferencePreview(index)}
              />
              <ReferenceImageRemoveButton
                title="移出本次参考图"
                ariaLabel={`移出本次参考图 ${index + 1}`}
                onRemove={() => onImagePromptReferenceRemove(index)}
              />
            </div>
          ))}
        </div>
        <Textarea
          className="storyboard-prompt-textarea h-full min-h-[220px] resize-none border-0 bg-transparent overflow-y-auto text-sm font-bold leading-7 text-[var(--text)] shadow-none transition-colors focus-visible:ring-0"
          value={mode === "image" ? imagePrompt : storyboardDraft}
          onChange={(event) => onPromptDraftChange(event.target.value)}
          placeholder={promptPlaceholder}
        />
        <div className="prompt-composer-footer grid min-h-12 min-w-0 grid-cols-[auto_minmax(0,1fr)_minmax(176px,240px)] items-center gap-2 border-t border-[var(--border)] px-2.5 py-2">
          <div className="prompt-composer-mode-slot shrink-0">
            <ProductCreativeModeSwitch mode={mode} onModeChange={onModeChange} />
          </div>
          <div className="prompt-composer-settings-slot flex min-w-0 flex-nowrap items-center gap-1.5 overflow-visible">
            <div className="active-model-control w-auto min-w-0 max-w-none shrink-0" title={activeModelLabel}>
              <CompactChoiceDropdown
                label={activeModelIcon}
                value={activeModelEffectiveConfigId}
                options={configuredModelOptions(activeModelOptions)}
                formatOption={(option) => localizedModelConfigChoiceLabel(option, activeModelOptions, tVideo)}
                onChange={activeModelConfigChange}
                layout="pill"
                density="micro"
                menuPlacement="top"
                menuWidth="content"
              />
            </div>
            {mode === "video" ? (
              <ProductCreativeSettingsTray
                tVideo={tVideo}
                template={template}
                templateOptions={templateOptions}
                onTemplateChange={onTemplateChange}
                duration={duration}
                durationOptions={durationOptions}
                onDurationChange={onDurationChange}
                selectedVideoResolution={selectedVideoResolution}
                onVideoResolutionChange={onVideoResolutionChange}
                selectedVideoAspectRatio={selectedVideoAspectRatio}
                onVideoAspectRatioChange={onVideoAspectRatioChange}
                finalLanguage={finalLanguage}
                languageOptions={languageOptions}
                onFinalLanguageChange={onFinalLanguageChange}
                versionCount={versionCount}
                versionCountOptions={versionCountOptions}
                onVersionCountChange={onVersionCountChange}
              />
            ) : (
              <>
                {imagePromptPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="h-9 shrink-0 whitespace-nowrap rounded-[8px] border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_72%,transparent)] px-2 text-xs font-black text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    onClick={() => appendImagePromptPreset(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </>
            )}
          </div>
          <div className="prompt-composer-primary-action-slot flex h-10 min-h-10 justify-end overflow-hidden">
            <Button
              className={cn(
                "h-10 min-h-10 w-full min-w-[176px] max-w-[240px] justify-center rounded-[10px] px-3 text-sm",
                primaryActionDisabled && "border-[var(--border-strong)] bg-[var(--panel2)] text-[var(--muted)] shadow-none hover:brightness-100 disabled:opacity-100"
              )}
              variant={primaryActionDisabled ? "default" : "primary"}
              disabled={primaryActionDisabled}
              aria-disabled={primaryActionDisabled}
              title={primaryActionTitle}
              onClick={primaryActionDisabled ? undefined : () => void (mode === "video" ? onGenerateVideo() : onGenerateProductImages())}
            >
              {primaryActionIcon}
              <span className="truncate">{primaryActionLabel}</span>
              <ActionButtonCost tVideo={tVideo} estimate={primaryActionEstimate} status={primaryActionEstimateStatus} />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function VideoHistoryPanel({
  appLocale,
  tVideo,
  jobs,
  product,
  draft,
  importText,
  surface = "section",
  onPreview,
  onDelete,
  onRetryVideoJob,
  onRecoverVideoJobDownload,
  onToast
}: {
  appLocale: AppLocale;
  tVideo: VideoStudioTranslator;
  jobs: CreativeVersionItem[];
  product?: ProductDetail;
  draft: ProductDraft;
  importText: string;
  surface?: ProductCreativeAssetPanelSurface;
  onPreview: (job: CreativeVersionItem) => void;
  onDelete: (job: CreativeVersionItem) => void;
  onRetryVideoJob: (job: VideoJob) => Promise<void>;
  onRecoverVideoJobDownload: (job: VideoJob) => Promise<void>;
  onToast: ConsoleToastFn;
}) {
  const productDownloadContext = videoDownloadProductContext(product, draft, importText);
  const compact = surface === "workbench";

  return (
    <section className={cn(
      "product-creative-asset-panel grid min-w-0 gap-3",
      compact
        ? ""
        : "border-t border-[var(--border)] bg-[var(--card)] p-5"
    )}>
      <div className={cn("flex flex-wrap items-center justify-between gap-2", compact && "hidden")}>
        <div>
          <div className="text-base font-black text-[var(--text)]">{tVideo("history.title")}</div>
          <div className="mt-1 text-xs font-bold text-[var(--muted)]">{tVideo("history.subtitle")}</div>
        </div>
        <Badge>{tVideo("counts.video", { count: jobs.length })}</Badge>
      </div>
      {jobs.length > 0 ? (
        <div className={cn(
          "generation-history-scroll grid max-h-[360px] overflow-y-auto border border-[var(--border)] bg-[var(--field)]",
          compact ? "rounded-[8px]" : "rounded-[14px]"
        )}>
          {jobs.map((job, index) => {
            const activeVersion = isActiveCreativeVersion(job);
            const playableVideo = hasPlayableVideo(job);
            const recoverJob = job.status === "failed" && job.videoJob?.canRecoverDownload ? job.videoJob : undefined;
            const retryJob = job.status === "failed" && !recoverJob ? job.videoJob : undefined;
            const lifecycleLabel = localizedCreativeVersionLifecycleHint(job, tVideo, appLocale);
            const failureReason = creativeVersionFailureReason(job, appLocale);
            const metaParts = creativeVersionMetaParts(job, appLocale);
            return (
              <article key={job.id} className="grid gap-2 border-b border-[var(--border)] px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <strong className="truncate text-sm font-black text-[var(--text)]">{localizedVideoLabel(index, tVideo)}</strong>
                    <Badge tone={activeVersion ? "warn" : playableVideo ? "ok" : "neutral"}>
                      {activeVersion ? <RefreshCcw className="mr-1 h-3 w-3 animate-spin" /> : null}
                      {localizedCreativeVersionDisplayStatus(job, tVideo)}
                    </Badge>
                  </div>
                  <div className="mt-1 truncate text-xs font-semibold text-[var(--muted)]">
                    {[...metaParts, failureReason ? "" : lifecycleLabel].filter(Boolean).join(" · ")}
                  </div>
                  {failureReason ? (
                    <div className="mt-2 flex max-w-[720px] items-start gap-1.5 rounded-[10px] border border-red-100 bg-red-50 px-2.5 py-2 text-xs font-bold leading-5 text-red-700">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{failureReason}</span>
                    </div>
                  ) : null}
                  <VideoHashtagChips tVideo={tVideo} hashtags={job.hashtags} onToast={onToast} />
                </div>
                <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
                  {playableVideo ? (
                    <Button className="w-fit" size="sm" onClick={() => onPreview(job)}>
                      <Play size={13} />
                      {tVideo("history.preview")}
                    </Button>
                  ) : null}
                  {playableVideo && job.finalVideoUrl ? (
                    <Button asChild className="w-fit" size="sm">
                      <a href={job.finalVideoUrl} download={videoDownloadFileName(job, productDownloadContext)}>
                        <Download size={13} />
                        {tVideo("history.download")}
                      </a>
                    </Button>
                  ) : null}
                  {recoverJob ? (
                    <Button className="w-fit" size="sm" onClick={() => void onRecoverVideoJobDownload(recoverJob)}>
                      <Download size={13} />
                      {tVideo("history.redownload")}
                    </Button>
                  ) : retryJob ? (
                    <Button className="w-fit" size="sm" onClick={() => void onRetryVideoJob(retryJob)}>
                      <RefreshCcw size={13} />
                      {tVideo("history.retry")}
                    </Button>
                  ) : null}
                  <Button className="w-fit" size="sm" variant="danger" onClick={() => onDelete(job)}>
                    <X size={13} />
                    {tVideo("history.delete")}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<FileVideo size={28} />} text={tVideo("history.empty")} />
      )}
    </section>
  );
}

function ProductLibraryHome({
  products,
  setEditorMode,
  setDialogMode,
  onCreateVideo,
  onEdit,
  onDeleteProduct
}: {
  products: ProductSummary[];
  setEditorMode: (mode: ProductEditorMode) => void;
  setDialogMode: (mode: ProductLibraryDialogMode) => void;
  onCreateVideo: (product: ProductSummary) => Promise<void>;
  onEdit: (sku: string) => Promise<void>;
  onDeleteProduct: (sku: string) => Promise<void>;
}) {
  const tProductLibrary = makeAppTranslator("productLibrary");
  const tProductStatus = makeAppTranslator("productStatus");
  const openProductDialog = () => {
    setEditorMode("import");
    setDialogMode("import");
  };
  return (
    <section className="product-library-shell grid gap-3">
      <div className="product-library-toolbar flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[24px] font-black leading-tight text-[var(--text)]">{tProductLibrary("title")}</h2>
          <div className="mt-1 text-xs font-semibold text-[var(--muted)]">{tProductLibrary("count", { count: products.length })}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={openProductDialog}>
            <Plus size={13} />
            {tProductLibrary("addProduct")}
          </Button>
        </div>
      </div>

      <section className="product-library-list overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--field)] shadow-[0_14px_36px_rgba(96,64,43,.08)]">
        <div className="grid gap-2 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3 min-[760px]:grid-cols-[minmax(0,1fr)_240px_auto] min-[760px]:items-center">
          <div className="text-xs font-black uppercase tracking-[.16em] text-[var(--muted)]">{tProductLibrary("columns.product")}</div>
          <div className="hidden text-xs font-black uppercase tracking-[.16em] text-[var(--muted)] min-[760px]:block">{tProductLibrary("columns.facts")}</div>
          <div className="hidden text-xs font-black uppercase tracking-[.16em] text-[var(--muted)] min-[760px]:block">{tProductLibrary("columns.enter")}</div>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {products.map((product) => {
            const status = productLibraryStatus(product, tProductStatus);
            return (
              <article
                key={product.path}
                className="grid gap-3 px-4 py-4 text-sm transition hover:bg-[var(--card)] min-[760px]:grid-cols-[minmax(0,1fr)_240px_auto] min-[760px]:items-center"
              >
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-black text-[var(--text)]">{product.title_ja}</div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-xs font-black text-[var(--muted)] min-[760px]:hidden">{tProductLibrary("columns.facts")}</span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                  <span className="truncate text-xs font-semibold text-[var(--muted)]">{status.detail}</span>
                </div>
                <div className="flex flex-wrap gap-2 min-[760px]:justify-end">
                  <Button className="product-library-row-action" size="sm" variant="primary" onClick={() => void onCreateVideo(product)}>
                    <Play size={13} />
                    {tProductLibrary("actions.createVideo")}
                  </Button>
                  <Button size="sm" onClick={() => void onEdit(product.sku)}>
                    <Settings size={13} />
                    {tProductLibrary("actions.edit")}
                  </Button>
                  <Button size="sm" variant="soft" onClick={() => void onDeleteProduct(product.sku)}>
                    <X size={13} />
                    {tProductLibrary("actions.delete")}
                  </Button>
                </div>
              </article>
            );
          })}
          {products.length === 0 ? (
            <div className="p-8">
              <EmptyState icon={<Package size={28} />} text={tProductLibrary("empty")} />
            </div>
          ) : null}
        </div>
      </section>
    </section>
  );
}

function ProductLibraryDialogMount({
  dialogMode,
  draft,
  setDraft,
  editorMode,
  setEditorMode,
  importText,
  setImportText,
  importNotes,
  importQuality,
  setDialogMode,
  onImportSave,
  onSaveDraft
}: {
  dialogMode: ProductLibraryDialogMode;
  draft: ProductDraft;
  setDraft: (draft: ProductDraft) => void;
  editorMode: ProductEditorMode;
  setEditorMode: (mode: ProductEditorMode) => void;
  importText: string;
  setImportText: (text: string) => void;
  importNotes: string[];
  importQuality?: ProductImportQuality;
  setDialogMode: (mode: ProductLibraryDialogMode) => void;
  onImportSave: () => Promise<void>;
  onSaveDraft: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  if (!dialogMode) return null;
  return (
    <ProductLibraryDialog
      mode={dialogMode}
      draft={draft}
      setDraft={setDraft}
      editorMode={editorMode}
      setEditorMode={setEditorMode}
      importText={importText}
      setImportText={setImportText}
      importNotes={importNotes}
      importQuality={importQuality}
      onClose={() => setDialogMode(undefined)}
      onImportSave={onImportSave}
      onSaveDraft={onSaveDraft}
    />
  );
}

function ProductLibraryDialog({
  mode,
  draft,
  setDraft,
  editorMode,
  setEditorMode,
  importText,
  setImportText,
  importNotes,
  importQuality,
  onClose,
  onImportSave,
  onSaveDraft
}: {
  mode: NonNullable<ProductLibraryDialogMode>;
  draft: ProductDraft;
  setDraft: (draft: ProductDraft) => void;
  editorMode: ProductEditorMode;
  setEditorMode: (mode: ProductEditorMode) => void;
  importText: string;
  setImportText: (text: string) => void;
  importNotes: string[];
  importQuality?: ProductImportQuality;
  onClose: () => void;
  onImportSave: () => Promise<void>;
  onSaveDraft: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const tProductLibrary = makeAppTranslator("productLibrary");
  const isEditMode = mode === "edit";
  const activeMode: ProductEditorMode = isEditMode ? "manual" : editorMode || mode;
  const hasDraftFacts = Boolean(draft.sku || draft.title_ja || draft.category || draft.verified_selling_points || draft.reference_images);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(42,33,27,.38)] p-4">
      <section className="max-h-[min(820px,calc(100vh-32px))] w-full max-w-[920px] overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--panel)] shadow-[0_28px_90px_rgba(96,64,43,.22)]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{isEditMode ? tProductLibrary("dialog.editBadge") : activeMode === "import" ? tProductLibrary("dialog.importBadge") : tProductLibrary("dialog.manualBadge")}</Badge>
              {!isEditMode && activeMode === "import" ? <Badge tone="ok">{tProductLibrary("dialog.recommended")}</Badge> : null}
            </div>
            <h3 className="m-0 mt-2 text-[20px] font-black text-[var(--text)]">{isEditMode ? tProductLibrary("dialog.editTitle") : tProductLibrary("dialog.addTitle")}</h3>
          </div>
          <Button size="icon" variant="ghost" aria-label={tProductLibrary("dialog.close")} onClick={onClose}>
            <X size={14} />
          </Button>
        </div>
        <div className="max-h-[calc(100vh-160px)] overflow-auto p-5">
          {!isEditMode ? (
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <ProductEntryModeButton
                active={activeMode === "import"}
                badge={tProductLibrary("dialog.importBadge")}
                description={tProductLibrary("dialog.importDescription")}
                icon={<Sparkles size={16} />}
                title={tProductLibrary("dialog.importTitle")}
                onClick={() => setEditorMode("import")}
              />
              <ProductEntryModeButton
                active={activeMode === "manual"}
                badge={tProductLibrary("dialog.manualBadge")}
                description={tProductLibrary("dialog.manualDescription")}
                icon={<Plus size={16} />}
                title={tProductLibrary("dialog.manualTitle")}
                onClick={() => setEditorMode("manual")}
              />
            </div>
          ) : null}

          {!isEditMode && activeMode === "import" ? (
            <form
              className="grid gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--card)] p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void onImportSave();
              }}
            >
              <Field label={tProductLibrary("dialog.pasteLabel")}>
                <Textarea
                  rows={8}
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder={tProductLibrary("dialog.pastePlaceholder")}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" type="submit">
                  <Package size={13} />
                  {tProductLibrary("dialog.aiSave")}
                </Button>
              </div>
              {hasDraftFacts || importNotes.length > 0 ? (
                <ProductImportResultPreview
                  draft={draft}
                  notes={importNotes}
                  quality={importQuality}
                  onEditManually={() => setEditorMode("manual")}
                />
              ) : null}
            </form>
          ) : (
            <div className="grid gap-4">
              <ProductDraftForm
                draft={draft}
                setDraft={setDraft}
                onSaveDraft={onSaveDraft}
                submitLabel={isEditMode ? tProductLibrary("dialog.saveChanges") : tProductLibrary("dialog.saveProduct")}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DeleteCreativeVersionDialog({
  appLocale,
  tVideo,
  job,
  index,
  onClose,
  onConfirm
}: {
  appLocale: AppLocale;
  tVideo: VideoStudioTranslator;
  job?: CreativeVersionItem;
  index: number;
  onClose: () => void;
  onConfirm: (job: CreativeVersionItem) => Promise<void>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!job) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isDeleting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDeleting, job, onClose]);

  if (!job) return null;

  const activeVersion = isActiveCreativeVersion(job);

  async function confirmDelete() {
    if (!job) return;
    setIsDeleting(true);
    try {
      await onConfirm(job);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-[rgba(23,32,51,.42)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label={activeVersion ? tVideo("deleteDialog.cancelAndDeleteLabel") : tVideo("deleteDialog.deleteLabel")}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isDeleting) {
          onClose();
        }
      }}
    >
      <section className="grid w-full max-w-[460px] gap-4 rounded-[18px] border border-red-100 bg-[var(--panel)] p-5 shadow-[0_28px_90px_rgba(96,64,43,.22)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-black text-[var(--text)]">
              {activeVersion ? tVideo("deleteDialog.cancelTitle") : tVideo("deleteDialog.deleteTitle")}
            </div>
            <div className="mt-1 text-xs font-semibold leading-5 text-[var(--muted)]">
              {activeVersion
                ? tVideo("deleteDialog.cancelDescription")
                : job.source === "ledger"
                  ? tVideo("deleteDialog.ledgerDescription")
                  : tVideo("deleteDialog.historyDescription")}
            </div>
          </div>
          <Button className="w-fit" size="icon" variant="ghost" disabled={isDeleting} onClick={onClose}>
            <X size={15} />
          </Button>
        </div>
        <div className="rounded-[14px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-bold leading-5 text-[var(--muted)]">
          <div className="font-black text-[var(--text)]">{localizedVideoLabel(index, tVideo)}</div>
          <div>{creativeVersionMetaParts(job, appLocale).join(" · ")}</div>
        </div>
        <div className="flex justify-end gap-2">
          <Button className="w-fit" variant="ghost" disabled={isDeleting} onClick={onClose}>
            {tVideo("actions.cancel")}
          </Button>
          <Button className="w-fit" variant="danger" disabled={isDeleting} onClick={() => void confirmDelete()}>
            <X size={13} />
            {isDeleting ? tVideo("actions.deleting") : activeVersion ? tVideo("deleteDialog.confirmCancelDelete") : tVideo("deleteDialog.confirmDelete")}
          </Button>
        </div>
      </section>
    </div>
  );
}

function VideoPreviewDialog({
  appLocale,
  tVideo,
  job,
  product,
  draft,
  importText,
  index,
  onClose,
  onRequestDelete,
  onRetryVideoJob,
  onRecoverVideoJobDownload,
  onToast
}: {
  appLocale: AppLocale;
  tVideo: VideoStudioTranslator;
  job?: CreativeVersionItem;
  product?: ProductDetail;
  draft: ProductDraft;
  importText: string;
  index: number;
  onClose: () => void;
  onRequestDelete: (job: CreativeVersionItem) => void;
  onRetryVideoJob: (job: VideoJob) => Promise<void>;
  onRecoverVideoJobDownload: (job: VideoJob) => Promise<void>;
  onToast: ConsoleToastFn;
}) {
  useEffect(() => {
    if (!job) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [job, onClose]);

  if (!job) return null;

  const activeVersion = isActiveCreativeVersion(job);
  const playableVideo = hasPlayableVideo(job);
  const recoverJob = job.status === "failed" && job.videoJob?.canRecoverDownload ? job.videoJob : undefined;
  const retryJob = job.status === "failed" && !recoverJob ? job.videoJob : undefined;
  const previewTitle = localizedVideoLabel(index, tVideo);
  const statusText = localizedCreativeVersionDisplayStatus(job, tVideo);
  const failureReason = creativeVersionFailureReason(job, appLocale);
  const downloadFileName = videoDownloadFileName(job, videoDownloadProductContext(product, draft, importText));

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(23,32,51,.42)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label={tVideo("previewDialog.ariaLabel", { title: previewTitle })}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="grid max-h-[min(760px,calc(100vh-32px))] w-full max-w-[880px] overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--panel)] shadow-[0_28px_90px_rgba(96,64,43,.22)]">
        <div className="flex min-w-0 items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="m-0 truncate text-base font-black text-[var(--text)]">{previewTitle}</h3>
              <Badge tone={activeVersion ? "warn" : playableVideo ? "ok" : "neutral"}>
                {activeVersion ? <RefreshCcw className="mr-1 h-3 w-3 animate-spin" /> : null}
                {statusText}
              </Badge>
            </div>
            <div className="mt-1 truncate text-xs font-semibold text-[var(--muted)]">
              {creativeVersionMetaParts(job, appLocale).join(" · ")}
            </div>
            <VideoHashtagChips tVideo={tVideo} hashtags={job.hashtags} onToast={onToast} />
          </div>
          <Button className="w-fit" size="sm" variant="ghost" onClick={onClose}>
            <X size={15} />
          </Button>
        </div>

        <div className="grid gap-3 overflow-auto p-4">
          {playableVideo && job.finalVideoUrl ? (
            <div className="overflow-hidden rounded-[14px] border border-[var(--border)] bg-[#0f172a]">
              <video
                className="aspect-video h-full w-full bg-[#0f172a] object-contain"
                controls
                playsInline
                preload="metadata"
                src={job.finalVideoUrl}
              />
            </div>
          ) : (
            <div className="grid aspect-video place-items-center rounded-[14px] border border-dashed border-[var(--border-strong)] bg-[var(--card)] p-6 text-center">
              <div className="grid justify-items-center gap-2">
                {activeVersion ? (
                  <RefreshCcw className="h-7 w-7 animate-spin text-[var(--accent)]" />
                ) : job.status === "failed" ? (
                  <AlertTriangle className="h-7 w-7 text-[var(--danger)]" />
                ) : (
                  <FileVideo className="h-7 w-7 text-[var(--muted)]" />
                )}
                <div className="text-sm font-black text-[var(--text)]">
                  {activeVersion ? tVideo("previewDialog.generatingTitle") : recoverJob ? tVideo("previewDialog.downloadFailedTitle") : job.status === "failed" ? tVideo("previewDialog.failedTitle") : tVideo("previewDialog.noVideoTitle")}
                </div>
                <div className="max-w-[520px] text-xs font-semibold leading-5 text-[var(--muted)]">
                  {activeVersion
                    ? tVideo("previewDialog.generatingDescription")
                    : failureReason || tVideo("previewDialog.noVideoDescription")}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            {recoverJob ? (
              <Button className="w-fit" size="sm" onClick={() => void onRecoverVideoJobDownload(recoverJob)}>
                <Download size={13} />
                {tVideo("history.redownload")}
              </Button>
            ) : retryJob ? (
              <Button className="w-fit" size="sm" onClick={() => void onRetryVideoJob(retryJob)}>
                <RefreshCcw size={13} />
                {tVideo("history.retry")}
              </Button>
            ) : null}
            {job.finalVideoUrl ? (
              <Button asChild className="w-fit" size="sm">
                <a href={job.finalVideoUrl} download={downloadFileName}>
                  <Download size={13} />
                  {tVideo("history.download")}
                </a>
              </Button>
            ) : null}
            <Button
              className="w-fit"
              size="sm"
              variant="danger"
              title={activeVersion ? tVideo("deleteDialog.cancelAndDeleteLabel") : tVideo("deleteDialog.deleteLabel")}
              onClick={() => onRequestDelete(job)}
            >
              <X size={13} />
              {tVideo("history.delete")}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function VideoHashtagChips({ tVideo, hashtags, onToast }: { tVideo: VideoStudioTranslator; hashtags?: string[]; onToast: ConsoleToastFn }) {
  const cleaned = normalizeDisplayHashtags(hashtags);
  if (cleaned.length === 0) {
    return null;
  }
  return (
    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
      {cleaned.slice(0, 8).map((tag) => (
        <span key={tag} className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-[11px] font-black text-[var(--text)]">
          {tag}
        </span>
      ))}
      <Button className="h-7 w-fit px-2 text-[11px]" size="sm" variant="soft" onClick={() => void copyHashtags(cleaned, onToast, tVideo)}>
        <Copy size={12} />
        {tVideo("history.copyTags")}
      </Button>
    </div>
  );
}

function ProductFileImportDialog({
  locale,
  open,
  onClose,
  onPreviewFile,
  onFillCurrentProduct,
  onCommitRows,
  onToast
}: {
  locale: AppLocale;
  open: boolean;
  onClose: () => void;
  onPreviewFile: (file: File) => Promise<ProductFileImportPreviewResponse>;
  onFillCurrentProduct: (row: ProductFileImportRow) => Promise<void>;
  onCommitRows: (rows: ProductFileImportRow[], rowIds: string[]) => Promise<void>;
  onToast: ConsoleToastFn;
}) {
  const tFileImport = makeAppTranslator("fileImport");
  const [preview, setPreview] = useState<ProductFileImportPreviewResponse | undefined>();
  const [checkedRowIds, setCheckedRowIds] = useState<string[]>([]);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    if (!open) {
      setPreview(undefined);
      setCheckedRowIds([]);
      setIsWorking(false);
    }
  }, [open]);

  if (!open) return null;

  const rows = preview?.rows ?? [];
  const selectableRows = rows.filter((row) => fileImportCanSelect(row));
  const batchIds = checkedRowIds.filter((rowId) => selectableRows.some((row) => row.rowId === rowId));
  const allSelectableChecked = selectableRows.length > 0 && selectableRows.every((row) => batchIds.includes(row.rowId));
  const someSelectableChecked = batchIds.length > 0 && !allSelectableChecked;
  const selectedRows = selectableRows.filter((row) => batchIds.includes(row.rowId));
  const selectedSingleRow = selectedRows.length === 1 ? selectedRows[0] : undefined;
  const title = tFileImport("title");
  const diagnostics = preview?.diagnostics;
  const previewBadgeLabel = preview
    ? preview.summary.total > 0
      ? tFileImport("productCount", { count: preview.summary.total })
      : diagnostics?.scannedRows
        ? tFileImport("detailRows", { count: diagnostics.scannedRows })
        : tFileImport("emptyProductCount")
    : "";
  const previewBadgeTone = preview && preview.summary.total === 0 ? "warn" : "ok";
  const previewSummaryText = preview
    ? preview.summary.total > 0
      ? tFileImport("summaryWithProducts", { count: preview.summary.total })
      : diagnostics?.scannedRows
        ? tFileImport("summaryRowsOnly", { count: diagnostics.scannedRows })
        : tFileImport("summaryEmpty")
    : "";

  async function handleFileChange(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!isProductImportFile(file)) {
      onToast(tFileImport("unsupportedFile"));
      return;
    }
    setIsWorking(true);
    try {
      const nextPreview = await onPreviewFile(file);
      setPreview(nextPreview);
      const firstSelectable = nextPreview.rows.find((row) => fileImportCanSelect(row));
      setCheckedRowIds(firstSelectable ? [firstSelectable.rowId] : []);
    } catch (error) {
      onToast(errorMessage(error));
    } finally {
      setIsWorking(false);
    }
  }

  async function importSelectedRows() {
    if (!preview || batchIds.length === 0) return;
    setIsWorking(true);
    try {
      if (selectedSingleRow) {
        await onFillCurrentProduct(selectedSingleRow);
      } else {
        await onCommitRows(preview.rows, batchIds);
      }
    } finally {
      setIsWorking(false);
    }
  }

  function toggleRow(rowId: string) {
    setCheckedRowIds((current) => current.includes(rowId)
      ? current.filter((item) => item !== rowId)
      : [...current, rowId]);
  }

  function toggleAllRows() {
    setCheckedRowIds(allSelectableChecked ? [] : selectableRows.map((row) => row.rowId));
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-[rgba(23,32,51,.42)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isWorking) {
          onClose();
        }
      }}
    >
      <section className="grid max-h-[min(780px,calc(100vh-32px))] w-full max-w-[960px] overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--panel)] shadow-[0_28px_90px_rgba(96,64,43,.22)]">
        <div className="flex min-w-0 items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{batchIds.length > 1 ? tFileImport("selectedCount", { count: batchIds.length }) : tFileImport("defaultOne")}</Badge>
              {preview ? <Badge tone={previewBadgeTone}>{previewBadgeLabel}</Badge> : null}
            </div>
            <h3 className="m-0 mt-2 text-[20px] font-black text-[var(--text)]">{title}</h3>
          </div>
          <Button size="icon" variant="ghost" aria-label={tAppGlobal("productLibrary.dialog.close")} disabled={isWorking} onClick={onClose}>
            <X size={14} />
          </Button>
        </div>

        <div className="grid gap-4 overflow-auto p-5">
          <label className="grid cursor-pointer gap-2 rounded-[14px] border border-dashed border-[color-mix(in_srgb,var(--accent)_42%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_5%,var(--field))] p-4 text-center transition hover:bg-[color-mix(in_srgb,var(--accent)_8%,var(--field))]">
            <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-[var(--field)] text-[var(--accent)] shadow-[0_10px_22px_rgba(96,64,43,.08)]">
              <FileSpreadsheet size={18} />
            </span>
            <span className="text-sm font-black text-[var(--text)]">{tFileImport("chooseFile")}</span>
            <span className="text-xs font-semibold leading-5 text-[var(--muted)]">
              {tFileImport("chooseFileHint")}
            </span>
            <input
              className="sr-only"
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={isWorking}
              onChange={(event) => void handleFileChange(event.target.files)}
            />
          </label>

          {preview ? (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-bold text-[var(--muted)]">
                <span>{previewSummaryText}</span>
                <span>{tFileImport("summaryStats", { ready: preview.summary.ready, needsAi: preview.summary.needsAi, duplicate: preview.summary.duplicateSku, failed: preview.summary.failed })}</span>
              </div>
              {rows.length > 0 ? (
                <div className="max-h-[360px] overflow-auto rounded-xl border border-[var(--border)]">
                  <table className="w-full min-w-[820px] border-collapse text-left text-xs">
                    <thead className="sticky top-0 bg-[var(--field)] shadow-[0_1px_0_var(--border)]">
                      <tr className="text-[var(--muted)]">
                        <th className="w-14 whitespace-nowrap px-3 py-2 font-black">
                          <input
                            type="checkbox"
                            aria-label={tFileImport("selectAll")}
                            checked={allSelectableChecked}
                            ref={(input) => {
                              if (input) input.indeterminate = someSelectableChecked;
                            }}
                            disabled={isWorking || selectableRows.length === 0}
                            onChange={toggleAllRows}
                          />
                        </th>
                        <th className="whitespace-nowrap px-3 py-2 font-black">{tFileImport("table.status")}</th>
                        <th className="whitespace-nowrap px-3 py-2 font-black">{tFileImport("table.productId")}</th>
                        <th className="whitespace-nowrap px-3 py-2 font-black">{tFileImport("table.productTitle")}</th>
                        <th className="whitespace-nowrap px-3 py-2 font-black">{tFileImport("table.sourceRows")}</th>
                        <th className="whitespace-nowrap px-3 py-2 font-black">{tFileImport("table.images")}</th>
                        <th className="whitespace-nowrap px-3 py-2 font-black">{tFileImport("table.quality")}</th>
                        <th className="whitespace-nowrap px-3 py-2 font-black">{tFileImport("table.missing")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {rows.map((row) => {
                        const disabled = !fileImportCanSelect(row);
                        const active = checkedRowIds.includes(row.rowId);
                        return (
                          <tr key={row.rowId} className={cn(active ? "bg-[color-mix(in_srgb,var(--accent)_8%,var(--field))]" : "bg-[var(--field)]", disabled && "opacity-60")}>
                            <td className="whitespace-nowrap px-3 py-2">
                              <input
                                type="checkbox"
                                checked={checkedRowIds.includes(row.rowId)}
                                disabled={disabled}
                                onChange={() => toggleRow(row.rowId)}
                              />
                            </td>
                            <td className="whitespace-nowrap px-3 py-2"><Badge tone={fileImportRowTone(row.status)}>{fileImportRowLabel(row.status, locale)}</Badge></td>
                            <td className="max-w-[150px] truncate whitespace-nowrap px-3 py-2 font-black text-[var(--text)]">{fileImportProductIdLabel(row)}</td>
                            <td className="max-w-[300px] truncate whitespace-nowrap px-3 py-2 font-semibold text-[var(--text)]" title={row.product?.title_ja ?? row.error ?? ""}>{row.product?.title_ja ?? row.error ?? "-"}</td>
                            <td className="max-w-[130px] truncate whitespace-nowrap px-3 py-2 font-bold text-[var(--muted)]">{fileImportSourceRowsLabel(row, locale)}</td>
                            <td className="whitespace-nowrap px-3 py-2 font-bold text-[var(--muted)]">{tFileImport("imageCount", { count: row.referenceImageCount })}</td>
                            <td className="whitespace-nowrap px-3 py-2 font-bold text-[var(--muted)]">{row.quality.score}/100</td>
                            <td className="max-w-[240px] truncate whitespace-nowrap px-3 py-2 font-semibold text-[var(--muted)]" title={row.quality.missingFields.join("、")}>{row.quality.missingFields.join("、") || "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid gap-2 rounded-xl border border-[#f3d7a4] bg-[#fffaf0] px-4 py-3 text-sm font-semibold leading-6 text-[#80611d]">
                  <div>
                    {diagnostics?.message ?? tFileImport("emptyMessage")}
                  </div>
                  {diagnostics?.headers.length ? (
                    <div className="text-xs leading-5 text-[#9a7420]">
                      {tFileImport("headersRead", { headers: diagnostics.headers.slice(0, 8).join("、"), suffix: diagnostics.headers.length > 8 ? tFileImport("ellipsis") : "" })}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] bg-[var(--panel)] px-5 py-4">
          <Button className="w-fit" variant="ghost" disabled={isWorking} onClick={onClose}>
            {tAppGlobal("commonActions.cancel")}
          </Button>
          <Button className="w-fit" variant="primary" disabled={isWorking || batchIds.length === 0} onClick={() => void importSelectedRows()}>
            <FileSpreadsheet size={13} />
            {batchIds.length > 1 ? tFileImport("importSelected", { count: batchIds.length }) : tFileImport("fillCurrent")}
          </Button>
        </div>
      </section>
    </div>
  );
}

function FactList({ title, items }: { title: string; items: string[] }) {
  const tProductLibrary = makeAppTranslator("productLibrary");
  return (
    <div>
      <div className="font-black text-[var(--text)]">{title}</div>
      {items.length > 0 ? (
        <ul className="m-0 mt-1 grid gap-1 pl-4">
          {items.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <div className="mt-1 text-[var(--muted)]">{tProductLibrary("emptyFact")}</div>
      )}
    </div>
  );
}

function ReferenceImageThumbnail({
  image,
  title,
  alt,
  selected = false,
  className,
  onSelect,
  onPreview
}: {
  image: ReferenceImageStatus;
  title: string;
  alt: string;
  selected?: boolean;
  className?: string;
  onSelect: () => void;
  onPreview: () => void;
}) {
  const canOpen = Boolean(image.previewUrl);
  const singleClickTimerRef = useRef<number | undefined>(undefined);

  function handleClick() {
    if (!canOpen) return;
    if (singleClickTimerRef.current !== undefined) {
      window.clearTimeout(singleClickTimerRef.current);
    }
    singleClickTimerRef.current = window.setTimeout(onSelect, 180);
  }

  function handleDoubleClick() {
    if (!canOpen) return;
    if (singleClickTimerRef.current !== undefined) {
      window.clearTimeout(singleClickTimerRef.current);
      singleClickTimerRef.current = undefined;
    }
    onPreview();
  }

  return (
    <div className={cn("image-reference-thumbnail image-prompt-reference-item relative h-[70px] w-[70px] shrink-0", className)}>
      <button
        type="button"
        className={cn(
          "image-prompt-reference-thumb grid h-full w-full place-items-center overflow-hidden rounded-[8px] border bg-[var(--field)] transition hover:border-[var(--accent)]",
          selected
            ? "border-[var(--accent)] shadow-[0_0_0_2px_rgba(10,163,148,.16)]"
            : "border-[var(--border)]",
          !canOpen && "cursor-default hover:border-[var(--border)]"
        )}
        title={title}
        aria-label={title}
        aria-pressed={selected}
        disabled={!canOpen}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {image.previewUrl ? (
          <img className="h-full w-full object-cover transition hover:scale-[1.03]" src={image.previewUrl} alt={alt} />
        ) : (
          <ImageIcon size={18} className="text-[var(--muted)]" />
        )}
      </button>
    </div>
  );
}

function ReferenceImageRemoveButton({
  className,
  title,
  ariaLabel,
  onRemove
}: {
  className?: string;
  title: string;
  ariaLabel: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "image-prompt-reference-remove absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-[color-mix(in_srgb,var(--card)_88%,transparent)] text-[var(--muted)] shadow-[0_4px_12px_rgba(96,64,43,.16)] transition hover:bg-red-50 hover:text-[var(--danger)]",
        className
      )}
      title={title}
      aria-label={ariaLabel}
      onClick={(event) => {
        event.stopPropagation();
        onRemove();
      }}
    >
      <X size={11} strokeWidth={2.4} />
    </button>
  );
}

function ReferenceImageFigure({
  tVideo,
  image,
  sku,
  index,
  onSelect,
  onPreview,
  onDelete,
  dragging,
  dragOver,
  onReorder,
  onDragStateChange
}: {
  tVideo: VideoStudioTranslator;
  image: ReferenceImageStatus;
  sku: string;
  index: number;
  onSelect: () => void;
  onPreview: () => void;
  onDelete: (index: number) => void;
  dragging: boolean;
  dragOver: boolean;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDragStateChange: (dragIndex?: number | null, overIndex?: number | null) => void;
}) {
  return (
    <figure
      className={cn(
        "group relative m-0 grid h-[74px] w-[176px] shrink-0 cursor-grab grid-cols-[64px_minmax(0,1fr)_28px] items-center gap-2 overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--field)] p-1.5 transition hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] active:cursor-grabbing",
        dragging && "opacity-55",
        dragOver && "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--field))] shadow-[0_0_0_3px_rgba(10,163,148,.12)]"
      )}
      draggable={true}
      title={tVideo("reference.reorderTitle")}
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(index));
        onDragStateChange(index, null);
      }}
      onDragOver={(event) => {
        event.stopPropagation();
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onDragStateChange(undefined, index);
      }}
      onDrop={(event) => {
        event.stopPropagation();
        event.preventDefault();
        const fromIndex = Number(event.dataTransfer.getData("text/plain"));
        if (Number.isInteger(fromIndex) && fromIndex >= 0) {
          onReorder(fromIndex, index);
        }
        onDragStateChange(null, null);
      }}
      onDragEnd={() => onDragStateChange(null, null)}
    >
      <ReferenceImageThumbnail
        image={image}
        title={image.previewUrl ? tVideo("reference.preview") : referenceStatusLabel(image.status, tVideo)}
        alt={`${sku} reference ${index + 1}`}
        className="h-[60px] w-[64px]"
        onSelect={onSelect}
        onPreview={onPreview}
      />
      <figcaption className="min-w-0">
        <div className="truncate text-xs font-black text-[var(--text)]">{tVideo("reference.item", { index: index + 1 })}</div>
        <div className="truncate text-[11px] font-semibold text-[var(--muted)]">{image.original}</div>
      </figcaption>
      <ReferenceImageRemoveButton
        className="right-2 top-1/2 -translate-y-1/2"
        title={tVideo("reference.delete")}
        ariaLabel={`${tVideo("reference.delete")} ${tVideo("reference.item", { index: index + 1 })}`}
        onRemove={() => onDelete(index)}
      />
    </figure>
  );
}

function ReferenceImagePreviewDialog({
  tVideo,
  images,
  index,
  onIndexChange,
  onClose
}: {
  tVideo: VideoStudioTranslator;
  images: ReferenceImageStatus[];
  index?: number;
  onIndexChange: (index: number | undefined) => void;
  onClose: () => void;
}) {
  const touchStartXRef = useRef<number | undefined>(undefined);
  const previewableImages = images;
  const activeIndex = index ?? -1;
  const image = activeIndex >= 0 ? previewableImages[activeIndex] : undefined;
  const canNavigate = previewableImages.length > 1;
  const onPrevious = () => {
    if (!canNavigate) return;
    onIndexChange((activeIndex - 1 + previewableImages.length) % previewableImages.length);
  };
  const onNext = () => {
    if (!canNavigate) return;
    onIndexChange((activeIndex + 1) % previewableImages.length);
  };

  useEffect(() => {
    if (!image?.previewUrl) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
      if (event.key === "ArrowLeft") {
        onPrevious();
      }
      if (event.key === "ArrowRight") {
        onNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [image?.previewUrl, activeIndex, canNavigate, onClose]);

  if (!image?.previewUrl) return null;
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-[rgba(23,32,51,.42)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label={tVideo("reference.previewDialogTitle")}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="grid max-h-[min(760px,calc(100vh-32px))] w-full max-w-[760px] overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--panel)] shadow-[0_28px_90px_rgba(96,64,43,.22)]">
        <div className="flex min-w-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-black text-[var(--text)]">{tVideo("reference.previewDialogTitle")}</div>
            <div className="truncate text-xs font-semibold text-[var(--muted)]">
              {image.original}
              {canNavigate ? ` · ${activeIndex + 1}/${previewableImages.length}` : ""}
            </div>
          </div>
          <Button className="w-fit" size="sm" variant="ghost" onClick={onClose}>
            <X size={15} />
          </Button>
        </div>
        <div
          className="relative grid place-items-center bg-[#0f172a] p-3"
          onTouchStart={(event) => {
            touchStartXRef.current = event.touches[0]?.clientX;
          }}
          onTouchEnd={(event) => {
            const startX = touchStartXRef.current;
            touchStartXRef.current = undefined;
            if (startX === undefined) return;
            const endX = event.changedTouches[0]?.clientX ?? startX;
            const deltaX = endX - startX;
            if (Math.abs(deltaX) < 42) return;
            if (deltaX > 0) {
              onPrevious();
            } else {
              onNext();
            }
          }}
        >
          {canNavigate ? (
            <>
              <Button
                className="absolute left-4 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full bg-[var(--field)]/92 p-0 shadow-[0_12px_28px_rgba(15,23,42,.24)]"
                size="icon"
                title={tVideo("reference.previous")}
                onClick={onPrevious}
              >
                <ChevronLeft size={18} />
              </Button>
              <Button
                className="absolute right-4 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full bg-[var(--field)]/92 p-0 shadow-[0_12px_28px_rgba(15,23,42,.24)]"
                size="icon"
                title={tVideo("reference.next")}
                onClick={onNext}
              >
                <ChevronRight size={18} />
              </Button>
            </>
          ) : null}
          <img className="max-h-[640px] max-w-full object-contain" src={image.previewUrl} alt={image.original} />
        </div>
      </section>
    </div>
  );
}

function ProductEntryModeButton({
  active,
  badge,
  description,
  icon,
  title,
  onClick
}: {
  active: boolean;
  badge: string;
  description: string;
  icon: ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "grid gap-2 rounded-lg border bg-[var(--field)] p-3 text-left transition",
        active
          ? "border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] shadow-[0_14px_30px_rgba(10,163,148,.12)]"
          : "border-[var(--border)] hover:border-[var(--accent)] hover:shadow-[0_10px_22px_rgba(15,23,42,.06)]"
      )}
      onClick={onClick}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-2 text-[14px] font-black text-[var(--text)]">
          <span className={cn("grid h-8 w-8 place-items-center rounded-lg", active ? "bg-[var(--accent)] text-white" : "bg-[var(--panel2)] text-[var(--accent)]")}>
            {icon}
          </span>
          <span className="truncate">{title}</span>
        </span>
        <Badge tone={active ? "ok" : "neutral"}>{badge}</Badge>
      </span>
      <span className="text-xs font-semibold leading-5 text-[var(--muted)]">{description}</span>
    </button>
  );
}

function ProductImportResultPreview({
  draft,
  notes,
  quality,
  onEditManually
}: {
  draft: ProductDraft;
  notes: string[];
  quality?: ProductImportQuality;
  onEditManually: () => void;
}) {
  const tProductLibrary = makeAppTranslator("productLibrary");
  const sellingPoints = splitLines(draft.verified_selling_points);
  const usageScenes = splitLines(draft.usage_scenes);
  const forbiddenClaims = splitLines(draft.forbidden_claims);
  const references = splitLines(draft.reference_images);
  return (
    <div className="grid gap-3 rounded-lg border border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[var(--field)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-black">{tProductLibrary("importPreview.title")}</div>
          <div className="mt-1 text-xs font-semibold text-[var(--muted)]">
            {tProductLibrary("importPreview.subtitle")}
          </div>
        </div>
        <Button className="w-fit" size="sm" onClick={onEditManually}>
          <Settings size={14} />
          {tProductLibrary("importPreview.manualEdit")}
        </Button>
      </div>
      <div className="grid gap-2 lg:grid-cols-3">
        <ProductImportFact label={tProductLibrary("importPreview.titleJa")} value={draft.title_ja || "-"} />
        <ProductImportFact label={tProductLibrary("importPreview.category")} value={draft.category || "-"} />
        <ProductImportFact label={tProductLibrary("importPreview.materials")} value={draft.materials || "-"} />
        <ProductImportFact label={tProductLibrary("importPreview.dimensions")} value={draft.dimensions || "-"} />
        <ProductImportFact label={tProductLibrary("importPreview.references")} value={tProductLibrary("importPreview.items", { count: references.length })} />
      </div>
      {quality ? <ProductImportQualityPanel quality={quality} /> : null}
      <div className="grid gap-2 lg:grid-cols-3">
        <ProductImportList title={tProductLibrary("importPreview.sellingPoints")} items={sellingPoints} />
        <ProductImportList title={tProductLibrary("importPreview.usageScenes")} items={usageScenes} />
        <ProductImportList title={tProductLibrary("importPreview.forbiddenClaims")} items={forbiddenClaims} />
      </div>
      {notes.length > 0 ? (
        <div className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
          <div className="font-black">{tProductLibrary("importPreview.notes")}</div>
          <ul className="m-0 grid gap-1 pl-4">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ProductImportQualityPanel({ quality }: { quality: ProductImportQuality }) {
  const tProductLibrary = makeAppTranslator("productLibrary");
  return (
    <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-black text-[var(--text)]">{tProductLibrary("importPreview.qualityTitle")}</div>
          <div className="mt-1 text-xs font-semibold text-[var(--muted)]">{quality.summary}</div>
        </div>
        <Badge tone={quality.ready ? "ok" : "warn"}>{quality.score}/100</Badge>
      </div>
      <div className="grid gap-2 lg:grid-cols-3">
        <ProductImportList title={tProductLibrary("importPreview.verifiedFacts")} items={quality.verifiedFacts} />
        <ProductImportList title={tProductLibrary("importPreview.missingFields")} items={quality.missingFields} />
        <ProductImportList title={tProductLibrary("importPreview.forbiddenClaims")} items={quality.blockedClaims} />
      </div>
      {quality.warnings.length > 0 ? (
        <div className="grid gap-1 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold leading-5 text-amber-800">
          {quality.warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProductImportFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-2">
      <div className="text-[11px] font-black text-[var(--muted)]">{label}</div>
      <div className="mt-1 truncate text-xs font-black text-[var(--text)]" title={value}>{value}</div>
    </div>
  );
}

function ProductImportList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-2">
      <div className="text-[11px] font-black text-[var(--muted)]">{title}</div>
      <ul className="mt-2 grid max-h-[108px] gap-1 overflow-auto pl-4 text-xs font-semibold leading-5 text-[var(--text)]">
        {(items.length > 0 ? items : ["-"]).map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ProductDraftForm({
  draft,
  setDraft,
  onSaveDraft,
  submitLabel
}: {
  draft: ProductDraft;
  setDraft: (draft: ProductDraft) => void;
  onSaveDraft: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  submitLabel?: string;
}) {
  const tProductLibrary = makeAppTranslator("productLibrary");
  const effectiveSubmitLabel = submitLabel ?? tProductLibrary("dialog.saveProduct");
  return (
    <form className="grid gap-5" onSubmit={onSaveDraft}>
      <ProductDraftSection
        title={tProductLibrary("draft.basicTitle")}
        description={tProductLibrary("draft.basicDescription")}
        icon={<Package size={15} />}
      >
        <div className="grid gap-3">
          <Field label={tProductLibrary("draft.titleJa")}>
            <Input value={draft.title_ja} onChange={(event) => setDraft({ ...draft, title_ja: event.target.value })} placeholder="ラウンドファスナー ミニ財布" />
          </Field>
          <div className="grid gap-3 lg:grid-cols-3">
            <Field label={tProductLibrary("draft.category")}>
              <Input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="財布" />
            </Field>
            <Field label={tProductLibrary("draft.materials")}>
              <Input value={draft.materials} onChange={(event) => setDraft({ ...draft, materials: event.target.value })} placeholder="レザー調素材、PU" />
            </Field>
            <Field label={tProductLibrary("draft.dimensions")}>
              <Input value={draft.dimensions} onChange={(event) => setDraft({ ...draft, dimensions: event.target.value })} placeholder="ミニサイズ" />
            </Field>
          </div>
        </div>
      </ProductDraftSection>

      <ProductDraftSection
        title={tProductLibrary("draft.factsTitle")}
        description={tProductLibrary("draft.factsDescription")}
        icon={<CheckCircle2 size={15} />}
      >
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,.9fr)]">
          <div className="grid gap-3">
            <ProductDraftTextareaGroup
              label={tProductLibrary("draft.sellingPoints")}
              value={draft.verified_selling_points}
              rows={6}
              onChange={(value) => setDraft({ ...draft, verified_selling_points: value })}
              placeholder={"カードを整理しやすい\n小銭入れ付き"}
            />
            <ProductDraftTextareaGroup
              label={tProductLibrary("draft.usageScenes")}
              value={draft.usage_scenes}
              rows={4}
              onChange={(value) => setDraft({ ...draft, usage_scenes: value })}
              placeholder={"買い物\n通勤\n旅行"}
            />
          </div>
          <ProductDraftTextareaGroup
            tone="risk"
            label={tProductLibrary("draft.forbiddenClaims")}
            value={draft.forbidden_claims}
            rows={11}
            onChange={(value) => setDraft({ ...draft, forbidden_claims: value })}
            placeholder={"本革未確認\n防水未確認\n日本で大人気は未確認"}
          />
        </div>
      </ProductDraftSection>

      <ProductDraftReferencePaths
        value={draft.reference_images}
        onChange={(value) => setDraft({ ...draft, reference_images: value })}
      />

      <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex justify-end border-t border-[var(--border)] bg-[var(--panel)]/95 px-4 py-3 backdrop-blur">
        <Button className="w-fit" size="sm" variant="primary" type="submit">
          <Plus size={14} />
        {effectiveSubmitLabel}
      </Button>
      </div>
    </form>
  );
}

function ProductDraftSection({
  title,
  description,
  icon,
  children
}: {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3 border-b border-[var(--border)] pb-5 last:border-b-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_10%,var(--field))] text-[var(--accent)]">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-black text-[var(--text)]">{title}</div>
          <div className="mt-1 text-xs font-semibold leading-5 text-[var(--muted)]">{description}</div>
        </div>
      </div>
      {children}
    </section>
  );
}

function ProductDraftTextareaGroup({
  label,
  value,
  rows,
  onChange,
  placeholder,
  tone = "neutral"
}: {
  label: string;
  value: string;
  rows: number;
  onChange: (value: string) => void;
  placeholder?: string;
  tone?: "neutral" | "risk";
}) {
  return (
    <label className={cn("grid gap-2 rounded-[14px] p-3", tone === "risk" ? "bg-[#fff7ed]" : "bg-[var(--card)]")}>
      <span className={cn("text-[12px] font-black", tone === "risk" ? "text-[#9a6a28]" : "text-[var(--muted)]")}>{label}</span>
      <Textarea
        className="min-h-[unset] border-0 bg-[var(--field)] shadow-[inset_0_0_0_1px_var(--border)]"
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function ProductDraftReferencePaths({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const tProductLibrary = makeAppTranslator("productLibrary");
  const referenceCount = splitLines(value).length;
  return (
    <ProductDraftSection
      title={tProductLibrary("draft.referenceTitle")}
      description={tProductLibrary("draft.referenceDescription")}
      icon={<ImageIcon size={15} />}
    >
      <div className="grid gap-3 rounded-[14px] bg-[var(--card)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge tone={referenceCount >= 3 ? "ok" : "warn"}>{tProductLibrary("draft.pathCount", { count: referenceCount })}</Badge>
          <span className="text-xs font-semibold text-[var(--muted)]">{tProductLibrary("draft.referenceHint")}</span>
        </div>
        <Textarea
          className="min-h-[120px] border-0 bg-[var(--field)] shadow-[inset_0_0_0_1px_var(--border)]"
          rows={5}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="refs/reference-01.jpg"
        />
      </div>
    </ProductDraftSection>
  );
}

function DashboardStatsPanel({
  analytics,
  range,
  granularity,
  onRangeChange,
  onGranularityChange,
  onRefresh,
  isBusy
}: {
  analytics: DashboardAnalytics;
  range: DashboardRange;
  granularity: DashboardGranularity;
  onRangeChange: (range: DashboardRange) => void;
  onGranularityChange: (granularity: DashboardGranularity) => void;
  onRefresh: () => void;
  isBusy: boolean;
}) {
  const tDashboard = makeAppTranslator("dashboard");
  const chartLabels = {
    cost: tDashboard("charts.cost"),
    jobs: tDashboard("charts.jobs"),
    occurrenceUnit: tDashboard("charts.occurrenceUnit"),
    providerSeries: tDashboard("charts.providerSeries")
  };
  const providerChart = buildProviderChartOption(analytics.providerRows, chartLabels);
  const trendChart = buildTrendChartOption(analytics.trend, chartLabels);
  const recentChart = buildRecentChartOption(analytics.recent, chartLabels);
  return (
    <section className="grid gap-4" aria-label={tDashboard("ariaLabel")}>
      <Card className="bg-[var(--card)] p-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-[13px] font-black text-[var(--text)]">{tDashboard("range.label")}</span>
            <Select className="w-[150px]" value={range} onChange={(event) => onRangeChange(event.target.value as DashboardRange)}>
              <option value="24h">{tDashboard("range.24h")}</option>
              <option value="7d">{tDashboard("range.7d")}</option>
              <option value="30d">{tDashboard("range.30d")}</option>
              <option value="all">{tDashboard("range.all")}</option>
            </Select>
            <Button onClick={onRefresh} disabled={isBusy}>
              <RefreshCcw size={14} />
              {tAppGlobal("commonActions.refresh")}
            </Button>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-end">
            <Badge tone={analytics.activeJobs > 0 ? "warn" : "neutral"}>{tDashboard("badges.active", { count: analytics.activeJobs })}</Badge>
            <Badge tone={analytics.failedJobs > 0 ? "danger" : "ok"}>{tDashboard("badges.failed", { count: analytics.failedJobs })}</Badge>
            <span className="text-[13px] font-black text-[var(--text)]">{tDashboard("granularity.label")}</span>
            <Select className="w-[130px]" value={granularity} onChange={(event) => onGranularityChange(event.target.value as DashboardGranularity)}>
              <option value="hour">{tDashboard("granularity.hour")}</option>
              <option value="day">{tDashboard("granularity.day")}</option>
            </Select>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(420px,.98fr)_minmax(0,1fr)]">
        <Card className="bg-[var(--card)]">
          <PanelTitle icon={<CircleDollarSign size={16} />} right={<Badge>{tDashboard("badges.channels", { count: analytics.providerRows.length })}</Badge>}>
            {tDashboard("provider.title")}
          </PanelTitle>
          <div className="grid gap-3 lg:grid-cols-[minmax(180px,280px)_minmax(0,1fr)] lg:items-center">
            <ChartBlock option={providerChart} height={250} empty={analytics.providerRows.length === 0} />
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[430px] border-separate border-spacing-0 text-left text-xs">
                <thead className="text-[var(--muted)]">
                  <tr>
                    <th className="border-b border-[var(--border)] px-2 py-2 font-black">{tDashboard("provider.model")}</th>
                    <th className="border-b border-[var(--border)] px-2 py-2 font-black">{tDashboard("provider.requests")}</th>
                    <th className="border-b border-[var(--border)] px-2 py-2 font-black">{tDashboard("provider.tokens")}</th>
                    <th className="border-b border-[var(--border)] px-2 py-2 font-black">{tDashboard("provider.cost")}</th>
                    <th className="border-b border-[var(--border)] px-2 py-2 font-black">{tDashboard("provider.active")}</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.providerRows.map((row) => (
                    <tr key={row.name}>
                      <td className="border-b border-[var(--border)] px-2 py-2 font-bold text-[var(--accent2)]">{providerLabel(row.name, makeAppTranslator("status"))}</td>
                      <td className="border-b border-[var(--border)] px-2 py-2">{formatNumber(row.jobs)}</td>
                      <td className="border-b border-[var(--border)] px-2 py-2">{formatCompactNumber(row.totalTokens)}</td>
                      <td className="border-b border-[var(--border)] px-2 py-2 text-[var(--danger)]">¥{money(row.estimatedCostCny)}</td>
                      <td className="border-b border-[var(--border)] px-2 py-2">{formatNumber(row.active)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        <Card className="bg-[var(--card)]">
          <PanelTitle icon={<Gauge size={16} />} right={<Badge>{tDashboard("trend.badge")}</Badge>}>
            {tDashboard("trend.title")}
          </PanelTitle>
          <ChartBlock option={trendChart} height={290} empty={analytics.trend.length === 0} />
        </Card>
      </div>

      <Card className="bg-[var(--card)]">
        <PanelTitle icon={<WalletCards size={16} />} right={<Badge>{analytics.recent.length}/12</Badge>}>
          {tDashboard("recent.title")}
        </PanelTitle>
        <ChartBlock option={recentChart} height={260} empty={analytics.recent.length === 0} />
        <div className="mt-3 grid gap-2">
          {analytics.recent.slice(0, 8).map((item) => (
            <div key={item.id} className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--card2)] p-2 text-xs md:grid-cols-[minmax(150px,1.2fr)_minmax(140px,1fr)_88px_90px_90px_80px] md:items-center">
              <strong className="min-w-0 truncate text-[var(--text)]">{item.productSku}</strong>
              <span className="min-w-0 truncate text-[var(--muted)]">{providerLabel(item.provider, makeAppTranslator("status"))}</span>
              <Badge tone={jobStatusTone(item.status as VideoJob["status"])}>{localizedJobStatusLabel(item.status)}</Badge>
              <span>{formatDuration(item.durationSeconds)}</span>
              <strong>¥{money(item.estimatedCostCny)}</strong>
              <span className="text-[var(--muted)]">{item.label}</span>
            </div>
          ))}
          {analytics.recent.length === 0 ? <EmptyState icon={<WalletCards size={28} />} text={tDashboard("recent.empty")} /> : null}
        </div>
      </Card>
    </section>
  );
}

function ChartBlock({ option, height, empty }: { option: EChartsOption; height: number; empty: boolean }) {
  if (empty) {
    return <EmptyState icon={<Gauge size={28} />} text={makeAppTranslator("dashboard")("empty")} />;
  }
  return (
    <ReactECharts
      className="min-w-0"
      echarts={echartsCore}
      option={option}
      notMerge
      lazyUpdate
      style={{ height, width: "100%" }}
    />
  );
}

function WalletRechargePanel({
  appLocale,
  wallet,
  walletRechargeOrders,
  onRequestRecharge,
  isBusy
}: {
  appLocale: AppLocale;
  wallet: WalletLedger;
  walletRechargeOrders: WalletRechargeOrder[];
  onRequestRecharge: (amountCny?: number) => void;
  isBusy: boolean;
}) {
  const tWallet = makeAppTranslator("wallet");
  const [activeTab, setActiveTab] = useState<WalletCenterTab>("recharge");
  const [activeConsumptionFilter, setActiveConsumptionFilter] = useState<WalletConsumptionFilter>("all");
  const [customRechargeAmount, setCustomRechargeAmount] = useState("");
  const [selectedRechargeAmountCny, setSelectedRechargeAmountCny] = useState<number | undefined>(50);
  const [selectedTransaction, setSelectedTransaction] = useState<WalletTransaction | undefined>();
  const quickAmounts = [50, 100, 300];
  const customRechargeAmountCny = normalizeCustomRechargeAmountCny(customRechargeAmount);
  const customRechargeAmountValid = customRechargeAmountCny !== undefined;
  const selectedRechargePaymentAmountCny = selectedRechargeAmountCny;
  const selectedRechargeCanPay = selectedRechargePaymentAmountCny !== undefined && selectedRechargePaymentAmountCny >= 50 && selectedRechargePaymentAmountCny <= 1000;
  const rechargeTransactionsByOrderId = useMemo(() => walletRechargeTransactionsByOrderId(wallet.transactions), [wallet.transactions]);
  const walletConsumptionTransactions = useMemo(() => walletVisibleConsumptionTransactions(wallet.transactions), [wallet.transactions]);
  const filteredConsumptionTransactions = walletConsumptionTransactions.filter((transaction) => walletTransactionMatchesConsumptionFilter(transaction, activeConsumptionFilter));
  const consumptionFilters: WalletConsumptionFilter[] = ["all", "charge", "reserve", "refund", "adjustment"];

  return (
    <Card className="overflow-hidden bg-[var(--card)] p-0">
      <div className="wallet-balance-hero border-b border-[var(--border)] bg-[linear-gradient(135deg,var(--field)_0%,var(--card)_58%,color-mix(in_srgb,var(--accent)_9%,var(--card))_100%)] p-5">
        <div className="wallet-balance-actions grid max-w-[1120px] gap-6 min-[900px]:grid-cols-[minmax(320px,430px)_minmax(360px,520px)] min-[900px]:items-center">
          <div className="wallet-balance-summary grid min-w-0 gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_10%,var(--panel2))] text-[var(--accent)]">
                <CircleDollarSign size={17} />
              </span>
              <h2 className="m-0 text-[15px] font-black text-[var(--text)]">{tWallet("title")}</h2>
            </div>
            <div className="grid gap-4">
              <div>
                <div className="text-xs font-black text-[var(--muted)]">{tWallet("balance.available")}</div>
                <div className="mt-1 text-[40px] font-black leading-none tracking-0 text-[var(--text)]">¥{money(wallet.availableCny)}</div>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-bold text-[var(--muted)]">
                <span>{tWallet("balance.account")} <strong className="ml-1 text-[var(--text)]">¥{money(wallet.balanceCny)}</strong></span>
                <span>{tWallet("balance.reserved")} <strong className="ml-1 text-[var(--text)]">¥{money(wallet.reservedCny)}</strong></span>
              </div>
            </div>
          </div>
          <div className="wallet-recharge-panel grid min-w-0 gap-3 border-t border-[color-mix(in_srgb,var(--border)_70%,transparent)] pt-4 min-[900px]:border-l min-[900px]:border-t-0 min-[900px]:py-1 min-[900px]:pl-6">
            <div className="flex items-center gap-2">
              <CreditCard size={15} className="shrink-0 text-[var(--accent)]" />
              <div className="text-xs font-black text-[var(--text)]">{tWallet("quickRecharge")}</div>
            </div>
            <div className="wallet-recharge-options grid grid-cols-2 gap-2.5 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(170px,1.2fr)]">
              {quickAmounts.map((amount) => (
                <Button
                  key={amount}
                  size="sm"
                  variant="soft"
                  type="button"
                  aria-pressed={selectedRechargeAmountCny === amount}
                  disabled={isBusy}
                  onClick={() => setSelectedRechargeAmountCny(amount)}
                  className={cn(
                    "wallet-recharge-option min-h-12 rounded-[8px] px-3 text-[13px] font-black",
                    selectedRechargeAmountCny === amount ? "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_42%,var(--border))]" : ""
                  )}
                >
                  ¥{money(amount)}
                </Button>
              ))}
              <label
                className={cn(
                  "wallet-custom-recharge-option flex min-h-12 min-w-0 items-center gap-1.5 rounded-[8px] border border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_9%,var(--field))] px-3 text-[var(--accent)] transition-[background,border-color,color,filter,box-shadow]",
                  !isBusy ? "hover:border-[color-mix(in_srgb,var(--accent)_48%,var(--border))]" : "",
                  customRechargeAmountValid && selectedRechargeAmountCny === customRechargeAmountCny ? "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_42%,var(--border))]" : "",
                  isBusy ? "opacity-55" : ""
                )}
              >
                <span className="pointer-events-none shrink-0 text-[15px] font-black leading-none">¥</span>
                <input
                  aria-label={tWallet("customRecharge.inputAriaLabel")}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder={tWallet("customRecharge.placeholder")}
                  value={customRechargeAmount}
                  disabled={isBusy}
                  aria-invalid={customRechargeAmount.length > 0 && !customRechargeAmountValid ? true : undefined}
                  onChange={(event) => {
                    const value = event.target.value.replace(/\D+/g, "").slice(0, 4);
                    setCustomRechargeAmount(value);
                    const amount = normalizeCustomRechargeAmountCny(value);
                    setSelectedRechargeAmountCny(amount);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && selectedRechargeCanPay && !isBusy && selectedRechargePaymentAmountCny !== undefined) {
                      event.preventDefault();
                      onRequestRecharge(selectedRechargePaymentAmountCny);
                    }
                  }}
                  onFocus={() => {
                    if (customRechargeAmountCny !== undefined) {
                      setSelectedRechargeAmountCny(customRechargeAmountCny);
                    }
                  }}
                  className="h-6 min-w-[58px] flex-1 border-0 bg-transparent p-0 text-center text-[13px] font-black leading-none text-[var(--accent)] outline-none placeholder:text-[var(--muted)] disabled:cursor-not-allowed"
                />
              </label>
            </div>
            <Button
              className="wallet-selected-recharge-pay min-h-10 w-full text-[13px] font-black"
              type="button"
              variant="primary"
              disabled={isBusy || !selectedRechargeCanPay}
              onClick={() => {
                if (selectedRechargePaymentAmountCny !== undefined) {
                  onRequestRecharge(selectedRechargePaymentAmountCny);
                }
              }}
            >
              {selectedRechargePaymentAmountCny === undefined ? tWallet("pay") : tWallet("paySelected", { amount: money(selectedRechargePaymentAmountCny) })}
            </Button>
            <div className="text-[11px] font-semibold leading-5 text-[var(--muted)]">
              {tWallet("billingHint")}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-5">
        <div className="wallet-tab-strip flex flex-wrap items-center gap-1 border-b border-[var(--border)] pb-2" role="tablist" aria-label={tWallet("tabs.ariaLabel")}>
          {(["recharge", "consumption"] as const).map((tab) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`wallet-center-panel-${tab}`}
                className={cn(
                  "min-h-8 rounded-full px-3 text-[12px] font-black transition",
                  active
                    ? "bg-[color-mix(in_srgb,var(--accent)_10%,var(--field))] text-[var(--accent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_38%,var(--border))]"
                    : "text-[var(--muted)] hover:bg-[var(--panel2)] hover:text-[var(--text)]"
                )}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "recharge" ? tWallet("tabs.recharge") : tWallet("tabs.consumption")}
              </button>
            );
          })}
        </div>

        {activeTab === "recharge" ? (
          <div id="wallet-center-panel-recharge" role="tabpanel" className="grid gap-3">
            <WalletRechargeOrderTable
              orders={walletRechargeOrders}
              rechargeTransactionsByOrderId={rechargeTransactionsByOrderId}
              emptyText={tWallet("emptyRechargeTransactions")}
            />
          </div>
        ) : (
          <div id="wallet-center-panel-consumption" role="tabpanel" className="grid gap-3">
            <div className="flex flex-wrap gap-1.5" aria-label={tWallet("filters.ariaLabel")}>
              {consumptionFilters.map((filter) => {
                const active = activeConsumptionFilter === filter;
                return (
                  <button
                    key={filter}
                    type="button"
                    aria-pressed={active}
                    className={cn(
                      "min-h-7 rounded-full px-2.5 text-[11px] font-black transition",
                      active
                        ? "bg-[color-mix(in_srgb,var(--accent)_10%,var(--field))] text-[var(--accent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_34%,var(--border))]"
                        : "text-[var(--muted)] hover:bg-[var(--panel2)] hover:text-[var(--accent)]"
                    )}
                    onClick={() => setActiveConsumptionFilter(filter)}
                  >
                    {walletConsumptionFilterLabel(filter, tWallet)}
                  </button>
                );
              })}
            </div>
            <WalletConsumptionTransactionTable
              appLocale={appLocale}
              transactions={filteredConsumptionTransactions}
              emptyText={tWallet("emptyConsumptionTransactions")}
              onSelectTransaction={setSelectedTransaction}
            />
          </div>
        )}
      </div>
      <WalletTransactionDetailDialog
        appLocale={appLocale}
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(undefined)}
      />
    </Card>
  );
}

function walletTransactionMatchesConsumptionFilter(transaction: WalletTransaction, filter: WalletConsumptionFilter) {
  if (filter === "all") return true;
  return transaction.type === filter;
}

function walletConsumptionFilterLabel(filter: WalletConsumptionFilter, tWallet: AppTranslator) {
  switch (filter) {
    case "all":
      return tWallet("filters.all");
    case "charge":
      return tWallet("filters.charge");
    case "reserve":
      return tWallet("filters.reserve");
    case "refund":
      return tWallet("filters.refund");
    case "adjustment":
      return tWallet("filters.adjustment");
  }
}

function normalizeCustomRechargeAmountCny(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const amount = Number(value);
  return Number.isInteger(amount) && amount >= 50 && amount <= 1000 ? amount : undefined;
}

function walletRechargeTransactionsByOrderId(transactions: WalletTransaction[]): Map<string, WalletTransaction> {
  const entries = transactions
    .filter((transaction) => transaction.type === "recharge" || transaction.type === "bonus")
    .map((transaction) => [stringMetadata(transaction.metadata?.rechargeOrderId), transaction] as const)
    .filter((entry): entry is [string, WalletTransaction] => Boolean(entry[0]));
  return new Map(entries);
}

function WalletRechargeOrderTable({
  orders,
  rechargeTransactionsByOrderId,
  emptyText
}: {
  orders: WalletRechargeOrder[];
  rechargeTransactionsByOrderId: Map<string, WalletTransaction>;
  emptyText: string;
}) {
  const tWallet = makeAppTranslator("wallet");
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="wallet-recharge-order-table overflow-x-auto rounded-[8px] border border-[var(--border)] bg-[var(--card)]">
      <table className="w-full min-w-[760px] table-fixed border-separate border-spacing-0 text-left text-[13px]">
        <colgroup>
          <col className="w-[20%]" />
          <col className="w-[12%]" />
          <col className="w-[22%]" />
          <col className="w-[12%]" />
          <col className="w-[18%]" />
          <col className="w-[16%]" />
        </colgroup>
        <thead className="bg-[color-mix(in_srgb,var(--panel2)_78%,var(--card))] text-[var(--muted)]">
          <tr>
            <WalletTableHeaderCell>{tWallet("orderTable.order")}</WalletTableHeaderCell>
            <WalletTableHeaderCell>{tWallet("orderTable.topUpAmount")}</WalletTableHeaderCell>
            <WalletTableHeaderCell>{tWallet("orderTable.paymentMethod")}</WalletTableHeaderCell>
            <WalletTableHeaderCell>{tWallet("orderTable.status")}</WalletTableHeaderCell>
            <WalletTableHeaderCell>{tWallet("orderTable.createdAt")}</WalletTableHeaderCell>
            <WalletTableHeaderCell>{tWallet("orderTable.action")}</WalletTableHeaderCell>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const transaction = rechargeTransactionsByOrderId.get(order.id);
            const paymentMethod = walletRechargeOrderPaymentMethodView(order, tWallet, transaction);
            const status = walletRechargeOrderEffectiveStatus(order, nowTick);
            const expiresInText = walletRechargeOrderExpiresInText(order, nowTick);
            const canContinue = status === "pending" && Boolean(order.checkoutUrl);
            return (
              <tr key={order.id} className="wallet-recharge-order-row bg-[var(--card)]">
                <WalletTableCell>
                  <div className="truncate font-bold text-[var(--text)]" title={order.id}>{walletRechargeOrderDisplayCode(order)}</div>
                </WalletTableCell>
                <WalletTableCell>
                  <div className="min-w-0">
                    <strong className="font-black tabular-nums text-[var(--text)]">{walletRechargeOrderCreditAmountText(order)}</strong>
                    {walletRechargeOrderSettlementAmountText(order) ? (
                      <div className="wallet-recharge-order-settlement mt-0.5 truncate text-[11px] font-semibold tabular-nums text-[var(--muted)]">
                        {walletRechargeOrderSettlementAmountText(order)}
                      </div>
                    ) : null}
                  </div>
                </WalletTableCell>
                <WalletTableCell>
                  <div className="min-w-0">
                    <div className="truncate font-bold text-[var(--text)]" title={paymentMethod.primary}>{paymentMethod.primary}</div>
                    {paymentMethod.detail ? (
                      <div className="mt-0.5 truncate text-[11px] font-semibold text-[var(--muted)]" title={paymentMethod.detail}>{paymentMethod.detail}</div>
                    ) : null}
                  </div>
                </WalletTableCell>
                <WalletTableCell>
                  <Badge className="min-h-6 px-2.5 text-[11px]" tone={walletRechargeOrderStatusTone(status)}>
                    {walletRechargeOrderStatusLabel(status, tWallet)}
                  </Badge>
                </WalletTableCell>
                <WalletTableCell>
                  <span className="font-semibold text-[var(--muted)]">{formatWalletTableDateTime(order.createdAt)}</span>
                </WalletTableCell>
                <WalletTableCell>
                  {canContinue ? (
                    <div className="flex min-w-0 items-center justify-start">
                      <Button
                        className="h-8 min-h-8 whitespace-nowrap px-2.5 text-[12px]"
                        size="sm"
                        variant="soft"
                        type="button"
                        onClick={() => window.location.assign(order.checkoutUrl as string)}
                      >
                        {tWallet("orderTable.continuePay")}
                        {expiresInText ? (
                          <span className="wallet-recharge-order-countdown border-l border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] pl-1.5 text-[11px] font-black tabular-nums text-[var(--accent)] opacity-80">
                            {expiresInText}
                          </span>
                        ) : null}
                      </Button>
                    </div>
                  ) : (
                    <span className="font-semibold text-[var(--muted)]">-</span>
                  )}
                </WalletTableCell>
              </tr>
            );
          })}
        </tbody>
      </table>
      {orders.length === 0 ? <WalletTableEmptyState emptyText={emptyText} /> : null}
    </div>
  );
}

function WalletConsumptionTransactionTable({
  appLocale,
  transactions,
  emptyText,
  onSelectTransaction
}: {
  appLocale: AppLocale;
  transactions: WalletTransaction[];
  emptyText: string;
  onSelectTransaction?: (transaction: WalletTransaction) => void;
}) {
  const tWallet = makeAppTranslator("wallet");
  return (
    <div className="wallet-consumption-transaction-table overflow-x-auto rounded-[8px] border border-[var(--border)] bg-[var(--card)]">
      <table className="w-full min-w-[820px] table-fixed border-separate border-spacing-0 text-left text-[13px]">
        <colgroup>
          <col className="w-[12%]" />
          <col className="w-[34%]" />
          <col className="w-[14%]" />
          <col className="w-[14%]" />
          <col className="w-[18%]" />
          <col className="w-[8%]" />
        </colgroup>
        <thead className="bg-[color-mix(in_srgb,var(--panel2)_78%,var(--card))] text-[var(--muted)]">
          <tr>
            <WalletTableHeaderCell>{tWallet("transactionTable.type")}</WalletTableHeaderCell>
            <WalletTableHeaderCell>{tWallet("transactionTable.description")}</WalletTableHeaderCell>
            <WalletTableHeaderCell>{tWallet("transactionTable.amount")}</WalletTableHeaderCell>
            <WalletTableHeaderCell>{tWallet("transactionTable.balance")}</WalletTableHeaderCell>
            <WalletTableHeaderCell>{tWallet("transactionTable.createdAt")}</WalletTableHeaderCell>
            <WalletTableHeaderCell>{tWallet("transactionTable.action")}</WalletTableHeaderCell>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => {
            const billingBreakdown = walletTransactionBillingBreakdown(transaction);
            return (
              <tr key={transaction.id} className="wallet-consumption-transaction-row bg-[var(--card)]">
                <WalletTableCell>
                  <Badge className="recharge-transaction-type-badge min-h-6 px-2.5 text-[11px]" tone={transaction.amountCny < 0 ? "danger" : "ok"}>
                    {walletTransactionTypeLabel(transaction.type, tWallet)}
                  </Badge>
                </WalletTableCell>
                <WalletTableCell>
                  <div className="max-w-[320px] truncate font-bold text-[var(--text)]" title={walletTransactionDescriptionLabel(transaction.description, appLocale)}>
                    {walletTransactionDescriptionLabel(transaction.description, appLocale)}
                  </div>
                </WalletTableCell>
                <WalletTableCell>
                  <div className="grid min-w-0 gap-1">
                    <strong className={cn("font-black tabular-nums", transaction.amountCny >= 0 ? "text-emerald-700" : "text-[var(--text)]")}>
                      {transaction.amountCny >= 0 ? "+" : "-"}¥{money(Math.abs(transaction.amountCny))}
                    </strong>
                    {billingBreakdown ? (
                      <span className="truncate text-[11px] font-semibold tabular-nums text-[var(--muted)]" title={walletBillingBreakdownText(billingBreakdown, tWallet)}>
                        {walletBillingBreakdownText(billingBreakdown, tWallet)}
                      </span>
                    ) : null}
                  </div>
                </WalletTableCell>
                <WalletTableCell>
                  <span className="font-semibold tabular-nums text-[var(--text)]">¥{money(transaction.balanceAfterCny)}</span>
                </WalletTableCell>
                <WalletTableCell>
                  <span className="font-semibold text-[var(--muted)]">{formatWalletTableDateTime(transaction.createdAt)}</span>
                </WalletTableCell>
                <WalletTableCell>
                  <Button
                    className="h-8 min-h-8 px-2 text-[12px]"
                    size="sm"
                    variant="ghost"
                    type="button"
                    onClick={() => onSelectTransaction?.(transaction)}
                  >
                    <FileText size={13} />
                    {tWallet("details")}
                  </Button>
                </WalletTableCell>
              </tr>
            );
          })}
        </tbody>
      </table>
      {transactions.length === 0 ? <WalletTableEmptyState emptyText={emptyText} /> : null}
    </div>
  );
}

function WalletTableHeaderCell({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <th className={cn("border-b border-[var(--border)] px-4 py-3 text-xs font-black", className)}>
      {children}
    </th>
  );
}

function WalletTableCell({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <td className={cn("border-b border-[var(--border)] px-4 py-4 align-middle last:border-b", className)}>
      {children}
    </td>
  );
}

function WalletTableEmptyState({ emptyText }: { emptyText: string }) {
  return (
    <div className="wallet-transaction-empty grid min-h-[128px] place-items-center border-t border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center text-sm font-bold text-[var(--muted)]">
      <div className="grid justify-items-center gap-2">
        <WalletCards className="text-[var(--accent)] opacity-80" size={24} />
        {emptyText}
      </div>
    </div>
  );
}

function walletRechargeOrderDisplayCode(order: WalletRechargeOrder): string {
  const compactId = order.id.replace(/^wallet-recharge-/u, "").replace(/-/gu, "");
  return compactId ? `WR-${compactId.slice(0, 12).toUpperCase()}` : order.id;
}

function walletRechargeOrderCreditAmountText(order: WalletRechargeOrder): string {
  return `¥${money(order.creditCny)}`;
}

function walletRechargeOrderSettlementAmountText(order: WalletRechargeOrder): string | undefined {
  if (order.paymentCurrency.toLowerCase() === "cny") {
    return undefined;
  }
  return `${order.paymentCurrency.toUpperCase()} ${money(order.paymentAmount)}`;
}

function walletRechargeOrderPaymentMethodView(
  order: WalletRechargeOrder,
  tWallet: AppTranslator,
  transaction?: WalletTransaction
): { primary: string; detail?: string } {
  const metadata = walletRechargeOrderPaymentMetadata(order, transaction);
  const metadataLabel = stringMetadata(metadata.paymentMethodLabel);
  const cryptoCurrency = stringMetadata(metadata.cryptoCurrency);
  const cryptoNetwork = stringMetadata(metadata.cryptoNetwork);
  const cryptoDetail = [cryptoCurrency, cryptoNetwork].filter(Boolean).join("-");
  const cardLast4 = stringMetadata(metadata.cardLast4);
  const cardBrand = stripeCardBrandDisplayLabel(stringMetadata(metadata.cardBrand));
  const cardWallet = stripeWalletDisplayLabel(stringMetadata(metadata.cardWallet));
  const cardDetail = [cardWallet, cardBrand, cardLast4 ? `尾号 ${cardLast4}` : undefined].filter(Boolean).join(" ");
  if (order.provider === "infini") {
    return {
      primary: tWallet("paymentMethods.infini"),
      detail: cryptoDetail || metadataLabel || stringMetadata(metadata.cryptoTxHashShort)
    };
  }
  if (order.provider === "stripe") {
    const primary = metadataLabel ? `${tWallet("paymentMethods.stripe")} ${metadataLabel}` : tWallet("paymentMethods.stripe");
    return {
      primary,
      detail: cardDetail && cardDetail !== metadataLabel ? cardDetail : undefined
    };
  }
  return {
    primary: metadataLabel || order.provider
  };
}

function walletRechargeOrderPaymentMetadata(order: WalletRechargeOrder, transaction?: WalletTransaction): Record<string, unknown> {
  if (order.metadata && hasPaymentMethodMetadata(order.metadata)) {
    return order.metadata;
  }
  if (transaction?.metadata && hasPaymentMethodMetadata(transaction.metadata)) {
    return transaction.metadata;
  }
  return order.metadata ?? transaction?.metadata ?? {};
}

function walletBillingBreakdownText(
  breakdown: NonNullable<ReturnType<typeof walletTransactionBillingBreakdown>>,
  tWallet: AppTranslator
): string {
  if (breakdown.apiBillingMode === "byok" && breakdown.upstreamCostCny === 0) {
    return tWallet("transactionTable.byokFeeBreakdown", {
      serviceFee: money(breakdown.platformFeeCny)
    });
  }
  return tWallet("transactionTable.feeBreakdown", {
    serviceFee: money(breakdown.platformFeeCny),
    upstreamCost: money(breakdown.upstreamCostCny)
  });
}

function hasPaymentMethodMetadata(metadata: Record<string, unknown> | undefined): boolean {
  return Boolean(
    stringMetadata(metadata?.paymentMethodLabel) ||
    stringMetadata(metadata?.cryptoCurrency) ||
    stringMetadata(metadata?.cryptoNetwork) ||
    stringMetadata(metadata?.cardLast4)
  );
}

function stringMetadata(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stripeCardBrandDisplayLabel(brand: string): string {
  if (!brand) return "";
  const labels: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "American Express",
    discover: "Discover",
    diners: "Diners Club",
    jcb: "JCB",
    unionpay: "UnionPay"
  };
  return labels[brand.toLowerCase()] ?? brand;
}

function stripeWalletDisplayLabel(wallet: string): string {
  if (!wallet) return "";
  const labels: Record<string, string> = {
    apple_pay: "Apple Pay",
    google_pay: "Google Pay",
    samsung_pay: "Samsung Pay",
    link: "Link"
  };
  return labels[wallet.toLowerCase()] ?? wallet;
}

function walletRechargeOrderEffectiveStatus(order: WalletRechargeOrder, nowMs: number): WalletRechargeOrder["status"] {
  if (order.status === "pending" && walletRechargeOrderIsExpired(order, nowMs)) {
    return "expired";
  }
  return order.status;
}

function walletRechargeOrderIsExpired(order: WalletRechargeOrder, nowMs: number): boolean {
  const expiresAtMs = walletRechargeOrderExpiresAtMs(order);
  return expiresAtMs !== undefined && expiresAtMs <= nowMs;
}

function walletRechargeOrderExpiresAtMs(order: WalletRechargeOrder): number | undefined {
  if (!order.expiresAt) {
    return undefined;
  }
  const value = new Date(order.expiresAt).getTime();
  return Number.isNaN(value) ? undefined : value;
}

function walletRechargeOrderExpiresInText(order: WalletRechargeOrder, nowMs: number): string | undefined {
  if (order.status !== "pending") {
    return undefined;
  }
  const expiresAtMs = walletRechargeOrderExpiresAtMs(order);
  if (expiresAtMs === undefined || expiresAtMs <= nowMs) {
    return undefined;
  }
  const totalSeconds = Math.ceil((expiresAtMs - nowMs) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `剩 ${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `剩 ${minutes}:${String(seconds).padStart(2, "0")}`;
}

function walletRechargeOrderPaymentMethodLabel(order: WalletRechargeOrder, tWallet: AppTranslator): string {
  const metadataLabel = stringMetadata(order.metadata?.paymentMethodLabel);
  if (metadataLabel) {
    return metadataLabel;
  }
  if (order.provider === "infini") {
    return tWallet("paymentMethods.infini");
  }
  if (order.provider === "stripe") {
    return tWallet("paymentMethods.stripe");
  }
  return order.provider;
}

function walletRechargeOrderStatusLabel(status: WalletRechargeOrder["status"], tWallet: AppTranslator): string {
  switch (status) {
    case "pending":
      return tWallet("orderTable.statuses.pending");
    case "paid":
      return tWallet("orderTable.statuses.paid");
    case "expired":
      return tWallet("orderTable.statuses.expired");
    case "failed":
      return tWallet("orderTable.statuses.failed");
  }
}

function walletRechargeOrderStatusTone(status: WalletRechargeOrder["status"]) {
  switch (status) {
    case "paid":
      return "ok";
    case "pending":
      return "warn";
    case "failed":
      return "danger";
    case "expired":
      return "neutral";
  }
}

function formatWalletTableDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

function WalletTransactionDetailDialog({
  appLocale,
  onClose,
  transaction
}: {
  appLocale: AppLocale;
  onClose: () => void;
  transaction?: WalletTransaction;
}) {
  const tWallet = makeAppTranslator("wallet");
  if (!transaction) return null;
  const metadata = transaction.metadata ?? {};
  const priceSnapshot = recordValue(metadata.priceSnapshot);
  const detailRows = walletTransactionDetailRows(transaction, metadata, priceSnapshot, appLocale);
  const billingBreakdown = walletTransactionBillingBreakdown(transaction);

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-[rgba(23,32,51,.45)] p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={tWallet("detail.title")}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="grid w-full max-w-[620px] overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--panel)] shadow-[0_28px_90px_rgba(96,64,43,.18)]">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={transaction.amountCny < 0 ? "danger" : "ok"}>{walletTransactionTypeLabel(transaction.type, tWallet)}</Badge>
              <span className="text-[12px] font-bold text-[var(--muted)]">{formatDateTime(transaction.createdAt)}</span>
            </div>
            <h2 className="m-0 mt-2 text-base font-black text-[var(--text)]">{tWallet("detail.title")}</h2>
          </div>
          <Button className="w-fit" size="icon" variant="ghost" type="button" aria-label={tWallet("detail.close")} onClick={onClose}>
            <X size={15} />
          </Button>
        </header>
        <div className="grid gap-4 px-4 py-4">
          <div className="grid grid-cols-3 overflow-hidden rounded-[8px] border border-[var(--border)]">
            <WalletDetailMetric label={tWallet("detail.amount")} value={`${transaction.amountCny < 0 ? "-" : "+"}¥${money(Math.abs(transaction.amountCny))}`} />
            <WalletDetailMetric label={tWallet("detail.balanceAfter")} value={`¥${money(transaction.balanceAfterCny)}`} />
            <WalletDetailMetric label={tWallet("detail.reservedAfter")} value={`¥${money(transaction.reservedAfterCny)}`} />
          </div>
          {billingBreakdown ? (
            <div className="grid grid-cols-3 overflow-hidden rounded-[8px] border border-[var(--border)]">
              <WalletDetailMetric label={tWallet("detail.totalCharge")} value={`¥${money(billingBreakdown.totalCny)}`} />
              <WalletDetailMetric label={tWallet("detail.serviceFee")} value={`¥${money(billingBreakdown.platformFeeCny)}`} />
              <WalletDetailMetric label={tWallet("detail.upstreamCost")} value={`¥${money(billingBreakdown.upstreamCostCny)}`} />
            </div>
          ) : null}
          <div className="grid gap-2">
            {detailRows.map((row) => (
              <WalletDetailRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function WalletDetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-r border-[var(--border)] bg-[var(--panel2)] px-3 py-2.5 last:border-r-0">
      <div className="truncate text-[10px] font-black uppercase text-[var(--muted)]">{label}</div>
      <div className="mt-1 truncate text-[17px] font-black tabular-nums text-[var(--text)]">{value}</div>
    </div>
  );
}

function WalletDetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-xs min-[560px]:grid-cols-[150px_minmax(0,1fr)] min-[560px]:items-center">
      <div className="font-black text-[var(--muted)]">{label}</div>
      <div className="min-w-0 break-words font-semibold text-[var(--text)]">{value}</div>
    </div>
  );
}

function walletTransactionDetailRows(
  transaction: WalletTransaction,
  metadata: Record<string, unknown>,
  priceSnapshot: Record<string, unknown> | undefined,
  appLocale: AppLocale
): Array<{ label: string; value: ReactNode }> {
  const tWallet = makeAppTranslator("wallet");
  const paymentRows = [
    { label: tWallet("detail.paymentMethod"), value: detailText(metadata.paymentMethodLabel), rawValue: metadata.paymentMethodLabel },
    { label: tWallet("detail.paymentCurrency"), value: detailText(metadata.paymentCurrency), rawValue: metadata.paymentCurrency },
    { label: tWallet("detail.cryptoCurrency"), value: detailText(metadata.cryptoCurrency), rawValue: metadata.cryptoCurrency },
    { label: tWallet("detail.cryptoNetwork"), value: detailText(metadata.cryptoNetwork), rawValue: metadata.cryptoNetwork },
    { label: tWallet("detail.cryptoTxHash"), value: detailText(metadata.cryptoTxHash ?? metadata.cryptoTxHashShort), rawValue: metadata.cryptoTxHash ?? metadata.cryptoTxHashShort },
    { label: tWallet("detail.stripeCharge"), value: detailText(metadata.stripeChargeId), rawValue: metadata.stripeChargeId }
  ].filter((row) => hasDetailValue(row.rawValue));
  return [
    { label: tWallet("detail.description"), value: walletTransactionDescriptionLabel(transaction.description, appLocale) },
    ...paymentRows.map(({ label, value }) => ({ label, value })),
    { label: tWallet("detail.billingMode"), value: detailText(metadata.apiBillingMode) },
    { label: tWallet("detail.usageKind"), value: detailText(metadata.usageKind ?? priceSnapshot?.kind) },
    { label: tWallet("detail.model"), value: detailText(metadata.model ?? priceSnapshot?.requestedModel ?? priceSnapshot?.model) },
    { label: tWallet("detail.serviceFee"), value: moneyText(metadata.platformFeeCny) },
    { label: tWallet("detail.upstreamCost"), value: moneyText(metadata.upstreamActualCostCny ?? metadata.upstreamCostCny ?? metadata.upstreamEstimatedCostCny) },
    { label: tWallet("detail.units"), value: detailText(metadata.actualUnits ?? metadata.estimatedUnits ?? priceSnapshot?.totalTokens) },
    { label: tWallet("detail.catalogVersion"), value: detailText(priceSnapshot?.catalogVersion) },
    { label: tWallet("detail.unitPrice"), value: moneyText(priceSnapshot?.unitPriceCny ?? priceSnapshot?.inputPriceCnyPerMillion ?? priceSnapshot?.outputPriceCnyPerMillion ?? priceSnapshot?.videoTokenPriceCnyPerMillion) },
    { label: tWallet("detail.source"), value: sourceLink(priceSnapshot?.sourceUrl) },
    { label: tWallet("detail.job"), value: detailText(transaction.jobId ?? transaction.reservationId) }
  ];
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function detailText(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function hasDetailValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function moneyText(value: unknown): string {
  return typeof value === "number" ? `¥${money(value)}` : detailText(value);
}

function sourceLink(value: unknown): ReactNode {
  const href = typeof value === "string" ? value : "";
  if (!href) return "-";
  return <a className="font-black text-[var(--accent)] hover:underline" href={href} target="_blank" rel="noreferrer">{href}</a>;
}

function ModelPricingPanel({ appLocale, catalog }: { appLocale: AppLocale; catalog: ActiveModelPricingCatalogView }) {
  const tPricing = makeAppTranslator("pricing");
  const [activeProviderId, setActiveProviderId] = useState<ModelPricingProviderId>("openai");
  const rawActiveProvider = modelPricingProviders.find((provider) => provider.id === activeProviderId) ?? modelPricingProviders[0];
  const activeProvider = localizedModelPricingProvider(rawActiveProvider, appLocale);
  const activeEntries = pricingEntriesForProvider(activeProvider.id, catalog.entries).map((entry) => localizedModelPricingEntry(entry, appLocale));
  const activeVerifiedCount = activeEntries.filter((entry) => entry.status === "verified").length;
  const verifiedCount = modelPricingProviders.reduce((count, provider) => (
    count + pricingEntriesForProvider(provider.id, catalog.entries).filter((entry) => entry.status === "verified").length
  ), 0);

  return (
    <div className="grid gap-4">
      <Card className="grid gap-3 bg-[var(--card)] p-4">
        <div className="grid gap-3 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="ok">{tPricing("verifiedCount", { count: verifiedCount })}</Badge>
              <Badge>{tPricing("updated", { date: catalog.version })}</Badge>
              <Badge tone={catalog.source === "database" ? "ok" : "neutral"}>{catalog.source === "database" ? tPricing("activeCatalog") : tPricing("builtInCatalog")}</Badge>
            </div>
            <h2 className="m-0 mt-2 text-[20px] font-black leading-7 text-[var(--text)]">{tPricing("title")}</h2>
            <p className="m-0 mt-1 max-w-[780px] text-[12px] font-semibold leading-5 text-[var(--muted)]">
              {tPricing("subtitle")}
            </p>
          </div>
          <div className="flex min-w-0 items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-[11px] font-semibold leading-5 text-[var(--muted)]">
            <ShieldCheck className="mt-0.5 shrink-0 text-[var(--accent)]" size={14} />
            <span>{tPricing("notice")}</span>
          </div>
        </div>
      </Card>

      <Card className="grid gap-4 bg-[var(--panel)]">
        <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--border)] bg-[var(--field)] p-1" role="tablist" aria-label={tPricing("providerTabs")}>
          {modelPricingProviders.map((provider) => {
            const active = provider.id === activeProvider.id;
            const providerEntries = pricingEntriesForProvider(provider.id, catalog.entries);
            const providerLabel = localizedModelPricingProvider(provider, appLocale).name;
            return (
              <button
                key={provider.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`model-pricing-panel-${provider.id}`}
                className={cn(
                  "min-h-9 flex-1 rounded-[7px] border px-3 text-left text-[12px] font-black transition min-[760px]:flex-none",
                  active
                    ? "border-[color-mix(in_srgb,var(--accent)_42%,var(--border))] bg-[var(--card)] text-[var(--accent)] shadow-[0_8px_18px_rgba(96,64,43,.08)]"
                    : "border-transparent bg-transparent text-[var(--muted)] hover:bg-[var(--panel2)] hover:text-[var(--text)]"
                )}
                onClick={() => setActiveProviderId(provider.id)}
              >
                <span className="flex items-center justify-between gap-2">
                  <span>{providerLabel}</span>
                  <span className="text-[10px] font-black text-[var(--muted)]">{providerEntries.length}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div id={`model-pricing-panel-${activeProvider.id}`} role="tabpanel" className="grid gap-4">
          <div className="grid gap-3 min-[780px]:grid-cols-[minmax(0,1fr)_auto] min-[780px]:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="m-0 text-[18px] font-black leading-6 text-[var(--text)]">{activeProvider.name}</h3>
                <Badge tone={activeVerifiedCount > 0 ? "ok" : "warn"}>
                  {activeVerifiedCount > 0 ? tPricing("verified", { count: activeVerifiedCount }) : tPricing("officialReference")}
                </Badge>
              </div>
              <p className="m-0 mt-1 text-[12px] font-semibold leading-5 text-[var(--muted)]">{activeProvider.summary}</p>
            </div>
            <Button asChild className="justify-self-start" size="sm" variant="soft">
              <a href={activeProvider.sourceUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={13} />
                {tPricing("officialSource")}
              </a>
            </Button>
          </div>

          <div className="grid gap-3 min-[980px]:grid-cols-2">
            {activeEntries.map((entry) => (
              <ModelPricingRow key={`${entry.providerId}-${entry.model}`} entry={entry} />
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function ModelPricingRow({ entry }: { entry: ModelPricingEntry }) {
  const tPricing = makeAppTranslator("pricing");
  const Icon = modelPricingKindIcon(entry.kind);
  return (
    <article className="grid content-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--field)] p-3 shadow-none">
      <div className="grid min-w-0 grid-cols-[34px_minmax(0,1fr)_auto] items-start gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_9%,var(--panel2))] text-[var(--accent)]">
          <Icon size={15} />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <strong className="truncate text-[13px] font-black text-[var(--text)]">{entry.model}</strong>
            <Badge className="min-h-5 px-1.5 text-[10px]">{entry.label}</Badge>
          </div>
          <div className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">{entry.unit}</div>
        </div>
        <Button asChild className="h-7 w-7" size="icon" variant="ghost" title={tPricing("viewSource")} aria-label={`${entry.model} ${tPricing("officialSource")}`}>
          <a href={entry.sourceUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={12} />
          </a>
        </Button>
      </div>

      <div className="grid gap-2 min-[520px]:grid-cols-3">
        <PriceMetric label={entry.kind === "video" ? tPricing("billingEntry") : tPricing("input")} value={entry.input} />
        <PriceMetric label={secondaryPriceMetricLabel(entry.kind)} value={entry.cachedInput ?? "-"} />
        <PriceMetric label={entry.kind === "image" || entry.kind === "video" ? tPricing("generatedOutput") : tPricing("output")} value={entry.output} />
      </div>
      {entry.billingNote ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2.5 py-2 text-[11px] font-semibold leading-5 text-[var(--muted)]">
          <strong className="text-[var(--text)]">{tPricing("billingNote")}</strong>
          <span className="ml-1">{entry.billingNote}</span>
        </div>
      ) : null}
      {entry.costFactors || entry.formula || entry.examples ? (
        <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2.5 py-2 text-[11px] font-semibold leading-5 text-[var(--muted)]">
          {entry.costFactors ? (
            <div className="grid gap-1">
              <div className="font-black text-[var(--text)]">{tPricing("costFactors")}</div>
              <div className="flex flex-wrap gap-1.5">
                {entry.costFactors.map((factor) => (
                  <Badge key={factor} className="min-h-5 px-1.5 text-[10px]">{factor}</Badge>
                ))}
              </div>
            </div>
          ) : null}
          {entry.formula ? (
            <div className="grid gap-1">
              <div className="font-black text-[var(--text)]">{tPricing("formula")}</div>
              <div className="break-words rounded-[6px] bg-[var(--field)] px-2 py-1 font-black text-[var(--text)]">{entry.formula}</div>
            </div>
          ) : null}
          {entry.examples ? (
            <div className="grid gap-1">
              <div className="font-black text-[var(--text)]">{tPricing("examples")}</div>
              <div className="grid gap-1 min-[520px]:grid-cols-2">
                {entry.examples.map((example) => (
                  <div key={`${example.label}-${example.value}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-[6px] bg-[var(--field)] px-2 py-1">
                    <span className="min-w-0 truncate">{example.label}</span>
                    <strong className="text-[var(--text)]">{example.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function PriceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2.5 py-2">
      <div className="text-[10px] font-black uppercase tracking-[.08em] text-[var(--muted)]">{label}</div>
      <div className="mt-1 break-words text-[13px] font-black leading-5 text-[var(--text)]">{value}</div>
    </div>
  );
}

function secondaryPriceMetricLabel(kind: ModelPricingKind): string {
  const tPricing = makeAppTranslator("pricing");
  if (kind === "video") return tPricing("secondary.video");
  if (kind === "image") return tPricing("secondary.image");
  return tPricing("secondary.text");
}

function modelPricingKindIcon(kind: ModelPricingKind): typeof FileText {
  if (kind === "image") return ImageIcon;
  if (kind === "video") return FileVideo;
  return FileText;
}

function VideoJobsPanel({
  appLocale,
  jobs,
  products,
  onCancel,
  onRetry,
  onRecoverDownload
}: {
  appLocale: AppLocale;
  jobs: VideoJob[];
  products: ProductSummary[];
  onCancel: (jobId: string) => Promise<void>;
  onRetry: (job: VideoJob) => Promise<void>;
  onRecoverDownload: (job: VideoJob) => Promise<void>;
}) {
  const tLedger = makeAppTranslator("ledger");
  const activeCount = jobs.filter((job) => job.status === "queued" || job.status === "running").length;
  return (
    <Card id="generation-tasks" className="bg-[var(--card)]">
      <PanelTitle icon={<Gauge size={16} />} right={<Badge tone={activeCount > 0 ? "warn" : "neutral"}>{tLedger("jobs.active", { count: activeCount })}</Badge>}>
        {tLedger("jobs.title")}
      </PanelTitle>
      {jobs.length > 0 ? (
        <div className="grid gap-3">
          {jobs.slice(0, 12).map((job) => (
            <article
              key={job.id}
              className={cn(
                "grid gap-3 rounded-lg border bg-[var(--card2)] p-3 text-xs xl:grid-cols-[minmax(210px,1.05fr)_minmax(180px,.9fr)_minmax(240px,1.05fr)_minmax(260px,1.05fr)] xl:items-start",
                job.status === "failed" ? "border-red-200 bg-red-50/40" : job.status === "canceled" ? "border-slate-200 bg-slate-50" : "border-[var(--border)]"
              )}
            >
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <strong className="truncate text-[13px] text-[var(--text)]">{job.id}</strong>
                  <Badge tone={jobStatusTone(job.status)}>{localizedJobStatusLabel(job.status)}</Badge>
                </div>
                <div className="mt-1 truncate text-[var(--muted)]">{job.productSku || job.productPath}</div>
              </div>
              <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-x-2 gap-y-1">
                <MetricLine label={tLedger("jobs.channel")} value={providerLabel(job.provider, makeAppTranslator("status"))} />
                <MetricLine label={tLedger("jobs.duration")} value={formatDuration(job.durationSeconds)} />
                <MetricLine label={tLedger("jobs.template")} value={localizedTemplateLabel(job.template, tVideoGlobal)} />
                <MetricLine label={tLedger("jobs.callType")} value={job.confirmPaid ? tLedger("jobs.realModel") : tLedger("jobs.mockTask")} />
              </div>
              <div className="grid min-w-0 grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-1">
                <MetricLine label={tLedger("jobs.created")} value={formatDateTime(job.createdAt)} />
                <MetricLine label={tLedger("jobs.updated")} value={formatDateTime(job.updatedAt)} />
                <MetricLine label="Tokens" value={formatNumber(job.totalTokens)} />
                <MetricLine label={tLedger("jobs.estimatedCost")} value={job.estimatedCostCny === undefined ? "-" : `¥${money(job.estimatedCostCny)}`} />
                {job.error ? <MetricLine label={tLedger("jobs.error")} value={readableVideoJobError(job.error, job.errorDetails, appLocale)} /> : null}
              </div>
              <div className="grid min-w-0 gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-2">
                <div className="text-[11px] font-black text-[var(--muted)]">{tLedger("jobs.result")}</div>
                <div className="flex flex-wrap gap-2">
                  <PackageLink href={job.finalVideoUrl} label={tLedger("jobs.openVideo")} />
                  {job.finalVideoUrl ? (
                    <Button asChild size="sm">
                      <a href={job.finalVideoUrl} download={videoDownloadFileName(job, videoJobDownloadProductContext(job, products))}>
                        <Download size={13} />
                        {tLedger("jobs.downloadVideo")}
                      </a>
                    </Button>
                  ) : null}
                  <PackageLink href={job.reportUrl} label={tLedger("jobs.openReport")} />
                  {job.status === "queued" ? (
                    <Button size="sm" variant="danger" onClick={() => void onCancel(job.id)}>
                      <StopCircle size={13} />
                      {tLedger("jobs.cancelQueued")}
                    </Button>
                  ) : null}
                  {job.status === "failed" && job.canRecoverDownload ? (
                    <Button size="sm" onClick={() => void onRecoverDownload(job)}>
                      <Download size={13} />
                      {tLedger("jobs.redownload")}
                    </Button>
                  ) : job.status === "failed" ? (
                    <Button size="sm" onClick={() => void onRetry(job)}>
                      <RefreshCcw size={13} />
                      {tLedger("jobs.retry")}
                    </Button>
                  ) : null}
                </div>
                {!job.finalVideoUrl && !job.reportUrl ? (
                  <div className="text-[11px] font-semibold text-[var(--muted)]">{videoJobResultHint(job, appLocale)}</div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Clapperboard size={28} />} text={tLedger("jobs.empty")} />
      )}
    </Card>
  );
}

function AuditLogPanel({ auditLog }: { auditLog?: AuditLogLedger }) {
  const tLedger = makeAppTranslator("ledger");
  return (
    <Card className="bg-[var(--card)]">
      <PanelTitle icon={<ClipboardCheck size={16} />} right={<Badge>{auditLog ? auditLog.summary.totalEvents : "audit"}</Badge>}>
        {tLedger("audit.title")}
      </PanelTitle>
      {auditLog ? (
        <div className="grid gap-3">
          <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3 text-xs md:grid-cols-3">
            <MetricInline label={tLedger("audit.totalEvents")} value={formatNumber(auditLog.summary.totalEvents)} />
            <MetricInline label={tLedger("audit.latestAction")} value={auditLog.events[0] ? formatDateTime(auditLog.events[0].at) : "-"} />
            <MetricInline label={tLedger("audit.recordMode")} value={tLedger("audit.localJsonl")} />
          </div>
          {auditLog.events.length > 0 ? (
            <div className="grid gap-2">
              {auditLog.events.slice(0, 10).map((event) => (
                <article key={event.id} className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--card2)] p-3 text-xs lg:grid-cols-[150px_minmax(160px,1fr)_minmax(170px,1.4fr)_120px] lg:items-center">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-black text-[var(--text)]">{auditActionLabel(event.action, tLedger)}</div>
                    <div className="truncate text-[var(--muted)]">{event.action}</div>
                  </div>
                  <div className="min-w-0 truncate text-[var(--muted)]">{event.target || "-"}</div>
                  <div className="min-w-0 truncate text-[var(--muted)]">{auditMetadataSummary(event.metadata)}</div>
                  <div className="text-[var(--muted)]">{formatDateTime(event.at)}</div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState icon={<ClipboardCheck size={28} />} text={tLedger("audit.empty")} />
          )}
        </div>
      ) : (
        <EmptyState icon={<ClipboardCheck size={28} />} text={tLedger("audit.loading")} />
      )}
    </Card>
  );
}

function StorageBackupPanel({
  report,
  backups,
  onCreateBackup,
  isBusy
}: {
  report?: StorageBackupReport;
  backups?: LocalBackupLedger;
  onCreateBackup: () => Promise<void>;
  isBusy: boolean;
}) {
  const tLedger = makeAppTranslator("ledger");
  return (
    <Card className="bg-[var(--card)]">
      <PanelTitle
        icon={<Database size={16} />}
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge tone="ok">{tLedger("storage.longTerm")}</Badge>
            <Button size="sm" variant="soft" onClick={() => void onCreateBackup()} disabled={isBusy}>
              <FileArchive size={13} />
              {tLedger("storage.createBackup")}
            </Button>
          </div>
        }
      >
        {tLedger("storage.title")}
      </PanelTitle>
      {report ? (
        <div className="grid gap-3">
          <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3 text-xs md:grid-cols-5">
            <MetricInline label={tLedger("storage.backupSize")} value={formatBytes(report.summary.totalBytes)} />
            <MetricInline label={tLedger("storage.fileCount")} value={formatNumber(report.summary.totalFiles)} />
            <MetricInline label={tLedger("storage.video")} value={formatNumber(report.summary.videoFiles)} />
            <MetricInline label="Manifest" value={formatNumber(report.summary.manifestFiles)} />
            <MetricInline label={tLedger("storage.references")} value={formatNumber(report.summary.referenceImages)} />
          </div>
          <div className="grid gap-2 lg:grid-cols-3">
            {report.scopes.map((scope) => (
              <article key={scope.id} className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--card2)] p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <strong className="truncate text-[13px] text-[var(--text)]">{scope.label}</strong>
                  <Badge tone={scope.mustBackup ? "ok" : "neutral"}>{scope.mustBackup ? tLedger("storage.required") : tLedger("storage.optional")}</Badge>
                </div>
                <div className="truncate text-[var(--muted)]">{scope.path}</div>
                <div className="grid grid-cols-2 gap-2">
                  <MetricInline label={tLedger("storage.capacity")} value={formatBytes(scope.totalBytes)} />
                  <MetricInline label={tLedger("storage.files")} value={formatNumber(scope.fileCount)} />
                  <MetricInline label={tLedger("storage.video")} value={formatNumber(scope.videoFiles)} />
                  <MetricInline label="JSON" value={formatNumber(scope.jsonFiles)} />
                </div>
              </article>
            ))}
          </div>
          <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--card2)] p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[13px] font-black text-[var(--text)]">{tLedger("storage.localBackups")}</div>
                <div className="mt-1 text-[var(--muted)]">
                  {backups ? tLedger("storage.backupSummary", { count: formatNumber(backups.summary.totalBackups), size: formatBytes(backups.summary.totalBytes) }) : tLedger("storage.loadingBackups")}
                </div>
              </div>
              <Badge tone="neutral">data/backups</Badge>
            </div>
            {backups && backups.backups.length > 0 ? (
              <div className="grid gap-2">
                {backups.backups.slice(0, 5).map((backup) => (
                  <article key={backup.path} className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-2 min-[760px]:grid-cols-[minmax(180px,1fr)_120px_110px_auto] min-[760px]:items-center">
                    <div className="min-w-0">
                      <div className="truncate font-black text-[var(--text)]">{backup.fileName}</div>
                      <div className="truncate text-[var(--muted)]">{backup.path}</div>
                    </div>
                    <div className="font-semibold text-[var(--muted)]">{formatBytes(backup.sizeBytes)}</div>
                    <div className="font-semibold text-[var(--muted)]">{formatDateTime(backup.createdAt)}</div>
                    <PackageLink href={backup.url} label={tLedger("storage.downloadBackup")} />
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState icon={<FileArchive size={28} />} text={tLedger("storage.emptyBackups")} />
            )}
          </div>
          <CopyBlock title={tLedger("storage.backupCommand")}>
            <pre className="m-0 whitespace-pre-wrap text-xs leading-relaxed text-[var(--text)]">
              {report.backupCommands.join("\n")}
            </pre>
          </CopyBlock>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800">
            {report.notes.map((note) => (
              <div key={note}>{note}</div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState icon={<Database size={28} />} text={tLedger("storage.loading")} />
      )}
    </Card>
  );
}

function VideoAssetsPanel({ assets, onDelete, isBusy }: { assets?: VideoAssetLedger; onDelete: (asset: VideoAsset) => Promise<void>; isBusy: boolean }) {
  const tLedger = makeAppTranslator("ledger");
  return (
    <Card className="bg-[var(--card)]">
      <PanelTitle icon={<Database size={16} />} right={<Badge>{assets ? formatBytes(assets.summary.totalBytes) : "local"}</Badge>}>
        {tLedger("assets.title")}
      </PanelTitle>
      {assets ? (
        <div className="grid gap-3">
          <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3 text-xs md:grid-cols-5">
            <MetricInline label={tLedger("assets.totalSize")} value={formatBytes(assets.summary.totalBytes)} />
            <MetricInline label={tLedger("assets.final")} value={formatNumber(assets.summary.finalAssets)} />
            <MetricInline label={tLedger("assets.raw")} value={formatNumber(assets.summary.rawAssets)} />
            <MetricInline label={tLedger("assets.publishPackage")} value={formatNumber(assets.summary.publishAssets)} />
            <MetricInline label={tLedger("assets.missing")} value={formatNumber(assets.summary.missingAssets)} />
          </div>
          <div className="grid gap-2">
            {assets.assets.slice(0, 10).map((asset) => (
              <article
                key={`${asset.kind}-${asset.path}`}
                className={cn(
                  "grid gap-2 rounded-lg border bg-[var(--card2)] p-3 text-xs lg:grid-cols-[96px_minmax(150px,1fr)_minmax(170px,1fr)_96px_120px_minmax(170px,auto)] lg:items-center",
                  asset.exists ? "border-[var(--border)]" : "border-red-200 bg-red-50/50"
                )}
              >
                <Badge tone={asset.exists ? videoAssetKindTone(asset.kind) : "danger"}>{videoAssetKindLabel(asset.kind, tLedger)}</Badge>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-black">{asset.productSku || "-"}</div>
                  <div className="truncate text-[var(--muted)]">{asset.jobId}</div>
                </div>
                <div className="min-w-0 truncate text-[var(--muted)]">{asset.path}</div>
                <strong>{formatBytes(asset.sizeBytes)}</strong>
                <span className="text-[var(--muted)]">{asset.source === "publish-package" ? tLedger("assets.sourcePublishPackage") : tLedger("assets.sourceReport")}</span>
                <div className="flex flex-wrap gap-2">
                  <PackageLink href={asset.url} label={tLedger("assets.openVideo")} />
                  <Button size="sm" variant="danger" disabled={!asset.exists || isBusy} onClick={() => void onDelete(asset)}>
                    <StopCircle size={13} />
                    {tLedger("assets.deleteFile")}
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {assets.assets.length === 0 ? <EmptyState icon={<Database size={28} />} text={tLedger("assets.empty")} /> : null}
        </div>
      ) : (
        <EmptyState icon={<Database size={28} />} text={tLedger("assets.loading")} />
      )}
    </Card>
  );
}

function ProviderUsagePanel({
  usage,
  status,
  model,
  setStatus,
  setModel,
  onRefresh,
  isBusy
}: {
  usage?: ProviderUsageReport;
  status: string;
  model: string;
  setStatus: (status: string) => void;
  setModel: (model: string) => void;
  onRefresh: () => Promise<void>;
  isBusy: boolean;
}) {
  const tLedger = makeAppTranslator("ledger");
  return (
    <Card className="bg-[var(--card)]">
      <PanelTitle icon={<BadgeJapaneseYen size={16} />} right={<Badge>{usage ? `${usage.items.length}/${usage.total}` : tLedger("providerUsage.readonly")}</Badge>}>
        {tLedger("providerUsage.title")}
      </PanelTitle>
      <div className="mb-3 grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3 md:grid-cols-[150px_minmax(220px,1fr)_auto] md:items-end">
        <Field label={tLedger("providerUsage.status")}>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="succeeded">{localizedJobStatusLabel("succeeded")}</option>
            <option value="running">{localizedJobStatusLabel("running")}</option>
            <option value="queued">{localizedJobStatusLabel("queued")}</option>
            <option value="failed">{localizedJobStatusLabel("failed")}</option>
            <option value="cancelled">{localizedJobStatusLabel("cancelled")}</option>
            <option value="all">{localizedJobStatusLabel("all")}</option>
          </Select>
        </Field>
        <Field label={tLedger("providerUsage.model")}>
          <Input value={model} onChange={(event) => setModel(event.target.value)} placeholder="doubao-seedance-2-0-260128" />
        </Field>
        <Button variant="primary" onClick={() => void onRefresh()} disabled={isBusy}>
          <RefreshCcw size={14} />
          {tLedger("providerUsage.refresh")}
        </Button>
      </div>
      {usage ? (
        <div className="grid gap-3">
          <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3 text-xs md:grid-cols-4">
            <MetricInline label={tLedger("providerUsage.officialTasks")} value={formatNumber(usage.total)} />
            <MetricInline label={tLedger("providerUsage.usage")} value={formatNumber(usage.totalTokens)} />
            <MetricInline label={tLedger("providerUsage.estimatedCost")} value={`¥${money(usage.estimatedCostCny)}`} />
            <MetricInline label={tLedger("providerUsage.unitPrice")} value={`¥${money(usage.tokenPriceCnyPerMillion)} / ${tLedger("providerUsage.perMillionUsage")}`} />
          </div>
          <div className="grid gap-2">
            {usage.items.map((item) => (
              <article
                key={item.id}
                className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--card2)] p-3 text-xs lg:grid-cols-[minmax(160px,1fr)_minmax(220px,1.2fr)_90px_90px_100px_130px] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-black">{item.id}</div>
                  <div className="truncate text-[var(--muted)]">{formatProviderUnixTime(item.createdAt)}</div>
                </div>
                <div className="min-w-0 truncate text-[var(--muted)]">{item.model || "-"}</div>
                <Badge tone={providerUsageStatusTone(item.status)}>{localizedJobStatusLabel(item.status)}</Badge>
                <span>{formatDuration(item.durationSeconds)}</span>
                <strong>{formatCompactNumber(item.totalTokens)}</strong>
                <strong className="text-[var(--danger)]">¥{money(item.estimatedCostCny)}</strong>
              </article>
            ))}
          </div>
          {usage.items.length === 0 ? <EmptyState icon={<BadgeJapaneseYen size={28} />} text={tLedger("providerUsage.empty")} /> : null}
        </div>
      ) : (
        <EmptyState icon={<BadgeJapaneseYen size={28} />} text={tLedger("providerUsage.initial")} />
      )}
    </Card>
  );
}

function FeeSummaryPanel({ ledger, reports }: { ledger?: Ledger; reports: Report[] }) {
  const tLedger = makeAppTranslator("ledger");
  const summary = ledger?.summary;
  const productRows = buildFeeProductRows(reports);
  const totalJobs = summary?.totalJobs ?? productRows.reduce((total, row) => total + row.jobs, 0);
  const paidJobs = summary?.paidJobs ?? productRows.reduce((total, row) => total + row.paidJobs, 0);
  const mockJobs = summary?.mockJobs ?? productRows.reduce((total, row) => total + row.mockJobs, 0);
  const estimatedCostCny = summary?.estimatedCostCny ?? productRows.reduce((total, row) => roundMoney(total + row.estimatedCostCny), 0);
  const finalVideos = summary?.finalVideos ?? productRows.reduce((total, row) => total + row.finalVideos, 0);
  return (
    <Card className="bg-[var(--card)]">
      <PanelTitle icon={<WalletCards size={16} />} right={<Badge>{tLedger("fees.productCount", { count: formatNumber(productRows.length) })}</Badge>}>
        {tLedger("fees.title")}
      </PanelTitle>
      <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3 text-xs sm:grid-cols-2 lg:grid-cols-5">
        <MetricInline label={tLedger("fees.totalJobs")} value={formatNumber(totalJobs)} />
        <MetricInline label={tLedger("fees.paidJobs")} value={formatNumber(paidJobs)} />
        <MetricInline label={tLedger("fees.mockJobs")} value={formatNumber(mockJobs)} />
        <MetricInline label={tLedger("fees.estimatedCost")} value={`¥${money(estimatedCostCny)}`} />
        <MetricInline label={tLedger("fees.finalVideos")} value={formatNumber(finalVideos)} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-black text-[var(--text)]">{tLedger("fees.byProduct")}</h3>
        <span className="text-xs font-semibold text-[var(--muted)]">{tLedger("fees.scopeHint")}</span>
      </div>
      <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--field)]">
        <table className="w-full min-w-[620px] border-separate border-spacing-0 text-left text-xs">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="border-b border-[var(--border)] px-3 py-2 font-black">{tLedger("fees.table.product")}</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-black">{tLedger("fees.table.totalJobs")}</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-black">{tLedger("fees.table.paidJobs")}</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-black">{tLedger("fees.table.mockJobs")}</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-black">{tLedger("fees.table.finalVideos")}</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-black">{tLedger("fees.table.estimatedCost")}</th>
            </tr>
          </thead>
          <tbody>
            {productRows.map((row) => (
              <tr key={row.productSku}>
                <td className="border-b border-[var(--border)] px-3 py-2 font-black text-[var(--text)]">{row.productSku}</td>
                <td className="border-b border-[var(--border)] px-3 py-2">{formatNumber(row.jobs)}</td>
                <td className="border-b border-[var(--border)] px-3 py-2">{formatNumber(row.paidJobs)}</td>
                <td className="border-b border-[var(--border)] px-3 py-2">{formatNumber(row.mockJobs)}</td>
                <td className="border-b border-[var(--border)] px-3 py-2">{formatNumber(row.finalVideos)}</td>
                <td className="border-b border-[var(--border)] px-3 py-2 font-black text-[var(--danger)]">¥{money(row.estimatedCostCny)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {productRows.length === 0 ? <EmptyState icon={<WalletCards size={28} />} text={tLedger("fees.empty")} /> : null}
      </div>
    </Card>
  );
}

function ReportsPanel({
  reports,
  allReports,
  filters,
  productOptions,
  providerOptions,
  statusOptions,
  setFilters,
  onReuse,
  onUsage,
  onCancel
}: {
  reports: Report[];
  allReports: Report[];
  filters: Filters;
  productOptions: string[];
  providerOptions: string[];
  statusOptions: string[];
  setFilters: (filters: Filters) => void;
  onReuse: (manifest: string) => void;
  onUsage: (taskId: string) => Promise<void>;
  onCancel: (taskId: string) => Promise<void>;
}) {
  const tLedger = makeAppTranslator("ledger");
  const tStatus = makeAppTranslator("status");
  return (
    <Card className="bg-[var(--card)]">
      <PanelTitle icon={<FileVideo size={16} />} right={<Badge>{reports.length}/{allReports.length}</Badge>}>{tLedger("reports.title")}</PanelTitle>
      <div className="mb-3 grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3 md:grid-cols-[repeat(3,minmax(130px,1fr))_auto] md:items-end">
        <FilterSelect label={tLedger("reports.filters.product")} value={filters.productSku} options={productOptions} allLabel={tLedger("reports.filters.allProducts")} onChange={(value) => setFilters({ ...filters, productSku: value })} />
        <FilterSelect label={tLedger("reports.filters.provider")} value={filters.provider} options={providerOptions} allLabel={tLedger("reports.filters.allProviders")} formatOption={(value) => providerLabel(value, tStatus)} onChange={(value) => setFilters({ ...filters, provider: value })} />
        <FilterSelect label={tLedger("reports.filters.status")} value={filters.status} options={statusOptions} allLabel={tLedger("reports.filters.allStatuses")} formatOption={localizedJobStatusLabel} onChange={(value) => setFilters({ ...filters, status: value })} />
        <label className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--field)] px-3 text-xs font-bold">
          <input className="h-4 w-4 accent-[var(--accent)]" type="checkbox" checked={filters.finalOnly} onChange={(event) => setFilters({ ...filters, finalOnly: event.target.checked })} />
          {tLedger("reports.filters.finalOnly")}
        </label>
      </div>
      <div className="grid gap-3">
        {reports.map((report) => (
          <article key={report.path} className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--card2)] p-3 xl:grid-cols-[minmax(160px,230px)_minmax(260px,1fr)_minmax(260px,340px)]">
            <div className="aspect-[9/16] max-h-[360px] overflow-hidden rounded-lg border border-[var(--border)] bg-[#151a17]">
              {report.finalVideoUrl ? (
                <video className="h-full w-full object-contain" controls playsInline preload="metadata" src={report.finalVideoUrl} />
              ) : (
                <div className="grid h-full place-items-center text-xs text-slate-200">{tLedger("reports.noFinalVideo")}</div>
              )}
            </div>
            <div className="grid content-start gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-black">{report.productSku || "-"}</div>
                  <div className="truncate text-xs text-[var(--muted)]">{report.path}</div>
                </div>
                <Badge>{localizedJobStatusLabel(report.status)}</Badge>
              </div>
              <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                <MetricLine label={tLedger("reports.provider")} value={providerLabel(report.provider, tStatus)} />
                <MetricLine label={tLedger("reports.duration")} value={formatDuration(report.durationSeconds)} />
                <MetricLine label="Tokens" value={formatNumber(report.billing?.totalTokens)} />
                <MetricLine label={tLedger("reports.estimatedCost")} value={formatReportCost(report)} />
                <MetricLine label={tLedger("reports.reusedRaw")} value={report.reusedRawManifest ? tLedger("reports.yes") : tLedger("reports.no")} />
                <MetricLine label="Task" value={report.taskId || "-"} />
              </div>
            </div>
            <div className="grid content-start gap-2">
              <Button disabled={!report.rawManifestPath} onClick={() => report.rawManifestPath && onReuse(report.rawManifestPath)}>
                <Database size={14} />
                {tLedger("reports.reuseRaw")}
              </Button>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button size="sm" disabled={!report.taskId} onClick={() => report.taskId && void onUsage(report.taskId)}>
                  <Gauge size={13} />
                  {tLedger("reports.queryUsage")}
                </Button>
                <Button size="sm" variant="danger" disabled={!report.taskId} onClick={() => report.taskId && void onCancel(report.taskId)}>
                  <StopCircle size={13} />
                  {tLedger("reports.cancelQueued")}
                </Button>
              </div>
              <div className="truncate text-xs text-[var(--muted)]">Raw: {report.rawManifestPath || "-"}</div>
              <div className="truncate text-xs text-[var(--muted)]">Final: {report.finalOutputPath || "-"}</div>
            </div>
          </article>
        ))}
        {reports.length === 0 ? <EmptyState icon={<FileVideo size={28} />} text={tLedger("reports.empty")} /> : null}
      </div>
    </Card>
  );
}

type KpiTone = "clay" | "green" | "ember" | "ochre" | "coral" | "sage";

function KpiGrid({ items }: { items: Array<{ label: string; value: string; hint: string; icon: typeof Package; tone: KpiTone }> }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6" aria-label={tAppGlobal("dashboard.kpiAriaLabel")}>
      {items.map(({ label, value, hint, icon: Icon, tone }) => (
        <article key={label} className="grid min-h-[106px] min-w-0 grid-cols-[44px_minmax(0,1fr)] items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
          <div className={cn("grid h-11 w-11 place-items-center rounded-lg", toneClass(tone))}>
            <Icon size={20} />
          </div>
          <div className="min-w-0">
            <span className="block text-xs font-bold text-[var(--muted)]">{label}</span>
            <strong className="mt-1 block truncate text-[24px] font-black leading-none">{value}</strong>
            <small className="mt-1 block truncate text-xs font-semibold text-[var(--muted)]">{hint}</small>
          </div>
        </article>
      ))}
    </section>
  );
}

function ConsoleSecondarySyncNotice({
  status,
  onRetry
}: {
  status: ConsoleSecondarySnapshotStatus;
  onRetry: () => void;
}) {
  const tStatus = makeAppTranslator("status");
  if (status !== "loading" && status !== "error") {
    return null;
  }
  const failed = status === "error";
  return (
    <div className={cn(
      "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-semibold",
      failed
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)]"
    )}>
      <div className="flex min-w-0 items-center gap-2">
        {failed ? <AlertTriangle size={14} /> : <RefreshCcw className="animate-spin" size={14} />}
        <span>{failed ? tStatus("backgroundSyncFailedShort") : tStatus("backgroundSyncing")}</span>
      </div>
      {failed ? (
        <Button size="sm" variant="soft" onClick={onRetry}>
          <RefreshCcw size={13} />
          {tAppGlobal("commonActions.refresh")}
        </Button>
      ) : null}
    </div>
  );
}

function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src={brandLogoUrl}
      alt="Haitu"
      className={cn("block shrink-0 rounded-lg shadow-[0_10px_20px_rgba(96,64,43,.18)]", className)}
      draggable={false}
    />
  );
}

function PanelTitle({ children, icon, right }: { children: ReactNode; icon?: ReactNode; right?: ReactNode }) {
  return <CardHeader heading={children} icon={icon} right={right} />;
}

function MiniMetric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3">
      <span className="block text-xs font-bold text-[var(--muted)]">{label}</span>
      <strong className="mt-1 block truncate text-[22px] font-black leading-tight">{value}</strong>
      {hint ? <small className="mt-1 block truncate text-xs text-[var(--muted)]">{hint}</small> : null}
    </div>
  );
}

function CopyBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-3 grid gap-2">
      <h3 className="m-0 text-[13px] font-black">{title}</h3>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3">{children}</div>
    </div>
  );
}

function MetricInline({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="block truncate text-[var(--muted)]">{label}</span>
      <strong className="block truncate text-[var(--text)]">{value}</strong>
    </div>
  );
}

function PaymentRateMetric({
  label,
  value,
  refreshLabel,
  loading,
  onRefresh
}: {
  label: string;
  value: ReactNode;
  refreshLabel: string;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="min-w-0">
      <span className="flex min-w-0 items-center gap-1.5 text-[var(--muted)]">
        <span className="truncate">{label}</span>
        <button
          type="button"
          className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[var(--muted)] transition hover:bg-[var(--field)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(10,163,148,.16)] disabled:cursor-wait disabled:opacity-60"
          aria-label={refreshLabel}
          title={refreshLabel}
          disabled={loading}
          onClick={onRefresh}
        >
          <RefreshCcw className={cn("h-3 w-3", loading && "animate-spin")} />
        </button>
      </span>
      <strong className="mt-0.5 block truncate text-[var(--text)]">{value}</strong>
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <span className="text-[var(--muted)]">{label}</span>
      <strong className="min-w-0 truncate">{value}</strong>
    </>
  );
}

function FilterSelect({
  label,
  value,
  options,
  allLabel,
  formatOption = (option: string) => option,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  allLabel: string;
  formatOption?: (option: string) => string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <Select value={options.includes(value) ? value : "all"} onChange={(event) => onChange(event.target.value)}>
        <option value="all">{allLabel}</option>
        {options.map((option) => <option key={option} value={option}>{formatOption(option)}</option>)}
      </Select>
    </Field>
  );
}

function PackageLink({ href, label }: { href?: string; label: string }) {
  if (!href) return null;
  return (
    <Button asChild size="sm">
      <a href={href} target="_blank" rel="noreferrer">
        <ExternalLink size={13} />
        {label}
      </a>
    </Button>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="grid min-h-[120px] place-items-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--panel2)] p-6 text-center text-sm font-bold text-[var(--muted)]">
      <div className="grid justify-items-center gap-2">
        <span className="text-[var(--accent)]">{icon}</span>
        {text}
      </div>
    </div>
  );
}

function ConsoleSectionLoadingState({ label }: { label: string }) {
  return (
    <Card className="grid min-h-[260px] place-items-center bg-[var(--card)]">
      <div className="grid justify-items-center gap-3 text-center">
        <span className="grid h-10 w-10 place-items-center rounded-[8px] border border-[var(--border)] bg-[var(--panel2)] text-[var(--accent)]">
          <RefreshCcw size={18} className="animate-spin" />
        </span>
        <div className="text-[15px] font-black text-[var(--text)]">{tAppGlobal("shell.consoleLoading", { label })}</div>
        <div className="max-w-[320px] text-[12px] font-semibold leading-5 text-[var(--muted)]">
          {tAppGlobal("shell.consoleLoadingDetail")}
        </div>
      </div>
    </Card>
  );
}

function ConsoleSectionErrorState({
  label,
  message,
  onRetry
}: {
  label: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card className="grid min-h-[260px] place-items-center bg-[var(--card)]">
      <div className="grid max-w-[560px] justify-items-center gap-3 text-center">
        <span className="grid h-10 w-10 place-items-center rounded-[8px] border border-red-200 bg-red-50 text-red-600">
          <AlertTriangle size={18} />
        </span>
        <div className="text-[15px] font-black text-[var(--text)]">{tAppGlobal("shell.consoleLoadFailed", { label })}</div>
        <div className="max-w-[520px] break-words text-[12px] font-semibold leading-5 text-[var(--muted)]">{message}</div>
        <Button type="button" variant="primary" onClick={onRetry}>
          <RefreshCcw size={14} />
          {tAppGlobal("actions.retry")}
        </Button>
      </div>
    </Card>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function attachQcToLedger(ledger: Ledger, qcSummary: QcSummaryLedger): Ledger {
  const qcByJob = new Map(qcSummary.items.map((item) => [item.jobId, item]));
  return {
    ...ledger,
    jobs: ledger.jobs.map((job) => ({
      ...job,
      qc: qcByJob.get(job.id)
    })),
    products: ledger.products.map((group) => ({
      ...group,
      jobs: group.jobs.map((job) => ({
        ...job,
        qc: qcByJob.get(job.id)
      }))
    }))
  };
}

function buildFeeProductRows(reports: Report[]): FeeProductCostRow[] {
  const groups = new Map<string, FeeProductCostRow>();
  for (const report of reports) {
    const productSku = report.productSku || productNameFromPath(report.path);
    const current = groups.get(productSku) ?? {
      productSku,
      jobs: 0,
      paidJobs: 0,
      mockJobs: 0,
      estimatedCostCny: 0,
      finalVideos: 0
    };
    const isMock = !report.provider || report.provider === "mock";
    current.jobs += 1;
    current.mockJobs += isMock ? 1 : 0;
    current.paidJobs += isMock ? 0 : 1;
    current.estimatedCostCny = roundMoney(current.estimatedCostCny + reportEstimatedCostCny(report));
    current.finalVideos += report.finalVideoUrl ? 1 : 0;
    groups.set(productSku, current);
  }
  return Array.from(groups.values()).sort(
    (left, right) => right.estimatedCostCny - left.estimatedCostCny || right.jobs - left.jobs || left.productSku.localeCompare(right.productSku)
  );
}

function createdAtFromJobId(id: string): string | undefined {
  const match = id.match(/job-(\d{14})/);
  if (!match) {
    return undefined;
  }
  const raw = match[1] ?? "";
  const year = raw.slice(0, 4);
  const month = raw.slice(4, 6);
  const day = raw.slice(6, 8);
  const hour = raw.slice(8, 10);
  const minute = raw.slice(10, 12);
  const second = raw.slice(12, 14);
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function createdAtFromReportPath(path?: string): string | undefined {
  if (!path) {
    return undefined;
  }
  const match = path.match(/console-(\d{13})/);
  if (!match) {
    return undefined;
  }
  const date = new Date(Number(match[1]));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function productNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop()?.replace(/\.json$/i, "") || "unknown";
}

function toneClass(tone: KpiTone) {
  const classes = {
    clay: "bg-[#f4e6d4] text-[#6f442c]",
    green: "bg-[color-mix(in_srgb,var(--accent)_11%,var(--field))] text-[var(--accent)]",
    ember: "bg-[#f8e3d7] text-[#c65a36]",
    ochre: "bg-[#f5e5bf] text-[#9b6d16]",
    coral: "bg-[#fae4dc] text-[#b95538]",
    sage: "bg-[#e6ead7] text-[#667b58]"
  };
  return classes[tone];
}

function localizedJobStatusLabel(value?: string, locale?: AppLocale): string {
  if (!value) return "-";
  const label = i18n.t(`app:status.jobStatuses.${value}`, { lng: locale });
  return label.includes(`jobStatuses.${value}`) ? value : label;
}

function providerLabel(value?: string, tStatus: AppTranslator = makeAppTranslator("status")): string {
  if (value === "mock") return tStatus("providers.mock");
  if (value === "volcengine-seedance") return tStatus("providers.volcengineSeedance");
  return value || "-";
}

function videoModelLabel(provider?: string, model?: string): string {
  if (provider === "mock") return tAppGlobal("status.providers.mock");
  if (provider === "volcengine-seedance") {
    return model ? modelLabelForId("volcengine-seedance", model) : "seedance-2.0-fast";
  }
  return provider || "-";
}

function finalLanguageLabel(value?: string, tVideo?: VideoStudioTranslator): string {
  const t = tVideo ?? tVideoGlobal;
  if (value === "en") return t("languages.en");
  if (value === "zh") return t("languages.zh");
  return t("languages.ja");
}

function compactFinalLanguageLabel(value?: string, tVideo?: VideoStudioTranslator): string {
  return finalLanguageLabel(value, tVideo).replace(/文$|语$|ese$/i, "");
}

function videoResolutionLabel(value?: string): string {
  if (value === "4k") return "4K";
  return value || defaultVideoResolution;
}

function videoAspectRatioLabel(value: VideoAspectRatio, tVideo: VideoStudioTranslator): string {
  return value === "16:9" ? tVideo("aspectRatios.horizontal") : tVideo("aspectRatios.vertical");
}

function ActionButtonCost({
  tVideo,
  estimate,
  status = "loading"
}: {
  tVideo: VideoStudioTranslator;
  estimate?: BillingActionEstimate;
  status?: BillingEstimatesStatus;
}) {
  if (!estimate) {
    const fallbackLabel = status === "error"
      ? tVideo("costHints.failed")
      : status === "idle" ? tVideo("costHints.unavailable") : tVideo("costHints.loading");
    return (
      <span className="action-button-cost ml-1.5 inline-flex min-h-5 shrink-0 items-center whitespace-nowrap text-[11px] font-black leading-5 opacity-80">
        {fallbackLabel}
      </span>
    );
  }
  const detail = tVideo("costHints.detail", {
    upstream: money(estimate.upstreamEstimatedCostCny),
    serviceFee: money(estimate.serviceFeeCny),
    mode: estimate.apiBillingMode === "platform" ? tVideo("costHints.platformMode") : tVideo("costHints.byokMode")
  });
  const label = tVideo("costHints.estimated", {
    amount: money(estimate.walletEstimatedChargeCny)
  });
  return (
    <span
      className="action-button-cost ml-1.5 inline-flex min-h-5 shrink-0 items-center whitespace-nowrap text-[11px] font-black leading-5 opacity-90"
      title={detail}
      aria-label={`${label} · ${detail}`}
    >
      {label}
    </span>
  );
}

function versionLabel(index: number, tVideo?: VideoStudioTranslator): string {
  return (tVideo ?? tVideoGlobal)("labels.version", { index: index + 1 });
}

function localizedVideoLabel(index: number, tVideo: VideoStudioTranslator): string {
  return tVideo("labels.video", { index: index + 1 });
}

function creativeVersionMetaParts(job: CreativeVersionItem, locale?: AppLocale): string[] {
  return [
    videoModelLabel(job.provider, job.providerModel),
    formatDuration(job.durationSeconds),
    formatCreativeVersionTime(job, { locale })
  ].filter((part) => part && part !== "-");
}

function localizedTemplateLabel(value: string | undefined, tVideo: VideoStudioTranslator): string {
  if (value === "auto") return tVideo("templates.auto");
  if (value === "lifestyle") return tVideo("templates.lifestyle");
  if (value === "scene") return tVideo("templates.scene");
  if (value === "pain-point") return tVideo("templates.painPoint");
  if (value === "benefit") return tVideo("templates.benefit");
  if (value === "ugc") return tVideo("templates.ugc");
  if (value === "unboxing") return tVideo("templates.unboxing");
  if (value === "detail") return tVideo("templates.detail");
  return value || "-";
}

function compactTemplateLabel(value: string | undefined, tVideo: VideoStudioTranslator): string {
  return localizedTemplateLabel(value, tVideo).replace(/\s*型$/, "");
}

function localizedModelConfigChoiceLabel(value: ModelConfigChoice, models: ProviderConfigItem[], tVideo: VideoStudioTranslator): string {
  const effectiveValue = effectiveModelConfigChoice(value, models);
  const model = models.find((item) => item.configId === effectiveValue);
  if (!model) {
    return tVideo(value && value !== "auto" ? "models.deleted" : "models.unselected");
  }
  return modelLabelForId(model.id, model.model);
}

function localizedProductAutoSaveStatusLabel(status: ProductAutoSaveStatus, tVideo: VideoStudioTranslator): string {
  if (status === "saving") return tVideo("autosave.saving");
  if (status === "saved") return tVideo("autosave.saved");
  if (status === "failed") return tVideo("autosave.failed");
  return "";
}

function localizedProductGenerationReadiness({
  selectedProduct,
  importText,
  tVideo
}: {
  selectedProduct?: ProductDetail;
  importText: string;
  tVideo: VideoStudioTranslator;
}): { ready: boolean; label: string } {
  if (selectedProduct) {
    return { ready: true, label: tVideo("readiness.saved") };
  }
  if (!importText.trim()) {
    return { ready: false, label: tVideo("readiness.empty") };
  }
  return { ready: true, label: tVideo("readiness.willOrganize") };
}

function estimatedReferenceImageGenerationCount(existingReferenceCount: number): number {
  return Math.max(1, Math.min(3, 3 - Math.max(0, existingReferenceCount)));
}

function localizedProductFactsStatusLabel({
  selectedProduct,
  importText,
  tVideo
}: {
  selectedProduct?: ProductDetail;
  importText: string;
  tVideo: VideoStudioTranslator;
}): string {
  if (!selectedProduct) {
    return importText.trim() ? tVideo("facts.raw") : tVideo("facts.empty");
  }
  return tVideo("facts.savedPackage");
}

function localizedStoryboardStatusLabel(storyboardDraftSource: StoryboardDraftSource, tVideo: VideoStudioTranslator): string {
  if (storyboardDraftSource === "default") return tVideo("storyboard.default");
  if (storyboardDraftSource === "ai") return tVideo("storyboard.ai");
  return tVideo("storyboard.manual");
}

function localizedCreativeVersionDisplayStatus(job: CreativeVersionItem, tVideo: VideoStudioTranslator): string {
  if (isExpiredVideo(job)) return tVideo("videoStatus.expired");
  if (hasPlayableVideo(job)) return tVideo("videoStatus.previewable");
  if (job.status === "completed" || job.status === "succeeded") return tVideo("videoStatus.completed");
  if (job.status === "queued") return tVideo("videoStatus.queued");
  if (job.status === "running") return tVideo("videoStatus.running");
  if (job.status === "failed") return tVideo("videoStatus.failed");
  if (job.status === "canceled" || job.status === "cancelled") return tVideo("videoStatus.canceled");
  return job.status || "-";
}

function localizedCreativeVersionLifecycleHint(job: CreativeVersionItem, tVideo: VideoStudioTranslator, locale?: AppLocale): string {
  const failureReason = creativeVersionFailureReason(job, locale);
  if (failureReason) return failureReason;
  if (hasPlayableVideo(job)) return localizedVideoExpiryLabel(job, tVideo);
  return "";
}

function localizedVideoExpiryLabel(job: { expiresAt?: string; expired?: boolean }, tVideo: VideoStudioTranslator): string {
  if (isExpiredVideo(job)) return tVideo("videoStatus.expired");
  if (!job.expiresAt) return tVideo("history.downloadWindow");
  const expiresAt = Date.parse(job.expiresAt);
  if (!Number.isFinite(expiresAt)) return tVideo("history.downloadWindow");
  return tVideo("history.deleteAt", { time: formatDeletionTime(expiresAt) });
}

async function copyHashtags(hashtags: string[], onToast: ConsoleToastFn, tVideo: VideoStudioTranslator): Promise<void> {
  const text = normalizeDisplayHashtags(hashtags).join(" ");
  if (!text) {
    onToast(tVideo("history.noTagsToast"));
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    onToast(tVideo("history.tagsCopiedToast"), "ok");
  } catch {
    onToast(text, "neutral");
  }
}

function normalizeDisplayHashtags(hashtags?: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of hashtags ?? []) {
    const body = value.trim().replace(/^#+/, "").replace(/\s+/g, "");
    if (!body) continue;
    const tag = `#${body}`;
    if (seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}

function referenceStatusLabel(value: ReferenceImageStatus["status"], tVideo?: VideoStudioTranslator): string {
  const t = tVideo ?? tVideoGlobal;
  if (value === "previewable") return t("reference.status.previewable");
  if (value === "missing") return t("reference.status.missing");
  if (value === "outside-project-root") return t("reference.status.outsideProjectRoot");
  if (value === "remote") return t("reference.status.remote");
  return value;
}

function jobStatusTone(status: VideoJob["status"]): "neutral" | "ok" | "danger" | "warn" {
  if (status === "completed") return "ok";
  if (status === "failed") return "danger";
  if (status === "running") return "warn";
  return "neutral";
}

function providerUsageStatusTone(status?: string): "neutral" | "ok" | "danger" | "warn" {
  if (status === "succeeded") return "ok";
  if (status === "failed" || status === "cancelled" || status === "canceled") return "danger";
  if (status === "running" || status === "queued") return "warn";
  return "neutral";
}

function qcTone(result?: QcResult): "neutral" | "ok" | "danger" | "warn" {
  if (result === "pass") return "ok";
  if (result === "fail" || result === "missing") return "danger";
  if (result === "warning") return "warn";
  return "neutral";
}

function qcLabel(result?: QcResult): string {
  if (result === "pass") return tAppGlobal("status.qc.pass");
  if (result === "warning") return tAppGlobal("status.qc.warning");
  if (result === "fail") return tAppGlobal("status.qc.fail");
  if (result === "missing") return tAppGlobal("status.qc.missing");
  return tAppGlobal("status.qc.unknown");
}

function shouldRefreshSelectedProductForStudio(transitions: CompletedVideoJobTransitions, selectedSku: string): boolean {
  if (transitions.completedJobIds.length === 0) return false;
  if (transitions.affectedProductSkus.length === 0) return true;
  return transitions.affectedProductSkus.includes(selectedSku);
}

function formatStudioAutoRefreshStatus(transitions: CompletedVideoJobTransitions): string {
  return [
    tAppGlobal("status.studioAutoRefreshTitle"),
    tAppGlobal("status.studioAutoRefreshCompleted", { count: transitions.completedJobIds.length }),
    tAppGlobal("status.studioAutoRefreshHistory")
  ].join("\n");
}

function productLibraryStatus(product: ProductSummary, tProductStatus: AppTranslator = makeAppTranslator("productStatus")): { label: string; detail: string; tone: "ok" | "warn" } {
  const referenceImageCount = product.referenceImageCount ?? 0;
  return {
    label: tProductStatus("readyStatus"),
    detail: tProductStatus("referenceImages", { count: referenceImageCount }),
    tone: "ok"
  };
}

function videoAssetKindTone(kind: VideoAsset["kind"]): "neutral" | "ok" | "danger" | "warn" {
  if (kind === "final") return "ok";
  if (kind === "raw") return "warn";
  return "neutral";
}

function videoAssetKindLabel(kind: VideoAsset["kind"], tLedger: AppTranslator): string {
  if (kind === "final") return tLedger("assets.final");
  if (kind === "raw") return tLedger("assets.raw");
  return tLedger("assets.publishPackage");
}

function auditActionLabel(action: string, tLedger: AppTranslator): string {
  const label = tLedger(`audit.actions.${action}`);
  return label.includes(`audit.actions.${action}`) ? action : label;
}

function auditMetadataSummary(metadata?: Record<string, unknown>): string {
  if (!metadata) {
    return "-";
  }
  return Object.entries(metadata)
    .filter(([key]) => !/password|apiKey|secret|token/i.test(key))
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" / ") || "-";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const value = String(reader.result || "");
      resolve(value.includes(",") ? value.split(",").pop() || "" : value);
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Failed to read file.")));
    reader.readAsDataURL(file);
  });
}

function formatProductFacts(product: ProductDetail, locale: AppLocale) {
  const tStatus = (key: string, options?: Record<string, unknown>) => tCurrentApp(locale, `status.${key}`, options);
  return [
    tStatus("productFacts.title"),
    `${tStatus("productFacts.productTitle")}: ${product.title_ja}`,
    `${tStatus("productFacts.category")}: ${product.category}`,
    `${tStatus("productFacts.materials")}: ${product.materials.join("、")}`,
    `${tStatus("productFacts.dimensions")}: ${product.dimensions}`,
    "",
    tStatus("productFacts.sellingPoints"),
    ...product.verified_selling_points.map((item) => `- ${item}`),
    "",
    tStatus("productFacts.usageScenes"),
    ...product.usage_scenes.map((item) => `- ${item}`),
    "",
    tStatus("productFacts.forbiddenClaims"),
    ...product.forbidden_claims.map((item) => `- ${item}`),
    "",
    tStatus("productFacts.referenceImages"),
    ...product.reference_images.map((item) => `- ${item}`),
    "",
    `${tStatus("productFacts.sourceFile")}: ${product.path}`
  ].join("\n");
}

function defaultModelConfigDrafts(): Record<ModelConfigProviderId, ModelConfigDraft> {
  return {
    "openai-compatible-text": { ...defaultModelConfigPreset("openai-compatible-text") },
    "openai-compatible-image": { ...defaultModelConfigPreset("openai-compatible-image") },
    "volcengine-seedance": { ...defaultModelConfigPreset("volcengine-seedance") }
  };
}

function formatPreflightStatus(preflight: Preflight, locale: AppLocale) {
  const tStatus = (key: string, options?: Record<string, unknown>) => tCurrentApp(locale, `status.${key}`, options);
  return [
    tStatus("preflightSummary.complete"),
    tStatus("productFactsRead"),
    `${tCurrentApp(locale, "preflight.provider")}: ${providerLabel(preflight.provider, (key, options) => tStatus(key, options))}`,
    `${tCurrentApp(locale, "preflight.duration")}: ${preflight.durationSeconds}s / ${preflight.aspectRatio}`,
    `${tStatus("preflightSummary.expectedCost")}: ¥${money(preflight.walletEstimatedChargeCny?.expected ?? preflight.estimatedCostCny.expected)} (${formatNumber(preflight.estimatedTokens.expected)} tokens)`,
    tStatus("preflightSummary.historyEstimate", { amount: money(preflight.credit.usedEstimatedCostCny) }),
    `${tStatus("preflightSummary.readiness")}: ${preflight.readiness.readyForPaidGeneration ? tStatus("preflightSummary.readyForPaid") : tStatus("preflightSummary.notReadyForPaid", { reasons: preflight.readiness.blockingReasons.join("、") })}`,
    "",
    tStatus("preflightSummary.reviewHint")
  ].join("\n");
}

function formatProviderTask(task: Record<string, unknown>, locale: AppLocale) {
  const tLedger = (key: string, options?: Record<string, unknown>) => tCurrentApp(locale, `ledger.${key}`, options);
  return [
    tLedger("providerUsage.taskDetailsTitle"),
    `Task: ${String(task.id || "-")}`,
    `${tLedger("providerUsage.statusLine")}: ${localizedJobStatusLabel(String(task.status || "-"), locale)}`,
    `${tLedger("providerUsage.modelLine")}: ${String(task.model || "-")}`,
    `${tLedger("jobs.duration")}: ${formatDuration(asNumber(task.durationSeconds))}`,
    `${tLedger("providerUsage.resolution")}: ${String(task.resolution || "-")}`,
    `${tLedger("providerUsage.ratio")}: ${String(task.ratio || "-")}`,
    `Tokens: ${formatNumber(asNumber(task.totalTokens))}`,
    `${tLedger("providerUsage.estimatedCost")}: ¥${money(asNumber(task.estimatedCostCny))}`,
    `${tLedger("providerUsage.note")}: ${tLedger("providerUsage.taskNote")}`
  ].join("\n");
}

function formatProviderUsageReport(usage: ProviderUsageReport, locale: AppLocale) {
  const tLedger = (key: string, options?: Record<string, unknown>) => tCurrentApp(locale, `ledger.${key}`, options);
  return [
    tLedger("providerUsage.usageListTitle"),
    `${tLedger("providerUsage.taskCount")}: ${formatNumber(usage.total)}`,
    `${tLedger("providerUsage.usage")}: ${formatNumber(usage.totalTokens)}`,
    `${tLedger("providerUsage.estimatedCost")}: ¥${money(usage.estimatedCostCny)}`,
    `${tLedger("providerUsage.unitPrice")}: ¥${money(usage.tokenPriceCnyPerMillion)} / ${tLedger("providerUsage.perMillionUsage")}`,
    "",
    ...usage.items.map(
      (item) =>
        `- ${item.id} / ${localizedJobStatusLabel(item.status, locale)} / ${item.model || "-"} / ${formatDuration(item.durationSeconds)} / ${formatNumber(item.totalTokens)} ${tLedger("providerUsage.usage")} / ¥${money(item.estimatedCostCny)}`
    ),
    "",
    `${tLedger("providerUsage.note")}: ${tLedger("providerUsage.usageNote")}`
  ].join("\n");
}

function formatReportCost(report: Report) {
  if (report.billing?.estimatedCostCny !== undefined) return `¥${money(report.billing.estimatedCostCny)}`;
  if (report.totalCost?.amount !== undefined) return `${report.totalCost.amount} ${report.totalCost.currency || ""}`.trim();
  return "-";
}

function reportEstimatedCostCny(report: Report) {
  if (report.billing?.estimatedCostCny !== undefined) return report.billing.estimatedCostCny;
  if (report.totalCost?.currency && report.totalCost.currency.toUpperCase() !== "CNY") return 0;
  return report.totalCost?.amount ?? 0;
}

function formatDuration(value?: number) {
  return value === undefined ? "-" : `${value}s`;
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

function walletTransactionTypeLabel(type: WalletTransaction["type"], tWallet: AppTranslator) {
  switch (type) {
    case "recharge":
      return tWallet("transactionTypes.recharge");
    case "reserve":
      return tWallet("transactionTypes.reserve");
    case "charge":
      return tWallet("transactionTypes.charge");
    case "refund":
      return tWallet("transactionTypes.refund");
    case "bonus":
      return tWallet("transactionTypes.grant");
    case "adjustment":
      return tWallet("transactionTypes.adjustment");
  }
}

function paymentMethodLabel(id: PaymentMethodView["id"]) {
  if (id === "stripe") return "Stripe";
  if (id === "infini") return "Infini";
  return id;
}

function paymentMethodPaymentAmountText(method: PaymentMethodView | undefined, fallbackAmountCny: number, loading = false): string {
  if (loading && !method?.quote) return "...";
  if (method?.quote) {
    return paymentCurrencyAmountText(method.quote.paymentCurrency, method.quote.paymentAmount);
  }
  const currency = method?.paymentCurrency ?? "cny";
  return paymentCurrencyAmountText(currency, currency.toLowerCase() === "cny" ? fallbackAmountCny : 0);
}

function paymentMethodFxRateText(quote: RechargePaymentQuote | undefined, loading = false): string {
  if (loading && !quote) return "...";
  const snapshot = quote?.fxRateSnapshot;
  if (!snapshot) return "-";
  const to = snapshot.to.toLowerCase();
  if (to === "cny" || snapshot.rate === 1) return "¥1 = ¥1";
  return `${paymentCurrencySymbol(to)}1 = ¥${formatReverseFxRate(snapshot.rate)}`;
}

function paymentCurrencyAmountText(currency: string, amount: number): string {
  const normalized = currency.toLowerCase();
  if (normalized === "cny") return `¥${money(amount)}`;
  return `${paymentCurrencySymbol(normalized)}${money(amount)}`;
}

function paymentCurrencySymbol(currency: string): string {
  const normalized = currency.toLowerCase();
  if (normalized === "cny") return "¥";
  if (normalized === "usd") return "$";
  if (normalized === "hkd") return "HK$";
  if (normalized === "eur") return "€";
  if (normalized === "gbp") return "£";
  if (normalized === "jpy") return "¥";
  return normalized.toUpperCase();
}

function formatReverseFxRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return "-";
  return (1 / rate).toFixed(2);
}

function paymentMethodBadges(id: PaymentMethodView["id"], tWallet: AppTranslator) {
  if (id === "infini") {
    const badges = tWallet("badges.crypto", { returnObjects: true } as Record<string, unknown>);
    return Array.isArray(badges) ? badges.map(String) : ["USDT", "USDC"];
  }
  const badges = tWallet("badges.rmb", { returnObjects: true } as Record<string, unknown>);
  return Array.isArray(badges) ? badges.map(String) : ["Alipay", "WeChat", "Visa", "Mastercard", "Apple Pay"];
}

function formatProviderUnixTime(value?: number) {
  if (!value) return "-";
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatNumber(value?: number | string) {
  if (value === undefined || value === null || value === "") return "-";
  return Number(value).toLocaleString("zh-CN");
}

function money(value?: number) {
  return Number(value || 0).toFixed(2);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function formatCompactNumber(value?: number) {
  const amount = Number(value || 0);
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return formatNumber(amount);
}

function formatBytes(value?: number) {
  const bytes = Number(value || 0);
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${formatNumber(bytes)} B`;
}

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items;
  }
  const next = [...items];
  const [movedItem] = next.splice(fromIndex, 1);
  if (movedItem === undefined) {
    return items;
  }
  next.splice(toIndex, 0, movedItem);
  return next;
}

function indexAfterMove(index: number, fromIndex: number, toIndex: number): number {
  if (fromIndex === toIndex) return index;
  if (index === fromIndex) return toIndex;
  if (fromIndex < toIndex && index > fromIndex && index <= toIndex) return index - 1;
  if (fromIndex > toIndex && index >= toIndex && index < fromIndex) return index + 1;
  return index;
}

function referenceImageKey(image: ReferenceImageStatus): string {
  return image.resolvedPath || image.original;
}

function unique(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}
