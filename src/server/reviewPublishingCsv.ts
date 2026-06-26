import type { ManualVersionReview } from "./reviewStore.js";

export interface InternalValidationCsvProduct {
  sku: string;
  title_ja: string;
  referenceImageCount: number;
}

export interface InternalValidationCsvJob {
  id: string;
  provider?: string;
  status?: string;
  durationSeconds?: number;
  manualReview?: ManualVersionReview;
  totalTokens: number;
  estimatedCostCny: number;
  hasFinalVideo: boolean;
}

export interface InternalValidationCsvGroup {
  jobCount: number;
  reviewedJobs: number;
  jobs: InternalValidationCsvJob[];
}

export interface PublishPackageCsvItem {
  productSku: string;
  jobId: string;
  provider?: string;
  taskId?: string;
  durationSeconds?: number;
  totalTokens: number;
  estimatedCostCny: number;
  fileUrls: {
    videoUrl: string;
    subtitleUrl?: string;
    finalManifestUrl?: string;
    manifestUrl: string;
  };
  hashtags: string[];
  selectedFinalNote?: string;
  createdAt: string;
}

export function buildInternalValidationCsvRows(input: {
  products: InternalValidationCsvProduct[];
  groupsBySku: Map<string, InternalValidationCsvGroup>;
}): string[][] {
  return [
    [
      "商品SKU",
      "商品标题",
      "参考图数量",
      "版本数",
      "任务ID",
      "生成通道",
      "任务状态",
      "时长秒",
      "审核结论",
      "评分",
      "人工备注",
      "Token",
      "估算成本CNY",
      "最终视频",
      "缺口提示"
    ],
    ...input.products.flatMap((product) => {
      const group = input.groupsBySku.get(product.sku);
      if (!group?.jobs.length) {
        return [[
          product.sku,
          product.title_ja,
          String(product.referenceImageCount),
          "0",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "0",
          "0",
          "否",
          internalValidationGapText({
            referenceImageCount: product.referenceImageCount,
            versionCount: 0,
            reviewedCount: 0
          })
        ]];
      }
      return group.jobs.map((job) => [
        product.sku,
        product.title_ja,
        String(product.referenceImageCount),
        String(group.jobCount),
        job.id,
        providerDisplayName(job.provider),
        statusDisplayName(job.status),
        job.durationSeconds === undefined ? "" : String(job.durationSeconds),
        manualReviewDisplayName(job.manualReview?.decision),
        job.manualReview?.score === undefined ? "" : String(job.manualReview.score),
        job.manualReview?.note ?? "",
        String(job.totalTokens),
        String(job.estimatedCostCny),
        job.hasFinalVideo ? "是" : "否",
        internalValidationGapText({
          referenceImageCount: product.referenceImageCount,
          versionCount: group.jobCount,
          reviewedCount: group.reviewedJobs
        })
      ]);
    })
  ];
}

export function buildPublishPackagesCsvRows(packages: PublishPackageCsvItem[]): string[][] {
  return [
    [
      "商品SKU",
      "任务ID",
      "生成通道",
      "Task ID",
      "时长秒",
      "Token",
      "估算成本CNY",
      "视频地址",
      "字幕地址",
      "成品Manifest",
      "发布清单",
      "日文标签",
      "人工备注",
      "创建时间"
    ],
    ...packages.map((item) => [
      item.productSku,
      item.jobId,
      providerDisplayName(item.provider),
      item.taskId ?? "",
      item.durationSeconds === undefined ? "" : String(item.durationSeconds),
      String(item.totalTokens),
      String(item.estimatedCostCny),
      item.fileUrls.videoUrl,
      item.fileUrls.subtitleUrl ?? "",
      item.fileUrls.finalManifestUrl ?? "",
      item.fileUrls.manifestUrl,
      item.hashtags.join(" "),
      item.selectedFinalNote ?? "",
      item.createdAt
    ])
  ];
}

export function rowsToCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function internalValidationGapText(input: {
  referenceImageCount: number;
  versionCount: number;
  reviewedCount: number;
}): string {
  const gaps = [];
  const missingReferenceImages = Math.max(0, 3 - input.referenceImageCount);
  const missingVersions = Math.max(0, 3 - input.versionCount);
  const missingReviews = Math.max(0, input.versionCount - input.reviewedCount);
  if (missingReferenceImages > 0) gaps.push(`补 ${missingReferenceImages} 张参考图`);
  if (missingVersions > 0) gaps.push(`补 ${missingVersions} 个版本`);
  if (missingReviews > 0) gaps.push(`审 ${missingReviews} 个版本`);
  return gaps.join(" / ") || "达标";
}

function providerDisplayName(value?: string): string {
  if (value === "mock") return "内部任务";
  if (value === "volcengine-seedance") return "火山引擎 Seedance";
  return value ?? "";
}

function statusDisplayName(value?: string): string {
  if (value === "queued") return "排队中";
  if (value === "running") return "生成中";
  if (value === "completed" || value === "succeeded") return "已完成";
  if (value === "failed") return "失败";
  if (value === "canceled" || value === "cancelled") return "已取消";
  return value ?? "";
}

function manualReviewDisplayName(value?: string): string {
  if (value === "publishable") return "可发布";
  if (value === "needs-edit") return "需微调";
  if (value === "rejected") return "淘汰";
  return "";
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}
