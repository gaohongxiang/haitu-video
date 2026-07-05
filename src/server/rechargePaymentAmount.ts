import { centsToCny, cnyToCents } from "./walletLedger.js";
import { normalizeCurrency } from "./walletRechargeOrderStore.js";

export interface RechargeFxRateSnapshot {
  from: "cny";
  to: string;
  rate: number;
  source?: "identity" | "frankfurter" | "env";
  sourceLabel?: string;
  sourceUrl?: string;
  asOfDate?: string;
  fetchedAt?: string;
}

export interface RechargePaymentAmount {
  walletCurrency: "cny";
  creditCny: number;
  creditCents: number;
  paymentCurrency: string;
  paymentAmount: number;
  paymentAmountCents: number;
  fxRateSnapshot: RechargeFxRateSnapshot;
}

export function resolveRechargePaymentAmount(input: {
  creditCny: number;
  paymentCurrency: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): RechargePaymentAmount {
  return buildRechargePaymentAmount({
    creditCny: input.creditCny,
    fxRateSnapshot: rechargeCurrencyRateFromCny(input.paymentCurrency, input.env ?? process.env)
  });
}

export async function quoteRechargePaymentAmount(input: {
  creditCny: number;
  paymentCurrency: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}): Promise<RechargePaymentAmount> {
  return buildRechargePaymentAmount({
    creditCny: input.creditCny,
    fxRateSnapshot: await rechargeCurrencyRateFromCnyLive({
      paymentCurrency: input.paymentCurrency,
      env: input.env ?? process.env,
      fetchImpl: input.fetchImpl ?? fetch,
      now: input.now ?? (() => new Date())
    })
  });
}

function buildRechargePaymentAmount(input: {
  creditCny: number;
  fxRateSnapshot: RechargeFxRateSnapshot;
}): RechargePaymentAmount {
  const creditCents = cnyToCents(Number(input.creditCny));
  if (!Number.isFinite(creditCents) || creditCents <= 0) {
    throw new Error("充值金额必须大于 0。");
  }
  const paymentCurrency = normalizeCurrency(input.fxRateSnapshot.to);
  const rate = input.fxRateSnapshot.rate;
  const paymentAmountCents = Math.round(creditCents * rate);
  if (!Number.isFinite(paymentAmountCents) || paymentAmountCents <= 0) {
    throw new Error("充值支付金额配置无效。");
  }
  return {
    walletCurrency: "cny",
    creditCny: centsToCny(creditCents),
    creditCents,
    paymentCurrency,
    paymentAmount: centsToCny(paymentAmountCents),
    paymentAmountCents,
    fxRateSnapshot: input.fxRateSnapshot
  };
}

function rechargeCurrencyRateFromCny(
  paymentCurrency: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>
): RechargeFxRateSnapshot {
  const currency = normalizeCurrency(paymentCurrency);
  if (currency === "cny") {
    return {
      from: "cny",
      to: "cny",
      rate: 1,
      source: "identity"
    };
  }
  const envRate = rechargeCurrencyRateFromEnv(currency, env);
  if (envRate === undefined) {
    throw new Error(`请配置 ${rechargeCurrencyRateEnvKey(currency)}，用于把人民币充值金额换算成 ${currency.toUpperCase()} 支付金额。`);
  }
  return envRate;
}

async function rechargeCurrencyRateFromCnyLive(input: {
  paymentCurrency: string;
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  fetchImpl: typeof fetch;
  now: () => Date;
}): Promise<RechargeFxRateSnapshot> {
  const paymentCurrency = normalizeCurrency(input.paymentCurrency);
  if (paymentCurrency === "cny") {
    return {
      from: "cny",
      to: "cny",
      rate: 1,
      source: "identity",
      fetchedAt: input.now().toISOString()
    };
  }
  const provider = normalizeFxProvider(input.env.HAITU_RECHARGE_FX_RATE_PROVIDER);
  if (provider === "frankfurter") {
    try {
      return await fetchFrankfurterCnyRate({
        paymentCurrency,
        env: input.env,
        fetchImpl: input.fetchImpl,
        now: input.now
      });
    } catch (error) {
      const fallback = rechargeCurrencyRateFromEnv(paymentCurrency, input.env, input.now);
      if (fallback) {
        return fallback;
      }
      throw new Error(`无法获取 CNY 到 ${paymentCurrency.toUpperCase()} 的实时汇率。请稍后重试，或配置 ${rechargeCurrencyRateEnvKey(paymentCurrency)} 作为兜底。`);
    }
  }
  const envRate = rechargeCurrencyRateFromEnv(paymentCurrency, input.env, input.now);
  if (!envRate) {
    throw new Error(`请配置 ${rechargeCurrencyRateEnvKey(paymentCurrency)}，用于把人民币充值金额换算成 ${paymentCurrency.toUpperCase()} 支付金额。`);
  }
  return envRate;
}

function normalizeFxProvider(value: unknown): "frankfurter" | "env" {
  return String(value ?? "frankfurter").trim().toLowerCase() === "env" ? "env" : "frankfurter";
}

function rechargeCurrencyRateFromEnv(
  paymentCurrency: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  now?: () => Date
): RechargeFxRateSnapshot | undefined {
  const envKey = rechargeCurrencyRateEnvKey(paymentCurrency);
  const rate = Number(env[envKey]);
  if (!Number.isFinite(rate) || rate <= 0) {
    return undefined;
  }
  return {
    from: "cny",
    to: paymentCurrency,
    rate,
    source: "env",
    sourceLabel: envKey,
    fetchedAt: now?.().toISOString()
  };
}

async function fetchFrankfurterCnyRate(input: {
  paymentCurrency: string;
  env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  fetchImpl: typeof fetch;
  now: () => Date;
}): Promise<RechargeFxRateSnapshot> {
  const baseUrl = String(input.env.HAITU_RECHARGE_FX_RATE_URL ?? "https://api.frankfurter.dev/v2/rates").trim();
  const url = new URL(baseUrl);
  url.searchParams.set("base", "CNY");
  url.searchParams.set("quotes", input.paymentCurrency.toUpperCase());
  const response = await input.fetchImpl(url.toString());
  const body = await response.json().catch(() => undefined) as unknown;
  if (!response.ok) {
    throw new Error("Frankfurter 汇率接口请求失败。");
  }
  const normalized = normalizeFrankfurterRateResponse(body, input.paymentCurrency);
  if (!normalized) {
    throw new Error("Frankfurter 未返回可用汇率。");
  }
  return {
    from: "cny",
    to: input.paymentCurrency,
    rate: normalized.rate,
    source: "frankfurter",
    sourceLabel: "Frankfurter",
    sourceUrl: url.toString(),
    asOfDate: normalized.date,
    fetchedAt: input.now().toISOString()
  };
}

function normalizeFrankfurterRateResponse(body: unknown, paymentCurrency: string): { date?: string; rate: number } | undefined {
  const upperCurrency = paymentCurrency.toUpperCase();
  if (Array.isArray(body)) {
    const item = body.find((entry) => (
      entry && typeof entry === "object" && String((entry as Record<string, unknown>).quote).toUpperCase() === upperCurrency
    )) as Record<string, unknown> | undefined;
    const rate = Number(item?.rate);
    return Number.isFinite(rate) && rate > 0 ? { date: stringValue(item?.date), rate } : undefined;
  }
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const rates = record.rates && typeof record.rates === "object" ? record.rates as Record<string, unknown> : undefined;
    const rate = Number(rates?.[upperCurrency] ?? record.rate);
    return Number.isFinite(rate) && rate > 0 ? { date: stringValue(record.date), rate } : undefined;
  }
  return undefined;
}

function rechargeCurrencyRateEnvKey(paymentCurrency: string): string {
  return `HAITU_RECHARGE_${paymentCurrency.toUpperCase()}_PER_CNY`;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
