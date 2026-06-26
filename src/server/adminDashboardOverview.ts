import type { DatabaseHandle } from "./db/client.js";
import type {
  AdminOverview,
  AdminUserSummary
} from "./adminDashboardTypes.js";

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
      MAX(activity.active_at) AS last_active_at
    FROM auth_users au
    LEFT JOIN users u ON u.id = au.id
    LEFT JOIN workspace_members wm ON wm.user_id = au.id
    LEFT JOIN products p ON p.workspace_id = wm.workspace_id
    LEFT JOIN video_jobs vj ON vj.workspace_id = wm.workspace_id
    LEFT JOIN (
      SELECT user_id, updated_at AS active_at
      FROM auth_sessions
      UNION ALL
      SELECT wm2.user_id, vj2.created_at AS active_at
      FROM video_jobs vj2
      INNER JOIN workspace_members wm2 ON wm2.workspace_id = vj2.workspace_id
    ) activity ON activity.user_id = au.id
    GROUP BY au.id
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
