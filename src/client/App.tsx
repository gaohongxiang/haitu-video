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
  ClipboardCheck,
  Database,
  Download,
  ExternalLink,
  FileArchive,
  FileVideo,
  Gauge,
  Image as ImageIcon,
  Plus,
  KeyRound,
  LayoutDashboard,
  Package,
  MailCheck,
  Play,
  RefreshCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  StopCircle,
  WalletCards,
  X
} from "lucide-react";
import * as EChartsForReact from "echarts-for-react";
import type { EChartsOption, EChartsReactProps } from "echarts-for-react";
import { FormEvent, ReactNode, type ClipboardEvent, type ComponentType, type Dispatch, type DragEvent, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "./components/ui/badge.js";
import { Button } from "./components/ui/button.js";
import { Card, CardHeader } from "./components/ui/card.js";
import { Field, Input, Select, Textarea } from "./components/ui/field.js";
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
import { cn } from "./lib/utils.js";

const ReactECharts = ((EChartsForReact as { default?: unknown }).default ?? EChartsForReact) as ComponentType<EChartsReactProps>;
const floatingTooltipClass =
  "pointer-events-none absolute whitespace-nowrap rounded-md border border-[#dbe4f0] bg-white px-2.5 py-1.5 text-[11px] font-black text-[#66748a] opacity-0 shadow-[0_10px_24px_rgba(30,42,68,.12)] transition";

type ProviderName = "mock" | "seedance" | "volcengine-seedance";
type VideoModelChoice = "mock" | "seedance-2-fast" | "seedance-2" | "seedance-1-5-pro";
type ApiProviderId = "openai-compatible-text" | "openai-compatible-image" | "volcengine-seedance";
type TemplateName = "scene" | "pain-point" | "benefit" | "ugc" | "unboxing";
type ProductComposerSource = "structured" | "freeform";
type ProductAutoSaveStatus = "idle" | "dirty" | "saving" | "saved" | "failed";
type StoryboardDraftSource = "default" | "ai" | "manual";
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

interface ProductSummary {
  path: string;
  sku: string;
  title_ja: string;
  referenceImageCount?: number;
  importQuality?: ProductImportQuality;
  paidReadiness?: {
    readyForPaidGeneration: boolean;
    blockingReasons: string[];
    warnings: string[];
  };
}

interface ProductDetail extends ProductSummary {
  category: string;
  materials: string[];
  dimensions: string;
  verified_selling_points: string[];
  usage_scenes: string[];
  forbidden_claims: string[];
  reference_images: string[];
  source_text?: string;
  reference_image_statuses?: ReferenceImageStatus[];
}

type ProductFactsResponse = Omit<ProductDetail, "path" | "reference_image_statuses" | "reference_image_urls">;

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

interface StoryboardHistoryRecord {
  id: string;
  createdAt: string;
  style: TemplateName;
  duration: number;
  script: string;
}

interface ProductImportQuality {
  ready: boolean;
  score: number;
  summary: string;
  missingFields: string[];
  verifiedFacts: string[];
  blockedClaims: string[];
  warnings: string[];
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

interface DeleteLedgerVideoResponse {
  deleted: true;
  jobId: string;
  path: string;
}

interface ReferenceImageStatus {
  original: string;
  resolvedPath: string;
  previewUrl: string | null;
  status: "previewable" | "missing" | "outside-project-root" | "remote";
}

type FinalVideoLanguage = "ja" | "zh";

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

interface LedgerJob {
  id: string;
  reportPath: string;
  productSku?: string;
  provider?: string;
  status?: string;
  durationSeconds?: number;
  taskId?: string;
  totalTokens: number;
  estimatedCostCny: number;
  hasFinalVideo: boolean;
  finalVideoUrl?: string;
  expiresAt?: string;
  expired?: boolean;
  rawManifestPath?: string;
  selectedFinal: boolean;
  qc?: QcSummaryItem;
  contentReview: JobContentReviewSnapshot;
}

interface JobContentReviewSnapshot {
  available: boolean;
  scriptVoiceover?: string;
  subtitleLines: string[];
  cta?: string;
  promptPreview?: string;
  rawManifestUrl?: string;
  finalManifestUrl?: string;
  subtitleUrl?: string;
  missingReason?: string;
}

interface ProductGroup {
  productSku: string;
  jobCount: number;
  completedJobs: number;
  paidJobs: number;
  mockJobs: number;
  reviewedJobs?: number;
  unreviewedJobs?: number;
  publishableJobs?: number;
  needsEditJobs?: number;
  rejectedJobs?: number;
  usableJobs?: number;
  readyForInternalValidation?: boolean;
  totalTokens: number;
  estimatedCostCny: number;
  finalVideos: number;
  latestJobId: string;
  bestPreviewJobId?: string;
  selectedFinalJobId?: string;
  selectedFinalNote?: string;
  jobs: LedgerJob[];
}

interface Ledger {
  summary: {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    paidJobs: number;
    mockJobs: number;
    totalTokens: number;
    estimatedCostCny: number;
    finalVideos: number;
    reusedRawManifests: number;
    recoveredRawOutputs: number;
  };
  jobs: LedgerJob[];
  products: ProductGroup[];
}

interface VideoJob {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  productPath: string;
  productSku?: string;
  provider?: ProviderName | string;
  providerModel?: string;
  durationSeconds?: number;
  template?: TemplateName | string;
  cta?: string;
  scriptLines?: string[];
  storyboardLines?: string[];
  confirmPaid: boolean;
  reuseManifest?: string;
  outDir: string;
  reportPath?: string;
  reportUrl?: string;
  rawOutputPath?: string;
  rawOutputUrl?: string;
  finalOutputPath?: string;
  finalVideoUrl?: string;
  finalManifestPath?: string;
  finalManifestUrl?: string;
  subtitlePath?: string;
  subtitleUrl?: string;
  totalTokens?: number;
  estimatedCostCny?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  expiresAt?: string;
  expired?: boolean;
}

interface ProductVideoGenerationOptions {
  provider: ProviderName;
  providerModel?: string;
  confirmPaid: boolean;
}

interface CreativeVersionItem {
  id: string;
  status?: string;
  provider?: string;
  providerModel?: string;
  durationSeconds?: number;
  selectedFinal: boolean;
  hasFinalVideo: boolean;
  finalVideoUrl?: string;
  createdAt?: string;
  expiresAt?: string;
  expired?: boolean;
  source: "video-job" | "ledger";
  videoJob?: VideoJob;
}

interface Preflight {
  productSku: string;
  title_ja: string;
  provider: string;
  durationSeconds: number;
  aspectRatio: string;
  template: TemplateName;
  cta: string;
  paidProvider: boolean;
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

interface Filters {
  productSku: string;
  provider: string;
  status: string;
  finalOnly: boolean;
}

type DashboardRange = "24h" | "7d" | "30d" | "all";
type DashboardGranularity = "hour" | "day";
type RefreshConsoleReason = "manual" | "polling";

interface DashboardProviderRow {
  name: string;
  jobs: number;
  completed: number;
  active: number;
  totalTokens: number;
  estimatedCostCny: number;
}

interface DashboardTrendPoint {
  label: string;
  jobs: number;
  totalTokens: number;
  estimatedCostCny: number;
}

interface DashboardRecentRow {
  id: string;
  label: string;
  productSku: string;
  provider: string;
  status: string;
  durationSeconds?: number;
  totalTokens: number;
  estimatedCostCny: number;
  createdAt?: string;
}

interface DashboardAnalytics {
  providerRows: DashboardProviderRow[];
  trend: DashboardTrendPoint[];
  recent: DashboardRecentRow[];
  activeJobs: number;
  queuedJobs: number;
  failedJobs: number;
}

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

interface ProviderConfigItem {
  id: ApiProviderId;
  configId?: string;
  label: string;
  providerLabel?: string;
  configured: boolean;
  keySource?: string;
  keyPreview?: string;
  baseUrl: string;
  model: string;
  priority: number;
  capabilities: string[];
  modelKind: "text" | "image" | "video";
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

interface ProviderConfigLedger {
  textModels: ProviderConfigItem[];
  imageModels: ProviderConfigItem[];
  videoModels: VideoProviderConfigItem[];
  providers: VideoProviderConfigItem[];
}

interface ProviderKeyStatusResponse {
  provider: Pick<ProviderConfigItem, "id" | "configId" | "configured" | "keySource" | "keyPreview">;
}

interface ProviderConfigTestResponse {
  ok: true;
  provider: ApiProviderId;
  model: string;
  message: string;
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

interface ProductDraft {
  sku: string;
  title_ja: string;
  category: string;
  materials: string;
  dimensions: string;
  verified_selling_points: string;
  usage_scenes: string;
  forbidden_claims: string;
  reference_images: string;
  source_text: string;
}

interface ModelConfigDraft {
  configId?: string;
  name: string;
  vendor: string;
  priority: number;
  apiKey: string;
  baseUrl: string;
  model: string;
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

interface ModelConfigTestStatus {
  tone: "neutral" | "ok" | "danger";
  message: string;
}

type ProductEditorMode = "import" | "manual";
type ProductLibraryDialogMode = ProductEditorMode | "edit" | undefined;

const primaryNavItems: Array<{ id: ConsoleSection; label: string; icon: typeof LayoutDashboard }> = [
  { id: "video", label: "视频创作", icon: Clapperboard }
];

const managementNavItems: Array<{ id: ConsoleSection; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "仪表盘", icon: LayoutDashboard },
  { id: "ledger", label: "任务记录", icon: WalletCards },
  { id: "settings", label: "API 管理", icon: Settings }
];

const navItems = [...primaryNavItems, ...managementNavItems] as const;

const navGroups = [
  { label: "主流程", items: primaryNavItems },
  { label: "管理", items: managementNavItems }
];

const sectionSubtitles: Record<ConsoleSection, string> = {
  video: "选择商品、设置参数、编辑脚本分镜并生成视频。",
  dashboard: "查看生成数量、成本趋势、模型分布和最近使用。",
  ledger: "查看正在生成和已生成的视频任务。",
  settings: "配置文本、图片和视频模型服务。"
};

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

const defaultProductDraft: ProductDraft = {
  sku: "",
  title_ja: "",
  category: "",
  materials: "",
  dimensions: "",
  verified_selling_points: "",
  usage_scenes: "",
  forbidden_claims: "",
  reference_images: "",
  source_text: ""
};

const videoModelOptions: VideoModelChoice[] = ["seedance-2-fast", "seedance-2", "seedance-1-5-pro"];
const defaultVideoDurationSeconds = 10;
const defaultVideoModelChoice: VideoModelChoice = "seedance-2-fast";
const defaultVideoTemplate: TemplateName = "scene";

const videoModelConfigs: Record<VideoModelChoice, { provider: ProviderName; model?: string; label: string; confirmPaid: boolean }> = {
  mock: {
    provider: "mock",
    label: "本地模拟",
    confirmPaid: false
  },
  "seedance-2-fast": {
    provider: "volcengine-seedance",
    model: "doubao-seedance-2-0-fast-260128",
    label: "seedance2.0 fast",
    confirmPaid: true
  },
  "seedance-2": {
    provider: "volcengine-seedance",
    model: "doubao-seedance-2-0-260128",
    label: "seedance2.0",
    confirmPaid: true
  },
  "seedance-1-5-pro": {
    provider: "volcengine-seedance",
    model: "doubao-seedance-1-5-pro-251215",
    label: "seedance1.5 pro",
    confirmPaid: true
  }
};

const modelConfigPresets: Record<ApiProviderId, ModelConfigDraft[]> = {
  "openai-compatible-text": [
    {
      name: "OpenAI 推荐-文本",
      vendor: "openai",
      priority: 0,
      apiKey: "",
      baseUrl: "https://api.openai.com",
      model: "gpt-5.5"
    },
    {
      name: "DeepSeek 推荐-文本",
      vendor: "deepseek",
      priority: 0,
      apiKey: "",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro"
    },
    {
      name: "豆包推荐-文本",
      vendor: "doubao",
      priority: 0,
      apiKey: "",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      model: "doubao-seed-2-0-pro-260215"
    }
  ],
  "openai-compatible-image": [
    {
      name: "Gemini 推荐-图片",
      vendor: "gemini",
      priority: 0,
      apiKey: "",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: "gemini-3-pro-image"
    },
    {
      name: "OpenAI 推荐-图片",
      vendor: "openai",
      priority: 0,
      apiKey: "",
      baseUrl: "https://api.openai.com",
      model: "gpt-image-2"
    }
  ],
  "volcengine-seedance": [
    {
      name: "豆包 seedance2.0 fast 推荐-视频",
      vendor: "volcengine",
      priority: 0,
      apiKey: "",
      baseUrl: "https://ark.cn-beijing.volces.com",
      model: "doubao-seedance-2-0-fast-260128"
    },
    {
      name: "豆包 seedance2.0 推荐-视频",
      vendor: "volcengine",
      priority: 0,
      apiKey: "",
      baseUrl: "https://ark.cn-beijing.volces.com",
      model: "doubao-seedance-2-0-260128"
    },
    {
      name: "豆包 seedance1.5 pro 推荐-视频",
      vendor: "volcengine",
      priority: 0,
      apiKey: "",
      baseUrl: "https://ark.cn-beijing.volces.com",
      model: "doubao-seedance-1-5-pro-251215"
    }
  ]
};

const NEW_PRODUCT_SELECT_VALUE = "__new_product__";
const storyboardTemplateNames: TemplateName[] = ["scene", "pain-point", "benefit", "ugc", "unboxing"];
const authOtpCooldownDurationSeconds = 60;

function isTemplateName(value: unknown): value is TemplateName {
  return typeof value === "string" && storyboardTemplateNames.includes(value as TemplateName);
}

function restoreProductStudioSku(availableProducts: ProductSummary[]): string {
  if (availableProducts.length === 0 || typeof window === "undefined") return "";
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
  const [authStatus, setAuthStatus] = useState("正在检查登录状态...");
  const [authOtpCooldownSeconds, setAuthOtpCooldownSeconds] = useState(0);
  const [forgotPasswordOtpSent, setForgotPasswordOtpSent] = useState(false);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [ledger, setLedger] = useState<Ledger | undefined>();
  const [videoJobs, setVideoJobs] = useState<VideoJob[]>([]);
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [productPath, setProductPath] = useState("");
  const [provider, setProvider] = useState<ProviderName>(videoModelConfigs[defaultVideoModelChoice].provider);
  const [videoModelChoice, setVideoModelChoice] = useState<VideoModelChoice>(defaultVideoModelChoice);
  const [duration, setDuration] = useState(defaultVideoDurationSeconds);
  const [versionCount, setVersionCount] = useState(1);
  const [template, setTemplate] = useState<TemplateName>(defaultVideoTemplate);
  const [finalLanguage, setFinalLanguage] = useState<FinalVideoLanguage>("ja");
  const [cta, setCta] = useState("今すぐチェック");
  const [studioScriptDraft, setStudioScriptDraft] = useState("");
  const [studioStoryboardDraft, setStudioStoryboardDraft] = useState(() => defaultStoryboardDraft(defaultVideoTemplate, defaultVideoDurationSeconds));
  const [storyboardDraftTouched, setStoryboardDraftTouched] = useState(false);
  const [storyboardDraftSource, setStoryboardDraftSource] = useState<StoryboardDraftSource>("default");
  const [studioStoryboardCnDraft, setStudioStoryboardCnDraft] = useState("");
  const [storyboardHistory, setStoryboardHistory] = useState<StoryboardHistoryRecord[]>([]);
  const [reuseManifest, setReuseManifest] = useState("");
  const [confirmPaid, setConfirmPaid] = useState(false);
  const [preflight, setPreflight] = useState<Preflight | undefined>();
  const [preflightSignature, setPreflightSignature] = useState("");
  const [statusText, setStatusText] = useState("等待操作");
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
    providers: []
  });
  const [modelConfigDrafts, setModelConfigDrafts] = useState<Record<ApiProviderId, ModelConfigDraft>>(() => defaultModelConfigDrafts());
  const [modelConfigTestStatus, setModelConfigTestStatus] = useState<Partial<Record<ApiProviderId, ModelConfigTestStatus>>>({});
  const [videoAssets, setVideoAssets] = useState<VideoAssetLedger | undefined>();
  const [storageBackup, setStorageBackup] = useState<StorageBackupReport | undefined>();
  const [localBackups, setLocalBackups] = useState<LocalBackupLedger | undefined>();
  const [auditLog, setAuditLog] = useState<AuditLogLedger | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isGeneratingStoryboard, setIsGeneratingStoryboard] = useState(false);
  const [activeSectionState, setActiveSectionState] = useState<ConsoleSection>(() => {
    if (typeof window === "undefined") return defaultConsoleSection;
    return consoleSectionFromUrl(window.location.href);
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

  const selectedVideoModelConfig = videoModelConfigs[videoModelChoice];
  const paidProvider = selectedVideoModelConfig.provider !== "mock";
  const enabledTemplateOptions = settings.enabledTemplates;
  const currentSignature = JSON.stringify({ productPath, provider: selectedVideoModelConfig.provider, providerModel: selectedVideoModelConfig.model, duration, template, finalLanguage, cta, studioScriptDraft, studioStoryboardDraft });
  const freshPreflight = preflight && currentSignature === preflightSignature ? preflight : undefined;
  const safeVersionCount = Math.max(1, Math.min(5, Math.floor(versionCount || 1)));
  const batchEstimatedCostCny = freshPreflight
    ? roundMoney((freshPreflight.estimatedCostCny.expected || 0) * safeVersionCount)
    : undefined;
  const paidRunBlockedReason = paidRunBlockReason({
    paidProvider,
    freshPreflight: Boolean(freshPreflight),
    preflight,
    confirmPaid
  });
  const selectedProductSummary = products.find((product) => product.path === productPath);
  const selectedProductGroup = selectedProduct
    ? ledger?.products.find((group) => group.productSku === selectedProduct.sku)
    : undefined;
  const productOptions = useMemo(() => unique(reports.map((report) => report.productSku)), [reports]);
  const providerOptions = useMemo(() => unique(reports.map((report) => report.provider)), [reports]);
  const statusOptions = useMemo(() => unique(reports.map((report) => report.status)), [reports]);
  const hasActiveVideoJobs = videoJobs.some((job) => isActiveVideoJobStatus(job.status));
  const dashboardAnalytics = useMemo(
    () => buildDashboardAnalytics({ ledger, videoJobs, range: dashboardRange, granularity: dashboardGranularity }),
    [ledger, videoJobs, dashboardRange, dashboardGranularity]
  );
  const filteredReports = reports.filter((report) => {
    if (filters.productSku !== "all" && report.productSku !== filters.productSku) return false;
    if (filters.provider !== "all" && report.provider !== filters.provider) return false;
    if (filters.status !== "all" && report.status !== filters.status) return false;
    if (filters.finalOnly && !report.finalVideoUrl) return false;
    return true;
  });
  const activeSection = activeSectionState;
  const activeSectionLabel = navItems.find((item) => item.id === activeSection)?.label ?? "视频创作";
  const activeSectionSubtitle = sectionSubtitles[activeSection];
  const activeSectionInVisibleNav = navGroups.some((group) => group.items.some((item) => item.id === activeSection));
  const textModelConfigured = providerConfig.textModels.some((model) => model.configured);
  const imageModelConfigured = providerConfig.imageModels.some((model) => model.configured);
  const videoModelConfigured = selectedVideoModelConfig.provider === "mock" || providerConfig.videoModels.some((model) => model.configured);

  consoleToastCloseRef.current = () => setConsoleToast(undefined);
  const handleConsoleToastClose = useMemo(
    () => () => consoleToastCloseRef.current(),
    []
  );

  function setActiveSection(section: ConsoleSection) {
    setActiveSectionState(section);
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
      title: "操作提示",
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

  function ensureTextModelConfigured(): boolean {
    if (textModelConfigured) {
      return true;
    }
    showConsoleToast("请先配置文本模型，再使用 AI 整理或生成分镜。");
    return false;
  }

  function ensureImageModelConfigured(): boolean {
    if (imageModelConfigured) {
      return true;
    }
    showConsoleToast("请先配置图片模型，再生成参考图。");
    return false;
  }

  function ensureVideoModelConfigured(): boolean {
    if (videoModelConfigured) {
      return true;
    }
    showConsoleToast("请先配置视频模型，再生成视频。");
    return false;
  }

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
    return () => {
      clearProductFactsAutoSaveTimer();
    };
  }, []);

  useEffect(() => {
    if (!selectedProduct) {
      setStudioScriptDraft("");
      setStudioStoryboardDraft(defaultStoryboardDraft(template, duration));
      setStoryboardDraftTouched(false);
      setStoryboardDraftSource("default");
      setStudioStoryboardCnDraft("");
      return;
    }
    setStudioScriptDraft("");
    setStudioStoryboardDraft(defaultStoryboardDraft(template, duration));
    setStoryboardDraftTouched(false);
    setStoryboardDraftSource("default");
    setStudioStoryboardCnDraft("");
  }, [selectedProduct?.sku]);

  useEffect(() => {
    // 用户已手动编辑分镜时不覆盖。
    if (storyboardDraftTouched) return;
    setStudioStoryboardDraft(defaultStoryboardDraft(template, duration));
  }, [template, duration, storyboardDraftTouched]);

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
        await refreshConsole({ applySettings: true });
      } else {
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
      setAuthStatus("密码已重置，请用新密码登录。");
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
    setAuthStatus("正在载入控制台。");
    await refreshConsole({ applySettings: true });
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

  async function refreshConsole(options: { applySettings?: boolean; reason?: RefreshConsoleReason } = {}) {
    const polling = options.reason === "polling";
    if (!polling) {
      setIsLoading(true);
    }
    try {
      const [productsResponse, reportsResponse, ledgerResponse, qcSummaryResponse, videoAssetsResponse, storageBackupResponse, localBackupsResponse, auditLogResponse, providerConfigResponse, settingsResponse, videoJobsResponse] =
        await Promise.all([
          getJson<{ products: ProductSummary[] }>("/api/products"),
          getJson<{ reports: Report[] }>("/api/reports"),
          getJson<Ledger>("/api/job-ledger"),
          getJson<QcSummaryLedger>("/api/qc-summary"),
          getJson<VideoAssetLedger>("/api/video-assets"),
          getJson<StorageBackupReport>("/api/storage-backup"),
          getJson<LocalBackupLedger>("/api/backups"),
          getJson<AuditLogLedger>("/api/audit-log"),
          getJson<ProviderConfigLedger>("/api/provider-config"),
          getJson<{ settings: SettingsState }>("/api/settings"),
          getJson<{ jobs: VideoJob[] }>("/api/video-jobs")
        ]);
      const ledgerWithQc = attachQcToLedger(ledgerResponse, qcSummaryResponse);
      const completedTransitions = polling
        ? detectCompletedVideoJobTransitions(videoJobsRef.current, videoJobsResponse.jobs)
        : { completedJobIds: [], affectedProductSkus: [] };
      setProducts(productsResponse.products);
      setReports(reportsResponse.reports);
      setLedger(ledgerWithQc);
      setVideoAssets(videoAssetsResponse);
      setStorageBackup(storageBackupResponse);
      setLocalBackups(localBackupsResponse);
      setAuditLog(auditLogResponse);
      setProviderConfig(providerConfigResponse);
      setModelConfigDrafts((current) => syncModelConfigDraftsFromLedger(providerConfigResponse, current));
      setSettings(settingsResponse.settings);
      setVideoJobs(videoJobsResponse.jobs);
      videoJobsRef.current = videoJobsResponse.jobs;
      const restoredStudioSku = activeSection === "video" ? restoreProductStudioSku(productsResponse.products) : "";
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
      if (!polling && activeSection === "video" && selectedSku && selectedProduct?.sku !== selectedSku) {
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
    } catch (error) {
      showError(error);
    } finally {
      if (!polling) {
        setIsLoading(false);
      }
    }
  }

  function applySettings(nextSettings = settings) {
    setProvider(videoModelConfigs[defaultVideoModelChoice].provider);
    setVideoModelChoice(defaultVideoModelChoice);
    setDuration(defaultVideoDurationSeconds);
    setTemplate(defaultVideoTemplate);
    setFinalLanguage(nextSettings.defaultLanguage);
    setCta(nextSettings.defaultCta);
    setConfirmPaid(false);
    setPreflight(undefined);
    setPreflightSignature("");
  }

  function markPreflightStale() {
    if (!preflight) return;
    setPreflightSignature("");
    setStatusText("表单已变更，请重新生成预检后再运行。");
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
    setStoryboardDraftTouched(true);
    setStoryboardDraftSource("ai");
    setStudioStoryboardCnDraft("");
    markPreflightStale();
    setStatusText(`已回填历史分镜: ${templateLabel(record.style)} / ${formatDuration(record.duration)}`);
  }

  async function deleteStoryboardHistory(recordId: string) {
    if (!selectedProduct) return;
    await deleteJson(`/api/products/${encodeURIComponent(selectedProduct.sku)}/storyboards/${encodeURIComponent(recordId)}`);
    setStoryboardHistory((current) => current.filter((record) => record.id !== recordId));
    showConsoleToast("分镜记录已删除。", "ok");
  }

  function productTitleForSku(sku: string): string {
    return products.find((product) => product.sku === sku)?.title_ja || "当前商品";
  }

  async function runPreflight() {
    if (!productPath) {
      setStatusText("请选择商品");
      return;
    }
    setIsBusy(true);
    try {
      setStatusText("预检中...");
      const response = await postJson<{ preflight: Preflight }>("/api/preflight", {
        productPath,
        provider,
        duration,
        template,
        finalLanguage,
        cta,
        scriptLines: splitDraftLines(studioScriptDraft),
        storyboardLines: splitDraftLines(studioStoryboardDraft)
      });
      setPreflight(response.preflight);
      setPreflightSignature(currentSignature);
      setStatusText(formatPreflightStatus(response.preflight));
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function runPipeline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProductSummary) {
      setStatusText("请选择商品");
      return;
    }
    if (paidRunBlockedReason) {
      setStatusText(paidRunBlockedReason);
      return;
    }
    if (!ensureVideoModelConfigured()) {
      setStatusText("请先配置视频模型，再生成视频。");
      return;
    }
    setIsBusy(true);
    try {
      setStatusText("生成任务创建中...");
      const videoModelConfig = videoModelConfigs[videoModelChoice];
      const requestBody = {
        productPath,
        outDirName: `${selectedProductSummary.sku}-${Date.now()}`,
        provider: videoModelConfig.provider,
        providerModel: videoModelConfig.model,
        duration,
        template,
        finalLanguage,
        cta,
        scriptLines: splitDraftLines(studioScriptDraft),
        storyboardLines: splitDraftLines(studioStoryboardDraft),
        confirmPaid: videoModelConfig.provider !== "mock",
        reuseManifest: reuseManifest.trim() || undefined
      };
      if (safeVersionCount > 1) {
        const response = await postJson<{ jobs: VideoJob[] }>("/api/video-jobs/batch", {
          ...requestBody,
          versions: safeVersionCount
        });
        setStatusText([
          `已入队 ${response.jobs.length} 个生成记录`,
          ...response.jobs.map((job, index) => `版本 ${index + 1}: ${job.id} / ${statusLabel(job.status)} / ${job.outDir}`)
        ].join("\n"));
      } else {
        const response = await postJson<{ job: VideoJob }>("/api/video-jobs", requestBody);
        setStatusText(`生成任务已创建: ${response.job.id}\n状态: ${statusLabel(response.job.status)}\n输出目录: ${response.job.outDir}`);
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
      setStatusText("API 管理设置已保存，并已应用到新建任务表单。");
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function saveModelConfig(providerId: ApiProviderId, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft = modelConfigDrafts[providerId];
    if (!draft.configId && !draft.apiKey.trim()) {
      setStatusText("请先填写 API Key。");
      return;
    }
    setIsBusy(true);
    try {
      const response = await putJson<ProviderKeyStatusResponse>(`/api/provider-keys/${providerId}`, {
        configId: draft.configId,
        apiKey: draft.apiKey.trim() || undefined,
        name: draft.name.trim(),
        vendor: draft.vendor.trim(),
        priority: draft.priority,
        baseUrl: draft.baseUrl.trim(),
        model: draft.model.trim()
      });
      setModelConfigDrafts((current) => ({
        ...current,
        [providerId]: {
          ...current[providerId],
          apiKey: ""
        }
      }));
      setProviderConfig((current) => updateProviderConfigStatus(current, response.provider));
      setStatusText(`模型服务已保存: ${response.provider.keyPreview || "已配置"}`);
      await refreshConsole();
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function testModelConfig(providerId: ApiProviderId) {
    const draft = modelConfigDrafts[providerId];
    if (!draft.configId && !draft.apiKey.trim()) {
      setModelConfigTestStatus((current) => ({
        ...current,
        [providerId]: {
          tone: "danger",
          message: "测试失败：请先填写 API Key。"
        }
      }));
      setStatusText("请先填写 API Key。");
      return;
    }
    setIsBusy(true);
    try {
      setModelConfigTestStatus((current) => ({
        ...current,
        [providerId]: {
          tone: "neutral",
          message: "测试配置中..."
        }
      }));
      setStatusText("测试配置中...");
      const response = await postJson<ProviderConfigTestResponse>(`/api/provider-keys/${providerId}/test`, {
        configId: draft.configId,
        apiKey: draft.apiKey.trim() || undefined,
        baseUrl: draft.baseUrl.trim(),
        model: draft.model.trim()
      });
      setModelConfigTestStatus((current) => ({
        ...current,
        [providerId]: {
          tone: "ok",
          message: `测试成功：${response.message}\n模型: ${response.model}`
        }
      }));
      setStatusText(`${response.message}\n模型: ${response.model}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setModelConfigTestStatus((current) => ({
        ...current,
        [providerId]: {
          tone: "danger",
          message: `测试失败：${message}`
        }
      }));
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function clearModelConfig(providerId: ApiProviderId, configId?: string) {
    setIsBusy(true);
    try {
      const suffix = configId ? `?configId=${encodeURIComponent(configId)}` : "";
      const response = await fetch(`/api/provider-keys/${providerId}${suffix}`, {
        method: "DELETE"
      });
      const body = await readJsonResponse<ProviderKeyStatusResponse>(response);
      setProviderConfig((current) => updateProviderConfigStatus(current, body.provider));
      setModelConfigDrafts((current) => ({
        ...current,
        [providerId]: {
          ...current[providerId],
          apiKey: ""
        }
      }));
      setStatusText("已清除 API Key。");
      await refreshConsole();
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  function updateModelConfigDraft(providerId: ApiProviderId, patch: Partial<ModelConfigDraft>) {
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

  function applyModelPreset(providerId: ApiProviderId, preset: ModelConfigDraft) {
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
      setStatusText(formatProductFacts(response.product));
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
      setStatusText(`资料已自动保存: ${response.product.title_ja}`);
      return response.product;
    })();
    productAutoSaveInFlightRef.current = savePromise;
    try {
      return await savePromise;
    } catch (error) {
      productAutoSaveStatusRef.current = "failed";
      setProductAutoSaveStatus("failed");
      setStatusText(`资料自动保存失败: ${errorMessage(error)}`);
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

  function updateProductComposerText(text: string) {
    setProductImportText(text);
    productImportTextRef.current = text;
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
      if (activeSection === "video") {
        await applyProductToCreationComposerWithStoryboards(response.product);
        persistProductStudioSku(response.product.sku);
        setImportNotes([]);
        setProductLibraryDialogMode(undefined);
      } else {
        setProductDraft(productFactsToDraft(response.product));
        setProductEditorMode("manual");
        setProductLibraryDialogMode("edit");
      }
      setStatusText(`已载入商品到编辑草稿: ${response.product.title_ja}`);
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
    setConfirmPaid(false);
    setProductStudioLoadError("");
    setActiveSection("video");
    setIsBusy(true);
    try {
      const response = await getJson<{ product: ProductDetail }>(`/api/products/${encodeURIComponent(product.sku)}`);
      await applyProductToCreationComposerWithStoryboards(response.product);
      setImportNotes([]);
      persistProductStudioSku(response.product.sku);
      setProductStudioLoadError("");
      setStatusText(`已进入视频创作: ${response.product.title_ja}`);
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
    setStudioStoryboardDraft(defaultStoryboardDraft(template, duration));
    setStoryboardDraftTouched(false);
    setStoryboardDraftSource("default");
    setStudioStoryboardCnDraft("");
    setStoryboardHistory([]);
    setActiveSection("video");
    setStatusText("已切换为新商品创作，可以直接填写资料并添加图片。");
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
        text: importText
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
        `AI 已整理资料包: ${response.product.title_ja}`,
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
      title: "删除这个商品资料？",
      message: productTitle || sku,
      details: ["已有视频和生成记录不会被删除。"],
      confirmLabel: "确认删除",
      tone: "danger"
    });
    if (!confirmed) return;
    setIsBusy(true);
    try {
      const response = await deleteJson<{ deleted: true; sku: string; path: string }>(`/api/products/${encodeURIComponent(sku)}`);
      if (selectedProduct?.sku === sku) {
        startNewVideoProduct();
      }
      setStatusText(`商品已删除: ${productTitle || response.sku}`);
      await refreshConsole();
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function queueProductVideoJobs(product: ProductSummary, options?: ProductVideoGenerationOptions) {
    if (!ensureVideoModelConfigured()) {
      throw new Error("请先配置视频模型，再生成视频。");
    }
    const readiness = referenceReadiness(product);
    if (!readiness.ready) {
      setStatusText(`${product.title_ja}: ${readiness.label}`);
      throw new Error(readiness.label);
    }
    if (!product.importQuality?.ready) {
      setStatusText("商品资料还没整理完整。");
      throw new Error("商品资料还没整理完整。");
    }
    const selectedVideoModel = videoModelConfigs[videoModelChoice];
    const videoGenerationOptions: ProductVideoGenerationOptions = options ?? {
      provider: selectedVideoModel.provider,
      providerModel: selectedVideoModel.model,
      confirmPaid: selectedVideoModel.confirmPaid
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
        providerModel: videoGenerationOptions.providerModel,
        duration: selectedDuration,
        template,
        finalLanguage,
        cta,
        storyboardLines: splitDraftLines(studioStoryboardDraft),
        confirmPaid: videoGenerationOptions.confirmPaid,
        versions: selectedVersionCount
      });
      setVideoJobs((current) => mergeVideoJobs(response.jobs, current));
      videoJobsRef.current = mergeVideoJobs(response.jobs, videoJobsRef.current);
      setStatusText(`已开始制作 ${response.jobs.length} 个视频，完成后会自动刷新当前商品。`);
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
      setStatusText("请先粘贴商品资料。");
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
        "已整理出商品资料，请检查后保存到商品库。",
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
      setStatusText("请先粘贴商品资料。");
      return;
    }
    if (!ensureTextModelConfigured()) {
      return;
    }
    setIsBusy(true);
    try {
      const preview = await postJson<ProductImportPreviewResponse>("/api/products/import-ai-preview", {
        text: productImportText
      });
      const response = await postJson<{ product: ProductDetail }>("/api/products", preview.product);
      if (activeSection === "video") {
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
        activeSection === "video" ? `已导入商品并进入视频创作: ${response.product.title_ja}` : `已导入商品资料: ${response.product.title_ja}`,
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
      setStatusText("请先粘贴商品资料。");
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
        `批量导入完成: 成功 ${response.summary.imported}/${response.summary.total}，失败 ${response.summary.failed}`,
        ...response.results.map((item) =>
          item.status === "imported"
            ? `#${item.index} 已保存 ${item.product.title_ja}`
            : `#${item.index} 失败: ${item.error}`
        )
      ].join("\n"));
      await refreshConsole();
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function generateStoryboardDraft(product = selectedProduct) {
    if (!product) {
      setStatusText("请先选择商品。");
      return;
    }
    if (isGeneratingStoryboard) {
      return;
    }
    if (!ensureTextModelConfigured()) {
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
          template
        },
        controller.signal
      );
      const nextScriptDraft = response.scriptLines.join("\n");
      const nextStoryboardDraft = response.storyboardLines.join("\n");
      setStudioScriptDraft(nextScriptDraft);
      setStudioStoryboardDraft(nextStoryboardDraft);
      setStoryboardDraftTouched(true);
      setStoryboardDraftSource("ai");
      setStudioStoryboardCnDraft("");
      await pushStoryboardHistory({
        style: template,
        duration,
        script: nextStoryboardDraft
      }, product);
      setPreflight(undefined);
      setPreflightSignature("");
      setStatusText([
        "文本模型已生成脚本分镜草稿。",
        ...response.notes.map((note) => `- ${note}`)
      ].join("\n"));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        showError(new Error("文本模型生成超时，请检查 API 配置或稍后重试。"));
      } else {
        showError(error);
      }
    } finally {
      window.clearTimeout(timeout);
      setIsGeneratingStoryboard(false);
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
      const continueCreation = activeSection === "video";
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
      setStatusText(`${editingCurrentProduct ? "商品资料已更新" : continueCreation ? "商品已保存并进入视频创作" : "商品资料已保存"}: ${response.product.title_ja}`);
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
        `已导入参考图: ${response.imported.length}`,
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
        `已上传参考图: ${response.uploaded.length}`,
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
      setStatusText(`已删除参考图: ${response.deleted.reference}`);
      await refreshConsole();
    } catch (error) {
      showError(error);
      throw error;
    } finally {
      setIsBusy(false);
    }
  }

  async function generateProductReferenceImages(sku: string) {
    if (!sku) {
      return;
    }
    if (!ensureImageModelConfigured()) {
      return;
    }
    setIsBusy(true);
    try {
      const response = await postJson<{
        generated: Array<{ reference: string }>;
        product: ProductDetail;
      }>(`/api/products/${encodeURIComponent(sku)}/reference-images/generate`, {});
      await applyProductToCreationComposerWithStoryboards(response.product);
      setStatusText([
        `AI 已生成参考图: ${response.generated.length}`,
        ...response.generated.map((item) => `- ${item.reference}`)
      ].join("\n"));
      await refreshConsole();
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function selectFinalVersion(productSku: string, jobId: string) {
    setIsBusy(true);
    try {
      await postJson("/api/reviews/select-final", {
        productSku,
        jobId,
        note: "控制台手动选择"
      });
      setStatusText(`已选择最终版本: ${jobId}`);
      await refreshConsole();
    } catch (error) {
      showError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function showProviderUsage(taskId: string) {
    setIsBusy(true);
    try {
      const response = await getJson<{ task: Record<string, unknown> }>(`/api/provider-tasks/${encodeURIComponent(taskId)}`);
      setStatusText(formatProviderTask(response.task));
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
      setStatusText(formatProviderUsageReport(response.usage));
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
      setStatusText(`已取消 queued 任务: ${response.taskId}`);
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
      setStatusText(`已删除视频记录: ${deletedJobId}`);
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
      setStatusText(`已删除历史视频记录: ${response.jobId}`);
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
      setStatusText("请先配置视频模型，再重试生成视频。");
      return;
    }
    if (paidRetry) {
      const confirmed = await requestConfirmAction({
        title: "重试这个付费生成任务？",
        message: `${videoModelLabel(job.provider, job.providerModel)} / ${formatDuration(job.durationSeconds)}`,
        details: ["重试会重新创建生成任务，可能再次扣费。"],
        confirmLabel: "确认重试",
        tone: "paid"
      });
      if (!confirmed) {
        setStatusText("已取消重试付费任务。");
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
      setStatusText(`已重试任务: ${job.id} -> ${response.job.id}`);
      await refreshConsole();
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
        `备份包已生成: ${response.backup.fileName}`,
        `大小: ${formatBytes(response.backup.sizeBytes)}`,
        `路径: ${response.backup.path}`
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
      setStatusText("该视频文件已经不存在。");
      return;
    }
    const confirmed = await requestConfirmAction({
      title: "删除这个本地视频文件？",
      message: asset.path,
      details: ["任务记录、成本、脚本和报告会保留。"],
      confirmLabel: "确认删除",
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
      setStatusText(`已删除视频文件: ${body.path}\n释放空间: ${formatBytes(body.sizeBytes)}\n任务元数据和成本记录已保留。`);
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
      setAuthStatus("登录已过期，请重新输入邮箱和密码。");
      return;
    }
    setStatusText(message);
  }

  function renderActiveSection() {
    switch (activeSection) {
      case "dashboard":
        return (
          <section className="grid gap-4" aria-label="仪表盘">
            <KpiGrid
              items={[
                { label: "商品", value: formatNumber(products.length), hint: "可创作商品", icon: Package, tone: "blue" },
	                { label: "生成记录", value: formatNumber(ledger?.summary.totalJobs), hint: `${formatNumber(ledger?.summary.completedJobs)} 完成`, icon: Clapperboard, tone: "green" },
                { label: "付费任务", value: formatNumber(ledger?.summary.paidJobs), hint: `${formatNumber(ledger?.summary.mockJobs)} 本地模拟`, icon: CircleDollarSign, tone: "orange" },
                { label: "总 Token", value: formatNumber(ledger?.summary.totalTokens), hint: `¥${money(ledger?.summary.estimatedCostCny)}`, icon: Gauge, tone: "violet" },
                { label: "最终视频", value: formatNumber(ledger?.summary.finalVideos), hint: "可下载视频", icon: FileVideo, tone: "rose" },
                { label: "复用 raw", value: formatNumber(ledger?.summary.reusedRawManifests), hint: "省一次生成", icon: Database, tone: "cyan" }
              ]}
            />

            <DashboardStatsPanel
              analytics={dashboardAnalytics}
              range={dashboardRange}
              granularity={dashboardGranularity}
              onRangeChange={setDashboardRange}
              onGranularityChange={setDashboardGranularity}
              onRefresh={() => void refreshConsole()}
              isBusy={isBusy || isLoading}
            />
          </section>
        );
      case "video":
        return (
          <section className="grid gap-4" aria-label="视频创作">
            <ProductCreationWorkspace
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
              onOrganizeProductPackage={organizeProductPackage}
              onFlushProductFactsAutoSave={flushProductFactsAutoSave}
              onSelectProduct={openProductStudio}
              onStartNewProduct={startNewVideoProduct}
              onDeleteProduct={deleteProduct}
              onGenerateVideo={queueProductVideoJobs}
              onCancelVideoJob={cancelVideoJob}
              onDeleteLedgerVideo={deleteLedgerVideo}
              onRetryVideoJob={retryVideoJob}
              onGenerateStoryboardDraft={generateStoryboardDraft}
              isGeneratingStoryboard={isGeneratingStoryboard}
              onImportAssets={importProductAssets}
              onUploadImages={uploadProductReferenceImages}
              onGenerateReferenceImages={generateProductReferenceImages}
              onDeleteReferenceImage={deleteProductReferenceImage}
              videoModelChoice={videoModelChoice}
              onVideoModelChoiceChange={(nextVideoModelChoice) => {
                setVideoModelChoice(nextVideoModelChoice);
                setProvider(videoModelConfigs[nextVideoModelChoice].provider);
                markPreflightStale();
              }}
              duration={duration}
              onDurationChange={(nextDuration) => {
                setDuration(nextDuration);
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
              storyboardDraftIsGuidance={!storyboardDraftTouched}
              storyboardDraftSource={storyboardDraftSource}
              onStoryboardDraftChange={(nextDraft) => {
                setStoryboardDraftTouched(true);
                setStoryboardDraftSource("manual");
                setStudioStoryboardDraft(nextDraft);
                markPreflightStale();
              }}
              storyboardHistory={storyboardHistory}
              onApplyStoryboardHistory={applyStoryboardHistory}
              onDeleteStoryboardHistory={deleteStoryboardHistory}
              onToast={showConsoleToast}
            />
          </section>
        );
      case "ledger":
        return (
          <section className="grid gap-4" aria-label="任务记录">
            <VideoJobsPanel jobs={videoJobs} onCancel={cancelVideoJob} onRetry={retryVideoJob} />
            <VideoAssetsPanel assets={videoAssets} onDelete={deleteVideoAsset} isBusy={isBusy} />
          </section>
        );
      case "settings":
        return (
          <section className="grid gap-4" aria-label="API 管理">
            <ApiModelConfigPanel
              config={providerConfig}
              drafts={modelConfigDrafts}
              testStatuses={modelConfigTestStatus}
              onDraftChange={updateModelConfigDraft}
              onApplyPreset={applyModelPreset}
              onSave={saveModelConfig}
              onTest={testModelConfig}
              onClear={clearModelConfig}
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
        "relative grid h-dvh overflow-hidden bg-[radial-gradient(circle_at_0_0,rgba(10,163,148,.12),transparent_28%),radial-gradient(circle_at_100%_0,rgba(37,99,235,.10),transparent_28%),var(--bg)] text-[var(--text)] transition-[grid-template-columns] duration-200",
        sidebarCollapsed
          ? "min-[900px]:grid-cols-[56px_minmax(0,1fr)]"
          : "min-[900px]:grid-cols-[184px_minmax(0,1fr)]"
      )}
    >
      <aside
        className={cn(
          "relative hidden h-dvh min-h-0 overflow-visible border-r border-[var(--border)] bg-white transition-[width] duration-200 min-[900px]:grid min-[900px]:grid-rows-[auto_minmax(0,1fr)]",
          sidebarCollapsed ? "w-[56px]" : "w-[184px]"
        )}
      >
        <button
          type="button"
          className="app-sidebar-toggle group absolute inset-y-0 right-[-8px] z-30 hidden w-4 cursor-pointer bg-transparent text-[var(--muted)] transition-colors hover:text-[var(--accent)] focus-visible:outline-none min-[900px]:flex min-[900px]:items-center min-[900px]:justify-center"
          aria-label={sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
          title={sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        >
          <span className="app-sidebar-collapse-edge pointer-events-none grid h-12 w-4 place-items-center">
            <span className="app-sidebar-collapse-thumb grid h-10 w-4 place-items-center rounded-full border border-[#d5dfec] bg-white/95 shadow-[0_8px_20px_rgba(30,42,68,.10)]">
              {sidebarCollapsed ? <ChevronRight size={13} strokeWidth={2.4} /> : <ChevronLeft size={13} strokeWidth={2.4} />}
            </span>
          </span>
        </button>
        <div className={cn("relative flex h-[72px] items-center border-b border-[var(--border)]", sidebarCollapsed ? "justify-center px-2" : "gap-2.5 px-3.5")}>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[linear-gradient(135deg,var(--accent2),var(--accent))] text-lg font-black text-white shadow-[0_12px_24px_rgba(10,163,148,.22)]">海</div>
          <div className={cn("min-w-0", sidebarCollapsed && "sr-only")}>
            <div className="truncate text-[20px] font-black leading-tight">Haitu</div>
            <div className="truncate text-xs font-semibold text-[var(--muted)]">AI 商品视频平台</div>
          </div>
        </div>
        <nav
          className={cn(
            "grid min-h-0 content-start gap-4 py-4",
            sidebarCollapsed ? "overflow-visible" : "overflow-y-auto",
            sidebarCollapsed ? "px-1.5" : "px-2.5"
          )}
          aria-label="控制台导航"
        >
          {navGroups.map((group) => (
            <div key={group.label} className="grid gap-1">
              <div className={cn("px-3 text-[11px] font-black uppercase tracking-[.12em] text-[var(--muted)]", sidebarCollapsed && "sr-only")}>{group.label}</div>
              {group.items.map(({ id, label, icon: Icon }) => {
                const active = activeSection === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    title={sidebarCollapsed ? label : undefined}
                    onClick={() => setActiveSection(id)}
                    className={cn(
                      "group/sidebar-nav-item relative grid min-h-9 w-full items-center rounded-lg border text-left text-[13px] font-bold transition",
                      sidebarCollapsed
                        ? "grid-cols-1 justify-items-center px-0"
                        : "grid-cols-[28px_minmax(0,1fr)] gap-2 px-3",
                      active
                        ? "border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,white)] text-[var(--text)]"
                        : "border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--panel2)] hover:text-[var(--text)]"
                    )}
                  >
                    <Icon size={17} strokeWidth={2} />
                    <span className={cn("truncate", sidebarCollapsed && "sr-only")}>{label}</span>
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
      </aside>

      <section className="grid h-dvh min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <header className="sticky top-0 z-20 grid min-h-[72px] gap-3 border-b border-[var(--border)] bg-white/95 px-4 py-3 backdrop-blur min-[760px]:grid-cols-[minmax(0,1fr)_auto] min-[760px]:items-center min-[1100px]:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-xl font-black leading-tight">{activeSectionLabel}</h1>
            </div>
            <p className="m-0 mt-1 truncate text-[12px] font-medium text-[var(--muted)]">{activeSectionSubtitle}</p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Select
              className="w-[148px] min-[900px]:hidden"
              aria-label="切换模块"
              value={activeSection}
              onChange={(event) => setActiveSection(event.target.value as ConsoleSection)}
            >
              {activeSectionInVisibleNav ? null : (
                <option value={activeSection}>{activeSectionLabel}</option>
              )}
              {navGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.items.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
            {authSession.authEnabled ? (
              <AccountMenu
                email={authSession.user?.email}
                disabled={isBusy}
                onLogout={() => void logout()}
              />
            ) : null}
          </div>
        </header>

        <div ref={contentScrollerRef} className="min-h-0 overflow-y-auto px-4 py-4 min-[1100px]:px-6">
          {renderActiveSection()}
        </div>
        <ConsoleToast consoleToast={consoleToast} onClose={handleConsoleToastClose} />
        <ConfirmActionDialog
          action={confirmAction}
          isBusy={isBusy}
          onCancel={() => resolveConfirmAction(false)}
          onConfirm={() => resolveConfirmAction(true)}
        />
      </section>
    </main>
  );
}

function AccountMenu({ email, disabled, onLogout }: { email?: string; disabled?: boolean; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const accountLabel = email?.trim() || "账号";
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
        aria-label="账号菜单"
        aria-expanded={open}
        className={cn(
          "grid min-h-8 max-w-[min(260px,calc(100vw-48px))] grid-cols-[24px_minmax(0,1fr)_14px] items-center gap-2 rounded-[8px] border border-[var(--border)] bg-white px-2 py-1.5 text-left text-xs font-black text-[var(--text)] shadow-[0_8px_18px_rgba(15,23,42,.05)] transition hover:border-[color-mix(in_srgb,var(--accent)_42%,var(--border))] hover:bg-[color-mix(in_srgb,var(--accent)_5%,white)] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(10,163,148,.18)] disabled:cursor-not-allowed disabled:opacity-55",
          open && "border-[color-mix(in_srgb,var(--accent)_55%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_7%,white)]"
        )}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="grid h-6 w-6 place-items-center rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,white)] text-[11px] font-black text-[var(--accent)]">
          {accountInitial}
        </span>
        <span className="truncate">{accountLabel}</span>
        <ChevronDown className={cn("text-[var(--muted)] transition-transform", open && "rotate-180")} size={14} strokeWidth={2.4} />
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(280px,calc(100vw-32px))] overflow-hidden rounded-[8px] border border-[#dbe4f0] bg-white shadow-[0_18px_46px_rgba(15,23,42,.16)]">
          <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-2.5 border-b border-[#e8eef6] bg-[linear-gradient(180deg,#ffffff,#f8fbff)] px-3 py-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-[linear-gradient(135deg,var(--accent2),var(--accent))] text-sm font-black text-white shadow-[0_10px_20px_rgba(10,163,148,.18)]">
              {accountInitial}
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-black text-[var(--muted)]">账号</div>
              <div className="mt-1 truncate text-[13px] font-black text-[var(--text)]">{accountLabel}</div>
            </div>
          </div>
          <div className="p-1.5">
            <button
              type="button"
              className="flex min-h-9 w-full items-center gap-2 rounded-[7px] px-2.5 text-left text-[13px] font-black text-[var(--danger)] transition hover:bg-red-50 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(239,68,68,.14)] disabled:cursor-not-allowed disabled:opacity-55"
              disabled={disabled}
              onClick={handleLogout}
            >
              <KeyRound size={15} />
              <span>退出登录</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ConsoleToast({ consoleToast, onClose }: { consoleToast?: ConsoleToastState; onClose: () => void }) {
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
    <div className="pointer-events-none fixed right-5 top-[86px] z-[70] w-[min(360px,calc(100vw-32px))]">
      <div
        className={cn(
          "pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 shadow-[0_18px_46px_rgba(15,23,42,.14)] backdrop-blur-md",
          warn
            ? "border-amber-200 bg-amber-50/88 text-amber-900"
            : ok
              ? "border-emerald-200 bg-emerald-50/90 text-emerald-950"
              : "border-[#dbe4f0] bg-white/88 text-[#172033]"
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
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-current opacity-65 transition hover:bg-white/65 hover:opacity-100"
          aria-label="关闭提示"
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
  const iconBgClass = paid ? "bg-amber-50" : danger ? "bg-red-50" : "bg-[color-mix(in_srgb,var(--accent)_10%,white)]";
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
      <section className="grid w-full max-w-[500px] gap-4 rounded-[18px] border border-[#dbe4f0] bg-white p-5 shadow-[0_28px_90px_rgba(23,32,51,.26)]">
        <div className="flex items-start justify-between gap-3">
          <div className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)] gap-3">
            <div className={cn("grid h-10 w-10 place-items-center rounded-xl border border-white shadow-[0_12px_24px_rgba(30,42,68,.08)]", iconBgClass)}>
              <Icon className={iconClass} size={19} strokeWidth={2.4} />
            </div>
            <div className="min-w-0">
              <div className="text-[17px] font-black leading-6 text-[#172033]">{action.title}</div>
              <div className="mt-2 break-words text-[13px] font-bold leading-6 text-[#2b3445]">{action.message}</div>
            </div>
          </div>
          <Button className="w-fit" size="icon" variant="ghost" aria-label="关闭确认弹窗" disabled={isBusy} onClick={onCancel}>
            <X size={15} />
          </Button>
        </div>
        {action.details?.length ? (
          <div className="grid gap-1.5 rounded-[12px] border border-[#e5ecf6] bg-[#f8fbff] px-3 py-2.5 text-xs font-semibold leading-5 text-[#6c7890]">
            {action.details.map((detail) => (
              <div key={detail}>{detail}</div>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button className="w-fit" variant="ghost" disabled={isBusy} onClick={onCancel}>
            {action.cancelLabel ?? "取消"}
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
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_15%_10%,rgba(10,163,148,.15),transparent_26%),radial-gradient(circle_at_85%_0,rgba(37,99,235,.12),transparent_30%),var(--bg)] px-4 py-8 text-[var(--text)]">
      <Card className="w-full max-w-[420px] p-5 shadow-[0_22px_60px_rgba(15,23,42,.12)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-[linear-gradient(135deg,var(--accent2),var(--accent))] text-lg font-black text-white shadow-[0_12px_24px_rgba(10,163,148,.22)]">海</div>
          <div className="min-w-0">
            <h1 className="m-0 text-xl font-black leading-tight">Haitu 账号入口</h1>
            <p className="m-0 mt-1 text-xs font-semibold text-[var(--muted)]">
              {mode === "forgot-password"
                ? "用邮箱验证码重置密码"
                : mode === "verify-email"
                  ? "输入邮箱验证码完成账号创建"
                  : "登录或创建账号"}
            </p>
          </div>
        </div>
        {mode === "entry" ? (
          <form className="grid gap-4" onSubmit={onLogin}>
            <Field label="邮箱">
              <Input
                autoFocus
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="请输入邮箱"
              />
            </Field>
            <Field label="密码">
              <Input
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="请输入密码"
              />
            </Field>
            <Button variant="primary" type="submit" disabled={isBusy || !email.trim() || !password.trim()}>
              <KeyRound size={15} />
              登录 / 创建账号
            </Button>
            <div className="flex items-center justify-between gap-3 text-xs font-semibold">
              <span className="text-[var(--muted)]">新邮箱首次登录会验证后创建</span>
              <button
                type="button"
                className="font-black text-[var(--accent)] hover:underline"
                onClick={() => {
                  setMode("forgot-password");
                  setOtp("");
                  setNewPassword("");
                }}
              >
                忘记密码
              </button>
            </div>
            <AuthStatus status={status} />
          </form>
        ) : null}

        {mode === "verify-email" ? (
          <form className="grid gap-4" onSubmit={onVerifyEmail}>
            <Field label="邮箱">
              <Input
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="请输入邮箱"
              />
            </Field>
            <AuthOtpField
              autoFocus
              value={otp}
              onChange={setOtp}
              sendLabel={verifiedEmailOtpLabel}
              disabled={isBusy || !email.trim() || !password.trim() || authOtpCooldownSeconds > 0}
              onSend={onResendVerificationCode}
            />
            <Button variant="primary" type="submit" disabled={isBusy || !email.trim() || !otp.trim()}>
              <MailCheck size={15} />
              验证邮箱并进入
            </Button>
            <button
              type="button"
              className="justify-self-center text-xs font-black text-[var(--accent)] hover:underline"
              onClick={() => setMode("entry")}
            >
              返回账号入口
            </button>
            <AuthStatus status={status} />
          </form>
        ) : null}

        {mode === "forgot-password" ? (
          <div className="grid gap-4">
            <Field label="邮箱">
              <Input
                autoFocus
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="请输入邮箱"
              />
            </Field>
            <form className="grid gap-4" onSubmit={onResetPassword}>
              <Field label="新密码">
                <Input
                  autoComplete="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="至少 8 位"
                />
              </Field>
              <AuthOtpField
                value={otp}
                onChange={setOtp}
                sendLabel={passwordResetOtpLabel}
                disabled={isBusy || !email.trim() || authOtpCooldownSeconds > 0}
                onSend={onRequestPasswordReset}
              />
              <Button variant="primary" type="submit" disabled={resetDisabled}>
                <KeyRound size={15} />
                重置密码
              </Button>
            </form>
            <button
              type="button"
              className="justify-self-center text-xs font-black text-[var(--accent)] hover:underline"
              onClick={() => setMode("entry")}
            >
              返回账号入口
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
  onChange,
  onSend,
  sendLabel,
  value
}: {
  autoFocus?: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onSend: () => Promise<void>;
  sendLabel: string;
  value: string;
}) {
  return (
    <Field label="验证码">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Input
          autoFocus={autoFocus}
          autoComplete="one-time-code"
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="6 位验证码"
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
    return `${cooldownSeconds} 秒后可重新发送`;
  }
  return sent ? "重发验证码" : "发送验证码";
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
  if (!preflight) {
    return (
      <Card>
        <PanelTitle icon={<ShieldCheck size={16} />} right={<Badge>未生成</Badge>}>生成预检</PanelTitle>
        <div className="grid min-h-[260px] place-items-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--panel2)] p-6 text-center">
          <div className="grid max-w-[360px] justify-items-center gap-3">
            <Sparkles className="text-[var(--accent)]" size={32} />
            <div>
              <div className="text-[15px] font-black">先生成预检</div>
              <p className="m-0 mt-1 text-[12px] text-[var(--muted)]">这里会展示预计 token、人民币成本、参考图状态、脚本要点和 Seedance prompt。</p>
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
        right={<Badge tone={preflight.requiresPaidConfirmation ? "danger" : "ok"}>{fresh ? "已预检" : "需重预检"}</Badge>}
      >
        生成预检
      </PanelTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <MiniMetric label="期望成本" value={`¥${money(preflight.estimatedCostCny.expected)}`} hint={`区间 ¥${money(preflight.estimatedCostCny.low)} - ¥${money(preflight.estimatedCostCny.high)}`} />
        <MiniMetric label="期望 Token" value={formatNumber(preflight.estimatedTokens.expected)} hint={`${formatNumber(preflight.estimatedTokens.low)} - ${formatNumber(preflight.estimatedTokens.high)}`} />
        <MiniMetric label="时长" value={`${preflight.durationSeconds}s`} hint={preflight.aspectRatio} />
        <MiniMetric label="生成通道" value={providerLabel(preflight.provider)} hint={preflight.requiresPaidConfirmation ? "运行会扣费" : "无需付费确认"} />
        <MiniMetric label="测试额度" value={`¥${money(preflight.credit.availableEstimatedCostCny)}`} hint={`总额 ¥${money(preflight.credit.testCreditBalanceCny)} / 已用 ¥${money(preflight.credit.usedEstimatedCostCny)}`} />
        <MiniMetric label="额度状态" value={preflight.credit.enoughCredit ? "足够" : "不足"} hint={`本次约 ¥${money(preflight.credit.estimatedCostCny)}`} />
      </div>
      {!preflight.credit.enoughCredit ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold text-[var(--danger)]">
          剩余测试额度不足，请提高测试额度或缩短时长后再运行付费任务。
        </div>
      ) : null}
      {preflight.paidProvider ? (
        <div className={cn(
          "mt-3 rounded-lg border p-3 text-xs font-bold leading-5",
          preflight.readiness.readyForPaidGeneration
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-red-200 bg-red-50 text-[var(--danger)]"
        )}>
          <div className="flex items-center gap-2 text-[13px] font-black">
            {preflight.readiness.readyForPaidGeneration ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            {preflight.readiness.readyForPaidGeneration ? "商品资料可用于付费生成" : "商品资料暂不可付费生成"}
          </div>
          {preflight.readiness.blockingReasons.length > 0 ? (
            <div className="mt-1">阻塞原因：{preflight.readiness.blockingReasons.join("、")}</div>
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
          参考图 {formatNumber(preflight.assetSummary.previewable)}/{formatNumber(preflight.assetSummary.total)} 可预览
        </div>
        <div className="mt-1 text-xs text-[var(--muted)]">
          {formatNumber(preflight.assetSummary.missing)} 缺失 · {formatNumber(preflight.assetSummary.outsideProjectRoot)} 项目外 · {formatNumber(preflight.assetSummary.remote)} 远程
        </div>
      </div>
      <CopyBlock title="脚本要点">
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
  onOrganizeProductPackage,
  onFlushProductFactsAutoSave,
  onSelectProduct,
  onStartNewProduct,
  onDeleteProduct,
  onGenerateVideo,
  onCancelVideoJob,
  onDeleteLedgerVideo,
  onRetryVideoJob,
  onGenerateStoryboardDraft,
  isGeneratingStoryboard,
  onImportAssets,
  onUploadImages,
  onGenerateReferenceImages,
  onDeleteReferenceImage,
  videoModelChoice,
  onVideoModelChoiceChange,
  duration,
  onDurationChange,
  versionCount,
  onVersionCountChange,
  template,
  enabledTemplateOptions,
  onTemplateChange,
  finalLanguage,
  onFinalLanguageChange,
  storyboardDraft,
  storyboardDraftIsGuidance,
  storyboardDraftSource,
  onStoryboardDraftChange,
  storyboardHistory,
  onApplyStoryboardHistory,
  onDeleteStoryboardHistory,
  onToast
}: {
  products: ProductSummary[];
  pendingProductSku?: string;
  selectedProduct?: ProductDetail;
  loadError?: string;
  selectedProductGroup?: ProductGroup;
  ledgerJobs: LedgerJob[];
  videoJobs: VideoJob[];
  draft: ProductDraft;
  importText: string;
  setImportText: (text: string) => void;
  pendingImageFiles: File[];
  setPendingImageFiles: Dispatch<SetStateAction<File[]>>;
  importNotes: string[];
  productAutoSaveStatus: ProductAutoSaveStatus;
  onOrganizeProductPackage: () => Promise<ProductDetail | undefined>;
  onFlushProductFactsAutoSave: () => Promise<ProductDetail | undefined>;
  onSelectProduct: (product: ProductSummary) => Promise<void>;
  onStartNewProduct: () => void;
  onDeleteProduct: (sku: string) => Promise<void>;
  onGenerateVideo: (product: ProductSummary, options: ProductVideoGenerationOptions) => Promise<void>;
  onCancelVideoJob: (jobId: string) => Promise<void>;
  onDeleteLedgerVideo: (jobId: string) => Promise<void>;
  onRetryVideoJob: (job: VideoJob) => Promise<void>;
  onGenerateStoryboardDraft: (product?: ProductDetail) => Promise<void>;
  isGeneratingStoryboard: boolean;
  onImportAssets: (sku: string) => Promise<void>;
  onUploadImages: (sku: string, files: FileList | File[] | null) => Promise<ProductDetail | undefined>;
  onGenerateReferenceImages: (sku: string) => Promise<void>;
  onDeleteReferenceImage: (sku: string, index: number) => Promise<void>;
  videoModelChoice: VideoModelChoice;
  onVideoModelChoiceChange: (choice: VideoModelChoice) => void;
  duration: number;
  onDurationChange: (duration: number) => void;
  versionCount: number;
  onVersionCountChange: (versionCount: number) => void;
  template: TemplateName;
  enabledTemplateOptions: TemplateName[];
  onTemplateChange: (template: TemplateName) => void;
  finalLanguage: FinalVideoLanguage;
  onFinalLanguageChange: (language: FinalVideoLanguage) => void;
  storyboardDraft: string;
  storyboardDraftIsGuidance: boolean;
  storyboardDraftSource: StoryboardDraftSource;
  onStoryboardDraftChange: (draft: string) => void;
  storyboardHistory: StoryboardHistoryRecord[];
  onApplyStoryboardHistory: (record: StoryboardHistoryRecord) => void;
  onDeleteStoryboardHistory: (recordId: string) => Promise<void>;
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
  const selectedProductStoryboardHistory = selectedProduct
    ? storyboardHistory
    : [];

  return (
    <ProductCreationComposer
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
      onOrganizeProductPackage={onOrganizeProductPackage}
      onFlushProductFactsAutoSave={onFlushProductFactsAutoSave}
      onSelectProduct={onSelectProduct}
      onStartNewProduct={onStartNewProduct}
      onDeleteProduct={onDeleteProduct}
      onGenerateVideo={onGenerateVideo}
      onCancelVideoJob={onCancelVideoJob}
      onDeleteLedgerVideo={onDeleteLedgerVideo}
      onRetryVideoJob={onRetryVideoJob}
      onGenerateStoryboardDraft={onGenerateStoryboardDraft}
      isGeneratingStoryboard={isGeneratingStoryboard}
      onImportAssets={onImportAssets}
      onUploadImages={onUploadImages}
      onGenerateReferenceImages={onGenerateReferenceImages}
      onDeleteReferenceImage={onDeleteReferenceImage}
      videoModelChoice={videoModelChoice}
      onVideoModelChoiceChange={onVideoModelChoiceChange}
      duration={duration}
      onDurationChange={onDurationChange}
      versionCount={versionCount}
      onVersionCountChange={onVersionCountChange}
      template={template}
      enabledTemplateOptions={enabledTemplateOptions}
      onTemplateChange={onTemplateChange}
      finalLanguage={finalLanguage}
      onFinalLanguageChange={onFinalLanguageChange}
      storyboardDraft={storyboardDraft}
      storyboardDraftIsGuidance={storyboardDraftIsGuidance}
      storyboardDraftSource={storyboardDraftSource}
      onStoryboardDraftChange={onStoryboardDraftChange}
      storyboardHistory={selectedProductStoryboardHistory}
      onApplyStoryboardHistory={onApplyStoryboardHistory}
      onDeleteStoryboardHistory={onDeleteStoryboardHistory}
      onToast={onToast}
    />
  );
}

function ProductCreationComposer({
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
  onOrganizeProductPackage,
  onFlushProductFactsAutoSave,
  onSelectProduct,
  onStartNewProduct,
  onDeleteProduct,
  onGenerateVideo,
  onCancelVideoJob,
  onDeleteLedgerVideo,
  onRetryVideoJob,
  onGenerateStoryboardDraft,
  isGeneratingStoryboard,
  onImportAssets,
  onUploadImages,
  onGenerateReferenceImages,
  onDeleteReferenceImage,
  videoModelChoice,
  onVideoModelChoiceChange,
  duration,
  onDurationChange,
  versionCount,
  onVersionCountChange,
  template,
  enabledTemplateOptions,
  onTemplateChange,
  finalLanguage,
  onFinalLanguageChange,
  storyboardDraft,
  storyboardDraftIsGuidance,
  storyboardDraftSource,
  onStoryboardDraftChange,
  storyboardHistory,
  onApplyStoryboardHistory,
  onDeleteStoryboardHistory,
  onToast
}: {
  products: ProductSummary[];
  pendingProductSku?: string;
  selectedProduct?: ProductDetail;
  latestCreativeJobs: CreativeVersionItem[];
  loadError?: string;
  draft: ProductDraft;
  importText: string;
  setImportText: (text: string) => void;
  pendingImageFiles: File[];
  setPendingImageFiles: Dispatch<SetStateAction<File[]>>;
  importNotes: string[];
  productAutoSaveStatus: ProductAutoSaveStatus;
  onOrganizeProductPackage: () => Promise<ProductDetail | undefined>;
  onFlushProductFactsAutoSave: () => Promise<ProductDetail | undefined>;
  onSelectProduct: (product: ProductSummary) => Promise<void>;
  onStartNewProduct: () => void;
  onDeleteProduct: (sku: string) => Promise<void>;
  onGenerateVideo: (product: ProductSummary, options: ProductVideoGenerationOptions) => Promise<void>;
  onCancelVideoJob: (jobId: string) => Promise<void>;
  onDeleteLedgerVideo: (jobId: string) => Promise<void>;
  onRetryVideoJob: (job: VideoJob) => Promise<void>;
  onGenerateStoryboardDraft: (product?: ProductDetail) => Promise<void>;
  isGeneratingStoryboard: boolean;
  onImportAssets: (sku: string) => Promise<void>;
  onUploadImages: (sku: string, files: FileList | File[] | null) => Promise<ProductDetail | undefined>;
  onGenerateReferenceImages: (sku: string) => Promise<void>;
  onDeleteReferenceImage: (sku: string, index: number) => Promise<void>;
  videoModelChoice: VideoModelChoice;
  onVideoModelChoiceChange: (choice: VideoModelChoice) => void;
  duration: number;
  onDurationChange: (duration: number) => void;
  versionCount: number;
  onVersionCountChange: (versionCount: number) => void;
  template: TemplateName;
  enabledTemplateOptions: TemplateName[];
  onTemplateChange: (template: TemplateName) => void;
  finalLanguage: FinalVideoLanguage;
  onFinalLanguageChange: (language: FinalVideoLanguage) => void;
  storyboardDraft: string;
  storyboardDraftIsGuidance: boolean;
  storyboardDraftSource: StoryboardDraftSource;
  onStoryboardDraftChange: (draft: string) => void;
  storyboardHistory: StoryboardHistoryRecord[];
  onApplyStoryboardHistory: (record: StoryboardHistoryRecord) => void;
  onDeleteStoryboardHistory: (recordId: string) => Promise<void>;
  onToast: ConsoleToastFn;
}) {
  const [isPacking, setIsPacking] = useState(false);
  const [isSubmittingVideo, setIsSubmittingVideo] = useState(false);
  const [previewJob, setPreviewJob] = useState<CreativeVersionItem | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<CreativeVersionItem | undefined>();
  const [previewReferenceIndex, setPreviewReferenceIndex] = useState<number | undefined>();
  const selectedSku = selectedProduct?.sku ?? pendingProductSku ?? "";
  const previewReferenceImages = selectedProduct?.reference_image_statuses ?? [];
  const pendingReferenceImageStatuses = useMemo<ReferenceImageStatus[]>(
    () => pendingImageFiles.map((file, index) => ({
      original: file.name || `待上传图片 ${index + 1}`,
      resolvedPath: file.name,
      previewUrl: URL.createObjectURL(file),
      status: "previewable"
    })),
    [pendingImageFiles]
  );
  const previewableReferenceImages = selectedProduct ? previewReferenceImages : pendingReferenceImageStatuses;
  const videoModelConfig = videoModelConfigs[videoModelChoice];
  const durationOptions = ["5", "8", "10", "12", "15"];
  const versionCountOptions = ["1", "2", "3", "4", "5"];
  const languageOptions: FinalVideoLanguage[] = ["ja", "zh"];
  const templateOptions = enabledTemplateOptions.includes(template)
    ? enabledTemplateOptions
    : [template, ...enabledTemplateOptions];
  const packingDisabled = isPacking || isSubmittingVideo;
  const productFactsBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const productFactsLineCount = importText.trim() ? importText.split(/\r?\n/).length : 8;
  const productFactsRows = Math.max(8, Math.min(15, productFactsLineCount + 1));
  const productAutoSaveLabel = productAutoSaveStatusLabel(productAutoSaveStatus);
  const generateVideoButtonLabel = versionCount > 1 ? `生成 ${versionCount} 个视频` : "生成视频";
  const storyboardProductReady = Boolean(selectedProduct || importText.trim());
  const generationReadiness = productGenerationReadiness({
    selectedProduct,
    importText,
    pendingImageCount: pendingImageFiles.length
  });
  const generateVideoDisabled = packingDisabled || !generationReadiness.ready;
  const generateVideoButtonClass = cn(
    "min-h-12 w-full justify-center rounded-[14px] text-sm",
    generateVideoDisabled && "border-[#d6dee9] bg-[#edf2f7] text-[#93a0b3] shadow-none hover:brightness-100 disabled:opacity-100"
  );
  const generationReadinessMessageClass = cn(
    "generation-readiness-message flex min-h-12 w-full max-w-[360px] justify-self-center items-center justify-center text-center text-xs font-black leading-5",
    generationReadiness.ready ? "text-[#6c7890]" : "text-[var(--danger)]"
  );
  const generateVideoSummary = [
    productFactsStatusLabel({ selectedProduct, importText }),
    selectedProduct ? `参考图 ${productReferenceCount(selectedProduct)} 张` : pendingImageFiles.length > 0 ? `待上传 ${pendingImageFiles.length} 张` : "参考图 0 张",
    storyboardStatusLabel(storyboardDraftSource),
    templateLabel(template),
    formatDuration(duration),
    finalLanguageLabel(finalLanguage),
    videoModelChoiceLabel(videoModelChoice)
  ].join(" · ");

  useEffect(() => {
    setPreviewReferenceIndex(undefined);
    if (productFactsBodyRef.current) {
      productFactsBodyRef.current.scrollTop = 0;
    }
  }, [selectedProduct?.sku]);

  useEffect(() => {
    if (previewReferenceIndex === undefined) return;
    if (previewableReferenceImages.length === 0) {
      setPreviewReferenceIndex(undefined);
      return;
    }
    if (previewReferenceIndex >= previewableReferenceImages.length) {
      setPreviewReferenceIndex(previewableReferenceImages.length - 1);
    }
  }, [previewableReferenceImages.length, previewReferenceIndex]);

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
        onToast("资料包已整理。", "ok");
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
    if (packingDisabled) return;
    setIsSubmittingVideo(true);
    try {
      const autoSavedProduct = await onFlushProductFactsAutoSave();
      const savedProduct = autoSavedProduct ?? await handleOrganizeProductPackage({ silentSuccess: true });
      if (!savedProduct) return;
      await onGenerateVideo(productActionSummary(savedProduct), {
        provider: videoModelConfig.provider,
        providerModel: videoModelConfig.model,
        confirmPaid: videoModelConfig.confirmPaid
      });
      onToast("已加入历史记录，生成中可删除取消，完成后可预览和下载。", "ok");
    } catch (error) {
      onToast(errorMessage(error));
    } finally {
      setIsSubmittingVideo(false);
    }
  }

  async function handleGenerateStoryboardDraft() {
    const productForStoryboard = await onFlushProductFactsAutoSave() ?? selectedProduct ?? await handleOrganizeProductPackage({ silentSuccess: true });
    if (!productForStoryboard) return;
    await onGenerateStoryboardDraft(productForStoryboard);
  }

  function handleReferenceFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    const incomingFiles = Array.from(files);
    const acceptedFiles = incomingFiles.filter(isReferenceImageFile);
    if (acceptedFiles.length === 0) {
      onToast("只支持 JPG、PNG、WebP 图片。");
      return;
    }
    if (acceptedFiles.length < incomingFiles.length) {
      onToast("已忽略非图片文件。");
    }
    if (selectedProduct) {
      void onUploadImages(selectedProduct.sku, acceptedFiles);
      return;
    }
    setPendingImageFiles((current) => [...current, ...acceptedFiles]);
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
    handleReferenceFiles(files);
  }

  function handleProductFactsPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = clipboardReferenceFiles(event.clipboardData);
    if (!files.some(isReferenceImageFile)) return;
    event.stopPropagation();
    event.preventDefault();
    handleReferenceFiles(files);
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
    if (!selectedProduct) return;
    await onDeleteReferenceImage(selectedProduct.sku, index);
    setPreviewReferenceIndex(undefined);
  }

  return (
    <section
      id="视频创作"
      className="video-creation-frame grid gap-0 overflow-visible rounded-[24px] border border-[#dbe4f0] bg-[#fbfdff] shadow-[0_22px_64px_rgba(30,42,68,.10)]"
      onPaste={handleReferencePaste}
    >
      <div className="product-creation-canvas overflow-visible">
        <div className="product-control-bar grid gap-2 border-b border-[#e5ecf6] bg-white p-3 min-[1280px]:px-4">
          <div className="video-parameter-row grid gap-3 min-[1280px]:grid-cols-[repeat(6,minmax(132px,1fr))] min-[1280px]:items-end">
            <ProductCreationProductPicker
              className="product-creation-picker min-w-0"
              products={products}
              selectedSku={selectedSku}
              onSelectProduct={onSelectProduct}
              onAddProduct={onStartNewProduct}
              onDeleteProduct={onDeleteProduct}
            />
            <CompactChoiceDropdown
              label="视频风格"
              value={template}
              options={templateOptions}
              formatOption={templateLabel}
              onChange={onTemplateChange}
            />
            <CompactChoiceDropdown
              label="视频时长"
              value={String(duration)}
              options={durationOptions}
              formatOption={(option) => `${option}s`}
              onChange={(option) => onDurationChange(Number(option))}
            />
            <CompactChoiceDropdown
              label="成片语言"
              value={finalLanguage}
              options={languageOptions}
              formatOption={finalLanguageLabel}
              onChange={onFinalLanguageChange}
            />
            <CompactChoiceDropdown
              label="生成模型"
              value={videoModelChoice}
              options={videoModelOptions}
              formatOption={videoModelChoiceLabel}
              onChange={onVideoModelChoiceChange}
            />
            <CompactChoiceDropdown
              label="生成视频"
              value={String(versionCount)}
              options={versionCountOptions}
              formatOption={(option) => `${option} 个`}
              onChange={(option) => onVersionCountChange(Number(option))}
            />
          </div>
        </div>

        {loadError ? (
          <div className="mx-4 mt-4 rounded-[12px] border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold leading-5 text-[var(--danger)]">
            {loadError}
          </div>
        ) : null}

        <div className="grid items-stretch gap-0 min-[1180px]:grid-cols-[250px_minmax(360px,1fr)_350px]">
          <div className="border-b border-[#e5ecf6] p-4 min-[1180px]:border-b-0 min-[1180px]:border-r">
            <ProductComposerReferenceTray
              className="h-full"
              product={selectedProduct}
              pendingFiles={pendingImageFiles}
              pendingImages={pendingReferenceImageStatuses}
              onImportAssets={onImportAssets}
              onGenerateReferenceImages={onGenerateReferenceImages}
              onPreviewReferenceImage={setPreviewReferenceIndex}
              onPendingPreview={(index) => setPreviewReferenceIndex(index)}
              onDeleteReferenceImage={(index) => void handleDeleteReferenceImage(index)}
              onFilesChange={handleReferenceFiles}
              onClearPendingFile={(index) => setPendingImageFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
            />
          </div>

          <div className="grid min-w-0 border-b border-[#e5ecf6] p-4 min-[1180px]:border-b-0 min-[1180px]:border-r">
            <div className="product-facts-editor grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
              <div className="product-facts-actions flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-black text-[#172033]">商品资料</div>
                <div className="flex items-center gap-2">
                  {productAutoSaveLabel ? (
                    <span className="text-[11px] font-black text-[#8b9bb3]">{productAutoSaveLabel}</span>
                  ) : null}
                  <Button className="min-h-9 w-fit rounded-[11px] px-3 disabled:opacity-100" size="sm" variant="soft" disabled={packingDisabled} onClick={() => void handleOrganizeProductPackage()}>
                    {isPacking ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Package size={13} />}
                    {isPacking ? "整理中" : "AI 整理资料包"}
                  </Button>
                </div>
              </div>
              <Textarea
                ref={productFactsBodyRef}
                className="product-facts-body h-full min-h-0 resize-none overflow-auto border-0 bg-transparent px-0 py-1 text-sm font-bold leading-6 shadow-none focus-visible:ring-0"
                rows={productFactsRows}
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                onPaste={handleProductFactsPaste}
                placeholder="可以直接粘贴或填写商品标题、分类、材质、尺寸/重量、卖点、使用场景。"
              />
            </div>

            {importNotes.length > 0 ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-bold text-[#6c7890]">
                {importNotes.slice(0, 3).map((note) => <span key={note} className="truncate">· {note}</span>)}
              </div>
            ) : null}
          </div>

          <div className="min-w-0 p-4">
            <StoryboardComposerPanel
              template={template}
              duration={duration}
              storyboardDraft={storyboardDraft}
              storyboardDraftIsGuidance={storyboardDraftIsGuidance}
              storyboardHistory={storyboardHistory}
              onStoryboardDraftChange={onStoryboardDraftChange}
              onApplyStoryboardHistory={onApplyStoryboardHistory}
              onDeleteStoryboardHistory={onDeleteStoryboardHistory}
              onGenerateStoryboardDraft={handleGenerateStoryboardDraft}
              isGeneratingStoryboard={isGeneratingStoryboard}
              productReady={storyboardProductReady}
            />
          </div>
        </div>

        <div className="video-generate-bar grid gap-3 border-t border-[#e5ecf6] bg-white p-3 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(260px,360px)_minmax(220px,320px)] min-[900px]:items-center min-[1280px]:px-4">
          <div className="min-w-0 truncate text-xs font-bold text-[#6c7890]">{generateVideoSummary}</div>
          <div className={generationReadinessMessageClass}>
            {generationReadiness.label}
          </div>
          <Button
            className={generateVideoButtonClass}
            variant={generateVideoDisabled ? "default" : "primary"}
            disabled={generateVideoDisabled}
            aria-disabled={generateVideoDisabled}
            title={generationReadiness.ready ? generateVideoButtonLabel : generationReadiness.label}
            onClick={generateVideoDisabled ? undefined : () => void handleGenerateVideo()}
          >
            {isSubmittingVideo ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Play size={15} />}
            {isSubmittingVideo ? "提交中" : generateVideoButtonLabel}
          </Button>
        </div>

      </div>

      <VideoHistoryPanel
        jobs={latestCreativeJobs}
        onPreview={setPreviewJob}
        onDelete={setDeleteTarget}
        onRetryVideoJob={onRetryVideoJob}
      />

      <VideoPreviewDialog
        job={previewJob}
        index={Math.max(0, latestCreativeJobs.findIndex((job) => job.id === previewJob?.id))}
        onClose={() => setPreviewJob(undefined)}
        onRequestDelete={setDeleteTarget}
        onRetryVideoJob={onRetryVideoJob}
      />
      <DeleteCreativeVersionDialog
        job={deleteTarget}
        index={Math.max(0, latestCreativeJobs.findIndex((job) => job.id === deleteTarget?.id))}
        onClose={() => setDeleteTarget(undefined)}
        onConfirm={handleDeleteCreativeVersion}
      />
      <ReferenceImagePreviewDialog
        images={previewableReferenceImages}
        index={previewReferenceIndex}
        onIndexChange={setPreviewReferenceIndex}
        onClose={() => setPreviewReferenceIndex(undefined)}
      />
    </section>
  );
}

function CompactChoiceDropdown<T extends string>({
  label,
  value,
  options,
  formatOption,
  onChange
}: {
  label: string;
  value: T;
  options: T[];
  formatOption: (option: T) => string;
  onChange: (option: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeLabel = formatOption(value);

  return (
    <div
      className="compact-choice-dropdown relative grid min-w-0 gap-1.5"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
        }
      }}
    >
      <div className="truncate text-xs font-black text-[#6c7890]">{label}</div>
      <button
        type="button"
        className={cn(
          "flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-[13px] border bg-white px-3 text-left text-sm font-black text-[#172033] shadow-[0_8px_18px_rgba(30,42,68,.05)] transition",
          open
            ? "border-[color-mix(in_srgb,var(--accent)_65%,#dbe4f0)] shadow-[0_0_0_3px_rgba(10,163,148,.12),0_8px_18px_rgba(30,42,68,.05)]"
            : "border-[#dbe4f0] hover:border-[color-mix(in_srgb,var(--accent)_45%,#dbe4f0)]"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 truncate">{activeLabel}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#8b9bb3] transition", open && "rotate-180 text-[var(--accent)]")} />
      </button>
      {open ? (
        <div
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 grid max-h-[240px] gap-1 overflow-auto rounded-xl border border-[#dbe4f0] bg-white p-1.5 shadow-[0_18px_42px_rgba(30,42,68,.16)]"
          role="listbox"
        >
          {options.map((option) => {
            const active = option === value;
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={active}
                className={cn(
                  "grid min-h-10 grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-lg px-2.5 text-left text-[13px] font-black transition",
                  active
                    ? "bg-[color-mix(in_srgb,var(--accent)_12%,white)] text-[#172033]"
                    : "text-[#6c7890] hover:bg-[#f3f6fb] hover:text-[#172033]"
                )}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                <span className={cn("grid h-4 w-4 place-items-center rounded-full", active ? "text-[var(--accent)]" : "text-transparent")}>
                  <CheckCircle2 size={14} />
                </span>
                <span className="min-w-0 truncate">{formatOption(option)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ProductComposerReferenceTray({
  className,
  product,
  pendingFiles,
  pendingImages,
  onImportAssets,
  onGenerateReferenceImages,
  onPreviewReferenceImage,
  onPendingPreview,
  onDeleteReferenceImage,
  onFilesChange,
  onClearPendingFile
}: {
  className?: string;
  product?: ProductDetail;
  pendingFiles: File[];
  pendingImages: ReferenceImageStatus[];
  onImportAssets: (sku: string) => Promise<void>;
  onGenerateReferenceImages: (sku: string) => Promise<void>;
  onPreviewReferenceImage: (index: number) => void;
  onPendingPreview: (index: number) => void;
  onDeleteReferenceImage: (index: number) => void;
  onFilesChange: (files: FileList | File[] | null) => void;
  onClearPendingFile: (index: number) => void;
}) {
  const images = product?.reference_image_statuses ?? [];
  const [dragOver, setDragOver] = useState(false);

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

  return (
    <section
      className={cn("product-reference-inline grid content-start gap-3", className)}
      onDragEnter={handleReferenceDrag}
      onDragOver={handleReferenceDrag}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragOver(false);
        }
      }}
      onDrop={handleReferenceDrop}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-black text-[#172033]">参考图</div>
          <div className="text-xs font-bold text-[#8b9bb3]">添加图片</div>
        </div>
        <Badge>{product ? `${productReferenceCount(product)} 张` : `${pendingFiles.length} 张`}</Badge>
      </div>
      <label
        className={cn(
          "grid min-h-[66px] cursor-pointer place-items-center rounded-[12px] border border-dashed p-2 text-center transition",
          dragOver
            ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,white)] shadow-[0_0_0_3px_rgba(10,163,148,.12)]"
            : "border-[color-mix(in_srgb,var(--accent)_38%,#dbe4f0)] bg-[color-mix(in_srgb,var(--accent)_5%,white)] hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_8%,white)]"
        )}
      >
        <span className="grid justify-items-center gap-0.5 text-sm font-black text-[var(--accent)]">
          <Plus size={16} />
          添加图片
          <span className="text-[11px] font-bold text-[#8b9bb3]">可多选 · 拖拽或粘贴图片</span>
        </span>
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
      {product ? (
        <Button className="w-full justify-center" size="sm" variant="soft" onClick={() => void onGenerateReferenceImages(product.sku)}>
          <Sparkles size={13} />
          AI 生成参考图
        </Button>
      ) : null}
      {images.length > 0 ? (
        <div className="reference-image-list grid max-h-[250px] gap-1.5 overflow-auto pr-1">
          {images.map((image, index) => (
            <ReferenceImageFigure
              key={`${image.original}-${index}`}
              image={image}
              sku={product?.sku ?? ""}
              index={index}
              onImportAssets={onImportAssets}
              onPreview={() => onPreviewReferenceImage(index)}
              onDelete={onDeleteReferenceImage}
            />
          ))}
        </div>
      ) : pendingFiles.length > 0 ? (
        <div className="reference-image-list grid max-h-[250px] gap-1.5 overflow-auto pr-1">
          {pendingImages.map((image, index) => {
            const file = pendingFiles[index];
            const fileName = file?.name ?? image.original;
            return (
              <div key={`${fileName}-${index}`} className="relative grid min-h-16 min-w-0 grid-cols-[72px_minmax(0,1fr)] items-center gap-3 overflow-hidden rounded-[12px] border border-[#e5ecf6] bg-white pr-11 shadow-[0_8px_18px_rgba(30,42,68,.04)]">
                <button
                  className="h-16 w-[72px] overflow-hidden bg-[#f3f6fb]"
                  type="button"
                  title="查看待上传图片"
                  onClick={() => onPendingPreview(index)}
                >
                  <img className="h-16 w-[72px] object-cover transition hover:scale-[1.03]" src={image.previewUrl ?? ""} alt={`${fileName} preview`} />
                </button>
                <div className="min-w-0">
                  <div className="truncate text-xs font-black text-[#172033]">待上传 {index + 1}</div>
                  <div className="truncate text-[11px] font-semibold text-[var(--muted)]">{fileName}</div>
                </div>
                <button
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[#8b9bb3] transition hover:bg-red-50 hover:text-[var(--danger)]"
                  type="button"
                  title="移除待上传图片"
                  onClick={() => onClearPendingFile(index)}
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[12px] border border-[#eef3f8] bg-white px-3 py-3 text-xs font-bold leading-5 text-[#8b9bb3]">
          参考图会影响商品外观、材质和镜头细节。支持拖拽或粘贴图片。
        </div>
      )}
    </section>
  );
}

function isReferenceImageFile(file: File): boolean {
  const mimeType = file.type.toLowerCase();
  if (mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp") {
    return true;
  }
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

function StoryboardComposerPanel({
  template,
  duration,
  storyboardDraft,
  storyboardDraftIsGuidance,
  storyboardHistory,
  onStoryboardDraftChange,
  onApplyStoryboardHistory,
  onDeleteStoryboardHistory,
  onGenerateStoryboardDraft,
  isGeneratingStoryboard,
  productReady
}: {
  template: TemplateName;
  duration: number;
  storyboardDraft: string;
  storyboardDraftIsGuidance: boolean;
  storyboardHistory: StoryboardHistoryRecord[];
  onStoryboardDraftChange: (draft: string) => void;
  onApplyStoryboardHistory: (record: StoryboardHistoryRecord) => void;
  onDeleteStoryboardHistory: (recordId: string) => Promise<void>;
  onGenerateStoryboardDraft: (product?: ProductDetail) => Promise<void>;
  isGeneratingStoryboard: boolean;
  productReady: boolean;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <section className="storyboard-side-panel grid h-full min-h-[398px] grid-rows-[auto_minmax(0,1fr)_auto] gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-black text-[#172033]">脚本分镜</div>
          <div className="mt-1 text-xs font-bold text-[#8b9bb3]">可选；留空会按商品资料生成。</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge>{templateLabel(template)}</Badge>
          <Badge>{formatDuration(duration)}</Badge>
        </div>
      </div>

      <div className="min-h-0">
        <Textarea
          className={cn(
            "h-full min-h-0 resize-none border-[#dbe4f0] bg-white text-sm leading-7 transition-colors",
            storyboardDraftIsGuidance ? "font-semibold text-[#9aa7ba]" : "font-bold text-[#172033]"
          )}
          value={storyboardDraft}
          onChange={(event) => onStoryboardDraftChange(event.target.value)}
          placeholder=""
        />
      </div>

      <div className="grid gap-2">
        <Button
          className="min-h-11 justify-center rounded-[12px] px-4"
          variant="soft"
          disabled={isGeneratingStoryboard || !productReady}
          onClick={() => {
            if (!productReady) {
              return;
            }
            void onGenerateStoryboardDraft();
          }}
        >
          {isGeneratingStoryboard ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Sparkles size={15} />}
          {isGeneratingStoryboard ? "生成中" : "AI 生成分镜"}
        </Button>
      </div>

      <div
        className="storyboard-history-dropdown relative"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setHistoryOpen(false);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setHistoryOpen(false);
          }
        }}
      >
        <button
          type="button"
          className={cn(
            "flex min-h-10 w-full items-center justify-between gap-2 rounded-[12px] border bg-white px-3 py-2 text-left text-xs font-black text-[#6c7890] transition",
            historyOpen
              ? "border-[color-mix(in_srgb,var(--accent)_55%,#dbe4f0)] shadow-[0_0_0_3px_rgba(10,163,148,.10)]"
              : "border-[#e5ecf6] hover:border-[color-mix(in_srgb,var(--accent)_35%,#dbe4f0)]"
          )}
          aria-haspopup="listbox"
          aria-expanded={historyOpen}
          onClick={() => setHistoryOpen((open) => !open)}
        >
          <span>分镜历史记录</span>
          <span className="flex items-center gap-2">
            <Badge>{storyboardHistory.length} 条</Badge>
            <ChevronDown size={14} className={cn("text-[#8b9bb3] transition", historyOpen && "rotate-180 text-[var(--accent)]")} />
          </span>
        </button>
        {historyOpen ? (
          <div
            className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 grid max-h-[260px] overflow-auto rounded-[12px] border border-[#dbe4f0] bg-white p-2 shadow-[0_18px_42px_rgba(30,42,68,.16)]"
            role="listbox"
          >
            {storyboardHistory.length > 0 ? (
              storyboardHistory.map((record) => (
                <article key={record.id} className="group/storyboard-record grid grid-cols-[minmax(0,1fr)_32px] items-start gap-1 rounded-[10px] transition hover:bg-[#f7fbff]">
                  <button
                    type="button"
                    role="option"
                    className="grid min-w-0 gap-2 rounded-[10px] px-2.5 py-2.5 text-left"
                    onClick={() => {
                      onApplyStoryboardHistory(record);
                      setHistoryOpen(false);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-black text-[#172033]">{formatHistoryTime(record.createdAt)}</div>
                      <div className="flex gap-1">
                        <Badge>{templateLabel(record.style)}</Badge>
                        <Badge>{formatDuration(record.duration)}</Badge>
                      </div>
                    </div>
                    <div className="line-clamp-2 whitespace-pre-line text-xs font-semibold leading-5 text-[#6c7890]">{historyPreview(record.script)}</div>
                  </button>
                  <button
                    type="button"
                    className="mr-1 mt-2 grid h-8 w-8 place-items-center rounded-lg text-red-400 opacity-80 transition hover:bg-red-50 hover:text-red-600 min-[900px]:opacity-0 min-[900px]:group-hover/storyboard-record:opacity-100"
                    title="删除分镜记录"
                    aria-label={`删除分镜记录 ${formatHistoryTime(record.createdAt)}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void onDeleteStoryboardHistory(record.id);
                      setHistoryOpen(false);
                    }}
                  >
                    <X size={13} />
                  </button>
                </article>
              ))
            ) : (
              <div className="rounded-[10px] border border-dashed border-[#dbe4f0] bg-[#fbfdff] px-3 py-4 text-center text-xs font-bold text-[#8b9bb3]">
                还没有 AI 生成历史
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function VideoHistoryPanel({
  jobs,
  onPreview,
  onDelete,
  onRetryVideoJob
}: {
  jobs: CreativeVersionItem[];
  onPreview: (job: CreativeVersionItem) => void;
  onDelete: (job: CreativeVersionItem) => void;
  onRetryVideoJob: (job: VideoJob) => Promise<void>;
}) {
  return (
    <section className="grid gap-3 border-t border-[#e5ecf6] bg-[#fbfdff] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-base font-black text-[#172033]">历史记录</div>
          <div className="mt-1 text-xs font-bold text-[#8b9bb3]">当前商品生成过的视频都会显示在这里。</div>
        </div>
        <Badge>{jobs.length} 个</Badge>
      </div>
      {jobs.length > 0 ? (
        <div className="generation-history-scroll grid max-h-[360px] overflow-y-auto rounded-[14px] border border-[#e5ecf6] bg-white">
          {jobs.map((job, index) => {
            const activeVersion = isActiveCreativeVersion(job);
            const playableVideo = hasPlayableVideo(job);
            const retryJob = job.status === "failed" ? job.videoJob : undefined;
            const failureReason = creativeVersionFailureReason(job);
            return (
              <article key={job.id} className="grid gap-2 border-b border-[#eef3f8] px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <strong className="truncate text-sm font-black text-[#172033]">{videoLabel(index)}</strong>
                    <Badge tone={activeVersion ? "warn" : playableVideo ? "ok" : "neutral"}>
                      {activeVersion ? <RefreshCcw className="mr-1 h-3 w-3 animate-spin" /> : null}
                      {creativeVersionDisplayStatus(job)}
                    </Badge>
                  </div>
                  <div className="mt-1 truncate text-xs font-semibold text-[#6c7890]">
                    {videoModelLabel(job.provider, job.providerModel)} · {formatDuration(job.durationSeconds)} · {formatCreativeVersionTime(job)} · {failureReason || videoExpiryLabel(job)}
                  </div>
                </div>
                <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
                  {playableVideo ? (
                    <Button className="w-fit" size="sm" onClick={() => onPreview(job)}>
                      <Play size={13} />
                      预览视频
                    </Button>
                  ) : null}
                  {playableVideo && job.finalVideoUrl ? (
                    <Button asChild className="w-fit" size="sm">
                      <a href={job.finalVideoUrl} download>
                        <Download size={13} />
                        下载视频
                      </a>
                    </Button>
                  ) : null}
                  {retryJob ? (
                    <Button className="w-fit" size="sm" onClick={() => void onRetryVideoJob(retryJob)}>
                      <RefreshCcw size={13} />
                      重试
                    </Button>
                  ) : null}
                  <Button className="w-fit" size="sm" variant="danger" onClick={() => onDelete(job)}>
                    <X size={13} />
                    删除
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<FileVideo size={28} />} text="还没有视频" />
      )}
    </section>
  );
}

function productDraftToProductDetail(draft: ProductDraft): ProductDetail {
  const facts = productDraftToFacts(draft);
  return {
    ...facts,
    path: "",
    referenceImageCount: facts.reference_images.length,
    importQuality: undefined,
    reference_image_statuses: []
  };
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
  const openProductDialog = () => {
    setEditorMode("import");
    setDialogMode("import");
  };
  return (
    <section className="product-library-shell grid gap-3">
      <div className="product-library-toolbar flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[24px] font-black leading-tight text-[#172033]">商品库</h2>
          <div className="mt-1 text-xs font-semibold text-[#8b9bb3]">{products.length} 个商品</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={openProductDialog}>
            <Plus size={13} />
            添加商品
          </Button>
        </div>
      </div>

      <section className="product-library-list overflow-hidden rounded-[18px] border border-[#dbe4f0] bg-white shadow-[0_14px_36px_rgba(30,42,68,.08)]">
        <div className="grid gap-2 border-b border-[#e5ecf6] bg-[#fbfdff] px-4 py-3 min-[760px]:grid-cols-[minmax(0,1fr)_240px_auto] min-[760px]:items-center">
          <div className="text-xs font-black uppercase tracking-[.16em] text-[#8b9bb3]">商品</div>
          <div className="hidden text-xs font-black uppercase tracking-[.16em] text-[#8b9bb3] min-[760px]:block">商品资料</div>
          <div className="hidden text-xs font-black uppercase tracking-[.16em] text-[#8b9bb3] min-[760px]:block">进入</div>
        </div>
        <div className="divide-y divide-[#e5ecf6]">
          {products.map((product) => {
            const status = productLibraryStatus(product);
            return (
              <article
                key={product.path}
                className="grid gap-3 px-4 py-4 text-sm transition hover:bg-[#f8fbff] min-[760px]:grid-cols-[minmax(0,1fr)_240px_auto] min-[760px]:items-center"
              >
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-black text-[#172033]">{product.title_ja}</div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-xs font-black text-[#8b9bb3] min-[760px]:hidden">商品资料</span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                  <span className="truncate text-xs font-semibold text-[#6c7890]">{status.detail}</span>
                </div>
                <div className="flex flex-wrap gap-2 min-[760px]:justify-end">
                  <Button className="product-library-row-action" size="sm" variant="primary" onClick={() => void onCreateVideo(product)}>
                    <Play size={13} />
                    创作视频
                  </Button>
                  <Button size="sm" onClick={() => void onEdit(product.sku)}>
                    <Settings size={13} />
                    编辑
                  </Button>
                  <Button size="sm" variant="soft" onClick={() => void onDeleteProduct(product.sku)}>
                    <X size={13} />
                    删除
                  </Button>
                </div>
              </article>
            );
          })}
          {products.length === 0 ? (
            <div className="p-8">
              <EmptyState icon={<Package size={28} />} text="还没有商品，先添加商品" />
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
  const isEditMode = mode === "edit";
  const activeMode: ProductEditorMode = isEditMode ? "manual" : editorMode || mode;
  const hasDraftFacts = Boolean(draft.sku || draft.title_ja || draft.category || draft.verified_selling_points || draft.reference_images);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#172033]/38 p-4">
      <section className="max-h-[min(820px,calc(100vh-32px))] w-full max-w-[920px] overflow-hidden rounded-[18px] border border-[#dbe4f0] bg-white shadow-[0_28px_90px_rgba(23,32,51,.24)]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e5ecf6] bg-[#fbfdff] px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{isEditMode ? "编辑资料" : activeMode === "import" ? "粘贴导入" : "手动填写"}</Badge>
              {!isEditMode && activeMode === "import" ? <Badge tone="ok">推荐</Badge> : null}
            </div>
            <h3 className="m-0 mt-2 text-[20px] font-black text-[#172033]">{isEditMode ? "编辑当前商品" : "添加商品"}</h3>
          </div>
          <Button size="icon" variant="ghost" aria-label="关闭弹窗" onClick={onClose}>
            <X size={14} />
          </Button>
        </div>
        <div className="max-h-[calc(100vh-160px)] overflow-auto p-5">
          {!isEditMode ? (
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <ProductEntryModeButton
                active={activeMode === "import"}
                badge="粘贴导入"
                description="粘贴或填写商品标题、分类、材质、尺寸/重量、卖点和使用场景。"
                icon={<Sparkles size={16} />}
                title="导入商品"
                onClick={() => setEditorMode("import")}
              />
              <ProductEntryModeButton
                active={activeMode === "manual"}
                badge="手动填写"
                description="逐项填写标题、材质、卖点和参考图。"
                icon={<Plus size={16} />}
                title="新增商品"
                onClick={() => setEditorMode("manual")}
              />
            </div>
          ) : null}

          {!isEditMode && activeMode === "import" ? (
            <form
              className="grid gap-3 rounded-[14px] border border-[#dbe4f0] bg-[#f8fbff] p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void onImportSave();
              }}
            >
              <Field label="粘贴商品信息">
                <Textarea
                  rows={8}
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder={"商品标题、分类、材质、尺寸/重量、卖点、使用场景...\n参考图也可以单独上传"}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="primary" type="submit">
                  <Package size={13} />
                  AI 整理并保存
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
                submitLabel={isEditMode ? "保存修改" : "保存商品"}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DeleteCreativeVersionDialog({
  job,
  index,
  onClose,
  onConfirm
}: {
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
      aria-label={activeVersion ? "取消并删除视频" : "删除视频历史记录"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isDeleting) {
          onClose();
        }
      }}
    >
      <section className="grid w-full max-w-[460px] gap-4 rounded-[18px] border border-red-100 bg-white p-5 shadow-[0_28px_90px_rgba(23,32,51,.24)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-black text-[#172033]">
              {activeVersion ? "取消并删除这个视频？" : "删除这个视频记录？"}
            </div>
            <div className="mt-1 text-xs font-semibold leading-5 text-[#6c7890]">
              {activeVersion
                ? "确认后会取消生成，并从历史记录中移除。"
                : job.source === "ledger"
                  ? "确认后会删除这条历史记录，本地输出目录也会一起删除。"
                  : "确认后会从历史记录中移除。"}
            </div>
          </div>
          <Button className="w-fit" size="icon" variant="ghost" disabled={isDeleting} onClick={onClose}>
            <X size={15} />
          </Button>
        </div>
        <div className="rounded-[14px] border border-[#e5ecf6] bg-[#f8fbff] px-3 py-2 text-xs font-bold leading-5 text-[#6c7890]">
          <div className="font-black text-[#172033]">{videoLabel(index)}</div>
          <div>{videoModelLabel(job.provider, job.providerModel)} · {formatDuration(job.durationSeconds)} · {formatCreativeVersionTime(job)}</div>
        </div>
        <div className="flex justify-end gap-2">
          <Button className="w-fit" variant="ghost" disabled={isDeleting} onClick={onClose}>
            取消
          </Button>
          <Button className="w-fit" variant="danger" disabled={isDeleting} onClick={() => void confirmDelete()}>
            <X size={13} />
            {isDeleting ? "删除中" : activeVersion ? "确认取消并删除" : "确认删除"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function VideoPreviewDialog({
  job,
  index,
  onClose,
  onRequestDelete,
  onRetryVideoJob
}: {
  job?: CreativeVersionItem;
  index: number;
  onClose: () => void;
  onRequestDelete: (job: CreativeVersionItem) => void;
  onRetryVideoJob: (job: VideoJob) => Promise<void>;
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
  const retryJob = job.status === "failed" ? job.videoJob : undefined;
  const previewTitle = videoLabel(index);
  const statusText = creativeVersionDisplayStatus(job);
  const failureReason = creativeVersionFailureReason(job);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(23,32,51,.42)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${previewTitle} 预览`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="grid max-h-[min(760px,calc(100vh-32px))] w-full max-w-[880px] overflow-hidden rounded-[18px] border border-[#dbe4f0] bg-white shadow-[0_28px_90px_rgba(23,32,51,.26)]">
        <div className="flex min-w-0 items-start justify-between gap-3 border-b border-[#e5ecf6] px-4 py-3">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="m-0 truncate text-base font-black text-[#172033]">{previewTitle}</h3>
              <Badge tone={activeVersion ? "warn" : playableVideo ? "ok" : "neutral"}>
                {activeVersion ? <RefreshCcw className="mr-1 h-3 w-3 animate-spin" /> : null}
                {statusText}
              </Badge>
            </div>
            <div className="mt-1 truncate text-xs font-semibold text-[#6c7890]">
              {videoModelLabel(job.provider, job.providerModel)} · {formatDuration(job.durationSeconds)} · {formatCreativeVersionTime(job)}
            </div>
          </div>
          <Button className="w-fit" size="sm" variant="ghost" onClick={onClose}>
            <X size={15} />
          </Button>
        </div>

        <div className="grid gap-3 overflow-auto p-4">
          {playableVideo && job.finalVideoUrl ? (
            <div className="overflow-hidden rounded-[14px] border border-[#dbe4f0] bg-[#0f172a]">
              <video
                className="aspect-video h-full w-full bg-[#0f172a] object-contain"
                controls
                playsInline
                preload="metadata"
                src={job.finalVideoUrl}
              />
            </div>
          ) : (
            <div className="grid aspect-video place-items-center rounded-[14px] border border-dashed border-[#cfd9ea] bg-[#f7f9fe] p-6 text-center">
              <div className="grid justify-items-center gap-2">
                {activeVersion ? (
                  <RefreshCcw className="h-7 w-7 animate-spin text-[var(--accent)]" />
                ) : job.status === "failed" ? (
                  <AlertTriangle className="h-7 w-7 text-[var(--danger)]" />
                ) : (
                  <FileVideo className="h-7 w-7 text-[#8b9bb3]" />
                )}
                <div className="text-sm font-black text-[#172033]">
                  {activeVersion ? "视频还在生成中" : job.status === "failed" ? "视频生成失败" : "暂无可播放视频文件"}
                </div>
                <div className="max-w-[520px] text-xs font-semibold leading-5 text-[#6c7890]">
                  {activeVersion
                    ? "生成完成后这里会自动变成可播放预览。"
                    : failureReason || "这个记录暂时没有成片文件，可以保留记录或删除后重新生成。"}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            {retryJob ? (
              <Button className="w-fit" size="sm" onClick={() => void onRetryVideoJob(retryJob)}>
                <RefreshCcw size={13} />
                重试
              </Button>
            ) : null}
            {job.finalVideoUrl ? (
              <Button asChild className="w-fit" size="sm">
                <a href={job.finalVideoUrl} download>
                  <Download size={13} />
                  下载视频
                </a>
              </Button>
            ) : null}
            <Button
              className="w-fit"
              size="sm"
              variant="danger"
              title={activeVersion ? "删除并取消生成" : "删除这条视频记录"}
              onClick={() => onRequestDelete(job)}
            >
              <X size={13} />
              删除
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProductCreationProductPicker({
  className,
  products,
  selectedSku,
  onSelectProduct,
  onAddProduct,
  onDeleteProduct
}: {
  className?: string;
  products: ProductSummary[];
  selectedSku: string;
  onSelectProduct: (product: ProductSummary) => Promise<void>;
  onAddProduct: () => void;
  onDeleteProduct: (sku: string) => Promise<void>;
}) {
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const productOptions = dedupeProductSummaries(products);
  const selectedProductOption = productOptions.find((product) => product.sku === selectedSku);
  const selectedProductLabel = selectedProductOption ? selectedProductOption.title_ja : "新商品";

  const handleProductPickerSelect = (sku: string) => {
    if (sku === NEW_PRODUCT_SELECT_VALUE) {
      setProductPickerOpen(false);
      onAddProduct();
      return;
    }
    const nextProduct = productOptions.find((product) => product.sku === sku);
    if (!nextProduct) return;
    setProductPickerOpen(false);
    if (nextProduct.sku !== selectedSku) {
      void onSelectProduct(nextProduct);
    }
  };

  return (
    <div
      className={cn("product-picker-single relative grid min-w-0 gap-1.5", className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setProductPickerOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setProductPickerOpen(false);
        }
      }}
    >
      <span className="shrink-0 text-[12px] font-black text-[#6c7890]">创作商品</span>
      <button
        type="button"
        className={cn(
          "flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-[13px] border bg-white px-3 text-left text-sm font-black text-[#172033] shadow-[0_8px_18px_rgba(30,42,68,.05)] transition",
          productPickerOpen
            ? "border-[color-mix(in_srgb,var(--accent)_65%,#dbe4f0)] shadow-[0_0_0_3px_rgba(10,163,148,.12),0_8px_18px_rgba(30,42,68,.05)]"
            : "border-[#dbe4f0] hover:border-[color-mix(in_srgb,var(--accent)_45%,#dbe4f0)]"
        )}
        aria-haspopup="listbox"
        aria-expanded={productPickerOpen}
        onClick={() => setProductPickerOpen((open) => !open)}
      >
        <span className="min-w-0 truncate">{selectedProductLabel}</span>
        <ChevronDown className={cn("shrink-0 text-[#8b9bb3] transition", productPickerOpen && "rotate-180 text-[var(--accent)]")} size={15} />
      </button>
      {productPickerOpen ? (
        <div
          className="product-creation-product-menu absolute left-0 right-0 top-[calc(100%+8px)] z-30 grid max-h-[280px] gap-1 overflow-auto rounded-xl border border-[#dbe4f0] bg-white p-1.5 shadow-[0_18px_42px_rgba(30,42,68,.16)]"
          role="listbox"
        >
          <button
            type="button"
            role="option"
            aria-selected={!selectedProductOption}
            className={cn(
              "grid min-h-10 grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--accent)_38%,#dbe4f0)] bg-[color-mix(in_srgb,var(--accent)_6%,white)] px-2.5 text-left text-[13px] font-black text-[var(--accent)] transition hover:bg-[color-mix(in_srgb,var(--accent)_10%,white)]",
              !selectedProductOption && "border-solid bg-[color-mix(in_srgb,var(--accent)_12%,white)]"
            )}
            onClick={() => handleProductPickerSelect(NEW_PRODUCT_SELECT_VALUE)}
          >
            <Plus size={13} />
            <span>新商品</span>
          </button>
          {productOptions.length > 0 ? (
            productOptions.map((option) => {
              const active = option.sku === selectedSku;
              return (
                <div
                  key={option.sku}
                  className={cn(
                    "group/product-option grid min-h-10 grid-cols-[minmax(0,1fr)_32px] items-center gap-1 rounded-lg transition",
                    active ? "bg-[color-mix(in_srgb,var(--accent)_12%,white)] text-[#172033]" : "text-[#4f5f76] hover:bg-[#f3f6fb] hover:text-[#172033]"
                  )}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className="grid min-h-10 min-w-0 grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-lg px-2.5 text-left text-[13px] font-black"
                    onClick={() => handleProductPickerSelect(option.sku)}
                  >
                    <span className={cn("grid h-4 w-4 place-items-center rounded-full", active ? "text-[var(--accent)]" : "text-transparent")}>
                      <CheckCircle2 size={14} />
                    </span>
                    <span className="min-w-0 truncate">{option.title_ja}</span>
                  </button>
                  <button
                    type="button"
                    className="grid h-8 w-8 place-items-center rounded-lg text-red-400 opacity-80 transition hover:bg-red-50 hover:text-red-600 min-[900px]:opacity-0 min-[900px]:group-hover/product-option:opacity-100"
                    title="删除商品"
                    aria-label={`删除商品 ${option.title_ja}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setProductPickerOpen(false);
                      void onDeleteProduct(option.sku);
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })
          ) : (
            <div className="px-3 py-2 text-xs font-bold text-[#8b9bb3]">暂无商品</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function productReferenceCount(product?: ProductSummary | ProductDetail): number {
  if (!product) return 0;
  if ("reference_image_statuses" in product && product.reference_image_statuses) {
    return product.reference_image_statuses.length;
  }
  if ("reference_images" in product) {
    return product.reference_images.length;
  }
  return product.referenceImageCount ?? 0;
}

function productGenerationReadiness({
  selectedProduct,
  importText,
  pendingImageCount
}: {
  selectedProduct?: ProductDetail;
  importText: string;
  pendingImageCount: number;
}): { ready: boolean; label: string } {
  const targetImageCount = 3;
  if (selectedProduct) {
    if (!selectedProduct.importQuality?.ready) {
      return { ready: false, label: "请先补齐商品资料并整理资料包。" };
    }
    const imageCount = productReferenceCount(selectedProduct);
    if (imageCount < targetImageCount) {
      return { ready: false, label: `参考图至少 ${targetImageCount} 张，还差 ${targetImageCount - imageCount} 张。` };
    }
    return { ready: true, label: "参数已完整。" };
  }
  if (!importText.trim()) {
    return { ready: false, label: "请先填写商品资料。" };
  }
  if (pendingImageCount < targetImageCount) {
    return { ready: false, label: `参考图至少 ${targetImageCount} 张，还差 ${targetImageCount - pendingImageCount} 张。` };
  }
  return { ready: true, label: "将先整理资料包，再生成视频。" };
}

function productFactsStatusLabel({
  selectedProduct,
  importText
}: {
  selectedProduct?: ProductDetail;
  importText: string;
}): string {
  if (!selectedProduct) {
    if (importText.trim()) {
      return "原始资料";
    }
    return "未填资料";
  }
  if (selectedProduct.importQuality?.ready) {
    return "已整理资料包";
  }
  return "资料待补";
}

function productAutoSaveStatusLabel(status: ProductAutoSaveStatus): string {
  if (status === "saving") {
    return "保存中";
  }
  if (status === "saved") {
    return "已保存";
  }
  if (status === "failed") {
    return "保存失败";
  }
  return "";
}

function storyboardStatusLabel(storyboardDraftSource: StoryboardDraftSource): string {
  if (storyboardDraftSource === "default") {
    return "默认分镜";
  }
  if (storyboardDraftSource === "ai") {
    return "AI 生成分镜";
  }
  return "手动分镜";
}

function dedupeProductSummaries(products: ProductSummary[]): ProductSummary[] {
  const byIdentity = new Map<string, ProductSummary>();
  for (const product of products) {
    const identity = productIdentityKey(product);
    const existing = byIdentity.get(identity);
    if (!existing || productSummaryCompleteness(product) > productSummaryCompleteness(existing)) {
      byIdentity.set(identity, product);
    }
  }
  return Array.from(byIdentity.values());
}

function productIdentityKey(product: ProductSummary): string {
  const sku = product.sku.trim().toLowerCase();
  if (sku) return `sku:${sku}`;
  const path = product.path.trim().toLowerCase();
  if (path) return `path:${path}`;
  return `title:${product.title_ja.trim().toLowerCase()}`;
}

function productSummaryCompleteness(product: ProductSummary): number {
  return productReferenceCount(product) * 100 +
    (product.importQuality?.score ?? 0) +
    (product.paidReadiness?.readyForPaidGeneration ? 10 : 0);
}

function productActionSummary(product: ProductDetail, summary?: ProductSummary): ProductSummary {
  return summary ?? {
    path: product.path,
    sku: product.sku,
    title_ja: product.title_ja,
    referenceImageCount: productReferenceCount(product),
    importQuality: product.importQuality,
    paidReadiness: product.paidReadiness
  };
}

function FactList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="font-black text-[var(--text)]">{title}</div>
      {items.length > 0 ? (
        <ul className="m-0 mt-1 grid gap-1 pl-4">
          {items.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <div className="mt-1 text-[var(--muted)]">待补充</div>
      )}
    </div>
  );
}

function ReferenceImageFigure({
  image,
  sku,
  index,
  onImportAssets,
  onPreview,
  onDelete
}: {
  image: ReferenceImageStatus;
  sku: string;
  index: number;
  onImportAssets: (sku: string) => Promise<void>;
  onPreview: () => void;
  onDelete: (index: number) => void;
}) {
  const canPreview = Boolean(image.previewUrl);
  return (
    <figure className="group relative grid grid-cols-[72px_minmax(0,1fr)] m-0 items-center gap-2 overflow-hidden rounded-[12px] border border-[var(--border)] bg-white p-2 transition hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--border))]">
      <button
        type="button"
        className="overflow-hidden rounded-[9px] border border-[#eef3f8] bg-[var(--panel2)]"
        disabled={!canPreview}
        title={canPreview ? "查看参考图" : referenceStatusLabel(image.status)}
        onClick={onPreview}
      >
        {image.previewUrl ? (
          <img className="h-12 w-[72px] object-cover transition group-hover:scale-[1.03]" src={image.previewUrl} alt={`${sku} reference ${index + 1}`} />
        ) : (
          <span className="grid h-12 w-[72px] place-items-center px-1 text-center text-[10px] font-bold leading-4 text-[var(--muted)]">
            {referenceStatusLabel(image.status)}
          </span>
        )}
      </button>
      <figcaption className="min-w-0">
        <div className="truncate text-xs font-black text-[#172033]">参考图 {index + 1}</div>
        <div className="truncate text-[11px] font-semibold text-[var(--muted)]">{image.original}</div>
      </figcaption>
      <div className="reference-image-actions pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-[10px] border border-[#e5ecf6] bg-white/95 p-1 opacity-0 shadow-[0_12px_28px_rgba(30,42,68,.14)] transition group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
        {image.status === "outside-project-root" ? (
          <Button className="h-8 w-8 p-0" size="icon" title="导入资产" onClick={() => void onImportAssets(sku)}>
            <Download size={12} />
          </Button>
        ) : null}
        {canPreview ? (
          <Button className="h-8 w-8 p-0" size="icon" title="查看参考图" onClick={onPreview}>
            <ImageIcon size={12} />
          </Button>
        ) : null}
        <Button className="h-8 w-8 p-0" size="icon" variant="danger" title="删除参考图" onClick={() => onDelete(index)}>
          <X size={12} />
        </Button>
      </div>
    </figure>
  );
}

function ReferenceImagePreviewDialog({
  images,
  index,
  onIndexChange,
  onClose
}: {
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
      aria-label="参考图预览"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="grid max-h-[min(760px,calc(100vh-32px))] w-full max-w-[760px] overflow-hidden rounded-[18px] border border-[#dbe4f0] bg-white shadow-[0_28px_90px_rgba(23,32,51,.26)]">
        <div className="flex min-w-0 items-center justify-between gap-3 border-b border-[#e5ecf6] px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-black text-[#172033]">参考图预览</div>
            <div className="truncate text-xs font-semibold text-[#6c7890]">
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
                className="absolute left-4 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full bg-white/92 p-0 shadow-[0_12px_28px_rgba(15,23,42,.24)]"
                size="icon"
                title="上一张"
                onClick={onPrevious}
              >
                <ChevronLeft size={18} />
              </Button>
              <Button
                className="absolute right-4 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full bg-white/92 p-0 shadow-[0_12px_28px_rgba(15,23,42,.24)]"
                size="icon"
                title="下一张"
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
        "grid gap-2 rounded-lg border bg-white p-3 text-left transition",
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
  const sellingPoints = splitLines(draft.verified_selling_points);
  const usageScenes = splitLines(draft.usage_scenes);
  const forbiddenClaims = splitLines(draft.forbidden_claims);
  const references = splitLines(draft.reference_images);
  return (
    <div className="grid gap-3 rounded-lg border border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-black">整理后的商品资料</div>
          <div className="mt-1 text-xs font-semibold text-[var(--muted)]">
            可以继续手动编辑，保存时会使用修改后的内容。
          </div>
        </div>
        <Button className="w-fit" size="sm" onClick={onEditManually}>
          <Settings size={14} />
          手动编辑
        </Button>
      </div>
      <div className="grid gap-2 lg:grid-cols-3">
        <ProductImportFact label="日语标题" value={draft.title_ja || "-"} />
        <ProductImportFact label="分类" value={draft.category || "-"} />
        <ProductImportFact label="材质" value={draft.materials || "-"} />
        <ProductImportFact label="尺寸/重量" value={draft.dimensions || "-"} />
        <ProductImportFact label="参考图" value={`${references.length} 条`} />
      </div>
      {quality ? <ProductImportQualityPanel quality={quality} /> : null}
      <div className="grid gap-2 lg:grid-cols-3">
        <ProductImportList title="已验证卖点" items={sellingPoints} />
        <ProductImportList title="使用场景" items={usageScenes} />
        <ProductImportList title="不可用卖点" items={forbiddenClaims} />
      </div>
      {notes.length > 0 ? (
        <div className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
          <div className="font-black">整理提示</div>
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
  return (
    <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-black text-[var(--text)]">资料是否够用</div>
          <div className="mt-1 text-xs font-semibold text-[var(--muted)]">{quality.summary}</div>
        </div>
        <Badge tone={quality.ready ? "ok" : "warn"}>{quality.score}/100</Badge>
      </div>
      <div className="grid gap-2 lg:grid-cols-3">
        <ProductImportList title="已确认资料" items={quality.verifiedFacts} />
        <ProductImportList title="缺失信息" items={quality.missingFields} />
        <ProductImportList title="不可用卖点" items={quality.blockedClaims} />
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
  submitLabel = "保存商品"
}: {
  draft: ProductDraft;
  setDraft: (draft: ProductDraft) => void;
  onSaveDraft: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  submitLabel?: string;
}) {
  return (
    <form className="grid gap-5" onSubmit={onSaveDraft}>
      <ProductDraftSection
        title="基础信息"
        description="标题、分类、材质和尺寸会直接进入脚本与分镜上下文。"
        icon={<Package size={15} />}
      >
        <div className="grid gap-3">
          <Field label="日语标题">
            <Input value={draft.title_ja} onChange={(event) => setDraft({ ...draft, title_ja: event.target.value })} placeholder="ラウンドファスナー ミニ財布" />
          </Field>
          <div className="grid gap-3 lg:grid-cols-3">
            <Field label="分类">
              <Input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="財布" />
            </Field>
            <Field label="材质">
              <Input value={draft.materials} onChange={(event) => setDraft({ ...draft, materials: event.target.value })} placeholder="レザー調素材、PU" />
            </Field>
            <Field label="尺寸/重量">
              <Input value={draft.dimensions} onChange={(event) => setDraft({ ...draft, dimensions: event.target.value })} placeholder="ミニサイズ" />
            </Field>
          </div>
        </div>
      </ProductDraftSection>

      <ProductDraftSection
        title="创作事实"
        description="一行一条，左侧是能说的卖点和场景，右侧是不能写进广告里的内容。"
        icon={<CheckCircle2 size={15} />}
      >
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,.9fr)]">
          <div className="grid gap-3">
            <ProductDraftTextareaGroup
              label="已验证卖点"
              value={draft.verified_selling_points}
              rows={6}
              onChange={(value) => setDraft({ ...draft, verified_selling_points: value })}
              placeholder={"カードを整理しやすい\n小銭入れ付き"}
            />
            <ProductDraftTextareaGroup
              label="使用场景"
              value={draft.usage_scenes}
              rows={4}
              onChange={(value) => setDraft({ ...draft, usage_scenes: value })}
              placeholder={"買い物\n通勤\n旅行"}
            />
          </div>
          <ProductDraftTextareaGroup
            tone="risk"
            label="不可用卖点"
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

      <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex justify-end border-t border-[#e5ecf6] bg-white/95 px-4 py-3 backdrop-blur">
        <Button className="w-fit" size="sm" variant="primary" type="submit">
          <Plus size={14} />
          {submitLabel}
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
    <section className="grid gap-3 border-b border-[#e5ecf6] pb-5 last:border-b-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_10%,white)] text-[var(--accent)]">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-black text-[#172033]">{title}</div>
          <div className="mt-1 text-xs font-semibold leading-5 text-[#6c7890]">{description}</div>
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
    <label className={cn("grid gap-2 rounded-[14px] p-3", tone === "risk" ? "bg-[#fff7ed]" : "bg-[#f8fbff]")}>
      <span className={cn("text-[12px] font-black", tone === "risk" ? "text-[#9a6a28]" : "text-[#6c7890]")}>{label}</span>
      <Textarea
        className="min-h-[unset] border-0 bg-white shadow-[inset_0_0_0_1px_#dbe4f0]"
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function ProductDraftReferencePaths({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const referenceCount = splitLines(value).length;
  return (
    <ProductDraftSection
      title="参考图路径"
      description="一行一个本地路径；保存后会在商品信息页显示为参考图素材。"
      icon={<ImageIcon size={15} />}
    >
      <div className="grid gap-3 rounded-[14px] bg-[#f8fbff] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge tone={referenceCount >= 3 ? "ok" : "warn"}>{referenceCount} 条路径</Badge>
          <span className="text-xs font-semibold text-[#6c7890]">建议至少 3 张参考图</span>
        </div>
        <Textarea
          className="min-h-[120px] border-0 bg-white shadow-[inset_0_0_0_1px_#dbe4f0]"
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
  const providerChart = buildProviderChartOption(analytics.providerRows);
  const trendChart = buildTrendChartOption(analytics.trend);
  const recentChart = buildRecentChartOption(analytics.recent);
  return (
    <section className="grid gap-4" aria-label="统计仪表盘">
      <Card className="p-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-[13px] font-black text-[var(--text)]">时间范围:</span>
            <Select className="w-[150px]" value={range} onChange={(event) => onRangeChange(event.target.value as DashboardRange)}>
              <option value="24h">近24小时</option>
              <option value="7d">近7天</option>
              <option value="30d">近30天</option>
              <option value="all">全部</option>
            </Select>
            <Button onClick={onRefresh} disabled={isBusy}>
              <RefreshCcw size={14} />
              刷新
            </Button>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-end">
            <Badge tone={analytics.activeJobs > 0 ? "warn" : "neutral"}>{analytics.activeJobs} 个进行中</Badge>
            <Badge tone={analytics.failedJobs > 0 ? "danger" : "ok"}>{analytics.failedJobs} 个失败</Badge>
            <span className="text-[13px] font-black text-[var(--text)]">粒度:</span>
            <Select className="w-[130px]" value={granularity} onChange={(event) => onGranularityChange(event.target.value as DashboardGranularity)}>
              <option value="hour">按小时</option>
              <option value="day">按天</option>
            </Select>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(420px,.98fr)_minmax(0,1fr)]">
        <Card>
          <PanelTitle icon={<CircleDollarSign size={16} />} right={<Badge>{analytics.providerRows.length} 个通道</Badge>}>
            模型分布
          </PanelTitle>
          <div className="grid gap-3 lg:grid-cols-[minmax(180px,280px)_minmax(0,1fr)] lg:items-center">
            <ChartBlock option={providerChart} height={250} empty={analytics.providerRows.length === 0} />
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[430px] border-separate border-spacing-0 text-left text-xs">
                <thead className="text-[var(--muted)]">
                  <tr>
                    <th className="border-b border-[var(--border)] px-2 py-2 font-black">模型</th>
                    <th className="border-b border-[var(--border)] px-2 py-2 font-black">请求</th>
                    <th className="border-b border-[var(--border)] px-2 py-2 font-black">Token</th>
                    <th className="border-b border-[var(--border)] px-2 py-2 font-black">成本</th>
                    <th className="border-b border-[var(--border)] px-2 py-2 font-black">活跃</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.providerRows.map((row) => (
                    <tr key={row.name}>
                      <td className="border-b border-[var(--border)] px-2 py-2 font-bold text-[var(--accent2)]">{providerLabel(row.name)}</td>
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

        <Card>
          <PanelTitle icon={<Gauge size={16} />} right={<Badge>Token + 人民币</Badge>}>
            Token / 成本趋势
          </PanelTitle>
          <ChartBlock option={trendChart} height={290} empty={analytics.trend.length === 0} />
        </Card>
      </div>

      <Card>
        <PanelTitle icon={<WalletCards size={16} />} right={<Badge>{analytics.recent.length}/12</Badge>}>
          最近使用
        </PanelTitle>
        <ChartBlock option={recentChart} height={260} empty={analytics.recent.length === 0} />
        <div className="mt-3 grid gap-2">
          {analytics.recent.slice(0, 8).map((item) => (
            <div key={item.id} className="grid gap-2 rounded-lg border border-[var(--border)] bg-white p-2 text-xs md:grid-cols-[minmax(150px,1.2fr)_minmax(140px,1fr)_88px_90px_90px_80px] md:items-center">
              <strong className="min-w-0 truncate text-[var(--text)]">{item.productSku}</strong>
              <span className="min-w-0 truncate text-[var(--muted)]">{providerLabel(item.provider)}</span>
              <Badge tone={jobStatusTone(item.status as VideoJob["status"])}>{statusLabel(item.status)}</Badge>
              <span>{formatDuration(item.durationSeconds)}</span>
              <strong>¥{money(item.estimatedCostCny)}</strong>
              <span className="text-[var(--muted)]">{item.label}</span>
            </div>
          ))}
          {analytics.recent.length === 0 ? <EmptyState icon={<WalletCards size={28} />} text="还没有使用记录" /> : null}
        </div>
      </Card>
    </section>
  );
}

function ChartBlock({ option, height, empty }: { option: EChartsOption; height: number; empty: boolean }) {
  if (empty) {
    return <EmptyState icon={<Gauge size={28} />} text="还没有可统计的数据" />;
  }
  return (
    <ReactECharts
      className="min-w-0"
      option={option}
      notMerge
      lazyUpdate
      style={{ height, width: "100%" }}
    />
  );
}

function ApiModelConfigPanel({
  config,
  drafts,
  testStatuses,
  onDraftChange,
  onApplyPreset,
  onSave,
  onTest,
  onClear,
  isBusy
}: {
  config: ProviderConfigLedger;
  drafts: Record<ApiProviderId, ModelConfigDraft>;
  testStatuses: Partial<Record<ApiProviderId, ModelConfigTestStatus>>;
  onDraftChange: (providerId: ApiProviderId, patch: Partial<ModelConfigDraft>) => void;
  onApplyPreset: (providerId: ApiProviderId, preset: ModelConfigDraft) => void;
  onSave: (providerId: ApiProviderId, event: FormEvent<HTMLFormElement>) => Promise<void>;
  onTest: (providerId: ApiProviderId) => Promise<void>;
  onClear: (providerId: ApiProviderId, configId?: string) => Promise<void>;
  isBusy: boolean;
}) {
  const [editingProviderId, setEditingProviderId] = useState<ApiProviderId | undefined>();
  const groups = [
    {
      kind: "text" as const,
      title: "文本模型",
      description: "商品整理、脚本分镜等文字推理能力。",
      models: config.textModels,
      providerId: "openai-compatible-text" as const,
      badge: "文本"
    },
    {
      kind: "image" as const,
      title: "图片模型",
      description: "商品图和参考图能力。",
      models: config.imageModels,
      providerId: "openai-compatible-image" as const,
      badge: "图片"
    },
    {
      kind: "video" as const,
      title: "视频模型",
      description: "最终成片生成能力。",
      models: config.videoModels,
      providerId: "volcengine-seedance" as const,
      badge: "视频"
    }
  ];
  const editingGroup = groups.find((group) => group.providerId === editingProviderId);
  const configuredCount = [...config.textModels, ...config.imageModels, ...config.videoModels].filter((model) => model.configured).length;
  return (
    <Card id="API Key">
      <PanelTitle icon={<KeyRound size={16} />} right={<Badge>{configuredCount} 条已配置</Badge>}>
        API Key
      </PanelTitle>
      <div className="mb-3 rounded-lg border border-[#dbe4f0] bg-[#f8fbff] px-3 py-2 text-xs font-bold leading-5 text-[#5f6d84]">
        这里配置的是你自己的模型 API Key，系统会按你的配置调用文本、图片和视频模型。
      </div>
      <div className="grid gap-3">
        {groups.map((group) => (
          <ApiModelConfigGroup
            key={group.providerId}
            title={group.title}
            badge={group.badge}
            description={group.description}
            providerId={group.providerId}
            models={group.models}
            draft={drafts[group.providerId]}
            presets={modelConfigPresets[group.providerId]}
            onDraftChange={onDraftChange}
            onApplyPreset={onApplyPreset}
            onClear={onClear}
            onAdd={() => {
              onDraftChange(group.providerId, resetModelConfigDraft(group.providerId));
              setEditingProviderId(group.providerId);
            }}
            onEdit={(model) => {
              onDraftChange(group.providerId, draftFromProviderConfig(group.providerId, model));
              setEditingProviderId(group.providerId);
            }}
            isBusy={isBusy}
          />
        ))}
      </div>
      {editingGroup ? (
        <ApiModelConfigDialog
          title={`添加${editingGroup.badge}服务`}
          badge={editingGroup.badge}
          providerId={editingGroup.providerId}
          draft={drafts[editingGroup.providerId]}
          testStatus={testStatuses[editingGroup.providerId]}
          presets={modelConfigPresets[editingGroup.providerId]}
          onDraftChange={onDraftChange}
          onApplyPreset={onApplyPreset}
          onClose={() => setEditingProviderId(undefined)}
          onTest={onTest}
          onSave={async (providerId, event) => {
            await onSave(providerId, event);
            setEditingProviderId(undefined);
          }}
          isBusy={isBusy}
        />
      ) : null}
    </Card>
  );
}

function ApiModelConfigGroup({
  title,
  badge,
  description,
  providerId,
  models,
  draft,
  presets,
  onDraftChange,
  onApplyPreset,
  onClear,
  onAdd,
  onEdit,
  isBusy
}: {
  title: string;
  badge: string;
  description: string;
  providerId: ApiProviderId;
  models: ProviderConfigItem[];
  draft: ModelConfigDraft;
  presets: ModelConfigDraft[];
  onDraftChange: (providerId: ApiProviderId, patch: Partial<ModelConfigDraft>) => void;
  onApplyPreset: (providerId: ApiProviderId, preset: ModelConfigDraft) => void;
  onClear: (providerId: ApiProviderId, configId?: string) => Promise<void>;
  onAdd: () => void;
  onEdit: (model: ProviderConfigItem) => void;
  isBusy: boolean;
}) {
  const configuredCount = models.filter((model) => model.configured).length;
  return (
    <section className="grid gap-2.5 rounded-lg border border-[#dbe4f0] bg-[#fbfdff] p-3 text-[12px]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="m-0 text-[15px] font-black leading-5 text-[#172033]">{title}</h3>
            <Badge className="min-h-5 px-1.5 text-[10px]">{badge}</Badge>
            <Badge className="min-h-5 px-1.5 text-[10px]" tone={configuredCount > 0 ? "ok" : "danger"}>{configuredCount > 0 ? `${configuredCount} 条可用` : "未配置"}</Badge>
          </div>
          <div className="mt-0.5 text-[12px] font-medium leading-5 text-[#6c7890]">{description}</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button className="min-h-7 px-2 text-[12px]" size="sm" variant="primary" type="button" disabled={isBusy} onClick={onAdd}>
            <Plus size={12} />
            {`添加${badge}服务`}
          </Button>
        </div>
      </div>
      <div className="grid gap-1.5">
        {models.map((model, index) => (
          <div key={model.configId ?? `${model.id}-${index}`} className="grid gap-2 rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 min-[980px]:grid-cols-[minmax(180px,1.1fr)_120px_minmax(180px,1fr)_72px_auto] min-[980px]:items-center">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                {index === 0 && model.configured ? <Badge className="min-h-5 px-1.5 text-[10px]" tone="ok">默认</Badge> : null}
                <strong className="truncate text-[13px] font-black text-[#172033]">{model.label}</strong>
              </div>
              <div className="mt-0.5 truncate text-[11px] font-semibold text-[#8b97aa]">{model.baseUrl}</div>
            </div>
            <div className="text-[12px] font-bold text-[#5f6d84]">{model.providerLabel || draft.vendor || "-"}</div>
            <div className="truncate text-[12px] font-bold text-[#172033]" title={model.model}>{model.model || draft.model || "-"}</div>
            <div className="text-[12px] font-black text-[#172033]">优先级 {model.priority ?? 0}</div>
            <div className="flex flex-wrap justify-end gap-1.5">
              <Button className="min-h-7 px-2 text-[12px]" size="sm" type="button" disabled={isBusy} onClick={() => onEdit(model)}>
                编辑
              </Button>
              <Button className="min-h-7 px-2 text-[12px]" size="sm" variant="danger" type="button" disabled={isBusy || !model.configured} onClick={() => void onClear(providerId, model.configId)}>
                删除
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ApiModelConfigDialog({
  title,
  badge,
  providerId,
  draft,
  testStatus,
  presets,
  onDraftChange,
  onApplyPreset,
  onClose,
  onTest,
  onSave,
  isBusy
}: {
  title: string;
  badge: string;
  providerId: ApiProviderId;
  draft: ModelConfigDraft;
  testStatus?: ModelConfigTestStatus;
  presets: ModelConfigDraft[];
  onDraftChange: (providerId: ApiProviderId, patch: Partial<ModelConfigDraft>) => void;
  onApplyPreset: (providerId: ApiProviderId, preset: ModelConfigDraft) => void;
  onClose: () => void;
  onTest: (providerId: ApiProviderId) => Promise<void>;
  onSave: (providerId: ApiProviderId, event: FormEvent<HTMLFormElement>) => Promise<void>;
  isBusy: boolean;
}) {
  const endpointPrefix = endpointPrefixPreview(draft.baseUrl, providerId);
  const isEditingExisting = Boolean(draft.configId);
  const isTesting = testStatus?.message === "测试配置中...";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#172033]/35 p-4">
      <section className="max-h-[min(860px,calc(100vh-32px))] w-full max-w-[860px] overflow-auto rounded-[18px] border border-[#cfd9ea] bg-[#fbfcff] p-6 shadow-[0_24px_72px_rgba(23,32,51,.22)]">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[.16em] text-[#8b9bb3]">{isEditingExisting ? "EDIT CONFIG" : "NEW CONFIG"}</div>
            <h3 className="m-0 mt-1.5 text-[24px] font-black leading-tight text-[#172033]">{isEditingExisting ? title.replace("添加", "编辑") : title}</h3>
            <div className="mt-2 text-[13px] font-semibold leading-5 text-[#61718d]">
              {isEditingExisting ? "不填写 API Key 时会保留原 Key；优先级越高越先使用。" : "推荐先选择模板，系统会自动填入更合理的 Base URL 与默认模型。"}
            </div>
          </div>
          <Badge>{badge}</Badge>
        </div>
        <form className="grid gap-3" onSubmit={(event) => void onSave(providerId, event)}>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <Button
                key={`${providerId}-${preset.name}-${preset.model}`}
                type="button"
                onClick={() => onApplyPreset(providerId, preset)}
              >
                {preset.name}
              </Button>
            ))}
          </div>
          <Field label="配置名称">
            <Input value={draft.name} onChange={(event) => onDraftChange(providerId, { name: event.target.value })} />
          </Field>
          <Field label="服务商">
            <Select value={draft.vendor} onChange={(event) => onDraftChange(providerId, { vendor: event.target.value })}>
              {vendorOptions(providerId).map((vendor) => (
                <option key={vendor.value} value={vendor.value}>{vendor.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="优先级">
            <Input
              type="number"
              min={0}
              value={draft.priority}
              onChange={(event) => onDraftChange(providerId, { priority: Number(event.target.value) })}
            />
          </Field>
          <div className="text-[12px] font-semibold leading-5 text-[#8b9bb3]">
            数值越高越优先。工作台默认会优先使用同类型里优先级最高的启用配置。
          </div>
          <Field label="API Key">
            <Input
              type="password"
              autoComplete="off"
              value={draft.apiKey}
              onChange={(event) => onDraftChange(providerId, { apiKey: event.target.value })}
              placeholder={isEditingExisting ? "留空则保留原 Key" : "sk-..."}
            />
          </Field>
          <Field label="Base URL">
            <Input value={draft.baseUrl} onChange={(event) => onDraftChange(providerId, { baseUrl: event.target.value })} />
          </Field>
          <div className="rounded-lg border border-dashed border-[#d7e3f5] bg-[#f6f9ff] px-3 py-2 text-[12px] font-semibold text-[#8b9bb3]">
            实际端点前缀: <span className="font-mono text-[#172033]">{endpointPrefix}</span>
          </div>
          <Field label="模型（逗号分隔）">
            <Input value={draft.model} onChange={(event) => onDraftChange(providerId, { model: event.target.value })} />
          </Field>
          {!isTesting && testStatus ? (
            <div
              className={cn(
                "whitespace-pre-wrap rounded-lg border px-3 py-2 text-[12px] font-bold leading-5",
                testStatus.tone === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : testStatus.tone === "danger"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-[#d7e3f5] bg-[#f6f9ff] text-[#61718d]"
              )}
            >
              {testStatus.message}
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 pt-3">
            <Button type="button" variant="ghost" disabled={isBusy} onClick={() => void onTest(providerId)}>
              {isTesting ? <RefreshCcw className="h-4 w-4 animate-spin" /> : null}
              {isTesting ? "测试中" : "测试配置"}
            </Button>
            <Button type="button" disabled={isBusy} onClick={onClose}>
              取消
            </Button>
            <Button variant="primary" type="submit" disabled={isBusy}>
              保存
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function VideoJobsPanel({
  jobs,
  onCancel,
  onRetry
}: {
  jobs: VideoJob[];
  onCancel: (jobId: string) => Promise<void>;
  onRetry: (job: VideoJob) => Promise<void>;
}) {
  const activeCount = jobs.filter((job) => job.status === "queued" || job.status === "running").length;
  return (
    <Card id="生成任务记录">
      <PanelTitle icon={<Gauge size={16} />} right={<Badge tone={activeCount > 0 ? "warn" : "neutral"}>{activeCount} 个进行中</Badge>}>
        生成任务记录
      </PanelTitle>
      {jobs.length > 0 ? (
        <div className="grid gap-3">
          {jobs.slice(0, 12).map((job) => (
            <article
              key={job.id}
              className={cn(
                "grid gap-3 rounded-lg border bg-white p-3 text-xs xl:grid-cols-[minmax(210px,1.05fr)_minmax(180px,.9fr)_minmax(240px,1.05fr)_minmax(240px,1.05fr)_auto] xl:items-start",
                job.status === "failed" ? "border-red-200 bg-red-50/40" : job.status === "canceled" ? "border-slate-200 bg-slate-50" : "border-[var(--border)]"
              )}
            >
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <strong className="truncate text-[13px] text-[var(--text)]">{job.id}</strong>
                  <Badge tone={jobStatusTone(job.status)}>{statusLabel(job.status)}</Badge>
                </div>
                <div className="mt-1 truncate text-[var(--muted)]">{job.productSku || job.productPath}</div>
              </div>
              <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-x-2 gap-y-1">
                <MetricLine label="生成通道" value={providerLabel(job.provider)} />
                <MetricLine label="时长" value={formatDuration(job.durationSeconds)} />
                <MetricLine label="视频类型" value={templateLabel(job.template)} />
                <MetricLine label="付费确认" value={job.confirmPaid ? "是" : "否"} />
              </div>
              <div className="grid min-w-0 grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-1">
                <MetricLine label="创建" value={formatDateTime(job.createdAt)} />
                <MetricLine label="更新" value={formatDateTime(job.updatedAt)} />
                <MetricLine label="Tokens" value={formatNumber(job.totalTokens)} />
                <MetricLine label="估算成本" value={job.estimatedCostCny === undefined ? "-" : `¥${money(job.estimatedCostCny)}`} />
                {job.error ? <MetricLine label="错误" value={readableVideoJobError(job.error)} /> : null}
              </div>
              <div className="grid min-w-0 gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-2">
                <div className="text-[11px] font-black text-[var(--muted)]">任务结果</div>
                <div className="flex flex-wrap gap-2">
                  <PackageLink href={job.finalVideoUrl} label="打开成片" />
                  {job.finalVideoUrl ? (
                    <Button asChild size="sm">
                      <a href={job.finalVideoUrl} download>
                        <Download size={13} />
                        下载成片
                      </a>
                    </Button>
                  ) : null}
                  <PackageLink href={job.reportUrl} label="查看报告" />
                </div>
                {!job.finalVideoUrl && !job.reportUrl ? (
                  <div className="text-[11px] font-semibold text-[var(--muted)]">{job.status === "completed" ? "暂无成片入口" : "任务完成后显示成片和报告"}</div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-start justify-end gap-2">
                {job.status === "queued" ? (
                  <Button size="sm" variant="danger" onClick={() => void onCancel(job.id)}>
                    <StopCircle size={13} />
                    取消排队
                  </Button>
                ) : null}
                {job.status === "failed" ? (
                  <Button size="sm" onClick={() => void onRetry(job)}>
                    <RefreshCcw size={13} />
                    重试任务
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Clapperboard size={28} />} text="还没有生成任务" />
      )}
    </Card>
  );
}

function AuditLogPanel({ auditLog }: { auditLog?: AuditLogLedger }) {
  return (
    <Card>
      <PanelTitle icon={<ClipboardCheck size={16} />} right={<Badge>{auditLog ? auditLog.summary.totalEvents : "audit"}</Badge>}>
        操作审计
      </PanelTitle>
      {auditLog ? (
        <div className="grid gap-3">
          <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3 text-xs md:grid-cols-3">
            <MetricInline label="总事件" value={formatNumber(auditLog.summary.totalEvents)} />
            <MetricInline label="最近操作" value={auditLog.events[0] ? formatDateTime(auditLog.events[0].at) : "-"} />
            <MetricInline label="记录方式" value="本地 JSONL" />
          </div>
          {auditLog.events.length > 0 ? (
            <div className="grid gap-2">
              {auditLog.events.slice(0, 10).map((event) => (
                <article key={event.id} className="grid gap-2 rounded-lg border border-[var(--border)] bg-white p-3 text-xs lg:grid-cols-[150px_minmax(160px,1fr)_minmax(170px,1.4fr)_120px] lg:items-center">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-black text-[var(--text)]">{auditActionLabel(event.action)}</div>
                    <div className="truncate text-[var(--muted)]">{event.action}</div>
                  </div>
                  <div className="min-w-0 truncate text-[var(--muted)]">{event.target || "-"}</div>
                  <div className="min-w-0 truncate text-[var(--muted)]">{auditMetadataSummary(event.metadata)}</div>
                  <div className="text-[var(--muted)]">{formatDateTime(event.at)}</div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState icon={<ClipboardCheck size={28} />} text="还没有操作审计记录" />
          )}
        </div>
      ) : (
        <EmptyState icon={<ClipboardCheck size={28} />} text="正在读取最近操作" />
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
  return (
    <Card>
      <PanelTitle
        icon={<Database size={16} />}
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge tone="ok">长期保存</Badge>
            <Button size="sm" variant="soft" onClick={() => void onCreateBackup()} disabled={isBusy}>
              <FileArchive size={13} />
              生成备份包
            </Button>
          </div>
        }
      >
        存储与备份
      </PanelTitle>
      {report ? (
        <div className="grid gap-3">
          <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3 text-xs md:grid-cols-5">
            <MetricInline label="备份容量" value={formatBytes(report.summary.totalBytes)} />
            <MetricInline label="文件数" value={formatNumber(report.summary.totalFiles)} />
            <MetricInline label="视频" value={formatNumber(report.summary.videoFiles)} />
            <MetricInline label="Manifest" value={formatNumber(report.summary.manifestFiles)} />
            <MetricInline label="参考图" value={formatNumber(report.summary.referenceImages)} />
          </div>
          <div className="grid gap-2 lg:grid-cols-3">
            {report.scopes.map((scope) => (
              <article key={scope.id} className="grid gap-2 rounded-lg border border-[var(--border)] bg-white p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <strong className="truncate text-[13px] text-[var(--text)]">{scope.label}</strong>
                  <Badge tone={scope.mustBackup ? "ok" : "neutral"}>{scope.mustBackup ? "必备份" : "可选"}</Badge>
                </div>
                <div className="truncate text-[var(--muted)]">{scope.path}</div>
                <div className="grid grid-cols-2 gap-2">
                  <MetricInline label="容量" value={formatBytes(scope.totalBytes)} />
                  <MetricInline label="文件" value={formatNumber(scope.fileCount)} />
                  <MetricInline label="视频" value={formatNumber(scope.videoFiles)} />
                  <MetricInline label="JSON" value={formatNumber(scope.jsonFiles)} />
                </div>
              </article>
            ))}
          </div>
          <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-white p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[13px] font-black text-[var(--text)]">本地备份包</div>
                <div className="mt-1 text-[var(--muted)]">
                  {backups ? `${formatNumber(backups.summary.totalBackups)} 个备份 / ${formatBytes(backups.summary.totalBytes)}` : "正在读取备份包"}
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
                    <PackageLink href={backup.url} label="下载备份" />
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState icon={<FileArchive size={28} />} text="还没有本地备份包" />
            )}
          </div>
          <CopyBlock title="备份命令">
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
        <EmptyState icon={<Database size={28} />} text="正在读取本地存储与备份范围" />
      )}
    </Card>
  );
}

function VideoAssetsPanel({ assets, onDelete, isBusy }: { assets?: VideoAssetLedger; onDelete: (asset: VideoAsset) => Promise<void>; isBusy: boolean }) {
  return (
    <Card>
      <PanelTitle icon={<Database size={16} />} right={<Badge>{assets ? formatBytes(assets.summary.totalBytes) : "local"}</Badge>}>
        视频资产
      </PanelTitle>
      {assets ? (
        <div className="grid gap-3">
          <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3 text-xs md:grid-cols-5">
            <MetricInline label="总容量" value={formatBytes(assets.summary.totalBytes)} />
            <MetricInline label="成品" value={formatNumber(assets.summary.finalAssets)} />
            <MetricInline label="原始" value={formatNumber(assets.summary.rawAssets)} />
            <MetricInline label="素材包" value={formatNumber(assets.summary.publishAssets)} />
            <MetricInline label="缺失" value={formatNumber(assets.summary.missingAssets)} />
          </div>
          <div className="grid gap-2">
            {assets.assets.slice(0, 10).map((asset) => (
              <article
                key={`${asset.kind}-${asset.path}`}
                className={cn(
                  "grid gap-2 rounded-lg border bg-white p-3 text-xs lg:grid-cols-[96px_minmax(150px,1fr)_minmax(170px,1fr)_96px_120px_minmax(170px,auto)] lg:items-center",
                  asset.exists ? "border-[var(--border)]" : "border-red-200 bg-red-50/50"
                )}
              >
                <Badge tone={asset.exists ? videoAssetKindTone(asset.kind) : "danger"}>{videoAssetKindLabel(asset.kind)}</Badge>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-black">{asset.productSku || "-"}</div>
                  <div className="truncate text-[var(--muted)]">{asset.jobId}</div>
                </div>
                <div className="min-w-0 truncate text-[var(--muted)]">{asset.path}</div>
                <strong>{formatBytes(asset.sizeBytes)}</strong>
                <span className="text-[var(--muted)]">{asset.source === "publish-package" ? "素材包" : "生成报告"}</span>
                <div className="flex flex-wrap gap-2">
                  <PackageLink href={asset.url} label="打开视频" />
                  <Button size="sm" variant="danger" disabled={!asset.exists || isBusy} onClick={() => void onDelete(asset)}>
                    <StopCircle size={13} />
                    删除文件
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {assets.assets.length === 0 ? <EmptyState icon={<Database size={28} />} text="还没有本地视频资产" /> : null}
        </div>
      ) : (
        <EmptyState icon={<Database size={28} />} text="正在读取本地视频资产" />
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
  return (
    <Card>
      <PanelTitle icon={<BadgeJapaneseYen size={16} />} right={<Badge>{usage ? `${usage.items.length}/${usage.total}` : "只读"}</Badge>}>
        官方用量
      </PanelTitle>
      <div className="mb-3 grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3 md:grid-cols-[150px_minmax(220px,1fr)_auto] md:items-end">
        <Field label="状态">
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="succeeded">已完成</option>
            <option value="running">生成中</option>
            <option value="queued">排队中</option>
            <option value="failed">失败</option>
            <option value="cancelled">已取消</option>
            <option value="all">全部</option>
          </Select>
        </Field>
        <Field label="模型">
          <Input value={model} onChange={(event) => setModel(event.target.value)} placeholder="doubao-seedance-2-0-260128" />
        </Field>
        <Button variant="primary" onClick={() => void onRefresh()} disabled={isBusy}>
          <RefreshCcw size={14} />
          刷新官方用量
        </Button>
      </div>
      {usage ? (
        <div className="grid gap-3">
          <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3 text-xs md:grid-cols-4">
            <MetricInline label="官方任务" value={formatNumber(usage.total)} />
            <MetricInline label="用量" value={formatNumber(usage.totalTokens)} />
            <MetricInline label="估算成本" value={`¥${money(usage.estimatedCostCny)}`} />
            <MetricInline label="单价" value={`¥${money(usage.tokenPriceCnyPerMillion)} / 百万用量`} />
          </div>
          <div className="grid gap-2">
            {usage.items.map((item) => (
              <article
                key={item.id}
                className="grid gap-2 rounded-lg border border-[var(--border)] bg-white p-3 text-xs lg:grid-cols-[minmax(160px,1fr)_minmax(220px,1.2fr)_90px_90px_100px_130px] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-black">{item.id}</div>
                  <div className="truncate text-[var(--muted)]">{formatProviderUnixTime(item.createdAt)}</div>
                </div>
                <div className="min-w-0 truncate text-[var(--muted)]">{item.model || "-"}</div>
                <Badge tone={providerUsageStatusTone(item.status)}>{statusLabel(item.status)}</Badge>
                <span>{formatDuration(item.durationSeconds)}</span>
                <strong>{formatCompactNumber(item.totalTokens)}</strong>
                <strong className="text-[var(--danger)]">¥{money(item.estimatedCostCny)}</strong>
              </article>
            ))}
          </div>
          {usage.items.length === 0 ? <EmptyState icon={<BadgeJapaneseYen size={28} />} text="官方没有返回符合条件的任务" /> : null}
        </div>
      ) : (
        <EmptyState icon={<BadgeJapaneseYen size={28} />} text="点击刷新官方用量后展示近期待对账任务" />
      )}
    </Card>
  );
}

function FeeSummaryPanel({ ledger, reports }: { ledger?: Ledger; reports: Report[] }) {
  const summary = ledger?.summary;
  const productRows = buildFeeProductRows(reports);
  const totalJobs = summary?.totalJobs ?? productRows.reduce((total, row) => total + row.jobs, 0);
  const paidJobs = summary?.paidJobs ?? productRows.reduce((total, row) => total + row.paidJobs, 0);
  const mockJobs = summary?.mockJobs ?? productRows.reduce((total, row) => total + row.mockJobs, 0);
  const estimatedCostCny = summary?.estimatedCostCny ?? productRows.reduce((total, row) => roundMoney(total + row.estimatedCostCny), 0);
  const finalVideos = summary?.finalVideos ?? productRows.reduce((total, row) => total + row.finalVideos, 0);
  return (
    <Card>
      <PanelTitle icon={<WalletCards size={16} />} right={<Badge>{formatNumber(productRows.length)} 个商品</Badge>}>
        费用汇总
      </PanelTitle>
      <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3 text-xs sm:grid-cols-2 lg:grid-cols-5">
        <MetricInline label="生成次数" value={formatNumber(totalJobs)} />
        <MetricInline label="付费生成" value={formatNumber(paidJobs)} />
        <MetricInline label="本地模拟" value={formatNumber(mockJobs)} />
        <MetricInline label="估算费用" value={`¥${money(estimatedCostCny)}`} />
        <MetricInline label="最终视频" value={formatNumber(finalVideos)} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-black text-[var(--text)]">按商品费用</h3>
        <span className="text-xs font-semibold text-[var(--muted)]">只统计生成次数、付费次数和估算费用。</span>
      </div>
      <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
        <table className="w-full min-w-[620px] border-separate border-spacing-0 text-left text-xs">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="border-b border-[var(--border)] px-3 py-2 font-black">商品</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-black">生成次数</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-black">付费生成</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-black">本地模拟</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-black">最终视频</th>
              <th className="border-b border-[var(--border)] px-3 py-2 font-black">估算费用</th>
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
        {productRows.length === 0 ? <EmptyState icon={<WalletCards size={28} />} text="还没有生成费用" /> : null}
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
  return (
    <Card>
      <PanelTitle icon={<FileVideo size={16} />} right={<Badge>{reports.length}/{allReports.length}</Badge>}>生成报告</PanelTitle>
      <div className="mb-3 grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3 md:grid-cols-[repeat(3,minmax(130px,1fr))_auto] md:items-end">
        <FilterSelect label="商品" value={filters.productSku} options={productOptions} allLabel="全部商品" onChange={(value) => setFilters({ ...filters, productSku: value })} />
        <FilterSelect label="生成通道" value={filters.provider} options={providerOptions} allLabel="全部通道" formatOption={providerLabel} onChange={(value) => setFilters({ ...filters, provider: value })} />
        <FilterSelect label="状态" value={filters.status} options={statusOptions} allLabel="全部状态" formatOption={statusLabel} onChange={(value) => setFilters({ ...filters, status: value })} />
        <label className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-bold">
          <input className="h-4 w-4 accent-[var(--accent)]" type="checkbox" checked={filters.finalOnly} onChange={(event) => setFilters({ ...filters, finalOnly: event.target.checked })} />
          只看成片
        </label>
      </div>
      <div className="grid gap-3">
        {reports.map((report) => (
          <article key={report.path} className="grid gap-3 rounded-lg border border-[var(--border)] bg-white p-3 xl:grid-cols-[minmax(160px,230px)_minmax(260px,1fr)_minmax(260px,340px)]">
            <div className="aspect-[9/16] max-h-[360px] overflow-hidden rounded-lg border border-[var(--border)] bg-[#151a17]">
              {report.finalVideoUrl ? (
                <video className="h-full w-full object-contain" controls playsInline preload="metadata" src={report.finalVideoUrl} />
              ) : (
                <div className="grid h-full place-items-center text-xs text-slate-200">暂无最终视频</div>
              )}
            </div>
            <div className="grid content-start gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-black">{report.productSku || "-"}</div>
                  <div className="truncate text-xs text-[var(--muted)]">{report.path}</div>
                </div>
                <Badge>{statusLabel(report.status)}</Badge>
              </div>
              <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                <MetricLine label="生成通道" value={providerLabel(report.provider)} />
                <MetricLine label="时长" value={formatDuration(report.durationSeconds)} />
                <MetricLine label="Tokens" value={formatNumber(report.billing?.totalTokens)} />
                <MetricLine label="估算成本" value={formatReportCost(report)} />
                <MetricLine label="复用 raw" value={report.reusedRawManifest ? "是" : "否"} />
                <MetricLine label="Task" value={report.taskId || "-"} />
              </div>
            </div>
            <div className="grid content-start gap-2">
              <Button disabled={!report.rawManifestPath} onClick={() => report.rawManifestPath && onReuse(report.rawManifestPath)}>
                <Database size={14} />
                复用 raw manifest
              </Button>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button size="sm" disabled={!report.taskId} onClick={() => report.taskId && void onUsage(report.taskId)}>
                  <Gauge size={13} />
                  查官方用量
                </Button>
                <Button size="sm" variant="danger" disabled={!report.taskId} onClick={() => report.taskId && void onCancel(report.taskId)}>
                  <StopCircle size={13} />
                  取消 queued
                </Button>
              </div>
              <div className="truncate text-xs text-[var(--muted)]">Raw: {report.rawManifestPath || "-"}</div>
              <div className="truncate text-xs text-[var(--muted)]">Final: {report.finalOutputPath || "-"}</div>
            </div>
          </article>
        ))}
        {reports.length === 0 ? <EmptyState icon={<FileVideo size={28} />} text="没有符合筛选条件的报告" /> : null}
      </div>
    </Card>
  );
}

function KpiGrid({ items }: { items: Array<{ label: string; value: string; hint: string; icon: typeof Package; tone: "blue" | "green" | "orange" | "violet" | "rose" | "cyan" }> }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6" aria-label="任务台账">
      {items.map(({ label, value, hint, icon: Icon, tone }) => (
        <article key={label} className="grid min-h-[106px] min-w-0 grid-cols-[44px_minmax(0,1fr)] items-center gap-3 rounded-lg border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]">
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

function PanelTitle({ children, icon, right }: { children: ReactNode; icon?: ReactNode; right?: ReactNode }) {
  return <CardHeader heading={children} icon={icon} right={right} />;
}

function MiniMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--panel2)] p-3">
      <span className="block text-xs font-bold text-[var(--muted)]">{label}</span>
      <strong className="mt-1 block truncate text-[22px] font-black leading-tight">{value}</strong>
      <small className="mt-1 block truncate text-xs text-[var(--muted)]">{hint}</small>
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

function buildProviderChartOption(rows: DashboardProviderRow[]): EChartsOption {
  return {
    color: ["#2563eb", "#10b981", "#f59e0b", "#06b6d4", "#8b5cf6", "#ef4444"],
    tooltip: {
      trigger: "item",
      formatter: "{b}: {c} 次 ({d}%)"
    },
    legend: {
      bottom: 0,
      left: "center",
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: "#657184", fontSize: 11 }
    },
    series: [
      {
        name: "模型分布",
        type: "pie",
        radius: ["58%", "76%"],
        center: ["50%", "44%"],
        avoidLabelOverlap: true,
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 12, fontWeight: 700 }
        },
        data: rows.map((row) => ({
          name: row.name,
          value: row.jobs
        }))
      }
    ]
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildTrendChartOption(points: DashboardTrendPoint[]): EChartsOption {
  return {
    color: ["#2563eb", "#0aa394", "#f97316"],
    tooltip: { trigger: "axis" },
    legend: {
      top: 0,
      right: 8,
      textStyle: { color: "#657184", fontSize: 12 }
    },
    grid: { top: 46, right: 48, bottom: 54, left: 48 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: points.map((point) => point.label),
      axisLabel: { color: "#657184", rotate: 36, fontSize: 10 },
      axisLine: { lineStyle: { color: "#dde6e7" } }
    },
    yAxis: [
      {
        type: "value",
        name: "Token",
        axisLabel: { color: "#657184", formatter: (value: number) => formatCompactNumber(value) },
        splitLine: { lineStyle: { color: "#e6edf0" } }
      },
      {
        type: "value",
        name: "¥",
        axisLabel: { color: "#657184", formatter: (value: number) => `¥${value}` },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: "Token",
        type: "line",
        smooth: true,
        symbolSize: 6,
        areaStyle: { opacity: 0.08 },
        data: points.map((point) => point.totalTokens)
      },
      {
        name: "任务",
        type: "bar",
        barWidth: 12,
        yAxisIndex: 1,
        data: points.map((point) => point.jobs)
      },
      {
        name: "成本",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 6,
        data: points.map((point) => point.estimatedCostCny)
      }
    ]
  };
}

function buildRecentChartOption(rows: DashboardRecentRow[]): EChartsOption {
  const ordered = [...rows].reverse();
  return {
    color: ["#2563eb", "#f97316"],
    tooltip: { trigger: "axis" },
    legend: {
      top: 0,
      right: 8,
      textStyle: { color: "#657184", fontSize: 12 }
    },
    grid: { top: 46, right: 48, bottom: 54, left: 52 },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: ordered.map((row) => row.label),
      axisLabel: { color: "#657184", rotate: 28, fontSize: 10 },
      axisLine: { lineStyle: { color: "#dde6e7" } }
    },
    yAxis: [
      {
        type: "value",
        axisLabel: { color: "#657184", formatter: (value: number) => formatCompactNumber(value) },
        splitLine: { lineStyle: { color: "#e6edf0" } }
      },
      {
        type: "value",
        axisLabel: { color: "#657184", formatter: (value: number) => `¥${value}` },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: "Token",
        type: "line",
        smooth: true,
        symbolSize: 6,
        data: ordered.map((row) => row.totalTokens)
      },
      {
        name: "成本",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 6,
        data: ordered.map((row) => row.estimatedCostCny)
      }
    ]
  };
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

function buildDashboardAnalytics(input: {
  ledger?: Ledger;
  videoJobs: VideoJob[];
  range: DashboardRange;
  granularity: DashboardGranularity;
}): DashboardAnalytics {
  const ledgerJobs = input.ledger?.jobs ?? input.ledger?.products.flatMap((group) => group.jobs) ?? [];
  const ledgerById = new Map(ledgerJobs.map((job) => [job.id, job]));
  const videoJobIds = new Set(input.videoJobs.map((job) => job.id));
  const usageRows: DashboardRecentRow[] = [
    ...input.videoJobs.map((job) => {
      const ledgerJob = ledgerById.get(job.id);
      return toDashboardRecentRow({
        id: job.id,
        productSku: job.productSku ?? ledgerJob?.productSku ?? productNameFromPath(job.productPath),
        provider: job.provider ?? ledgerJob?.provider ?? "mock",
        status: job.status,
        durationSeconds: job.durationSeconds ?? ledgerJob?.durationSeconds,
        totalTokens: ledgerJob?.totalTokens ?? 0,
        estimatedCostCny: ledgerJob?.estimatedCostCny ?? 0,
        createdAt: job.createdAt
      });
    }),
    ...ledgerJobs
      .filter((job) => !videoJobIds.has(job.id))
      .map((job) =>
        toDashboardRecentRow({
          id: job.id,
          productSku: job.productSku ?? "unknown",
          provider: job.provider ?? "unknown",
          status: job.status ?? "completed",
          durationSeconds: job.durationSeconds,
          totalTokens: job.totalTokens,
          estimatedCostCny: job.estimatedCostCny,
          createdAt: createdAtFromJobId(job.id) ?? createdAtFromReportPath(job.reportPath)
        })
      )
  ];
  const filteredRows = filterRowsByRange(usageRows, input.range);
  return {
    providerRows: buildProviderRows(filteredRows),
    trend: buildTrendPoints(filteredRows, input.granularity),
    recent: [...filteredRows].sort(compareRecentRows).slice(0, 12),
    activeJobs: input.videoJobs.filter((job) => job.status === "queued" || job.status === "running").length,
    queuedJobs: input.videoJobs.filter((job) => job.status === "queued").length,
    failedJobs: filteredRows.filter((row) => row.status === "failed").length
  };
}

function toDashboardRecentRow(input: {
  id: string;
  productSku: string;
  provider: string;
  status: string;
  durationSeconds?: number;
  totalTokens: number;
  estimatedCostCny: number;
  createdAt?: string;
}): DashboardRecentRow {
  return {
    ...input,
    label: input.createdAt ? shortTimeLabel(input.createdAt) : input.id.replace(/^job-/, "").slice(-8)
  };
}

function buildProviderRows(rows: DashboardRecentRow[]): DashboardProviderRow[] {
  const groups = new Map<string, DashboardProviderRow>();
  for (const row of rows) {
    const name = row.provider || "unknown";
    const current = groups.get(name) ?? {
      name,
      jobs: 0,
      completed: 0,
      active: 0,
      totalTokens: 0,
      estimatedCostCny: 0
    };
    current.jobs += 1;
    current.completed += row.status === "completed" ? 1 : 0;
    current.active += row.status === "queued" || row.status === "running" ? 1 : 0;
    current.totalTokens += row.totalTokens;
    current.estimatedCostCny = roundMoney(current.estimatedCostCny + row.estimatedCostCny);
    groups.set(name, current);
  }
  return Array.from(groups.values()).sort(
    (left, right) => right.estimatedCostCny - left.estimatedCostCny || right.jobs - left.jobs || left.name.localeCompare(right.name)
  );
}

function buildTrendPoints(rows: DashboardRecentRow[], granularity: DashboardGranularity): DashboardTrendPoint[] {
  const buckets = new Map<string, DashboardTrendPoint>();
  const sorted = [...rows].sort((left, right) => rowTimestamp(left) - rowTimestamp(right));
  for (const row of sorted) {
    const key = trendBucketKey(row.createdAt, granularity);
    const current = buckets.get(key) ?? {
      label: key,
      jobs: 0,
      totalTokens: 0,
      estimatedCostCny: 0
    };
    current.jobs += 1;
    current.totalTokens += row.totalTokens;
    current.estimatedCostCny = roundMoney(current.estimatedCostCny + row.estimatedCostCny);
    buckets.set(key, current);
  }
  return Array.from(buckets.values()).slice(-24);
}

function filterRowsByRange(rows: DashboardRecentRow[], range: DashboardRange): DashboardRecentRow[] {
  if (range === "all") {
    return rows;
  }
  const hours = range === "24h" ? 24 : range === "7d" ? 24 * 7 : 24 * 30;
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return rows.filter((row) => !row.createdAt || Date.parse(row.createdAt) >= cutoff);
}

function compareRecentRows(left: DashboardRecentRow, right: DashboardRecentRow): number {
  return rowTimestamp(right) - rowTimestamp(left) || right.id.localeCompare(left.id);
}

function rowTimestamp(row: DashboardRecentRow): number {
  return row.createdAt ? Date.parse(row.createdAt) || 0 : 0;
}

function trendBucketKey(value: string | undefined, granularity: DashboardGranularity): string {
  if (!value) {
    return "历史";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "历史";
  }
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  if (granularity === "day") {
    return `${month}-${day}`;
  }
  const hour = String(date.getHours()).padStart(2, "0");
  return `${month}-${day} ${hour}:00`;
}

function shortTimeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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

function toneClass(tone: "blue" | "green" | "orange" | "violet" | "rose" | "cyan") {
  const classes = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    orange: "bg-orange-50 text-orange-600",
    violet: "bg-violet-50 text-violet-600",
    rose: "bg-rose-50 text-rose-600",
    cyan: "bg-cyan-50 text-cyan-600"
  };
  return classes[tone];
}

function providerLabel(value?: string): string {
  if (value === "mock") return "本地模拟";
  if (value === "volcengine-seedance" || value === "seedance") return "seedance2.0 fast";
  return value || "-";
}

function videoModelChoiceLabel(value: VideoModelChoice): string {
  return videoModelConfigs[value]?.label ?? value;
}

function videoModelLabel(provider?: string, model?: string): string {
  if (provider === "mock") return "本地模拟";
  if (model === "doubao-seedance-1-5-pro-251215") return "seedance1.5 pro";
  if (model === "doubao-seedance-2-0-260128") return "seedance2.0";
  if (model === "doubao-seedance-2-0-fast-260128") return "seedance2.0 fast";
  if (provider === "volcengine-seedance" || provider === "seedance") return "seedance2.0 fast";
  return provider || "-";
}

function templateLabel(value?: string): string {
  if (value === "scene") return "场景型";
  if (value === "pain-point") return "痛点型";
  if (value === "benefit") return "卖点型";
  if (value === "ugc") return "UGC 型";
  if (value === "unboxing") return "开箱型";
  return value || "-";
}

function finalLanguageLabel(value?: string): string {
  if (value === "zh") return "中文";
  return "日文";
}

function statusLabel(value?: string): string {
  if (value === "queued") return "排队中";
  if (value === "running") return "生成中";
  if (value === "completed" || value === "succeeded") return "已完成";
  if (value === "failed") return "失败";
  if (value === "canceled" || value === "cancelled") return "已取消";
  return value || "-";
}

function versionLabel(index: number): string {
  return `版本 ${index + 1}`;
}

function videoLabel(index: number): string {
  return `视频 ${index + 1}`;
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function historyPreview(value: string): string {
  return splitLines(value).slice(0, 2).join("\n") || "空分镜";
}

function creativeVersionStatusLabel(value?: string): string {
  if (value === "completed" || value === "succeeded") return "可预览";
  if (value === "queued") return "排队中";
  if (value === "running") return "生成中";
  if (value === "failed") return "生成失败";
  if (value === "canceled" || value === "cancelled") return "已取消";
  return value || "-";
}

function hasPlayableVideo(job: { finalVideoUrl?: string; finalOutputPath?: string; expiresAt?: string; expired?: boolean }): boolean {
  return !isExpiredVideo(job) && Boolean(job.finalVideoUrl || job.finalOutputPath);
}

function creativeVersionDisplayStatus(job: CreativeVersionItem): string {
  if (isExpiredVideo(job)) return "已过期";
  if (hasPlayableVideo(job)) return "可预览";
  if (job.status === "completed" || job.status === "succeeded") return "已完成";
  return creativeVersionStatusLabel(job.status);
}

function creativeVersionFailureReason(job: CreativeVersionItem): string {
  if (job.status !== "failed") {
    return "";
  }
  return readableVideoJobError(job.videoJob?.error) || "生成失败，请检查视频模型配置后重试。";
}

function readableVideoJobError(message?: string): string {
  if (!message) {
    return "";
  }
  if (
    message.includes("InputImageSensitiveContentDetected.PrivacyInformation") ||
    message.includes("input image may contain real person")
  ) {
    return "参考图里可能包含真人、人脸或隐私信息，视频平台已拒绝生成。请移除含人物或人脸的参考图，保留纯商品图后重试。";
  }
  if (message.includes("fetch failed")) {
    return "视频平台请求超时或网络连接失败，请稍后重试；如果连续失败，请检查视频模型配置和参考图链接。";
  }
  return message;
}

function isExpiredVideo(job: { expiresAt?: string; expired?: boolean }): boolean {
  if (job.expired) return true;
  if (!job.expiresAt) return false;
  const expiresAt = Date.parse(job.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function videoExpiryLabel(job: { expiresAt?: string; expired?: boolean }): string {
  if (isExpiredVideo(job)) return "已过期";
  if (!job.expiresAt) return "24 小时内可下载";
  const expiresAt = Date.parse(job.expiresAt);
  if (!Number.isFinite(expiresAt)) return "24 小时内可下载";
  return `将于 ${formatDeletionTime(expiresAt)} 删除`;
}

function formatDeletionTime(value: number): string {
  const date = new Date(value);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameDay =
    sameYear &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(now.getDate() + 1);
  const tomorrow =
    sameYear &&
    date.getMonth() === tomorrowDate.getMonth() &&
    date.getDate() === tomorrowDate.getDate();
  const time = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
  if (sameDay) return `今天 ${time}`;
  if (tomorrow) return `明天 ${time}`;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function removeLedgerJob(ledger: Ledger, jobId: string): Ledger {
  const jobs = ledger.jobs.filter((job) => job.id !== jobId);
  return {
    ...ledger,
    jobs,
    products: ledger.products
      .map((product) => ({
        ...product,
        jobs: product.jobs.filter((job) => job.id !== jobId),
        jobCount: product.jobs.filter((job) => job.id !== jobId).length
      }))
      .filter((product) => product.jobs.length > 0)
  };
}

function mergeLedgerJobs(...jobGroups: LedgerJob[][]): LedgerJob[] {
  const byId = new Map<string, LedgerJob>();
  for (const jobs of jobGroups) {
    for (const job of jobs) {
      if (!byId.has(job.id)) {
        byId.set(job.id, job);
      }
    }
  }
  return Array.from(byId.values());
}

function mergeVideoJobs(nextJobs: VideoJob[], currentJobs: VideoJob[]): VideoJob[] {
  const byId = new Map<string, VideoJob>();
  for (const job of [...nextJobs, ...currentJobs]) {
    if (!byId.has(job.id)) {
      byId.set(job.id, job);
    }
  }
  return Array.from(byId.values()).sort((left, right) => videoJobSortTime(right) - videoJobSortTime(left));
}

function buildLatestCreativeJobs(input: {
  actionProduct: ProductSummary;
  ledgerJobs: LedgerJob[];
  videoJobs: VideoJob[];
}): CreativeVersionItem[] {
  const matchingVideoJobs = input.videoJobs
    .filter((job) => isVideoJobForProduct(job, input.actionProduct));
  const productVideoJobs = matchingVideoJobs
    .filter((job) => job.status !== "canceled")
    .map(videoJobToCreativeVersion);
  const videoJobIds = new Set(productVideoJobs.map((job) => job.id));
  const ledgerVersions = input.ledgerJobs
    .filter((job) => !videoJobIds.has(job.id))
    .map(ledgerJobToCreativeVersion);
  return [...productVideoJobs, ...ledgerVersions]
    .sort((left, right) => creativeVersionSortTime(right) - creativeVersionSortTime(left));
}

function videoJobToCreativeVersion(job: VideoJob): CreativeVersionItem {
  return {
    id: job.id,
    status: job.status,
    provider: job.provider,
    providerModel: job.providerModel,
    durationSeconds: job.durationSeconds,
    selectedFinal: false,
    hasFinalVideo: hasPlayableVideo(job),
    finalVideoUrl: job.finalVideoUrl,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt,
    expired: job.expired,
    source: "video-job",
    videoJob: job
  };
}

function ledgerJobToCreativeVersion(job: LedgerJob): CreativeVersionItem {
  return {
    id: job.id,
    status: job.status,
    provider: job.provider,
    durationSeconds: job.durationSeconds,
    selectedFinal: job.selectedFinal,
    hasFinalVideo: hasPlayableVideo(job),
    finalVideoUrl: job.finalVideoUrl,
    createdAt: createdAtFromReportPath(job.reportPath),
    expiresAt: job.expiresAt,
    expired: job.expired,
    source: "ledger"
  };
}

function isVideoJobForProduct(job: VideoJob, product: ProductSummary): boolean {
  return job.productSku === product.sku || job.productPath === product.path;
}

function isActiveCreativeVersion(job: CreativeVersionItem): boolean {
  return isActiveVideoJobStatus(job.status);
}

function formatCreativeVersionTime(job: CreativeVersionItem): string {
  if (!job.createdAt) return "生成时间未知";
  const date = new Date(job.createdAt);
  if (Number.isNaN(date.getTime())) return "生成时间未知";
  const diffMs = Date.now() - date.getTime();
  if (diffMs >= 0 && diffMs < 60_000) return "刚刚";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function creativeVersionSortTime(job: CreativeVersionItem): number {
  return job.createdAt ? Date.parse(job.createdAt) || 0 : 0;
}

function videoJobSortTime(job: VideoJob): number {
  return Date.parse(job.createdAt) || 0;
}

function referenceStatusLabel(value: ReferenceImageStatus["status"]): string {
  if (value === "previewable") return "可预览";
  if (value === "missing") return "文件缺失";
  if (value === "outside-project-root") return "项目外文件";
  if (value === "remote") return "远程图片";
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
  if (result === "pass") return "检查通过";
  if (result === "warning") return "检查提醒";
  if (result === "fail") return "检查失败";
  if (result === "missing") return "检查缺失";
  return "未检查";
}

function shouldRefreshSelectedProductForStudio(transitions: CompletedVideoJobTransitions, selectedSku: string): boolean {
  if (transitions.completedJobIds.length === 0) return false;
  if (transitions.affectedProductSkus.length === 0) return true;
  return transitions.affectedProductSkus.includes(selectedSku);
}

function formatStudioAutoRefreshStatus(transitions: CompletedVideoJobTransitions): string {
  return [
    "当前商品创作已刷新",
    `新完成版本: ${transitions.completedJobIds.length} 个`,
    "历史记录已更新。"
  ].join("\n");
}

function referenceReadiness(product: ProductSummary): { ready: boolean; label: string } {
  const target = 3;
  const count = product.referenceImageCount ?? 0;
  const missing = Math.max(0, target - count);
  if (missing === 0) {
    const label = count === target ? `参考图 ${count}/${target} · 可生成视频` : `参考图 ${count} 张 · 可生成视频`;
    return { ready: true, label };
  }
  if (missing === 2) {
    return { ready: false, label: "参考图 1/3 · 补 2 张参考图后可生成视频" };
  }
  return { ready: false, label: `参考图 ${count}/${target} · 补 ${missing} 张参考图后可生成视频` };
}

function productLibraryStatus(product: ProductSummary): { label: string; detail: string; tone: "ok" | "warn" } {
  const referenceImageCount = product.referenceImageCount ?? 0;
  const missingImages = Math.max(0, 3 - referenceImageCount);
  if (!product.importQuality?.ready) {
    return {
      label: "资料待补",
      detail: `参考图 ${referenceImageCount} 张`,
      tone: "warn"
    };
  }
  if (missingImages > 0) {
    return {
      label: "需补参考图",
      detail: `还差 ${missingImages} 张`,
      tone: "warn"
    };
  }
  return {
    label: "可生成视频",
    detail: `参考图 ${referenceImageCount} 张`,
    tone: "ok"
  };
}

function videoAssetKindTone(kind: VideoAsset["kind"]): "neutral" | "ok" | "danger" | "warn" {
  if (kind === "final") return "ok";
  if (kind === "raw") return "warn";
  return "neutral";
}

function videoAssetKindLabel(kind: VideoAsset["kind"]): string {
  if (kind === "final") return "成品";
  if (kind === "raw") return "原始";
  return "素材包";
}

function auditActionLabel(action: string): string {
  const labels: Record<string, string> = {
    "auth.enter": "账号进入",
    "auth.enter_failed": "登录失败",
    "auth.email_verified": "邮箱验证",
    "auth.password_reset_requested": "请求重置密码",
    "auth.password_reset": "重置密码",
    "auth.logout": "退出登录",
    "provider_key.saved": "保存 Key",
    "provider_key.deleted": "清除 Key",
    "video_asset.deleted": "删除视频文件",
    "video_history.deleted": "删除历史视频",
    "video_job.cancelled": "取消任务",
    "video_job.retried": "重试任务",
    "publish_package.created": "创建素材包",
    "publish_package.batch_created": "批量素材包",
    "review.selected_final": "选择最终版本",
    "review.rated_version": "人工评分"
  };
  return labels[action] ?? action;
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

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  return readJsonResponse<T>(response);
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return readJsonResponse<T>(response);
}

async function postJsonWithSignal<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal
  });
  return readJsonResponse<T>(response);
}

async function putJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return readJsonResponse<T>(response);
}

async function deleteJson<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: "DELETE"
  });
  return readJsonResponse<T>(response);
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return body as T;
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

function formatProductFacts(product: ProductDetail) {
  return [
    "商品资料",
    `标题: ${product.title_ja}`,
    `分类: ${product.category}`,
    `材质: ${product.materials.join("、")}`,
    `尺寸/重量: ${product.dimensions}`,
    "",
    "已验证卖点:",
    ...product.verified_selling_points.map((item) => `- ${item}`),
    "",
    "使用场景:",
    ...product.usage_scenes.map((item) => `- ${item}`),
    "",
    "不可用卖点:",
    ...product.forbidden_claims.map((item) => `- ${item}`),
    "",
    "参考图片:",
    ...product.reference_images.map((item) => `- ${item}`),
    "",
    `源文件: ${product.path}`
  ].join("\n");
}

function defaultModelConfigDrafts(): Record<ApiProviderId, ModelConfigDraft> {
  return {
    "openai-compatible-text": { ...modelConfigPresets["openai-compatible-text"][0] },
    "openai-compatible-image": { ...modelConfigPresets["openai-compatible-image"][0] },
    "volcengine-seedance": { ...modelConfigPresets["volcengine-seedance"][0] }
  };
}

function resetModelConfigDraft(providerId: ApiProviderId): ModelConfigDraft {
  return {
    ...modelConfigPresets[providerId][0],
    configId: undefined,
    apiKey: ""
  };
}

function draftFromProviderConfig(providerId: ApiProviderId, model: ProviderConfigItem): ModelConfigDraft {
  return {
    ...modelConfigPresets[providerId][0],
    configId: model.configId,
    name: model.label,
    vendor: model.providerLabel || modelConfigPresets[providerId][0].vendor,
    priority: model.priority ?? 0,
    apiKey: "",
    baseUrl: model.baseUrl,
    model: model.model
  };
}

function syncModelConfigDraftsFromLedger(
  ledger: ProviderConfigLedger,
  current: Record<ApiProviderId, ModelConfigDraft>
): Record<ApiProviderId, ModelConfigDraft> {
  const next = { ...current };
  for (const model of [ledger.textModels[0], ledger.imageModels[0], ledger.videoModels[0]].filter(Boolean)) {
    next[model.id] = {
      ...next[model.id],
      configId: undefined,
      name: model.label || next[model.id].name,
      vendor: model.providerLabel || next[model.id].vendor,
      priority: model.priority ?? next[model.id].priority,
      baseUrl: model.baseUrl || next[model.id].baseUrl,
      model: model.model || next[model.id].model
    };
  }
  return next;
}

function updateProviderConfigStatus(
  ledger: ProviderConfigLedger,
  status: ProviderKeyStatusResponse["provider"]
): ProviderConfigLedger {
  const update = <T extends ProviderConfigItem>(items: T[]): T[] =>
    items.map((model) => {
      const sameConfig = status.configId ? model.configId === status.configId : model.id === status.id;
      return sameConfig ? { ...model, ...status } : model;
    });
  const textModels = update(ledger.textModels);
  const imageModels = update(ledger.imageModels);
  const videoModels = update(ledger.videoModels);
  return {
    textModels,
    imageModels,
    videoModels,
    providers: videoModels
  };
}

function endpointPrefixPreview(baseUrl: string, providerId: ApiProviderId): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "-";
  }
  if (providerId === "volcengine-seedance") {
    return `${trimmed}/api/v3`;
  }
  if (trimmed.endsWith("/v1") || trimmed.endsWith("/api/v3") || trimmed.endsWith("/v1beta/openai")) {
    return trimmed;
  }
  return `${trimmed}/v1`;
}

function vendorOptions(providerId: ApiProviderId): Array<{ value: string; label: string }> {
  if (providerId === "volcengine-seedance") {
    return [
      { value: "volcengine", label: "volcengine" },
      { value: "doubao", label: "doubao" },
      { value: "vidu", label: "vidu" },
      { value: "alibaba", label: "alibaba" },
      { value: "chatfire", label: "chatfire" }
    ];
  }
  if (providerId === "openai-compatible-image") {
    return [
      { value: "chatfire", label: "chatfire" },
      { value: "gemini", label: "gemini" },
      { value: "volcengine", label: "volcengine" },
      { value: "openai", label: "openai" }
    ];
  }
  return [
    { value: "openai", label: "openai" },
    { value: "deepseek", label: "deepseek" },
    { value: "doubao", label: "doubao" },
    { value: "chatfire", label: "chatfire" },
    { value: "openrouter", label: "openrouter" }
  ];
}

function formatPreflightStatus(preflight: Preflight) {
  return [
    "预检完成",
    "商品资料已读取",
    `生成通道: ${providerLabel(preflight.provider)}`,
    `时长: ${preflight.durationSeconds}s / ${preflight.aspectRatio}`,
    `预计成本: ¥${money(preflight.estimatedCostCny.expected)} (${formatNumber(preflight.estimatedTokens.expected)} tokens)`,
    `测试额度: 总额 ¥${money(preflight.credit.testCreditBalanceCny)} / 已用 ¥${money(preflight.credit.usedEstimatedCostCny)} / 可用 ¥${money(preflight.credit.availableEstimatedCostCny)}`,
    `额度状态: ${preflight.credit.enoughCredit ? "足够" : "不足"}`,
    `资料状态: ${preflight.readiness.readyForPaidGeneration ? "可付费生成" : `不可付费生成: ${preflight.readiness.blockingReasons.join("、")}`}`,
    "",
    "请检查成本、参考图、脚本和 prompt 后再决定是否运行。"
  ].join("\n");
}

function paidRunBlockReason({
  paidProvider,
  freshPreflight,
  preflight,
  confirmPaid
}: {
  paidProvider: boolean;
  freshPreflight: boolean;
  preflight?: Preflight;
  confirmPaid: boolean;
}) {
  if (!paidProvider) {
    return "";
  }
  if (!freshPreflight || !preflight) {
    return "请先生成预检并勾选确认允许付费请求。";
  }
  if (!preflight.readiness.readyForPaidGeneration) {
    const reason = preflight.readiness.blockingReasons.join("、") || "请补齐商品资料和参考图";
    return `商品资料暂不可付费生成：${reason}`;
  }
  if (!preflight.credit.enoughCredit) {
    return "剩余测试额度不足，请提高测试额度或缩短时长。";
  }
  if (!confirmPaid) {
    return "请先生成预检并勾选确认允许付费请求。";
  }
  return "";
}

function productDraftToFacts(draft: ProductDraft) {
  return {
    sku: draft.sku.trim() || internalProductIdFromTitle(draft.title_ja),
    title_ja: draft.title_ja.trim(),
    category: draft.category.trim(),
    materials: splitList(draft.materials),
    dimensions: draft.dimensions.trim(),
    verified_selling_points: splitLines(draft.verified_selling_points),
    usage_scenes: splitLines(draft.usage_scenes),
    forbidden_claims: splitLines(draft.forbidden_claims),
    reference_images: splitLines(draft.reference_images),
    source_text: draft.source_text.trim() || undefined
  };
}

function productDraftToComposerText(draft: ProductDraft): string {
  const sections = [
    ["标题", draft.title_ja],
    ["分类", draft.category],
    ["材质", draft.materials],
    ["尺寸/重量", draft.dimensions],
    ["卖点", draft.verified_selling_points],
    ["使用场景", draft.usage_scenes],
    ["不可用卖点", draft.forbidden_claims]
  ] as const;
  return sections
    .map(([label, value]) => `${label}：${value.trim()}`)
    .filter((line) => !line.endsWith("："))
    .join("\n\n");
}

function isStructuredProductComposerText(value: string): boolean {
  return /(^|\n)\s*(标题|分类|材质|尺寸\/重量|卖点|使用场景|不可用卖点)\s*[：:]/.test(value);
}

function productComposerTextToDraft(value: string, fallback: ProductDraft): ProductDraft {
  if (!isStructuredProductComposerText(value)) {
    return fallback;
  }
  const buckets: Partial<Record<keyof ProductDraft, string[]>> = {};
  let currentKey: keyof ProductDraft | undefined;
  const labelToKey: Record<string, keyof ProductDraft> = {
    "标题": "title_ja",
    "分类": "category",
    "材质": "materials",
    "尺寸/重量": "dimensions",
    "卖点": "verified_selling_points",
    "使用场景": "usage_scenes",
    "不可用卖点": "forbidden_claims"
  };

  for (const rawLine of value.split(/\r?\n/)) {
    const match = rawLine.match(/^\s*(标题|分类|材质|尺寸\/重量|卖点|使用场景|不可用卖点)\s*[：:]\s*(.*)$/);
    if (match) {
      currentKey = labelToKey[match[1] ?? ""];
      if (currentKey) {
        buckets[currentKey] = match[2]?.trim() ? [match[2].trim()] : [];
      }
      continue;
    }
    if (currentKey && rawLine.trim()) {
      buckets[currentKey] = [...(buckets[currentKey] ?? []), rawLine.trim()];
    }
  }

  const bucketText = (key: keyof ProductDraft) => buckets[key]?.join("\n").trim();
  return {
    ...fallback,
    title_ja: bucketText("title_ja") ?? fallback.title_ja,
    category: bucketText("category") ?? fallback.category,
    materials: bucketText("materials") ?? fallback.materials,
    dimensions: bucketText("dimensions") ?? fallback.dimensions,
    verified_selling_points: bucketText("verified_selling_points") ?? fallback.verified_selling_points,
    usage_scenes: bucketText("usage_scenes") ?? fallback.usage_scenes,
    forbidden_claims: bucketText("forbidden_claims") ?? fallback.forbidden_claims,
    source_text: fallback.source_text
  };
}

function internalProductIdFromTitle(title: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = normalized || "product";
  return `ITEM-${base.slice(0, 28)}-${Date.now().toString(36)}`;
}

function productFactsToDraft(product: ProductFactsResponse): ProductDraft {
  return {
    sku: product.sku,
    title_ja: product.title_ja,
    category: product.category,
    materials: product.materials.join("、"),
    dimensions: product.dimensions,
    verified_selling_points: product.verified_selling_points.join("\n"),
    usage_scenes: product.usage_scenes.join("\n"),
    forbidden_claims: product.forbidden_claims.join("\n"),
    reference_images: product.reference_images.join("\n"),
    source_text: product.source_text ?? ""
  };
}

function formatProviderTask(task: Record<string, unknown>) {
  return [
    "火山官方任务详情",
    `Task: ${String(task.id || "-")}`,
    `状态: ${String(task.status || "-")}`,
    `模型: ${String(task.model || "-")}`,
    `时长: ${formatDuration(asNumber(task.durationSeconds))}`,
    `分辨率: ${String(task.resolution || "-")}`,
    `比例: ${String(task.ratio || "-")}`,
    `Tokens: ${formatNumber(asNumber(task.totalTokens))}`,
    `估算成本: ¥${money(asNumber(task.estimatedCostCny))}`,
    "说明: 查询任务不创建视频；官方列表通常只保留最近 7 天。"
  ].join("\n");
}

function formatProviderUsageReport(usage: ProviderUsageReport) {
  return [
    "火山官方用量列表",
    `任务数: ${formatNumber(usage.total)}`,
    `用量: ${formatNumber(usage.totalTokens)}`,
    `估算成本: ¥${money(usage.estimatedCostCny)}`,
    `单价: ¥${money(usage.tokenPriceCnyPerMillion)} / 百万用量`,
    "",
    ...usage.items.map(
      (item) =>
        `- ${item.id} / ${statusLabel(item.status)} / ${item.model || "-"} / ${formatDuration(item.durationSeconds)} / ${formatNumber(item.totalTokens)} 用量 / ¥${money(item.estimatedCostCny)}`
    ),
    "",
    "说明: 查询官方用量只发送 GET 请求，不创建视频。"
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

function splitLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitDraftLines(value: string): string[] | undefined {
  const lines = splitLines(value);
  return lines.length > 0 ? lines : undefined;
}

function defaultStoryboardDraft(template: TemplateName, durationSeconds: number): string {
  const ranges = storyboardTimeRanges(durationSeconds);
  return defaultStoryboardDraftForTemplate(template)
    .map((description, index) => `${ranges[index]}: ${description}`)
    .join("\n");
}

function defaultStoryboardDraftForTemplate(template: TemplateName): string[] {
  const descriptions: Record<TemplateName, string[]> = {
    scene: [
      "展示商品所处的真实使用环境和整体外观。",
      "切近景展示使用动作，让商品自然进入画面主体。",
      "展示材质、尺寸、结构和手部操作细节。",
      "回到完整使用场景，呈现使用后的效果和商品整体。"
    ],
    "pain-point": [
      "先展示没有使用商品时的不便或痛点场景。",
      "切到商品出现并快速解决核心问题。",
      "用近景强化关键卖点和操作过程。",
      "展示解决后的轻松状态和商品整体。"
    ],
    benefit: [
      "开场直接展示最重要的卖点和结果。",
      "用近景说明卖点对应的结构或材质细节。",
      "切换到使用过程，连续展示多个优势。",
      "用整体彩色或多角度画面收束，强化购买理由。"
    ],
    ugc: [
      "以手持或第一视角开场，像真实用户刚拿到商品。",
      "边展示边试用，用自然动作呈现第一感受。",
      "近景拍摄细节、材质和使用中的小发现。",
      "用真实使用后的评价式画面收尾。"
    ],
    unboxing: [
      "从包装或桌面开场，展示开箱前的整洁画面。",
      "打开包装并取出商品，让主体自然进入镜头。",
      "依次展示配件、材质、尺寸和关键细节。",
      "摆放商品并进入简单使用场景，完成开箱收尾。"
    ]
  };
  return descriptions[template] ?? descriptions.scene;
}

function storyboardTimeRanges(durationSeconds: number): string[] {
  const duration = Math.max(4, Math.min(15, Math.floor(durationSeconds || defaultVideoDurationSeconds)));
  const firstEnd = Math.max(1, Math.min(2, Math.floor(duration * 0.2)));
  const secondEnd = Math.max(firstEnd + 1, Math.min(duration - 2, Math.floor(duration * 0.4)));
  const thirdEnd = Math.max(secondEnd + 1, Math.min(duration - 1, Math.floor(duration * 0.7)));
  return [
    `0-${firstEnd}s`,
    `${firstEnd}-${secondEnd}s`,
    `${secondEnd}-${thirdEnd}s`,
    `${thirdEnd}-${duration}s`
  ];
}

function defaultStudioScriptDraft(product: ProductDetail, durationSeconds: number, template: TemplateName): string {
  const scenes = safeChineseDraftText(product.usage_scenes.slice(0, 2).join("、"), "日常使用");
  const sellingPoints = product.verified_selling_points.slice(0, 3).map((point, index) => safeChineseDraftFact(point, index === 0 ? "核心卖点" : "已确认卖点"));
  const materialsText = safeChineseDraftText(product.materials.join("、"), "材质细节");
  return [
    `类型: ${templateLabel(template)} / 时长: ${durationSeconds}s`,
    `面向${scenes}场景里的用户，开头 1 秒先展示痛点或使用场景。`,
    `自然展示「${product.title_ja}」的外观，以及${sellingPoints[0] || "商品资料里确认过的核心卖点"}。`,
    `用手部动作展示${sellingPoints.slice(1).join("、") || "商品资料中已确认的特点"}。`,
    product.materials.length > 0 ? `加入能看出${materialsText}的近景。` : ""
  ].filter(Boolean).join("\n");
}

function defaultStudioStoryboardDraft(product: ProductDetail, durationSeconds: number, template: TemplateName): string {
  const firstScene = safeChineseDraftText(product.usage_scenes[0], "使用场景");
  const firstPoint = safeChineseDraftFact(product.verified_selling_points[0], "商品细节");
  const middle = Math.max(2, Math.floor(durationSeconds * 0.45));
  const closing = Math.max(middle + 1, durationSeconds - 2);
  return [
    `0-2s: 以${templateLabel(template)}开场，展示${firstScene}和商品整体。`,
    `2-${middle}s: 近景展示${firstPoint}。`,
    `${middle}-${closing}s: 展示使用中的手部动作、质感和尺寸感。`,
    `${closing}-${durationSeconds}s: 再次展示使用后的效果和商品整体。`
  ].join("\n");
}

function defaultStudioStoryboardCnDraft(product: ProductDetail, durationSeconds: number, template: TemplateName): string {
  const firstScene = safeChineseDraftText(product.usage_scenes[0], "使用场景");
  const firstPoint = safeChineseDraftFact(product.verified_selling_points[0], "商品细节");
  const middle = Math.max(2, Math.floor(durationSeconds * 0.45));
  const closing = Math.max(middle + 1, durationSeconds - 2);
  return [
    `0-2 秒：以${templateLabel(template)}开场，展示${firstScene}和商品整体。`,
    `2-${middle} 秒：近景展示${firstPoint}。`,
    `${middle}-${closing} 秒：展示使用中的手部动作、质感和尺寸感。`,
    `${closing}-${durationSeconds} 秒：再次展示使用后的效果和商品整体。`
  ].join("\n");
}

function safeChineseDraftFact(value: string | undefined, fallback: string): string {
  return safeChineseDraftText(value, fallback);
}

function safeChineseDraftText(value: string | undefined, fallback: string): string {
  if (!value?.trim()) {
    return fallback;
  }
  return containsJapaneseKana(value) ? fallback : value.trim();
}

function containsJapaneseKana(value: string): boolean {
  return /[\u3040-\u30ffー]/.test(value);
}

function splitList(value: string) {
  return value
    .split(/[、,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
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
