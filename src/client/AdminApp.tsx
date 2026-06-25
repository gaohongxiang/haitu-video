import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock3,
  CreditCard,
  Database,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MailCheck,
  Package,
  RefreshCcw,
  Settings2,
  ShieldAlert,
  Users,
  Video,
  X
} from "lucide-react";
import * as EChartsForReact from "echarts-for-react";
import type { EChartsOption, EChartsReactProps } from "echarts-for-react";
import { FormEvent, type ComponentType, useEffect, useMemo, useState } from "react";

import { Badge } from "./components/ui/badge.js";
import { Button } from "./components/ui/button.js";
import { Card, CardHeader } from "./components/ui/card.js";
import { Field, Input } from "./components/ui/field.js";
import { cn } from "./lib/utils.js";
import {
  apiModeForProviderDraft,
  draftFromProviderConfig,
  modelConfigPresets,
  resetModelConfigDraft,
  SharedModelConfigDialog,
  SharedModelServiceGroup,
  type ModelConfigDraft,
  type ModelConfigProviderId,
  type ModelConfigTestStatus,
  type ModelServiceGroup,
  type ProviderConfigItem,
  type ProviderConfigLedger
} from "./components/modelServiceConfig.js";

const ReactECharts = ((EChartsForReact as { default?: unknown }).default ?? EChartsForReact) as ComponentType<EChartsReactProps>;
const brandLogoUrl = new URL("./assets/logo.svg", import.meta.url).href;
const authOtpCooldownDurationSeconds = 60;

type AuthFlowMode = "entry" | "verify-email";
type AdminSection = "overview" | "users" | "platform-models" | "billing" | "system";

const adminNavigationItems: Array<{
  id: AdminSection;
  label: string;
  description: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}> = [
  {
    id: "overview",
    label: "概览",
    description: "增长、活跃、任务指标",
    icon: LayoutDashboard
  },
  {
    id: "users",
    label: "用户管理",
    description: "用户、工作区、任务明细",
    icon: Users
  },
  {
    id: "platform-models",
    label: "平台模型",
    description: "模型商、版本、平台 Key",
    icon: KeyRound
  },
  {
    id: "billing",
    label: "充值账单",
    description: "余额、充值、收费记录",
    icon: CreditCard
  },
  {
    id: "system",
    label: "系统",
    description: "备份、审计、运行状态",
    icon: Settings2
  }
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

type PlatformModelAdminConfigResponse = Pick<ProviderConfigLedger, "textModels" | "imageModels" | "videoModels">;

interface ModelConfigKeyRevealResponse {
  ok: true;
  provider: ModelConfigProviderId;
  configId: string;
  apiKey: string;
  keyPreview?: string;
}

const platformModelAdminProviders: Array<{
  providerId: ModelConfigProviderId;
  endpoint: string;
  title: string;
  description: string;
  badge: string;
}> = [
  {
    providerId: "openai-compatible-text",
    endpoint: "/api/platform/model-configs/openai-compatible-text",
    title: "文本模型",
    description: "商品整理、脚本分镜等文本调用。",
    badge: "文本"
  },
  {
    providerId: "openai-compatible-image",
    endpoint: "/api/platform/model-configs/openai-compatible-image",
    title: "图片模型",
    description: "商品图、素材图等图片生成调用。",
    badge: "图片"
  },
  {
    providerId: "volcengine-seedance",
    endpoint: "/api/platform/model-configs/volcengine-seedance",
    title: "视频模型",
    description: "成片生成调用。",
    badge: "视频"
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

function platformConfigLedgerFromResponse(response: PlatformModelAdminConfigResponse): ProviderConfigLedger {
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

function platformModelsForProvider(config: ProviderConfigLedger, providerId: ModelConfigProviderId): ProviderConfigItem[] {
  if (providerId === "openai-compatible-text") {
    return config.textModels;
  }
  if (providerId === "openai-compatible-image") {
    return config.imageModels;
  }
  return config.videoModels;
}

export function AdminApp() {
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

  useEffect(() => {
    void bootstrap();
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
      const [nextOverview, platformModels] = await Promise.all([
        getJson<AdminOverview>("/api/admin/overview"),
        getJson<PlatformModelAdminConfigResponse>("/api/platform/model-configs")
      ]);
      setOverview(nextOverview);
      setPlatformConfig(platformConfigLedgerFromResponse(platformModels));
      setStatus("");
    } catch (error) {
      if (error instanceof HttpError && error.status === 403) {
        setForbidden(true);
        setStatus("");
      } else if (error instanceof HttpError && error.status === 401) {
        setSession({ authEnabled: true, authenticated: false });
        setStatus("登录已过期，请重新登录。");
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
      await refreshOverview();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
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
      await refreshOverview();
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
      setStatus("没有可保存的平台模型配置。");
      return;
    }
    if (!draft.apiKey.trim() && !draft.configId) {
      setStatus("请先填写平台 Key。");
      return;
    }
    if (draft.models.length === 0) {
      setStatus("请至少选择一个模型版本。");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      await putJson(platformModelAdminEndpoint(providerId), {
        configId: draft.configId,
        apiKey: draft.apiKey.trim() || undefined,
        name: draft.name.trim(),
        vendor: draft.vendor.trim(),
        baseUrl: draft.baseUrl.trim(),
        model: draft.models,
        apiMode: apiModeForProviderDraft(providerId, draft),
        priority: Number.isFinite(draft.priority) ? draft.priority : 0,
        enabled: draft.enabled
      });
      await refreshOverview();
      setEditingPlatformProviderId(undefined);
      setStatus("平台模型已保存，Key 已加密写入数据库，并已更新平台模型配置。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function clearPlatformModelConfig(providerId: ModelConfigProviderId, configId?: string) {
    setBusy(true);
    setStatus("");
    try {
      const suffix = configId ? `?configId=${encodeURIComponent(configId)}` : "";
      const response = await fetch(`${platformModelAdminEndpoint(providerId)}${suffix}`, {
        method: "DELETE"
      });
      await readJsonResponse<{ provider: Pick<ProviderConfigItem, "id" | "configId" | "configured" | "keySource" | "keyPreview"> }>(response);
      await refreshOverview();
      setStatus("已删除平台模型服务。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function revealPlatformModelConfigApiKey(providerId: ModelConfigProviderId, configId: string) {
    const response = await getJson<ModelConfigKeyRevealResponse>(
      `${platformModelAdminEndpoint(providerId)}/key?configId=${encodeURIComponent(configId)}`
    );
    updatePlatformDraft(providerId, {
      keyPreview: response.keyPreview
    });
    return response.apiKey;
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
      onRevealPlatformModelConfigKey={revealPlatformModelConfigApiKey}
      editingPlatformProviderId={editingPlatformProviderId}
      platformTestStatus={platformTestStatus}
      onClosePlatformModelDialog={() => setEditingPlatformProviderId(undefined)}
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
            <p className="m-0 mt-1 text-xs font-semibold text-[var(--muted)]">项目方用户运营后台</p>
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
                placeholder="请输入项目方邮箱"
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
              进入后台
            </Button>
            <AdminStatus status={status} />
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
              />
            </Field>
            <Field label="验证码">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <Input
                  autoFocus
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  placeholder="6 位验证码"
                />
                <Button
                  variant="soft"
                  type="button"
                  className="min-w-[132px] px-3"
                  disabled={isBusy || !email.trim() || !password.trim() || authOtpCooldownSeconds > 0}
                  onClick={() => void onResendVerificationCode()}
                >
                  <RefreshCcw size={15} />
                  {authOtpCooldownSeconds > 0 ? `${authOtpCooldownSeconds} 秒` : "重发验证码"}
                </Button>
              </div>
            </Field>
            <Button variant="primary" type="submit" disabled={isBusy || !email.trim() || !otp.trim()}>
              <MailCheck size={15} />
              验证邮箱
            </Button>
            <button
              type="button"
              className="justify-self-center text-xs font-black text-[var(--accent)] hover:underline"
              onClick={() => setMode("entry")}
            >
              返回登录
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
  onClosePlatformModelDialog,
  onEditPlatformModelService,
  onLogout,
  onPlatformDraftChange,
  onPlatformPresetApply,
  onRevealPlatformModelConfigKey,
  onRefresh,
  onSavePlatformModelConfig,
  overview,
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
  onClearPlatformModelConfig: (providerId: ModelConfigProviderId, configId?: string) => Promise<void>;
  onRevealPlatformModelConfigKey: (providerId: ModelConfigProviderId, configId: string) => Promise<string>;
  onClosePlatformModelDialog: () => void;
  onRefresh: () => void;
  onSavePlatformModelConfig: (providerId: ModelConfigProviderId, event: FormEvent<HTMLFormElement>) => Promise<void>;
  overview?: AdminOverview;
  platformConfig: ProviderConfigLedger;
  platformDrafts: Record<ModelConfigProviderId, ModelConfigDraft>;
  platformTestStatus: Partial<Record<ModelConfigProviderId, ModelConfigTestStatus>>;
  status: string;
}) {
  const adminShellStatus = checkingSession ? "检查登录状态" : isBusy ? "刷新数据中" : "";
  const growthOption = useMemo(() => buildGrowthOption(overview), [overview]);
  const activityOption = useMemo(() => buildActivityOption(overview), [overview]);
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | undefined>();
  const [selectedUserDetail, setSelectedUserDetail] = useState<AdminUserDetail | undefined>();
  const [detailStatus, setDetailStatus] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const activeNavigationItem = adminNavigationItems.find((item) => item.id === activeSection) ?? adminNavigationItems[0];

  async function openUserDetail(user: AdminUserSummary) {
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

  function closeUserDetail() {
    setSelectedUser(undefined);
    setSelectedUserDetail(undefined);
    setDetailStatus("");
    setDetailLoading(false);
  }

  function renderAdminSection() {
    if (!overview) {
      return <AdminDashboardSkeleton checkingSession={checkingSession} />;
    }
    if (activeSection === "overview") {
      return (
        <section className="grid gap-4" aria-label="后台概览">
          <AdminMetricGrid overview={overview} />
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="bg-[var(--card)]">
              <CardHeader heading="注册趋势" icon={<BarChart3 size={16} />} right={<Badge>30 天</Badge>} />
              <AdminChart option={growthOption} empty={overview.growth.every((row) => row.registrations === 0)} />
            </Card>
            <Card className="bg-[var(--card)]">
              <CardHeader heading="活跃趋势" icon={<Activity size={16} />} right={<Badge>30 天</Badge>} />
              <AdminChart option={activityOption} empty={overview.activity.every((row) => row.events === 0)} />
            </Card>
          </div>
        </section>
      );
    }
    if (activeSection === "users") {
      return (
        <section className="grid gap-4" aria-label="用户管理">
          <div className="grid gap-3 sm:grid-cols-3">
            <AdminCompactMetric label="用户" value={overview.metrics.totalUsers} hint={`${overview.metrics.verifiedUsers} 已验证`} />
            <AdminCompactMetric label="工作区" value={overview.metrics.totalWorkspaces} hint="全站工作区" />
            <AdminCompactMetric label="视频任务" value={overview.metrics.totalVideoJobs} hint="用户生成记录" />
          </div>
          <AdminUsersTable users={overview.users} onSelectUser={(user) => void openUserDetail(user)} />
        </section>
      );
    }
    if (activeSection === "platform-models") {
      return (
        <section className="grid gap-4" aria-label="平台模型">
          <PlatformModelAdminPanel
            config={platformConfig}
            drafts={platformDrafts}
            editingProviderId={editingPlatformProviderId}
            isBusy={isBusy}
            testStatuses={platformTestStatus}
            onAdd={onAddPlatformModelService}
            onApplyPreset={onPlatformPresetApply}
            onClear={onClearPlatformModelConfig}
            onCloseDialog={onClosePlatformModelDialog}
            onDraftChange={onPlatformDraftChange}
            onEdit={onEditPlatformModelService}
            onRevealApiKey={onRevealPlatformModelConfigKey}
            onSave={onSavePlatformModelConfig}
          />
        </section>
      );
    }
    if (activeSection === "billing") {
      return (
        <AdminPlaceholderSection
          icon={<CreditCard size={18} />}
          title="充值账单"
          badge="待接入"
          items={["余额管理", "充值记录", "平台调用收费"]}
        />
      );
    }
    return (
      <AdminPlaceholderSection
        icon={<Settings2 size={18} />}
        title="系统"
        badge="待接入"
        items={["备份", "审计日志", "运行状态"]}
      />
    );
  }

  return (
    <main className="grid h-dvh grid-cols-[260px_minmax(0,1fr)] overflow-hidden bg-[var(--bg)] text-[var(--text)] max-[900px]:grid-cols-1 max-[900px]:grid-rows-[auto_minmax(0,1fr)]">
      <AdminSidebar
        activeSection={activeSection}
        email={email}
        onSectionChange={setActiveSection}
      />
      <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <header className="grid min-h-[72px] gap-3 border-b border-[var(--border)] bg-[var(--panel)]/96 px-4 py-3 backdrop-blur min-[760px]:grid-cols-[minmax(0,1fr)_auto] min-[760px]:items-center min-[1100px]:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-xl font-black leading-tight">{activeNavigationItem.label}</h1>
              <Badge tone="ok">Admin</Badge>
            </div>
            <p className="m-0 mt-1 truncate text-[12px] font-medium text-[var(--muted)]">{activeNavigationItem.description}</p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button onClick={onRefresh} disabled={isBusy}>
              <RefreshCcw className={isBusy ? "animate-spin" : undefined} size={14} />
              {adminShellStatus || "刷新"}
            </Button>
            <Button variant="ghost" onClick={onLogout} disabled={isBusy}>
              <LogOut size={14} />
              退出
            </Button>
          </div>
        </header>

        <div className="min-h-0 overflow-y-auto px-4 py-4 min-[1100px]:px-6">
          {status ? <AdminStatus status={status} /> : null}
          {renderAdminSection()}
        </div>
      </section>
      <AdminUserDetailDrawer
        detail={selectedUserDetail}
        fallbackUser={selectedUser}
        loading={detailLoading}
        status={detailStatus}
        onClose={closeUserDetail}
      />
    </main>
  );
}

function platformModelAdminEndpoint(providerId: ModelConfigProviderId): string {
  return platformModelAdminProviders.find((provider) => provider.providerId === providerId)?.endpoint
    ?? `/api/platform/model-configs/${providerId}`;
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
          <div className="truncate text-[16px] font-black leading-tight">项目方后台</div>
          <div className="mt-0.5 truncate text-[11px] font-semibold text-[var(--muted)]">{email ?? "admin"}</div>
        </div>
      </div>
      <nav className="min-h-0 overflow-y-auto px-3 py-3 max-[900px]:overflow-x-auto max-[900px]:overflow-y-hidden max-[900px]:px-4 max-[900px]:pt-0" aria-label="后台导航">
        <div className="grid gap-1.5 max-[900px]:flex max-[900px]:min-w-max">
          {adminNavigationItems.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeSection;
            return (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "grid min-h-[58px] grid-cols-[30px_minmax(0,1fr)] items-center gap-2 rounded-lg border px-2.5 text-left transition",
                  active
                    ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--field))] text-[var(--text)] shadow-[inset_3px_0_0_var(--accent)]"
                    : "border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--field)]",
                  "max-[900px]:min-w-[138px] max-[900px]:grid-cols-[22px_minmax(0,1fr)] max-[900px]:shadow-none"
                )}
                aria-current={active ? "page" : undefined}
                onClick={() => onSectionChange(item.id)}
              >
                <span className={cn("grid h-7 w-7 place-items-center rounded-[8px]", active ? "bg-[var(--accent)] text-white" : "bg-[var(--panel2)] text-[var(--accent)]")}>
                  <Icon size={15} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-black">{item.label}</span>
                  <span className="mt-0.5 block truncate text-[10px] font-semibold opacity-80">{item.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>
      <div className="border-t border-[var(--border)] px-4 py-3 text-[11px] font-semibold leading-5 text-[var(--muted)] max-[900px]:hidden">
        平台 Key 只在后台加密保存，普通用户只选择可用组合。
      </div>
    </aside>
  );
}

function PlatformModelAdminPanel({
  config,
  drafts,
  editingProviderId,
  isBusy,
  testStatuses,
  onAdd,
  onApplyPreset,
  onClear,
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
  onClear: (providerId: ModelConfigProviderId, configId?: string) => Promise<void>;
  onCloseDialog: () => void;
  onDraftChange: (providerId: ModelConfigProviderId, patch: Partial<ModelConfigDraft>) => void;
  onEdit: (providerId: ModelConfigProviderId, model: ProviderConfigItem, models: ProviderConfigItem[]) => void;
  onRevealApiKey: (providerId: ModelConfigProviderId, configId: string) => Promise<string>;
  onSave: (providerId: ModelConfigProviderId, event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const groups: ModelServiceGroup[] = platformModelAdminProviders.map((provider) => ({
    kind: provider.providerId === "openai-compatible-text" ? "text" : provider.providerId === "openai-compatible-image" ? "image" : "video",
    title: provider.title,
    description: provider.description,
    models: platformModelsForProvider(config, provider.providerId),
    providerId: provider.providerId,
    badge: provider.badge
  }));
  const editingGroup = groups.find((group) => group.providerId === editingProviderId);
  const configuredCount = groups.reduce((total, group) => total + group.models.filter((model) => model.configured).length, 0);
  return (
    <Card className="bg-[var(--card)]">
      <CardHeader
        heading="平台模型配置"
        icon={<KeyRound size={16} />}
        right={<Badge tone={configuredCount > 0 ? "ok" : "neutral"}>{configuredCount} 条平台服务</Badge>}
      />
      <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--panel2)] px-3 py-2 text-[12px] font-semibold leading-5 text-[var(--muted)]">
        平台 API Key 加密写入数据库；这里和用户自带 API 使用同一套模型服务配置，只是服务归属为平台托管。
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
            keyBadgeLabel="平台托管"
            addButtonLabel={(badge) => `添加${badge}服务`}
            emptyText="还没有配置平台服务，添加平台 API Key 后这里会显示已启用的模型服务。"
            canManageServices
            isBusy={isBusy}
            onAdd={() => onAdd(group.providerId)}
            onEdit={(model) => onEdit(group.providerId, model, group.models)}
            onClear={onClear}
          />
        ))}
      </div>
      {editingGroup ? (
        <SharedModelConfigDialog
          title={`添加${editingGroup.badge}服务`}
          badge={editingGroup.badge}
          providerId={editingGroup.providerId}
          draft={drafts[editingGroup.providerId]}
          testStatus={testStatuses[editingGroup.providerId]}
          presets={modelConfigPresets[editingGroup.providerId]}
          apiKeyLabel="平台 API Key"
          enableLabel="启用"
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

function AdminMetricGrid({ overview }: { overview: AdminOverview }) {
  const metrics = [
    { label: "总用户", value: overview.metrics.totalUsers, hint: `${overview.metrics.verifiedUsers} 已验证`, icon: Users },
    { label: "今日新增", value: overview.metrics.newUsersToday, hint: `7 天 ${overview.metrics.newUsers7d}`, icon: CheckCircle2 },
    { label: "7 天活跃", value: overview.metrics.activeUsers7d, hint: "登录 / 生成活动", icon: Activity },
    { label: "工作区", value: overview.metrics.totalWorkspaces, hint: "全站", icon: Database },
    { label: "商品", value: overview.metrics.totalProducts, hint: "用户资料库", icon: BarChart3 },
    { label: "视频任务", value: overview.metrics.totalVideoJobs, hint: "生成记录", icon: Video }
  ];
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-label="后台指标">
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

function AdminDashboardSkeleton({ checkingSession }: { checkingSession: boolean }) {
  const label = checkingSession ? "检查登录状态" : "刷新数据中";
  return (
    <section className="grid gap-4" aria-label={label}>
      <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-black text-[var(--muted)]">
        <RefreshCcw className="animate-spin text-[var(--accent)]" size={14} />
        {label}
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-label="后台指标占位">
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
        暂无数据
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

function AdminUsersTable({ onSelectUser, users }: { onSelectUser: (user: AdminUserSummary) => void; users: AdminUserSummary[] }) {
  return (
    <Card className="overflow-hidden bg-[var(--card)] p-0">
      <div className="border-b border-[var(--border)] p-4">
        <CardHeader className="m-0" heading="用户列表" icon={<Users size={16} />} right={<Badge>{users.length} 人</Badge>} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-separate border-spacing-0 text-left text-xs">
          <thead className="bg-[var(--panel2)] text-[var(--muted)]">
            <tr>
              <AdminTh>用户</AdminTh>
              <AdminTh>状态</AdminTh>
              <AdminTh>工作区</AdminTh>
              <AdminTh>商品</AdminTh>
              <AdminTh>视频任务</AdminTh>
              <AdminTh>注册时间</AdminTh>
              <AdminTh>最近活跃</AdminTh>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                tabIndex={0}
                className="cursor-pointer bg-[var(--card)] outline-none transition hover:bg-[var(--field2)] focus:bg-[var(--field2)] focus-visible:shadow-[inset_3px_0_0_var(--accent)]"
                onClick={() => onSelectUser(user)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectUser(user);
                  }
                }}
              >
                <AdminTd>
                  <div className="font-black text-[var(--text)]">{user.email}</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">{user.displayName || user.id}</div>
                </AdminTd>
                <AdminTd>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={user.role === "admin" ? "ok" : "neutral"}>{user.role === "admin" ? "管理员" : "用户"}</Badge>
                    <Badge tone={user.emailVerified ? "ok" : "warn"}>{user.emailVerified ? "已验证" : "未验证"}</Badge>
                  </div>
                </AdminTd>
                <AdminTd>{formatNumber(user.workspaceCount)}</AdminTd>
                <AdminTd>{formatNumber(user.productCount)}</AdminTd>
                <AdminTd>{formatNumber(user.videoJobCount)}</AdminTd>
                <AdminTd>{formatDateTime(user.createdAt)}</AdminTd>
                <AdminTd>{formatDateTime(user.lastActiveAt)}</AdminTd>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AdminUserDetailDrawer({
  detail,
  fallbackUser,
  loading,
  onClose,
  status
}: {
  detail?: AdminUserDetail;
  fallbackUser?: AdminUserSummary;
  loading: boolean;
  onClose: () => void;
  status: string;
}) {
  if (!fallbackUser) {
    return null;
  }
  const user = detail?.user ?? fallbackUser;
  const statusEntries = Object.entries(detail?.videoStatusCounts ?? {}).sort(([left], [right]) => left.localeCompare(right));
  return (
    <div className="fixed inset-0 z-50 grid bg-[rgba(42,33,27,.22)] min-[900px]:justify-items-end" role="dialog" aria-modal="true" aria-label="用户详情">
      <button className="absolute inset-0 cursor-default" type="button" aria-label="关闭用户详情" onClick={onClose} />
      <aside className="relative grid h-dvh w-full max-w-[760px] grid-rows-[auto_minmax(0,1fr)] border-l border-[var(--border)] bg-[var(--panel)] shadow-[0_30px_90px_rgba(42,33,27,.22)]">
        <header className="grid gap-3 border-b border-[var(--border)] bg-[var(--panel)] px-4 py-4 min-[720px]:grid-cols-[minmax(0,1fr)_auto] min-[720px]:items-start">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="m-0 min-w-0 truncate text-lg font-black">{user.email}</h2>
              <Badge tone={user.role === "admin" ? "ok" : "neutral"}>{user.role === "admin" ? "管理员" : "用户"}</Badge>
              <Badge tone={user.emailVerified ? "ok" : "warn"}>{user.emailVerified ? "已验证" : "未验证"}</Badge>
            </div>
            <p className="m-0 mt-1 text-[12px] font-semibold text-[var(--muted)]">注册 {formatDateTime(user.createdAt)} / 最近活跃 {formatDateTime(user.lastActiveAt)}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="关闭" onClick={onClose}>
            <X size={16} />
          </Button>
        </header>

        <div className="min-h-0 overflow-y-auto p-4">
          {loading ? (
            <div className="grid min-h-[280px] place-items-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--panel2)]">
              <div className="grid justify-items-center gap-2 text-xs font-black text-[var(--muted)]">
                <RefreshCcw className="animate-spin text-[var(--accent)]" size={24} />
                正在载入用户详情
              </div>
            </div>
          ) : null}

          {status ? <AdminStatus status={status} /> : null}

          {detail ? (
            <div className="grid gap-4">
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="用户详情指标">
                <DetailMetric icon={<Database size={16} />} label="工作区" value={detail.user.workspaceCount} />
                <DetailMetric icon={<Package size={16} />} label="商品" value={detail.user.productCount} />
                <DetailMetric icon={<Video size={16} />} label="视频任务" value={detail.user.videoJobCount} />
                <DetailMetric icon={<Clock3 size={16} />} label="最近会话" value={formatDateTime(detail.user.lastSessionAt)} />
              </section>

              <section className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="m-0 text-sm font-black">视频状态</h3>
                  <Badge>{statusEntries.length} 类</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {statusEntries.length > 0 ? statusEntries.map(([name, count]) => (
                    <Badge key={name} tone={adminJobStatusTone(name)}>{adminJobStatusLabel(name)} {formatNumber(count)}</Badge>
                  )) : <span className="text-xs font-semibold text-[var(--muted)]">暂无视频任务</span>}
                </div>
              </section>

              <section className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="m-0 text-sm font-black">工作区</h3>
                  <Badge>{detail.workspaces.length} 个</Badge>
                </div>
                <div className="grid gap-2">
                  {detail.workspaces.map((workspace) => (
                    <div key={workspace.id} className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--field)] p-3 text-xs min-[720px]:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="min-w-0">
                        <div className="truncate font-black">{workspace.name}</div>
                        <div className="mt-1 truncate font-semibold text-[var(--muted)]">owner: {workspace.ownerEmail ?? "-"} / role: {workspace.role}</div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 min-[720px]:justify-end">
                        <Badge>{workspace.memberCount} 成员</Badge>
                        <Badge>{workspace.productCount} 商品</Badge>
                        <Badge>{workspace.videoJobCount} 任务</Badge>
                        <Badge tone="ok">{workspace.completedJobCount} 完成</Badge>
                        <Badge tone={workspace.failedJobCount > 0 ? "danger" : "neutral"}>{workspace.failedJobCount} 失败</Badge>
                      </div>
                    </div>
                  ))}
                  {detail.workspaces.length === 0 ? <EmptyAdminDetail text="暂无工作区" /> : null}
                </div>
              </section>

              <section className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="m-0 text-sm font-black">最近视频任务</h3>
                  <Badge>{detail.videoJobs.length}/50</Badge>
                </div>
                <div className="grid gap-2">
                  {detail.videoJobs.map((job) => (
                    <AdminVideoJobCard key={job.id} job={job} />
                  ))}
                  {detail.videoJobs.length === 0 ? <EmptyAdminDetail text="暂无视频任务" /> : null}
                </div>
              </section>

              <section className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="m-0 text-sm font-black">最近商品</h3>
                  <Badge>{detail.products.length}/50</Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {detail.products.map((product) => (
                    <div key={product.id} className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--field)] p-3 text-xs">
                      <div className="truncate font-black">{product.sku}</div>
                      <div className="mt-1 truncate font-semibold text-[var(--muted)]">{product.title ?? "-"}</div>
                      <div className="mt-1 text-[11px] font-semibold text-[var(--muted)]">更新 {formatDateTime(product.updatedAt)}</div>
                    </div>
                  ))}
                  {detail.products.length === 0 ? <EmptyAdminDetail text="暂无商品" /> : null}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
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
          创建 {formatDateTime(job.createdAt)} / 完成 {formatDateTime(job.completedAt)}
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
        {formatNumber(job.outputCount)} 输出
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
            <h1 className="m-0 text-xl font-black">没有后台权限</h1>
            <p className="m-0 mt-2 text-xs font-semibold leading-5 text-[var(--muted)]">{email ?? "当前账号"} 不是项目方管理员。</p>
          </div>
          <div className="flex justify-center gap-2">
            <Button asChild>
              <a href="/console">返回控制台</a>
            </Button>
            <Button variant="ghost" disabled={isBusy} onClick={onLogout}>
              <LogOut size={14} />
              退出
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
      name: "注册",
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
        name: "活跃用户",
        type: "line",
        smooth: true,
        data: rows.map((row) => row.activeUsers)
      },
      {
        name: "事件",
        type: "bar",
        barMaxWidth: 16,
        data: rows.map((row) => row.events),
        itemStyle: { borderRadius: [4, 4, 0, 0] }
      }
    ]
  };
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

async function putJson<T = unknown>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return readJsonResponse<T>(response);
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) {
    throw new HttpError(body.error || `HTTP ${response.status}`, response.status);
  }
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

function formatDuration(value?: number) {
  return value === undefined ? "-" : `${value}s`;
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
  return ({
    canceled: "已取消",
    completed: "已完成",
    expired: "已过期",
    failed: "失败",
    queued: "排队中",
    running: "生成中",
    unknown: "未知"
  } as Record<string, string>)[status] ?? status;
}
