import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, copyFile, mkdir, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";

import { resolveReferenceImages } from "../core/productAssetResolver.js";
import {
  buildProductImportQuality,
  cleanImportedProductText,
  type ImportedProductPreview
} from "../core/productImportCleaner.js";
import { parseProductFacts } from "../core/productFacts.js";
import { generateVideoPrompt } from "../core/promptGenerator.js";
import {
  buildTemplateCatalogState,
  isScriptTemplate,
  normalizeEnabledTemplates,
  videoTemplateDefinitions
} from "../core/templateCatalog.js";
import { normalizeFinalVideoLanguage, type FinalVideoLanguage } from "../core/videoLanguage.js";
import { runMakeVideoPipeline, type MakeVideoReport } from "../pipeline/makeVideoPipeline.js";
import type { ScriptTemplate } from "../core/scriptGenerator.js";
import { generateJapaneseAdScript } from "../core/scriptGenerator.js";
import type { VideoProviderName } from "../providers/providerFactory.js";
import { VolcengineUsageClient, type ListUsageTasksRequest } from "../providers/volcengine/usageClient.js";
import {
  OpenAiCompatibleTextProvider,
  imageModelBaseUrl,
  imageModelName,
  textModelBaseUrl,
  textModelName
} from "../providers/openaiCompatibleTextProvider.js";
import { ZodError } from "zod";
import { OpenAiCompatibleImageProvider } from "../providers/openaiCompatibleImageProvider.js";
import { FileAuditLog } from "./auditLog.js";
import { buildJobLedger, buildJobLedgerFromReports, deleteJobLedgerEntry } from "./jobLedger.js";
import { isPublicConsoleRoute, type ConsoleAuthStore } from "./consoleAuth.js";
import {
  DEFAULT_WORKSPACE_ID,
  getProductPaths,
  getStorageRoots,
  getWorkspacePaths,
  resolveDataDir
} from "./storagePaths.js";
import {
  createPublishPackage,
  listPublishPackages,
  type PublishPackageLedger,
  type PublishPackageManifest
} from "./publishPackage.js";
import {
  FileReviewStore,
  isManualReviewDecision,
  type ManualReviewInput,
  type SelectFinalInput
} from "./reviewStore.js";
import { FileConsoleSettingsStore } from "./consoleSettings.js";
import { LocalVideoJobQueue, type LocalVideoJobQueueOptions } from "./consoleVideoJobQueue.js";
import {
  maskSecret,
  providerKeyStatus,
  resolveImageModelApiKey,
  resolveProviderApiKey,
  resolveTextModelApiKey,
  type ApiProviderId,
  type ProviderKeySource,
  type ProviderKeyStore,
  type ProviderStoredConfig
} from "./providerKeyStore.js";
import { cleanupExpiredVideos } from "./videoRetention.js";
import { BetterAuthConsoleAuthStore } from "./auth/betterAuthStore.js";
import { closeDatabase, openDatabase, type DatabaseHandle } from "./db/client.js";
import { resolveDatabaseSecretKey } from "./db/crypto.js";
import { ensureDefaultWorkspace, runMigrations } from "./db/migrate.js";
import { SqliteProviderKeyStore } from "./db/sqliteProviderKeyStore.js";

export interface ConsoleServerOptions {
  rootDir?: string;
  dataDir?: string;
  fixturesDir?: string;
  outputsDir?: string;
  consoleDistDir?: string;
  fetchImpl?: typeof fetch;
  runMakeVideoPipeline?: LocalVideoJobQueueOptions["runMakeVideoPipeline"];
  autoStartSavedJobs?: boolean;
}

export interface ConsoleServerHandle {
  fetch(path: string, init?: RequestInit): Promise<Response>;
  fetchJson(path: string, init?: RequestInit): Promise<any>;
  listen(port: number, hostname?: string): Promise<{
    url: string;
    close(): Promise<void>;
  }>;
}

interface MakeVideoRequest {
  productPath: string;
  outDirName?: string;
  provider?: VideoProviderName;
  providerModel?: string;
  duration?: number;
  template?: ScriptTemplate;
  finalLanguage?: FinalVideoLanguage;
  cta?: string;
  scriptLines?: string[];
  storyboardLines?: string[];
  confirmPaid?: boolean;
  reuseManifest?: string;
}

interface BatchVideoJobRequest extends MakeVideoRequest {
  versions?: number;
}

type ProductVideoJobRequest = Omit<BatchVideoJobRequest, "productPath">;

interface PublishPackageRequest {
  productSku: string;
  jobId?: string;
}

interface PreflightRequest {
  productPath: string;
  provider?: VideoProviderName;
  duration?: number;
  template?: ScriptTemplate;
  finalLanguage?: FinalVideoLanguage;
  cta?: string;
  scriptLines?: string[];
  storyboardLines?: string[];
}

interface ProductImagePreview {
  original: string;
  resolvedPath: string;
  previewUrl: string | null;
  status: "previewable" | "missing" | "outside-project-root" | "remote";
}

interface ImportedProductAsset {
  original: string;
  path: string;
  reference: string;
}

interface UploadProductReferenceImagesRequest {
  files?: Array<{
    fileName?: string;
    mimeType?: string;
    base64?: string;
  }>;
}

interface GenerateProductReferenceImagesRequest {
  count?: number;
  prompt?: string;
}

interface ImportProductPreviewRequest {
  text?: string;
}

interface StoryboardDraftRequest {
  duration?: number;
  template?: ScriptTemplate;
}

interface StoryboardHistoryRequest {
  style?: unknown;
  duration?: unknown;
  script?: unknown;
}

interface StoryboardRecord {
  id: string;
  createdAt: string;
  style: ScriptTemplate;
  duration: number;
  script: string;
}

interface ImportProductsBatchRequest {
  text?: string;
}

interface DeleteVideoAssetRequest {
  path?: string;
  confirm?: boolean;
}

interface RetryVideoJobRequest {
  confirmPaid?: boolean;
}

interface TemplateManagementRequest {
  defaultTemplate?: unknown;
  enabledTemplates?: unknown;
}

interface ProviderKeyRequest {
  configId?: string;
  apiKey?: string;
  name?: string;
  vendor?: string;
  priority?: number;
  baseUrl?: string;
  model?: string;
  enabled?: boolean;
}

interface ProviderConfigTestRequest extends ProviderKeyRequest {}

interface UploadedProductReferenceImage {
  originalName: string;
  path: string;
  reference: string;
}

interface GeneratedProductReferenceImage {
  path: string;
  reference: string;
}

interface ProviderConfigItem {
  id: ApiProviderId;
  configId?: string;
  label: string;
  providerLabel?: string;
  configured: boolean;
  keySource?: ProviderKeySource;
  keyPreview?: string;
  baseUrl: string;
  model: string;
  priority: number;
  capabilities: string[];
  modelKind: "text" | "image" | "video";
}

interface VideoProviderConfigItem extends ProviderConfigItem {
  id: "volcengine-seedance";
  modelKind: "video";
  resolution: "480p" | "720p" | "1080p";
  tokenPriceCnyPerMillion: number;
  estimatedCostCnyPerSecond: number;
  watermark: boolean;
  docsUrl: string;
}

interface ProviderConfigLedger {
  textModels: ProviderConfigItem[];
  imageModels: ProviderConfigItem[];
  videoModels: VideoProviderConfigItem[];
  providers: VideoProviderConfigItem[];
}

interface ProductListQuality {
  ready: boolean;
  score: number;
  summary: string;
  missingFields: string[];
  verifiedFacts: string[];
  warnings: string[];
}

interface ConsoleRequestContext {
  workspaceId: string;
  databaseHandle: DatabaseHandle;
  workspacePaths: ReturnType<typeof getWorkspacePaths>;
  fixturesDir: string;
  outputsDir: string;
  providerKeyStore: ProviderKeyStore;
  videoJobQueue: LocalVideoJobQueue;
}

export function createConsoleServer(options: ConsoleServerOptions = {}): ConsoleServerHandle {
  const rootDir = options.rootDir ?? process.cwd();
  const dataDir = resolveDataDir({
    rootDir,
    dataDir: options.dataDir,
    env: process.env
  });
  const storageRoots = getStorageRoots(dataDir);
  const workspacePaths = getWorkspacePaths(dataDir, DEFAULT_WORKSPACE_ID);
  const productsDir = workspacePaths.productsDir;
  const fixturesDir = productsDir;
  const outputsDir = workspacePaths.jobsDir;
  const consoleDistDir = options.consoleDistDir ?? join(rootDir, "dist", "console");
  const reviewStore = new FileReviewStore(join(workspacePaths.settingsDir, "review-state.json"));
  const settingsStore = new FileConsoleSettingsStore(join(storageRoots.systemDir, "console-settings.json"));
  const databaseHandle = createDatabaseHandle(dataDir);
  const defaultProviderKeyStore = createProviderKeyStore({
    databaseHandle,
    workspaceId: DEFAULT_WORKSPACE_ID,
    legacyFilePath: workspacePaths.providerKeysFile
  });
  const auditLog = new FileAuditLog(join(storageRoots.systemDir, "audit-log.jsonl"));
  const authStore = new BetterAuthConsoleAuthStore({
    handle: databaseHandle,
    dataDir,
    env: process.env
  });
  const runConfiguredMakeVideoPipeline = createConfiguredMakeVideoPipeline({
    providerKeyStore: defaultProviderKeyStore,
    runMakeVideoPipeline: options.runMakeVideoPipeline
  });
  const videoJobQueue = new LocalVideoJobQueue({
    rootDir,
    outputsDir,
    workspaceId: DEFAULT_WORKSPACE_ID,
    settingsStore,
    fetchImpl: options.fetchImpl,
    runMakeVideoPipeline: runConfiguredMakeVideoPipeline,
    databaseHandle
  });
  const workspaceVideoJobQueues = new Map<string, LocalVideoJobQueue>([
    [DEFAULT_WORKSPACE_ID, videoJobQueue]
  ]);
  const runVideoRetentionCleanup = async () => {
    for (const workspaceId of retentionWorkspaceIds(databaseHandle)) {
      await cleanupExpiredVideos({
        dataDir,
        workspaceId,
        databaseHandle,
        onDeleteError: async (error, filePath) => {
          await auditLog.append({
            action: "video_retention.delete_failed",
            target: filePath,
            metadata: {
              workspaceId,
              error: error instanceof Error ? error.message : String(error)
            }
          });
        }
      });
    }
  };
  void runVideoRetentionCleanup().catch((error: unknown) => {
    void auditLog.append({
      action: "video_retention.cleanup_failed",
      metadata: {
        error: error instanceof Error ? error.message : String(error)
      }
    });
  });
  const videoRetentionTimer = setInterval(() => {
    void runVideoRetentionCleanup().catch((error: unknown) => {
      void auditLog.append({
        action: "video_retention.cleanup_failed",
        metadata: {
          error: error instanceof Error ? error.message : String(error)
        }
      });
    });
  }, 30 * 60 * 1000);
  videoRetentionTimer.unref?.();
  if (options.autoStartSavedJobs !== false) {
    void videoJobQueue.startSavedJobs();
  }

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return jsonResponse({
          ok: true,
          service: "haitu-video-console",
          storage: "local",
          uptimeSeconds: Math.floor(process.uptime()),
          checkedAt: new Date().toISOString()
        });
      }
      if (request.method === "GET" && url.pathname === "/api/auth/session") {
        return jsonResponse(await authStore.sessionStatus(request));
      }
      if (request.method === "POST" && url.pathname === "/api/auth/enter") {
        const response = await authStore.enter(await request.json());
        await auditLog.append({
          action: response.ok ? "auth.enter" : "auth.enter_failed",
          metadata: {
            status: response.status
          }
        });
        return response;
      }
      if (request.method === "POST" && url.pathname === "/api/auth/verify-email") {
        const response = await authStore.verifyEmail(await request.json());
        await auditLog.append({
          action: response.ok ? "auth.email_verified" : "auth.email_verification_failed",
          metadata: {
            status: response.status
          }
        });
        return response;
      }
      if (request.method === "POST" && url.pathname === "/api/auth/request-password-reset") {
        const response = await authStore.requestPasswordReset(await request.json());
        await auditLog.append({
          action: response.ok ? "auth.password_reset_requested" : "auth.password_reset_request_failed",
          metadata: {
            status: response.status
          }
        });
        return response;
      }
      if (request.method === "POST" && url.pathname === "/api/auth/reset-password") {
        const response = await authStore.resetPassword(await request.json());
        await auditLog.append({
          action: response.ok ? "auth.password_reset" : "auth.password_reset_failed",
          metadata: {
            status: response.status
          }
        });
        return response;
      }
      if (request.method === "POST" && url.pathname === "/api/auth/logout") {
        const response = await authStore.logout(request);
        await auditLog.append({
          action: "auth.logout"
        });
        return response;
      }
      if (!isPublicConsoleRoute(request)) {
        const authResponse = await authStore.requireAuth(request);
        if (authResponse) {
          return authResponse;
        }
      }
      if ((request.method === "GET" || request.method === "HEAD") && (url.pathname === "/" || url.pathname === "/console")) {
        return new Response(request.method === "HEAD" ? undefined : await readConsoleIndex(consoleDistDir), {
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }
      if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/assets/")) {
        return await consoleAssetResponse(url.pathname, {
          consoleDistDir,
          head: request.method === "HEAD"
        });
      }
      if (request.method === "GET" && url.pathname.startsWith("/static/")) {
        return staticResponse(url.pathname.slice("/static/".length));
      }
      const requestContext = await createRequestContext({
        request,
        dataDir,
        rootDir,
        databaseHandle,
        authStore,
        defaultProviderKeyStore,
        defaultVideoJobQueue: videoJobQueue,
        workspaceVideoJobQueues,
        settingsStore,
        fetchImpl: options.fetchImpl,
        runMakeVideoPipeline: options.runMakeVideoPipeline
      });
      if (request.method === "GET" && url.pathname === "/api/products") {
        return jsonResponse({
          products: await listProducts(requestContext.fixturesDir, dataDir, {
            databaseHandle: requestContext.databaseHandle,
            workspaceId: requestContext.workspaceId
          })
        });
      }
      if (request.method === "POST" && url.pathname === "/api/products") {
        return jsonResponse({
          product: await saveProductFactPackage({
            fixturesDir: requestContext.fixturesDir,
            rootDir: dataDir,
            workspaceId: requestContext.workspaceId,
            databaseHandle: requestContext.databaseHandle,
            input: await request.json()
          })
        });
      }
      if (request.method === "POST" && url.pathname === "/api/products/import-preview") {
        return jsonResponse(buildImportedProductPreview((await request.json()) as ImportProductPreviewRequest));
      }
      if (request.method === "POST" && url.pathname === "/api/products/import-ai-preview") {
        return jsonResponse(await buildAiImportedProductPreview({
          providerKeyStore: requestContext.providerKeyStore,
          fetchImpl: options.fetchImpl,
          input: (await request.json()) as ImportProductPreviewRequest
        }));
      }
      if (request.method === "POST" && url.pathname === "/api/products/import") {
        return jsonResponse(
          await importProductFromText({
            fixturesDir: requestContext.fixturesDir,
            rootDir: dataDir,
            workspaceId: requestContext.workspaceId,
            databaseHandle: requestContext.databaseHandle,
            input: (await request.json()) as ImportProductPreviewRequest
          })
        );
      }
      if (request.method === "POST" && url.pathname === "/api/products/import-batch") {
        return jsonResponse(
          await importProductsBatchFromText({
            fixturesDir: requestContext.fixturesDir,
            rootDir: dataDir,
            workspaceId: requestContext.workspaceId,
            databaseHandle: requestContext.databaseHandle,
            input: (await request.json()) as ImportProductsBatchRequest
          })
        );
      }
      const productVideoJobsMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/video-jobs$/);
      if (request.method === "POST" && productVideoJobsMatch) {
        const sku = decodeURIComponent(productVideoJobsMatch[1] ?? "");
        return jsonResponse({
          productSku: sku,
          jobs: await enqueueProductVideoJobsBySku((await request.json()) as ProductVideoJobRequest, {
            sku,
            rootDir: dataDir,
            outputsDir: requestContext.outputsDir,
            fixturesDir: requestContext.fixturesDir,
            settingsStore,
            videoJobQueue: requestContext.videoJobQueue
          })
        });
      }
      const productStoryboardDraftMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/storyboard-draft$/);
      if (request.method === "POST" && productStoryboardDraftMatch) {
        const sku = decodeURIComponent(productStoryboardDraftMatch[1] ?? "");
        return jsonResponse(await buildAiStoryboardDraft({
          sku,
          fixturesDir: requestContext.fixturesDir,
          rootDir: dataDir,
          providerKeyStore: requestContext.providerKeyStore,
          fetchImpl: options.fetchImpl,
          input: (await request.json()) as StoryboardDraftRequest
        }));
      }
      const productStoryboardsMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/storyboards$/);
      if (request.method === "GET" && productStoryboardsMatch) {
        return jsonResponse({
          storyboards: await listProductStoryboards({
            fixturesDir: requestContext.fixturesDir,
            databaseHandle: requestContext.databaseHandle,
            workspaceId: requestContext.workspaceId,
            sku: decodeURIComponent(productStoryboardsMatch[1] ?? "")
          })
        });
      }
      if (request.method === "POST" && productStoryboardsMatch) {
        return jsonResponse({
          storyboard: await createProductStoryboard({
            fixturesDir: requestContext.fixturesDir,
            databaseHandle: requestContext.databaseHandle,
            workspaceId: requestContext.workspaceId,
            sku: decodeURIComponent(productStoryboardsMatch[1] ?? ""),
            input: (await request.json()) as StoryboardHistoryRequest
          })
        });
      }
      const deleteProductStoryboardMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/storyboards\/([^/]+)$/);
      if (request.method === "DELETE" && deleteProductStoryboardMatch) {
        return jsonResponse(await deleteProductStoryboard({
          fixturesDir: requestContext.fixturesDir,
          databaseHandle: requestContext.databaseHandle,
          workspaceId: requestContext.workspaceId,
          sku: decodeURIComponent(deleteProductStoryboardMatch[1] ?? ""),
          id: decodeURIComponent(deleteProductStoryboardMatch[2] ?? "")
        }));
      }
      const productMatch = url.pathname.match(/^\/api\/products\/([^/]+)$/);
      if (request.method === "GET" && productMatch) {
        return jsonResponse({
          product: await getProductBySku({
            fixturesDir: requestContext.fixturesDir,
            rootDir: dataDir,
            sku: decodeURIComponent(productMatch[1] ?? "")
          })
        });
      }
      if (request.method === "DELETE" && productMatch) {
        const sku = decodeURIComponent(productMatch[1] ?? "");
        const result = await deleteProductBySku({
          fixturesDir: requestContext.fixturesDir,
          databaseHandle: requestContext.databaseHandle,
          workspaceId: requestContext.workspaceId,
          sku
        });
        await auditLog.append({
          action: "product.deleted",
          target: sku,
          metadata: {
            path: result.path
          }
        });
        return jsonResponse(result);
      }
      const importProductAssetsMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/import-assets$/);
      if (request.method === "POST" && importProductAssetsMatch) {
        return jsonResponse(
          await importProductReferenceAssets({
            fixturesDir: requestContext.fixturesDir,
            rootDir: dataDir,
            sku: decodeURIComponent(importProductAssetsMatch[1] ?? "")
          })
        );
      }
      const uploadProductAssetsMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/reference-images$/);
      if (request.method === "POST" && uploadProductAssetsMatch) {
        return jsonResponse(
          await uploadProductReferenceImages({
            fixturesDir: requestContext.fixturesDir,
            rootDir: dataDir,
            sku: decodeURIComponent(uploadProductAssetsMatch[1] ?? ""),
            input: (await request.json()) as UploadProductReferenceImagesRequest
          })
        );
      }
      const deleteProductAssetMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/reference-images\/(\d+)$/);
      if (request.method === "DELETE" && deleteProductAssetMatch) {
        return jsonResponse(
          await deleteProductReferenceImage({
            fixturesDir: requestContext.fixturesDir,
            rootDir: dataDir,
            sku: decodeURIComponent(deleteProductAssetMatch[1] ?? ""),
            index: Number(deleteProductAssetMatch[2])
          })
        );
      }
      const generateProductAssetsMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/reference-images\/generate$/);
      if (request.method === "POST" && generateProductAssetsMatch) {
        return jsonResponse(
          await generateProductReferenceImages({
            fixturesDir: requestContext.fixturesDir,
            rootDir: dataDir,
            providerKeyStore: requestContext.providerKeyStore,
            fetchImpl: options.fetchImpl,
            sku: decodeURIComponent(generateProductAssetsMatch[1] ?? ""),
            input: (await request.json()) as GenerateProductReferenceImagesRequest
          })
        );
      }
      if (request.method === "GET" && url.pathname === "/api/reports") {
        return jsonResponse({
          reports: await listReports(requestContext.outputsDir, {
            productSku: queryValue(url, "productSku"),
            provider: queryValue(url, "provider"),
            status: queryValue(url, "status"),
            finalOnly: url.searchParams.get("finalOnly") === "true"
          })
        });
      }
      if (request.method === "GET" && url.pathname === "/api/job-ledger") {
        return jsonResponse(await buildWorkspaceJobLedger(requestContext, {
          reviewState: await reviewStore.read()
        }));
      }
      const deleteJobLedgerMatch = url.pathname.match(/^\/api\/job-ledger\/([^/]+)$/);
      if (request.method === "DELETE" && deleteJobLedgerMatch) {
        const result = await deleteJobLedgerEntry(requestContext.outputsDir, decodeURIComponent(deleteJobLedgerMatch[1] ?? ""));
        if (requestContext.databaseHandle) {
          requestContext.databaseHandle.sqlite
            .prepare("DELETE FROM video_jobs WHERE workspace_id = ? AND id = ?")
            .run(requestContext.workspaceId, result.jobId);
        }
        await auditLog.append({
          action: "video_history.deleted",
          target: result.jobId,
          metadata: {
            path: result.path
          }
        });
        return jsonResponse(result);
      }
      if (request.method === "GET" && url.pathname === "/api/internal-validation/export.csv") {
        return csvResponse(
          await buildInternalValidationCsv({
            rootDir: dataDir,
            fixturesDir: requestContext.fixturesDir,
            outputsDir: requestContext.outputsDir,
            reviewStore
          }),
          "haitu-internal-validation.csv"
        );
      }
      if (request.method === "POST" && url.pathname === "/api/internal-validation/top-up") {
        return jsonResponse(
          await topUpInternalValidationJobs({
            rootDir: dataDir,
            fixturesDir: requestContext.fixturesDir,
            outputsDir: requestContext.outputsDir,
            videoJobQueue: requestContext.videoJobQueue
          })
        );
      }
      if (request.method === "GET" && url.pathname === "/api/publish-packages") {
        return jsonResponse(await withPublishPackageFileUrls(await listPublishPackages(outputsDir)));
      }
      if (request.method === "GET" && url.pathname === "/api/publish-packages/export.csv") {
        return csvResponse(
          await buildPublishPackagesCsv(outputsDir),
          "haitu-publish-packages.csv"
        );
      }
      if (request.method === "GET" && url.pathname === "/api/qc-summary") {
        return jsonResponse(await buildQcSummary(outputsDir));
      }
      if (request.method === "GET" && url.pathname === "/api/video-assets") {
        return jsonResponse(await listVideoAssets({
          rootDir: dataDir,
          outputsDir: requestContext.outputsDir
        }));
      }
      if (request.method === "GET" && url.pathname === "/api/storage-backup") {
        return jsonResponse(await buildStorageBackupReport({
          dataDir
        }));
      }
      if (request.method === "GET" && url.pathname === "/api/backups") {
        return jsonResponse(await listLocalBackups({
          dataDir
        }));
      }
      if (request.method === "POST" && url.pathname === "/api/backups") {
        const backup = await createLocalBackup({
          dataDir
        });
        await auditLog.append({
          action: "backup.created",
          target: backup.path,
          metadata: {
            fileName: backup.fileName,
            sizeBytes: backup.sizeBytes
          }
        });
        return jsonResponse({
          backup
        });
      }
      if (request.method === "GET" && url.pathname === "/api/audit-log") {
        return jsonResponse(await auditLog.list({
          limit: positiveIntegerFromQuery(url, "limit", 50, 1, 200)
        }));
      }
      if (request.method === "DELETE" && url.pathname === "/api/video-assets") {
        const result = await deleteVideoAsset({
          rootDir: dataDir,
          input: (await request.json()) as DeleteVideoAssetRequest
        });
        await auditLog.append({
          action: "video_asset.deleted",
          target: result.path,
          metadata: {
            sizeBytes: result.sizeBytes
          }
        });
        return jsonResponse(result);
      }
      if (request.method === "GET" && url.pathname === "/api/provider-config") {
        return jsonResponse(await buildProviderConfig(requestContext.providerKeyStore));
      }
      const providerKeyTestMatch = url.pathname.match(/^\/api\/provider-keys\/([^/]+)\/test$/);
      if (providerKeyTestMatch && request.method === "POST") {
        const provider = parseApiProviderId(decodeURIComponent(providerKeyTestMatch[1] ?? ""));
        return jsonResponse(await testProviderConfig(provider, {
          providerKeyStore: requestContext.providerKeyStore,
          fetchImpl: options.fetchImpl,
          input: (await request.json()) as ProviderConfigTestRequest
        }));
      }
      const providerKeyMatch = url.pathname.match(/^\/api\/provider-keys\/([^/]+)$/);
      if (providerKeyMatch && request.method === "PUT") {
        const provider = parseApiProviderId(decodeURIComponent(providerKeyMatch[1] ?? ""));
        const saved = await requestContext.providerKeyStore.set(provider, (await request.json()) as ProviderKeyRequest);
        await auditLog.append({
          action: "provider_key.saved",
          target: provider,
          metadata: {
            keySource: saved.keySource,
            keyPreview: saved.keyPreview
          }
        });
        return jsonResponse({
          provider: saved
        });
      }
      if (providerKeyMatch && request.method === "DELETE") {
        const provider = parseApiProviderId(decodeURIComponent(providerKeyMatch[1] ?? ""));
        const deleted = await requestContext.providerKeyStore.delete(provider, url.searchParams.get("configId") ?? undefined);
        await auditLog.append({
          action: "provider_key.deleted",
          target: provider,
          metadata: {
            keySource: deleted.keySource
          }
        });
        return jsonResponse({
          provider: deleted
        });
      }
      if (request.method === "GET" && url.pathname === "/api/settings") {
        return jsonResponse({
          settings: await settingsStore.read()
        });
      }
      if (request.method === "PUT" && url.pathname === "/api/settings") {
        return jsonResponse({
          settings: await settingsStore.write(await request.json())
        });
      }
      if (request.method === "GET" && url.pathname === "/api/templates") {
        return jsonResponse(await listVideoTemplates(settingsStore));
      }
      if (request.method === "PUT" && url.pathname === "/api/templates") {
        return jsonResponse(await saveVideoTemplates(settingsStore, (await request.json()) as TemplateManagementRequest));
      }
      if (request.method === "POST" && url.pathname === "/api/reviews/select-final") {
        const body = (await request.json()) as SelectFinalInput;
        await assertSelectableFinalJob(body, outputsDir, reviewStore);
        const review = await reviewStore.setSelectedFinal({
          productSku: body.productSku,
          jobId: body.jobId,
          note: body.note
        });
        await auditLog.append({
          action: "review.selected_final",
          target: `${body.productSku}/${body.jobId}`,
          metadata: {
            productSku: body.productSku,
            jobId: body.jobId
          }
        });
        return jsonResponse({
          review
        });
      }
      if (request.method === "POST" && url.pathname === "/api/reviews/rate-version") {
        const body = (await request.json()) as ManualReviewInput;
        assertManualReviewInput(body);
        await assertReviewableJob(body, outputsDir, reviewStore);
        const review = await reviewStore.setManualReview({
          productSku: body.productSku,
          jobId: body.jobId,
          decision: body.decision,
          score: body.score,
          note: body.note
        });
        await auditLog.append({
          action: "review.rated_version",
          target: `${body.productSku}/${body.jobId}`,
          metadata: {
            productSku: body.productSku,
            jobId: body.jobId,
            decision: body.decision,
            score: body.score
          }
        });
        return jsonResponse({
          review
        });
      }
      if (request.method === "POST" && url.pathname === "/api/publish-packages") {
        const body = (await request.json()) as PublishPackageRequest;
        const publishPackage = await createPublishPackage({
          outputsDir,
          productSku: body.productSku,
          jobId: body.jobId,
          reviewState: await reviewStore.read()
        });
        await auditLog.append({
          action: "publish_package.created",
          target: `${publishPackage.productSku}/${publishPackage.jobId}`,
          metadata: {
            productSku: publishPackage.productSku,
            jobId: publishPackage.jobId,
            videoPath: publishPackage.files.videoPath
          }
        });
        return jsonResponse({
          package: await withPublishPackageFileUrl(publishPackage)
        });
      }
      if (request.method === "POST" && url.pathname === "/api/publish-packages/batch") {
        const result = await createPublishPackagesBatch({
          outputsDir,
          reviewStore
        });
        await auditLog.append({
          action: "publish_package.batch_created",
          metadata: {
            created: result.packages.length,
            skipped: result.skipped.length
          }
        });
        return jsonResponse(result);
      }
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
          providerKeyStore: requestContext.providerKeyStore,
          fetchImpl: options.fetchImpl
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
            videoJobQueue: requestContext.videoJobQueue
          })
        });
      }
      if (request.method === "POST" && url.pathname === "/api/video-jobs") {
        const body = (await request.json()) as MakeVideoRequest;
        const productPath = resolveWithin(dataDir, body.productPath);
        await assertTemplateEnabled(body, settingsStore);
        await assertWithinVideoBudget(body, settingsStore);
        await assertWithinTestCredit(body, {
          outputsDir: requestContext.outputsDir,
          settingsStore
        });
        const settings = await settingsStore.read();
        const providerName = body.provider ?? settings.defaultProvider;
        await assertPaidProductReady({
          provider: providerName,
          productPath,
          rootDir: dataDir
        });
        return jsonResponse({
          job: await requestContext.videoJobQueue.enqueue({
            productPath,
            outDirName: body.outDirName,
            provider: body.provider,
            providerModel: body.providerModel,
            duration: body.duration,
            template: body.template,
            finalLanguage: normalizeFinalVideoLanguage(body.finalLanguage ?? settings.defaultLanguage),
            cta: body.cta,
            scriptLines: sanitizeLines(body.scriptLines),
            storyboardLines: sanitizeLines(body.storyboardLines),
            confirmPaid: body.confirmPaid ?? providerName !== "mock",
            reuseManifest: body.reuseManifest ? resolveWithin(dataDir, body.reuseManifest) : undefined
          })
        });
      }
      if (request.method === "GET" && url.pathname === "/api/video-jobs") {
        return jsonResponse({
          jobs: await requestContext.videoJobQueue.list()
        });
      }
      if (request.method === "GET" && url.pathname === "/api/video-jobs/groups") {
        const ledger = await buildWorkspaceJobLedger(requestContext, {
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
        await assertRetryVideoJobAllowed({
          jobId,
          confirmPaid: body.confirmPaid,
          videoJobQueue: requestContext.videoJobQueue,
          settingsStore,
          outputsDir: requestContext.outputsDir
        });
        const job = await requestContext.videoJobQueue.retry(jobId, {
          confirmPaid: body.confirmPaid === true
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
      const videoJobMatch = url.pathname.match(/^\/api\/video-jobs\/([^/]+)$/);
      if (request.method === "GET" && videoJobMatch) {
        return jsonResponse({
          job: await requestContext.videoJobQueue.get(decodeURIComponent(videoJobMatch[1] ?? ""))
        });
      }
      if (request.method === "GET" && url.pathname === "/api/provider-tasks") {
        return jsonResponse({
          usage: await listProviderTasks(url, {
            providerKeyStore: defaultProviderKeyStore,
            fetchImpl: options.fetchImpl
          })
        });
      }
      const providerTaskMatch = url.pathname.match(/^\/api\/provider-tasks\/([^/]+)(?:\/cancel)?$/);
      if (providerTaskMatch) {
        const taskId = decodeURIComponent(providerTaskMatch[1] ?? "");
        if (request.method === "GET" && !url.pathname.endsWith("/cancel")) {
          return jsonResponse({
            task: await getProviderTask(taskId, {
              providerKeyStore: defaultProviderKeyStore,
              fetchImpl: options.fetchImpl
            })
          });
        }
        if (request.method === "POST" && url.pathname.endsWith("/cancel")) {
          await cancelQueuedProviderTask(taskId, {
            providerKeyStore: defaultProviderKeyStore,
            fetchImpl: options.fetchImpl
          });
          return jsonResponse({
            cancelled: true,
            taskId
          });
        }
      }
      if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/media") {
        return await mediaResponse(url.searchParams.get("path"), {
          rootDir: dataDir,
          head: request.method === "HEAD"
        });
      }
      return jsonResponse({ error: "Not found" }, 404);
    } catch (error) {
      const message = userFacingErrorMessage(error);
      if (message.includes("outside project root") || message.includes("outside data root")) {
        return jsonResponse({ error: message }, 403);
      }
      if (message.includes("Can cancel only queued tasks")) {
        return jsonResponse({ error: message }, 409);
      }
      if (message.includes("Can retry only failed local video jobs")) {
        return jsonResponse({ error: message }, 409);
      }
      if (message.includes("Unknown provider key target") || message.includes("Provider API key is required")) {
        return jsonResponse({ error: message }, 422);
      }
      if (message.includes("requires confirmPaid")) {
        return jsonResponse({ error: message }, 402);
      }
      if (message.includes("is disabled. Enable it in template management")) {
        return jsonResponse({ error: message }, 422);
      }
      if (message.includes("付费生成前请先补齐商品资料")) {
        return jsonResponse({ error: message }, 422);
      }
      if (message.includes("Reference image index")) {
        return jsonResponse({ error: message }, 422);
      }
      if (message.includes("exceeds budget cap")) {
        return jsonResponse({ error: message }, 402);
      }
      if (message.includes("exceeds remaining test credit")) {
        return jsonResponse({ error: message }, 402);
      }
      if (message.includes("Selected final job must belong")) {
        return jsonResponse({ error: message }, 422);
      }
      if (message.includes("Manual review requires") || message.includes("Manual review job must belong")) {
        return jsonResponse({ error: message }, 422);
      }
      if (message.includes("No selected final job") || message.includes("Publish package requires")) {
        return jsonResponse({ error: message }, 422);
      }
      if (message.includes("requires confirm") || message.includes("requires a video path")) {
        return jsonResponse({ error: message }, 422);
      }
      if (message.includes("Product not found")) {
        return jsonResponse({ error: message }, 404);
      }
      return jsonResponse({ error: message }, 500);
    }
  }

  return {
    async fetch(path: string, init?: RequestInit): Promise<Response> {
      return handle(new Request(`http://localhost${path}`, init));
    },
    async fetchJson(path: string, init?: RequestInit): Promise<any> {
      const response = await handle(new Request(`http://localhost${path}`, init));
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      return body;
    },
    async listen(port: number, hostname = "127.0.0.1") {
      const server = createServer((request, response) => {
        void nodeRequestToFetch(request)
          .then(handle)
          .then((fetchResponse) => writeNodeResponse(response, fetchResponse))
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: message }));
          });
      });
      await new Promise<void>((resolveListen) => server.listen(port, hostname, resolveListen));
      return {
        url: `http://${hostname}:${port}`,
        close: () =>
          new Promise<void>((resolveClose, reject) =>
            server.close((error) => (error ? reject(error) : resolveClose()))
          ).finally(() => {
            if (databaseHandle) {
              closeDatabase(databaseHandle);
            }
          })
      };
    }
  };
}

function createDatabaseHandle(dataDir: string): DatabaseHandle {
  resolveDatabaseSecretKey(process.env);
  const handle = openDatabase({ dataDir, env: process.env });
  runMigrations(handle);
  ensureDefaultWorkspace(handle);
  return handle;
}

function retentionWorkspaceIds(databaseHandle: DatabaseHandle): string[] {
  const rows = databaseHandle.sqlite.prepare(`
    SELECT id
    FROM workspaces
    ORDER BY id ASC
  `).all() as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

async function createRequestContext(input: {
  request: Request;
  dataDir: string;
  rootDir: string;
  databaseHandle: DatabaseHandle;
  authStore: ConsoleAuthStore;
  defaultProviderKeyStore: ProviderKeyStore;
  defaultVideoJobQueue: LocalVideoJobQueue;
  workspaceVideoJobQueues: Map<string, LocalVideoJobQueue>;
  settingsStore: FileConsoleSettingsStore;
  fetchImpl?: typeof fetch;
  runMakeVideoPipeline?: typeof runMakeVideoPipeline;
}): Promise<ConsoleRequestContext> {
  const resolved = await input.authStore.resolveCurrentWorkspace(input.request);
  const workspacePaths = getWorkspacePaths(input.dataDir, resolved.workspaceId);
  const providerKeyStore = createProviderKeyStore({
    databaseHandle: input.databaseHandle,
    workspaceId: resolved.workspaceId,
    legacyFilePath: workspacePaths.providerKeysFile
  });
  return {
    workspaceId: resolved.workspaceId,
    databaseHandle: input.databaseHandle,
    workspacePaths,
    fixturesDir: workspacePaths.productsDir,
    outputsDir: workspacePaths.jobsDir,
    providerKeyStore,
    videoJobQueue: videoJobQueueForWorkspace({
      workspaceId: resolved.workspaceId,
      workspacePaths,
      providerKeyStore,
      defaultVideoJobQueue: input.defaultVideoJobQueue,
      workspaceVideoJobQueues: input.workspaceVideoJobQueues,
      rootDir: input.rootDir,
      settingsStore: input.settingsStore,
      fetchImpl: input.fetchImpl,
      runMakeVideoPipeline: input.runMakeVideoPipeline,
      databaseHandle: input.databaseHandle
    })
  };
}

function videoJobQueueForWorkspace(input: {
  workspaceId: string;
  workspacePaths: ReturnType<typeof getWorkspacePaths>;
  providerKeyStore: ProviderKeyStore;
  defaultVideoJobQueue: LocalVideoJobQueue;
  workspaceVideoJobQueues: Map<string, LocalVideoJobQueue>;
  rootDir: string;
  settingsStore: FileConsoleSettingsStore;
  fetchImpl?: typeof fetch;
  runMakeVideoPipeline?: typeof runMakeVideoPipeline;
  databaseHandle: DatabaseHandle;
}): LocalVideoJobQueue {
  if (input.workspaceId === DEFAULT_WORKSPACE_ID) {
    return input.defaultVideoJobQueue;
  }
  const existing = input.workspaceVideoJobQueues.get(input.workspaceId);
  if (existing) {
    return existing;
  }
  const queue = new LocalVideoJobQueue({
    rootDir: input.rootDir,
    outputsDir: input.workspacePaths.jobsDir,
    workspaceId: input.workspaceId,
    settingsStore: input.settingsStore,
    fetchImpl: input.fetchImpl,
    runMakeVideoPipeline: createConfiguredMakeVideoPipeline({
      providerKeyStore: input.providerKeyStore,
      runMakeVideoPipeline: input.runMakeVideoPipeline
    }),
    databaseHandle: input.databaseHandle
  });
  input.workspaceVideoJobQueues.set(input.workspaceId, queue);
  return queue;
}

function createConfiguredMakeVideoPipeline(input: {
  providerKeyStore: ProviderKeyStore;
  runMakeVideoPipeline?: typeof runMakeVideoPipeline;
}): LocalVideoJobQueueOptions["runMakeVideoPipeline"] {
  return async (pipelineInput) => {
    const config = await selectedVideoProviderConfig(input.providerKeyStore, pipelineInput.providerName);
    const runPipeline = input.runMakeVideoPipeline ?? runMakeVideoPipeline;
    return runPipeline({
      ...pipelineInput,
      apiKey: config.apiKey,
      providerBaseUrl: config.baseUrl,
      providerModel: pipelineInput.providerModel ?? config.model
    });
  };
}

function createProviderKeyStore(input: {
  databaseHandle: DatabaseHandle;
  workspaceId: string;
  legacyFilePath: string;
}): ProviderKeyStore {
  const store = new SqliteProviderKeyStore({
    handle: input.databaseHandle,
    secretKey: resolveDatabaseSecretKey(process.env),
    workspaceId: input.workspaceId,
    legacyFilePath: input.legacyFilePath
  });
  store.migrateLegacyFile();
  return store;
}

async function buildWorkspaceJobLedger(
  context: ConsoleRequestContext,
  options: Parameters<typeof buildJobLedger>[1] = {}
) {
  return buildJobLedger(context.outputsDir, options);
}

async function runConsoleMakeVideo(
  body: MakeVideoRequest,
  options: {
    rootDir: string;
    outputsDir: string;
    settingsStore: FileConsoleSettingsStore;
    providerKeyStore: ProviderKeyStore;
    fetchImpl?: typeof fetch;
  }
): Promise<MakeVideoReport> {
  const productPath = resolveWithin(options.rootDir, body.productPath);
  const outDirName = sanitizePathSegment(body.outDirName ?? `console-${Date.now()}`);
  const settings = await options.settingsStore.read();
  await assertTemplateEnabled(body, options.settingsStore);
  await assertWithinVideoBudget(body, options.settingsStore);
  await assertWithinTestCredit(body, {
    outputsDir: options.outputsDir,
    settingsStore: options.settingsStore
  });
  const providerName = body.provider ?? settings.defaultProvider;
  await assertPaidProductReady({
    provider: providerName,
    productPath,
    rootDir: options.rootDir
  });
  await mkdir(options.outputsDir, { recursive: true });
  const providerConfig = await selectedVideoProviderConfig(options.providerKeyStore, providerName);
  return runMakeVideoPipeline({
    productPath,
    outDir: join(options.outputsDir, outDirName),
    providerName,
    durationSeconds: body.duration ?? settings.defaultDurationSeconds,
    template: body.template ?? settings.defaultTemplate,
    finalLanguage: normalizeFinalVideoLanguage(body.finalLanguage ?? settings.defaultLanguage),
    cta: body.cta ?? settings.defaultCta,
    scriptLines: sanitizeLines(body.scriptLines),
    storyboardLines: sanitizeLines(body.storyboardLines),
    confirmPaid: body.confirmPaid ?? providerName !== "mock",
    reuseManifestPath: body.reuseManifest ? resolveWithin(options.rootDir, body.reuseManifest) : undefined,
    apiKey: providerConfig.apiKey,
    providerBaseUrl: providerConfig.baseUrl,
    providerModel: body.providerModel ?? providerConfig.model,
    fetchImpl: options.fetchImpl
  });
}

async function listVideoTemplates(settingsStore: FileConsoleSettingsStore) {
  const settings = await settingsStore.read();
  return buildTemplateCatalogState({
    enabledTemplates: settings.enabledTemplates,
    defaultTemplate: settings.defaultTemplate
  });
}

async function saveVideoTemplates(
  settingsStore: FileConsoleSettingsStore,
  input: TemplateManagementRequest
) {
  const enabledTemplates = normalizeEnabledTemplates(input.enabledTemplates);
  const requestedDefault = isScriptTemplate(input.defaultTemplate) ? input.defaultTemplate : undefined;
  const defaultTemplate = requestedDefault && enabledTemplates.includes(requestedDefault)
    ? requestedDefault
    : enabledTemplates[0];
  const settings = await settingsStore.write({
    enabledTemplates,
    defaultTemplate
  });
  return buildTemplateCatalogState({
    enabledTemplates: settings.enabledTemplates,
    defaultTemplate: settings.defaultTemplate
  });
}

async function assertTemplateEnabled(
  body: Pick<MakeVideoRequest, "template">,
  settingsStore: FileConsoleSettingsStore
): Promise<void> {
  const settings = await settingsStore.read();
  const template = body.template ?? settings.defaultTemplate;
  if (!settings.enabledTemplates.includes(template)) {
    throw new Error(`Template ${template} is disabled. Enable it in template management before using it.`);
  }
}

async function enqueueBatchVideoJobs(
  body: BatchVideoJobRequest,
  options: {
    rootDir: string;
    outputsDir: string;
    fixturesDir: string;
    settingsStore: FileConsoleSettingsStore;
    videoJobQueue: LocalVideoJobQueue;
  }
) {
  const productPath = resolveWithin(options.rootDir, body.productPath);
  const versions = clampInteger(body.versions ?? 1, 1, 5);
  const settings = await options.settingsStore.read();
  await assertTemplateEnabled(body, options.settingsStore);
  await assertWithinVideoBudget(body, options.settingsStore);
  await assertWithinBatchTestCredit(body, versions, {
    outputsDir: options.outputsDir,
    settingsStore: options.settingsStore
  });
  const providerName = body.provider ?? settings.defaultProvider;
  await assertPaidProductReady({
    provider: providerName,
    productPath,
    rootDir: options.rootDir
  });
  const jobs = [];
  for (let index = 1; index <= versions; index += 1) {
    jobs.push(await options.videoJobQueue.enqueue({
      productPath,
      outDirName: body.outDirName
        ? `${sanitizePathSegment(body.outDirName)}-v${index}`
        : undefined,
      provider: body.provider,
      providerModel: body.providerModel,
      duration: body.duration,
      template: body.template,
      finalLanguage: normalizeFinalVideoLanguage(body.finalLanguage ?? settings.defaultLanguage),
      cta: body.cta,
      scriptLines: sanitizeLines(body.scriptLines),
      storyboardLines: sanitizeLines(body.storyboardLines),
      confirmPaid: body.confirmPaid ?? providerName !== "mock",
      reuseManifest: body.reuseManifest ? resolveWithin(options.rootDir, body.reuseManifest) : undefined
    }));
  }
  return jobs;
}

async function enqueueProductVideoJobsBySku(
  body: ProductVideoJobRequest,
  options: {
    sku: string;
    rootDir: string;
    outputsDir: string;
    fixturesDir: string;
    settingsStore: FileConsoleSettingsStore;
    videoJobQueue: LocalVideoJobQueue;
  }
) {
  const productPath = await findProductFileBySku(options.fixturesDir, options.sku);
  return enqueueBatchVideoJobs({
    ...body,
    productPath
  }, options);
}

async function assertRetryVideoJobAllowed(input: {
  jobId: string;
  confirmPaid?: boolean;
  videoJobQueue: LocalVideoJobQueue;
  settingsStore: FileConsoleSettingsStore;
  outputsDir: string;
}): Promise<void> {
  const record = await input.videoJobQueue.get(input.jobId);
  if (record.provider && record.provider !== "mock" && input.confirmPaid !== true) {
    throw new Error("Retrying a paid video job requires confirmPaid: true.");
  }
  const body: MakeVideoRequest = {
    productPath: record.productPath,
    provider: record.provider,
    duration: record.durationSeconds,
    template: record.template,
    cta: record.cta,
    scriptLines: sanitizeLines(record.scriptLines),
    storyboardLines: sanitizeLines(record.storyboardLines),
    confirmPaid: input.confirmPaid === true,
    reuseManifest: record.reuseManifest
  };
  await assertWithinVideoBudget(body, input.settingsStore);
  await assertWithinTestCredit(body, {
    outputsDir: input.outputsDir,
    settingsStore: input.settingsStore
  });
}

async function assertWithinVideoBudget(
  body: MakeVideoRequest,
  settingsStore: FileConsoleSettingsStore
): Promise<void> {
  const settings = await settingsStore.read();
  const provider = body.provider ?? settings.defaultProvider;
  if (provider === "mock") {
    return;
  }
  const durationSeconds = body.duration ?? settings.defaultDurationSeconds;
  const tokenPriceCnyPerMillion = Number(process.env.SEEDANCE_TOKEN_PRICE_CNY_PER_MILLION ?? 37);
  const estimatedTokens = estimateVideoTokens(durationSeconds);
  const estimatedCostCny = estimateCny(estimatedTokens.expected, tokenPriceCnyPerMillion);
  if (estimatedCostCny > settings.maxEstimatedCostCnyPerVideo) {
    throw new Error(
      `Estimated video cost ¥${estimatedCostCny.toFixed(2)} exceeds budget cap ¥${settings.maxEstimatedCostCnyPerVideo.toFixed(2)}. Raise maxEstimatedCostCnyPerVideo after preflight if you want to proceed.`
    );
  }
}

async function assertWithinTestCredit(
  body: MakeVideoRequest,
  options: {
    outputsDir: string;
    settingsStore: FileConsoleSettingsStore;
  }
): Promise<void> {
  const settings = await options.settingsStore.read();
  const provider = body.provider ?? settings.defaultProvider;
  if (provider === "mock" || settings.testCreditBalanceCny <= 0) {
    return;
  }
  const estimatedCostCny = estimateVideoCostCny(body.duration ?? settings.defaultDurationSeconds);
  const credit = await summarizeTestCredit(options.outputsDir, {
    testCreditBalanceCny: settings.testCreditBalanceCny,
    estimatedCostCny
  });
  if (!credit.enoughCredit) {
    throw new Error(
      `Estimated video cost ¥${estimatedCostCny.toFixed(2)} exceeds remaining test credit: available ¥${credit.availableEstimatedCostCny.toFixed(2)} (balance ¥${credit.testCreditBalanceCny.toFixed(2)}, used ¥${credit.usedEstimatedCostCny.toFixed(2)}).`
    );
  }
}

async function assertWithinBatchTestCredit(
  body: MakeVideoRequest,
  versions: number,
  options: {
    outputsDir: string;
    settingsStore: FileConsoleSettingsStore;
  }
): Promise<void> {
  const settings = await options.settingsStore.read();
  const provider = body.provider ?? settings.defaultProvider;
  if (provider === "mock" || settings.testCreditBalanceCny <= 0) {
    return;
  }
  const singleEstimatedCostCny = estimateVideoCostCny(body.duration ?? settings.defaultDurationSeconds);
  const combinedEstimatedCostCny = Math.round(singleEstimatedCostCny * versions * 100) / 100;
  const credit = await summarizeTestCredit(options.outputsDir, {
    testCreditBalanceCny: settings.testCreditBalanceCny,
    estimatedCostCny: combinedEstimatedCostCny
  });
  if (!credit.enoughCredit) {
    throw new Error(
      `Estimated batch cost for ${versions} video versions has combined estimated cost ¥${combinedEstimatedCostCny.toFixed(2)}, which exceeds remaining test credit: available ¥${credit.availableEstimatedCostCny.toFixed(2)} (balance ¥${credit.testCreditBalanceCny.toFixed(2)}, used ¥${credit.usedEstimatedCostCny.toFixed(2)}).`
    );
  }
}

async function assertPaidProductReady(input: {
  provider: VideoProviderName | undefined;
  productPath: string;
  rootDir: string;
}): Promise<void> {
  if (!input.provider || input.provider === "mock") {
    return;
  }
  const product = parseProductFacts(JSON.parse(await readFile(input.productPath, "utf8")));
  const referenceImages = await describeReferenceImages(product.reference_images, {
    productFilePath: input.productPath,
    rootDir: input.rootDir
  });
  const readiness = buildPaidGenerationReadiness(product, summarizeReferenceImages(referenceImages));
  if (!readiness.readyForPaidGeneration) {
    throw new Error(`付费生成前请先补齐商品资料: ${readiness.blockingReasons.join("、")}。`);
  }
}

async function runConsolePreflight(
  body: PreflightRequest,
  options: {
    rootDir: string;
    outputsDir: string;
    settingsStore: FileConsoleSettingsStore;
  }
) {
  const productPath = resolveWithin(options.rootDir, body.productPath);
  const rawProduct = JSON.parse(await readFile(productPath, "utf8")) as unknown;
  const product = parseProductFacts(rawProduct);
  const settings = await options.settingsStore.read();
  const durationSeconds = body.duration ?? settings.defaultDurationSeconds;
  const template = body.template ?? settings.defaultTemplate;
  await assertTemplateEnabled({ template }, options.settingsStore);
  const provider = body.provider ?? settings.defaultProvider;
  const cta = body.cta ?? settings.defaultCta;
  const finalLanguage = normalizeFinalVideoLanguage(body.finalLanguage ?? settings.defaultLanguage);
  const referenceImages = await describeReferenceImages(product.reference_images, {
    productFilePath: productPath,
    rootDir: options.rootDir
  });
  const productWithResolvedImages = {
    ...product,
    reference_images: resolveReferenceImages(product.reference_images, {
      productFilePath: productPath
    })
  };
  const script = generateJapaneseAdScript(product, {
    cta,
    template,
    scriptLines: sanitizeLines(body.scriptLines),
    finalLanguage
  });
  const prompt = generateVideoPrompt(productWithResolvedImages, {
    durationSeconds,
    aspectRatio: "9:16",
    template,
    storyboardLines: sanitizeLines(body.storyboardLines),
    finalLanguage
  });
  const paidProvider = provider !== "mock";
  const estimatedTokens = estimateVideoTokens(durationSeconds);
  const tokenPriceCnyPerMillion = Number(process.env.SEEDANCE_TOKEN_PRICE_CNY_PER_MILLION ?? 37);
  const assetSummary = summarizeReferenceImages(referenceImages);
  const readiness = buildPaidGenerationReadiness(product, assetSummary);
  const estimatedCostCny = {
    low: estimateCny(estimatedTokens.low, tokenPriceCnyPerMillion),
    expected: estimateCny(estimatedTokens.expected, tokenPriceCnyPerMillion),
    high: estimateCny(estimatedTokens.high, tokenPriceCnyPerMillion)
  };
  return {
    productSku: product.sku,
    title_ja: product.title_ja,
    provider,
    durationSeconds,
    aspectRatio: "9:16",
    template,
    cta,
    paidProvider,
    requiresPaidConfirmation: paidProvider,
    referenceImages,
    assetSummary,
    script,
    prompt,
    estimatedTokens,
    tokenPriceCnyPerMillion,
    estimatedCostCny,
    credit: await summarizeTestCredit(options.outputsDir, {
      testCreditBalanceCny: settings.testCreditBalanceCny,
      estimatedCostCny: estimatedCostCny.expected
    }),
    readiness,
    warnings: buildPreflightWarnings(assetSummary)
  };
}

async function getProviderTask(
  taskId: string,
  options: {
    providerKeyStore: ProviderKeyStore;
    fetchImpl?: typeof fetch;
  }
) {
  const config = await selectedVideoProviderConfig(options.providerKeyStore, "volcengine-seedance");
  return new VolcengineUsageClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    fetchImpl: options.fetchImpl
  }).getTask(taskId);
}

async function listProviderTasks(
  url: URL,
  options: {
    providerKeyStore: ProviderKeyStore;
    fetchImpl?: typeof fetch;
  }
) {
  const config = await selectedVideoProviderConfig(options.providerKeyStore, "volcengine-seedance");
  return new VolcengineUsageClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    fetchImpl: options.fetchImpl
  }).listTasks(providerUsageListRequestFromUrl(url));
}

function providerUsageListRequestFromUrl(url: URL): ListUsageTasksRequest {
  return {
    pageNum: positiveIntegerFromQuery(url, "pageNum", 1, 1, 1000),
    pageSize: positiveIntegerFromQuery(url, "pageSize", 20, 1, 100),
    status: providerTaskStatusFromQuery(url),
    taskIds: taskIdsFromQuery(url),
    model: queryValue(url, "model"),
    serviceTier: providerServiceTierFromQuery(url)
  };
}

async function buildProviderConfig(providerKeyStore: ProviderKeyStore): Promise<ProviderConfigLedger> {
  const textStoredConfigs = await providerKeyStore.listConfigs("openai-compatible-text");
  const imageStoredConfigs = await providerKeyStore.listConfigs("openai-compatible-image");
  const videoStoredConfigs = await providerKeyStore.listConfigs("volcengine-seedance");
  const videoModels = buildVideoModelConfigs(videoStoredConfigs);
  return {
    textModels: buildTextModelConfigs(textStoredConfigs),
    imageModels: buildImageModelConfigs(imageStoredConfigs),
    videoModels,
    providers: videoModels
  };
}

async function testProviderConfig(
  provider: ApiProviderId,
  options: {
    providerKeyStore: ProviderKeyStore;
    fetchImpl?: typeof fetch;
    input: ProviderConfigTestRequest;
  }
): Promise<{
  ok: true;
  provider: ApiProviderId;
  model: string;
  message: string;
}> {
  const config = await effectiveProviderConfigForTest(provider, options.providerKeyStore, options.input);
  if (!config.apiKey) {
    throw new Error("请先填写 API Key，或保存一个带 Key 的配置后再测试。");
  }
  const fetchImpl = withProviderConfigTestTimeout(options.fetchImpl);
  if (provider === "openai-compatible-text") {
    await new OpenAiCompatibleTextProvider({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      fetchImpl
    }).generateJson<{ ok: boolean }>({
      system: "Return only compact JSON.",
      user: "Return {\"ok\":true}.",
      temperature: 0
    });
    return {
      ok: true,
      provider,
      model: config.model ?? textModelName(),
      message: "文本模型连通性测试成功。"
    };
  }
  if (provider === "openai-compatible-image") {
    await new OpenAiCompatibleImageProvider({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      fetchImpl
    }).generateImages({
      prompt: "A small plain white square product test image, no text.",
      count: 1
    });
    return {
      ok: true,
      provider,
      model: config.model ?? imageModelName(),
      message: "图片模型连通性测试成功。"
    };
  }
  await new VolcengineUsageClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    fetchImpl
  }).listTasks({
    pageSize: 1,
    model: config.model
  });
  return {
    ok: true,
    provider,
    model: config.model ?? process.env.SEEDANCE_MODEL ?? "doubao-seedance-2-0-260128",
    message: "视频模型只读连通性测试成功，未创建视频任务。"
  };
}

function withProviderConfigTestTimeout(fetchImpl: typeof fetch | undefined): typeof fetch {
  const sourceFetch = fetchImpl ?? fetch;
  const timeoutMs = numberFromEnv(process.env.PROVIDER_CONFIG_TEST_TIMEOUT_MS, 20_000);
  return (async (input, init) => {
    return Promise.race([
      sourceFetch(input, init),
      new Promise<Response>((_, reject) => {
        setTimeout(() => reject(new Error("模型测试超时，请检查 Base URL、网络或服务商状态。")), timeoutMs);
      })
    ]);
  }) as typeof fetch;
}

async function effectiveProviderConfigForTest(
  provider: ApiProviderId,
  providerKeyStore: ProviderKeyStore,
  input: ProviderConfigTestRequest
): Promise<ProviderStoredConfig> {
  const saved = normalizeText(input.configId) ? await providerKeyStore.getConfig(provider) : {};
  return {
    apiKey: normalizeText(input.apiKey) ?? saved.apiKey,
    baseUrl: normalizeText(input.baseUrl) ?? saved.baseUrl,
    model: normalizeText(input.model) ?? saved.model
  };
}

function buildTextModelConfigs(configs: ProviderStoredConfig[]): ProviderConfigItem[] {
  if (configs.length === 0) {
    const keyStatus = providerKeyStatus("openai-compatible-text");
    return [{
      id: "openai-compatible-text",
      configId: "openai-compatible-text",
      label: "文本模型",
      providerLabel: "OpenAI 兼容",
      configured: keyStatus.configured,
      keySource: keyStatus.keySource,
      keyPreview: keyStatus.keyPreview,
      baseUrl: textModelBaseUrl(),
      model: textModelName(),
      priority: 0,
      capabilities: ["商品整理", "脚本分镜"],
      modelKind: "text"
    }];
  }
  return configs.map((config) => {
    const keyStatus = providerKeyStatus("openai-compatible-text", {
      localKey: config.apiKey,
      configId: config.configId
    });
    return {
      id: "openai-compatible-text",
      configId: config.configId,
      label: config.name ?? "文本模型",
      providerLabel: config.vendor ?? "OpenAI 兼容",
      configured: keyStatus.configured,
      keySource: keyStatus.keySource,
      keyPreview: keyStatus.keyPreview,
      baseUrl: config.baseUrl ?? textModelBaseUrl(),
      model: config.model ?? textModelName(),
      priority: config.priority ?? 0,
      capabilities: ["商品整理", "脚本分镜"],
      modelKind: "text" as const
    };
  });
}

function buildImageModelConfigs(configs: ProviderStoredConfig[]): ProviderConfigItem[] {
  if (configs.length === 0) {
    const keyStatus = providerKeyStatus("openai-compatible-image");
    return [{
      id: "openai-compatible-image",
      configId: "openai-compatible-image",
      label: "图片模型",
      providerLabel: "OpenAI 兼容",
      configured: keyStatus.configured,
      keySource: keyStatus.keySource,
      keyPreview: keyStatus.keyPreview,
      baseUrl: imageModelBaseUrl(),
      model: imageModelName(),
      priority: 0,
      capabilities: ["商品图生成", "素材图生成"],
      modelKind: "image"
    }];
  }
  return configs.map((config) => {
    const keyStatus = providerKeyStatus("openai-compatible-image", {
      localKey: config.apiKey,
      configId: config.configId
    });
    return {
      id: "openai-compatible-image",
      configId: config.configId,
      label: config.name ?? "图片模型",
      providerLabel: config.vendor ?? "OpenAI 兼容",
      configured: keyStatus.configured,
      keySource: keyStatus.keySource,
      keyPreview: keyStatus.keyPreview,
      baseUrl: config.baseUrl ?? imageModelBaseUrl(),
      model: config.model ?? imageModelName(),
      priority: config.priority ?? 0,
      capabilities: ["商品图生成", "素材图生成"],
      modelKind: "image" as const
    };
  });
}

function buildVideoModelConfigs(configs: ProviderStoredConfig[]): VideoProviderConfigItem[] {
  const effectiveConfigs = configs.length > 0 ? configs : [{}];
  return effectiveConfigs.map((config) => {
    const keyStatus = providerKeyStatus("volcengine-seedance", {
      localKey: config.apiKey,
      configId: config.configId
    });
    return {
      id: "volcengine-seedance",
      configId: config.configId ?? "volcengine-seedance",
      label: config.name ?? "视频模型",
      providerLabel: config.vendor ?? "火山引擎 Seedance",
      configured: keyStatus.configured,
      keySource: keyStatus.keySource,
      keyPreview: keyStatus.keyPreview,
      baseUrl: config.baseUrl ?? process.env.SEEDANCE_BASE_URL ?? "https://ark.cn-beijing.volces.com",
      model: config.model ?? process.env.SEEDANCE_MODEL ?? "doubao-seedance-2-0-260128",
      priority: config.priority ?? 0,
      capabilities: ["视频生成"],
      modelKind: "video" as const,
      resolution: seedanceResolutionFromEnv(process.env.SEEDANCE_RESOLUTION),
      tokenPriceCnyPerMillion: numberFromEnv(process.env.SEEDANCE_TOKEN_PRICE_CNY_PER_MILLION, 37),
      estimatedCostCnyPerSecond: numberFromEnv(process.env.SEEDANCE_ESTIMATED_COST_CNY_PER_SECOND, 0.8),
      watermark: booleanFromEnv(process.env.SEEDANCE_WATERMARK ?? "false"),
      docsUrl: "https://www.volcengine.com/docs/82379/1541595?lang=zh"
    };
  });
}

function seedanceResolutionFromEnv(value: string | undefined): "480p" | "720p" | "1080p" {
  if (value === "720p" || value === "1080p") {
    return value;
  }
  return "480p";
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanFromEnv(value: string): boolean {
  return ["1", "true", "yes"].includes(value.toLowerCase());
}

function normalizeText(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function parseApiProviderId(value: string): ApiProviderId {
  if (value === "openai-compatible-text" || value === "openai-compatible-image") {
    return value;
  }
  if (value === "volcengine-seedance" || value === "seedance") {
    return "volcengine-seedance";
  }
  throw new Error(`Unknown provider key target: ${value}`);
}

function positiveIntegerFromQuery(
  url: URL,
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  const value = Number(url.searchParams.get(name));
  if (!Number.isInteger(value) || value < min || value > max) {
    return fallback;
  }
  return value;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isInteger(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

async function selectedVideoProviderConfig(
  providerKeyStore: ProviderKeyStore,
  provider: VideoProviderName
): Promise<{
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}> {
  const config = await providerKeyStore.getConfig(provider);
  return {
    apiKey: resolveProviderApiKey({
      provider,
      localKey: config.apiKey
    }),
    baseUrl: config.baseUrl,
    model: config.model
  };
}

function extensionFromMimeType(mimeType: string): ".jpg" | ".png" | ".webp" {
  if (mimeType === "image/jpeg") {
    return ".jpg";
  }
  if (mimeType === "image/webp") {
    return ".webp";
  }
  return ".png";
}

function providerTaskStatusFromQuery(url: URL): ListUsageTasksRequest["status"] | undefined {
  const value = queryValue(url, "status");
  return ["queued", "running", "cancelled", "succeeded", "failed"].includes(String(value))
    ? (value as ListUsageTasksRequest["status"])
    : undefined;
}

function providerServiceTierFromQuery(url: URL): ListUsageTasksRequest["serviceTier"] | undefined {
  const value = queryValue(url, "serviceTier");
  return ["default", "flex"].includes(String(value))
    ? (value as ListUsageTasksRequest["serviceTier"])
    : undefined;
}

function taskIdsFromQuery(url: URL): string[] | undefined {
  const repeated = url.searchParams.getAll("taskId");
  const csv = url.searchParams.get("taskIds")?.split(",") ?? [];
  const taskIds = [...repeated, ...csv].map((value) => value.trim()).filter(Boolean);
  return taskIds.length > 0 ? Array.from(new Set(taskIds)) : undefined;
}

async function cancelQueuedProviderTask(
  taskId: string,
  options: {
    providerKeyStore: ProviderKeyStore;
    fetchImpl?: typeof fetch;
  }
): Promise<void> {
  const config = await selectedVideoProviderConfig(options.providerKeyStore, "volcengine-seedance");
  const client = new VolcengineUsageClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    fetchImpl: options.fetchImpl
  });
  const task = await client.getTask(taskId);
  if (task.status !== "queued") {
    throw new Error(`Can cancel only queued tasks. Task ${taskId} is ${task.status ?? "unknown"}.`);
  }
  await client.deleteTask(taskId);
}

async function createPublishPackagesBatch(input: {
  outputsDir: string;
  reviewStore: FileReviewStore;
}): Promise<{
  packages: PublishPackageManifest[];
  skipped: Array<{
    productSku: string;
    jobId?: string;
    reason: string;
  }>;
}> {
  const [reviewState, existingLedger] = await Promise.all([
    input.reviewStore.read(),
    listPublishPackages(input.outputsDir)
  ]);
  const existingKeys = new Set(existingLedger.packages.map((item) => `${item.productSku}\n${item.jobId}`));
  const packages: PublishPackageManifest[] = [];
  const skipped: Array<{
    productSku: string;
    jobId?: string;
    reason: string;
  }> = [];

  for (const [productSku, review] of Object.entries(reviewState.products).sort(([left], [right]) => left.localeCompare(right))) {
    const jobId = review.selectedFinalJobId;
    if (!jobId) {
      skipped.push({
        productSku,
        reason: "未选择最终版"
      });
      continue;
    }
    const key = `${productSku}\n${jobId}`;
    if (existingKeys.has(key)) {
      skipped.push({
        productSku,
        jobId,
        reason: "发布素材已存在"
      });
      continue;
    }
    if (review.versionReviews?.[jobId]?.decision !== "publishable") {
      skipped.push({
        productSku,
        jobId,
        reason: "最终版未标记为可发布"
      });
      continue;
    }
    const created = await createPublishPackage({
      outputsDir: input.outputsDir,
      productSku,
      jobId,
      reviewState
    });
    existingKeys.add(key);
    packages.push(created);
  }

  return { packages, skipped };
}

async function assertSelectableFinalJob(
  input: SelectFinalInput,
  outputsDir: string,
  reviewStore: FileReviewStore
): Promise<void> {
  const ledger = await buildJobLedger(outputsDir, {
    reviewState: await reviewStore.read()
  });
  const product = ledger.products.find((group) => group.productSku === input.productSku);
  const job = product?.jobs.find((item) => item.id === input.jobId);
  if (!job?.hasFinalVideo) {
    throw new Error("Selected final job must belong to the product and include a final video.");
  }
}

function assertManualReviewInput(input: ManualReviewInput): void {
  if (
    typeof input?.productSku !== "string" ||
    input.productSku.trim().length === 0 ||
    typeof input.jobId !== "string" ||
    input.jobId.trim().length === 0 ||
    !isManualReviewDecision(input.decision) ||
    !Number.isInteger(input.score) ||
    input.score < 1 ||
    input.score > 5
  ) {
    throw new Error("Manual review requires productSku, jobId, decision, and score 1-5.");
  }
}

async function assertReviewableJob(
  input: Pick<ManualReviewInput, "productSku" | "jobId">,
  outputsDir: string,
  reviewStore: FileReviewStore
): Promise<void> {
  const ledger = await buildJobLedger(outputsDir, {
    reviewState: await reviewStore.read()
  });
  const product = ledger.products.find((group) => group.productSku === input.productSku);
  const job = product?.jobs.find((item) => item.id === input.jobId);
  if (!job) {
    throw new Error("Manual review job must belong to the product.");
  }
}

async function buildInternalValidationCsv(input: {
  rootDir: string;
  fixturesDir: string;
  outputsDir: string;
  reviewStore: FileReviewStore;
}): Promise<string> {
  const [products, reviewState] = await Promise.all([
    listProducts(input.fixturesDir, input.rootDir),
    input.reviewStore.read()
  ]);
  const ledger = await buildJobLedger(input.outputsDir, {
    reviewState
  });
  const groupsBySku = new Map(ledger.products.map((group) => [group.productSku, group]));
  const rows = [
    [
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
    ],
    ...products.flatMap((product) => {
      const group = groupsBySku.get(product.sku);
      const productRows = group?.jobs.length
        ? group.jobs.map((job) => [
            product.sku,
            product.title_ja,
            String(product.referenceImageCount),
            String(group.jobCount),
            job.id,
            providerDisplayName(job.provider),
            statusDisplayName(job.status),
            job.durationSeconds === undefined ? "" : String(job.durationSeconds),
            manualReviewDisplayName(job.manualReview?.decision),
            job.manualReview?.score === undefined ? "" : String(job.manualReview.score),
            job.manualReview?.note ?? "",
            String(job.totalTokens),
            String(job.estimatedCostCny),
            job.hasFinalVideo ? "是" : "否",
            internalValidationGapText({
              referenceImageCount: product.referenceImageCount,
              versionCount: group.jobCount,
              reviewedCount: group.reviewedJobs
            })
          ])
        : [
            [
              product.sku,
              product.title_ja,
              String(product.referenceImageCount),
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
              internalValidationGapText({
                referenceImageCount: product.referenceImageCount,
                versionCount: 0,
                reviewedCount: 0
              })
            ]
          ];
      return productRows;
    })
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

async function buildPublishPackagesCsv(outputsDir: string): Promise<string> {
  const ledger = await withPublishPackageFileUrls(await listPublishPackages(outputsDir));
  const rows = [
    [
      "商品SKU",
      "任务ID",
      "生成通道",
      "Task ID",
      "时长秒",
      "Token",
      "估算成本CNY",
      "视频地址",
      "字幕地址",
      "成品Manifest",
      "发布清单",
      "人工备注",
      "创建时间"
    ],
    ...ledger.packages.map((item) => [
      item.productSku,
      item.jobId,
      providerDisplayName(item.provider),
      item.taskId ?? "",
      item.durationSeconds === undefined ? "" : String(item.durationSeconds),
      String(item.totalTokens),
      String(item.estimatedCostCny),
      item.fileUrls.videoUrl,
      item.fileUrls.subtitleUrl ?? "",
      item.fileUrls.finalManifestUrl ?? "",
      item.fileUrls.manifestUrl,
      item.selectedFinalNote ?? "",
      item.createdAt
    ])
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

async function topUpInternalValidationJobs(input: {
  rootDir: string;
  fixturesDir: string;
  outputsDir: string;
  videoJobQueue: LocalVideoJobQueue;
}): Promise<{
  jobs: Array<Awaited<ReturnType<LocalVideoJobQueue["enqueue"]>>>;
  skipped: Array<{
    productSku: string;
    reason: string;
    referenceImageCount: number;
    existingVersions: number;
    missingVersions: number;
  }>;
}> {
  const [products, ledger] = await Promise.all([
    listProducts(input.fixturesDir, input.rootDir),
    buildJobLedger(input.outputsDir)
  ]);
  const groupsBySku = new Map(ledger.products.map((group) => [group.productSku, group]));
  const jobs: Array<Awaited<ReturnType<LocalVideoJobQueue["enqueue"]>>> = [];
  const skipped: Array<{
    productSku: string;
    reason: string;
    referenceImageCount: number;
    existingVersions: number;
    missingVersions: number;
  }> = [];

  for (const product of products) {
    const existingVersions = groupsBySku.get(product.sku)?.jobCount ?? 0;
    const missingVersions = Math.max(0, 3 - existingVersions);
    if (missingVersions === 0) {
      skipped.push({
        productSku: product.sku,
        reason: "已有 3 个视频版本",
        referenceImageCount: product.referenceImageCount,
        existingVersions,
        missingVersions
      });
      continue;
    }
    if (product.referenceImageCount < 3) {
      skipped.push({
        productSku: product.sku,
        reason: "参考图不足 3 张",
        referenceImageCount: product.referenceImageCount,
        existingVersions,
        missingVersions
      });
      continue;
    }
    for (let index = existingVersions + 1; index <= 3; index += 1) {
      jobs.push(await input.videoJobQueue.enqueue({
        productPath: product.path,
        outDirName: `${sanitizePathSegment(product.sku)}-v${index}`,
        provider: "mock",
        duration: 8,
        template: "scene",
        finalLanguage: "ja",
        cta: "今すぐチェック",
        confirmPaid: false
      }));
    }
  }

  return { jobs, skipped };
}

function internalValidationGapText(input: {
  referenceImageCount: number;
  versionCount: number;
  reviewedCount: number;
}): string {
  const gaps = [];
  const missingReferenceImages = Math.max(0, 3 - input.referenceImageCount);
  const missingVersions = Math.max(0, 3 - input.versionCount);
  const missingReviews = Math.max(0, input.versionCount - input.reviewedCount);
  if (missingReferenceImages > 0) gaps.push(`补 ${missingReferenceImages} 张参考图`);
  if (missingVersions > 0) gaps.push(`补 ${missingVersions} 个版本`);
  if (missingReviews > 0) gaps.push(`审 ${missingReviews} 个版本`);
  return gaps.join(" / ") || "达标";
}

function providerDisplayName(value?: string): string {
  if (value === "mock") return "本地模拟";
  if (value === "volcengine-seedance" || value === "seedance") return "火山引擎 Seedance";
  return value ?? "";
}

function statusDisplayName(value?: string): string {
  if (value === "queued") return "排队中";
  if (value === "running") return "生成中";
  if (value === "completed" || value === "succeeded") return "已完成";
  if (value === "failed") return "失败";
  if (value === "canceled" || value === "cancelled") return "已取消";
  return value ?? "";
}

function manualReviewDisplayName(value?: string): string {
  if (value === "publishable") return "可发布";
  if (value === "needs-edit") return "需微调";
  if (value === "rejected") return "淘汰";
  return "";
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

async function listProducts(
  fixturesDir: string,
  rootDir: string,
  options: {
    databaseHandle?: DatabaseHandle;
    workspaceId?: string;
  } = {}
): Promise<
  Array<{
    path: string;
    sku: string;
    title_ja: string;
    referenceImageCount: number;
    importQuality: ProductListQuality;
    paidReadiness: ReturnType<typeof buildPaidGenerationReadiness>;
  }>
> {
  const files = options.databaseHandle
    ? listProductFilesFromDatabase(options.databaseHandle, options.workspaceId ?? DEFAULT_WORKSPACE_ID)
    : await listProductFiles(fixturesDir);
  const products = new Map<string, {
    path: string;
    sku: string;
    title_ja: string;
    referenceImageCount: number;
    importQuality: ProductListQuality;
    paidReadiness: ReturnType<typeof buildPaidGenerationReadiness>;
  }>();
  for (const file of files) {
    const product = await readProductFactsForList(file, options.databaseHandle);
    const referenceImageStatuses = product.fileAvailable
      ? await describeReferenceImages(product.reference_images, {
        productFilePath: file,
        rootDir
      })
      : [];
    const assetSummary = summarizeReferenceImages(referenceImageStatuses);
    const summary = {
      path: file,
      sku: product.sku,
      title_ja: product.title_ja,
      referenceImageCount: product.reference_images.length,
      importQuality: product.fileAvailable
        ? summarizeProductListQuality(product)
        : {
          ready: false,
          score: 0,
          summary: "商品文件缺失",
          missingFields: ["商品文件"],
          verifiedFacts: [],
          warnings: ["SQLite 索引存在，但 product.json 缺失"]
        },
      paidReadiness: product.fileAvailable
        ? buildPaidGenerationReadiness(product, assetSummary)
        : missingProductFileReadiness()
    };
    const existing = products.get(product.sku);
    if (!existing || productSummaryRank(summary) > productSummaryRank(existing)) {
      products.set(product.sku, summary);
    }
  }
  return Array.from(products.values()).sort((left, right) => left.sku.localeCompare(right.sku));
}

function productSummaryRank(product: {
  referenceImageCount: number;
  importQuality?: ProductListQuality;
  paidReadiness?: ReturnType<typeof buildPaidGenerationReadiness>;
}): number {
  return (
    product.referenceImageCount * 100 +
    (product.importQuality?.score ?? 0) +
    (product.paidReadiness?.readyForPaidGeneration ? 10 : 0)
  );
}

function listProductFilesFromDatabase(handle: DatabaseHandle, workspaceId: string): string[] {
  const rows = handle.sqlite.prepare(`
    SELECT product_json_path
    FROM products
    WHERE workspace_id = ?
    ORDER BY sku ASC
  `).all(workspaceId) as Array<{ product_json_path: string }>;
  return rows.map((row) => row.product_json_path);
}

async function readProductFactsForList(
  productFilePath: string,
  handle?: DatabaseHandle
): Promise<ReturnType<typeof parseProductFacts> & { fileAvailable: boolean }> {
  try {
    return {
      ...parseProductFacts(JSON.parse(await readFile(productFilePath, "utf8"))),
      fileAvailable: true
    };
  } catch (error) {
    if (!handle || !isMissingFileError(error)) {
      throw error;
    }
    const row = handle.sqlite.prepare(`
      SELECT sku, title
      FROM products
      WHERE product_json_path = ?
    `).get(productFilePath) as { sku: string; title: string | null } | undefined;
    if (!row) {
      throw error;
    }
    return {
      sku: row.sku,
      title_ja: row.title ?? row.sku,
      category: "商品文件缺失",
      materials: ["商品文件缺失"],
      dimensions: "商品文件缺失",
      verified_selling_points: ["商品文件缺失"],
      usage_scenes: ["商品文件缺失"],
      forbidden_claims: ["商品文件缺失"],
      reference_images: [],
      fileAvailable: false
    };
  }
}

function missingProductFileReadiness(): ReturnType<typeof buildPaidGenerationReadiness> {
  return {
    readyForPaidGeneration: false,
    blockingReasons: ["商品文件缺失"],
    warnings: ["SQLite 索引存在，但 product.json 缺失"]
  };
}

function upsertProductIndex(
  handle: DatabaseHandle,
  input: {
    workspaceId: string;
    sku: string;
    title: string;
    productJsonPath: string;
  }
): void {
  const now = new Date().toISOString();
  handle.sqlite.prepare(`
    INSERT INTO products (id, workspace_id, sku, title, product_json_path, created_at, updated_at)
    VALUES (@id, @workspaceId, @sku, @title, @productJsonPath, @now, @now)
    ON CONFLICT(workspace_id, sku) DO UPDATE SET
      title = excluded.title,
      product_json_path = excluded.product_json_path,
      updated_at = excluded.updated_at
  `).run({
    id: randomUUID(),
    workspaceId: input.workspaceId,
    sku: input.sku,
    title: input.title,
    productJsonPath: input.productJsonPath,
    now
  });
}

function productFileBySkuFromDatabase(
  handle: DatabaseHandle,
  workspaceId: string,
  sku: string
): string | undefined {
  const row = handle.sqlite.prepare(`
    SELECT product_json_path
    FROM products
    WHERE workspace_id = ? AND sku = ?
  `).get(workspaceId, sku) as { product_json_path: string } | undefined;
  return row?.product_json_path;
}

function productIdBySkuFromDatabase(
  handle: DatabaseHandle,
  workspaceId: string,
  sku: string
): string | undefined {
  const row = handle.sqlite.prepare(`
    SELECT id
    FROM products
    WHERE workspace_id = ? AND sku = ?
  `).get(workspaceId, sku) as { id: string } | undefined;
  return row?.id;
}

async function getProductBySku(input: {
  fixturesDir: string;
  rootDir: string;
  sku: string;
}): Promise<
  {
    path: string;
    referenceImageCount: number;
    importQuality: ProductListQuality;
    paidReadiness: ReturnType<typeof buildPaidGenerationReadiness>;
    reference_image_urls: Array<string | null>;
    reference_image_statuses: ProductImagePreview[];
  } & ReturnType<typeof parseProductFacts>
> {
  const files = await listProductFiles(input.fixturesDir);
  for (const file of files) {
    const product = parseProductFacts(JSON.parse(await readFile(file, "utf8")));
    if (product.sku === input.sku) {
      const referenceImageStatuses = await describeReferenceImages(product.reference_images, {
        productFilePath: file,
        rootDir: input.rootDir
      });
      const assetSummary = summarizeReferenceImages(referenceImageStatuses);
      return {
        path: file,
        ...product,
        referenceImageCount: product.reference_images.length,
        importQuality: summarizeProductListQuality(product),
        paidReadiness: buildPaidGenerationReadiness(product, assetSummary),
        reference_image_urls: referenceImageStatuses.map((item) => item.previewUrl),
        reference_image_statuses: referenceImageStatuses
      };
    }
  }
  throw new Error(`Product not found: ${input.sku}`);
}

async function saveProductFactPackage(input: {
  fixturesDir: string;
  rootDir: string;
  workspaceId?: string;
  databaseHandle?: DatabaseHandle;
  input: unknown;
}): Promise<Awaited<ReturnType<typeof getProductBySku>>> {
  const product = parseProductFacts(input.input);
  const productPath = join(input.fixturesDir, sanitizePathSegment(product.sku), "product.json");
  await mkdir(dirname(productPath), { recursive: true });
  await writeFile(productPath, JSON.stringify({
    ...product,
    workspaceId: input.workspaceId ?? DEFAULT_WORKSPACE_ID
  }, null, 2), "utf8");
  if (input.databaseHandle) {
    upsertProductIndex(input.databaseHandle, {
      workspaceId: input.workspaceId ?? DEFAULT_WORKSPACE_ID,
      sku: product.sku,
      title: product.title_ja,
      productJsonPath: productPath
    });
  }
  return getProductBySku({
    fixturesDir: input.fixturesDir,
    rootDir: input.rootDir,
    sku: product.sku
  });
}

async function deleteProductBySku(input: {
  fixturesDir: string;
  databaseHandle?: DatabaseHandle;
  workspaceId?: string;
  sku: string;
}): Promise<{ deleted: true; sku: string; path: string }> {
  const productPath = input.databaseHandle
    ? productFileBySkuFromDatabase(input.databaseHandle, input.workspaceId ?? DEFAULT_WORKSPACE_ID, input.sku)
    : await findProductFileBySku(input.fixturesDir, input.sku);
  if (!productPath) {
    throw new Error(`Product not found: ${input.sku}`);
  }
  await rm(dirname(productPath), { recursive: true, force: true });
  if (input.databaseHandle) {
    input.databaseHandle.sqlite.prepare("DELETE FROM products WHERE workspace_id = ? AND sku = ?")
      .run(input.workspaceId ?? DEFAULT_WORKSPACE_ID, input.sku);
  }
  return {
    deleted: true,
    sku: input.sku,
    path: productPath
  };
}

function buildImportedProductPreview(input: ImportProductPreviewRequest): ImportedProductPreview {
  const text = String(input.text ?? "").trim();
  if (!text) {
    throw new Error("Product import requires source text.");
  }
  return cleanImportedProductText(text);
}

async function buildAiImportedProductPreview(input: {
  providerKeyStore: ProviderKeyStore;
  fetchImpl?: typeof fetch;
  input: ImportProductPreviewRequest;
}): Promise<ImportedProductPreview> {
  const text = String(input.input.text ?? "").trim();
  if (!text) {
    throw new Error("Product import requires source text.");
  }
  const provider = await createTextModelProvider(input.providerKeyStore, input.fetchImpl);
  const rawProduct = await provider.generateJson<unknown>({
    system: [
      "你是电商商品资料整理助手。",
      "只输出 JSON object，不要 markdown。",
      "把用户粘贴的商品资料整理成以下字段：sku, title_ja, category, materials, dimensions, verified_selling_points, usage_scenes, forbidden_claims, reference_images。",
      "sku 可以从原文 SKU/商品番号/ID 提取；没有时生成一个稳定简短的 ITEM- 前缀内部编号。",
      "只把可确认事实放入 verified_selling_points；销量、排名、医用、防水、UV 数值、功效等未证明内容放入 forbidden_claims。",
      "价格、店铺名、物流信息不要写入商品资料。"
    ].join("\n"),
    user: [
      "请整理这段商品资料：",
      text
    ].join("\n\n")
  });
  const product = parseProductFacts(normalizeAiProductFacts(rawProduct, text));
  return {
    product,
    notes: ["文本模型已整理商品资料。"],
    quality: buildProductImportQuality({
      product,
      riskyClaims: product.forbidden_claims
    })
  };
}

function normalizeAiProductFacts(input: unknown, sourceText: string): unknown {
  const fallback = cleanImportedProductText(sourceText).product;
  const raw = isPlainObject(input) ? input : {};
  return {
    sku: textFromAiValue(raw.sku) || fallback.sku,
    title_ja: textFromAiValue(raw.title_ja) || fallback.title_ja,
    category: textFromAiValue(raw.category) || fallback.category,
    materials: textListFromAiValue(raw.materials, fallback.materials),
    dimensions: dimensionTextFromAiValue(raw.dimensions) || fallback.dimensions,
    verified_selling_points: textListFromAiValue(raw.verified_selling_points, fallback.verified_selling_points),
    usage_scenes: textListFromAiValue(raw.usage_scenes, fallback.usage_scenes),
    forbidden_claims: textListFromAiValue(raw.forbidden_claims, fallback.forbidden_claims),
    reference_images: textListFromAiValue(raw.reference_images, fallback.reference_images)
  };
}

function textListFromAiValue(value: unknown, fallback: string[]): string[] {
  const items = Array.isArray(value) ? value : [value];
  const normalized = items
    .flatMap((item) => textFromAiValue(item).split(/[、,\n]/))
    .map((item) => item.trim())
    .filter(Boolean);
  return normalized.length > 0 ? Array.from(new Set(normalized)) : fallback;
}

function dimensionTextFromAiValue(value: unknown): string {
  if (isPlainObject(value)) {
    const preferredKeys = ["text", "value", "label", "size", "length", "width", "height", "weight", "wrist"];
    return preferredKeys
      .map((key) => textFromAiValue(value[key]))
      .filter(Boolean)
      .join("、");
  }
  return textFromAiValue(value);
}

function textFromAiValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(textFromAiValue).filter(Boolean).join("、");
  }
  if (isPlainObject(value)) {
    const preferredKeys = ["text", "name", "value", "label", "url", "path", "claim", "scene", "description", "size", "length", "width", "height", "weight", "ratio", "wrist"];
    const preferred = preferredKeys
      .map((key) => textFromAiValue(value[key]))
      .filter(Boolean);
    if (preferred.length > 0) {
      return preferred.join(" ");
    }
    return Object.values(value).map(textFromAiValue).filter(Boolean).join(" ");
  }
  return "";
}

async function importProductFromText(input: {
  fixturesDir: string;
  rootDir: string;
  workspaceId?: string;
  databaseHandle?: DatabaseHandle;
  input: ImportProductPreviewRequest;
}): Promise<{ product: Awaited<ReturnType<typeof getProductBySku>>; notes: string[] }> {
  const preview = buildImportedProductPreview(input.input);
  return {
    product: await saveProductFactPackage({
      fixturesDir: input.fixturesDir,
      rootDir: input.rootDir,
      workspaceId: input.workspaceId,
      databaseHandle: input.databaseHandle,
      input: preview.product
    }),
    notes: preview.notes
  };
}

async function buildAiStoryboardDraft(input: {
  sku: string;
  fixturesDir: string;
  rootDir: string;
  providerKeyStore: ProviderKeyStore;
  fetchImpl?: typeof fetch;
  input: StoryboardDraftRequest;
}): Promise<{ scriptLines: string[]; storyboardLines: string[]; storyboardCnLines: string[]; notes: string[] }> {
  const product = await getProductBySku({
    fixturesDir: input.fixturesDir,
    rootDir: input.rootDir,
    sku: input.sku
  });
  const duration = clampInteger(Number(input.input.duration ?? 8), 4, 15);
  const template = isScriptTemplate(input.input.template) ? input.input.template : "scene";
  const provider = await createTextModelProvider(input.providerKeyStore, input.fetchImpl);
  const templateDefinition = videoTemplateDefinitions.find((item) => item.id === template);
  const draft = await provider.generateJson<{
    scriptLines?: unknown;
    storyboardLines?: unknown;
    storyboardCnLines?: unknown;
    notes?: unknown;
  }>({
    system: [
      "你是 TikTok 商品短视频脚本分镜助手。",
      "只输出 JSON object，不要 markdown。",
      "输出字段必须是 scriptLines、storyboardLines、storyboardCnLines、notes，四者都是字符串数组。",
      "scriptLines 必须使用简体中文，是给操作员参考的画面要点，不写字幕时间轴，不写 CTA。",
      "storyboardLines 必须使用简体中文，是视频分镜脚本，按秒数描述画面顺序、卖点出现位置和镜头节奏。",
      "storyboardCnLines 必须使用简体中文，是 storyboardLines 对应的生成说明，逐条解释镜头意图和注意点，不新增未经确认卖点。",
      "不要在 scriptLines、storyboardLines、storyboardCnLines 中使用英文句子或日文句子；商品名可保留原文。",
      "必须遵守 forbidden_claims，不要使用未确认功效、销量、排名、UV 数值等宣称。"
    ].join("\n"),
    user: [
      `视频类型: ${template}`,
      `视频类型说明: ${templateDefinition?.purpose ?? ""}`,
      `视频时长: ${duration}s`,
      "商品资料 JSON:",
      JSON.stringify({
        title_ja: product.title_ja,
        category: product.category,
        materials: product.materials,
        dimensions: product.dimensions,
        verified_selling_points: product.verified_selling_points,
        usage_scenes: product.usage_scenes,
        forbidden_claims: product.forbidden_claims,
        reference_images: product.reference_images
      }, null, 2)
    ].join("\n")
  });
  const scriptLines = normalizeStringArray(draft.scriptLines);
  const storyboardLines = normalizeStringArray(draft.storyboardLines);
  const storyboardCnLines = normalizeStringArray(draft.storyboardCnLines);
  if (scriptLines.length === 0 || storyboardLines.length === 0 || storyboardCnLines.length === 0) {
    throw new Error("文本模型返回的脚本分镜不完整。");
  }
  if (hasJapaneseOutsideAllowedProductNames([...scriptLines, ...storyboardLines, ...storyboardCnLines], product.title_ja)) {
    const fallbackStoryboard = buildChineseStoryboardFallback({
      duration,
      template,
      product
    });
    return {
      scriptLines: buildChineseScriptFallback(product, template, duration),
      storyboardLines: fallbackStoryboard,
      storyboardCnLines: fallbackStoryboard,
      notes: [
        "文本模型返回内容混入日文，已改用中文模板分镜。",
        ...normalizeStringArray(draft.notes)
      ]
    };
  }
  return {
    scriptLines,
    storyboardLines,
    storyboardCnLines,
    notes: normalizeStringArray(draft.notes)
  };
}

async function listProductStoryboards(input: {
  fixturesDir: string;
  databaseHandle?: DatabaseHandle;
  workspaceId?: string;
  sku: string;
}): Promise<StoryboardRecord[]> {
  if (input.databaseHandle) {
    return listProductStoryboardsFromDatabase(
      input.databaseHandle,
      input.workspaceId ?? DEFAULT_WORKSPACE_ID,
      input.sku
    );
  }
  const productFilePath = await findProductFileBySku(input.fixturesDir, input.sku);
  return readProductStoryboards(productFilePath);
}

async function createProductStoryboard(input: {
  fixturesDir: string;
  databaseHandle?: DatabaseHandle;
  workspaceId?: string;
  sku: string;
  input: StoryboardHistoryRequest;
}): Promise<StoryboardRecord> {
  const productFilePath = await findProductFileBySku(input.fixturesDir, input.sku);
  const storyboards = await readProductStoryboards(productFilePath);
  const record: StoryboardRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    style: normalizeStoryboardStyle(input.input.style),
    duration: clampInteger(Number(input.input.duration ?? 10), 4, 60),
    script: normalizeStoryboardScript(input.input.script)
  };
  await writeProductStoryboards(productFilePath, [record, ...storyboards]);
  if (input.databaseHandle) {
    upsertStoryboardIndex(input.databaseHandle, input.workspaceId ?? DEFAULT_WORKSPACE_ID, input.sku, record);
  }
  return record;
}

async function deleteProductStoryboard(input: {
  fixturesDir: string;
  databaseHandle?: DatabaseHandle;
  workspaceId?: string;
  sku: string;
  id: string;
}): Promise<{ deleted: true; id: string }> {
  if (input.databaseHandle) {
    const productFilePath = productFileBySkuFromDatabase(input.databaseHandle, input.workspaceId ?? DEFAULT_WORKSPACE_ID, input.sku);
    if (!productFilePath) {
      throw new Error(`Product not found: ${input.sku}`);
    }
    input.databaseHandle.sqlite.prepare(`
      DELETE FROM storyboards
      WHERE id = ? AND workspace_id = ? AND product_id = (
        SELECT id FROM products WHERE workspace_id = ? AND sku = ?
      )
    `).run(input.id, input.workspaceId ?? DEFAULT_WORKSPACE_ID, input.workspaceId ?? DEFAULT_WORKSPACE_ID, input.sku);
    try {
      const storyboards = await readProductStoryboards(productFilePath);
      await writeProductStoryboards(
        productFilePath,
        storyboards.filter((record) => record.id !== input.id)
      );
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
    }
    return {
      deleted: true,
      id: input.id
    };
  }
  const productFilePath = await findProductFileBySku(input.fixturesDir, input.sku);
  const storyboards = await readProductStoryboards(productFilePath);
  await writeProductStoryboards(
    productFilePath,
    storyboards.filter((record) => record.id !== input.id)
  );
  return {
    deleted: true,
    id: input.id
  };
}

function listProductStoryboardsFromDatabase(
  handle: DatabaseHandle,
  workspaceId: string,
  sku: string
): StoryboardRecord[] {
  const productId = productIdBySkuFromDatabase(handle, workspaceId, sku);
  if (!productId) {
    throw new Error(`Product not found: ${sku}`);
  }
  const rows = handle.sqlite.prepare(`
    SELECT id, created_at, style, duration_seconds, script
    FROM storyboards
    WHERE workspace_id = ? AND product_id = ?
    ORDER BY created_at DESC
  `).all(workspaceId, productId) as Array<{
    id: string;
    created_at: string;
    style: ScriptTemplate;
    duration_seconds: number;
    script: string;
  }>;
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    style: row.style,
    duration: row.duration_seconds,
    script: row.script
  }));
}

function upsertStoryboardIndex(
  handle: DatabaseHandle,
  workspaceId: string,
  sku: string,
  record: StoryboardRecord
): void {
  const productId = productIdBySkuFromDatabase(handle, workspaceId, sku);
  if (!productId) {
    throw new Error(`Product not found: ${sku}`);
  }
  handle.sqlite.prepare(`
    INSERT INTO storyboards (id, workspace_id, product_id, style, duration_seconds, script, created_at)
    VALUES (@id, @workspaceId, @productId, @style, @durationSeconds, @script, @createdAt)
    ON CONFLICT(id) DO UPDATE SET
      workspace_id = excluded.workspace_id,
      product_id = excluded.product_id,
      style = excluded.style,
      duration_seconds = excluded.duration_seconds,
      script = excluded.script,
      created_at = excluded.created_at
  `).run({
    id: record.id,
    workspaceId,
    productId,
    style: record.style,
    durationSeconds: record.duration,
    script: record.script,
    createdAt: record.createdAt
  });
}

async function readProductStoryboards(productFilePath: string): Promise<StoryboardRecord[]> {
  try {
    const parsed = JSON.parse(await readFile(join(dirname(productFilePath), "storyboards.json"), "utf8")) as {
      storyboards?: unknown;
    };
    if (!Array.isArray(parsed.storyboards)) {
      return [];
    }
    return parsed.storyboards.flatMap((record) => normalizeStoryboardRecord(record));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeProductStoryboards(productFilePath: string, storyboards: StoryboardRecord[]): Promise<void> {
  const product = parseProductFacts(JSON.parse(await readFile(productFilePath, "utf8")));
  const storyboardsFile = join(dirname(productFilePath), "storyboards.json");
  await mkdir(dirname(storyboardsFile), { recursive: true });
  await writeFile(storyboardsFile, JSON.stringify({
    workspaceId: DEFAULT_WORKSPACE_ID,
    productSku: product.sku,
    storyboards
  }, null, 2), "utf8");
}

function normalizeStoryboardRecord(value: unknown): StoryboardRecord[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  const raw = value as Partial<StoryboardRecord>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.createdAt !== "string" ||
    typeof raw.script !== "string" ||
    !isScriptTemplate(raw.style)
  ) {
    return [];
  }
  return [{
    id: raw.id,
    createdAt: raw.createdAt,
    style: raw.style,
    duration: clampInteger(Number(raw.duration ?? 10), 4, 60),
    script: raw.script
  }];
}

function normalizeStoryboardStyle(value: unknown): ScriptTemplate {
  return isScriptTemplate(value) ? value : "scene";
}

function normalizeStoryboardScript(value: unknown): string {
  const script = typeof value === "string" ? value.trim() : "";
  if (!script) {
    throw new Error("Storyboard history requires a script.");
  }
  return script;
}

async function createTextModelProvider(providerKeyStore: ProviderKeyStore, fetchImpl?: typeof fetch): Promise<OpenAiCompatibleTextProvider> {
  const config = await providerKeyStore.getConfig("openai-compatible-text");
  return new OpenAiCompatibleTextProvider({
    apiKey: resolveTextModelApiKey({
      localKey: config.apiKey
    }),
    baseUrl: config.baseUrl,
    model: config.model,
    fetchImpl
  });
}

async function createImageModelProvider(providerKeyStore: ProviderKeyStore, fetchImpl?: typeof fetch): Promise<OpenAiCompatibleImageProvider> {
  const config = await providerKeyStore.getConfig("openai-compatible-image");
  return new OpenAiCompatibleImageProvider({
    apiKey: resolveImageModelApiKey({
      localKey: config.apiKey
    }),
    baseUrl: config.baseUrl,
    model: config.model,
    fetchImpl
  });
}

function buildProductReferenceImagePrompt(
  product: ReturnType<typeof parseProductFacts>,
  extraPrompt: string | undefined
): string {
  return [
    "Create a clean e-commerce reference image for a TikTok Shop Japan product.",
    "Use a plain light background, realistic product shape, no text overlays, no logos, no exaggerated claims.",
    "The image should help video generation understand the product appearance.",
    `Product title: ${product.title_ja}`,
    `Category: ${product.category}`,
    `Materials: ${product.materials.join(", ")}`,
    `Dimensions/weight: ${product.dimensions}`,
    `Verified selling points: ${product.verified_selling_points.join(", ")}`,
    `Usage scenes: ${product.usage_scenes.join(", ")}`,
    product.forbidden_claims.length > 0
      ? `Avoid implying these unverified claims: ${product.forbidden_claims.join(", ")}`
      : "",
    typeof extraPrompt === "string" && extraPrompt.trim() ? `Extra direction: ${extraPrompt.trim()}` : ""
  ].filter(Boolean).join("\n");
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function hasJapaneseOutsideAllowedProductNames(lines: string[], allowedProductTitle: string): boolean {
  const allowedFragments = new Set(splitJapaneseFragments(allowedProductTitle));
  return lines.some((line) => {
    const fragments = splitJapaneseFragments(line);
    return fragments.some((fragment) => !allowedFragments.has(fragment));
  });
}

function splitJapaneseFragments(value: string): string[] {
  return value.match(/[\u3040-\u30ffー]+/g) ?? [];
}

function buildChineseScriptFallback(
  product: Awaited<ReturnType<typeof getProductBySku>>,
  template: ScriptTemplate,
  duration: number
): string[] {
  const firstScene = product.usage_scenes[0] || "日常使用";
  const firstPoint = safeChineseFact(product.verified_selling_points[0], "核心卖点");
  const secondPoint = safeChineseFact(product.verified_selling_points[1], "已确认卖点");
  return [
    `类型: ${serverTemplateLabel(template)} / 时长: ${duration}s`,
    `以${firstScene}场景切入，先展示用户会遇到的真实使用需求。`,
    `镜头重点展示${firstPoint}。`,
    `用近景补充${secondPoint}、材质和整体外观。`
  ];
}

function buildChineseStoryboardFallback(input: {
  duration: number;
  template: ScriptTemplate;
  product: Awaited<ReturnType<typeof getProductBySku>>;
}): string[] {
  const middle = Math.max(2, Math.floor(input.duration * 0.45));
  const closing = Math.max(middle + 1, input.duration - 2);
  const firstScene = input.product.usage_scenes[0] || "使用场景";
  const firstPoint = safeChineseFact(input.product.verified_selling_points[0], "商品细节");
  const secondPoint = safeChineseFact(input.product.verified_selling_points[1], "已确认卖点");
  return [
    `0-2s: 以${serverTemplateLabel(input.template)}开场，展示${firstScene}和商品整体。`,
    `2-${middle}s: 近景展示${firstPoint}。`,
    `${middle}-${closing}s: 展示使用中的手部动作、质感和${secondPoint}。`,
    `${closing}-${input.duration}s: 再次展示使用后的效果和商品整体。`
  ];
}

function serverTemplateLabel(template: ScriptTemplate): string {
  const definition = videoTemplateDefinitions.find((item) => item.id === template);
  return definition?.label ?? template;
}

function safeChineseFact(value: string | undefined, fallback: string): string {
  if (!value?.trim()) {
    return fallback;
  }
  return splitJapaneseFragments(value).length > 0 ? fallback : value.trim();
}

type ProductImportBatchResult =
  | {
      index: number;
      status: "imported";
      product: Awaited<ReturnType<typeof getProductBySku>>;
      notes: string[];
    }
  | {
      index: number;
      status: "failed";
      error: string;
    };

async function importProductsBatchFromText(input: {
  fixturesDir: string;
  rootDir: string;
  workspaceId?: string;
  databaseHandle?: DatabaseHandle;
  input: ImportProductsBatchRequest;
}): Promise<{
  summary: {
    total: number;
    imported: number;
    failed: number;
  };
  results: ProductImportBatchResult[];
}> {
  const blocks = splitImportedProductBlocks(String(input.input.text ?? ""));
  if (blocks.length === 0) {
    throw new Error("Product batch import requires source text.");
  }
  const results: ProductImportBatchResult[] = [];
  for (const [blockIndex, block] of blocks.entries()) {
    try {
      const imported = await importProductFromText({
        fixturesDir: input.fixturesDir,
        rootDir: input.rootDir,
        workspaceId: input.workspaceId,
        databaseHandle: input.databaseHandle,
        input: { text: block }
      });
      results.push({
        index: blockIndex + 1,
        status: "imported",
        product: imported.product,
        notes: imported.notes
      });
    } catch (error) {
      results.push({
        index: blockIndex + 1,
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  const imported = results.filter((item) => item.status === "imported").length;
  return {
    summary: {
      total: results.length,
      imported,
      failed: results.length - imported
    },
    results
  };
}

function splitImportedProductBlocks(text: string): string[] {
  return text
    .trim()
    .split(/\n\s*(?:---+|={3,})\s*\n|\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

async function importProductReferenceAssets(input: {
  fixturesDir: string;
  rootDir: string;
  sku: string;
}): Promise<{
  imported: ImportedProductAsset[];
  product: Awaited<ReturnType<typeof getProductBySku>>;
}> {
  const productFilePath = await findProductFileBySku(input.fixturesDir, input.sku);
  const rawProduct = JSON.parse(await readFile(productFilePath, "utf8")) as Record<string, unknown>;
  const product = parseProductFacts(rawProduct);
  const statuses = await describeReferenceImages(product.reference_images, {
    productFilePath,
    rootDir: input.rootDir
  });
  const imported: ImportedProductAsset[] = [];
  const nextReferenceImages = [...product.reference_images];
  for (const [index, image] of statuses.entries()) {
    if (image.status !== "outside-project-root") {
      continue;
    }
    try {
      await access(image.resolvedPath);
    } catch {
      continue;
    }
    const extension = normalizedImageExtension(image.resolvedPath);
    const targetPath = join(dirname(productFilePath), "refs", `reference-${String(index + 1).padStart(2, "0")}${extension}`);
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(image.resolvedPath, targetPath);
    const reference = `refs/${basename(targetPath)}`;
    nextReferenceImages[index] = reference;
    imported.push({
      original: image.original,
      path: targetPath,
      reference
    });
  }
  if (imported.length > 0) {
    await writeFile(
      productFilePath,
      JSON.stringify(
        {
          ...rawProduct,
          reference_images: nextReferenceImages
        },
        null,
        2
      ),
      "utf8"
    );
  }
  return {
    imported,
    product: await getProductBySku({
      fixturesDir: input.fixturesDir,
      rootDir: input.rootDir,
      sku: input.sku
    })
  };
}

async function uploadProductReferenceImages(input: {
  fixturesDir: string;
  rootDir: string;
  sku: string;
  input: UploadProductReferenceImagesRequest;
}): Promise<{
  uploaded: UploadedProductReferenceImage[];
  product: Awaited<ReturnType<typeof getProductBySku>>;
}> {
  const productFilePath = await findProductFileBySku(input.fixturesDir, input.sku);
  const rawProduct = JSON.parse(await readFile(productFilePath, "utf8")) as Record<string, unknown>;
  const product = parseProductFacts(rawProduct);
  const files = input.input.files ?? [];
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("Reference image upload requires at least one file.");
  }
  const nextReferenceImages = [...product.reference_images];
  const uploaded: UploadedProductReferenceImage[] = [];
  for (const file of files) {
    const fileName = typeof file.fileName === "string" && file.fileName.trim() ? file.fileName.trim() : "reference.jpg";
    const mimeType = typeof file.mimeType === "string" ? file.mimeType : "";
    const extension = imageExtensionFromUpload(fileName, mimeType);
    if (!extension) {
      throw new Error(`Unsupported reference image type: ${mimeType || fileName}`);
    }
    if (typeof file.base64 !== "string" || !file.base64.trim()) {
      throw new Error(`Reference image ${fileName} is missing base64 content.`);
    }
    const index = nextReferenceImages.length + 1;
    const targetPath = join(dirname(productFilePath), "refs", `reference-${String(index).padStart(2, "0")}${extension}`);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, Buffer.from(file.base64, "base64"));
    const reference = `refs/${basename(targetPath)}`;
    nextReferenceImages.push(reference);
    uploaded.push({
      originalName: fileName,
      path: targetPath,
      reference
    });
  }
  await writeFile(
    productFilePath,
    JSON.stringify(
      {
        ...rawProduct,
        reference_images: nextReferenceImages
      },
      null,
      2
    ),
    "utf8"
  );
  return {
    uploaded,
    product: await getProductBySku({
      fixturesDir: input.fixturesDir,
      rootDir: input.rootDir,
      sku: input.sku
    })
  };
}

async function generateProductReferenceImages(input: {
  fixturesDir: string;
  rootDir: string;
  sku: string;
  providerKeyStore: ProviderKeyStore;
  fetchImpl?: typeof fetch;
  input: GenerateProductReferenceImagesRequest;
}): Promise<{
  generated: GeneratedProductReferenceImage[];
  product: Awaited<ReturnType<typeof getProductBySku>>;
}> {
  const productFilePath = await findProductFileBySku(input.fixturesDir, input.sku);
  const rawProduct = JSON.parse(await readFile(productFilePath, "utf8")) as Record<string, unknown>;
  const product = parseProductFacts(rawProduct);
  const count = clampInteger(
    Number(input.input.count ?? Math.max(1, Math.min(3, 3 - product.reference_images.length))),
    1,
    4
  );
  const provider = await createImageModelProvider(input.providerKeyStore, input.fetchImpl);
  const images = await provider.generateImages({
    count,
    prompt: buildProductReferenceImagePrompt(product, input.input.prompt)
  });
  const nextReferenceImages = [...product.reference_images];
  const generated: GeneratedProductReferenceImage[] = [];
  for (const image of images) {
    const index = nextReferenceImages.length + 1;
    const targetPath = join(dirname(productFilePath), "refs", `reference-${String(index).padStart(2, "0")}${extensionFromMimeType(image.mimeType)}`);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, image.bytes);
    const reference = `refs/${basename(targetPath)}`;
    nextReferenceImages.push(reference);
    generated.push({
      path: targetPath,
      reference
    });
  }
  await writeFile(
    productFilePath,
    JSON.stringify(
      {
        ...rawProduct,
        reference_images: nextReferenceImages
      },
      null,
      2
    ),
    "utf8"
  );
  return {
    generated,
    product: await getProductBySku({
      fixturesDir: input.fixturesDir,
      rootDir: input.rootDir,
      sku: input.sku
    })
  };
}

async function deleteProductReferenceImage(input: {
  fixturesDir: string;
  rootDir: string;
  sku: string;
  index: number;
}): Promise<{
  deleted: {
    index: number;
    reference: string;
  };
  product: Awaited<ReturnType<typeof getProductBySku>>;
}> {
  const productFilePath = await findProductFileBySku(input.fixturesDir, input.sku);
  const rawProduct = JSON.parse(await readFile(productFilePath, "utf8")) as Record<string, unknown>;
  const product = parseProductFacts(rawProduct);
  if (!Number.isInteger(input.index) || input.index < 0 || input.index >= product.reference_images.length) {
    throw new Error(`Reference image index is out of range: ${input.index}`);
  }
  const nextReferenceImages = product.reference_images.filter((_, index) => index !== input.index);
  const deletedReference = product.reference_images[input.index] ?? "";
  await writeFile(
    productFilePath,
    JSON.stringify(
      {
        ...rawProduct,
        reference_images: nextReferenceImages
      },
      null,
      2
    ),
    "utf8"
  );
  return {
    deleted: {
      index: input.index,
      reference: deletedReference
    },
    product: await getProductBySku({
      fixturesDir: input.fixturesDir,
      rootDir: input.rootDir,
      sku: input.sku
    })
  };
}

async function findProductFileBySku(fixturesDir: string, sku: string): Promise<string> {
  const files = await listProductFiles(fixturesDir);
  for (const file of files) {
    const product = parseProductFacts(JSON.parse(await readFile(file, "utf8")));
    if (product.sku === sku) {
      return file;
    }
  }
  throw new Error(`Product not found: ${sku}`);
}

async function listProductFiles(productsDir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(productsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(productsDir, entry.name, "product.json"));
}

async function describeReferenceImages(
  referenceImages: string[],
  options: {
    productFilePath: string;
    rootDir: string;
  }
): Promise<ProductImagePreview[]> {
  const resolvedImages = resolveReferenceImages(referenceImages, {
    productFilePath: options.productFilePath
  });
  return Promise.all(
    referenceImages.map(async (original, index) =>
      describeReferenceImage(original, resolvedImages[index] ?? original, options.rootDir)
    )
  );
}

async function describeReferenceImage(
  original: string,
  resolvedPath: string,
  rootDir: string
): Promise<ProductImagePreview> {
  if (isRemoteReference(resolvedPath)) {
    return {
      original,
      resolvedPath,
      previewUrl: resolvedPath,
      status: "remote"
    };
  }
  if (!isPathInsideRoot(rootDir, resolvedPath)) {
    return {
      original,
      resolvedPath,
      previewUrl: null,
      status: "outside-project-root"
    };
  }
  try {
    await access(resolvedPath);
  } catch {
    return {
      original,
      resolvedPath,
      previewUrl: null,
      status: "missing"
    };
  }
  return {
    original,
    resolvedPath,
    previewUrl: `/media?path=${encodeURIComponent(resolvedPath)}`,
    status: "previewable"
  };
}

interface ReportFilters {
  productSku?: string;
  provider?: string;
  status?: string;
  finalOnly?: boolean;
}

interface PublishPackageFileUrls {
  videoUrl: string;
  subtitleUrl?: string;
  finalManifestUrl?: string;
  manifestUrl: string;
}

interface PublishPackageFileStatus {
  video: "ready" | "missing";
  subtitle?: "ready" | "missing";
}

type PublishPackageConsoleManifest = PublishPackageManifest & {
  fileUrls: PublishPackageFileUrls;
  fileStatus: PublishPackageFileStatus;
};

async function withPublishPackageFileUrls(
  ledger: PublishPackageLedger
): Promise<Omit<PublishPackageLedger, "packages"> & { packages: PublishPackageConsoleManifest[] }> {
  return {
    ...ledger,
    packages: await Promise.all(ledger.packages.map((item) => withPublishPackageFileUrl(item)))
  };
}

async function withPublishPackageFileUrl(item: PublishPackageManifest): Promise<PublishPackageConsoleManifest> {
  return {
    ...item,
    fileUrls: {
      videoUrl: mediaUrl(item.files.videoPath),
      subtitleUrl: item.files.subtitlePath ? mediaUrl(item.files.subtitlePath) : undefined,
      finalManifestUrl: item.files.finalManifestPath ? mediaUrl(item.files.finalManifestPath) : undefined,
      manifestUrl: mediaUrl(item.manifestPath)
    },
    fileStatus: {
      video: await fileExists(item.files.videoPath) ? "ready" : "missing",
      subtitle: item.files.subtitlePath ? (await fileExists(item.files.subtitlePath) ? "ready" : "missing") : undefined
    }
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function mediaUrl(path: string): string {
  return `/media?path=${encodeURIComponent(path)}`;
}

type QcSummaryResult = "pass" | "warning" | "fail" | "missing";

interface QcSummaryItem {
  jobId: string;
  reportPath: string;
  rawManifestPath?: string;
  productSku?: string;
  provider?: string;
  durationSeconds?: number;
  result: QcSummaryResult;
  failedChecks: string[];
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
  }>;
}

interface QcSummary {
  summary: {
    totalJobs: number;
    passJobs: number;
    warningJobs: number;
    failJobs: number;
    missingJobs: number;
  };
  items: QcSummaryItem[];
}

type VideoAssetKind = "raw" | "final" | "publish";

interface VideoAssetCandidate {
  kind: VideoAssetKind;
  path?: string;
  productSku?: string;
  jobId: string;
  provider?: string;
  taskId?: string;
  durationSeconds?: number;
  source: "report" | "publish-package";
  sourcePath: string;
}

interface VideoAssetItem extends Omit<VideoAssetCandidate, "path"> {
  path: string;
  exists: boolean;
  sizeBytes: number;
  url?: string;
}

interface VideoAssetLedger {
  summary: {
    totalAssets: number;
    totalBytes: number;
    rawAssets: number;
    finalAssets: number;
    publishAssets: number;
    missingAssets: number;
  };
  assets: VideoAssetItem[];
}

interface StorageBackupScope {
  id: "products" | "settings" | "system" | "job-metadata";
  label: string;
  path: string;
  mustBackup: true;
  fileCount: number;
  totalBytes: number;
  videoFiles: number;
  manifestFiles: number;
  jsonFiles: number;
  productFiles: number;
  referenceImages: number;
}

interface StorageBackupReport {
  summary: {
    totalFiles: number;
    totalBytes: number;
    videoFiles: number;
    manifestFiles: number;
    productFiles: number;
    referenceImages: number;
  };
  scopes: StorageBackupScope[];
  backupCommands: string[];
  notes: string[];
}

interface LocalBackupItem {
  fileName: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
  url: string;
}

interface LocalBackupLedger {
  summary: {
    totalBackups: number;
    totalBytes: number;
    latestCreatedAt?: string;
  };
  backups: LocalBackupItem[];
}

async function buildQcSummary(outputsDir: string): Promise<QcSummary> {
  const reportPaths = await listNamedFiles(outputsDir, "make-video-report.json");
  const items = [];
  for (const reportPath of reportPaths) {
    const report = JSON.parse(await readFile(reportPath, "utf8")) as Partial<MakeVideoReport>;
    items.push(await toQcSummaryItem(reportPath, report));
  }
  items.sort(
    (left, right) =>
      qcResultRank(right.result) - qcResultRank(left.result) ||
      left.productSku?.localeCompare(right.productSku ?? "") ||
      left.jobId.localeCompare(right.jobId)
  );
  return {
    summary: summarizeQcItems(items),
    items
  };
}

async function toQcSummaryItem(
  reportPath: string,
  report: Partial<MakeVideoReport>
): Promise<QcSummaryItem> {
  const jobId = basename(dirname(reportPath));
  const rawManifestPath = report.raw?.manifestPath;
  const base = {
    jobId,
    reportPath,
    rawManifestPath,
    productSku: report.productSku,
    provider: report.provider,
    durationSeconds: report.durationSeconds
  };
  if (!rawManifestPath) {
    return {
      ...base,
      result: "missing",
      failedChecks: ["qc_manifest_missing"],
      checks: [
        {
          name: "qc_manifest_missing",
          passed: false,
          message: "Raw manifest path is missing from the make-video report."
        }
      ]
    };
  }
  try {
    const manifest = JSON.parse(await readFile(rawManifestPath, "utf8")) as {
      qc?: {
        result?: QcSummaryResult;
        checks?: Array<{
          name?: string;
          passed?: boolean;
          message?: string;
        }>;
      };
    };
    const checks = normalizeQcChecks(manifest.qc?.checks);
    const result = normalizeQcResult(manifest.qc?.result, checks);
    return {
      ...base,
      result,
      failedChecks: checks.filter((check) => !check.passed).map((check) => check.name),
      checks
    };
  } catch {
    return {
      ...base,
      result: "missing",
      failedChecks: ["qc_manifest_missing"],
      checks: [
        {
          name: "qc_manifest_missing",
          passed: false,
          message: `Raw manifest could not be read: ${rawManifestPath}`
        }
      ]
    };
  }
}

function normalizeQcChecks(
  checks: unknown
): QcSummaryItem["checks"] {
  if (!Array.isArray(checks)) {
    return [
      {
        name: "qc_checks_missing",
        passed: false,
        message: "QC checks are missing from the raw manifest."
      }
    ];
  }
  return checks.map((check, index) => {
    const item = isPlainObject(check) ? check : {};
    return {
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : `qc_check_${index + 1}`,
      passed: item.passed === true,
      message: typeof item.message === "string" ? item.message : ""
    };
  });
}

function normalizeQcResult(
  value: unknown,
  checks: QcSummaryItem["checks"]
): QcSummaryResult {
  if (value === "pass" || value === "warning" || value === "fail") {
    return value;
  }
  return checks.every((check) => check.passed) ? "pass" : "fail";
}

function summarizeQcItems(items: QcSummaryItem[]): QcSummary["summary"] {
  return {
    totalJobs: items.length,
    passJobs: items.filter((item) => item.result === "pass").length,
    warningJobs: items.filter((item) => item.result === "warning").length,
    failJobs: items.filter((item) => item.result === "fail").length,
    missingJobs: items.filter((item) => item.result === "missing").length
  };
}

function qcResultRank(result: QcSummaryResult): number {
  if (result === "fail") return 3;
  if (result === "missing") return 2;
  if (result === "warning") return 1;
  return 0;
}

async function deleteVideoAsset(input: {
  rootDir: string;
  input: DeleteVideoAssetRequest;
}): Promise<{
  deleted: true;
  path: string;
  sizeBytes: number;
}> {
  if (input.input.confirm !== true) {
    throw new Error("Deleting a video asset requires confirm: true.");
  }
  if (typeof input.input.path !== "string" || !input.input.path.trim()) {
    throw new Error("Deleting a video asset requires a video path.");
  }
  if (!isVideoPath(input.input.path)) {
    throw new Error("Deleting a video asset requires an .mp4 file.");
  }
  const videoPath = resolveWithin(input.rootDir, input.input.path);
  const fileStat = await stat(videoPath);
  if (!fileStat.isFile()) {
    throw new Error(`Video asset is not a file: ${videoPath}`);
  }
  await unlink(videoPath);
  return {
    deleted: true,
    path: videoPath,
    sizeBytes: fileStat.size
  };
}

async function listVideoAssets(input: {
  rootDir: string;
  outputsDir: string;
}): Promise<VideoAssetLedger> {
  const candidates = [
    ...(await videoAssetCandidatesFromReports(input.outputsDir)),
    ...(await videoAssetCandidatesFromPublishPackages(input.outputsDir))
  ];
  const assets = [];
  for (const candidate of candidates) {
    const asset = await toVideoAssetItem(candidate, input.rootDir);
    if (asset) {
      assets.push(asset);
    }
  }
  assets.sort(
    (left, right) =>
      kindRank(left.kind) - kindRank(right.kind) ||
      left.productSku?.localeCompare(right.productSku ?? "") ||
      left.jobId.localeCompare(right.jobId) ||
      left.path.localeCompare(right.path)
  );
  return {
    summary: summarizeVideoAssets(assets),
    assets
  };
}

async function buildStorageBackupReport(input: {
  dataDir: string;
}): Promise<StorageBackupReport> {
  const workspace = getWorkspacePaths(input.dataDir, DEFAULT_WORKSPACE_ID);
  const roots = getStorageRoots(input.dataDir);
  const scopes: StorageBackupScope[] = [
    await summarizeStorageScope({
      id: "products",
      label: "商品资料与参考图",
      path: workspace.productsDir
    }),
    await summarizeStorageScope({
      id: "settings",
      label: "默认工作区设置",
      path: workspace.settingsDir
    }),
    await summarizeStorageScope({
      id: "system",
      label: "系统设置、会话和审计日志",
      path: roots.systemDir
    }),
    await summarizeStorageScope({
      id: "job-metadata",
      label: "任务元数据",
      path: workspace.jobsDir
    })
  ];
  return {
    summary: {
      totalFiles: scopes.reduce((sum, scope) => sum + scope.fileCount, 0),
      totalBytes: scopes.reduce((sum, scope) => sum + scope.totalBytes, 0),
      videoFiles: scopes.reduce((sum, scope) => sum + scope.videoFiles, 0),
      manifestFiles: scopes.reduce((sum, scope) => sum + scope.manifestFiles, 0),
      productFiles: scopes.find((scope) => scope.id === "products")?.productFiles ?? 0,
      referenceImages: scopes.find((scope) => scope.id === "products")?.referenceImages ?? 0
    },
    scopes,
    backupCommands: [
      [
        `tar -czf ${join(input.dataDir, "backups", "haitu-backup-$(date +%Y%m%d).tar.gz")}`,
        "--exclude='backups'",
        "--exclude='workspaces/*/jobs/*/raw'",
        "--exclude='workspaces/*/jobs/*/final'",
        "-C",
        input.dataDir,
        "."
      ].join(" ")
    ],
    notes: [
      "备份只处理 HAITU_DATA_DIR，不包含代码目录。",
      "默认排除 jobs/*/raw 和 jobs/*/final，视频只保留 24 小时，用户应尽快下载。",
      "如需排查，可以保留 job.json 和 make-video-report.json 等任务元数据。"
    ]
  };
}

async function createLocalBackup(input: {
  dataDir: string;
}): Promise<LocalBackupItem> {
  const backupsDir = join(input.dataDir, "backups");
  await mkdir(backupsDir, { recursive: true });
  const fileName = backupFileName();
  const backupPath = join(backupsDir, fileName);
  await runCommand("tar", [
    "-czf",
    backupPath,
    "--exclude",
    "backups",
    "--exclude",
    "workspaces/*/jobs/*/raw",
    "--exclude",
    "workspaces/*/jobs/*/final",
    "-C",
    input.dataDir,
    "."
  ]);
  return toLocalBackupItem(backupPath, await stat(backupPath));
}

async function listLocalBackups(input: {
  dataDir: string;
}): Promise<LocalBackupLedger> {
  const backupsDir = join(input.dataDir, "backups");
  const backups: LocalBackupItem[] = [];
  let entries: Dirent[];
  try {
    entries = await readdir(backupsDir, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".tar.gz")) {
      continue;
    }
    const path = join(backupsDir, entry.name);
    try {
      backups.push(toLocalBackupItem(path, await stat(path)));
    } catch {
      // Ignore files that disappear during a scan.
    }
  }
  backups.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.fileName.localeCompare(left.fileName));
  return {
    summary: {
      totalBackups: backups.length,
      totalBytes: backups.reduce((sum, backup) => sum + backup.sizeBytes, 0),
      latestCreatedAt: backups[0]?.createdAt
    },
    backups
  };
}

function toLocalBackupItem(path: string, fileStat: { size: number; mtime: Date }): LocalBackupItem {
  return {
    fileName: basename(path),
    path,
    sizeBytes: fileStat.size,
    createdAt: fileStat.mtime.toISOString(),
    url: mediaUrl(path)
  };
}

function backupFileName(now = new Date()): string {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");
  return `haitu-backup-${year}${month}${day}-${hour}${minute}${second}.tar.gz`;
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

async function summarizeStorageScope(input: {
  id: StorageBackupScope["id"];
  label: string;
  path: string;
}): Promise<StorageBackupScope> {
  const files = await listStorageFiles(input.path, {
    excludeJobMediaDirs: input.id === "job-metadata"
  });
  return {
    id: input.id,
    label: input.label,
    path: input.path,
    mustBackup: true,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0),
    videoFiles: files.filter((file) => file.extension === ".mp4").length,
    manifestFiles: files.filter((file) => basename(file.path) === "manifest.json" || basename(file.path) === "final-manifest.json").length,
    jsonFiles: files.filter((file) => file.extension === ".json").length,
    productFiles: input.id === "products" ? files.filter((file) => basename(file.path) === "product.json").length : 0,
    referenceImages: input.id === "products" ? files.filter((file) => [".jpg", ".jpeg", ".png", ".webp"].includes(file.extension)).length : 0
  };
}

async function listStorageFiles(
  root: string,
  options: { excludeJobMediaDirs?: boolean } = {}
): Promise<Array<{ path: string; sizeBytes: number; extension: string }>> {
  const files: Array<{ path: string; sizeBytes: number; extension: string }> = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (options.excludeJobMediaDirs && (entry.name === "raw" || entry.name === "final")) {
          continue;
        }
        await walk(path);
      } else if (entry.isFile()) {
        try {
          const fileStat = await stat(path);
          files.push({
            path,
            sizeBytes: fileStat.size,
            extension: extname(path).toLowerCase()
          });
        } catch {
          // Ignore files that disappear during a scan.
        }
      }
    }
  }
  await walk(root);
  return files;
}

async function videoAssetCandidatesFromReports(outputsDir: string): Promise<VideoAssetCandidate[]> {
  const files = await listNamedFiles(outputsDir, "make-video-report.json");
  const candidates: VideoAssetCandidate[] = [];
  for (const file of files) {
    const report = JSON.parse(await readFile(file, "utf8")) as Partial<MakeVideoReport>;
    const jobId = basename(dirname(file));
    candidates.push({
      kind: "final",
      path: report.final?.outputPath,
      productSku: report.productSku,
      jobId,
      provider: report.provider,
      taskId: report.raw?.taskId,
      durationSeconds: report.durationSeconds,
      source: "report",
      sourcePath: file
    });
    candidates.push({
      kind: "raw",
      path: report.raw?.outputPath,
      productSku: report.productSku,
      jobId,
      provider: report.provider,
      taskId: report.raw?.taskId,
      durationSeconds: report.durationSeconds,
      source: "report",
      sourcePath: file
    });
  }
  return candidates;
}

async function videoAssetCandidatesFromPublishPackages(outputsDir: string): Promise<VideoAssetCandidate[]> {
  const ledger = await listPublishPackages(outputsDir);
  return ledger.packages.map((item) => ({
    kind: "publish",
    path: item.files.videoPath,
    productSku: item.productSku,
    jobId: item.jobId,
    provider: item.provider,
    taskId: item.taskId,
    durationSeconds: item.durationSeconds,
    source: "publish-package",
    sourcePath: item.manifestPath
  }));
}

async function toVideoAssetItem(
  candidate: VideoAssetCandidate,
  rootDir: string
): Promise<VideoAssetItem | undefined> {
  if (!candidate.path || !isVideoPath(candidate.path)) {
    return undefined;
  }
  const resolvedPath = resolve(rootDir, candidate.path);
  if (!isPathInsideRoot(rootDir, resolvedPath)) {
    return undefined;
  }
  let sizeBytes = 0;
  let exists = true;
  try {
    const fileStat = await stat(resolvedPath);
    sizeBytes = fileStat.isFile() ? fileStat.size : 0;
    exists = fileStat.isFile();
  } catch {
    exists = false;
  }
  return {
    kind: candidate.kind,
    path: resolvedPath,
    productSku: candidate.productSku,
    jobId: candidate.jobId,
    provider: candidate.provider,
    taskId: candidate.taskId,
    durationSeconds: candidate.durationSeconds,
    source: candidate.source,
    sourcePath: candidate.sourcePath,
    exists,
    sizeBytes,
    url: exists ? mediaUrl(resolvedPath) : undefined
  };
}

function summarizeVideoAssets(assets: VideoAssetItem[]): VideoAssetLedger["summary"] {
  return {
    totalAssets: assets.length,
    totalBytes: assets.reduce((sum, asset) => sum + asset.sizeBytes, 0),
    rawAssets: assets.filter((asset) => asset.kind === "raw").length,
    finalAssets: assets.filter((asset) => asset.kind === "final").length,
    publishAssets: assets.filter((asset) => asset.kind === "publish").length,
    missingAssets: assets.filter((asset) => !asset.exists).length
  };
}

function kindRank(kind: VideoAssetKind): number {
  if (kind === "final") return 0;
  if (kind === "raw") return 1;
  return 2;
}

function isVideoPath(path: string): boolean {
  return extname(path).toLowerCase() === ".mp4";
}

async function listReports(outputsDir: string, filters: ReportFilters = {}): Promise<
  Array<{
    path: string;
    productSku?: string;
    provider?: string;
    status?: string;
    durationSeconds?: number;
    rawManifestPath?: string;
    rawOutputPath?: string;
    finalOutputPath?: string;
    finalVideoUrl?: string;
    billing?: MakeVideoReport["billing"];
    totalCost?: MakeVideoReport["totalCost"];
    taskId?: string;
    reusedRawManifest?: boolean;
  }>
> {
  const files = await listNamedFiles(outputsDir, "make-video-report.json");
  const reports = [];
  for (const file of files) {
    const report = JSON.parse(await readFile(file, "utf8")) as Partial<MakeVideoReport>;
    const item = {
      path: file,
      productSku: report.productSku,
      provider: report.provider,
      status: report.status,
      durationSeconds: report.durationSeconds,
      rawManifestPath: report.raw?.manifestPath,
      rawOutputPath: report.raw?.outputPath,
      finalOutputPath: report.final?.outputPath,
      finalVideoUrl: report.final?.outputPath
        ? `/media?path=${encodeURIComponent(report.final.outputPath)}`
        : undefined,
      billing: report.billing,
      totalCost: report.totalCost,
      taskId: report.raw?.taskId,
      reusedRawManifest: report.reusedRawManifest
    };
    if (matchesReportFilters(item, filters)) {
      reports.push(item);
    }
  }
  return reports.sort((left, right) => left.path.localeCompare(right.path));
}

function matchesReportFilters(
  report: {
    productSku?: string;
    provider?: string;
    status?: string;
    finalVideoUrl?: string;
  },
  filters: ReportFilters
): boolean {
  if (filters.productSku && report.productSku !== filters.productSku) {
    return false;
  }
  if (filters.provider && report.provider !== filters.provider) {
    return false;
  }
  if (filters.status && report.status !== filters.status) {
    return false;
  }
  if (filters.finalOnly && !report.finalVideoUrl) {
    return false;
  }
  return true;
}

function queryValue(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name);
  return value && value !== "all" ? value : undefined;
}

async function listFiles(root: string, extension: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && extname(entry.name) === extension)
      .map((entry) => join(root, entry.name));
  } catch {
    return [];
  }
}

async function listNamedFiles(root: string, fileName: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && entry.name === fileName) {
        found.push(path);
      }
    }
  }
  await walk(root);
  return found;
}

function resolveWithin(rootDir: string, path: string): string {
  const resolved = resolve(rootDir, path);
  if (!isPathInsideRoot(rootDir, resolved)) {
    throw new Error(`Path is outside project root: ${path}`);
  }
  return resolved;
}

function isPathInsideRoot(rootDir: string, path: string): boolean {
  const resolved = resolve(path);
  const root = resolve(rootDir);
  const relativePath = relative(root, resolved);
  return relativePath !== ".." && !relativePath.startsWith(`..${"/"}`) && !isAbsolute(relativePath);
}

function isRemoteReference(reference: string): boolean {
  return reference.startsWith("http://") || reference.startsWith("https://") || reference.startsWith("data:image/");
}

function normalizedImageExtension(path: string): string {
  const extension = extname(path).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp"].includes(extension) ? extension : ".jpg";
}

function imageExtensionFromUpload(fileName: string, mimeType: string): string | undefined {
  const normalizedMimeType = mimeType.toLowerCase();
  if (normalizedMimeType === "image/jpeg" || normalizedMimeType === "image/jpg") {
    return ".jpg";
  }
  if (normalizedMimeType === "image/png") {
    return ".png";
  }
  if (normalizedMimeType === "image/webp") {
    return ".webp";
  }
  const extension = extname(fileName).toLowerCase();
  if (extension === ".jpeg") {
    return ".jpg";
  }
  return [".jpg", ".png", ".webp"].includes(extension) ? extension : undefined;
}

function summarizeReferenceImages(images: ProductImagePreview[]) {
  return {
    total: images.length,
    previewable: images.filter((image) => image.status === "previewable").length,
    missing: images.filter((image) => image.status === "missing").length,
    outsideProjectRoot: images.filter((image) => image.status === "outside-project-root").length,
    remote: images.filter((image) => image.status === "remote").length
  };
}

function buildPreflightWarnings(assetSummary: ReturnType<typeof summarizeReferenceImages>): string[] {
  const warnings: string[] = [];
  if (assetSummary.missing > 0) {
    warnings.push(`${assetSummary.missing} reference image ${assetSummary.missing === 1 ? "is" : "are"} missing.`);
  }
  if (assetSummary.outsideProjectRoot > 0) {
    warnings.push(
      `${assetSummary.outsideProjectRoot} reference image ${assetSummary.outsideProjectRoot === 1 ? "is" : "are"} outside the project root.`
    );
  }
  if (assetSummary.previewable === 0 && assetSummary.remote === 0) {
    warnings.push("No previewable reference images are available.");
  }
  return warnings;
}

function buildPaidGenerationReadiness(
  product: ReturnType<typeof parseProductFacts>,
  assetSummary: ReturnType<typeof summarizeReferenceImages>
) {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  if (assetSummary.missing > 0) {
    warnings.push(`${assetSummary.missing} 张参考图缺失。`);
  }
  if (assetSummary.outsideProjectRoot > 0) {
    warnings.push(`${assetSummary.outsideProjectRoot} 张参考图在项目目录外，请先导入资产。`);
  }
  if (assetSummary.previewable === 0 && assetSummary.remote === 0) {
    blockingReasons.push("没有可用参考图");
    warnings.push("付费生成会被拦截，请先上传真实商品参考图。");
  }
  if (product.materials.length === 0 || product.materials.some((item) => item.includes("未确认"))) {
    blockingReasons.push("材质未确认");
    warnings.push("请补充材质，避免脚本描述商品手感或面料时编造。");
  }
  if (!product.dimensions.trim() || product.dimensions.includes("未确认")) {
    blockingReasons.push("尺寸/重量未确认");
    warnings.push("请补充尺寸/重量，避免脚本编造大小、容量或便携性。");
  }
  if (
    product.verified_selling_points.length === 0 ||
    product.verified_selling_points.some((item) => item.includes("待确认") || item.includes("未确认"))
  ) {
    blockingReasons.push("已验证卖点未确认");
    warnings.push("请补充已验证卖点，否则付费生成前无法确认脚本事实边界。");
  }
  return {
    readyForPaidGeneration: blockingReasons.length === 0,
    blockingReasons,
    warnings
  };
}

function summarizeProductListQuality(product: ReturnType<typeof parseProductFacts>): ProductListQuality {
  const missingFields = productListMissingFields(product);
  const verifiedFacts = productListVerifiedFacts(product);
  const warnings: string[] = [];
  if (missingFields.includes("材质")) {
    warnings.push("请补充材质，避免脚本描述商品手感或面料时编造。");
  }
  if (missingFields.includes("尺寸/重量")) {
    warnings.push("请补充尺寸/重量，避免生成脚本时编造大小、容量或便携性。");
  }
  if (missingFields.includes("已验证卖点")) {
    warnings.push("请补充已验证卖点，否则脚本只能保守描述商品。");
  }
  if (missingFields.includes("参考图")) {
    warnings.push("请上传真实参考图，视频生成时才有商品外观约束。");
  }
  const score = Math.max(0, Math.round(100 - missingFields.length * 16.5));
  return {
    ready: missingFields.length === 0,
    score,
    summary: productListQualitySummary(missingFields.length),
    missingFields,
    verifiedFacts,
    warnings
  };
}

function productListMissingFields(product: ReturnType<typeof parseProductFacts>): string[] {
  const fields: string[] = [];
  if (!product.title_ja.trim() || product.title_ja === "未命名商品") fields.push("标题");
  if (!product.category.trim() || product.category === "未分类") fields.push("分类");
  if (product.materials.length === 0 || product.materials.some((item) => item.includes("未确认"))) fields.push("材质");
  if (!product.dimensions.trim() || product.dimensions.includes("未确认")) fields.push("尺寸/重量");
  if (
    product.verified_selling_points.length === 0 ||
    product.verified_selling_points.some((item) => item.includes("待确认") || item.includes("未确认"))
  ) {
    fields.push("已验证卖点");
  }
  if (product.usage_scenes.length === 0) fields.push("使用场景");
  if (product.reference_images.length === 0 || product.reference_images.every((item) => item === "reference.jpg")) fields.push("参考图");
  return fields;
}

function productListVerifiedFacts(product: ReturnType<typeof parseProductFacts>): string[] {
  const facts: string[] = [];
  if (product.title_ja.trim() && product.title_ja !== "未命名商品") facts.push("标题");
  if (product.category.trim() && product.category !== "未分类") facts.push("分类");
  if (product.materials.length > 0 && product.materials.every((item) => !item.includes("未确认"))) facts.push("材质");
  if (product.dimensions.trim() && !product.dimensions.includes("未确认")) facts.push("尺寸/重量");
  if (
    product.verified_selling_points.length > 0 &&
    product.verified_selling_points.every((item) => !item.includes("待确认") && !item.includes("未确认"))
  ) {
    facts.push("已验证卖点");
  }
  if (product.usage_scenes.length > 0) facts.push("使用场景");
  if (product.reference_images.length > 0 && product.reference_images.some((item) => item !== "reference.jpg")) facts.push("参考图");
  return facts;
}

function productListQualitySummary(missingCount: number): string {
  if (missingCount === 0) {
    return "商品资料完整，可进入视频预检。";
  }
  return `缺少 ${missingCount} 项关键信息。`;
}

async function summarizeTestCredit(
  outputsDir: string,
  input: {
    testCreditBalanceCny: number;
    estimatedCostCny: number;
  }
) {
  const usedEstimatedCostCny = await sumPaidEstimatedCostCny(outputsDir);
  const availableEstimatedCostCny = Math.max(0, Math.round((input.testCreditBalanceCny - usedEstimatedCostCny) * 100) / 100);
  return {
    testCreditBalanceCny: input.testCreditBalanceCny,
    usedEstimatedCostCny,
    availableEstimatedCostCny,
    estimatedCostCny: input.estimatedCostCny,
    enoughCredit: input.testCreditBalanceCny <= 0 || input.estimatedCostCny <= availableEstimatedCostCny
  };
}

async function sumPaidEstimatedCostCny(outputsDir: string): Promise<number> {
  const files = await listNamedFiles(outputsDir, "make-video-report.json");
  let total = 0;
  for (const file of files) {
    const report = JSON.parse(await readFile(file, "utf8")) as Partial<MakeVideoReport>;
    if (report.provider === "mock") {
      continue;
    }
    total += Number(report.billing?.estimatedCostCny ?? 0);
  }
  return Math.round(total * 100) / 100;
}

function estimateVideoTokens(durationSeconds: number): { low: number; expected: number; high: number } {
  const expected = Math.round((80770 / 8) * durationSeconds);
  return {
    low: roundToThousand(expected * 0.75),
    expected: roundToTen(expected),
    high: roundToThousand(expected * 1.35)
  };
}

function estimateCny(tokens: number, tokenPriceCnyPerMillion: number): number {
  return Math.round((tokens / 1_000_000) * tokenPriceCnyPerMillion * 100) / 100;
}

function estimateVideoCostCny(durationSeconds: number): number {
  const tokenPriceCnyPerMillion = Number(process.env.SEEDANCE_TOKEN_PRICE_CNY_PER_MILLION ?? 37);
  return estimateCny(estimateVideoTokens(durationSeconds).expected, tokenPriceCnyPerMillion);
}

function roundToThousand(value: number): number {
  return Math.round(value / 1000) * 1000;
}

function roundToTen(value: number): number {
  return Math.round(value / 10) * 10;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "run";
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function userFacingErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return "文本模型返回的商品资料格式不完整，请再点一次 AI 整理或补充商品资料后重试。";
  }
  return error instanceof Error ? error.message : String(error);
}

function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`
    }
  });
}

async function readConsoleIndex(consoleDistDir: string): Promise<string> {
  try {
    return await readFile(join(consoleDistDir, "index.html"), "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return readStatic("console.html");
    }
    throw error;
  }
}

async function readStatic(fileName: string): Promise<string> {
  return readFile(join(import.meta.dirname, "static", fileName), "utf8");
}

async function staticResponse(fileName: string): Promise<Response> {
  const safeName = sanitizePathSegment(fileName);
  const content = await readStatic(safeName);
  const type = safeName.endsWith(".css")
    ? "text/css; charset=utf-8"
    : safeName.endsWith(".js")
      ? "text/javascript; charset=utf-8"
      : "text/plain; charset=utf-8";
  return new Response(content, {
    headers: { "content-type": type }
  });
}

async function consoleAssetResponse(
  pathname: string,
  options: {
    consoleDistDir: string;
    head: boolean;
  }
): Promise<Response> {
  const assetPath = resolveWithin(options.consoleDistDir, `.${pathname}`);
  const content = options.head ? undefined : await readFile(assetPath);
  return new Response(content, {
    headers: { "content-type": assetContentType(assetPath) }
  });
}

function assetContentType(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === ".js" || extension === ".mjs") {
    return "text/javascript; charset=utf-8";
  }
  if (extension === ".css") {
    return "text/css; charset=utf-8";
  }
  if (extension === ".svg") {
    return "image/svg+xml";
  }
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  return "application/octet-stream";
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sanitizeLines(lines?: string[]): string[] | undefined {
  const cleaned = (lines ?? []).map((line) => line.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}

async function mediaResponse(
  path: string | null,
  options: {
    rootDir: string;
    head: boolean;
  }
): Promise<Response> {
  if (!path) {
    return jsonResponse({ error: "Missing media path" }, 400);
  }
  const filePath = resolveWithin(options.rootDir, path);
  const contentType = mediaContentType(filePath);
  return new Response(options.head ? undefined : await readFile(filePath), {
    headers: { "content-type": contentType }
  });
}

function mediaContentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".mp4":
      return "video/mp4";
    case ".json":
      return "application/json; charset=utf-8";
    case ".gz":
    case ".tgz":
      return "application/gzip";
    case ".ass":
      return "text/plain; charset=utf-8";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

async function nodeRequestToFetch(request: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  return new Request(`http://localhost${request.url ?? "/"}`, {
    method: request.method,
    headers: request.headers as HeadersInit,
    body
  });
}

async function writeNodeResponse(response: ServerResponse, fetchResponse: Response): Promise<void> {
  response.writeHead(fetchResponse.status, Object.fromEntries(fetchResponse.headers.entries()));
  response.end(Buffer.from(await fetchResponse.arrayBuffer()));
}
