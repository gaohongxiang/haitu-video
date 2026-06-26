import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { ScriptTemplate } from "../core/scriptGenerator.js";
import { defaultFinalVideoLanguage, normalizeFinalVideoLanguage, type FinalVideoLanguage } from "../core/videoLanguage.js";
import { normalizeEnabledTemplates } from "../core/templateCatalog.js";
import type { VideoProviderName } from "../providers/providerFactory.js";

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

export class FileConsoleSettingsStore {
  constructor(private readonly path: string) {}

  async read(): Promise<ConsoleSettings> {
    try {
      return normalizeConsoleSettings(JSON.parse(await readFile(this.path, "utf8")));
    } catch (error) {
      if (isMissingFileError(error)) {
        return defaultConsoleSettings;
      }
      throw error;
    }
  }

  async write(input: unknown): Promise<ConsoleSettings> {
    const settings = normalizeConsoleSettings({
      ...(await this.read()),
      ...(isPlainObject(input) ? input : {})
    });
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(settings, null, 2), "utf8");
    return settings;
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

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
