import type { Ledger, VideoJob } from "./videoCreativeVersions.js";

export type DashboardRange = "24h" | "7d" | "30d" | "all";
export type DashboardGranularity = "hour" | "day";

export interface DashboardProviderRow {
  name: string;
  jobs: number;
  completed: number;
  active: number;
  totalTokens: number;
  estimatedCostCny: number;
}

export interface DashboardTrendPoint {
  label: string;
  jobs: number;
  totalTokens: number;
  estimatedCostCny: number;
}

export interface DashboardRecentRow {
  id: string;
  label: string;
  productSku: string;
  provider: string;
  status: string;
  durationSeconds?: number;
  totalTokens: number;
  estimatedCostCny: number;
  createdAt?: string;
}

export interface DashboardAnalytics {
  providerRows: DashboardProviderRow[];
  trend: DashboardTrendPoint[];
  recent: DashboardRecentRow[];
  activeJobs: number;
  queuedJobs: number;
  failedJobs: number;
}

export function buildDashboardAnalytics(input: {
  ledger?: Ledger;
  videoJobs: VideoJob[];
  range: DashboardRange;
  granularity: DashboardGranularity;
}): DashboardAnalytics {
  const ledgerJobs = input.ledger?.jobs ?? input.ledger?.products.flatMap((group) => group.jobs) ?? [];
  const ledgerById = new Map(ledgerJobs.map((job) => [job.id, job]));
  const videoJobIds = new Set(input.videoJobs.map((job) => job.id));
  const usageRows: DashboardRecentRow[] = [
    ...input.videoJobs.map((job) => {
      const ledgerJob = ledgerById.get(job.id);
      return toDashboardRecentRow({
        id: job.id,
        productSku: job.productSku ?? ledgerJob?.productSku ?? productNameFromPath(job.productPath),
        provider: job.provider ?? ledgerJob?.provider ?? "mock",
        status: job.status,
        durationSeconds: job.durationSeconds ?? ledgerJob?.durationSeconds,
        totalTokens: ledgerJob?.totalTokens ?? 0,
        estimatedCostCny: ledgerJob?.estimatedCostCny ?? 0,
        createdAt: job.createdAt
      });
    }),
    ...ledgerJobs
      .filter((job) => !videoJobIds.has(job.id))
      .map((job) =>
        toDashboardRecentRow({
          id: job.id,
          productSku: job.productSku ?? "unknown",
          provider: job.provider ?? "unknown",
          status: job.status ?? "completed",
          durationSeconds: job.durationSeconds,
          totalTokens: job.totalTokens,
          estimatedCostCny: job.estimatedCostCny,
          createdAt: createdAtFromJobId(job.id) ?? createdAtFromReportPath(job.reportPath)
        })
      )
  ];
  const filteredRows = filterRowsByRange(usageRows, input.range);
  return {
    providerRows: buildProviderRows(filteredRows),
    trend: buildTrendPoints(filteredRows, input.granularity),
    recent: [...filteredRows].sort(compareRecentRows).slice(0, 12),
    activeJobs: input.videoJobs.filter((job) => job.status === "queued" || job.status === "running").length,
    queuedJobs: input.videoJobs.filter((job) => job.status === "queued").length,
    failedJobs: filteredRows.filter((row) => row.status === "failed").length
  };
}

export function buildProviderRows(rows: DashboardRecentRow[]): DashboardProviderRow[] {
  const groups = new Map<string, DashboardProviderRow>();
  for (const row of rows) {
    const name = row.provider || "unknown";
    const current = groups.get(name) ?? {
      name,
      jobs: 0,
      completed: 0,
      active: 0,
      totalTokens: 0,
      estimatedCostCny: 0
    };
    current.jobs += 1;
    current.completed += row.status === "completed" ? 1 : 0;
    current.active += row.status === "queued" || row.status === "running" ? 1 : 0;
    current.totalTokens += row.totalTokens;
    current.estimatedCostCny = roundMoney(current.estimatedCostCny + row.estimatedCostCny);
    groups.set(name, current);
  }
  return Array.from(groups.values()).sort(
    (left, right) => right.estimatedCostCny - left.estimatedCostCny || right.jobs - left.jobs || left.name.localeCompare(right.name)
  );
}

export function buildTrendPoints(rows: DashboardRecentRow[], granularity: DashboardGranularity): DashboardTrendPoint[] {
  const buckets = new Map<string, DashboardTrendPoint>();
  const sorted = [...rows].sort((left, right) => rowTimestamp(left) - rowTimestamp(right));
  for (const row of sorted) {
    const key = trendBucketKey(row.createdAt, granularity);
    const current = buckets.get(key) ?? {
      label: key,
      jobs: 0,
      totalTokens: 0,
      estimatedCostCny: 0
    };
    current.jobs += 1;
    current.totalTokens += row.totalTokens;
    current.estimatedCostCny = roundMoney(current.estimatedCostCny + row.estimatedCostCny);
    buckets.set(key, current);
  }
  return Array.from(buckets.values()).slice(-24);
}

export function filterRowsByRange(rows: DashboardRecentRow[], range: DashboardRange): DashboardRecentRow[] {
  if (range === "all") {
    return rows;
  }
  const hours = range === "24h" ? 24 : range === "7d" ? 24 * 7 : 24 * 30;
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return rows.filter((row) => !row.createdAt || Date.parse(row.createdAt) >= cutoff);
}

function toDashboardRecentRow(input: {
  id: string;
  productSku: string;
  provider: string;
  status: string;
  durationSeconds?: number;
  totalTokens: number;
  estimatedCostCny: number;
  createdAt?: string;
}): DashboardRecentRow {
  return {
    ...input,
    label: input.createdAt ? shortTimeLabel(input.createdAt) : input.id.replace(/^job-/, "").slice(-8)
  };
}

function compareRecentRows(left: DashboardRecentRow, right: DashboardRecentRow): number {
  return rowTimestamp(right) - rowTimestamp(left) || right.id.localeCompare(left.id);
}

function rowTimestamp(row: DashboardRecentRow): number {
  return row.createdAt ? Date.parse(row.createdAt) || 0 : 0;
}

function trendBucketKey(value: string | undefined, granularity: DashboardGranularity): string {
  if (!value) {
    return "历史";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "历史";
  }
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  if (granularity === "day") {
    return `${month}-${day}`;
  }
  const hour = String(date.getHours()).padStart(2, "0");
  return `${month}-${day} ${hour}:00`;
}

function shortTimeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function createdAtFromJobId(id: string): string | undefined {
  const match = id.match(/job-(\d{14})/);
  if (!match) {
    return undefined;
  }
  const raw = match[1] ?? "";
  const year = raw.slice(0, 4);
  const month = raw.slice(4, 6);
  const day = raw.slice(6, 8);
  const hour = raw.slice(8, 10);
  const minute = raw.slice(10, 12);
  const second = raw.slice(12, 14);
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function createdAtFromReportPath(path?: string): string | undefined {
  if (!path) {
    return undefined;
  }
  const match = path.match(/console-(\d{13})/);
  if (!match) {
    return undefined;
  }
  const date = new Date(Number(match[1]));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function productNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop()?.replace(/\.json$/i, "") || "unknown";
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
