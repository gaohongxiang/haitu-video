import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FileConsoleSettingsStore } from "../../src/server/consoleSettings.js";
import { LocalVideoJobQueue } from "../../src/server/consoleVideoJobQueue.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("LocalVideoJobQueue", () => {
  it("stores job metadata and outputs in workspace job directories with default workspace and 24h expiry", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-video-job-workspace-"));
    tempDirs.push(root);
    const dataDir = join(root, "data");
    const productsDir = join(dataDir, "workspaces", "default", "products");
    const jobsDir = join(dataDir, "workspaces", "default", "jobs");
    const productPath = join(productsDir, "TK-001", "product.json");
    await writeProduct(productPath);
    const queue = new LocalVideoJobQueue({
      rootDir: dataDir,
      outputsDir: jobsDir,
      workspaceId: "default",
      settingsStore: new FileConsoleSettingsStore(join(dataDir, "system", "console-settings.json")),
      now: () => new Date("2026-06-07T09:00:00.000Z"),
      runMakeVideoPipeline: async (input) => {
        const report = makeReport(input);
        await mkdir(join(report.reportPath, ".."), { recursive: true });
        await writeFile(report.reportPath, JSON.stringify(report, null, 2), "utf8");
        return report;
      }
    });

    const enqueued = await queue.enqueue({
      productPath,
      provider: "mock",
      duration: 8,
      template: "scene",
      cta: "今すぐチェック",
      confirmPaid: false
    });
    const jobFile = join(jobsDir, enqueued.id, "job.json");
    const queuedRecord = JSON.parse(await readFile(jobFile, "utf8"));
    const completed = await queue.waitForIdle(enqueued.id);
    const completedRecord = JSON.parse(await readFile(jobFile, "utf8"));

    expect(enqueued).toEqual(expect.objectContaining({
      workspaceId: "default",
      outDir: join(jobsDir, enqueued.id),
      expiresAt: "2026-06-08T09:00:00.000Z"
    }));
    expect(queuedRecord).toEqual(expect.objectContaining({
      workspaceId: "default",
      status: "queued",
      outDir: join(jobsDir, enqueued.id),
      expiresAt: "2026-06-08T09:00:00.000Z"
    }));
    expect(completed).toEqual(expect.objectContaining({
      workspaceId: "default",
      status: "completed",
      reportPath: join(jobsDir, enqueued.id, "make-video-report.json"),
      finalOutputPath: join(jobsDir, enqueued.id, "final", "final.mp4"),
      expiresAt: "2026-06-08T09:00:00.000Z"
    }));
    expect(completedRecord).toEqual(expect.objectContaining({
      workspaceId: "default",
      status: "completed",
      expiresAt: "2026-06-08T09:00:00.000Z"
    }));
  });

  it("enqueues a make-video job, runs it asynchronously, and persists status", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-video-job-queue-"));
    tempDirs.push(root);
    const fixturesDir = join(root, "fixtures", "products");
    const outputsDir = join(root, "outputs");
    const productPath = join(fixturesDir, "box.json");
    await writeProduct(productPath);
    const queue = new LocalVideoJobQueue({
      rootDir: root,
      outputsDir,
      settingsStore: new FileConsoleSettingsStore(join(outputsDir, "console-settings.json")),
      now: () => new Date("2026-06-07T09:00:00.000Z"),
      runMakeVideoPipeline: async (input) => {
        const report = makeReport(input);
        await mkdir(join(report.reportPath, ".."), { recursive: true });
        await writeFile(report.reportPath, JSON.stringify(report, null, 2), "utf8");
        return report;
      }
    });

    const enqueued = await queue.enqueue({
      productPath,
      provider: "mock",
      duration: 8,
      template: "scene",
      cta: "今すぐチェック",
      confirmPaid: false
    });

    expect(enqueued.status).toBe("queued");
    expect(enqueued.id).toBe("job-20260607090000000-001");
    await expect(readFile(join(outputsDir, enqueued.id, "job.json"), "utf8")).resolves.toContain(
      "\"status\": \"queued\""
    );

    const completed = await queue.waitForIdle(enqueued.id);

    expect(completed).toEqual(expect.objectContaining({
      id: enqueued.id,
      status: "completed",
      productSku: "TK-001",
      provider: "mock",
      reportPath: join(outputsDir, enqueued.id, "make-video-report.json"),
      reportUrl: `/media?path=${encodeURIComponent(join(outputsDir, enqueued.id, "make-video-report.json"))}`,
      finalOutputPath: join(outputsDir, enqueued.id, "final", "final.mp4"),
      finalVideoUrl: `/media?path=${encodeURIComponent(join(outputsDir, enqueued.id, "final", "final.mp4"))}`,
      totalTokens: 324900,
      estimatedCostCny: 12.02
    }));
    await expect(readFile(completed.reportPath ?? "", "utf8")).resolves.toContain(
      "\"type\": \"haitu_make_video_report\""
    );
    await expect(readFile(join(outputsDir, enqueued.id, "job.json"), "utf8")).resolves.toContain(
      "\"status\": \"completed\""
    );
  });

  it("passes the reference image URL resolver into the make-video pipeline", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-video-job-reference-resolver-"));
    tempDirs.push(root);
    const fixturesDir = join(root, "fixtures", "products");
    const outputsDir = join(root, "outputs");
    const productPath = join(fixturesDir, "box.json");
    await writeProduct(productPath);
    const referenceImageUrlResolver = async (reference: string) => `https://assets.example.test/${reference}`;
    const capturedInputs: unknown[] = [];
    const queue = new LocalVideoJobQueue({
      rootDir: root,
      outputsDir,
      settingsStore: new FileConsoleSettingsStore(join(outputsDir, "console-settings.json")),
      now: () => new Date("2026-06-07T09:00:00.000Z"),
      referenceImageUrlResolver,
      runMakeVideoPipeline: async (input) => {
        capturedInputs.push(input);
        return makeReport(input);
      }
    });

    const enqueued = await queue.enqueue({
      productPath,
      provider: "volcengine-seedance",
      duration: 8,
      confirmPaid: true
    });
    await queue.waitForIdle(enqueued.id);

    expect(capturedInputs[0]).toEqual(expect.objectContaining({
      referenceImageUrlResolver
    }));
  });

  it("stores provider error details when a video job fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-video-job-error-"));
    tempDirs.push(root);
    const fixturesDir = join(root, "fixtures", "products");
    const outputsDir = join(root, "outputs");
    const productPath = join(fixturesDir, "box.json");
    await writeProduct(productPath);
    const queue = new LocalVideoJobQueue({
      rootDir: root,
      outputsDir,
      settingsStore: new FileConsoleSettingsStore(join(outputsDir, "console-settings.json")),
      now: () => new Date("2026-06-07T09:00:00.000Z"),
      runMakeVideoPipeline: async () => {
        const cause = Object.assign(new Error("Headers Timeout Error"), {
          code: "UND_ERR_HEADERS_TIMEOUT"
        });
        throw Object.assign(new Error("fetch failed"), {
          name: "TypeError",
          cause,
          providerPhase: "create-task",
          providerName: "volcengine-seedance",
          providerModel: "doubao-seedance-2-0-fast-260128",
          referenceImageCount: 1,
          usedTemporaryAssetUrls: true
        });
      }
    });

    const job = await queue.enqueue({
      productPath,
      provider: "volcengine-seedance",
      providerModel: "doubao-seedance-2-0-fast-260128",
      confirmPaid: true
    });
    const completed = await queue.waitForIdle(job.id);

    expect(completed.status).toBe("failed");
    expect(completed.error).toBe("视频平台请求超时或网络连接失败，请稍后重试；如果连续失败，请检查视频模型配置和参考图链接。");
    expect(completed.errorDetails).toMatchObject({
      message: "fetch failed",
      name: "TypeError",
      causeMessage: "Headers Timeout Error",
      causeCode: "UND_ERR_HEADERS_TIMEOUT",
      providerPhase: "create-task",
      providerName: "volcengine-seedance",
      providerModel: "doubao-seedance-2-0-fast-260128",
      referenceImageCount: 1,
      usedTemporaryAssetUrls: true
    });
  });

  it("stores a readable error when Seedance rejects reference images with real people", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-video-job-readable-error-"));
    tempDirs.push(root);
    const fixturesDir = join(root, "fixtures", "products");
    const outputsDir = join(root, "outputs");
    const productPath = join(fixturesDir, "arm-cover.json");
    await writeProduct(productPath);
    const providerError =
      'Volcengine Seedance API error 400: {"error":{"code":"InputImageSensitiveContentDetected.PrivacyInformation","message":"The request failed because the input image may contain real person.","type":"BadRequest"}}';
    const queue = new LocalVideoJobQueue({
      rootDir: root,
      outputsDir,
      settingsStore: new FileConsoleSettingsStore(join(outputsDir, "console-settings.json")),
      now: () => new Date("2026-06-18T09:00:00.000Z"),
      runMakeVideoPipeline: async () => {
        throw Object.assign(new Error(providerError), {
          providerPhase: "create-task",
          providerName: "volcengine-seedance",
          providerModel: "doubao-seedance-2-0-fast-260128",
          referenceImageCount: 8,
          usedTemporaryAssetUrls: true
        });
      }
    });

    const job = await queue.enqueue({
      productPath,
      provider: "volcengine-seedance",
      providerModel: "doubao-seedance-2-0-fast-260128",
      confirmPaid: true
    });
    const completed = await queue.waitForIdle(job.id);

    expect(completed.status).toBe("failed");
    expect(completed.error).toBe("参考图里可能包含真人、人脸或隐私信息，视频平台已拒绝生成。请移除含人物或人脸的参考图，保留纯商品图后重试。");
    expect(completed.errorDetails).toMatchObject({
      message: providerError,
      providerPhase: "create-task",
      providerName: "volcengine-seedance",
      providerModel: "doubao-seedance-2-0-fast-260128",
      referenceImageCount: 8,
      usedTemporaryAssetUrls: true
    });
  });

  it("stores a readable error when Seedance rejects too many reference images", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-video-job-too-many-references-"));
    tempDirs.push(root);
    const fixturesDir = join(root, "fixtures", "products");
    const outputsDir = join(root, "outputs");
    const productPath = join(fixturesDir, "wallet.json");
    await writeProduct(productPath);
    const providerError =
      'Volcengine Seedance API error 400: {"error":{"code":"InvalidParameter","message":"The parameter `content` specified in the request is not valid: expected at most 9 reference images but got 10 instead.","param":"content","type":"BadRequest"}}';
    const queue = new LocalVideoJobQueue({
      rootDir: root,
      outputsDir,
      settingsStore: new FileConsoleSettingsStore(join(outputsDir, "console-settings.json")),
      now: () => new Date("2026-06-18T09:00:00.000Z"),
      runMakeVideoPipeline: async () => {
        throw Object.assign(new Error(providerError), {
          providerPhase: "create-task",
          providerName: "volcengine-seedance",
          providerModel: "doubao-seedance-2-0-fast-260128",
          referenceImageCount: 10,
          usedTemporaryAssetUrls: true
        });
      }
    });

    const job = await queue.enqueue({
      productPath,
      provider: "volcengine-seedance",
      providerModel: "doubao-seedance-2-0-fast-260128",
      confirmPaid: true
    });
    const completed = await queue.waitForIdle(job.id);

    expect(completed.status).toBe("failed");
    expect(completed.error).toBe("参考图太多：Seedance 最多支持 9 张，本次有 10 张。生成时只使用前 9 张，请调整顺序或删除多余图片后重试。");
    expect(completed.errorDetails).toMatchObject({
      message: providerError,
      providerPhase: "create-task",
      providerName: "volcengine-seedance",
      providerModel: "doubao-seedance-2-0-fast-260128",
      referenceImageCount: 10,
      usedTemporaryAssetUrls: true
    });
  });

  it("keeps job ids unique across queue instances sharing one jobs directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-video-job-unique-id-"));
    tempDirs.push(root);
    const fixturesDir = join(root, "fixtures", "products");
    const outputsDir = join(root, "outputs");
    const productPath = join(fixturesDir, "box.json");
    await writeProduct(productPath);
    const queues: LocalVideoJobQueue[] = [];
    const makeQueue = () => {
      const queue = new LocalVideoJobQueue({
        rootDir: root,
        outputsDir,
        settingsStore: new FileConsoleSettingsStore(join(outputsDir, "console-settings.json")),
        now: () => new Date("2026-06-07T09:00:00.000Z"),
        runMakeVideoPipeline: async (input) => makeReport(input)
      });
      queues.push(queue);
      return queue;
    };

    const first = await makeQueue().enqueue({ productPath, provider: "mock", duration: 8 });
    const second = await makeQueue().enqueue({ productPath, provider: "mock", duration: 8 });
    const third = await makeQueue().enqueue({ productPath, provider: "mock", duration: 8 });

    expect([first.id, second.id, third.id]).toEqual([
      "job-20260607090000000-001",
      "job-20260607090000000-002",
      "job-20260607090000000-003"
    ]);
    await expect(readFile(join(outputsDir, first.id, "job.json"), "utf8")).resolves.toContain(first.id);
    await expect(readFile(join(outputsDir, second.id, "job.json"), "utf8")).resolves.toContain(second.id);
    await expect(readFile(join(outputsDir, third.id, "job.json"), "utf8")).resolves.toContain(third.id);
    await Promise.all([
      queues[0].waitForIdle(first.id),
      queues[1].waitForIdle(second.id),
      queues[2].waitForIdle(third.id)
    ]);
  });

  it("cancels a queued make-video job before it starts", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-video-job-cancel-"));
    tempDirs.push(root);
    const fixturesDir = join(root, "fixtures", "products");
    const outputsDir = join(root, "outputs");
    const productPath = join(fixturesDir, "box.json");
    await writeProduct(productPath);
    let releaseFirstJob!: () => void;
    const firstJobStarted = new Promise<void>((resolve) => {
      const releaseGate = new Promise<void>((release) => {
        releaseFirstJob = release;
      });
      void releaseGate.then(resolve);
    });
    const calls: string[] = [];
    const queue = new LocalVideoJobQueue({
      rootDir: root,
      outputsDir,
      settingsStore: new FileConsoleSettingsStore(join(outputsDir, "console-settings.json")),
      now: () => new Date("2026-06-07T09:00:00.000Z"),
      runMakeVideoPipeline: async (input) => {
        calls.push(input.outDir);
        if (calls.length === 1) {
          await firstJobStarted;
        }
        return {
          type: "haitu_make_video_report",
          status: "completed",
          productSku: "TK-001",
          provider: input.providerName,
          durationSeconds: input.durationSeconds,
          paidRequestConfirmed: input.confirmPaid,
          raw: {
            manifestPath: join(input.outDir, "raw", "manifest.json"),
            outputPath: join(input.outDir, "raw", "video.txt")
          },
          totalCost: {
            amount: 0,
            currency: "USD"
          },
          reusedRawManifest: false,
          recoveredRawOutput: false,
          reportPath: join(input.outDir, "make-video-report.json")
        };
      }
    });

    const first = await queue.enqueue({ productPath, provider: "mock", duration: 8 });
    const second = await queue.enqueue({ productPath, provider: "mock", duration: 8 });

    const cancelled = await queue.cancel(second.id);
    releaseFirstJob();
    const latestSecond = await queue.waitForIdle(second.id);

    expect(first.status).toBe("queued");
    expect(cancelled).toEqual(expect.objectContaining({
      id: second.id,
      status: "canceled",
      completedAt: "2026-06-07T09:00:00.000Z"
    }));
    expect(latestSecond.status).toBe("canceled");
    expect(calls).toEqual([first.outDir]);
    await expect(readFile(join(outputsDir, second.id, "job.json"), "utf8")).resolves.toContain(
      "\"status\": \"canceled\""
    );
  });

  it("removes a completed make-video job from local history", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-video-job-remove-completed-"));
    tempDirs.push(root);
    const fixturesDir = join(root, "fixtures", "products");
    const outputsDir = join(root, "outputs");
    const productPath = join(fixturesDir, "box.json");
    await writeProduct(productPath);
    const queue = new LocalVideoJobQueue({
      rootDir: root,
      outputsDir,
      settingsStore: new FileConsoleSettingsStore(join(outputsDir, "console-settings.json")),
      now: () => new Date("2026-06-07T09:00:00.000Z"),
      runMakeVideoPipeline: async (input) => makeReport(input)
    });

    const enqueued = await queue.enqueue({ productPath, provider: "mock", duration: 8 });
    const completed = await queue.waitForIdle(enqueued.id);
    const removed = await queue.cancel(completed.id);

    expect(completed.status).toBe("completed");
    expect(removed).toEqual(expect.objectContaining({
      id: completed.id,
      status: "canceled",
      completedAt: "2026-06-07T09:00:00.000Z"
    }));
    await expect(readFile(join(outputsDir, completed.id, "job.json"), "utf8")).resolves.toContain(
      "\"status\": \"canceled\""
    );
  });

  it("retries a failed job in place with the same request settings", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-video-job-retry-"));
    tempDirs.push(root);
    const fixturesDir = join(root, "fixtures", "products");
    const outputsDir = join(root, "outputs");
    const productPath = join(fixturesDir, "box.json");
    const reuseManifest = join(outputsDir, "previous", "manifest.json");
    await writeProduct(productPath);
    await mkdir(join(reuseManifest, ".."), { recursive: true });
    await writeFile(reuseManifest, JSON.stringify({ type: "raw" }), "utf8");
    const attempts: string[] = [];
    const queue = new LocalVideoJobQueue({
      rootDir: root,
      outputsDir,
      settingsStore: new FileConsoleSettingsStore(join(outputsDir, "console-settings.json")),
      now: () => new Date("2026-06-07T09:00:00.000Z"),
      runMakeVideoPipeline: async (input) => {
        attempts.push(input.outDir);
        if (attempts.length === 1) {
          throw new Error("temporary provider failure");
        }
        return makeReport(input);
      }
    });

    const failedSource = await queue.enqueue({
      productPath,
      outDirName: "wallet-ad",
      provider: "mock",
      duration: 8,
      template: "ugc",
      cta: "今すぐチェック",
      confirmPaid: false,
      reuseManifest
    });
    const failed = await queue.waitForIdle(failedSource.id);
    const retried = await queue.retry(failed.id);
    const completedRetry = await queue.waitForIdle(retried.id);

    expect(failed).toEqual(expect.objectContaining({
      id: failedSource.id,
      status: "failed",
      error: "temporary provider failure"
    }));
    expect(retried).toEqual(expect.objectContaining({
      id: failedSource.id,
      status: "queued",
      productPath,
      provider: "mock",
      durationSeconds: 8,
      template: "ugc",
      cta: "今すぐチェック",
      confirmPaid: false,
      reuseManifest
    }));
    expect(retried.error).toBeUndefined();
    expect(retried.outDir).toBe(join(outputsDir, "wallet-ad"));
    expect(completedRetry).toEqual(expect.objectContaining({
      id: failedSource.id,
      status: "completed",
      productSku: "TK-001"
    }));
    expect(attempts).toEqual([
      join(outputsDir, "wallet-ad"),
      join(outputsDir, "wallet-ad")
    ]);
  });

  it("records usage for generated videos that fail while downloading and recovers the download without a paid retry", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-video-job-download-recover-"));
    tempDirs.push(root);
    const fixturesDir = join(root, "fixtures", "products");
    const outputsDir = join(root, "outputs");
    const productPath = join(fixturesDir, "box.json");
    await writeProduct(productPath);
    const calls: Array<{ confirmPaid: boolean; reuseManifestPath?: string }> = [];
    const queue = new LocalVideoJobQueue({
      rootDir: root,
      outputsDir,
      settingsStore: new FileConsoleSettingsStore(join(outputsDir, "console-settings.json")),
      now: () => new Date("2026-06-07T09:00:00.000Z"),
      runMakeVideoPipeline: async (input) => {
        calls.push({
          confirmPaid: input.confirmPaid,
          reuseManifestPath: input.reuseManifestPath
        });
        if (calls.length === 1) {
          throw Object.assign(new Error("Volcengine Seedance video was generated but the output download failed."), {
            providerPhase: "download-output",
            providerName: "volcengine-seedance",
            providerModel: "doubao-seedance-2-0-fast-260128",
            providerTaskId: "task-generated",
            providerVideoUrl: "https://cdn.example.com/generated.mp4",
            output: {
              path: join(input.outDir, "raw", "TK-001", "v1", "TK-001-v1.seedance.mp4"),
              width: 1080,
              height: 1920,
              durationSeconds: input.durationSeconds,
              mimeType: "video/mp4"
            },
            usage: {
              completionTokens: 90000,
              totalTokens: 90000
            },
            cost: {
              amount: 8,
              currency: "CNY"
            },
            rawResponse: {
              completedTask: { id: "task-generated" }
            },
            cause: Object.assign(new Error("Connect Timeout Error"), {
              code: "UND_ERR_CONNECT_TIMEOUT"
            })
          });
        }
        const report = makeReport(input);
        await mkdir(join(report.reportPath, ".."), { recursive: true });
        await writeFile(report.reportPath, JSON.stringify({
          ...report,
          reusedRawManifest: true,
          recoveredRawOutput: true
        }, null, 2), "utf8");
        return {
          ...report,
          reusedRawManifest: true,
          recoveredRawOutput: true
        };
      }
    });

    const queued = await queue.enqueue({
      productPath,
      provider: "volcengine-seedance",
      providerModel: "doubao-seedance-2-0-fast-260128",
      duration: 10,
      template: "scene",
      cta: "今すぐチェック",
      confirmPaid: true
    });
    const failed = await queue.waitForIdle(queued.id);
    const failedReport = JSON.parse(await readFile(join(outputsDir, failed.id, "make-video-report.json"), "utf8"));
    const recovering = await queue.recoverDownload(failed.id);
    const completed = await queue.waitForIdle(recovering.id);

    expect(failed).toEqual(expect.objectContaining({
      status: "failed",
      productSku: "TK-001",
      providerTaskId: "task-generated",
      canRecoverDownload: true,
      totalTokens: 90000,
      estimatedCostCny: 3.33
    }));
    expect(failed.error).toContain("视频已经生成");
    expect(failedReport).toEqual(expect.objectContaining({
      status: "failed",
      productSku: "TK-001",
      billing: {
        tokenPriceCnyPerMillion: 37,
        totalTokens: 90000,
        estimatedCostCny: 3.33
      }
    }));
    expect(recovering).toEqual(expect.objectContaining({
      status: "queued",
      confirmPaid: false,
      reuseManifest: failed.recoverableRawManifestPath
    }));
    expect(completed).toEqual(expect.objectContaining({
      status: "completed",
      productSku: "TK-001",
      canRecoverDownload: false,
      totalTokens: 324900,
      estimatedCostCny: 12.02
    }));
    expect(calls).toEqual([
      { confirmPaid: true, reuseManifestPath: undefined },
      { confirmPaid: false, reuseManifestPath: failed.recoverableRawManifestPath }
    ]);
  });

  it("refuses to retry jobs that are not failed", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-video-job-retry-not-failed-"));
    tempDirs.push(root);
    const fixturesDir = join(root, "fixtures", "products");
    const outputsDir = join(root, "outputs");
    const productPath = join(fixturesDir, "box.json");
    await writeProduct(productPath);
    const queue = new LocalVideoJobQueue({
      rootDir: root,
      outputsDir,
      settingsStore: new FileConsoleSettingsStore(join(outputsDir, "console-settings.json")),
      now: () => new Date("2026-06-07T09:00:00.000Z")
    });

    const queued = await queue.enqueue({ productPath, provider: "mock", duration: 8 });

    await expect(queue.retry(queued.id)).rejects.toThrow(
      `Can retry only failed local video jobs. Job ${queued.id} is queued.`
    );
    await queue.waitForIdle(queued.id);
  });

  it("resumes persisted queued jobs after a queue restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-video-job-resume-"));
    tempDirs.push(root);
    const fixturesDir = join(root, "fixtures", "products");
    const outputsDir = join(root, "outputs");
    const productPath = join(fixturesDir, "box.json");
    await writeProduct(productPath);
    const settingsStore = new FileConsoleSettingsStore(join(outputsDir, "console-settings.json"));
    let releaseFirstJob!: () => void;
    const firstJobGate = new Promise<void>((resolve) => {
      releaseFirstJob = resolve;
    });
    const originalQueue = new LocalVideoJobQueue({
      rootDir: root,
      outputsDir,
      settingsStore,
      now: () => new Date("2026-06-07T09:00:00.000Z"),
      runMakeVideoPipeline: async (input) => {
        await firstJobGate;
        return makeReport(input);
      }
    });

    const first = await originalQueue.enqueue({ productPath, provider: "mock", duration: 8 });
    const queued = await originalQueue.enqueue({ productPath, provider: "mock", duration: 8 });
    await waitForStatus(originalQueue, first.id, "running");
    const resumedCalls: string[] = [];
    const resumedQueue = new LocalVideoJobQueue({
      rootDir: root,
      outputsDir,
      settingsStore,
      now: () => new Date("2026-06-07T09:01:00.000Z"),
      runMakeVideoPipeline: async (input) => {
        resumedCalls.push(input.outDir);
        return makeReport(input);
      }
    });

    await resumedQueue.startSavedJobs();
    const resumed = await resumedQueue.waitForIdle(queued.id);
    releaseFirstJob();
    await originalQueue.waitForIdle(first.id);

    expect(resumed).toEqual(expect.objectContaining({
      id: queued.id,
      status: "completed",
      productSku: "TK-001",
      reportPath: join(outputsDir, queued.id, "make-video-report.json")
    }));
    expect(resumedCalls).toEqual([queued.outDir]);
  });

  it("hydrates result links and cost summary for completed jobs saved before result fields existed", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-video-job-hydrate-"));
    tempDirs.push(root);
    const outputsDir = join(root, "outputs");
    const jobId = "job-20260607090000000-001";
    const outDir = join(outputsDir, jobId);
    const report = makeReport({
      productPath: join(root, "fixtures", "products", "box.json"),
      outDir,
      providerName: "mock",
      durationSeconds: 8,
      cta: "今すぐチェック",
      template: "scene",
      confirmPaid: false
    });
    await mkdir(join(outputsDir, jobId), { recursive: true });
    await mkdir(join(report.reportPath, ".."), { recursive: true });
    await writeFile(report.reportPath, JSON.stringify(report, null, 2), "utf8");
    await writeFile(
      join(outputsDir, jobId, "job.json"),
      JSON.stringify(
        {
          id: jobId,
          status: "completed",
          productPath: join(root, "fixtures", "products", "box.json"),
          productSku: "TK-001",
          provider: "mock",
          durationSeconds: 8,
          template: "scene",
          cta: "今すぐチェック",
          confirmPaid: false,
          outDir,
          reportPath: report.reportPath,
          createdAt: "2026-06-07T09:00:00.000Z",
          updatedAt: "2026-06-07T09:01:00.000Z",
          completedAt: "2026-06-07T09:01:00.000Z"
        },
        null,
        2
      ),
      "utf8"
    );
    const queue = new LocalVideoJobQueue({
      rootDir: root,
      outputsDir,
      settingsStore: new FileConsoleSettingsStore(join(outputsDir, "console-settings.json")),
      now: () => new Date("2026-06-07T09:02:00.000Z")
    });

    const jobs = await queue.list();

    expect(jobs[0]).toEqual(expect.objectContaining({
      id: jobId,
      status: "completed",
      reportUrl: `/media?path=${encodeURIComponent(report.reportPath)}`,
      finalOutputPath: report.final?.outputPath,
      finalVideoUrl: `/media?path=${encodeURIComponent(report.final?.outputPath ?? "")}`,
      totalTokens: 324900,
      estimatedCostCny: 12.02
    }));
  });

  it("marks persisted running jobs as failed on restart instead of replaying them", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-video-job-interrupted-"));
    tempDirs.push(root);
    const outputsDir = join(root, "outputs");
    const interruptedId = "job-20260607090000000-001";
    await mkdir(join(outputsDir, interruptedId), { recursive: true });
    await writeFile(
      join(outputsDir, interruptedId, "job.json"),
      JSON.stringify(
        {
          id: interruptedId,
          status: "running",
          productPath: join(root, "fixtures", "products", "box.json"),
          provider: "mock",
          durationSeconds: 8,
          template: "scene",
          cta: "今すぐチェック",
          confirmPaid: false,
          outDir: join(outputsDir, interruptedId),
          createdAt: "2026-06-07T09:00:00.000Z",
          updatedAt: "2026-06-07T09:00:01.000Z",
          startedAt: "2026-06-07T09:00:01.000Z"
        },
        null,
        2
      ),
      "utf8"
    );
    const calls: string[] = [];
    const queue = new LocalVideoJobQueue({
      rootDir: root,
      outputsDir,
      settingsStore: new FileConsoleSettingsStore(join(outputsDir, "console-settings.json")),
      now: () => new Date("2026-06-07T09:02:00.000Z"),
      runMakeVideoPipeline: async (input) => {
        calls.push(input.outDir);
        return makeReport(input);
      }
    });

    await queue.startSavedJobs();
    const interrupted = await queue.get(interruptedId);

    expect(interrupted).toEqual(expect.objectContaining({
      id: interruptedId,
      status: "failed",
      completedAt: "2026-06-07T09:02:00.000Z",
      error: "Job was interrupted by a server restart before completion."
    }));
    expect(calls).toEqual([]);
  });
});

async function waitForStatus(
  queue: LocalVideoJobQueue,
  id: string,
  status: string
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const record = await queue.get(id);
    if (record.status === status) {
      return record;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${id} to become ${status}.`);
}

function makeReport(input: Parameters<NonNullable<ConstructorParameters<typeof LocalVideoJobQueue>[0]["runMakeVideoPipeline"]>>[0]) {
  return {
    type: "haitu_make_video_report" as const,
    status: "completed" as const,
    productSku: "TK-001",
    provider: input.providerName,
    durationSeconds: input.durationSeconds,
    paidRequestConfirmed: input.confirmPaid,
    raw: {
      manifestPath: join(input.outDir, "raw", "manifest.json"),
      outputPath: join(input.outDir, "raw", "video.txt")
    },
    final: {
      manifestPath: join(input.outDir, "final", "manifest.json"),
      outputPath: join(input.outDir, "final", "final.mp4"),
      subtitlePath: join(input.outDir, "final", "subtitles.srt")
    },
    billing: {
      tokenPriceCnyPerMillion: 37,
      totalTokens: 324900,
      estimatedCostCny: 12.02
    },
    totalCost: {
      amount: 0,
      currency: "USD" as const
    },
    reusedRawManifest: false,
    recoveredRawOutput: false,
    reportPath: join(input.outDir, "make-video-report.json")
  };
}

async function writeProduct(path: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(
    path,
    JSON.stringify(
      {
        sku: "TK-001",
        title_ja: "折りたたみ収納ボックス",
        category: "収納用品",
        materials: ["PP"],
        dimensions: "36x25x19cm",
        verified_selling_points: ["折りたたみ可能", "積み重ね可能", "省スペース"],
        usage_scenes: ["キッチン", "洗面所", "クローゼット"],
        forbidden_claims: ["防水未確認", "耐荷重未確認", "日本で大人気は未確認"],
        reference_images: ["main.jpg"]
      },
      null,
      2
    ),
    "utf8"
  );
}
