import { describe, expect, it } from "vitest";

import {
  creativeVersionDisplayStatus,
  creativeVersionFailureReason,
  creativeVersionLifecycleHint,
  formatAbsoluteMinuteTime,
  formatCreativeVersionTime,
  formatHistoryTime,
  historyPreview,
  readableVideoJobError,
  statusLabel,
  videoDownloadProductContext,
  videoExpiryLabel,
  videoJobDownloadProductContext,
  videoJobResultHint,
  videoLabel
} from "../../src/client/videoDisplayViewModel.js";
import type { ProductDraft } from "../../src/client/productComposerText.js";
import type { ProductDetail, ProductSummary } from "../../src/client/productWorkflowViewModel.js";
import type { CreativeVersionItem, VideoJob } from "../../src/client/videoCreativeVersions.js";

function videoJob(overrides: Partial<VideoJob> = {}): VideoJob {
  return {
    id: overrides.id ?? "job-1",
    status: overrides.status ?? "queued",
    productPath: overrides.productPath ?? "products/a.json",
    confirmPaid: overrides.confirmPaid ?? false,
    outDir: overrides.outDir ?? "output/job-1",
    createdAt: overrides.createdAt ?? "2026-06-25T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-25T10:00:00.000Z",
    ...overrides
  };
}

function productSummary(overrides: Partial<ProductSummary> = {}): ProductSummary {
  return {
    path: overrides.path ?? "products/a.json",
    sku: overrides.sku ?? "SKU-1",
    title_ja: overrides.title_ja ?? "商品 A",
    ...overrides
  };
}

function productDetail(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    ...productSummary(overrides),
    category: overrides.category ?? "カテゴリ",
    materials: overrides.materials ?? [],
    dimensions: overrides.dimensions ?? "",
    verified_selling_points: overrides.verified_selling_points ?? [],
    usage_scenes: overrides.usage_scenes ?? [],
    forbidden_claims: overrides.forbidden_claims ?? [],
    reference_images: overrides.reference_images ?? [],
    source_text: overrides.source_text,
    reference_image_statuses: overrides.reference_image_statuses
  };
}

function draft(overrides: Partial<ProductDraft> = {}): ProductDraft {
  return {
    sku: overrides.sku ?? "DRAFT-SKU",
    title_ja: overrides.title_ja ?? "草稿商品",
    category: overrides.category ?? "",
    materials: overrides.materials ?? "",
    dimensions: overrides.dimensions ?? "",
    verified_selling_points: overrides.verified_selling_points ?? "",
    usage_scenes: overrides.usage_scenes ?? "",
    forbidden_claims: overrides.forbidden_claims ?? "",
    reference_images: overrides.reference_images ?? "",
    source_text: overrides.source_text ?? "草稿原文"
  };
}

function creativeVersion(overrides: Partial<CreativeVersionItem> = {}): CreativeVersionItem {
  return {
    id: overrides.id ?? "version-1",
    status: overrides.status ?? "completed",
    selectedFinal: overrides.selectedFinal ?? false,
    hasFinalVideo: overrides.hasFinalVideo ?? false,
    source: overrides.source ?? "ledger",
    ...overrides
  };
}

describe("video display view-model helpers", () => {
  it("keeps status labels, result hints, and simple labels stable", () => {
    expect(statusLabel("queued")).toBe("排队中");
    expect(statusLabel("succeeded")).toBe("已完成");
    expect(statusLabel("cancelled")).toBe("已取消");
    expect(statusLabel("custom")).toBe("custom");
    expect(videoLabel(2)).toBe("视频 3");
    expect(statusLabel("queued", "en")).toBe("Queued");
    expect(videoLabel(2, "en")).toBe("Video 3");
    expect(videoJobResultHint(videoJob({ status: "completed" }))).toBe("暂无成片入口");
    expect(videoJobResultHint(videoJob({ status: "failed", canRecoverDownload: true }))).toBe("视频已生成，但服务器下载成片失败，可重新下载成片");
    expect(videoJobResultHint(videoJob({ status: "failed" }))).toBe("任务失败，可直接重试原任务");
    expect(videoJobResultHint(videoJob({ status: "canceled" }))).toBe("任务已取消");
    expect(videoJobResultHint(videoJob({ status: "running" }))).toBe("任务完成后显示成片和报告");
  });

  it("localizes video task result hints and known provider errors for English UI", () => {
    expect(videoJobResultHint(videoJob({ status: "completed" }), "en")).toBe("No final video entry yet");
    expect(videoJobResultHint(videoJob({ status: "failed", canRecoverDownload: true }), "en")).toBe("The video was generated, but the server could not download it. Download it again.");
    expect(videoJobResultHint(videoJob({ status: "failed" }), "en")).toBe("Task failed. You can retry the original task.");
    expect(videoJobResultHint(videoJob({ status: "canceled" }), "en")).toBe("Task canceled");
    expect(videoJobResultHint(videoJob({ status: "running" }), "en")).toBe("The final video and report will appear after the task completes");

    const localizedError = readableVideoJobError(
      "视频平台拒绝了这次生成请求。请检查商品资料、参考图和视频模型配置后重试。",
      {
        message: 'Volcengine Seedance API error: {"error":{"code":"InvalidParameter","message":"The format of parameter content[1].image_url is illegal: resource download failed"}}'
      },
      "en"
    );
    expect(localizedError).toBe("Reference image 1 cannot be used for generation right now. Re-upload it, or delete it and use another image.");
    expect(localizedError).not.toContain("参考图");
    expect(creativeVersionFailureReason(creativeVersion({ status: "failed", videoJob: videoJob({ status: "failed" }) }), "en")).toBe("Generation failed. Check your video model settings and try again.");
  });

  it("formats history, expiry, and creative version times without relative labels", () => {
    expect(formatAbsoluteMinuteTime("2026-06-25T08:09:00.000Z", { currentYear: 2026 })).toContain("06/25");
    expect(formatAbsoluteMinuteTime("2025-06-25T08:09:00.000Z", { currentYear: 2026 })).toContain("2025");
    expect(formatAbsoluteMinuteTime("bad-date", { currentYear: 2026 })).toBe("bad-date");
    expect(formatHistoryTime("bad-date", { currentYear: 2026 })).toBe("bad-date");
    expect(historyPreview(" 第一行 \n 第二行 \n 第三行 ")).toBe("第一行\n第二行");
    expect(historyPreview("   ")).toBe("空提示词");
    expect(historyPreview("   ", "en")).toBe("Empty prompt");
    expect(videoExpiryLabel({ expired: true }, { currentYear: 2026 })).toBe("已过期");
    expect(videoExpiryLabel({}, { currentYear: 2026 })).toBe("24 小时内可下载");
    expect(videoExpiryLabel({}, { currentYear: 2026, locale: "en" })).toBe("Downloadable within 24 hours");
    expect(videoExpiryLabel({ expiresAt: "bad-date" }, { currentYear: 2026 })).toBe("24 小时内可下载");
    expect(videoExpiryLabel({ expiresAt: "2026-12-25T08:09:00.000Z" }, { currentYear: 2026 })).toContain("将于");
    expect(videoExpiryLabel({ expiresAt: "2026-12-25T08:09:00.000Z" }, { currentYear: 2026, locale: "en" })).toContain("Deletes at");
    expect(formatCreativeVersionTime(creativeVersion({ status: "running", createdAt: "2026-06-25T08:09:00.000Z" }), { currentYear: 2026 })).toBe("");
    expect(formatCreativeVersionTime(creativeVersion({ status: "completed", completedAt: "2026-06-25T08:09:00.000Z" }), { currentYear: 2026 })).toContain("06/25");
  });

  it("builds display status and lifecycle hints from creative version state", () => {
    expect(creativeVersionDisplayStatus(creativeVersion({ expired: true }))).toBe("已过期");
    expect(creativeVersionDisplayStatus(creativeVersion({ finalVideoUrl: "/video.mp4", hasFinalVideo: true }))).toBe("可预览");
    expect(creativeVersionDisplayStatus(creativeVersion({ status: "completed" }))).toBe("已完成");
    expect(creativeVersionDisplayStatus(creativeVersion({ status: "failed" }))).toBe("生成失败");
    expect(creativeVersionDisplayStatus(creativeVersion({ status: "failed" }), "en")).toBe("Failed");
    expect(creativeVersionLifecycleHint(creativeVersion({ status: "failed", videoJob: videoJob({ status: "failed", error: "provider failed" }) }))).toBe("provider failed");
    expect(creativeVersionLifecycleHint(creativeVersion({ finalVideoUrl: "/video.mp4", hasFinalVideo: true }))).toBe("24 小时内可下载");
  });

  it("builds product contexts for video download names", () => {
    expect(videoDownloadProductContext(productDetail({ sku: "SKU-P", title_ja: "保存商品", source_text: "保存原文" }), draft(), "导入文本")).toEqual({
      title: "保存商品",
      title_ja: "保存商品",
      sku: "SKU-P",
      sourceText: "导入文本",
      source_text: "保存原文"
    });
    expect(videoDownloadProductContext(undefined, draft({ sku: "DRAFT", title_ja: "草稿", source_text: "草稿原文" }), "")).toMatchObject({
      title: "草稿",
      sku: "DRAFT",
      sourceText: "草稿原文"
    });
    expect(videoJobDownloadProductContext(videoJob({ productSku: "SKU-2", productPath: "products/b.json" }), [
      productSummary({ path: "products/a.json", sku: "SKU-1", title_ja: "A" }),
      productSummary({ path: "products/b.json", sku: "SKU-2", title_ja: "B" })
    ])).toEqual({ title: "B", title_ja: "B", sku: "SKU-2" });
  });
});
