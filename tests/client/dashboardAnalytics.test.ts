import { describe, expect, it, vi } from "vitest";

import {
  buildDashboardAnalytics,
  buildProviderRows,
  buildTrendPoints,
  filterRowsByRange,
  type DashboardRecentRow
} from "../../src/client/dashboardAnalytics.js";
import type { Ledger, LedgerJob, VideoJob } from "../../src/client/videoCreativeVersions.js";

function videoJob(overrides: Partial<VideoJob> & Pick<VideoJob, "id" | "createdAt">): VideoJob {
  const { id, createdAt, ...rest } = overrides;
  return {
    id,
    status: rest.status ?? "completed",
    productPath: rest.productPath ?? "products/sku-1.json",
    productSku: rest.productSku ?? "SKU-1",
    confirmPaid: rest.confirmPaid ?? false,
    outDir: rest.outDir ?? "output/job",
    createdAt,
    updatedAt: rest.updatedAt ?? createdAt,
    ...rest
  };
}

function ledgerJob(overrides: Partial<LedgerJob> & Pick<LedgerJob, "id">): LedgerJob {
  const { id, ...rest } = overrides;
  return {
    id,
    reportPath: rest.reportPath ?? "reports/console-1782000000000.json",
    productSku: rest.productSku ?? "SKU-1",
    provider: rest.provider ?? "volcengine-seedance",
    status: rest.status ?? "completed",
    durationSeconds: rest.durationSeconds,
    totalTokens: rest.totalTokens ?? 0,
    estimatedCostCny: rest.estimatedCostCny ?? 0,
    hasFinalVideo: rest.hasFinalVideo ?? false,
    selectedFinal: rest.selectedFinal ?? false,
    contentReview: rest.contentReview ?? {
      available: true,
      subtitleLines: [],
      hashtags: []
    },
    ...rest
  };
}

function ledger(jobs: LedgerJob[]): Ledger {
  return {
    summary: {
      totalJobs: jobs.length,
      completedJobs: jobs.filter((job) => job.status === "completed").length,
      failedJobs: jobs.filter((job) => job.status === "failed").length,
      paidJobs: 0,
      mockJobs: 0,
      totalTokens: jobs.reduce((total, job) => total + job.totalTokens, 0),
      estimatedCostCny: jobs.reduce((total, job) => total + job.estimatedCostCny, 0),
      finalVideos: 0,
      reusedRawManifests: 0,
      recoveredRawOutputs: 0
    },
    jobs,
    products: []
  };
}

describe("dashboard analytics", () => {
  it("combines live video jobs with ledger rows without double-counting ids", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T12:00:00.000"));
    try {
      const ledgerReportPath = `reports/console-${new Date("2026-06-24T20:30:00.000").getTime()}.json`;
      const analytics = buildDashboardAnalytics({
        ledger: ledger([
          ledgerJob({
            id: "job-live",
            productSku: "SKU-LIVE",
            provider: "volcengine-seedance",
            totalTokens: 1200,
            estimatedCostCny: 0.42,
            durationSeconds: 10
          }),
          ledgerJob({
            id: "ledger-only",
            productSku: "SKU-LEDGER",
            provider: "mock",
            totalTokens: 300,
            estimatedCostCny: 0.11,
            reportPath: ledgerReportPath
          })
        ]),
        videoJobs: [
          videoJob({
            id: "job-live",
            status: "completed",
            productPath: "products/live.json",
            createdAt: "2026-06-25T10:00:00.000"
          }),
          videoJob({
            id: "job-running",
            status: "running",
            productPath: "products/running.json",
            productSku: "SKU-RUNNING",
            provider: "mock",
            createdAt: "2026-06-25T11:00:00.000"
          }),
          videoJob({
            id: "job-failed-old",
            status: "failed",
            productPath: "products/old.json",
            productSku: "SKU-OLD",
            provider: "mock",
            createdAt: "2026-06-20T11:00:00.000"
          })
        ],
        range: "24h",
        granularity: "hour"
      });

      expect(analytics.recent.map((row) => row.id)).toEqual(["job-running", "job-live", "ledger-only"]);
      expect(analytics.providerRows).toEqual([
        {
          name: "volcengine-seedance",
          jobs: 1,
          completed: 1,
          active: 0,
          totalTokens: 1200,
          estimatedCostCny: 0.42
        },
        {
          name: "mock",
          jobs: 2,
          completed: 1,
          active: 1,
          totalTokens: 300,
          estimatedCostCny: 0.11
        }
      ]);
      expect(analytics.activeJobs).toBe(1);
      expect(analytics.queuedJobs).toBe(0);
      expect(analytics.failedJobs).toBe(0);
      expect(analytics.trend.map((point) => point.label)).toEqual(["06-24 20:00", "06-25 10:00", "06-25 11:00"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("builds provider rows and trend buckets with stable ordering", () => {
    const rows: DashboardRecentRow[] = [
      {
        id: "a",
        label: "a",
        productSku: "SKU-A",
        provider: "mock",
        status: "completed",
        totalTokens: 100,
        estimatedCostCny: 0.1,
        createdAt: "2026-06-25T10:10:00.000"
      },
      {
        id: "b",
        label: "b",
        productSku: "SKU-B",
        provider: "mock",
        status: "running",
        totalTokens: 200,
        estimatedCostCny: 0.2,
        createdAt: "2026-06-25T10:50:00.000"
      },
      {
        id: "c",
        label: "c",
        productSku: "SKU-C",
        provider: "volcengine-seedance",
        status: "completed",
        totalTokens: 1000,
        estimatedCostCny: 2,
        createdAt: "2026-06-25T11:00:00.000"
      }
    ];

    expect(buildProviderRows(rows).map((row) => row.name)).toEqual(["volcengine-seedance", "mock"]);
    expect(buildTrendPoints(rows, "hour")).toEqual([
      { label: "06-25 10:00", jobs: 2, totalTokens: 300, estimatedCostCny: 0.3 },
      { label: "06-25 11:00", jobs: 1, totalTokens: 1000, estimatedCostCny: 2 }
    ]);
  });

  it("filters rows by selected time range while retaining rows with unknown dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T12:00:00.000"));
    try {
      const rows: DashboardRecentRow[] = [
        { id: "recent", label: "recent", productSku: "SKU", provider: "mock", status: "completed", totalTokens: 1, estimatedCostCny: 0, createdAt: "2026-06-25T11:59:00.000" },
        { id: "old", label: "old", productSku: "SKU", provider: "mock", status: "completed", totalTokens: 1, estimatedCostCny: 0, createdAt: "2026-06-24T11:59:00.000" },
        { id: "unknown", label: "unknown", productSku: "SKU", provider: "mock", status: "completed", totalTokens: 1, estimatedCostCny: 0 }
      ];

      expect(filterRowsByRange(rows, "24h").map((row) => row.id)).toEqual(["recent", "unknown"]);
      expect(filterRowsByRange(rows, "all").map((row) => row.id)).toEqual(["recent", "old", "unknown"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
