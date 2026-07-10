import { randomUUID } from "node:crypto";

import type { DatabaseHandle } from "./db/client.js";
import {
  centsToCny,
  cnyToCents,
  positiveCents,
  walletTransactionFromRow
} from "./walletLedger.js";
import { WalletRepository } from "./walletRepository.js";

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

export interface WalletRow {
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
  private readonly repository: WalletRepository;

  constructor(
    private readonly input: {
      handle: DatabaseHandle;
      workspaceId: string;
      now?: () => Date;
    }
  ) {
    this.repository = new WalletRepository(input);
  }

  getSummary(limit = 50): WalletSummary {
    const state = this.repository.currentState();
    const rows = this.repository.listTransactions(limit);
    return {
      workspaceId: this.input.workspaceId,
      balanceCny: centsToCny(state.balanceCents),
      reservedCny: centsToCny(state.reservedCents),
      availableCny: centsToCny(state.balanceCents - state.reservedCents),
      transactions: rows.map(walletTransactionFromRow)
    };
  }

  reservedCnyForReservation(reservationId: string): number {
    return centsToCny(this.repository.reservedCentsForReservation(reservationId));
  }

  topUp(input: {
    amountCny: number;
    description?: string;
    metadata?: Record<string, unknown>;
  }): WalletSummary {
    const amountCents = positiveCents(input.amountCny);
    this.repository.appendTransaction({
      type: "recharge",
      amountCents,
      description: input.description ?? "充值",
      metadata: input.metadata
    });
    return this.getSummary();
  }

  adjust(input: {
    amountCny: number;
    description: string;
    metadata?: Record<string, unknown>;
  }): WalletSummary {
    const amountCents = cnyToCents(Number(input.amountCny));
    if (!Number.isFinite(amountCents) || amountCents === 0) {
      throw new Error("余额调整金额不能为 0。");
    }
    const state = this.repository.currentState();
    if (state.balanceCents + amountCents < state.reservedCents) {
      throw new Error("调整后余额不能小于冻结金额。");
    }
    this.repository.appendTransaction({
      type: "adjustment",
      amountCents,
      description: input.description,
      metadata: input.metadata
    });
    return this.getSummary();
  }

  reverseRecharge(input: {
    amountCny: number;
    rechargeOrderId: string;
    providerEventId: string;
    reason: string;
    metadata?: Record<string, unknown>;
  }): WalletSummary {
    const amountCents = positiveCents(input.amountCny);
    const state = this.repository.currentState();
    this.repository.appendTransaction({
      type: "adjustment",
      amountCents: -amountCents,
      balanceAfterCents: state.balanceCents - amountCents,
      reservedAfterCents: state.reservedCents,
      description: input.reason,
      metadata: {
        rechargeReversal: true,
        rechargeOrderId: input.rechargeOrderId,
        providerEventId: input.providerEventId,
        ...(input.metadata ?? {})
      }
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
    const state = this.repository.currentState();
    if (state.balanceCents - state.reservedCents < amountCents) {
      throw new InsufficientWalletBalanceError();
    }
    const reservationId = input.reservationId ?? `wallet-reservation-${randomUUID()}`;
    this.repository.appendTransaction({
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
    const reservedCents = this.repository.reservedCentsForReservation(input.reservationId);
    if (reservedCents <= 0) {
      return this.getSummary();
    }
    const state = this.repository.currentState();
    const capturedCents = Math.min(chargeCents, reservedCents);
    this.repository.appendTransaction({
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
      const afterCharge = this.repository.currentState();
      this.repository.appendTransaction({
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
    const reservedCents = this.repository.reservedCentsForReservation(input.reservationId);
    if (reservedCents <= 0) {
      return this.getSummary();
    }
    const state = this.repository.currentState();
    this.repository.appendTransaction({
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
}

export { centsToCny, cnyToCents } from "./walletLedger.js";
