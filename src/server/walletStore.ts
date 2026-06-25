import { randomUUID } from "node:crypto";

import type { DatabaseHandle } from "./db/client.js";

export type WalletTransactionType = "recharge" | "reserve" | "charge" | "refund" | "adjustment" | "bonus";

export interface WalletTransaction {
  id: string;
  workspaceId: string;
  type: WalletTransactionType;
  amountCny: number;
  balanceAfterCny: number;
  reservedAfterCny: number;
  reservationId?: string;
  jobId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface WalletSummary {
  workspaceId: string;
  balanceCny: number;
  reservedCny: number;
  availableCny: number;
  transactions: WalletTransaction[];
}

interface WalletRow {
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

export class InsufficientWalletBalanceError extends Error {
  constructor() {
    super("余额不足，请先充值后再生成视频。");
  }
}

export class WalletStore {
  constructor(
    private readonly input: {
      handle: DatabaseHandle;
      workspaceId: string;
      now?: () => Date;
    }
  ) {}

  getSummary(limit = 50): WalletSummary {
    const state = this.currentState();
    const rows = this.input.handle.sqlite.prepare(`
      SELECT *
      FROM wallet_transactions
      WHERE workspace_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT ?
    `).all(this.input.workspaceId, limit) as WalletRow[];
    return {
      workspaceId: this.input.workspaceId,
      balanceCny: centsToCny(state.balanceCents),
      reservedCny: centsToCny(state.reservedCents),
      availableCny: centsToCny(state.balanceCents - state.reservedCents),
      transactions: rows.map(walletTransactionFromRow)
    };
  }

  topUp(input: {
    amountCny: number;
    description?: string;
    metadata?: Record<string, unknown>;
  }): WalletSummary {
    const amountCents = positiveCents(input.amountCny);
    this.appendTransaction({
      type: "recharge",
      amountCents,
      description: input.description ?? "充值",
      metadata: input.metadata
    });
    return this.getSummary();
  }

  reserve(input: {
    amountCny: number;
    reservationId?: string;
    jobId?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): { reservationId: string; wallet: WalletSummary } {
    const amountCents = positiveCents(input.amountCny);
    const state = this.currentState();
    if (state.balanceCents - state.reservedCents < amountCents) {
      throw new InsufficientWalletBalanceError();
    }
    const reservationId = input.reservationId ?? `wallet-reservation-${randomUUID()}`;
    this.appendTransaction({
      type: "reserve",
      amountCents: -amountCents,
      balanceAfterCents: state.balanceCents,
      reservedAfterCents: state.reservedCents + amountCents,
      reservationId,
      jobId: input.jobId,
      description: input.description ?? "生成任务冻结",
      metadata: input.metadata
    });
    return {
      reservationId,
      wallet: this.getSummary()
    };
  }

  capture(input: {
    reservationId: string;
    amountCny: number;
    jobId?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): WalletSummary {
    const chargeCents = positiveCents(input.amountCny);
    const reservedCents = this.reservedCentsForReservation(input.reservationId);
    if (reservedCents <= 0) {
      return this.getSummary();
    }
    const state = this.currentState();
    const capturedCents = Math.min(chargeCents, reservedCents);
    this.appendTransaction({
      type: "charge",
      amountCents: -capturedCents,
      balanceAfterCents: state.balanceCents - capturedCents,
      reservedAfterCents: Math.max(0, state.reservedCents - reservedCents),
      reservationId: input.reservationId,
      jobId: input.jobId,
      description: input.description ?? "生成任务扣费",
      metadata: input.metadata
    });
    const refundCents = Math.max(0, reservedCents - capturedCents);
    if (refundCents > 0) {
      const afterCharge = this.currentState();
      this.appendTransaction({
        type: "refund",
        amountCents: refundCents,
        balanceAfterCents: afterCharge.balanceCents,
        reservedAfterCents: afterCharge.reservedCents,
        reservationId: input.reservationId,
        jobId: input.jobId,
        description: "释放未使用冻结金额",
        metadata: input.metadata
      });
    }
    return this.getSummary();
  }

  release(input: {
    reservationId: string;
    jobId?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): WalletSummary {
    const reservedCents = this.reservedCentsForReservation(input.reservationId);
    if (reservedCents <= 0) {
      return this.getSummary();
    }
    const state = this.currentState();
    this.appendTransaction({
      type: "refund",
      amountCents: reservedCents,
      balanceAfterCents: state.balanceCents,
      reservedAfterCents: Math.max(0, state.reservedCents - reservedCents),
      reservationId: input.reservationId,
      jobId: input.jobId,
      description: input.description ?? "释放生成任务冻结金额",
      metadata: input.metadata
    });
    return this.getSummary();
  }

  private currentState(): { balanceCents: number; reservedCents: number } {
    const row = this.input.handle.sqlite.prepare(`
      SELECT balance_after_cents, reserved_after_cents
      FROM wallet_transactions
      WHERE workspace_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1
    `).get(this.input.workspaceId) as Pick<WalletRow, "balance_after_cents" | "reserved_after_cents"> | undefined;
    return {
      balanceCents: row?.balance_after_cents ?? 0,
      reservedCents: row?.reserved_after_cents ?? 0
    };
  }

  private reservedCentsForReservation(reservationId: string): number {
    const rows = this.input.handle.sqlite.prepare(`
      SELECT type, amount_cents
      FROM wallet_transactions
      WHERE workspace_id = ? AND reservation_id = ?
      ORDER BY created_at ASC, rowid ASC
    `).all(this.input.workspaceId, reservationId) as Array<Pick<WalletRow, "type" | "amount_cents">>;
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

  private appendTransaction(input: {
    type: WalletTransactionType;
    amountCents: number;
    balanceAfterCents?: number;
    reservedAfterCents?: number;
    reservationId?: string;
    jobId?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): void {
    const state = this.currentState();
    const balanceAfterCents = input.balanceAfterCents ?? state.balanceCents + input.amountCents;
    const reservedAfterCents = input.reservedAfterCents ?? state.reservedCents;
    this.input.handle.sqlite.prepare(`
      INSERT INTO wallet_transactions (
        id,
        workspace_id,
        type,
        amount_cents,
        balance_after_cents,
        reserved_after_cents,
        reservation_id,
        job_id,
        description,
        metadata_json,
        created_at
      ) VALUES (
        @id,
        @workspaceId,
        @type,
        @amountCents,
        @balanceAfterCents,
        @reservedAfterCents,
        @reservationId,
        @jobId,
        @description,
        @metadataJson,
        @createdAt
      )
    `).run({
      id: `wallet-tx-${randomUUID()}`,
      workspaceId: this.input.workspaceId,
      type: input.type,
      amountCents: input.amountCents,
      balanceAfterCents,
      reservedAfterCents,
      reservationId: input.reservationId ?? null,
      jobId: input.jobId ?? null,
      description: input.description ?? null,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt: this.nowIso()
    });
  }

  private nowIso(): string {
    return (this.input.now ?? (() => new Date()))().toISOString();
  }
}

export function centsToCny(cents: number): number {
  return Math.round(cents) / 100;
}

export function cnyToCents(amountCny: number): number {
  return Math.round(amountCny * 100);
}

function positiveCents(amountCny: number): number {
  const cents = cnyToCents(Number(amountCny));
  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error("充值或扣费金额必须大于 0。");
  }
  return cents;
}

function walletTransactionFromRow(row: WalletRow): WalletTransaction {
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
