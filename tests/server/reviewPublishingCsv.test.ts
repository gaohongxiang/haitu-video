import { describe, expect, it } from "vitest";

import {
  buildInternalValidationCsvRows,
  buildPublishPackagesCsvRows,
  rowsToCsv,
  type InternalValidationCsvProduct,
  type PublishPackageCsvItem
} from "../../src/server/reviewPublishingCsv.js";

describe("review publishing CSV presentation", () => {
  it("builds internal validation rows with display names and gap hints", () => {
    const products: InternalValidationCsvProduct[] = [
      {
        sku: "SKU-1",
        title_ja: "冷感,アーム",
        referenceImageCount: 2
      },
      {
        sku: "SKU-2",
        title_ja: "帽子",
        referenceImageCount: 3
      }
    ];
    const rows = buildInternalValidationCsvRows({
      products,
      groupsBySku: new Map([
        [
          "SKU-1",
          {
            productSku: "SKU-1",
            jobCount: 1,
            reviewedJobs: 0,
            jobs: [
              {
                id: "job-1",
                provider: "volcengine-seedance",
                status: "completed",
                durationSeconds: 8,
                totalTokens: 12,
                estimatedCostCny: 1.5,
                hasFinalVideo: true,
                manualReview: {
                  decision: "needs-edit",
                  score: 4,
                  note: "comma, quote \" ok",
                  updatedAt: "2026-01-01T00:00:00.000Z"
                }
              }
            ]
          }
        ]
      ])
    });

    expect(rows[0]).toEqual([
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
    ]);
    expect(rows[1]).toEqual([
      "SKU-1",
      "冷感,アーム",
      "2",
      "1",
      "job-1",
      "火山引擎 Seedance",
      "已完成",
      "8",
      "需微调",
      "4",
      "comma, quote \" ok",
      "12",
      "1.5",
      "是",
      "补 1 张参考图 / 补 2 个版本 / 审 1 个版本"
    ]);
    expect(rows[2]).toEqual([
      "SKU-2",
      "帽子",
      "3",
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
      "补 3 个版本"
    ]);
  });

  it("builds publish package rows and escapes CSV cells", () => {
    const packages: PublishPackageCsvItem[] = [
      {
        productSku: "SKU-1",
        jobId: "job-1",
        provider: "mock",
        taskId: "task-1",
        durationSeconds: 10,
        totalTokens: 20,
        estimatedCostCny: 2.5,
        fileUrls: {
          videoUrl: "/media/video.mp4",
          subtitleUrl: "/media/subtitle.srt",
          finalManifestUrl: "/media/final.json",
          manifestUrl: "/media/package.json"
        },
        hashtags: ["#冷感", "#夏"],
        selectedFinalNote: "quote \" and comma,",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ];

    expect(buildPublishPackagesCsvRows(packages)[1]).toEqual([
      "SKU-1",
      "job-1",
      "内部任务",
      "task-1",
      "10",
      "20",
      "2.5",
      "/media/video.mp4",
      "/media/subtitle.srt",
      "/media/final.json",
      "/media/package.json",
      "#冷感 #夏",
      "quote \" and comma,",
      "2026-01-01T00:00:00.000Z"
    ]);
    expect(rowsToCsv([["plain", "quote \" and comma,"]])).toBe("plain,\"quote \"\" and comma,\"");
  });
});
