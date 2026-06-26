import { randomUUID } from "node:crypto";

import type { DatabaseHandle } from "./db/client.js";
import {
  reservedCentsFromTransactions,
  type WalletLedgerReservationRow,
  type WalletLedgerTransactionRow
} from "./walletLedger.js";
import type { WalletTransactionType } from "./walletStore.js";

export interface WalletState {
  balanceCents: number;
  reservedCents: number;
}

export class WalletRepository {
  constructor(
    private readonly input: {
      handle: DatabaseHandle;
      workspaceId: string;
      now?: () => Date;
    }
  ) {}

  listTransactions(limit: number): WalletLedgerTransactionRow[] {
    return this.input.handle.sqlite.prepare(`
      SELECT *
      FROM wallet_transactions
      WHERE workspace_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT ?
    `).all(this.input.workspaceId, limit) as WalletLedgerTransactionRow[];
  }

  currentState(): WalletState {
    const row = this.input.handle.sqlite.prepare(`
      SELECT balance_after_cents, reserved_after_cents
      FROM wallet_transactions
      WHERE workspace_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1
    `).get(this.input.workspaceId) as Pick<WalletLedgerTransactionRow, "balance_after_cents" | "reserved_after_cents"> | undefined;
    return {
      balanceCents: row?.balance_after_cents ?? 0,
      reservedCents: row?.reserved_after_cents ?? 0
    };
  }

  reservedCentsForReservation(reservationId: string): number {
    const rows = this.input.handle.sqlite.prepare(`
      SELECT type, amount_cents
      FROM wallet_transactions
      WHERE workspace_id = ? AND reservation_id = ?
      ORDER BY created_at ASC, rowid ASC
    `).all(this.input.workspaceId, reservationId) as WalletLedgerReservationRow[];
    return reservedCentsFromTransactions(rows);
  }

  appendTransaction(input: {
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
