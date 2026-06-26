import { buildJobLedger } from "./jobLedger.js";
import type { FileAuditLog } from "./auditLog.js";
import type { FileConsoleSettingsStore } from "./consoleSettings.js";
import { jsonResponse } from "./consoleHttpService.js";
import type { ConsoleRequestContext } from "./consoleWorkspaceRuntime.js";
import { runConsoleMakeVideo } from "./consoleMakeVideoService.js";
import {
  cancelQueuedProviderTask,
  getProviderTask,
  listProviderTasks
} from "./providerTaskService.js";
import type { FileReviewStore } from "./reviewStore.js";
import {
  assertRetryVideoJobAllowed,
  reserveRetryVideoJobBilling
} from "./videoJobBilling.js";
import {
  enqueueBatchVideoJobs,
  enqueueVideoJob,
  type BatchVideoJobRequest,
  type MakeVideoRequest
} from "./videoJobService.js";
import {
  runConsolePreflight,
  type PreflightRequest
} from "./videoPreflightService.js";

interface RetryVideoJobRequest {
  confirmPaid?: boolean;
}

export async function handleVideoRoutes(input: {
  request: Request;
  url: URL;
  requestContext: ConsoleRequestContext;
  rootDir: string;
  dataDir: string;
  settingsStore: FileConsoleSettingsStore;
  reviewStore: FileReviewStore;
  auditLog: FileAuditLog;
  fetchImpl?: typeof fetch;
  runMakeVideoPipeline?: Parameters<typeof runConsoleMakeVideo>[1]["runMakeVideoPipeline"];
}): Promise<Response | undefined> {
  const {
    request,
    url,
    requestContext,
    dataDir,
    settingsStore,
    reviewStore,
    auditLog,
    fetchImpl,
    runMakeVideoPipeline
  } = input;

  if (request.method === "POST" && url.pathname === "/api/preflight") {
    const body = (await request.json()) as PreflightRequest;
    return jsonResponse({
      preflight: await runConsolePreflight(body, {
        rootDir: dataDir,
        outputsDir: requestContext.outputsDir,
        settingsStore
      })
    });
  }
  if (request.method === "POST" && url.pathname === "/api/make-video") {
    const body = (await request.json()) as MakeVideoRequest;
    const report = await runConsoleMakeVideo(body, {
      rootDir: dataDir,
      outputsDir: requestContext.outputsDir,
      settingsStore,
      modelConfigStore: requestContext.modelConfigStore,
      platformModelConfigStore: requestContext.platformModelConfigStore,
      modelBundleStore: requestContext.modelBundleStore,
      modelServicePreferenceStore: requestContext.modelServicePreferenceStore,
      fetchImpl,
      runMakeVideoPipeline,
      referenceImageUrlResolver: requestContext.referenceImageUrlResolver
    });
    return jsonResponse({ report });
  }
  if (request.method === "POST" && url.pathname === "/api/video-jobs/batch") {
    const body = (await request.json()) as BatchVideoJobRequest;
    return jsonResponse({
      jobs: await enqueueBatchVideoJobs(body, {
        rootDir: dataDir,
        outputsDir: requestContext.outputsDir,
        fixturesDir: requestContext.fixturesDir,
        settingsStore,
        modelConfigStore: requestContext.modelConfigStore,
        platformModelConfigStore: requestContext.platformModelConfigStore,
        modelBundleStore: requestContext.modelBundleStore,
        modelServicePreferenceStore: requestContext.modelServicePreferenceStore,
        walletStore: requestContext.walletStore,
        videoJobQueue: requestContext.videoJobQueue
      })
    });
  }
  if (request.method === "POST" && url.pathname === "/api/video-jobs") {
    const body = (await request.json()) as MakeVideoRequest;
    return jsonResponse({
      job: await enqueueVideoJob(body, {
        rootDir: dataDir,
        settingsStore,
        modelConfigStore: requestContext.modelConfigStore,
        platformModelConfigStore: requestContext.platformModelConfigStore,
        modelBundleStore: requestContext.modelBundleStore,
        modelServicePreferenceStore: requestContext.modelServicePreferenceStore,
        walletStore: requestContext.walletStore,
        videoJobQueue: requestContext.videoJobQueue
      })
    });
  }
  if (request.method === "GET" && url.pathname === "/api/video-jobs") {
    return jsonResponse({
      jobs: await requestContext.videoJobQueue.list()
    });
  }
  if (request.method === "GET" && url.pathname === "/api/video-jobs/groups") {
    const ledger = await buildJobLedger(requestContext.outputsDir, {
      reviewState: await reviewStore.read()
    });
    return jsonResponse({
      groups: ledger.products,
      products: ledger.products
    });
  }
  const videoJobCancelMatch = url.pathname.match(/^\/api\/video-jobs\/([^/]+)\/cancel$/);
  if (request.method === "POST" && videoJobCancelMatch) {
    const jobId = decodeURIComponent(videoJobCancelMatch[1] ?? "");
    const job = await requestContext.videoJobQueue.cancel(jobId);
    await auditLog.append({
      action: "video_job.cancelled",
      target: job.id,
      metadata: {
        productSku: job.productSku,
        provider: job.provider
      }
    });
    return jsonResponse({
      job
    });
  }
  const videoJobRetryMatch = url.pathname.match(/^\/api\/video-jobs\/([^/]+)\/retry$/);
  if (request.method === "POST" && videoJobRetryMatch) {
    const jobId = decodeURIComponent(videoJobRetryMatch[1] ?? "");
    const body = (await request.json()) as RetryVideoJobRequest;
    const retryRecord = await assertRetryVideoJobAllowed({
      jobId,
      confirmPaid: body.confirmPaid,
      videoJobQueue: requestContext.videoJobQueue,
      modelConfigStore: requestContext.modelConfigStore,
      platformModelConfigStore: requestContext.platformModelConfigStore
    });
    const billing = await reserveRetryVideoJobBilling({
      record: retryRecord,
      walletStore: requestContext.walletStore,
      modelConfigStore: requestContext.modelConfigStore,
      platformModelConfigStore: requestContext.platformModelConfigStore,
      modelBundleStore: requestContext.modelBundleStore,
      modelServicePreferenceStore: requestContext.modelServicePreferenceStore
    });
    const job = await requestContext.videoJobQueue.retry(jobId, {
      confirmPaid: body.confirmPaid === true,
      ...billing
    });
    await auditLog.append({
      action: "video_job.retried",
      target: job.id,
      metadata: {
        originalJobId: jobId,
        productSku: job.productSku,
        provider: job.provider,
        confirmPaid: body.confirmPaid === true
      }
    });
    return jsonResponse({
      job
    });
  }
  const videoJobRecoverDownloadMatch = url.pathname.match(/^\/api\/video-jobs\/([^/]+)\/recover-download$/);
  if (request.method === "POST" && videoJobRecoverDownloadMatch) {
    const jobId = decodeURIComponent(videoJobRecoverDownloadMatch[1] ?? "");
    const job = await requestContext.videoJobQueue.recoverDownload(jobId);
    await auditLog.append({
      action: "video_job.download_recovered",
      target: job.id,
      metadata: {
        productSku: job.productSku,
        provider: job.provider,
        providerTaskId: job.providerTaskId
      }
    });
    return jsonResponse({
      job
    });
  }
  const videoJobMatch = url.pathname.match(/^\/api\/video-jobs\/([^/]+)$/);
  if (request.method === "GET" && videoJobMatch) {
    return jsonResponse({
      job: await requestContext.videoJobQueue.get(decodeURIComponent(videoJobMatch[1] ?? ""))
    });
  }
  if (request.method === "GET" && url.pathname === "/api/provider-tasks") {
    return jsonResponse({
      usage: await listProviderTasks(url, {
        modelConfigStore: requestContext.modelConfigStore,
        platformModelConfigStore: requestContext.platformModelConfigStore,
        modelBundleStore: requestContext.modelBundleStore,
        modelServicePreferenceStore: requestContext.modelServicePreferenceStore,
        fetchImpl
      })
    });
  }
  const providerTaskMatch = url.pathname.match(/^\/api\/provider-tasks\/([^/]+)(?:\/cancel)?$/);
  if (providerTaskMatch) {
    const taskId = decodeURIComponent(providerTaskMatch[1] ?? "");
    if (request.method === "GET" && !url.pathname.endsWith("/cancel")) {
      return jsonResponse({
        task: await getProviderTask(taskId, {
          modelConfigStore: requestContext.modelConfigStore,
          platformModelConfigStore: requestContext.platformModelConfigStore,
          modelBundleStore: requestContext.modelBundleStore,
          modelServicePreferenceStore: requestContext.modelServicePreferenceStore,
          fetchImpl
        })
      });
    }
    if (request.method === "POST" && url.pathname.endsWith("/cancel")) {
      await cancelQueuedProviderTask(taskId, {
        modelConfigStore: requestContext.modelConfigStore,
        platformModelConfigStore: requestContext.platformModelConfigStore,
        modelBundleStore: requestContext.modelBundleStore,
        modelServicePreferenceStore: requestContext.modelServicePreferenceStore,
        fetchImpl
      });
      return jsonResponse({
        cancelled: true,
        taskId
      });
    }
  }
  return undefined;
}
