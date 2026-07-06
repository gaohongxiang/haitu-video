import type { DatabaseHandle } from "./db/client.js";
import type {
  AdminOverview,
  AdminUserSummary
} from "./adminDashboardTypes.js";
import { centsToCny } from "./walletLedger.js";

interface CountRow {
  count: number;
}

interface GrowthRow {
  day: string;
  count: number;
}

interface ActivityRow {
  day: string;
  active_users: number;
  events: number;
}

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

export function buildAdminOverview(handle: DatabaseHandle, now = new Date()): AdminOverview {
  const days = recentDayKeys(now, 30);
  const today = days.at(-1) ?? isoDay(now);
  const sevenDayStart = days.at(-7) ?? today;
  const totalUsers = count(handle, "SELECT COUNT(*) AS count FROM auth_users");
  const verifiedUsers = count(handle, "SELECT COUNT(*) AS count FROM auth_users WHERE email_verified = 1");
  const newUsersToday = count(handle, "SELECT COUNT(*) AS count FROM auth_users WHERE date(created_at) = date(?)", today);
  const newUsers7d = count(handle, "SELECT COUNT(*) AS count FROM auth_users WHERE date(created_at) >= date(?)", sevenDayStart);
  const totalWorkspaces = count(handle, "SELECT COUNT(*) AS count FROM workspaces");
  const totalProducts = count(handle, "SELECT COUNT(*) AS count FROM products");
  const totalVideoJobs = count(handle, "SELECT COUNT(*) AS count FROM video_jobs");
  const activeUsers7d = count(handle, `
    SELECT COUNT(DISTINCT user_id) AS count
    FROM (
      SELECT user_id, updated_at AS active_at
      FROM auth_sessions
      UNION ALL
      SELECT wm.user_id, vj.created_at AS active_at
      FROM video_jobs vj
      INNER JOIN workspace_members wm ON wm.workspace_id = vj.workspace_id
    )
    WHERE date(active_at) >= date(?)
  `, sevenDayStart);

  return {
    metrics: {
      totalUsers,
      verifiedUsers,
      newUsersToday,
      newUsers7d,
      activeUsers7d,
      totalWorkspaces,
      totalProducts,
      totalVideoJobs
    },
    growth: buildGrowth(handle, days),
    activity: buildActivity(handle, days),
    users: buildUsers(handle)
  };
}

function buildGrowth(handle: DatabaseHandle, days: string[]): AdminOverview["growth"] {
  const rows = handle.sqlite.prepare(`
    SELECT date(created_at) AS day, COUNT(*) AS count
    FROM auth_users
    WHERE date(created_at) >= date(?)
    GROUP BY date(created_at)
  `).all(days[0]) as GrowthRow[];
  const byDay = new Map(rows.map((row) => [row.day, row.count]));
  return days.map((date) => ({
    date,
    registrations: byDay.get(date) ?? 0
  }));
}

function buildActivity(handle: DatabaseHandle, days: string[]): AdminOverview["activity"] {
  const rows = handle.sqlite.prepare(`
    SELECT date(active_at) AS day, COUNT(DISTINCT user_id) AS active_users, COUNT(*) AS events
    FROM (
      SELECT user_id, updated_at AS active_at
      FROM auth_sessions
      UNION ALL
      SELECT wm.user_id, vj.created_at AS active_at
      FROM video_jobs vj
      INNER JOIN workspace_members wm ON wm.workspace_id = vj.workspace_id
    )
    WHERE date(active_at) >= date(?)
    GROUP BY date(active_at)
  `).all(days[0]) as ActivityRow[];
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return days.map((date) => {
    const row = byDay.get(date);
    return {
      date,
      activeUsers: row?.active_users ?? 0,
      events: row?.events ?? 0
    };
  });
}

function buildUsers(handle: DatabaseHandle): AdminUserSummary[] {
  const rows = handle.sqlite.prepare(`
    WITH user_workspaces AS (
      SELECT user_id, workspace_id
      FROM workspace_members
    ),
    workspace_counts AS (
      SELECT user_id, COUNT(DISTINCT workspace_id) AS workspace_count
      FROM user_workspaces
      GROUP BY user_id
    ),
    product_counts AS (
      SELECT uw.user_id, COUNT(DISTINCT p.id) AS product_count
      FROM user_workspaces uw
      LEFT JOIN products p ON p.workspace_id = uw.workspace_id
      GROUP BY uw.user_id
    ),
    video_job_counts AS (
      SELECT uw.user_id, COUNT(DISTINCT vj.id) AS video_job_count
      FROM user_workspaces uw
      LEFT JOIN video_jobs vj ON vj.workspace_id = uw.workspace_id
      GROUP BY uw.user_id
    ),
    latest_activity AS (
      SELECT user_id, MAX(active_at) AS last_active_at
      FROM (
        SELECT user_id, updated_at AS active_at
        FROM auth_sessions
        UNION ALL
        SELECT wm.user_id, vj.created_at AS active_at
        FROM video_jobs vj
        INNER JOIN workspace_members wm ON wm.workspace_id = vj.workspace_id
      )
      GROUP BY user_id
    ),
    latest_wallet AS (
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
        uw.user_id,
        SUM(COALESCE(lw.balance_after_cents, 0)) AS total_balance_cents,
        SUM(COALESCE(pr.recharge_cents, 0)) AS total_recharge_cents,
        SUM(COALESCE(ws.spend_cents, 0)) AS total_spend_cents
      FROM user_workspaces uw
      LEFT JOIN latest_wallet lw ON lw.workspace_id = uw.workspace_id AND lw.row_number = 1
      LEFT JOIN paid_recharges pr ON pr.workspace_id = uw.workspace_id
      LEFT JOIN wallet_spend ws ON ws.workspace_id = uw.workspace_id
      GROUP BY uw.user_id
    )
    SELECT
      au.id,
      au.email,
      u.display_name,
      COALESCE(u.role, 'user') AS role,
      au.email_verified,
      au.created_at,
      COALESCE(wc.workspace_count, 0) AS workspace_count,
      COALESCE(pc.product_count, 0) AS product_count,
      COALESCE(vjc.video_job_count, 0) AS video_job_count,
      COALESCE(fbu.total_balance_cents, 0) AS total_balance_cents,
      COALESCE(fbu.total_recharge_cents, 0) AS total_recharge_cents,
      COALESCE(fbu.total_spend_cents, 0) AS total_spend_cents,
      la.last_active_at
    FROM auth_users au
    LEFT JOIN users u ON u.id = au.id
    LEFT JOIN workspace_counts wc ON wc.user_id = au.id
    LEFT JOIN product_counts pc ON pc.user_id = au.id
    LEFT JOIN video_job_counts vjc ON vjc.user_id = au.id
    LEFT JOIN finance_by_user fbu ON fbu.user_id = au.id
    LEFT JOIN latest_activity la ON la.user_id = au.id
    ORDER BY au.created_at DESC
  `).all() as UserRow[];
  return rows.map((row) => ({
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
    lastActiveAt: row.last_active_at ?? undefined
  }));
}

function count(handle: DatabaseHandle, sql: string, ...params: unknown[]): number {
  const row = handle.sqlite.prepare(sql).get(...params) as CountRow | undefined;
  return row?.count ?? 0;
}

function recentDayKeys(now: Date, count: number): string[] {
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: count }, (_, index) => {
    const offset = index - count + 1;
    return isoDay(new Date(todayUtc + offset * 24 * 60 * 60 * 1000));
  });
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
