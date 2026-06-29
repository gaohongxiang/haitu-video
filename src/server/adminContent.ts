import type { DatabaseHandle } from "./db/client.js";

export interface AdminContentSummary {
  metrics: {
    totalProducts: number;
    totalVideoJobs: number;
    completedVideoJobs: number;
    failedVideoJobs: number;
    totalVideoAssets: number;
    totalStoryboards: number;
  };
  statusCounts: Array<{
    status: string;
    count: number;
  }>;
  recentVideoJobs: AdminContentVideoJobView[];
}

export interface AdminContentProductView {
  id: string;
  workspaceId: string;
  workspaceName: string;
  ownerEmail?: string;
  sku: string;
  title?: string;
  videoJobCount: number;
  assetCount: number;
  storyboardCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminContentVideoJobView {
  id: string;
  workspaceId: string;
  workspaceName: string;
  ownerEmail?: string;
  productId?: string;
  productSku?: string;
  productTitle?: string;
  status: string;
  model?: string;
  language?: string;
  durationSeconds?: number;
  outputCount?: number;
  assetCount: number;
  jobDir: string;
  createdAt: string;
  completedAt?: string;
  expiresAt?: string;
}

interface CountRow {
  count: number;
}

interface StatusCountRow {
  status: string;
  count: number;
}

interface AdminContentProductRow {
  id: string;
  workspace_id: string;
  workspace_name: string;
  owner_email: string | null;
  sku: string;
  title: string | null;
  video_job_count: number;
  asset_count: number;
  storyboard_count: number;
  created_at: string;
  updated_at: string;
}

interface AdminContentVideoJobRow {
  id: string;
  workspace_id: string;
  workspace_name: string;
  owner_email: string | null;
  product_id: string | null;
  product_sku: string | null;
  product_title: string | null;
  status: string;
  model: string | null;
  language: string | null;
  duration_seconds: number | null;
  output_count: number | null;
  asset_count: number;
  job_dir: string;
  created_at: string;
  completed_at: string | null;
  expires_at: string | null;
}

export function buildAdminContentSummary(handle: DatabaseHandle): AdminContentSummary {
  return {
    metrics: {
      totalProducts: count(handle, "SELECT COUNT(*) AS count FROM products"),
      totalVideoJobs: count(handle, "SELECT COUNT(*) AS count FROM video_jobs"),
      completedVideoJobs: count(handle, "SELECT COUNT(*) AS count FROM video_jobs WHERE status = 'completed'"),
      failedVideoJobs: count(handle, "SELECT COUNT(*) AS count FROM video_jobs WHERE status = 'failed'"),
      totalVideoAssets: count(handle, "SELECT COUNT(*) AS count FROM video_assets"),
      totalStoryboards: count(handle, "SELECT COUNT(*) AS count FROM storyboards")
    },
    statusCounts: listVideoJobStatusCounts(handle),
    recentVideoJobs: listAdminContentVideoJobs({ handle, limit: 8 }).videoJobs
  };
}

export function listAdminContentProducts(input: {
  handle: DatabaseHandle;
  workspaceId?: string;
  limit?: number;
}): { products: AdminContentProductView[] } {
  const filters: string[] = [];
  const params: Record<string, unknown> = {
    limit: normalizeLimit(input.limit)
  };
  if (input.workspaceId) {
    filters.push("p.workspace_id = @workspaceId");
    params.workspaceId = input.workspaceId;
  }
  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = input.handle.sqlite.prepare(`
    SELECT
      p.id,
      p.workspace_id,
      COALESCE(w.name, p.workspace_id) AS workspace_name,
      owner.email AS owner_email,
      p.sku,
      p.title,
      COUNT(DISTINCT vj.id) AS video_job_count,
      COUNT(DISTINCT va.id) AS asset_count,
      COUNT(DISTINCT sb.id) AS storyboard_count,
      p.created_at,
      p.updated_at
    FROM products p
    LEFT JOIN workspaces w ON w.id = p.workspace_id
    LEFT JOIN users owner ON owner.id = w.owner_user_id
    LEFT JOIN video_jobs vj ON vj.product_id = p.id
    LEFT JOIN video_assets va ON va.job_id = vj.id
    LEFT JOIN storyboards sb ON sb.product_id = p.id
    ${whereClause}
    GROUP BY p.id
    ORDER BY p.updated_at DESC, p.created_at DESC
    LIMIT @limit
  `).all(params) as AdminContentProductRow[];
  return {
    products: rows.map(adminContentProductFromRow)
  };
}

export function listAdminContentVideoJobs(input: {
  handle: DatabaseHandle;
  workspaceId?: string;
  status?: string;
  limit?: number;
}): { videoJobs: AdminContentVideoJobView[] } {
  const filters: string[] = [];
  const params: Record<string, unknown> = {
    limit: normalizeLimit(input.limit)
  };
  if (input.workspaceId) {
    filters.push("vj.workspace_id = @workspaceId");
    params.workspaceId = input.workspaceId;
  }
  if (input.status) {
    filters.push("vj.status = @status");
    params.status = input.status;
  }
  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = input.handle.sqlite.prepare(`
    SELECT
      vj.id,
      vj.workspace_id,
      COALESCE(w.name, vj.workspace_id) AS workspace_name,
      owner.email AS owner_email,
      vj.product_id,
      p.sku AS product_sku,
      p.title AS product_title,
      vj.status,
      vj.model,
      vj.language,
      vj.duration_seconds,
      vj.output_count,
      COUNT(DISTINCT va.id) AS asset_count,
      vj.job_dir,
      vj.created_at,
      vj.completed_at,
      vj.expires_at
    FROM video_jobs vj
    LEFT JOIN workspaces w ON w.id = vj.workspace_id
    LEFT JOIN users owner ON owner.id = w.owner_user_id
    LEFT JOIN products p ON p.id = vj.product_id
    LEFT JOIN video_assets va ON va.job_id = vj.id
    ${whereClause}
    GROUP BY vj.id
    ORDER BY vj.created_at DESC, vj.rowid DESC
    LIMIT @limit
  `).all(params) as AdminContentVideoJobRow[];
  return {
    videoJobs: rows.map(adminContentVideoJobFromRow)
  };
}

function listVideoJobStatusCounts(handle: DatabaseHandle): AdminContentSummary["statusCounts"] {
  const rows = handle.sqlite.prepare(`
    SELECT status, COUNT(*) AS count
    FROM video_jobs
    GROUP BY status
    ORDER BY status ASC
  `).all() as StatusCountRow[];
  return rows.map((row) => ({
    status: row.status,
    count: row.count
  }));
}

function adminContentProductFromRow(row: AdminContentProductRow): AdminContentProductView {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    ownerEmail: row.owner_email ?? undefined,
    sku: row.sku,
    title: row.title ?? undefined,
    videoJobCount: row.video_job_count,
    assetCount: row.asset_count,
    storyboardCount: row.storyboard_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function adminContentVideoJobFromRow(row: AdminContentVideoJobRow): AdminContentVideoJobView {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    ownerEmail: row.owner_email ?? undefined,
    productId: row.product_id ?? undefined,
    productSku: row.product_sku ?? undefined,
    productTitle: row.product_title ?? undefined,
    status: row.status,
    model: row.model ?? undefined,
    language: row.language ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
    outputCount: row.output_count ?? undefined,
    assetCount: row.asset_count,
    jobDir: row.job_dir,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
    expiresAt: row.expires_at ?? undefined
  };
}

function count(handle: DatabaseHandle, sql: string): number {
  const row = handle.sqlite.prepare(sql).get() as CountRow | undefined;
  return row?.count ?? 0;
}

function normalizeLimit(value: unknown): number {
  const parsed = Number(value ?? 100);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 100;
  }
  return Math.min(parsed, 500);
}
