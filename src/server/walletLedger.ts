import type {
  WalletTransaction,
  WalletTransactionType
} from "./walletStore.js";

export interface WalletLedgerReservationRow {
  type: WalletTransactionType;
  amount_cents: number;
}

export interface WalletLedgerTransactionRow {
  id: string;
  workspace_id: string;
  type: WalletTransactionType;
  amount_cents: number;
  balance_after_cents: number;
  reserved_after_cents: number;
  reservation_id: string | null;
  job_id: string | null;
  description: string | null;
  metadata_json: string | null;
  created_at: string;
}

export function centsToCny(cents: number): number {
  return Math.round(cents) / 100;
}

export function cnyToCents(amountCny: number): number {
  return Math.round(amountCny * 100);
}

export function positiveCents(amountCny: unknown): number {
  const cents = cnyToCents(Number(amountCny));
  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error("充值或扣费金额必须大于 0。");
  }
  return cents;
}

export function reservedCentsFromTransactions(rows: WalletLedgerReservationRow[]): number {
  return rows.reduce((total, row) => {
    if (row.type === "reserve") {
      return total + Math.abs(row.amount_cents);
    }
    if (row.type === "charge" || row.type === "refund") {
      return Math.max(0, total - Math.abs(row.amount_cents));
    }
    return total;
  }, 0);
}

export function walletTransactionFromRow(row: WalletLedgerTransactionRow): WalletTransaction {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    type: row.type,
    amountCny: centsToCny(row.amount_cents),
    balanceAfterCny: centsToCny(row.balance_after_cents),
    reservedAfterCny: centsToCny(row.reserved_after_cents),
    reservationId: row.reservation_id ?? undefined,
    jobId: row.job_id ?? undefined,
    description: row.description ?? undefined,
    metadata: parseMetadata(row.metadata_json),
    createdAt: row.created_at
  };
}

function parseMetadata(value: string | null): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}
