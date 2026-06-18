import { describe, expect, it, vi } from "vitest";

import {
  extractChineseProductName,
  formatDownloadTimestamp,
  sanitizeDownloadFileNameSegment,
  videoDownloadFileName
} from "../../src/client/videoDownloadName.js";

describe("video download file names", () => {
  it("uses a Chinese product name from source text and appends the generated time", () => {
    expect(videoDownloadFileName(
      { id: "job-1", createdAt: "2026-06-18T09:21:00.000Z" },
      {
        title_ja: "カード収納ミニ財布",
        source_text: "商品名：卡片收纳迷你钱包\n标题：カード収納ミニ財布"
      }
    )).toBe("卡片收纳迷你钱包_20260618_1721.mp4");
  });

  it("falls back to the product title and strips unsafe filename characters", () => {
    expect(videoDownloadFileName(
      { id: "job-2", completedAt: "2026-06-18T10:05:00.000Z" },
      { title_ja: "ミニ財布 / ブラック:限定版" }
    )).toBe("ミニ財布 ブラック 限定版_20260618_1805.mp4");
  });

  it("extracts only labeled Chinese product names", () => {
    expect(extractChineseProductName("中文商品名：冷感防晒袖套\n商品名：接触冷感アームカバー")).toBe("冷感防晒袖套");
    expect(extractChineseProductName("商品名：接触冷感アームカバー")).toBe("");
  });

  it("formats invalid or missing times with the current time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-18T12:34:00.000Z"));
    try {
      expect(formatDownloadTimestamp("not-a-date")).toBe("20260618_2034");
    } finally {
      vi.useRealTimers();
    }
  });

  it("sanitizes empty names to a readable default", () => {
    expect(sanitizeDownloadFileNameSegment(" /:*? ")).toBe("商品视频");
  });
});
