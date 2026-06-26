import { join } from "node:path";

import type { LocalVideoJobQueueOptions } from "./consoleVideoJobQueue.js";
import { isPublicConsoleRoute } from "./consoleAuth.js";
import {
  createConsoleRequestContext
} from "./consoleWorkspaceRuntime.js";
import {
  jsonResponse,
  userFacingErrorMessage
} from "./consoleHttpService.js";
import {
  handleAuthAdminRoutes
} from "./authAdminRoutes.js";
import {
  consoleErrorResponse
} from "./consoleErrorResponse.js";
import {
  handleConsoleAssetRoutes,
  handleHealthRoutes,
  handleMediaRoutes,
  handlePublicAssetRoutes
} from "./consolePublicRoutes.js";
import {
  handleConsoleApiRoutes
} from "./consoleApiRoutes.js";
import {
  handlePaymentWebhookRoutes
} from "./paymentWebhookRoutes.js";
import type { ConsoleServerRuntime } from "./consoleServerRuntime.js";

export function createConsoleRequestHandler(input: {
  runtime: ConsoleServerRuntime;
  consoleDistDir?: string;
  fetchImpl?: typeof fetch;
  runMakeVideoPipeline?: LocalVideoJobQueueOptions["runMakeVideoPipeline"];
  now?: () => Date;
}): (request: Request) => Promise<Response> {
  const { runtime } = input;
  const consoleDistDir = input.consoleDistDir ?? join(runtime.rootDir, "dist", "console");

  return async function handleConsoleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      const healthRouteResponse = await handleHealthRoutes({
        request,
        url
      });
      if (healthRouteResponse) {
        return healthRouteResponse;
      }
      const authAdminRouteResponse = await handleAuthAdminRoutes({
        request,
        url,
        authStore: runtime.authStore,
        settingsStore: runtime.settingsStore,
        databaseHandle: runtime.databaseHandle,
        auditLog: runtime.auditLog,
        now: input.now
      });
      if (authAdminRouteResponse) {
        return authAdminRouteResponse;
      }
      const publicAssetRouteResponse = await handlePublicAssetRoutes({
        request,
        url,
        publicAssetTokenStore: runtime.publicAssetTokenStore
      });
      if (publicAssetRouteResponse) {
        return publicAssetRouteResponse;
      }
      const paymentWebhookRouteResponse = await handlePaymentWebhookRoutes({
        request,
        url,
        databaseHandle: runtime.databaseHandle,
        now: input.now
      });
      if (paymentWebhookRouteResponse) {
        return paymentWebhookRouteResponse;
      }
      if (!isPublicConsoleRoute(request)) {
        const authResponse = await runtime.authStore.requireAuth(request);
        if (authResponse) {
          return authResponse;
        }
      }
      const consoleAssetRouteResponse = await handleConsoleAssetRoutes({
        request,
        url,
        consoleDistDir
      });
      if (consoleAssetRouteResponse) {
        return consoleAssetRouteResponse;
      }
      const requestContext = await createConsoleRequestContext({
        request,
        dataDir: runtime.dataDir,
        rootDir: runtime.rootDir,
        databaseHandle: runtime.databaseHandle,
        authStore: runtime.authStore,
        defaultModelConfigStore: runtime.defaultModelConfigStore,
        defaultVideoJobQueue: runtime.videoJobQueue,
        workspaceVideoJobQueues: runtime.workspaceVideoJobQueues,
        settingsStore: runtime.settingsStore,
        fetchImpl: input.fetchImpl,
        runMakeVideoPipeline: input.runMakeVideoPipeline,
        publicBaseUrl: runtime.publicBaseUrl,
        publicAssetTokenStore: runtime.publicAssetTokenStore,
        platformModelConfigStore: runtime.defaultModelConfigStore,
        now: input.now
      });
      const apiRouteResponse = await handleConsoleApiRoutes({
        request,
        url,
        requestContext,
        rootDir: runtime.rootDir,
        dataDir: runtime.dataDir,
        outputsDir: runtime.outputsDir,
        settingsStore: runtime.settingsStore,
        reviewStore: runtime.reviewStore,
        auditLog: runtime.auditLog,
        authStore: runtime.authStore,
        fetchImpl: input.fetchImpl,
        runMakeVideoPipeline: input.runMakeVideoPipeline
      });
      if (apiRouteResponse) {
        return apiRouteResponse;
      }
      const mediaRouteResponse = await handleMediaRoutes({
        request,
        url,
        rootDir: runtime.dataDir
      });
      if (mediaRouteResponse) {
        return mediaRouteResponse;
      }
      return jsonResponse({ error: "Not found" }, 404);
    } catch (error) {
      const message = userFacingErrorMessage(error);
      return consoleErrorResponse(error, message);
    }
  };
}
