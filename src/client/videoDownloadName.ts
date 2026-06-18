export interface VideoDownloadNameJob {
  id?: string;
  createdAt?: string;
  completedAt?: string;
}

export interface VideoDownloadProductContext {
  title?: string;
  title_ja?: string;
  sku?: string;
  sourceText?: string;
  source_text?: string;
}

const preferredChineseNameLabels = ["中文商品名", "商品中文名", "中文名"];
const generalNameLabels = ["商品名称", "商品名稱", "商品名", "产品名", "產品名", "标题", "標題", "title"];

export function videoDownloadFileName(job: VideoDownloadNameJob, product?: VideoDownloadProductContext): string {
  const rawName =
    extractChineseProductName(product?.sourceText) ||
    extractChineseProductName(product?.source_text) ||
    extractChineseProductName(product?.title) ||
    extractChineseProductName(product?.title_ja) ||
    product?.title?.trim() ||
    product?.title_ja?.trim() ||
    product?.sku?.trim() ||
    job.id?.trim() ||
    "商品视频";
  return `${sanitizeDownloadFileNameSegment(rawName)}_${formatDownloadTimestamp(job.completedAt ?? job.createdAt)}.mp4`;
}

export function extractChineseProductName(sourceText?: string): string {
  if (!sourceText?.trim()) {
    return "";
  }
  return (
    readLabeledValue(sourceText, preferredChineseNameLabels, { allowJapaneseKana: true }) ||
    readLabeledValue(sourceText, generalNameLabels, { allowJapaneseKana: false }) ||
    ""
  );
}

export function sanitizeDownloadFileNameSegment(value: string): string {
  const sanitized = value
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (sanitized || "商品视频").slice(0, 80).trim() || "商品视频";
}

export function formatDownloadTimestamp(value?: string): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return formatDownloadTimestamp();
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}_${hour}${minute}`;
}

function readLabeledValue(sourceText: string, labels: string[], options: { allowJapaneseKana: boolean }): string {
  for (const line of sourceText.split(/\r?\n/)) {
    for (const label of labels) {
      const escapedLabel = escapeRegExp(label);
      const match = line.match(new RegExp(`^\\s*[【\\[]?\\s*${escapedLabel}\\s*[】\\]]?\\s*[：:]\\s*(.+?)\\s*$`, "i"));
      const value = match?.[1]?.trim();
      if (value && /[\u3400-\u9fff]/.test(value) && (options.allowJapaneseKana || !/[\u3040-\u30ff]/.test(value))) {
        return value;
      }
    }
  }
  return "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
