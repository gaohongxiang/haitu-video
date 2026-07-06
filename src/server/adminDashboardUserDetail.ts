import type {
  AdminUserDetail,
  AdminUserProductSummary,
  AdminUserWorkspaceSummary
} from "./adminDashboardTypes.js";
import { buildUserVideoJobs } from "./adminDashboardVideoJobs.js";
import type { DatabaseHandle } from "./db/client.js";
import { centsToCny } from "./walletLedger.js";

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  role: string | null;
  email_verified: number;
  created_at: string;
  workspace_count: number;
  product_count: number;
  video_job_count: number;
  total_balance_cents: number;
  total_recharge_cents: number;
  total_spend_cents: number;
  last_active_at: string | null;
}

interface DetailUserRow extends UserRow {
  last_session_at: string | null;
}

interface WorkspaceDetailRow {
  id: string;
  name: string;
  role: string;
  owner_email: string | null;
  member_count: number;
  product_count: number;
  video_job_count: number;
  completed_job_count: number;
  failed_job_count: number;
  queued_job_count: number;
  expired_job_count: number;
  last_video_job_at: string | null;
}

interface ProductDetailRow {
  id: string;
  workspace_id: string;
  sku: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface StatusCountRow {
  status: string;
  count: number;
}

export function buildAdminUserDetail(handle: DatabaseHandle, userId: string): AdminUserDetail {
  const user = findUserDetail(handle, userId);
  if (!user) {
    throw new Error("User not found");
  }
  const workspaces = buildUserWorkspaces(handle, userId);
  const products = buildUserProducts(handle, userId);
  const videoJobs = buildUserVideoJobs(handle, userId);
  return {
    user,
    videoStatusCounts: buildUserVideoStatusCounts(handle, userId),
    workspaces,
    products,
    videoJobs
  };
}

function findUserDetail(handle: DatabaseHandle, userId: string): AdminUserDetail["user"] | undefined {
  const row = handle.sqlite.prepare(`
    WITH latest_wallet AS (
      SELECT
        workspace_id,
        balance_after_cents,
        ROW_NUMBER() OVER (
          PARTITION BY workspace_id
          ORDER BY created_at DESC, rowid DESC
        ) AS row_number
      FROM wallet_transactions
    ),
    wallet_spend AS (
      SELECT workspace_id, SUM(ABS(amount_cents)) AS spend_cents
      FROM wallet_transactions
      WHERE type = 'charge'
      GROUP BY workspace_id
    ),
    paid_recharges AS (
      SELECT workspace_id, SUM(credit_cents) AS recharge_cents
      FROM wallet_recharge_orders
      WHERE status = 'paid'
      GROUP BY workspace_id
    ),
    finance_by_user AS (
      SELECT
        wm.user_id,
        SUM(COALESCE(lw.balance_after_cents, 0)) AS total_balance_cents,
        SUM(COALESCE(pr.recharge_cents, 0)) AS total_recharge_cents,
        SUM(COALESCE(ws.spend_cents, 0)) AS total_spend_cents
      FROM workspace_members wm
      LEFT JOIN latest_wallet lw ON lw.workspace_id = wm.workspace_id AND lw.row_number = 1
      LEFT JOIN paid_recharges pr ON pr.workspace_id = wm.workspace_id
      LEFT JOIN wallet_spend ws ON ws.workspace_id = wm.workspace_id
      WHERE wm.user_id = ?
      GROUP BY wm.user_id
    )
    SELECT
      au.id,
      au.email,
      u.display_name,
      COALESCE(u.role, 'user') AS role,
      au.email_verified,
      au.created_at,
      COUNT(DISTINCT wm.workspace_id) AS workspace_count,
      COUNT(DISTINCT p.id) AS product_count,
      COUNT(DISTINCT vj.id) AS video_job_count,
      COALESCE(fbu.total_balance_cents, 0) AS total_balance_cents,
      COALESCE(fbu.total_recharge_cents, 0) AS total_recharge_cents,
      COALESCE(fbu.total_spend_cents, 0) AS total_spend_cents,
      MAX(activity.active_at) AS last_active_at,
      MAX(session_activity.active_at) AS last_session_at
    FROM auth_users au
    LEFT JOIN users u ON u.id = au.id
    LEFT JOIN workspace_members wm ON wm.user_id = au.id
    LEFT JOIN products p ON p.workspace_id = wm.workspace_id
    LEFT JOIN video_jobs vj ON vj.workspace_id = wm.workspace_id
    LEFT JOIN finance_by_user fbu ON fbu.user_id = au.id
    LEFT JOIN (
      SELECT user_id, updated_at AS active_at
      FROM auth_sessions
      UNION ALL
      SELECT wm2.user_id, vj2.created_at AS active_at
      FROM video_jobs vj2
      INNER JOIN workspace_members wm2 ON wm2.workspace_id = vj2.workspace_id
    ) activity ON activity.user_id = au.id
    LEFT JOIN (
      SELECT user_id, updated_at AS active_at
      FROM auth_sessions
    ) session_activity ON session_activity.user_id = au.id
    WHERE au.id = ?
    GROUP BY au.id
  `).get(userId, userId) as DetailUserRow | undefined;
  if (!row) {
    return undefined;
  }
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name ?? undefined,
    role: row.role ?? "user",
    emailVerified: row.email_verified === 1,
    workspaceCount: row.workspace_count,
    productCount: row.product_count,
    videoJobCount: row.video_job_count,
    totalBalanceCny: centsToCny(row.total_balance_cents),
    totalRechargeCny: centsToCny(row.total_recharge_cents),
    totalSpendCny: centsToCny(row.total_spend_cents),
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at ?? undefined,
    lastSessionAt: row.last_session_at ?? undefined
  };
}

function buildUserWorkspaces(handle: DatabaseHandle, userId: string): AdminUserWorkspaceSummary[] {
  const rows = handle.sqlite.prepare(`
    WITH product_counts AS (
      SELECT workspace_id, COUNT(*) AS product_count
      FROM products
      GROUP BY workspace_id
    ), member_counts AS (
      SELECT workspace_id, COUNT(*) AS member_count
      FROM workspace_members
      GROUP BY workspace_id
    ), job_counts AS (
      SELECT
        workspace_id,
        COUNT(*) AS video_job_count,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_job_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_job_count,
        SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued_job_count,
        SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired_job_count,
        MAX(created_at) AS last_video_job_at
      FROM video_jobs
      GROUP BY workspace_id
    )
    SELECT
      w.id,
      w.name,
      wm.role,
      owner.email AS owner_email,
      COALESCE(mc.member_count, 0) AS member_count,
      COALESCE(pc.product_count, 0) AS product_count,
      COALESCE(jc.video_job_count, 0) AS video_job_count,
      COALESCE(jc.completed_job_count, 0) AS completed_job_count,
      COALESCE(jc.failed_job_count, 0) AS failed_job_count,
      COALESCE(jc.queued_job_count, 0) AS queued_job_count,
      COALESCE(jc.expired_job_count, 0) AS expired_job_count,
      jc.last_video_job_at
    FROM workspace_members wm
    INNER JOIN workspaces w ON w.id = wm.workspace_id
    LEFT JOIN users owner ON owner.id = w.owner_user_id
    LEFT JOIN member_counts mc ON mc.workspace_id = w.id
    LEFT JOIN product_counts pc ON pc.workspace_id = w.id
    LEFT JOIN job_counts jc ON jc.workspace_id = w.id
    WHERE wm.user_id = ?
    ORDER BY jc.last_video_job_at DESC NULLS LAST, w.created_at DESC
  `).all(userId) as WorkspaceDetailRow[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    ownerEmail: row.owner_email ?? undefined,
    memberCount: row.member_count,
    productCount: row.product_count,
    videoJobCount: row.video_job_count,
    completedJobCount: row.completed_job_count,
    failedJobCount: row.failed_job_count,
    queuedJobCount: row.queued_job_count,
    expiredJobCount: row.expired_job_count,
    lastVideoJobAt: row.last_video_job_at ?? undefined
  }));
}

function buildUserProducts(handle: DatabaseHandle, userId: string): AdminUserProductSummary[] {
  const rows = handle.sqlite.prepare(`
    SELECT p.id, p.workspace_id, p.sku, p.title, p.created_at, p.updated_at
    FROM products p
    INNER JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
    WHERE wm.user_id = ?
    ORDER BY p.updated_at DESC, p.created_at DESC
    LIMIT 50
  `).all(userId) as ProductDetailRow[];
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    sku: row.sku,
    title: row.title ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function buildUserVideoStatusCounts(handle: DatabaseHandle, userId: string): Record<string, number> {
  const rows = handle.sqlite.prepare(`
    SELECT vj.status, COUNT(*) AS count
    FROM video_jobs vj
    INNER JOIN workspace_members wm ON wm.workspace_id = vj.workspace_id
    WHERE wm.user_id = ?
    GROUP BY vj.status
  `).all(userId) as StatusCountRow[];
  return Object.fromEntries(rows.map((row) => [row.status, row.count]));
}
