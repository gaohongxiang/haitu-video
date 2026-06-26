import type { FileAuditLog } from "./auditLog.js";
import { csvResponse, jsonResponse } from "./consoleHttpService.js";
import type { ConsoleRequestContext } from "./consoleWorkspaceRuntime.js";
import { createPublishPackage, listPublishPackages } from "./publishPackage.js";
import { FileReviewStore, type ManualReviewInput, type SelectFinalInput } from "./reviewStore.js";
import {
  assertManualReviewInput,
  assertReviewableJob,
  assertSelectableFinalJob,
  buildInternalValidationCsv,
  buildPublishPackagesCsv,
  createPublishPackagesBatch,
  topUpInternalValidationJobs,
  withPublishPackageFileUrl,
  withPublishPackageFileUrls
} from "./reviewPublishingService.js";

interface PublishPackageRequest {
  productSku: string;
  jobId?: string;
}

export async function handleReviewPublishingRoutes(input: {
  request: Request;
  url: URL;
  requestContext: ConsoleRequestContext;
  rootDir: string;
  outputsDir: string;
  reviewStore: FileReviewStore;
  auditLog: FileAuditLog;
}): Promise<Response | undefined> {
  const {
    request,
    url,
    requestContext,
    rootDir,
    outputsDir,
    reviewStore,
    auditLog
  } = input;

  if (request.method === "GET" && url.pathname === "/api/internal-validation/export.csv") {
    return csvResponse(
      await buildInternalValidationCsv({
        rootDir,
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
        rootDir,
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
  return undefined;
}
