import type { FileAuditLog } from "./auditLog.js";
import type { ConsoleAuthStore } from "./consoleAuth.js";
import { queryValue } from "./consoleAssetService.js";
import { jsonResponse } from "./consoleHttpService.js";
import type { ConsoleRequestContext } from "./consoleWorkspaceRuntime.js";
import { buildJobLedger, deleteJobLedgerEntry } from "./jobLedger.js";
import type { FileReviewStore } from "./reviewStore.js";
import {
  buildStorageBackupReport,
  createLocalBackup,
  deleteVideoAsset,
  listLocalBackups,
  listVideoAssets,
  type DeleteVideoAssetRequest
} from "./videoAssetStorageService.js";
import {
  buildQcSummary,
  listReports
} from "./videoReportService.js";

export async function handleAssetReportRoutes(input: {
  request: Request;
  url: URL;
  requestContext: ConsoleRequestContext;
  rootDir: string;
  outputsDir: string;
  reviewStore: FileReviewStore;
  auditLog: FileAuditLog;
  authStore: ConsoleAuthStore;
}): Promise<Response | undefined> {
  const {
    request,
    url,
    requestContext,
    rootDir,
    outputsDir,
    reviewStore,
    auditLog,
    authStore
  } = input;

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
    return jsonResponse(await buildJobLedger(requestContext.outputsDir, {
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
  if (request.method === "GET" && url.pathname === "/api/qc-summary") {
    return jsonResponse(await buildQcSummary(requestContext.outputsDir));
  }
  if (request.method === "GET" && url.pathname === "/api/video-assets") {
    return jsonResponse(await listVideoAssets({
      rootDir: requestContext.workspacePaths.dir,
      outputsDir: requestContext.outputsDir
    }));
  }
  if (request.method === "GET" && url.pathname === "/api/storage-backup") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    return jsonResponse(await buildStorageBackupReport({
      dataDir: rootDir
    }));
  }
  if (request.method === "GET" && url.pathname === "/api/backups") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    return jsonResponse(await listLocalBackups({
      dataDir: rootDir
    }));
  }
  if (request.method === "POST" && url.pathname === "/api/backups") {
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    const backup = await createLocalBackup({
      dataDir: rootDir
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
    const adminResponse = await authStore.requireAdmin(request);
    if (adminResponse) {
      return adminResponse;
    }
    return jsonResponse(await auditLog.list({
      limit: positiveIntegerFromQuery(url, "limit", 50, 1, 200)
    }));
  }
  if (request.method === "DELETE" && url.pathname === "/api/video-assets") {
    const result = await deleteVideoAsset({
      rootDir: requestContext.workspacePaths.dir,
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
  return undefined;
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
