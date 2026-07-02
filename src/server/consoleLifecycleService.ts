import { closeDatabase, openDatabase, type DatabaseHandle } from "./db/client.js";
import { resolveDatabaseSecretKey } from "./db/crypto.js";
import { ensureDefaultWorkspace, runMigrations } from "./db/migrate.js";
import type { FileAuditLog } from "./auditLog.js";
import { cleanupExpiredVideos } from "./videoRetention.js";

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
  return rows.map((row) => row.id);
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
