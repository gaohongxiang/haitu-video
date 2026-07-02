import { join } from "node:path";

import { runMakeVideoPipeline } from "../pipeline/makeVideoPipeline.js";
import { FileAuditLog } from "./auditLog.js";
import { BetterAuthConsoleAuthStore } from "./auth/betterAuthStore.js";
import { BillingPolicyStore } from "./billingPolicyStore.js";
import type { ConsoleAuthStore } from "./consoleAuth.js";
import { createReferenceImageUrlResolver, publicBaseUrlFromEnv } from "./consoleAssetService.js";
import { SqliteConsoleSettingsStore, type ConsoleSettingsStore } from "./consoleSettings.js";
import { LocalVideoJobQueue, type LocalVideoJobQueueOptions } from "./consoleVideoJobQueue.js";
import {
  createConfiguredMakeVideoPipeline,
  createModelConfigStore
} from "./consoleWorkspaceRuntime.js";
import type { DatabaseHandle } from "./db/client.js";
import {
  closeDatabase,
  createConsoleDatabaseHandle,
  startVideoRetentionCleanup
} from "./consoleLifecycleService.js";
import type { ModelConfigStore } from "./modelConfigStore.js";
import { ModelPricingCatalogStore } from "./modelPricingCatalogStore.js";
import type { ModelPricingCatalogContext } from "./modelPricingCatalogContext.js";
import { ModelServicePreferenceStore } from "./modelServicePreferenceStore.js";
import { PublicAssetTokenStore } from "./publicAssetTokenStore.js";
import { FileReviewStore } from "./reviewStore.js";
import {
  DEFAULT_WORKSPACE_ID,
  getStorageRoots,
  getWorkspacePaths,
  resolveDataDir
} from "./storagePaths.js";

export interface ConsoleServerRuntimeOptions {
  rootDir?: string;
  dataDir?: string;
  fixturesDir?: string;
  outputsDir?: string;
  fetchImpl?: typeof fetch;
  runMakeVideoPipeline?: LocalVideoJobQueueOptions["runMakeVideoPipeline"];
  autoStartSavedJobs?: boolean;
  now?: () => Date;
}

export interface ConsoleServerRuntime {
  rootDir: string;
  dataDir: string;
  outputsDir: string;
  reviewStore: FileReviewStore;
  settingsStore: ConsoleSettingsStore;
  publicAssetTokenStore: PublicAssetTokenStore;
  publicBaseUrl?: string;
  databaseHandle: DatabaseHandle;
  defaultModelConfigStore: ModelConfigStore;
  auditLog: FileAuditLog;
  authStore: ConsoleAuthStore;
  videoJobQueue: LocalVideoJobQueue;
  workspaceVideoJobQueues: Map<string, LocalVideoJobQueue>;
  close(): void;
}

export function createConsoleServerRuntime(options: ConsoleServerRuntimeOptions = {}): ConsoleServerRuntime {
  const rootDir = options.rootDir ?? process.cwd();
  const dataDir = resolveDataDir({
    rootDir,
    dataDir: options.dataDir,
    env: process.env
  });
  const storageRoots = getStorageRoots(dataDir);
  const workspacePaths = getWorkspacePaths(dataDir, DEFAULT_WORKSPACE_ID);
  const outputsDir = workspacePaths.jobsDir;
  const reviewStore = new FileReviewStore(join(workspacePaths.settingsDir, "review-state.json"));
  const publicAssetTokenStore = new PublicAssetTokenStore({
    rootDir: dataDir,
    now: options.now
  });
  const publicBaseUrl = publicBaseUrlFromEnv();
  const databaseHandle = createConsoleDatabaseHandle(dataDir);
  const settingsStore = new SqliteConsoleSettingsStore({
    handle: databaseHandle,
    now: options.now
  });
  settingsStore.initialize();
  const defaultModelConfigStore = createModelConfigStore({
    databaseHandle,
    workspaceId: DEFAULT_WORKSPACE_ID
  });
  const defaultModelServicePreferenceStore = new ModelServicePreferenceStore({
    handle: databaseHandle,
    workspaceId: DEFAULT_WORKSPACE_ID,
    now: options.now
  });
  const billingPolicyStore = new BillingPolicyStore({
    handle: databaseHandle,
    now: options.now
  });
  const modelPricingCatalogStore = new ModelPricingCatalogStore({
    handle: databaseHandle,
    now: options.now
  });
  const getModelPricingCatalogContext = (): ModelPricingCatalogContext => {
    const active = modelPricingCatalogStore.getActiveCatalog();
    return {
      catalog: active.catalog,
      version: active.version,
      source: active.source
    };
  };
  const auditLog = new FileAuditLog(join(storageRoots.systemDir, "audit-log.jsonl"));
  const authStore = new BetterAuthConsoleAuthStore({
    handle: databaseHandle,
    dataDir,
    env: process.env
  });
  const runConfiguredMakeVideoPipeline = createConfiguredMakeVideoPipeline({
    modelConfigStore: defaultModelConfigStore,
    platformModelConfigStore: defaultModelConfigStore,
    modelServicePreferenceStore: defaultModelServicePreferenceStore,
    billingPolicyStore,
    modelPricingCatalog: getModelPricingCatalogContext().catalog,
    getModelPricingCatalogContext,
    runMakeVideoPipeline: options.runMakeVideoPipeline ?? runMakeVideoPipeline
  });
  const defaultReferenceImageUrlResolver = createReferenceImageUrlResolver({
    dataDir,
    workspaceId: DEFAULT_WORKSPACE_ID,
    publicBaseUrl,
    publicAssetTokenStore,
    fetchImpl: options.fetchImpl
  });
  const videoJobQueue = new LocalVideoJobQueue({
    rootDir,
    outputsDir,
    workspaceId: DEFAULT_WORKSPACE_ID,
    settingsStore,
    fetchImpl: options.fetchImpl,
    runMakeVideoPipeline: runConfiguredMakeVideoPipeline,
    referenceImageUrlResolver: defaultReferenceImageUrlResolver,
    databaseHandle,
    billingPolicyStore,
    modelPricingCatalog: getModelPricingCatalogContext().catalog,
    getModelPricingCatalogContext
  });
  const workspaceVideoJobQueues = new Map<string, LocalVideoJobQueue>([
    [DEFAULT_WORKSPACE_ID, videoJobQueue]
  ]);
  const videoRetentionTimer = startVideoRetentionCleanup({
    dataDir,
    databaseHandle,
    auditLog
  });
  if (options.autoStartSavedJobs !== false) {
    void videoJobQueue.startSavedJobs();
  }

  return {
    rootDir,
    dataDir,
    outputsDir,
    reviewStore,
    settingsStore,
    publicAssetTokenStore,
    publicBaseUrl,
    databaseHandle,
    defaultModelConfigStore,
    auditLog,
    authStore,
    videoJobQueue,
    workspaceVideoJobQueues,
    close() {
      clearInterval(videoRetentionTimer);
      closeDatabase(databaseHandle);
    }
  };
}
