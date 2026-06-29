import { centsToCny, cnyToCents } from "./walletLedger.js";
import { normalizeCurrency } from "./walletRechargeOrderStore.js";

export interface RechargeFxRateSnapshot {
  from: "cny";
  to: string;
  rate: number;
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
  const creditCents = cnyToCents(Number(input.creditCny));
  if (!Number.isFinite(creditCents) || creditCents <= 0) {
    throw new Error("充值金额必须大于 0。");
  }
  const paymentCurrency = normalizeCurrency(input.paymentCurrency);
  const rate = rechargeCurrencyRateFromCny(paymentCurrency, input.env ?? process.env);
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
    fxRateSnapshot: {
      from: "cny",
      to: paymentCurrency,
      rate
    }
  };
}

function rechargeCurrencyRateFromCny(
  paymentCurrency: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>
): number {
  if (paymentCurrency === "cny") {
    return 1;
  }
  const envKey = `HAITU_RECHARGE_${paymentCurrency.toUpperCase()}_PER_CNY`;
  const rate = Number(env[envKey]);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`请配置 ${envKey}，用于把人民币充值金额换算成 ${paymentCurrency.toUpperCase()} 支付金额。`);
  }
  return rate;
}
