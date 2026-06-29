import type { ScriptTemplate } from "../core/scriptGenerator.js";
import { defaultFinalVideoLanguage, normalizeFinalVideoLanguage, type FinalVideoLanguage } from "../core/videoLanguage.js";
import { normalizeEnabledTemplates } from "../core/templateCatalog.js";
import type { VideoProviderName } from "../providers/providerFactory.js";
import type { DatabaseHandle } from "./db/client.js";
import { centsToCny, cnyToCents } from "./walletLedger.js";

export interface ConsoleSettings {
  defaultLanguage: FinalVideoLanguage;
  defaultDurationSeconds: number;
  defaultTemplate: ScriptTemplate;
  enabledTemplates: ScriptTemplate[];
  defaultCta: string;
  defaultProvider: VideoProviderName;
  maxEstimatedCostCnyPerVideo: number;
  testCreditBalanceCny: number;
  forbiddenWords: string[];
  exaggerationRules: string[];
  paymentMethods: PaymentMethodSettings[];
}

export type PaymentMethodId = "stripe" | "infini";
export type PaymentMethodKind = "rmb" | "crypto";

export interface PaymentMethodSettings {
  id: PaymentMethodId;
  label: string;
  kind: PaymentMethodKind;
  enabled: boolean;
  description: string;
}

export const defaultPaymentMethods: PaymentMethodSettings[] = [
  {
    id: "stripe",
    label: "Stripe",
    kind: "rmb",
    enabled: true,
    description: "支持银行卡、支付宝、微信支付等 Stripe Checkout 可用方式。"
  },
  {
    id: "infini",
    label: "Infini",
    kind: "crypto",
    enabled: true,
    description: "通过 Infini Checkout 支持 USDT、USDC 等稳定币及多条主流网络。"
  }
];

export const defaultConsoleSettings: ConsoleSettings = {
  defaultLanguage: defaultFinalVideoLanguage,
  defaultDurationSeconds: 10,
  defaultTemplate: "scene",
  enabledTemplates: ["scene", "pain-point", "benefit", "ugc", "unboxing"],
  defaultCta: "今すぐチェック",
  defaultProvider: "volcengine-seedance",
  maxEstimatedCostCnyPerVideo: 5,
  testCreditBalanceCny: 0,
  forbiddenWords: ["日本で大人気", "ランキング1位", "完全防水", "医療用"],
  exaggerationRules: [
    "商品资料未确认的销量、排名、功效、耐荷重、防水、UV 数值不得出现在脚本和字幕里。"
  ],
  paymentMethods: defaultPaymentMethods
};

export interface ConsoleSettingsStore {
  read(): Promise<ConsoleSettings>;
  write(input: unknown): Promise<ConsoleSettings>;
}

interface ConsoleSettingsRow {
  id: string;
  default_language: string;
  default_duration_seconds: number;
  default_template: string;
  enabled_templates_json: string;
  default_cta: string;
  default_provider: string;
  max_estimated_cost_cents_per_video: number;
  test_credit_balance_cents: number;
  forbidden_words_json: string;
  exaggeration_rules_json: string;
  payment_methods_json: string;
  created_at: string;
  updated_at: string;
}

const consoleSettingsId = "global";

export class SqliteConsoleSettingsStore implements ConsoleSettingsStore {
  constructor(
    private readonly input: {
      handle: DatabaseHandle;
      now?: () => Date;
    }
  ) {}

  async read(): Promise<ConsoleSettings> {
    this.ensureDefaults();
    const row = this.findSettings();
    if (!row) {
      throw new Error("系统设置初始化失败。");
    }
    return consoleSettingsFromRow(row);
  }

  initialize(): void {
    this.ensureDefaults();
  }

  async write(input: unknown): Promise<ConsoleSettings> {
    const settings = normalizeConsoleSettings({
      ...(await this.read()),
      ...(isPlainObject(input) ? input : {})
    });
    const now = this.nowIso();
    this.input.handle.sqlite.prepare(`
      UPDATE console_settings
      SET
        default_language = @defaultLanguage,
        default_duration_seconds = @defaultDurationSeconds,
        default_template = @defaultTemplate,
        enabled_templates_json = @enabledTemplatesJson,
        default_cta = @defaultCta,
        default_provider = @defaultProvider,
        max_estimated_cost_cents_per_video = @maxEstimatedCostCentsPerVideo,
        test_credit_balance_cents = @testCreditBalanceCents,
        forbidden_words_json = @forbiddenWordsJson,
        exaggeration_rules_json = @exaggerationRulesJson,
        payment_methods_json = @paymentMethodsJson,
        updated_at = @updatedAt
      WHERE id = @id
    `).run({
      ...settingsToSqlParams(settings),
      id: consoleSettingsId,
      updatedAt: now
    });
    return settings;
  }

  private ensureDefaults(): void {
    const now = this.nowIso();
    this.input.handle.sqlite.prepare(`
      INSERT INTO console_settings (
        id,
        default_language,
        default_duration_seconds,
        default_template,
        enabled_templates_json,
        default_cta,
        default_provider,
        max_estimated_cost_cents_per_video,
        test_credit_balance_cents,
        forbidden_words_json,
        exaggeration_rules_json,
        payment_methods_json,
        created_at,
        updated_at
      ) VALUES (
        @id,
        @defaultLanguage,
        @defaultDurationSeconds,
        @defaultTemplate,
        @enabledTemplatesJson,
        @defaultCta,
        @defaultProvider,
        @maxEstimatedCostCentsPerVideo,
        @testCreditBalanceCents,
        @forbiddenWordsJson,
        @exaggerationRulesJson,
        @paymentMethodsJson,
        @now,
        @now
      )
      ON CONFLICT(id) DO NOTHING
    `).run({
      ...settingsToSqlParams(defaultConsoleSettings),
      id: consoleSettingsId,
      now
    });
  }

  private findSettings(): ConsoleSettingsRow | undefined {
    return this.input.handle.sqlite.prepare(`
      SELECT *
      FROM console_settings
      WHERE id = ?
      LIMIT 1
    `).get(consoleSettingsId) as ConsoleSettingsRow | undefined;
  }

  private nowIso(): string {
    return (this.input.now ?? (() => new Date()))().toISOString();
  }
}

export class MemoryConsoleSettingsStore implements ConsoleSettingsStore {
  private settings = defaultConsoleSettings;

  async read(): Promise<ConsoleSettings> {
    return this.settings;
  }

  async write(input: unknown): Promise<ConsoleSettings> {
    this.settings = normalizeConsoleSettings({
      ...this.settings,
      ...(isPlainObject(input) ? input : {})
    });
    return this.settings;
  }
}

export function normalizeConsoleSettings(value: unknown): ConsoleSettings {
  const raw = isPlainObject(value) ? value : {};
  const enabledTemplates = normalizeEnabledTemplates(raw.enabledTemplates);
  const defaultTemplate = normalizeTemplate(raw.defaultTemplate);
  return {
    defaultLanguage: normalizeFinalVideoLanguage(raw.defaultLanguage),
    defaultDurationSeconds: normalizeDuration(raw.defaultDurationSeconds),
    defaultTemplate: enabledTemplates.includes(defaultTemplate) ? defaultTemplate : enabledTemplates[0],
    enabledTemplates,
    defaultCta: normalizeText(raw.defaultCta, defaultConsoleSettings.defaultCta),
    defaultProvider: normalizeProvider(raw.defaultProvider),
    maxEstimatedCostCnyPerVideo: normalizeBudgetCap(raw.maxEstimatedCostCnyPerVideo),
    testCreditBalanceCny: normalizeTestCreditBalance(raw.testCreditBalanceCny),
    forbiddenWords: normalizeStringList(raw.forbiddenWords, defaultConsoleSettings.forbiddenWords),
    exaggerationRules: normalizeStringList(raw.exaggerationRules, defaultConsoleSettings.exaggerationRules),
    paymentMethods: normalizePaymentMethods(raw.paymentMethods)
  };
}

function normalizePaymentMethods(value: unknown): PaymentMethodSettings[] {
  const rawItems = Array.isArray(value)
    ? value.filter(isPlainObject)
    : [];
  return defaultPaymentMethods.map((fallback) => {
    const raw = rawItems.find((item) => item.id === fallback.id);
    return {
      ...fallback,
      label: normalizeText(raw?.label, fallback.label),
      description: normalizeText(raw?.description, fallback.description),
      enabled: typeof raw?.enabled === "boolean" ? raw.enabled : fallback.enabled
    };
  });
}

function normalizeTestCreditBalance(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000) {
    return defaultConsoleSettings.testCreditBalanceCny;
  }
  return Math.round(amount * 100) / 100;
}

function normalizeBudgetCap(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0.1 || amount > 500) {
    return defaultConsoleSettings.maxEstimatedCostCnyPerVideo;
  }
  return Math.round(amount * 100) / 100;
}

function normalizeDuration(value: unknown): number {
  const duration = Number(value);
  if (!Number.isInteger(duration) || duration < 4 || duration > 15) {
    return defaultConsoleSettings.defaultDurationSeconds;
  }
  return duration;
}

function normalizeTemplate(value: unknown): ScriptTemplate {
  return ["pain-point", "scene", "unboxing", "benefit", "ugc"].includes(String(value))
    ? (value as ScriptTemplate)
    : defaultConsoleSettings.defaultTemplate;
}

function normalizeProvider(value: unknown): VideoProviderName {
  return ["mock", "volcengine-seedance"].includes(String(value))
    ? (value as VideoProviderName)
    : defaultConsoleSettings.defaultProvider;
}

function normalizeText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeStringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? Array.from(new Set(items)) : fallback;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function settingsToSqlParams(settings: ConsoleSettings) {
  return {
    defaultLanguage: settings.defaultLanguage,
    defaultDurationSeconds: settings.defaultDurationSeconds,
    defaultTemplate: settings.defaultTemplate,
    enabledTemplatesJson: JSON.stringify(settings.enabledTemplates),
    defaultCta: settings.defaultCta,
    defaultProvider: settings.defaultProvider,
    maxEstimatedCostCentsPerVideo: cnyToCents(settings.maxEstimatedCostCnyPerVideo),
    testCreditBalanceCents: cnyToCents(settings.testCreditBalanceCny),
    forbiddenWordsJson: JSON.stringify(settings.forbiddenWords),
    exaggerationRulesJson: JSON.stringify(settings.exaggerationRules),
    paymentMethodsJson: JSON.stringify(settings.paymentMethods)
  };
}

function consoleSettingsFromRow(row: ConsoleSettingsRow): ConsoleSettings {
  return normalizeConsoleSettings({
    defaultLanguage: row.default_language,
    defaultDurationSeconds: row.default_duration_seconds,
    defaultTemplate: row.default_template,
    enabledTemplates: parseJsonList(row.enabled_templates_json),
    defaultCta: row.default_cta,
    defaultProvider: row.default_provider,
    maxEstimatedCostCnyPerVideo: centsToCny(row.max_estimated_cost_cents_per_video),
    testCreditBalanceCny: centsToCny(row.test_credit_balance_cents),
    forbiddenWords: parseJsonList(row.forbidden_words_json),
    exaggerationRules: parseJsonList(row.exaggeration_rules_json),
    paymentMethods: parseJsonList(row.payment_methods_json)
  });
}

function parseJsonList(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
