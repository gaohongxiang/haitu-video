import type { AppLocale } from "../i18n/config.js";
import { appText } from "../i18n/appText.js";

export type WalletDisplayTransactionType = "recharge" | "reserve" | "charge" | "refund" | "adjustment" | "bonus";

export interface WalletDisplayTransaction {
  id: string;
  type: WalletDisplayTransactionType;
  amountCny: number;
  balanceAfterCny: number;
  reservedAfterCny: number;
  reservationId?: string;
  jobId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface WalletTransactionBillingBreakdown {
  totalCny: number;
  platformFeeCny: number;
  upstreamCostCny: number;
  apiBillingMode?: "platform" | "byok";
}

export function walletTransactionDescriptionLabel(description?: string, locale?: AppLocale): string {
  const normalized = description?.trim();
  if (!normalized) {
    return "-";
  }
  if (normalized === "Infini 数字货币充值到账") {
    return appText("wallet.transactionDescriptions.infiniCryptoSettled", locale);
  }
  if (normalized === "数字货币充值到账") {
    return appText("wallet.transactionDescriptions.cryptoSettled", locale);
  }
  if (normalized === "Stripe 充值到账") {
    return appText("wallet.transactionDescriptions.stripeSettled", locale);
  }
  if (normalized === "充值到账") {
    return appText("wallet.transactionDescriptions.settled", locale);
  }
  return normalized;
}

export function walletTransactionBillingBreakdown(
  transaction: Pick<WalletDisplayTransaction, "amountCny" | "metadata">
): WalletTransactionBillingBreakdown | undefined {
  const metadata = transaction.metadata ?? {};
  const platformFeeCny = optionalMoney(metadata.platformFeeCny);
  const upstreamCostCny = optionalMoney(metadata.upstreamActualCostCny ?? metadata.upstreamCostCny ?? metadata.upstreamEstimatedCostCny);
  if (platformFeeCny === undefined && upstreamCostCny === undefined) {
    return undefined;
  }
  return {
    totalCny: roundMoney(Math.abs(transaction.amountCny)),
    platformFeeCny: platformFeeCny ?? 0,
    upstreamCostCny: upstreamCostCny ?? 0,
    apiBillingMode: metadata.apiBillingMode === "platform" || metadata.apiBillingMode === "byok" ? metadata.apiBillingMode : undefined
  };
}

export function walletVisibleConsumptionTransactions<T extends WalletDisplayTransaction>(transactions: T[]): T[] {
  const standalone: T[] = [];
  const reservationGroups = new Map<string, T[]>();
  for (const transaction of transactions) {
    if (!walletTransactionIsConsumptionRecord(transaction)) {
      continue;
    }
    if (transaction.reservationId && (
      transaction.type === "reserve" ||
      transaction.type === "charge" ||
      transaction.type === "refund"
    )) {
      const group = reservationGroups.get(transaction.reservationId) ?? [];
      group.push(transaction);
      reservationGroups.set(transaction.reservationId, group);
      continue;
    }
    standalone.push(transaction);
  }
  return [...standalone, ...Array.from(reservationGroups.values()).map(walletVisibleReservationTransaction)]
    .sort((left, right) => timestampMs(right.createdAt) - timestampMs(left.createdAt));
}

export function walletTransactionIsConsumptionRecord(transaction: Pick<WalletDisplayTransaction, "type">): boolean {
  return transaction.type === "reserve" || transaction.type === "charge" || transaction.type === "refund" || transaction.type === "adjustment";
}

function walletVisibleReservationTransaction<T extends WalletDisplayTransaction>(transactions: T[]): T {
  const sorted = [...transactions].sort((left, right) => timestampMs(left.createdAt) - timestampMs(right.createdAt));
  return sorted.find((transaction) => transaction.type === "charge")
    ?? findLastTransaction(sorted, "refund")
    ?? findLastTransaction(sorted, "reserve")
    ?? sorted[sorted.length - 1] as T;
}

function findLastTransaction<T extends WalletDisplayTransaction>(transactions: T[], type: WalletDisplayTransactionType): T | undefined {
  for (let index = transactions.length - 1; index >= 0; index -= 1) {
    if (transactions[index]?.type === type) {
      return transactions[index];
    }
  }
  return undefined;
}

function timestampMs(value: string): number {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function optionalMoney(value: unknown): number | undefined {
  const amount = Number(value);
  return Number.isFinite(amount) ? roundMoney(amount) : undefined;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
