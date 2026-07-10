import { closeDatabase, openDatabase, type DatabaseHandle } from "./db/client.js";
import { resolveDatabaseSecretKey } from "./db/crypto.js";
import { ensureDefaultWorkspace, runMigrations } from "./db/migrate.js";
import type { FileAuditLog } from "./auditLog.js";
import { syncExternalTrafficMetrics } from "./trafficExternalSync.js";
import { cleanupExpiredVideos } from "./videoRetention.js";
import { PLATFORM_WORKSPACE_ID } from "./storagePaths.js";

export { closeDatabase };

export function createConsoleDatabaseHandle(dataDir: string): DatabaseHandle {
  resolveDatabaseSecretKey(process.env);
  const handle = openDatabase({ dataDir, env: process.env });
  runMigrations(handle);
  ensureDefaultWorkspace(handle);
  return handle;
}

export function listWorkspaceIds(databaseHandle: DatabaseHandle): string[] {
  const rows = databaseHandle.sqlite.prepare(`
    SELECT id
    FROM workspaces
    ORDER BY id ASC
  `).all() as Array<{ id: string }>;
  return rows.map((row) => row.id).filter((workspaceId) => workspaceId !== PLATFORM_WORKSPACE_ID);
}

export function startVideoRetentionCleanup(input: {
  dataDir: string;
  databaseHandle: DatabaseHandle;
  auditLog: FileAuditLog;
}): NodeJS.Timeout {
  const runVideoRetentionCleanup = async () => {
    for (const workspaceId of listWorkspaceIds(input.databaseHandle)) {
      await cleanupExpiredVideos({
        dataDir: input.dataDir,
        workspaceId,
        databaseHandle: input.databaseHandle,
        onDeleteError: async (error, filePath) => {
          await input.auditLog.append({
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
  const handleRetentionCleanupError = (error: unknown) => {
    void input.auditLog.append({
      action: "video_retention.cleanup_failed",
      metadata: {
        error: error instanceof Error ? error.message : String(error)
      }
    });
  };

  void runVideoRetentionCleanup().catch(handleRetentionCleanupError);
  const videoRetentionTimer = setInterval(() => {
    void runVideoRetentionCleanup().catch(handleRetentionCleanupError);
  }, 30 * 60 * 1000);
  videoRetentionTimer.unref?.();
  return videoRetentionTimer;
}

export function startTrafficExternalSync(input: {
  databaseHandle: DatabaseHandle;
  auditLog: FileAuditLog;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
}): NodeJS.Timeout | undefined {
  const env = input.env ?? process.env;
  if (!isTrafficAnalyticsEnabled(env)) {
    return undefined;
  }

  const runTrafficExternalSync = async () => {
    const result = await syncExternalTrafficMetrics({
      handle: input.databaseHandle,
      env,
      fetchImpl: input.fetchImpl,
      now: input.now?.() ?? new Date()
    });
    await input.auditLog.append({
      action: "traffic.external_sync",
      metadata: {
        status: result.status,
        checkedAt: result.checkedAt,
        providers: result.providers.map((provider) => ({
          id: provider.id,
          configured: provider.configured,
          status: provider.status,
          rowsSynced: provider.rowsSynced,
          error: provider.error
        }))
      }
    });
  };
  const handleTrafficExternalSyncError = (error: unknown) => {
    void input.auditLog.append({
      action: "traffic.external_sync_failed",
      metadata: {
        error: error instanceof Error ? error.message : String(error)
      }
    });
  };

  void runTrafficExternalSync().catch(handleTrafficExternalSyncError);
  const trafficExternalSyncTimer = setInterval(() => {
    void runTrafficExternalSync().catch(handleTrafficExternalSyncError);
  }, 24 * 60 * 60 * 1000);
  trafficExternalSyncTimer.unref?.();
  return trafficExternalSyncTimer;
}

function isTrafficAnalyticsEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.HAITU_TRAFFIC_ANALYTICS_ENABLED === "1"
    || env.HAITU_TRAFFIC_ANALYTICS_ENABLED?.toLowerCase() === "true";
}
