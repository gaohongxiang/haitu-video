import { describe, expect, it, vi } from "vitest";

import {
  buildLatestCreativeJobs,
  hasPlayableVideo,
  mergeVideoJobs,
  removeLedgerJob,
  type Ledger,
  type LedgerJob,
  type VideoJob
} from "../../src/client/videoCreativeVersions.js";

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
    status: rest.status ?? "completed",
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
      completedJobs: jobs.length,
      failedJobs: 0,
      paidJobs: 0,
      mockJobs: jobs.length,
      totalTokens: 0,
      estimatedCostCny: 0,
      finalVideos: jobs.filter((job) => job.hasFinalVideo).length,
      reusedRawManifests: 0,
      recoveredRawOutputs: 0
    },
    jobs,
    products: [
      {
        productSku: "SKU-1",
        jobCount: jobs.filter((job) => job.productSku === "SKU-1").length,
        completedJobs: 0,
        paidJobs: 0,
        mockJobs: 0,
        totalTokens: 0,
        estimatedCostCny: 0,
        finalVideos: 0,
        latestJobId: "job-keep",
        jobs: jobs.filter((job) => job.productSku === "SKU-1")
      },
      {
        productSku: "SKU-2",
        jobCount: jobs.filter((job) => job.productSku === "SKU-2").length,
        completedJobs: 0,
        paidJobs: 0,
        mockJobs: 0,
        totalTokens: 0,
        estimatedCostCny: 0,
        finalVideos: 0,
        latestJobId: "job-remove-only",
        jobs: jobs.filter((job) => job.productSku === "SKU-2")
      }
    ].filter((product) => product.jobs.length > 0)
  };
}

describe("video creative versions", () => {
  it("merges video jobs by id with incoming jobs winning and sorts newest first", () => {
    const merged = mergeVideoJobs(
      [
        videoJob({ id: "job-a", status: "completed", createdAt: "2026-06-20T10:00:00.000Z" }),
        videoJob({ id: "job-b", status: "running", createdAt: "2026-06-21T10:00:00.000Z" })
      ],
      [
        videoJob({ id: "job-a", status: "running", createdAt: "2026-06-19T10:00:00.000Z" }),
        videoJob({ id: "job-c", status: "queued", createdAt: "2026-06-22T10:00:00.000Z" })
      ]
    );

    expect(merged.map((job) => job.id)).toEqual(["job-c", "job-b", "job-a"]);
    expect(merged.find((job) => job.id === "job-a")?.status).toBe("completed");
  });

  it("builds latest creative versions from live jobs first and ignores canceled live jobs", () => {
    const versions = buildLatestCreativeJobs({
      actionProduct: {
        path: "products/sku-1.json",
        sku: "SKU-1"
      },
      ledgerJobs: [
        ledgerJob({
          id: "job-live",
          finalVideoUrl: "/media/old.mp4",
          hasFinalVideo: true,
          contentReview: {
            available: true,
            subtitleLines: [],
            hashtags: ["#ledger"]
          }
        }),
        ledgerJob({
          id: "job-ledger",
          reportPath: "reports/console-1781900000000.json",
          finalVideoUrl: "/media/ledger.mp4",
          hasFinalVideo: true
        })
      ],
      videoJobs: [
        videoJob({
          id: "job-live",
          status: "completed",
          createdAt: "2026-06-22T10:00:00.000Z",
          completedAt: "2026-06-22T10:01:00.000Z",
          finalVideoUrl: "/media/live.mp4",
          hashtags: ["#live"]
        }),
        videoJob({
          id: "job-canceled",
          status: "canceled",
          createdAt: "2026-06-23T10:00:00.000Z",
          finalVideoUrl: "/media/canceled.mp4"
        }),
        videoJob({
          id: "job-other-product",
          productSku: "SKU-2",
          productPath: "products/sku-2.json",
          createdAt: "2026-06-24T10:00:00.000Z",
          finalVideoUrl: "/media/other.mp4"
        })
      ]
    });

    expect(versions.map((job) => job.id)).toEqual(["job-live", "job-ledger"]);
    expect(versions[0]?.source).toBe("video-job");
    expect(versions[0]?.finalVideoUrl).toBe("/media/live.mp4");
    expect(versions[0]?.hashtags).toEqual(["#live"]);
  });

  it("removes a ledger job from flat and grouped job lists", () => {
    const nextLedger = removeLedgerJob(
      ledger([
        ledgerJob({ id: "job-keep", productSku: "SKU-1" }),
        ledgerJob({ id: "job-remove", productSku: "SKU-1" }),
        ledgerJob({ id: "job-remove-only", productSku: "SKU-2" })
      ]),
      "job-remove"
    );

    expect(nextLedger.jobs.map((job) => job.id)).toEqual(["job-keep", "job-remove-only"]);
    expect(nextLedger.products.find((product) => product.productSku === "SKU-1")?.jobs.map((job) => job.id)).toEqual(["job-keep"]);
    expect(nextLedger.products.find((product) => product.productSku === "SKU-1")?.jobCount).toBe(1);
    expect(nextLedger.products.find((product) => product.productSku === "SKU-2")?.jobs.map((job) => job.id)).toEqual(["job-remove-only"]);
  });

  it("treats expired videos as not playable even when a video URL is present", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T00:00:00.000Z"));
    try {
      expect(hasPlayableVideo({ finalVideoUrl: "/media/video.mp4", expiresAt: "2026-06-19T23:59:59.000Z" })).toBe(false);
      expect(hasPlayableVideo({ finalVideoUrl: "/media/video.mp4", expiresAt: "2026-06-20T00:01:00.000Z" })).toBe(true);
      expect(hasPlayableVideo({ finalVideoUrl: "/media/video.mp4", expired: true })).toBe(false);
      expect(hasPlayableVideo({ finalOutputPath: "output/video.mp4" })).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
