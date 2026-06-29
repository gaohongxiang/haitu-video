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

export interface AdminWalletTransactionView {
  id: string;
  workspaceId: string;
  workspaceName: string;
  ownerEmail?: string;
  type: string;
  amountCny: number;
  balanceAfterCny: number;
  reservedAfterCny: number;
  reservationId?: string;
  jobId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AdminRechargeOrderView {
  id: string;
  workspaceId: string;
  workspaceName: string;
  ownerEmail?: string;
  provider: string;
  providerSessionId?: string;
  providerPaymentIntentId?: string;
  paymentAmount: number;
  paymentAmountCents: number;
  paymentCurrency: string;
  walletCurrency: "cny";
  creditCny: number;
  creditCents: number;
  status: string;
  checkoutUrl?: string;
  failureReason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  expiresAt?: string;
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

interface AdminWalletTransactionRow {
  id: string;
  workspace_id: string;
  workspace_name: string;
  owner_email: string | null;
  type: string;
  amount_cents: number;
  balance_after_cents: number;
  reserved_after_cents: number;
  reservation_id: string | null;
  job_id: string | null;
  description: string | null;
  metadata_json: string | null;
  created_at: string;
}

interface AdminRechargeOrderRow {
  id: string;
  workspace_id: string;
  workspace_name: string;
  owner_email: string | null;
  provider: string;
  provider_session_id: string | null;
  provider_payment_intent_id: string | null;
  amount_cents: number;
  currency: string;
  credit_cents: number;
  status: string;
  checkout_url: string | null;
  failure_reason: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  expires_at: string | null;
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

export function listAdminWalletTransactions(input: {
  handle: DatabaseHandle;
  workspaceId?: string;
  type?: string;
  limit?: number;
}): { transactions: AdminWalletTransactionView[] } {
  const filters: string[] = [];
  const params: Record<string, unknown> = {
    limit: normalizeLimit(input.limit)
  };
  if (input.workspaceId) {
    filters.push("wt.workspace_id = @workspaceId");
    params.workspaceId = input.workspaceId;
  }
  if (input.type) {
    filters.push("wt.type = @type");
    params.type = input.type;
  }
  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = input.handle.sqlite.prepare(`
    SELECT
      wt.id,
      wt.workspace_id,
      COALESCE(w.name, wt.workspace_id) AS workspace_name,
      owner.email AS owner_email,
      wt.type,
      wt.amount_cents,
      wt.balance_after_cents,
      wt.reserved_after_cents,
      wt.reservation_id,
      wt.job_id,
      wt.description,
      wt.metadata_json,
      wt.created_at
    FROM wallet_transactions wt
    LEFT JOIN workspaces w ON w.id = wt.workspace_id
    LEFT JOIN users owner ON owner.id = w.owner_user_id
    ${whereClause}
    ORDER BY wt.created_at DESC, wt.rowid DESC
    LIMIT @limit
  `).all(params) as AdminWalletTransactionRow[];
  return {
    transactions: rows.map(adminWalletTransactionFromRow)
  };
}

export function listAdminRechargeOrders(input: {
  handle: DatabaseHandle;
  workspaceId?: string;
  status?: string;
  provider?: string;
  limit?: number;
}): { orders: AdminRechargeOrderView[] } {
  const filters: string[] = [];
  const params: Record<string, unknown> = {
    limit: normalizeLimit(input.limit)
  };
  if (input.workspaceId) {
    filters.push("ro.workspace_id = @workspaceId");
    params.workspaceId = input.workspaceId;
  }
  if (input.status) {
    filters.push("ro.status = @status");
    params.status = input.status;
  }
  if (input.provider) {
    filters.push("ro.provider = @provider");
    params.provider = input.provider;
  }
  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = input.handle.sqlite.prepare(`
    SELECT
      ro.id,
      ro.workspace_id,
      COALESCE(w.name, ro.workspace_id) AS workspace_name,
      owner.email AS owner_email,
      ro.provider,
      ro.provider_session_id,
      ro.provider_payment_intent_id,
      ro.amount_cents,
      ro.currency,
      ro.credit_cents,
      ro.status,
      ro.checkout_url,
      ro.failure_reason,
      ro.metadata_json,
      ro.created_at,
      ro.updated_at,
      ro.completed_at,
      ro.expires_at
    FROM wallet_recharge_orders ro
    LEFT JOIN workspaces w ON w.id = ro.workspace_id
    LEFT JOIN users owner ON owner.id = w.owner_user_id
    ${whereClause}
    ORDER BY ro.created_at DESC, ro.rowid DESC
    LIMIT @limit
  `).all(params) as AdminRechargeOrderRow[];
  return {
    orders: rows.map(adminRechargeOrderFromRow)
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

function adminWalletTransactionFromRow(row: AdminWalletTransactionRow): AdminWalletTransactionView {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    ownerEmail: row.owner_email ?? undefined,
    type: row.type,
    amountCny: centsToCny(row.amount_cents),
    balanceAfterCny: centsToCny(row.balance_after_cents),
    reservedAfterCny: centsToCny(row.reserved_after_cents),
    reservationId: row.reservation_id ?? undefined,
    jobId: row.job_id ?? undefined,
    description: row.description ?? undefined,
    metadata: parseMetadata(row.metadata_json),
    createdAt: row.created_at
  };
}

function adminRechargeOrderFromRow(row: AdminRechargeOrderRow): AdminRechargeOrderView {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    ownerEmail: row.owner_email ?? undefined,
    provider: row.provider,
    providerSessionId: row.provider_session_id ?? undefined,
    providerPaymentIntentId: row.provider_payment_intent_id ?? undefined,
    paymentAmount: centsToCny(row.amount_cents),
    paymentAmountCents: row.amount_cents,
    paymentCurrency: row.currency,
    walletCurrency: "cny",
    creditCny: centsToCny(row.credit_cents),
    creditCents: row.credit_cents,
    status: row.status,
    checkoutUrl: row.checkout_url ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    metadata: parseMetadata(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    expiresAt: row.expires_at ?? undefined
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

function normalizeLimit(value: unknown): number {
  const parsed = Number(value ?? 100);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 100;
  }
  return Math.min(parsed, 500);
}

function parseMetadata(value: string | null): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}
