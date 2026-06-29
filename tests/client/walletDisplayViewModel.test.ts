import { describe, expect, it } from "vitest";

import { walletTransactionDescriptionLabel } from "../../src/client/walletDisplayViewModel.js";

describe("wallet display helpers", () => {
  it("localizes known system-generated transaction descriptions and leaves unknown descriptions unchanged", () => {
    expect(walletTransactionDescriptionLabel("Infini 数字货币充值到账", "en")).toBe("Infini crypto top-up settled");
    expect(walletTransactionDescriptionLabel("数字货币充值到账", "en")).toBe("Crypto top-up settled");
    expect(walletTransactionDescriptionLabel("Stripe 充值到账", "en")).toBe("Stripe top-up settled");
    expect(walletTransactionDescriptionLabel("充值到账", "en")).toBe("Top-up settled");
    expect(walletTransactionDescriptionLabel("Manual correction for order A", "en")).toBe("Manual correction for order A");
    expect(walletTransactionDescriptionLabel(undefined, "en")).toBe("-");
  });
});
