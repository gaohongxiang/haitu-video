import {
  buildAiStoryboardDraft,
  generateProductReferenceImages,
  type GenerateProductReferenceImagesRequest,
  type StoryboardDraftRequest
} from "./productAiGenerationService.js";
import { handleProductImportRoutes } from "./productImportRoutes.js";
import {
  deleteProductReferenceImage,
  importProductReferenceAssets,
  reorderProductReferenceImages,
  uploadProductReferenceImages,
  type ReorderProductReferenceImagesRequest,
  type UploadProductReferenceImagesRequest
} from "./productReferenceImageService.js";
import {
  deleteProductBySku,
  getProductBySku,
  listProducts,
  saveProductFactPackage
} from "./productService.js";
import {
  createProductStoryboard,
  deleteProductStoryboard,
  listProductStoryboards,
  type StoryboardHistoryRequest
} from "./productStoryboardService.js";
import {
  enqueueProductVideoJobsBySku,
  type ProductVideoJobRequest
} from "./videoJobService.js";
import type { FileAuditLog } from "./auditLog.js";
import type { ConsoleSettingsStore } from "./consoleSettings.js";
import { jsonResponse } from "./consoleHttpService.js";
import type { ConsoleRequestContext } from "./consoleWorkspaceRuntime.js";

export async function handleProductRoutes(input: {
  request: Request;
  url: URL;
  requestContext: ConsoleRequestContext;
  rootDir: string;
  dataDir: string;
  settingsStore: ConsoleSettingsStore;
  auditLog: FileAuditLog;
  fetchImpl?: typeof fetch;
}): Promise<Response | undefined> {
  const {
    request,
    url,
    requestContext,
    dataDir,
    settingsStore,
    auditLog,
    fetchImpl
  } = input;

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
        fetchImpl,
        input: await request.json()
      })
    });
  }
  const productImportRouteResponse = await handleProductImportRoutes({
    request,
    url,
    requestContext,
    rootDir: dataDir,
    fetchImpl
  });
  if (productImportRouteResponse) {
    return productImportRouteResponse;
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
        modelConfigStore: requestContext.modelConfigStore,
        platformModelConfigStore: requestContext.platformModelConfigStore,
        modelBundleStore: requestContext.modelBundleStore,
        modelServicePreferenceStore: requestContext.modelServicePreferenceStore,
        walletStore: requestContext.walletStore,
        videoJobQueue: requestContext.videoJobQueue,
        billingPolicyStore: requestContext.billingPolicyStore,
        modelPricingCatalog: requestContext.modelPricingCatalog,
        modelPricingCatalogVersion: requestContext.modelPricingCatalogVersion
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
      modelConfigStore: requestContext.modelConfigStore,
      platformModelConfigStore: requestContext.platformModelConfigStore,
      modelBundleStore: requestContext.modelBundleStore,
      modelServicePreferenceStore: requestContext.modelServicePreferenceStore,
      walletStore: requestContext.walletStore,
      billingPolicyStore: requestContext.billingPolicyStore,
      modelPricingCatalog: requestContext.modelPricingCatalog,
      modelPricingCatalogVersion: requestContext.modelPricingCatalogVersion,
      fetchImpl,
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
  const reorderProductAssetsMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/reference-images\/order$/);
  if (request.method === "PUT" && reorderProductAssetsMatch) {
    return jsonResponse(
      await reorderProductReferenceImages({
        fixturesDir: requestContext.fixturesDir,
        rootDir: dataDir,
        sku: decodeURIComponent(reorderProductAssetsMatch[1] ?? ""),
        input: (await request.json()) as ReorderProductReferenceImagesRequest
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
        modelConfigStore: requestContext.modelConfigStore,
        platformModelConfigStore: requestContext.platformModelConfigStore,
        modelBundleStore: requestContext.modelBundleStore,
        modelServicePreferenceStore: requestContext.modelServicePreferenceStore,
        walletStore: requestContext.walletStore,
        billingPolicyStore: requestContext.billingPolicyStore,
        modelPricingCatalog: requestContext.modelPricingCatalog,
        modelPricingCatalogVersion: requestContext.modelPricingCatalogVersion,
        fetchImpl,
        sku: decodeURIComponent(generateProductAssetsMatch[1] ?? ""),
        input: (await request.json()) as GenerateProductReferenceImagesRequest
      })
    );
  }
  return undefined;
}
