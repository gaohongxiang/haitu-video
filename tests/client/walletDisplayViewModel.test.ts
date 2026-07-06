import { describe, expect, it } from "vitest";

import {
  walletTransactionBillingBreakdown,
  walletTransactionDescriptionLabel,
  walletVisibleConsumptionTransactions,
  type WalletDisplayTransaction
} from "../../src/client/walletDisplayViewModel.js";

describe("wallet display helpers", () => {
  it("localizes known system-generated transaction descriptions and leaves unknown descriptions unchanged", () => {
    expect(walletTransactionDescriptionLabel("Infini 数字货币充值到账", "en")).toBe("Infini crypto top-up settled");
    expect(walletTransactionDescriptionLabel("数字货币充值到账", "en")).toBe("Crypto top-up settled");
    expect(walletTransactionDescriptionLabel("Stripe 充值到账", "en")).toBe("Stripe top-up settled");
    expect(walletTransactionDescriptionLabel("充值到账", "en")).toBe("Top-up settled");
    expect(walletTransactionDescriptionLabel("Manual correction for order A", "en")).toBe("Manual correction for order A");
    expect(walletTransactionDescriptionLabel(undefined, "en")).toBe("-");
  });

  it("collapses completed reservations into the final charge row for consumption history", () => {
    const transactions: WalletDisplayTransaction[] = [
      walletTransaction({
        id: "tx-charge",
        type: "charge",
        amountCny: -4.73,
        balanceAfterCny: 45.27,
        reservedAfterCny: 0,
        reservationId: "reservation-video-1",
        description: "视频生成扣费",
        createdAt: "2026-07-06T09:03:55.000Z"
      }),
      walletTransaction({
        id: "tx-reserve",
        type: "reserve",
        amountCny: -4.73,
        balanceAfterCny: 50,
        reservedAfterCny: 4.73,
        reservationId: "reservation-video-1",
        description: "视频生成预扣",
        createdAt: "2026-07-06T09:00:35.000Z"
      })
    ];

    expect(walletVisibleConsumptionTransactions(transactions)).toEqual([
      expect.objectContaining({
        id: "tx-charge",
        type: "charge",
        amountCny: -4.73,
        description: "视频生成扣费"
      })
    ]);
  });

  it("keeps an open reservation visible as frozen until it is captured or released", () => {
    const transactions: WalletDisplayTransaction[] = [
      walletTransaction({
        id: "tx-reserve",
        type: "reserve",
        amountCny: -8,
        balanceAfterCny: 50,
        reservedAfterCny: 8,
        reservationId: "reservation-video-open",
        description: "视频生成预扣",
        createdAt: "2026-07-06T09:00:35.000Z"
      })
    ];

    expect(walletVisibleConsumptionTransactions(transactions)).toEqual([
      expect.objectContaining({
        id: "tx-reserve",
        type: "reserve",
        amountCny: -8,
        description: "视频生成预扣"
      })
    ]);
  });

  it("shows a fully released reservation as the release row instead of the historical freeze row", () => {
    const transactions: WalletDisplayTransaction[] = [
      walletTransaction({
        id: "tx-release",
        type: "refund",
        amountCny: 4.73,
        balanceAfterCny: 50,
        reservedAfterCny: 0,
        reservationId: "reservation-video-failed",
        description: "释放生成任务冻结金额",
        createdAt: "2026-07-06T09:02:00.000Z"
      }),
      walletTransaction({
        id: "tx-reserve",
        type: "reserve",
        amountCny: -4.73,
        balanceAfterCny: 50,
        reservedAfterCny: 4.73,
        reservationId: "reservation-video-failed",
        description: "视频生成预扣",
        createdAt: "2026-07-06T09:00:35.000Z"
      })
    ];

    expect(walletVisibleConsumptionTransactions(transactions)).toEqual([
      expect.objectContaining({
        id: "tx-release",
        type: "refund",
        amountCny: 4.73,
        description: "释放生成任务冻结金额"
      })
    ]);
  });

  it("reads platform service fee and official cost from wallet transaction metadata", () => {
    expect(walletTransactionBillingBreakdown(walletTransaction({
      id: "tx-charge",
      type: "charge",
      amountCny: -4.73,
      metadata: {
        apiBillingMode: "platform",
        platformFeeCny: 1,
        upstreamCostCny: 3.73
      }
    }))).toEqual({
      totalCny: 4.73,
      platformFeeCny: 1,
      upstreamCostCny: 3.73,
      apiBillingMode: "platform"
    });
  });

  it("treats BYOK wallet charges as platform service fee only when no official cost is charged", () => {
    expect(walletTransactionBillingBreakdown(walletTransaction({
      id: "tx-byok-charge",
      type: "charge",
      amountCny: -1.5,
      metadata: {
        apiBillingMode: "byok",
        platformFeeCny: 1.5,
        upstreamEstimatedCostCny: 0
      }
    }))).toEqual({
      totalCny: 1.5,
      platformFeeCny: 1.5,
      upstreamCostCny: 0,
      apiBillingMode: "byok"
    });
  });
});

function walletTransaction(overrides: Partial<WalletDisplayTransaction>): WalletDisplayTransaction {
  return {
    id: "tx",
    type: "charge",
    amountCny: -1,
    balanceAfterCny: 0,
    reservedAfterCny: 0,
    createdAt: "2026-07-06T09:00:00.000Z",
    ...overrides
  };
}
