import type { DatabaseHandle } from "./db/client.js";
import { centsToCny, cnyToCents } from "./walletLedger.js";
import { WalletStore } from "./walletStore.js";

export interface AdminWalletSummary {
  workspaceId: string;
  workspaceName: string;
  ownerEmail?: string;
  memberCount: number;
  balanceCny: number;
  reservedCny: number;
  availableCny: number;
  transactionCount: number;
  lastTransactionAt?: string;
  lastTransactionType?: string;
}

export interface AdminWalletAdjustmentRequest {
  workspaceId?: string;
  amountCny?: number;
  reason?: string;
}

interface AdminWalletRow {
  workspace_id: string;
  workspace_name: string;
  owner_email: string | null;
  member_count: number;
  balance_after_cents: number | null;
  reserved_after_cents: number | null;
  transaction_count: number;
  last_transaction_at: string | null;
  last_transaction_type: string | null;
}

export function listAdminWallets(handle: DatabaseHandle): { wallets: AdminWalletSummary[] } {
  const rows = handle.sqlite.prepare(`
    WITH latest_wallet AS (
      SELECT
        workspace_id,
        type,
        balance_after_cents,
        reserved_after_cents,
        created_at,
        ROW_NUMBER() OVER (
          PARTITION BY workspace_id
          ORDER BY created_at DESC, rowid DESC
        ) AS row_number
      FROM wallet_transactions
    ),
    transaction_counts AS (
      SELECT workspace_id, COUNT(*) AS transaction_count
      FROM wallet_transactions
      GROUP BY workspace_id
    ),
    member_counts AS (
      SELECT workspace_id, COUNT(*) AS member_count
      FROM workspace_members
      GROUP BY workspace_id
    )
    SELECT
      w.id AS workspace_id,
      w.name AS workspace_name,
      owner.email AS owner_email,
      COALESCE(mc.member_count, 0) AS member_count,
      lw.balance_after_cents,
      lw.reserved_after_cents,
      COALESCE(tc.transaction_count, 0) AS transaction_count,
      lw.created_at AS last_transaction_at,
      lw.type AS last_transaction_type
    FROM workspaces w
    LEFT JOIN users owner ON owner.id = w.owner_user_id
    LEFT JOIN latest_wallet lw
      ON lw.workspace_id = w.id
      AND lw.row_number = 1
    LEFT JOIN transaction_counts tc ON tc.workspace_id = w.id
    LEFT JOIN member_counts mc ON mc.workspace_id = w.id
    ORDER BY
      COALESCE(lw.created_at, w.created_at) DESC,
      w.created_at DESC
  `).all() as AdminWalletRow[];
  return {
    wallets: rows.map(adminWalletFromRow)
  };
}

export function adjustAdminWallet(input: {
  handle: DatabaseHandle;
  request: AdminWalletAdjustmentRequest;
  adminUserId: string;
  adminEmail: string;
  now?: () => Date;
}): { wallet: ReturnType<WalletStore["getSummary"]> } {
  const workspaceId = normalizeWorkspaceId(input.request.workspaceId);
  assertWorkspaceExists(input.handle, workspaceId);
  const amountCny = normalizeAdjustmentAmount(input.request.amountCny);
  const reason = normalizeReason(input.request.reason);
  const walletStore = new WalletStore({
    handle: input.handle,
    workspaceId,
    now: input.now
  });
  const wallet = walletStore.adjust({
    amountCny,
    description: `后台余额调整：${reason}`,
    metadata: {
      adminUserId: input.adminUserId,
      adminEmail: input.adminEmail,
      reason
    }
  });
  return { wallet };
}

function adminWalletFromRow(row: AdminWalletRow): AdminWalletSummary {
  const balanceCents = row.balance_after_cents ?? 0;
  const reservedCents = row.reserved_after_cents ?? 0;
  return {
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    ownerEmail: row.owner_email ?? undefined,
    memberCount: row.member_count,
    balanceCny: centsToCny(balanceCents),
    reservedCny: centsToCny(reservedCents),
    availableCny: centsToCny(balanceCents - reservedCents),
    transactionCount: row.transaction_count,
    lastTransactionAt: row.last_transaction_at ?? undefined,
    lastTransactionType: row.last_transaction_type ?? undefined
  };
}

function assertWorkspaceExists(handle: DatabaseHandle, workspaceId: string): void {
  const row = handle.sqlite.prepare("SELECT id FROM workspaces WHERE id = ?").get(workspaceId) as { id: string } | undefined;
  if (!row) {
    throw new Error("工作区不存在，无法调整余额。");
  }
}

function normalizeWorkspaceId(value: unknown): string {
  const workspaceId = typeof value === "string" ? value.trim() : "";
  if (!workspaceId) {
    throw new Error("请选择要调整余额的工作区。");
  }
  return workspaceId;
}

function normalizeAdjustmentAmount(value: unknown): number {
  const cents = cnyToCents(Number(value));
  if (!Number.isFinite(cents) || cents === 0) {
    throw new Error("余额调整金额不能为 0。");
  }
  return centsToCny(cents);
}

function normalizeReason(value: unknown): string {
  const reason = typeof value === "string" ? value.trim() : "";
  if (reason.length < 2) {
    throw new Error("请填写余额调整原因。");
  }
  return reason.slice(0, 200);
}
