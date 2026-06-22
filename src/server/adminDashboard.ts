import { readFileSync } from "node:fs";

import { readableVideoProviderError, type ReadableVideoProviderErrorInput } from "../core/videoProviderErrors.js";
import type { DatabaseHandle } from "./db/client.js";

export interface AdminOverview {
  metrics: {
    totalUsers: number;
    verifiedUsers: number;
    newUsersToday: number;
    newUsers7d: number;
    activeUsers7d: number;
    totalWorkspaces: number;
    totalProducts: number;
    totalVideoJobs: number;
  };
  growth: Array<{
    date: string;
    registrations: number;
  }>;
  activity: Array<{
    date: string;
    activeUsers: number;
    events: number;
  }>;
  users: AdminUserSummary[];
}

export interface AdminUserSummary {
  id: string;
  email: string;
  displayName?: string;
  role: string;
  emailVerified: boolean;
  workspaceCount: number;
  productCount: number;
  videoJobCount: number;
  createdAt: string;
  lastActiveAt?: string;
}

export interface AdminUserDetail {
  user: AdminUserSummary & {
    lastSessionAt?: string;
  };
  videoStatusCounts: Record<string, number>;
  workspaces: AdminUserWorkspaceSummary[];
  products: AdminUserProductSummary[];
  videoJobs: AdminUserVideoJobSummary[];
}

export interface AdminUserWorkspaceSummary {
  id: string;
  name: string;
  role: string;
  ownerEmail?: string;
  memberCount: number;
  productCount: number;
  videoJobCount: number;
  completedJobCount: number;
  failedJobCount: number;
  queuedJobCount: number;
  expiredJobCount: number;
  lastVideoJobAt?: string;
}

export interface AdminUserProductSummary {
  id: string;
  workspaceId: string;
  sku: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserVideoJobSummary {
  id: string;
  workspaceId: string;
  productId?: string;
  productSku?: string;
  productTitle?: string;
  status: string;
  provider?: string;
  model?: string;
  language?: string;
  durationSeconds?: number;
  outputCount?: number;
  jobDir: string;
  error?: string;
  errorDetails?: ReadableVideoProviderErrorInput;
  readableError?: string;
  createdAt: string;
  completedAt?: string;
  expiresAt?: string;
}

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

interface VideoJobDetailRow {
  id: string;
  workspace_id: string;
  product_id: string | null;
  product_sku: string | null;
  product_title: string | null;
  status: string;
  model: string | null;
  language: string | null;
  duration_seconds: number | null;
  output_count: number | null;
  job_dir: string;
  created_at: string;
  completed_at: string | null;
  expires_at: string | null;
}

interface StatusCountRow {
  status: string;
  count: number;
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

function findUserDetail(handle: DatabaseHandle, userId: string): AdminUserDetail["user"] | undefined {
  const row = handle.sqlite.prepare(`
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
      MAX(activity.active_at) AS last_active_at,
      MAX(session_activity.active_at) AS last_session_at
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
    LEFT JOIN (
      SELECT user_id, updated_at AS active_at
      FROM auth_sessions
    ) session_activity ON session_activity.user_id = au.id
    WHERE au.id = ?
    GROUP BY au.id
  `).get(userId) as DetailUserRow | undefined;
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

function buildUserVideoJobs(handle: DatabaseHandle, userId: string): AdminUserVideoJobSummary[] {
  const rows = handle.sqlite.prepare(`
    SELECT
      vj.id,
      vj.workspace_id,
      vj.product_id,
      p.sku AS product_sku,
      p.title AS product_title,
      vj.status,
      vj.model,
      vj.language,
      vj.duration_seconds,
      vj.output_count,
      vj.job_dir,
      vj.created_at,
      vj.completed_at,
      vj.expires_at
    FROM video_jobs vj
    INNER JOIN workspace_members wm ON wm.workspace_id = vj.workspace_id
    LEFT JOIN products p ON p.id = vj.product_id
    WHERE wm.user_id = ?
    ORDER BY vj.created_at DESC
    LIMIT 50
  `).all(userId) as VideoJobDetailRow[];
  return rows.map((row) => {
    const metadata = readVideoJobMetadata(row.job_dir);
    const error = typeof metadata.error === "string" ? metadata.error : undefined;
    const errorDetails = parseAdminVideoJobErrorDetails(metadata.errorDetails);
    const readableError = row.status === "failed"
      ? readableAdminVideoJobError(error, errorDetails)
      : undefined;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      productId: row.product_id ?? undefined,
      productSku: row.product_sku ?? undefined,
      productTitle: row.product_title ?? undefined,
      status: row.status,
      provider: providerFromModel(row.model),
      model: row.model ?? undefined,
      language: row.language ?? undefined,
      durationSeconds: row.duration_seconds ?? undefined,
      outputCount: row.output_count ?? undefined,
      jobDir: row.job_dir,
      error,
      errorDetails,
      readableError,
      createdAt: row.created_at,
      completedAt: row.completed_at ?? undefined,
      expiresAt: row.expires_at ?? undefined
    };
  });
}

function readVideoJobMetadata(jobDir: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readFileSync(`${jobDir}/job.json`, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function parseAdminVideoJobErrorDetails(value: unknown): ReadableVideoProviderErrorInput | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const input = value as Record<string, unknown>;
  if (typeof input.message !== "string" || !input.message) {
    return undefined;
  }
  return {
    message: input.message,
    rawMessage: typeof input.rawMessage === "string" ? input.rawMessage : undefined,
    causeMessage: typeof input.causeMessage === "string" ? input.causeMessage : undefined,
    causeCode: typeof input.causeCode === "string" ? input.causeCode : undefined,
    providerPhase: typeof input.providerPhase === "string" ? input.providerPhase : undefined,
    providerName: typeof input.providerName === "string" ? input.providerName : undefined,
    providerModel: typeof input.providerModel === "string" ? input.providerModel : undefined,
    referenceImageCount: typeof input.referenceImageCount === "number" ? input.referenceImageCount : undefined
  };
}

function readableAdminVideoJobError(error: string | undefined, details: ReadableVideoProviderErrorInput | undefined): string | undefined {
  const message = readableVideoProviderError(details ? {
    ...details,
    message: error ?? details.message,
    rawMessage: details.message
  } : error);
  return message || undefined;
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

function providerFromModel(model: string | null): string | undefined {
  if (!model) {
    return undefined;
  }
  return model === "mock" ? "mock" : "volcengine-seedance";
}
