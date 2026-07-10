import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { FileAuditLog } from "../../src/server/auditLog.js";
import { closeDatabase, openDatabase } from "../../src/server/db/client.js";
import { ensureDefaultWorkspace, runMigrations } from "../../src/server/db/migrate.js";
import { fetchRemoteImage } from "../../src/server/remoteImageFetch.js";
import { handleStripeWebhookEvent } from "../../src/server/stripePaymentService.js";
import { WalletRechargeOrderStore } from "../../src/server/walletRechargeOrderStore.js";
import { WalletStore } from "../../src/server/walletStore.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("security and billing regressions", () => {
  it("appends concurrent audit events without losing earlier writes", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-audit-concurrency-"));
    tempDirs.push(root);
    const path = join(root, "audit.jsonl");
    const log = new FileAuditLog(path);

    await Promise.all(Array.from({ length: 100 }, (_, index) => log.append({ action: `event.${index}` })));

    const lines = (await readFile(path, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(100);
    expect((await log.list({ limit: 200 })).summary.totalEvents).toBe(100);
  });

  it("rejects literal private-network reference image URLs before fetching", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(fetchRemoteImage({
      url: "http://127.0.0.1:8080/internal.png",
      fetchImpl
    })).rejects.toThrow("不能指向本机或内网");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("limits remote image size and validates every redirect target", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === "https://images.example.test/start") {
        return new Response(null, { status: 302, headers: { location: "https://cdn.example.test/image.png" } });
      }
      return new Response("image", {
        headers: { "content-type": "image/png", "content-length": "5" }
      });
    }) as unknown as typeof fetch;

    await expect(fetchRemoteImage({ url: "https://images.example.test/start", fetchImpl })).resolves.toEqual({
      bytes: Buffer.from("image"),
      contentType: "image/png",
      finalUrl: "https://cdn.example.test/image.png"
    });

    const oversizedFetch = vi.fn(async () => new Response(null, {
      headers: { "content-type": "image/png", "content-length": String(21 * 1024 * 1024) }
    })) as unknown as typeof fetch;
    await expect(fetchRemoteImage({ url: "https://images.example.test/large.png", fetchImpl: oversizedFetch }))
      .rejects.toThrow("不能超过 20 MB");
  });

  it("reverses Stripe refund credit once and leaves a proportional order status", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-stripe-refund-"));
    tempDirs.push(root);
    const handle = openDatabase({ dataDir: join(root, "data"), env: process.env });
    try {
      runMigrations(handle);
      ensureDefaultWorkspace(handle);
      const orderStore = new WalletRechargeOrderStore({ handle });
      const order = orderStore.createPending({
        workspaceId: "default",
        provider: "stripe",
        creditCny: 50,
        paymentCurrency: "cny",
        paymentAmountCents: 5000
      });
      orderStore.attachProviderSession({
        orderId: order.id,
        providerSessionId: "cs_refund",
        providerPaymentIntentId: "pi_refund",
        checkoutUrl: "https://checkout.stripe.test/refund"
      });
      new WalletStore({ handle, workspaceId: "default" }).topUp({ amountCny: 50 });
      orderStore.markPaid({
        orderId: order.id,
        providerPaymentIntentId: "pi_refund",
        metadata: { stripeChargeId: "ch_refund" }
      });
      const event = {
        id: "evt_refund_once",
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_refund",
            payment_intent: "pi_refund",
            amount: 5000,
            amount_refunded: 2500,
            currency: "cny"
          }
        }
      };
      const config = { secretKey: "sk_test", webhookSecret: "whsec_test", currency: "cny", appUrl: "https://haitu.test" };

      await handleStripeWebhookEvent({ event, config, handle });
      await handleStripeWebhookEvent({ event, config, handle });

      expect(new WalletStore({ handle, workspaceId: "default" }).getSummary().balanceCny).toBe(25);
      expect(orderStore.getById(order.id)).toEqual(expect.objectContaining({
        status: "partially_refunded",
        reversedCreditCny: 25
      }));
    } finally {
      closeDatabase(handle);
    }
  });
});
