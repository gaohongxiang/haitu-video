import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  listAdminRechargeOrders,
  listAdminWalletTransactions
} from "../../src/server/adminBilling.js";
import { closeDatabase, openDatabase, type DatabaseHandle } from "../../src/server/db/client.js";
import { ensureDefaultWorkspace, runMigrations } from "../../src/server/db/migrate.js";

const tempDirs: string[] = [];

describe("admin billing", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("lists wallet transactions across all workspaces with owner and price snapshots", async () => {
    const { handle, close } = await openTestDatabase("haitu-admin-billing-transactions-");
    try {
      seedWorkspace(handle, {
        workspaceId: "workspace-a",
        workspaceName: "A 店铺",
        userId: "user-a",
        email: "owner-a@example.com"
      });
      seedWorkspace(handle, {
        workspaceId: "workspace-b",
        workspaceName: "B 店铺",
        userId: "user-b",
        email: "owner-b@example.com"
      });
      insertWalletTransaction(handle, {
        id: "tx-a",
        workspaceId: "workspace-a",
        type: "charge",
        amountCents: -250,
        balanceAfterCents: 9750,
        reservedAfterCents: 0,
        jobId: "job-a",
        description: "视频生成扣费",
        metadataJson: JSON.stringify({
          priceSnapshot: {
            model: "doubao-seedance-2.0",
            unitPriceCny: 0.2
          }
        }),
        createdAt: "2026-06-29T10:00:00.000Z"
      });
      insertWalletTransaction(handle, {
        id: "tx-b",
        workspaceId: "workspace-b",
        type: "recharge",
        amountCents: 5000,
        balanceAfterCents: 5000,
        reservedAfterCents: 0,
        description: "充值到账",
        metadataJson: JSON.stringify({ rechargeOrderId: "order-b" }),
        createdAt: "2026-06-29T09:00:00.000Z"
      });

      const all = listAdminWalletTransactions({ handle });
      const filtered = listAdminWalletTransactions({ handle, workspaceId: "workspace-a" });

      expect(all.transactions.map((item) => item.id)).toEqual(["tx-a", "tx-b"]);
      expect(all.transactions[0]).toEqual(expect.objectContaining({
        id: "tx-a",
        workspaceId: "workspace-a",
        workspaceName: "A 店铺",
        ownerEmail: "owner-a@example.com",
        amountCny: -2.5,
        balanceAfterCny: 97.5,
        jobId: "job-a",
        metadata: expect.objectContaining({
          priceSnapshot: expect.objectContaining({
            model: "doubao-seedance-2.0",
            unitPriceCny: 0.2
          })
        })
      }));
      expect(filtered.transactions.map((item) => item.id)).toEqual(["tx-a"]);
    } finally {
      close();
    }
  });

  it("lists recharge orders across workspaces and supports status/provider filters", async () => {
    const { handle, close } = await openTestDatabase("haitu-admin-billing-orders-");
    try {
      seedWorkspace(handle, {
        workspaceId: "workspace-a",
        workspaceName: "A 店铺",
        userId: "user-a",
        email: "owner-a@example.com"
      });
      seedWorkspace(handle, {
        workspaceId: "workspace-b",
        workspaceName: "B 店铺",
        userId: "user-b",
        email: "owner-b@example.com"
      });
      insertRechargeOrder(handle, {
        id: "order-a",
        workspaceId: "workspace-a",
        provider: "stripe",
        amountCents: 10000,
        creditCents: 10000,
        status: "paid",
        providerSessionId: "cs_a",
        providerPaymentIntentId: "pi_a",
        metadataJson: JSON.stringify({ source: "checkout" }),
        createdAt: "2026-06-29T10:00:00.000Z",
        updatedAt: "2026-06-29T10:01:00.000Z",
        completedAt: "2026-06-29T10:02:00.000Z"
      });
      insertRechargeOrder(handle, {
        id: "order-b",
        workspaceId: "workspace-b",
        provider: "infini",
        amountCents: 5000,
        creditCents: 5000,
        status: "pending",
        providerSessionId: "infini_b",
        createdAt: "2026-06-29T09:00:00.000Z",
        updatedAt: "2026-06-29T09:00:00.000Z"
      });

      const all = listAdminRechargeOrders({ handle });
      const paidStripe = listAdminRechargeOrders({ handle, status: "paid", provider: "stripe" });

      expect(all.orders.map((item) => item.id)).toEqual(["order-a", "order-b"]);
      expect(all.orders[0]).toEqual(expect.objectContaining({
        id: "order-a",
        workspaceName: "A 店铺",
        ownerEmail: "owner-a@example.com",
        provider: "stripe",
        creditCny: 100,
        paymentAmount: 100,
        paymentCurrency: "cny",
        walletCurrency: "cny",
        status: "paid",
        metadata: expect.objectContaining({ source: "checkout" })
      }));
      expect(paidStripe.orders.map((item) => item.id)).toEqual(["order-a"]);
    } finally {
      close();
    }
  });
});

async function openTestDatabase(prefix: string): Promise<{ handle: DatabaseHandle; close: () => void }> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(root);
  const handle = openDatabase({ dataDir: join(root, "data"), env: process.env });
  runMigrations(handle);
  ensureDefaultWorkspace(handle);
  return {
    handle,
    close: () => closeDatabase(handle)
  };
}

function seedWorkspace(handle: DatabaseHandle, input: {
  workspaceId: string;
  workspaceName: string;
  userId: string;
  email: string;
}): void {
  handle.sqlite.prepare(`
    INSERT INTO users (id, email, role, created_at, updated_at)
    VALUES (@userId, @email, 'user', '2026-06-29T00:00:00.000Z', '2026-06-29T00:00:00.000Z')
  `).run(input);
  handle.sqlite.prepare(`
    INSERT INTO workspaces (id, name, owner_user_id, created_at, updated_at)
    VALUES (@workspaceId, @workspaceName, @userId, '2026-06-29T00:00:00.000Z', '2026-06-29T00:00:00.000Z')
  `).run(input);
  handle.sqlite.prepare(`
    INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
    VALUES (@workspaceId, @userId, 'owner', '2026-06-29T00:00:00.000Z')
  `).run(input);
}

function insertWalletTransaction(handle: DatabaseHandle, input: {
  id: string;
  workspaceId: string;
  type: string;
  amountCents: number;
  balanceAfterCents: number;
  reservedAfterCents: number;
  reservationId?: string;
  jobId?: string;
  description?: string;
  metadataJson?: string;
  createdAt: string;
}): void {
  handle.sqlite.prepare(`
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
    ...input,
    reservationId: input.reservationId ?? null,
    jobId: input.jobId ?? null,
    description: input.description ?? null,
    metadataJson: input.metadataJson ?? null
  });
}

function insertRechargeOrder(handle: DatabaseHandle, input: {
  id: string;
  workspaceId: string;
  provider: string;
  amountCents: number;
  creditCents: number;
  status: string;
  providerSessionId?: string;
  providerPaymentIntentId?: string;
  metadataJson?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}): void {
  handle.sqlite.prepare(`
    INSERT INTO wallet_recharge_orders (
      id,
      workspace_id,
      provider,
      provider_session_id,
      provider_payment_intent_id,
      amount_cents,
      currency,
      credit_cents,
      status,
      metadata_json,
      created_at,
      updated_at,
      completed_at
    ) VALUES (
      @id,
      @workspaceId,
      @provider,
      @providerSessionId,
      @providerPaymentIntentId,
      @amountCents,
      'cny',
      @creditCents,
      @status,
      @metadataJson,
      @createdAt,
      @updatedAt,
      @completedAt
    )
  `).run({
    ...input,
    providerSessionId: input.providerSessionId ?? null,
    providerPaymentIntentId: input.providerPaymentIntentId ?? null,
    metadataJson: input.metadataJson ?? null,
    completedAt: input.completedAt ?? null
  });
}
