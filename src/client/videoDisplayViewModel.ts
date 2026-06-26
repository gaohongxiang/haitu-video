import type { ProductDraft } from "./productComposerText.js";
import type { ProductDetail, ProductSummary } from "./productWorkflowViewModel.js";
import type { VideoDownloadProductContext } from "./videoDownloadName.js";
import {
  hasPlayableVideo,
  isExpiredVideo,
  type CreativeVersionItem,
  type VideoJob,
  type VideoJobErrorDetails
} from "./videoCreativeVersions.js";
import { readableVideoProviderError } from "../core/videoProviderErrors.js";

export interface AbsoluteMinuteFormatOptions {
  currentYear?: number;
}

export function videoJobResultHint(job: VideoJob): string {
  if (job.status === "completed") return "暂无成片入口";
  if (job.status === "failed" && job.canRecoverDownload) return "视频已生成，但服务器下载成片失败，可重新下载成片";
  if (job.status === "failed") return "任务失败，可直接重试原任务";
  if (job.status === "canceled") return "任务已取消";
  return "任务完成后显示成片和报告";
}

export function statusLabel(value?: string): string {
  if (value === "queued") return "排队中";
  if (value === "running") return "生成中";
  if (value === "completed" || value === "succeeded") return "已完成";
  if (value === "failed") return "失败";
  if (value === "canceled" || value === "cancelled") return "已取消";
  return value || "-";
}

export function videoLabel(index: number): string {
  return `视频 ${index + 1}`;
}

export function formatHistoryTime(value: string, options: AbsoluteMinuteFormatOptions = {}): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatAbsoluteMinuteTime(value, options);
}

export function historyPreview(value: string): string {
  return splitLines(value).slice(0, 2).join("\n") || "空分镜";
}

export function creativeVersionStatusLabel(value?: string): string {
  if (value === "completed" || value === "succeeded") return "可预览";
  if (value === "queued") return "排队中";
  if (value === "running") return "生成中";
  if (value === "failed") return "生成失败";
  if (value === "canceled" || value === "cancelled") return "已取消";
  return value || "-";
}

export function creativeVersionDisplayStatus(job: CreativeVersionItem): string {
  if (isExpiredVideo(job)) return "已过期";
  if (hasPlayableVideo(job)) return "可预览";
  if (job.status === "completed" || job.status === "succeeded") return "已完成";
  return creativeVersionStatusLabel(job.status);
}

export function creativeVersionFailureReason(job: CreativeVersionItem): string {
  if (job.status !== "failed") {
    return "";
  }
  return readableVideoJobError(job.videoJob?.error, job.videoJob?.errorDetails) || "生成失败，请检查视频模型配置后重试。";
}

export function creativeVersionLifecycleHint(job: CreativeVersionItem, options: AbsoluteMinuteFormatOptions = {}): string {
  const failureReason = creativeVersionFailureReason(job);
  if (failureReason) return failureReason;
  if (hasPlayableVideo(job)) return videoExpiryLabel(job, options);
  return "";
}

export function readableVideoJobError(message?: string, details?: VideoJobErrorDetails): string {
  return readableVideoProviderError(details ? { ...details, message: message ?? details.message, rawMessage: details.message } : message);
}

export function videoExpiryLabel(job: { expiresAt?: string; expired?: boolean }, options: AbsoluteMinuteFormatOptions = {}): string {
  if (isExpiredVideo(job)) return "已过期";
  if (!job.expiresAt) return "24 小时内可下载";
  const expiresAt = Date.parse(job.expiresAt);
  if (!Number.isFinite(expiresAt)) return "24 小时内可下载";
  return `将于 ${formatDeletionTime(expiresAt, options)} 删除`;
}

export function formatDeletionTime(value: number, options: AbsoluteMinuteFormatOptions = {}): string {
  return formatAbsoluteMinuteTime(value, options);
}

export function formatAbsoluteMinuteTime(value: string | number, options: AbsoluteMinuteFormatOptions = {}): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const currentYear = options.currentYear ?? new Date().getFullYear();
  const sameYear = date.getFullYear() === currentYear;
  return date.toLocaleString("zh-CN", {
    ...(sameYear ? {} : { year: "numeric" as const }),
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function videoDownloadProductContext(product: ProductDetail | undefined, draft: ProductDraft, importText: string): VideoDownloadProductContext {
  return {
    title: product?.title_ja || draft.title_ja,
    title_ja: product?.title_ja || draft.title_ja,
    sku: product?.sku || draft.sku,
    sourceText: importText || product?.source_text || draft.source_text,
    source_text: product?.source_text || draft.source_text || importText
  };
}

export function videoJobDownloadProductContext(job: VideoJob, products: ProductSummary[]): VideoDownloadProductContext {
  const product = products.find((item) => item.sku === job.productSku || item.path === job.productPath);
  return {
    title: product?.title_ja,
    title_ja: product?.title_ja,
    sku: job.productSku
  };
}

export function formatCreativeVersionTime(job: CreativeVersionItem, options: AbsoluteMinuteFormatOptions = {}): string {
  if (job.status !== "completed" && job.status !== "succeeded" && !hasPlayableVideo(job)) {
    return "";
  }
  const completedAt = job.completedAt ?? job.createdAt;
  if (!completedAt) return "";
  const date = new Date(completedAt);
  if (Number.isNaN(date.getTime())) return "";
  return formatAbsoluteMinuteTime(completedAt, options);
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
