import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildJobLedger } from "../../src/server/jobLedger.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("buildJobLedger", () => {
  it("normalizes make-video reports into SaaS-style job rows and cost totals", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-ledger-"));
    tempDirs.push(root);
    const outputsDir = join(root, "outputs");
    await writeReport(join(outputsDir, "paid-run", "make-video-report.json"), {
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "WALLET-BLACK-001",
      provider: "volcengine-seedance",
      durationSeconds: 8,
      raw: {
        manifestPath: join(outputsDir, "paid-run", "raw", "manifest.json"),
        outputPath: join(outputsDir, "paid-run", "raw", "video.mp4"),
        taskId: "cgt-paid"
      },
      final: {
        manifestPath: join(outputsDir, "paid-run", "final", "final-manifest.json"),
        outputPath: join(outputsDir, "paid-run", "final", "final.mp4"),
        subtitlePath: join(outputsDir, "paid-run", "final", "final.ass")
      },
      billing: {
        tokenPriceCnyPerMillion: 37,
        totalTokens: 80770,
        estimatedCostCny: 2.99
      },
      totalCost: {
        amount: 0,
        currency: "CNY"
      },
      reusedRawManifest: true,
      recoveredRawOutput: false,
      reportPath: join(outputsDir, "paid-run", "make-video-report.json")
    });
    await writeReport(join(outputsDir, "mock-run", "make-video-report.json"), {
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "TK-001",
      provider: "mock",
      durationSeconds: 8,
      raw: {
        manifestPath: join(outputsDir, "mock-run", "raw", "manifest.json"),
        outputPath: join(outputsDir, "mock-run", "raw", "video.txt")
      },
      totalCost: {
        amount: 0,
        currency: "USD"
      },
      reusedRawManifest: false,
      recoveredRawOutput: false,
      reportPath: join(outputsDir, "mock-run", "make-video-report.json")
    });
    await writeReport(join(outputsDir, "wallet-mock-variant", "make-video-report.json"), {
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "WALLET-BLACK-001",
      provider: "mock",
      durationSeconds: 8,
      raw: {
        manifestPath: join(outputsDir, "wallet-mock-variant", "raw", "manifest.json"),
        outputPath: join(outputsDir, "wallet-mock-variant", "raw", "video.txt")
      },
      totalCost: {
        amount: 0,
        currency: "USD"
      },
      reusedRawManifest: false,
      recoveredRawOutput: false,
      reportPath: join(outputsDir, "wallet-mock-variant", "make-video-report.json")
    });

    const ledger = await buildJobLedger(outputsDir, {
      reviewState: {
        products: {
          "WALLET-BLACK-001": {
            selectedFinalJobId: "paid-run",
            note: "发布 TikTok 引流",
            versionReviews: {
              "paid-run": {
                decision: "publishable",
                score: 5,
                updatedAt: "2026-06-07T08:00:00.000Z"
              },
              "wallet-mock-variant": {
                decision: "needs-edit",
                score: 4,
                updatedAt: "2026-06-07T08:05:00.000Z"
              }
            }
          },
          "TK-001": {
            versionReviews: {
              "mock-run": {
                decision: "rejected",
                score: 2,
                updatedAt: "2026-06-07T08:10:00.000Z"
              }
            }
          }
        }
      }
    });

    expect(ledger.summary).toEqual({
      totalJobs: 3,
      completedJobs: 3,
      failedJobs: 0,
      paidJobs: 1,
      mockJobs: 2,
      totalTokens: 80770,
      estimatedCostCny: 2.99,
      finalVideos: 1,
      reusedRawManifests: 1,
      recoveredRawOutputs: 0
    });
    expect(ledger.internalValidationSummary).toEqual({
      targetUsableVideos: 20,
      usableVideos: 2,
      publishableVideos: 1,
      needsEditVideos: 1,
      rejectedVideos: 1,
      totalVideos: 3,
      reviewedVideos: 3,
      usableRate: 0.67,
      totalEstimatedCostCny: 2.99,
      paidEstimatedCostCny: 2.99,
      costPerUsableVideoCny: 1.5,
      remainingUsableVideos: 18
    });
    expect(ledger.jobs).toEqual([
      expect.objectContaining({
        id: "paid-run",
        productSku: "WALLET-BLACK-001",
        provider: "volcengine-seedance",
        status: "completed",
        taskId: "cgt-paid",
        totalTokens: 80770,
        estimatedCostCny: 2.99,
        hasFinalVideo: true,
        finalVideoUrl: `/media?path=${encodeURIComponent(join(outputsDir, "paid-run", "final", "final.mp4"))}`,
        reusedRawManifest: true
      }),
      expect.objectContaining({
        id: "mock-run",
        productSku: "TK-001",
        provider: "mock",
        totalTokens: 0,
        estimatedCostCny: 0,
        hasFinalVideo: false
      }),
      expect.objectContaining({
        id: "wallet-mock-variant",
        productSku: "WALLET-BLACK-001",
        provider: "mock"
      })
    ]);
    expect(ledger.products).toEqual([
      {
        productSku: "WALLET-BLACK-001",
        jobCount: 2,
        completedJobs: 2,
        paidJobs: 1,
        mockJobs: 1,
        reviewedJobs: 2,
        unreviewedJobs: 0,
        publishableJobs: 1,
        needsEditJobs: 1,
        rejectedJobs: 0,
        usableJobs: 2,
        readyForInternalValidation: false,
        totalTokens: 80770,
        estimatedCostCny: 2.99,
        finalVideos: 1,
        latestJobId: "paid-run",
        bestPreviewJobId: "paid-run",
        selectedFinalJobId: "paid-run",
        selectedFinalNote: "发布 TikTok 引流",
        jobs: [
          expect.objectContaining({ id: "paid-run", selectedFinal: true }),
          expect.objectContaining({ id: "wallet-mock-variant" })
        ]
      },
      {
        productSku: "TK-001",
        jobCount: 1,
        completedJobs: 1,
        paidJobs: 0,
        mockJobs: 1,
        reviewedJobs: 1,
        unreviewedJobs: 0,
        publishableJobs: 0,
        needsEditJobs: 0,
        rejectedJobs: 1,
        usableJobs: 0,
        readyForInternalValidation: false,
        totalTokens: 0,
        estimatedCostCny: 0,
        finalVideos: 0,
        latestJobId: "mock-run",
        bestPreviewJobId: undefined,
        selectedFinalJobId: undefined,
        selectedFinalNote: undefined,
        jobs: [expect.objectContaining({ id: "mock-run" })]
      }
    ]);
  });

  it("includes content review snapshots from the raw and final manifests", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-ledger-content-review-"));
    tempDirs.push(root);
    const outputsDir = join(root, "outputs");
    const rawManifestPath = join(outputsDir, "wallet-final", "raw", "manifest.json");
    const finalManifestPath = join(outputsDir, "wallet-final", "final", "final-manifest.json");
    const subtitlePath = join(outputsDir, "wallet-final", "final", "wallet.ass");
    await writeReport(rawManifestPath, {
      script: {
        voiceover: "カードも小銭もすっきり入るミニ財布です。",
        subtitleLines: ["カードも小銭も", "すっきり収納", "今すぐチェック"],
        cta: "今すぐチェック"
      },
      prompt: "Create a Japanese TikTok Shop product ad video. Keep the black wallet consistent with the reference image."
    });
    await writeReport(finalManifestPath, {
      type: "postprocessed_final",
      output: {
        durationSeconds: 8.08
      }
    });
    await writeReport(subtitlePath, "[Script Info]\n", "utf8");
    await writeReport(join(outputsDir, "wallet-final", "make-video-report.json"), {
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "WALLET-BLACK-001",
      provider: "mock",
      durationSeconds: 8,
      raw: {
        manifestPath: rawManifestPath,
        outputPath: join(outputsDir, "wallet-final", "raw", "video.txt")
      },
      final: {
        manifestPath: finalManifestPath,
        outputPath: join(outputsDir, "wallet-final", "final", "wallet.mp4"),
        subtitlePath
      },
      totalCost: {
        amount: 0,
        currency: "USD"
      },
      reusedRawManifest: false,
      recoveredRawOutput: false
    });

    const ledger = await buildJobLedger(outputsDir);

    expect(ledger.jobs[0]).toEqual(expect.objectContaining({
      finalSubtitlePath: subtitlePath,
      finalManifestPath,
      contentReview: {
        scriptVoiceover: "カードも小銭もすっきり入るミニ財布です。",
        subtitleLines: ["カードも小銭も", "すっきり収納", "今すぐチェック"],
        cta: "今すぐチェック",
        hashtags: [],
        promptPreview: "Create a Japanese TikTok Shop product ad video. Keep the black wallet consistent with the reference image.",
        rawManifestUrl: `/media?path=${encodeURIComponent(rawManifestPath)}`,
        finalManifestUrl: `/media?path=${encodeURIComponent(finalManifestPath)}`,
        subtitleUrl: `/media?path=${encodeURIComponent(subtitlePath)}`,
        available: true,
        missingReason: undefined
      }
    }));
  });

  it("includes failed job error details from job metadata for history rows", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-ledger-failed-error-"));
    tempDirs.push(root);
    const outputsDir = join(root, "outputs");
    const jobDir = join(outputsDir, "failed-seedance-reference");
    await writeReport(join(jobDir, "job.json"), {
      id: "failed-seedance-reference",
      workspaceId: "default",
      status: "failed",
      provider: "volcengine-seedance",
      providerModel: "doubao-seedance-2-0-fast-260128",
      durationSeconds: 10,
      createdAt: "2026-06-19T09:09:51.636Z",
      updatedAt: "2026-06-19T09:51:42.209Z",
      error: "视频平台拒绝了这次生成请求。请检查参考图、商品资料和视频模型配置后重试。",
      errorDetails: {
        message:
          'Volcengine Seedance API error 400: {"error":{"code":"InvalidParameter","message":"The parameter `content[1].image_url` specified in the request is not valid: resource download failed. Request id: 0217818627016466a92a7a560d2de26f44703930971dcb5f489a2","param":"content[1].image_url","type":"BadRequest"}}',
        name: "Error",
        providerPhase: "create-task",
        providerName: "volcengine-seedance",
        providerModel: "doubao-seedance-2-0-fast-260128",
        referenceImageCount: 9,
        usedTemporaryAssetUrls: true
      }
    });
    await writeReport(join(jobDir, "make-video-report.json"), {
      type: "haitu_make_video_report",
      status: "failed",
      productSku: "DXM-001",
      provider: "volcengine-seedance",
      durationSeconds: 10,
      raw: {
        manifestPath: join(jobDir, "raw", "manifest.json"),
        outputPath: join(jobDir, "raw", "missing.mp4")
      },
      totalCost: {
        amount: 0,
        currency: "CNY"
      },
      reusedRawManifest: false,
      recoveredRawOutput: false
    });

    const ledger = await buildJobLedger(outputsDir);

    expect(ledger.jobs[0]).toEqual(expect.objectContaining({
      id: "failed-seedance-reference",
      status: "failed",
      error: "视频平台拒绝了这次生成请求。请检查参考图、商品资料和视频模型配置后重试。",
      errorDetails: expect.objectContaining({
        providerPhase: "create-task",
        providerModel: "doubao-seedance-2-0-fast-260128",
        referenceImageCount: 9
      })
    }));
  });

  it("keeps expired job history while hiding previewable video URLs", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-ledger-expired-"));
    tempDirs.push(root);
    const outputsDir = join(root, "outputs");
    const jobDir = join(outputsDir, "expired-run");
    const finalOutputPath = join(jobDir, "final", "final.mp4");
    await writeReport(join(jobDir, "job.json"), {
      id: "expired-run",
      workspaceId: "default",
      status: "completed",
      createdAt: "2026-06-07T09:00:00.000Z",
      updatedAt: "2026-06-08T09:01:00.000Z",
      expiresAt: "2026-06-08T09:00:00.000Z",
      expired: true,
      mediaDeletedAt: "2026-06-08T09:01:00.000Z"
    });
    await writeReport(join(jobDir, "make-video-report.json"), {
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "TK-001",
      provider: "mock",
      durationSeconds: 8,
      raw: {
        manifestPath: join(jobDir, "raw", "manifest.json"),
        outputPath: join(jobDir, "raw", "video.mp4")
      },
      final: {
        manifestPath: join(jobDir, "final", "final-manifest.json"),
        outputPath: finalOutputPath,
        subtitlePath: join(jobDir, "final", "final.ass")
      },
      totalCost: {
        amount: 0,
        currency: "USD"
      },
      reusedRawManifest: false,
      recoveredRawOutput: false
    });

    const ledger = await buildJobLedger(outputsDir);

    expect(ledger.jobs[0]).toEqual(expect.objectContaining({
      id: "expired-run",
      expired: true,
      expiresAt: "2026-06-08T09:00:00.000Z",
      hasFinalVideo: false,
      finalOutputPath,
      finalVideoUrl: undefined
    }));
  });
});

async function writeReport(path: string, report: unknown, encoding: BufferEncoding = "utf8"): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, typeof report === "string" ? report : JSON.stringify(report, null, 2), encoding);
}
