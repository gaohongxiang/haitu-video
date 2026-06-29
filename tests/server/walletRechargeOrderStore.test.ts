import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { closeDatabase, openDatabase } from "../../src/server/db/client.js";
import { ensureDefaultWorkspace, runMigrations } from "../../src/server/db/migrate.js";
import { resolveRechargePaymentAmount } from "../../src/server/rechargePaymentAmount.js";
import { WalletRechargeOrderStore } from "../../src/server/walletRechargeOrderStore.js";

const tempDirs: string[] = [];

describe("wallet recharge orders", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("keeps wallet CNY credit separate from payment currency amount", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-wallet-recharge-order-"));
    tempDirs.push(root);
    const handle = openDatabase({ dataDir: join(root, "data"), env: process.env });
    runMigrations(handle);
    ensureDefaultWorkspace(handle);
    try {
      const payment = resolveRechargePaymentAmount({
        creditCny: 50,
        paymentCurrency: "hkd",
        env: {
          HAITU_RECHARGE_HKD_PER_CNY: "1.1"
        }
      });
      const order = new WalletRechargeOrderStore({ handle }).createPending({
        workspaceId: "default",
        provider: "stripe",
        creditCny: 50,
        paymentCurrency: payment.paymentCurrency,
        paymentAmountCents: payment.paymentAmountCents,
        fxRateSnapshot: payment.fxRateSnapshot
      });

      expect(order).toEqual(expect.objectContaining({
        creditCny: 50,
        creditCents: 5000,
        walletCurrency: "cny",
        paymentAmount: 55,
        paymentAmountCents: 5500,
        paymentCurrency: "hkd",
        fxRateSnapshot: expect.objectContaining({
          from: "cny",
          to: "hkd",
          rate: 1.1
        })
      }));
    } finally {
      closeDatabase(handle);
    }
  });

  it("requires an explicit exchange rate for non-CNY payment currencies", () => {
    expect(() => resolveRechargePaymentAmount({
      creditCny: 50,
      paymentCurrency: "hkd",
      env: {}
    })).toThrow("请配置 HAITU_RECHARGE_HKD_PER_CNY");
  });
});
