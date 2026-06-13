import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createPublishPackage, listPublishPackages } from "../../src/server/publishPackage.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("createPublishPackage", () => {
  it("copies the selected final video assets and writes a publish manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-publish-"));
    tempDirs.push(root);
    const outputsDir = join(root, "outputs");
    const runDir = join(outputsDir, "paid-wallet");
    const rawManifestPath = join(runDir, "raw", "manifest.json");
    const finalManifestPath = join(runDir, "final", "final-manifest.json");
    const finalVideoPath = join(runDir, "final", "wallet.final.mp4");
    const subtitlePath = join(runDir, "final", "wallet.ass");
    await mkdir(join(rawManifestPath, ".."), { recursive: true });
    await mkdir(join(finalVideoPath, ".."), { recursive: true });
    await writeFile(rawManifestPath, JSON.stringify({ type: "raw" }), "utf8");
    await writeFile(finalManifestPath, JSON.stringify({ type: "final" }), "utf8");
    await writeFile(finalVideoPath, Buffer.from("video-bytes"));
    await writeFile(subtitlePath, "subtitle", "utf8");
    await writeReport(join(runDir, "make-video-report.json"), {
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "WALLET-BLACK-001",
      provider: "volcengine-seedance",
      durationSeconds: 8,
      raw: {
        manifestPath: rawManifestPath,
        outputPath: join(runDir, "raw", "wallet.seedance.mp4"),
        taskId: "cgt-wallet"
      },
      final: {
        manifestPath: finalManifestPath,
        outputPath: finalVideoPath,
        subtitlePath
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
      recoveredRawOutput: false
    });

    const manifest = await createPublishPackage({
      outputsDir,
      productSku: "WALLET-BLACK-001",
      reviewState: {
        products: {
          "WALLET-BLACK-001": {
            selectedFinalJobId: "paid-wallet",
            note: "已人工审核",
            versionReviews: {
              "paid-wallet": {
                decision: "publishable",
                score: 5,
                updatedAt: "2026-06-07T07:55:00.000Z"
              }
            }
          }
        }
      },
      now: new Date("2026-06-07T08:00:00.000Z")
    });

    const packageDir = join(outputsDir, "publish-packages", "WALLET-BLACK-001", "paid-wallet");
    expect(manifest).toEqual({
      type: "haitu_publish_package",
      productSku: "WALLET-BLACK-001",
      jobId: "paid-wallet",
      provider: "volcengine-seedance",
      taskId: "cgt-wallet",
      durationSeconds: 8,
      totalTokens: 80770,
      estimatedCostCny: 2.99,
      selectedFinalNote: "已人工审核",
      packageDir,
      manifestPath: join(packageDir, "publish-package.json"),
      createdAt: "2026-06-07T08:00:00.000Z",
      files: {
        videoPath: join(packageDir, "wallet.final.mp4"),
        subtitlePath: join(packageDir, "wallet.ass"),
        finalManifestPath: join(packageDir, "final-manifest.json"),
        sourceReportPath: join(runDir, "make-video-report.json"),
        rawManifestPath
      }
    });
    await expect(readFile(join(packageDir, "wallet.final.mp4"), "utf8")).resolves.toBe("video-bytes");
    await expect(readFile(join(packageDir, "wallet.ass"), "utf8")).resolves.toBe("subtitle");
    await expect(readFile(manifest.manifestPath, "utf8")).resolves.toContain(
      "\"type\": \"haitu_publish_package\""
    );
  });

  it("rejects products that do not have a selected final job", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-publish-missing-"));
    tempDirs.push(root);

    await expect(
      createPublishPackage({
        outputsDir: join(root, "outputs"),
        productSku: "WALLET-BLACK-001",
        reviewState: {
          products: {}
        }
      })
    ).rejects.toThrow("No selected final job for product WALLET-BLACK-001.");
  });

  it("rejects selected final videos that were not manually marked publishable", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-publish-unreviewed-"));
    tempDirs.push(root);
    const outputsDir = join(root, "outputs");
    const runDir = join(outputsDir, "wallet-v1");
    const finalVideoPath = join(runDir, "final", "wallet.final.mp4");
    await mkdir(join(finalVideoPath, ".."), { recursive: true });
    await writeFile(finalVideoPath, Buffer.from("video-bytes"));
    await writeReport(join(runDir, "make-video-report.json"), {
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "WALLET-BLACK-001",
      provider: "mock",
      durationSeconds: 8,
      raw: {
        manifestPath: join(runDir, "raw", "manifest.json"),
        outputPath: join(runDir, "raw", "video.txt")
      },
      final: {
        manifestPath: join(runDir, "final", "manifest.json"),
        outputPath: finalVideoPath
      },
      totalCost: {
        amount: 0,
        currency: "USD"
      },
      reusedRawManifest: false,
      recoveredRawOutput: false
    });

    await expect(
      createPublishPackage({
        outputsDir,
        productSku: "WALLET-BLACK-001",
        reviewState: {
          products: {
            "WALLET-BLACK-001": {
              selectedFinalJobId: "wallet-v1",
              versionReviews: {
                "wallet-v1": {
                  decision: "needs-edit",
                  score: 4,
                  updatedAt: "2026-06-07T07:55:00.000Z"
                }
              }
            }
          }
        }
      })
    ).rejects.toThrow("Publish package requires the selected final version to be manually marked publishable.");
  });

  it("lists publish packages with totals sorted by newest package first", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-publish-list-"));
    tempDirs.push(root);
    const outputsDir = join(root, "outputs");
    await writePackage(join(outputsDir, "publish-packages", "TK-001", "scene-v1", "publish-package.json"), {
      type: "haitu_publish_package",
      productSku: "TK-001",
      jobId: "scene-v1",
      provider: "mock",
      durationSeconds: 8,
      totalTokens: 0,
      estimatedCostCny: 0,
      packageDir: join(outputsDir, "publish-packages", "TK-001", "scene-v1"),
      manifestPath: "stale-path.json",
      createdAt: "2026-06-07T07:00:00.000Z",
      files: {
        videoPath: join(outputsDir, "publish-packages", "TK-001", "scene-v1", "scene.mp4"),
        sourceReportPath: join(outputsDir, "scene-v1", "make-video-report.json")
      }
    });
    await writePackage(join(outputsDir, "publish-packages", "WALLET-BLACK-001", "paid-v1", "publish-package.json"), {
      type: "haitu_publish_package",
      productSku: "WALLET-BLACK-001",
      jobId: "paid-v1",
      provider: "volcengine-seedance",
      taskId: "cgt-wallet",
      durationSeconds: 8,
      totalTokens: 80770,
      estimatedCostCny: 2.99,
      packageDir: join(outputsDir, "publish-packages", "WALLET-BLACK-001", "paid-v1"),
      manifestPath: "stale-path.json",
      createdAt: "2026-06-07T08:00:00.000Z",
      files: {
        videoPath: join(outputsDir, "publish-packages", "WALLET-BLACK-001", "paid-v1", "wallet.mp4"),
        sourceReportPath: join(outputsDir, "paid-v1", "make-video-report.json")
      }
    });

    const ledger = await listPublishPackages(outputsDir);

    expect(ledger.summary).toEqual({
      totalPackages: 2,
      totalProducts: 2,
      totalTokens: 80770,
      estimatedCostCny: 2.99,
      latestCreatedAt: "2026-06-07T08:00:00.000Z"
    });
    expect(ledger.packages.map((item) => item.jobId)).toEqual(["paid-v1", "scene-v1"]);
    expect(ledger.packages[0]).toEqual(expect.objectContaining({
      productSku: "WALLET-BLACK-001",
      manifestPath: join(outputsDir, "publish-packages", "WALLET-BLACK-001", "paid-v1", "publish-package.json")
    }));
  });
});

async function writeReport(path: string, report: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2), "utf8");
}

async function writePackage(path: string, manifest: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(manifest, null, 2), "utf8");
}
