import type { FileAuditLog } from "./auditLog.js";
import type { ConsoleAuthStore } from "./consoleAuth.js";
import type { FileConsoleSettingsStore } from "./consoleSettings.js";
import type { LocalVideoJobQueueOptions } from "./consoleVideoJobQueue.js";
import type { ConsoleRequestContext } from "./consoleWorkspaceRuntime.js";
import type { FileReviewStore } from "./reviewStore.js";
import {
  handleAssetReportRoutes
} from "./assetReportRoutes.js";
import {
  handleModelConfigRoutes
} from "./modelConfigRoutes.js";
import {
  handleProductRoutes
} from "./productRoutes.js";
import {
  handleReviewPublishingRoutes
} from "./reviewPublishingRoutes.js";
import {
  handleSettingsTemplateRoutes
} from "./settingsTemplateRoutes.js";
import {
  handleVideoRoutes
} from "./videoRoutes.js";
import {
  handleWalletModelRoutes
} from "./walletModelRoutes.js";

export async function handleConsoleApiRoutes(input: {
  request: Request;
  url: URL;
  requestContext: ConsoleRequestContext;
  rootDir: string;
  dataDir: string;
  outputsDir: string;
  settingsStore: FileConsoleSettingsStore;
  reviewStore: FileReviewStore;
  auditLog: FileAuditLog;
  authStore: ConsoleAuthStore;
  fetchImpl?: typeof fetch;
  runMakeVideoPipeline?: LocalVideoJobQueueOptions["runMakeVideoPipeline"];
}): Promise<Response | undefined> {
  const {
    request,
    url,
    requestContext,
    rootDir,
    dataDir,
    outputsDir,
    settingsStore,
    reviewStore,
    auditLog,
    authStore,
    fetchImpl,
    runMakeVideoPipeline
  } = input;

  const productRouteResponse = await handleProductRoutes({
    request,
    url,
    requestContext,
    rootDir,
    dataDir,
    settingsStore,
    auditLog,
    fetchImpl
  });
  if (productRouteResponse) {
    return productRouteResponse;
  }

  const walletModelRouteResponse = await handleWalletModelRoutes({
    request,
    url,
    requestContext,
    settingsStore,
    auditLog,
    fetchImpl
  });
  if (walletModelRouteResponse) {
    return walletModelRouteResponse;
  }

  const assetReportRouteResponse = await handleAssetReportRoutes({
    request,
    url,
    requestContext,
    rootDir: dataDir,
    outputsDir,
    reviewStore,
    auditLog
  });
  if (assetReportRouteResponse) {
    return assetReportRouteResponse;
  }

  const reviewPublishingRouteResponse = await handleReviewPublishingRoutes({
    request,
    url,
    requestContext,
    rootDir: dataDir,
    outputsDir,
    reviewStore,
    auditLog
  });
  if (reviewPublishingRouteResponse) {
    return reviewPublishingRouteResponse;
  }

  const modelConfigRouteResponse = await handleModelConfigRoutes({
    request,
    url,
    requestContext,
    authStore,
    auditLog,
    fetchImpl
  });
  if (modelConfigRouteResponse) {
    return modelConfigRouteResponse;
  }

  const settingsTemplateRouteResponse = await handleSettingsTemplateRoutes({
    request,
    url,
    settingsStore
  });
  if (settingsTemplateRouteResponse) {
    return settingsTemplateRouteResponse;
  }

  const videoRouteResponse = await handleVideoRoutes({
    request,
    url,
    requestContext,
    rootDir,
    dataDir,
    settingsStore,
    reviewStore,
    auditLog,
    fetchImpl,
    runMakeVideoPipeline
  });
  if (videoRouteResponse) {
    return videoRouteResponse;
  }

  return undefined;
}
