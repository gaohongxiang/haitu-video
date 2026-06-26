import { describe, expect, it } from "vitest";

import {
  centsToCny,
  cnyToCents,
  positiveCents,
  reservedCentsFromTransactions,
  walletTransactionFromRow,
  type WalletLedgerTransactionRow
} from "../../src/server/walletLedger.js";

describe("wallet ledger helpers", () => {
  it("converts and validates CNY amounts in cents", () => {
    expect(cnyToCents(1.235)).toBe(124);
    expect(centsToCny(124)).toBe(1.24);
    expect(positiveCents("2.50")).toBe(250);
    expect(() => positiveCents(0)).toThrow("充值或扣费金额必须大于 0。");
    expect(() => positiveCents(Number.NaN)).toThrow("充值或扣费金额必须大于 0。");
  });

  it("calculates remaining reservation cents from wallet transaction rows", () => {
    expect(reservedCentsFromTransactions([
      { type: "reserve", amount_cents: -500 },
      { type: "charge", amount_cents: -320 },
      { type: "refund", amount_cents: 50 },
      { type: "adjustment", amount_cents: 999 }
    ])).toBe(130);
    expect(reservedCentsFromTransactions([
      { type: "reserve", amount_cents: -100 },
      { type: "refund", amount_cents: 200 }
    ])).toBe(0);
  });

  it("maps database rows to public wallet transactions and ignores invalid metadata", () => {
    const baseRow: WalletLedgerTransactionRow = {
      id: "wallet-tx-1",
      workspace_id: "default",
      type: "recharge",
      amount_cents: 123,
      balance_after_cents: 500,
      reserved_after_cents: 100,
      reservation_id: "reservation-1",
      job_id: "job-1",
      description: "manual",
      metadata_json: "{\"source\":\"test\"}",
      created_at: "2026-01-01T00:00:00.000Z"
    };

    expect(walletTransactionFromRow(baseRow)).toEqual({
      id: "wallet-tx-1",
      workspaceId: "default",
      type: "recharge",
      amountCny: 1.23,
      balanceAfterCny: 5,
      reservedAfterCny: 1,
      reservationId: "reservation-1",
      jobId: "job-1",
      description: "manual",
      metadata: { source: "test" },
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    expect(walletTransactionFromRow({
      ...baseRow,
      metadata_json: "[\"ignored\"]"
    }).metadata).toBeUndefined();
  });
});
