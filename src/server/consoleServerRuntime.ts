import { join } from "node:path";

import { runMakeVideoPipeline } from "../pipeline/makeVideoPipeline.js";
import { FileAuditLog } from "./auditLog.js";
import { BetterAuthConsoleAuthStore } from "./auth/betterAuthStore.js";
import type { ConsoleAuthStore } from "./consoleAuth.js";
import { createReferenceImageUrlResolver, publicBaseUrlFromEnv } from "./consoleAssetService.js";
import { FileConsoleSettingsStore } from "./consoleSettings.js";
import { LocalVideoJobQueue, type LocalVideoJobQueueOptions } from "./consoleVideoJobQueue.js";
import {
  createConfiguredMakeVideoPipeline,
  createModelConfigStore
} from "./consoleWorkspaceRuntime.js";
import type { DatabaseHandle } from "./db/client.js";
import {
  closeDatabase,
  createConsoleDatabaseHandle,
  ensurePlatformBundlesForAllWorkspaces,
  startVideoRetentionCleanup
} from "./consoleLifecycleService.js";
import { ModelBundleStore } from "./modelBundleStore.js";
import type { ModelConfigStore } from "./modelConfigStore.js";
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
  settingsStore: FileConsoleSettingsStore;
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
  const settingsStore = new FileConsoleSettingsStore(join(storageRoots.systemDir, "console-settings.json"));
  const publicAssetTokenStore = new PublicAssetTokenStore({
    rootDir: dataDir,
    now: options.now
  });
  const publicBaseUrl = publicBaseUrlFromEnv();
  const databaseHandle = createConsoleDatabaseHandle(dataDir);
  const defaultModelConfigStore = createModelConfigStore({
    databaseHandle,
    workspaceId: DEFAULT_WORKSPACE_ID
  });
  const defaultModelBundleStore = new ModelBundleStore({
    handle: databaseHandle,
    workspaceId: DEFAULT_WORKSPACE_ID,
    now: options.now
  });
  const defaultModelServicePreferenceStore = new ModelServicePreferenceStore({
    handle: databaseHandle,
    workspaceId: DEFAULT_WORKSPACE_ID,
    now: options.now
  });
  const auditLog = new FileAuditLog(join(storageRoots.systemDir, "audit-log.jsonl"));
  const authStore = new BetterAuthConsoleAuthStore({
    handle: databaseHandle,
    dataDir,
    env: process.env
  });
  const runConfiguredMakeVideoPipeline = createConfiguredMakeVideoPipeline({
    modelConfigStore: defaultModelConfigStore,
    platformModelConfigStore: defaultModelConfigStore,
    modelBundleStore: defaultModelBundleStore,
    modelServicePreferenceStore: defaultModelServicePreferenceStore,
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
    databaseHandle
  });
  const workspaceVideoJobQueues = new Map<string, LocalVideoJobQueue>([
    [DEFAULT_WORKSPACE_ID, videoJobQueue]
  ]);
  void ensurePlatformBundlesForAllWorkspaces({
    databaseHandle,
    platformModelConfigStore: defaultModelConfigStore,
    now: options.now
  }).catch((error: unknown) => {
    console.warn("Failed to provision platform model bundles.", error);
  });
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
