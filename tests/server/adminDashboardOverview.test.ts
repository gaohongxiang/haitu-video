import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildAdminOverview } from "../../src/server/adminDashboardOverview.js";
import { closeDatabase, openDatabase, type DatabaseHandle } from "../../src/server/db/client.js";
import { ensureDefaultWorkspace, runMigrations } from "../../src/server/db/migrate.js";

const tempDirs: string[] = [];

describe("admin dashboard overview", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("includes user wallet totals directly in user summaries", async () => {
    const { handle, close } = await openTestDatabase("haitu-admin-overview-wallets-");
    try {
      seedUserWorkspace(handle, {
        userId: "user-a",
        email: "owner-a@example.com",
        workspaceId: "workspace-a",
        workspaceName: "A 店铺"
      });
      seedUserWorkspace(handle, {
        userId: "user-a",
        email: "owner-a@example.com",
        workspaceId: "workspace-b",
        workspaceName: "B 店铺"
      });
      seedWalletActivity(handle, "workspace-a", "a");
      seedWalletActivity(handle, "workspace-b", "b");

      const overview = buildAdminOverview(handle, new Date("2026-07-06T10:00:00.000Z"));

      expect(overview.users[0]).toEqual(expect.objectContaining({
        id: "user-a",
        totalBalanceCny: 90.54,
        totalRechargeCny: 100,
        totalSpendCny: 9.46
      }));
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

function seedUserWorkspace(handle: DatabaseHandle, input: {
  userId: string;
  email: string;
  workspaceId: string;
  workspaceName: string;
}): void {
  handle.sqlite.prepare(`
    INSERT INTO auth_users (id, name, email, email_verified, created_at, updated_at)
    VALUES (@userId, @email, @email, 1, '2026-07-06T08:00:00.000Z', '2026-07-06T08:00:00.000Z')
    ON CONFLICT(id) DO NOTHING
  `).run(input);
  handle.sqlite.prepare(`
    INSERT INTO users (id, email, role, created_at, updated_at)
    VALUES (@userId, @email, 'user', '2026-07-06T08:00:00.000Z', '2026-07-06T08:00:00.000Z')
    ON CONFLICT(id) DO NOTHING
  `).run(input);
  handle.sqlite.prepare(`
    INSERT INTO workspaces (id, name, owner_user_id, created_at, updated_at)
    VALUES (@workspaceId, @workspaceName, @userId, '2026-07-06T08:00:00.000Z', '2026-07-06T08:00:00.000Z')
  `).run(input);
  handle.sqlite.prepare(`
    INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
    VALUES (@workspaceId, @userId, 'owner', '2026-07-06T08:00:00.000Z')
  `).run(input);
}

function seedWalletActivity(handle: DatabaseHandle, workspaceId: string, suffix: string): void {
  insertWalletTransaction(handle, {
    id: `tx-recharge-${suffix}`,
    workspaceId,
    type: "recharge",
    amountCents: 5000,
    balanceAfterCents: 5000,
    reservedAfterCents: 0,
    createdAt: "2026-07-06T08:57:08.044Z"
  });
  insertWalletTransaction(handle, {
    id: `tx-reserve-${suffix}`,
    workspaceId,
    type: "reserve",
    amountCents: -473,
    balanceAfterCents: 5000,
    reservedAfterCents: 473,
    createdAt: "2026-07-06T09:00:35.058Z"
  });
  insertWalletTransaction(handle, {
    id: `tx-charge-${suffix}`,
    workspaceId,
    type: "charge",
    amountCents: -473,
    balanceAfterCents: 4527,
    reservedAfterCents: 0,
    createdAt: "2026-07-06T09:03:55.351Z"
  });
  insertRechargeOrder(handle, {
    id: `order-paid-${suffix}`,
    workspaceId,
    provider: "stripe",
    amountCents: 5000,
    creditCents: 5000,
    status: "paid",
    createdAt: "2026-07-06T08:56:00.000Z",
    updatedAt: "2026-07-06T08:57:08.044Z",
    completedAt: "2026-07-06T08:57:08.044Z"
  });
}

function insertWalletTransaction(handle: DatabaseHandle, input: {
  id: string;
  workspaceId: string;
  type: string;
  amountCents: number;
  balanceAfterCents: number;
  reservedAfterCents: number;
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
      created_at
    ) VALUES (
      @id,
      @workspaceId,
      @type,
      @amountCents,
      @balanceAfterCents,
      @reservedAfterCents,
      @createdAt
    )
  `).run(input);
}

function insertRechargeOrder(handle: DatabaseHandle, input: {
  id: string;
  workspaceId: string;
  provider: string;
  amountCents: number;
  creditCents: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
}): void {
  handle.sqlite.prepare(`
    INSERT INTO wallet_recharge_orders (
      id,
      workspace_id,
      provider,
      amount_cents,
      currency,
      credit_cents,
      status,
      created_at,
      updated_at,
      completed_at
    ) VALUES (
      @id,
      @workspaceId,
      @provider,
      @amountCents,
      'cny',
      @creditCents,
      @status,
      @createdAt,
      @updatedAt,
      @completedAt
    )
  `).run(input);
}
