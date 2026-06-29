import { createTextModelProvider } from "./modelProviderService.js";
import { jsonResponse } from "./consoleHttpService.js";
import type { ConsoleRequestContext } from "./consoleWorkspaceRuntime.js";
import {
  buildAiImportedProductPreview,
  buildImportedProductPreview,
  buildProductFileImportPreview,
  commitProductFileImportRows,
  importProductFromText,
  importProductsBatchFromText,
  type ImportProductFileCommitRequest,
  type ImportProductFilePreviewRequest,
  type ImportProductPreviewRequest,
  type ImportProductsBatchRequest
} from "./productImportService.js";

export async function handleProductImportRoutes(input: {
  request: Request;
  url: URL;
  requestContext: ConsoleRequestContext;
  rootDir: string;
  fetchImpl?: typeof fetch;
}): Promise<Response | undefined> {
  const {
    request,
    url,
    requestContext,
    rootDir,
    fetchImpl
  } = input;

  if (request.method === "POST" && url.pathname === "/api/products/import-preview") {
    return jsonResponse(buildImportedProductPreview((await request.json()) as ImportProductPreviewRequest));
  }
  if (request.method === "POST" && url.pathname === "/api/products/import-ai-preview") {
    return jsonResponse(await buildAiImportedProductPreview({
      walletStore: requestContext.walletStore,
      billingPolicyStore: requestContext.billingPolicyStore,
      modelPricingCatalog: requestContext.modelPricingCatalog,
      modelPricingCatalogVersion: requestContext.modelPricingCatalogVersion,
      createTextModelProvider: ({ textModelConfigId }) => createTextModelProvider({
        modelConfigStore: requestContext.modelConfigStore,
        platformModelConfigStore: requestContext.platformModelConfigStore,
        modelBundleStore: requestContext.modelBundleStore,
        modelServicePreferenceStore: requestContext.modelServicePreferenceStore,
        textModelConfigId,
        fetchImpl
      }),
      input: (await request.json()) as ImportProductPreviewRequest
    }));
  }
  if (request.method === "POST" && url.pathname === "/api/products/import") {
    return jsonResponse(
      await importProductFromText({
        fixturesDir: requestContext.fixturesDir,
        rootDir,
        workspaceId: requestContext.workspaceId,
        databaseHandle: requestContext.databaseHandle,
        fetchImpl,
        input: (await request.json()) as ImportProductPreviewRequest
      })
    );
  }
  if (request.method === "POST" && url.pathname === "/api/products/import-batch") {
    return jsonResponse(
      await importProductsBatchFromText({
        fixturesDir: requestContext.fixturesDir,
        rootDir,
        workspaceId: requestContext.workspaceId,
        databaseHandle: requestContext.databaseHandle,
        fetchImpl,
        input: (await request.json()) as ImportProductsBatchRequest
      })
    );
  }
  if (request.method === "POST" && url.pathname === "/api/products/import-file-preview") {
    return jsonResponse(
      await buildProductFileImportPreview({
        fixturesDir: requestContext.fixturesDir,
        input: (await request.json()) as ImportProductFilePreviewRequest
      })
    );
  }
  if (request.method === "POST" && url.pathname === "/api/products/import-file-commit") {
    return jsonResponse(
      await commitProductFileImportRows({
        fixturesDir: requestContext.fixturesDir,
        rootDir,
        workspaceId: requestContext.workspaceId,
        databaseHandle: requestContext.databaseHandle,
        fetchImpl,
        input: (await request.json()) as ImportProductFileCommitRequest
      })
    );
  }
  return undefined;
}
