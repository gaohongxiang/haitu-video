import { runMakeVideoPipeline } from "../pipeline/makeVideoPipeline.js";
import type { ModelPricingEntry } from "../modelPricing/officialModelPricingCatalog.js";
import type { ReferenceImageUrlResolver } from "../providers/types.js";
import { BillingPolicyStore } from "./billingPolicyStore.js";
import type { ConsoleAuthStore } from "./consoleAuth.js";
import { createReferenceImageUrlResolver } from "./consoleAssetService.js";
import type { ConsoleSettingsStore } from "./consoleSettings.js";
import { LocalVideoJobQueue, type LocalVideoJobQueueOptions } from "./consoleVideoJobQueue.js";
import type { DatabaseHandle } from "./db/client.js";
import { resolveDatabaseSecretKey } from "./db/crypto.js";
import { SqliteModelConfigStore } from "./db/sqliteModelConfigStore.js";
import type { ModelConfigStore } from "./modelConfigStore.js";
import { selectedVideoModelConfig } from "./modelConfigSelection.js";
import { ModelServicePreferenceStore } from "./modelServicePreferenceStore.js";
import { ModelPricingCatalogStore } from "./modelPricingCatalogStore.js";
import type { ModelPricingCatalogContext } from "./modelPricingCatalogContext.js";
import { PublicAssetTokenStore } from "./publicAssetTokenStore.js";
import { tokenPriceCnyPerMillionForVideoModel } from "./videoJobBilling.js";
import {
  DEFAULT_WORKSPACE_ID,
  getWorkspacePaths
} from "./storagePaths.js";
import { WalletStore } from "./walletStore.js";

export interface ConsoleRequestContext {
  workspaceId: string;
  databaseHandle: DatabaseHandle;
  workspacePaths: ReturnType<typeof getWorkspacePaths>;
  fixturesDir: string;
  outputsDir: string;
  modelConfigStore: ModelConfigStore;
  platformModelConfigStore: ModelConfigStore;
  modelServicePreferenceStore: ModelServicePreferenceStore;
  billingPolicyStore: BillingPolicyStore;
  modelPricingCatalog: readonly ModelPricingEntry[];
  modelPricingCatalogVersion: string;
  modelPricingCatalogContext: ModelPricingCatalogContext;
  walletStore: WalletStore;
  videoJobQueue: LocalVideoJobQueue;
  referenceImageUrlResolver?: ReferenceImageUrlResolver;
}

export async function createConsoleRequestContext(input: {
  request: Request;
  dataDir: string;
  rootDir: string;
  databaseHandle: DatabaseHandle;
  authStore: ConsoleAuthStore;
  defaultModelConfigStore: ModelConfigStore;
  defaultVideoJobQueue: LocalVideoJobQueue;
  workspaceVideoJobQueues: Map<string, LocalVideoJobQueue>;
  settingsStore: ConsoleSettingsStore;
  fetchImpl?: typeof fetch;
  runMakeVideoPipeline?: typeof runMakeVideoPipeline;
  publicBaseUrl?: string;
  publicAssetTokenStore: PublicAssetTokenStore;
  platformModelConfigStore: ModelConfigStore;
  now?: () => Date;
}): Promise<ConsoleRequestContext> {
  const resolved = await input.authStore.resolveCurrentWorkspace(input.request);
  const workspacePaths = getWorkspacePaths(input.dataDir, resolved.workspaceId);
  const modelConfigStore = resolved.workspaceId === DEFAULT_WORKSPACE_ID
    ? input.defaultModelConfigStore
    : createModelConfigStore({
      databaseHandle: input.databaseHandle,
      workspaceId: resolved.workspaceId
    });
  const referenceImageUrlResolver = createReferenceImageUrlResolver({
    dataDir: input.dataDir,
    workspaceId: resolved.workspaceId,
    publicBaseUrl: input.publicBaseUrl,
    publicAssetTokenStore: input.publicAssetTokenStore,
    fetchImpl: input.fetchImpl
  });
  const modelServicePreferenceStore = new ModelServicePreferenceStore({
    handle: input.databaseHandle,
    workspaceId: resolved.workspaceId,
    now: input.now
  });
  const billingPolicyStore = new BillingPolicyStore({
    handle: input.databaseHandle,
    now: input.now
  });
  const modelPricingCatalogStore = new ModelPricingCatalogStore({
    handle: input.databaseHandle,
    now: input.now
  });
  const getModelPricingCatalogContext = (): ModelPricingCatalogContext => {
    const active = modelPricingCatalogStore.getActiveCatalog();
    return {
      catalog: active.catalog,
      version: active.version,
      source: active.source
    };
  };
  const modelPricingCatalogContext = getModelPricingCatalogContext();
  const modelPricingCatalog = modelPricingCatalogContext.catalog;
  return {
    workspaceId: resolved.workspaceId,
    databaseHandle: input.databaseHandle,
    workspacePaths,
    fixturesDir: workspacePaths.productsDir,
    outputsDir: workspacePaths.jobsDir,
    modelConfigStore,
    platformModelConfigStore: input.platformModelConfigStore,
    modelServicePreferenceStore,
    billingPolicyStore,
    modelPricingCatalog,
    modelPricingCatalogVersion: modelPricingCatalogContext.version,
    modelPricingCatalogContext,
    walletStore: new WalletStore({
      handle: input.databaseHandle,
      workspaceId: resolved.workspaceId,
      now: input.now
    }),
    referenceImageUrlResolver,
    videoJobQueue: videoJobQueueForWorkspace({
      workspaceId: resolved.workspaceId,
      workspacePaths,
      modelConfigStore,
      platformModelConfigStore: input.platformModelConfigStore,
      defaultVideoJobQueue: input.defaultVideoJobQueue,
      workspaceVideoJobQueues: input.workspaceVideoJobQueues,
      rootDir: input.rootDir,
      settingsStore: input.settingsStore,
      modelServicePreferenceStore,
      billingPolicyStore,
      modelPricingCatalog,
      getModelPricingCatalogContext,
      fetchImpl: input.fetchImpl,
      runMakeVideoPipeline: input.runMakeVideoPipeline,
      referenceImageUrlResolver,
      databaseHandle: input.databaseHandle
    })
  };
}

function videoJobQueueForWorkspace(input: {
  workspaceId: string;
  workspacePaths: ReturnType<typeof getWorkspacePaths>;
  modelConfigStore: ModelConfigStore;
  platformModelConfigStore: ModelConfigStore;
  defaultVideoJobQueue: LocalVideoJobQueue;
  workspaceVideoJobQueues: Map<string, LocalVideoJobQueue>;
  rootDir: string;
  settingsStore: ConsoleSettingsStore;
  modelServicePreferenceStore: ModelServicePreferenceStore;
  billingPolicyStore: BillingPolicyStore;
  modelPricingCatalog: readonly ModelPricingEntry[];
  getModelPricingCatalogContext?: () => ModelPricingCatalogContext;
  fetchImpl?: typeof fetch;
  runMakeVideoPipeline?: typeof runMakeVideoPipeline;
  referenceImageUrlResolver?: ReferenceImageUrlResolver;
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
      modelConfigStore: input.modelConfigStore,
      platformModelConfigStore: input.platformModelConfigStore,
      modelServicePreferenceStore: input.modelServicePreferenceStore,
      billingPolicyStore: input.billingPolicyStore,
      modelPricingCatalog: input.modelPricingCatalog,
      getModelPricingCatalogContext: input.getModelPricingCatalogContext,
      runMakeVideoPipeline: input.runMakeVideoPipeline
    }),
    referenceImageUrlResolver: input.referenceImageUrlResolver,
    databaseHandle: input.databaseHandle,
    billingPolicyStore: input.billingPolicyStore,
    modelPricingCatalog: input.modelPricingCatalog,
    getModelPricingCatalogContext: input.getModelPricingCatalogContext
  });
  input.workspaceVideoJobQueues.set(input.workspaceId, queue);
  return queue;
}

export function createConfiguredMakeVideoPipeline(input: {
  modelConfigStore: ModelConfigStore;
  platformModelConfigStore?: ModelConfigStore;
  modelServicePreferenceStore?: ModelServicePreferenceStore;
  billingPolicyStore?: BillingPolicyStore;
  modelPricingCatalog?: readonly ModelPricingEntry[];
  getModelPricingCatalogContext?: () => ModelPricingCatalogContext;
  runMakeVideoPipeline?: typeof runMakeVideoPipeline;
}): LocalVideoJobQueueOptions["runMakeVideoPipeline"] {
  return async (pipelineInput) => {
    const config = await selectedVideoModelConfig({
      modelConfigStore: input.modelConfigStore,
      platformModelConfigStore: input.platformModelConfigStore,
      modelServicePreferenceStore: input.modelServicePreferenceStore,
      provider: pipelineInput.providerName,
      providerModelConfigId: pipelineInput.providerModelConfigId
    });
    const runPipeline = input.runMakeVideoPipeline ?? runMakeVideoPipeline;
    const modelPricingCatalogContext = input.getModelPricingCatalogContext?.();
    const modelPricingCatalog = modelPricingCatalogContext?.catalog ?? input.modelPricingCatalog;
    return runPipeline({
      ...pipelineInput,
      apiKey: config.apiKey,
      providerBaseUrl: config.baseUrl,
      providerModel: config.model,
      tokenPriceCnyPerMillion: tokenPriceCnyPerMillionForVideoModel(config.model, pipelineInput.resolution, modelPricingCatalog)
    });
  };
}

export function createModelConfigStore(input: {
  databaseHandle: DatabaseHandle;
  workspaceId: string;
}): ModelConfigStore {
  const store = new SqliteModelConfigStore({
    handle: input.databaseHandle,
    secretKey: resolveDatabaseSecretKey(process.env),
    workspaceId: input.workspaceId
  });
  return store;
}
