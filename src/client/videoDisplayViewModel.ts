import type { ProductDraft } from "./productComposerText.js";
import type { ProductDetail, ProductSummary } from "./productWorkflowViewModel.js";
import type { VideoDownloadProductContext } from "./videoDownloadName.js";
import type { AppLocale } from "../i18n/config.js";
import { appText } from "../i18n/appText.js";
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
  locale?: AppLocale;
}

export function videoJobResultHint(job: VideoJob, locale?: AppLocale): string {
  if (job.status === "completed") return appText("ledger.jobs.resultHints.completed", locale);
  if (job.status === "failed" && job.canRecoverDownload) return appText("ledger.jobs.resultHints.recoverableDownload", locale);
  if (job.status === "failed") return appText("ledger.jobs.resultHints.failed", locale);
  if (job.status === "canceled") return appText("ledger.jobs.resultHints.canceled", locale);
  return appText("ledger.jobs.resultHints.pending", locale);
}

export function statusLabel(value?: string, locale?: AppLocale): string {
  if (value === "queued" || value === "running" || value === "completed" || value === "succeeded" || value === "failed" || value === "canceled" || value === "cancelled") {
    return appText(`status.jobStatuses.${value}`, locale);
  }
  return value || "-";
}

export function videoLabel(index: number, locale?: AppLocale): string {
  return appText("videoStudio.labels.video", locale, { index: index + 1 });
}

export function formatHistoryTime(value: string, options: AbsoluteMinuteFormatOptions = {}): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatAbsoluteMinuteTime(value, options);
}

export function historyPreview(value: string, locale?: AppLocale): string {
  return splitLines(value).slice(0, 2).join("\n") || appText("videoStudio.storyboard.emptyPreview", locale);
}

export function creativeVersionStatusLabel(value?: string, locale?: AppLocale): string {
  if (value === "completed" || value === "succeeded") return appText("videoStudio.videoStatus.previewable", locale);
  if (value === "queued") return appText("videoStudio.videoStatus.queued", locale);
  if (value === "running") return appText("videoStudio.videoStatus.running", locale);
  if (value === "failed") return appText("videoStudio.videoStatus.failed", locale);
  if (value === "canceled" || value === "cancelled") return appText("videoStudio.videoStatus.canceled", locale);
  return value || "-";
}

export function creativeVersionDisplayStatus(job: CreativeVersionItem, locale?: AppLocale): string {
  if (isExpiredVideo(job)) return appText("videoStudio.videoStatus.expired", locale);
  if (hasPlayableVideo(job)) return appText("videoStudio.videoStatus.previewable", locale);
  if (job.status === "completed" || job.status === "succeeded") return appText("videoStudio.videoStatus.completed", locale);
  return creativeVersionStatusLabel(job.status, locale);
}

export function creativeVersionFailureReason(job: CreativeVersionItem, locale?: AppLocale): string {
  if (job.status !== "failed") {
    return "";
  }
  return readableVideoJobError(job.videoJob?.error, job.videoJob?.errorDetails, locale) || appText("ledger.jobs.errors.generationFailed", locale);
}

export function creativeVersionLifecycleHint(job: CreativeVersionItem, options: AbsoluteMinuteFormatOptions = {}, locale?: AppLocale): string {
  const failureReason = creativeVersionFailureReason(job, locale);
  if (failureReason) return failureReason;
  if (hasPlayableVideo(job)) return videoExpiryLabel(job, options);
  return "";
}

export function readableVideoJobError(message?: string, details?: VideoJobErrorDetails, locale?: AppLocale): string {
  const readable = readableVideoProviderError(details ? { ...details, message: message ?? details.message, rawMessage: details.message } : message);
  return localizedReadableVideoProviderError(readable, locale);
}

export function videoExpiryLabel(job: { expiresAt?: string; expired?: boolean }, options: AbsoluteMinuteFormatOptions = {}): string {
  if (isExpiredVideo(job)) return appText("videoStudio.videoStatus.expired", options.locale);
  if (!job.expiresAt) return appText("videoStudio.history.downloadWindow", options.locale);
  const expiresAt = Date.parse(job.expiresAt);
  if (!Number.isFinite(expiresAt)) return appText("videoStudio.history.downloadWindow", options.locale);
  return appText("videoStudio.history.deleteAt", options.locale, { time: formatDeletionTime(expiresAt, options) });
}

export function formatDeletionTime(value: number, options: AbsoluteMinuteFormatOptions = {}): string {
  return formatAbsoluteMinuteTime(value, options);
}

export function formatAbsoluteMinuteTime(value: string | number, options: AbsoluteMinuteFormatOptions = {}): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const currentYear = options.currentYear ?? new Date().getFullYear();
  const sameYear = date.getFullYear() === currentYear;
  return date.toLocaleString(options.locale === "en" ? "en-US" : "zh-CN", {
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

function localizedReadableVideoProviderError(message: string, locale?: AppLocale): string {
  if (!message || locale !== "en") {
    return message;
  }
  const referenceDownloadMatch = message.match(/^第\s*(\d+)\s*张参考图现在不能用于生成。请重新上传这张图，或删除后换一张图片再生成。$/);
  if (referenceDownloadMatch?.[1]) {
    return appText("ledger.jobs.errors.referenceImageUnavailable", locale, { index: referenceDownloadMatch[1] });
  }
  const tooManyReferencesMatch = message.match(/^参考图太多：Seedance 最多支持\s*(\d+)\s*张，本次有\s*(\d+)\s*张。生成时只使用前\s*(\d+)\s*张，请调整顺序或删除多余图片后重试。$/);
  if (tooManyReferencesMatch?.[1] && tooManyReferencesMatch[2] && tooManyReferencesMatch[3]) {
    return appText("ledger.jobs.errors.tooManyReferenceImagesWithCount", locale, {
      max: tooManyReferencesMatch[1],
      count: tooManyReferencesMatch[2],
      used: tooManyReferencesMatch[3]
    });
  }
  const tooManyReferencesNoCountMatch = message.match(/^参考图太多：Seedance 最多支持\s*(\d+)\s*张。生成时只使用前\s*(\d+)\s*张，请调整顺序或删除多余图片后重试。$/);
  if (tooManyReferencesNoCountMatch?.[1] && tooManyReferencesNoCountMatch[2]) {
    return appText("ledger.jobs.errors.tooManyReferenceImages", locale, {
      max: tooManyReferencesNoCountMatch[1],
      used: tooManyReferencesNoCountMatch[2]
    });
  }
  const exactMatches: Record<string, string> = {
    "参考图里可能包含真人、人脸或隐私信息，视频平台已拒绝生成。请移除含人物或人脸的参考图，保留纯商品图后重试。": "ledger.jobs.errors.referenceSensitive",
    "还没有配置视频模型 API Key。请先到 API 管理里配置或选择视频模型服务，再生成视频。": "ledger.jobs.errors.videoApiKeyMissing",
    "视频已经生成，但服务器下载成片超时。请点击重新下载成片；如果连续失败，可能是服务器到视频文件服务器的网络不稳定。": "ledger.jobs.errors.outputDownloadTimeout",
    "视频平台请求超时或网络连接失败，请稍后重试；如果连续失败，请检查视频模型配置和参考图链接。": "ledger.jobs.errors.providerNetworkTimeout",
    "视频平台请求太频繁或触发限流，请稍后再试。": "ledger.jobs.errors.rateLimited",
    "视频平台账号额度不足或余额异常，请检查火山/Seedance 账号额度后再试。": "ledger.jobs.errors.providerQuota",
    "视频平台账号欠费或余额异常，请检查火山/Seedance 账号账单和余额后重试。": "ledger.jobs.errors.providerBilling",
    "提示词太长，视频平台拒绝了这次生成。请缩短商品描述、卖点或分镜内容后重试。": "ledger.jobs.errors.promptTooLong",
    "视频平台根据内部规则拒绝了这次生成。优先处理参考图：删除真人、人脸、二维码、联系方式、品牌授权不明或过度暴露的图片；再缩短卖点和分镜，避免夸大功效、绝对化表述和敏感词后重试。": "ledger.jobs.errors.internalRule"
  };
  const key = exactMatches[message];
  return key ? appText(key, locale) : message;
}
