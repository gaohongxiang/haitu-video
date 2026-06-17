import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { DEFAULT_WORKSPACE_ID, getWorkspacePaths } from "./storagePaths.js";
import type { DatabaseHandle } from "./db/client.js";

export interface VideoRetentionResult {
  scannedJobs: number;
  expiredJobs: number;
  deletedFiles: number;
  failedDeletes: number;
}

export async function cleanupExpiredVideos(input: {
  dataDir: string;
  workspaceId?: string;
  databaseHandle?: DatabaseHandle;
  now?: Date;
  onDeleteError?: (error: unknown, filePath: string) => void | Promise<void>;
}): Promise<VideoRetentionResult> {
  const workspace = getWorkspacePaths(input.dataDir, input.workspaceId ?? DEFAULT_WORKSPACE_ID);
  const now = input.now ?? new Date();
  const result: VideoRetentionResult = {
    scannedJobs: 0,
    expiredJobs: 0,
    deletedFiles: 0,
    failedDeletes: 0
  };
  let entries;
  try {
    entries = await readdir(workspace.jobsDir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const jobDir = join(workspace.jobsDir, entry.name);
    const jobFile = join(jobDir, "job.json");
    const job = await readJobFile(jobFile);
    if (!job) {
      continue;
    }
    result.scannedJobs += 1;
    const expiresAt = Date.parse(String(job.expiresAt ?? ""));
    if (!Number.isFinite(expiresAt) || expiresAt > now.getTime()) {
      continue;
    }
    result.expiredJobs += 1;
    const deleted = await deleteVideoFiles(jobDir, input.onDeleteError);
    result.deletedFiles += deleted.deletedFiles;
    result.failedDeletes += deleted.failedDeletes;
    markDatabaseAssetsDeleted(input.databaseHandle, {
      workspaceId: workspace.workspaceId,
      jobId: String(job.id ?? entry.name),
      deletedAt: now.toISOString()
    });
    await writeFile(jobFile, JSON.stringify({
      ...job,
      expired: true,
      mediaDeletedAt: now.toISOString()
    }, null, 2), "utf8");
  }
  return result;
}

function markDatabaseAssetsDeleted(
  handle: DatabaseHandle | undefined,
  input: {
    workspaceId: string;
    jobId: string;
    deletedAt: string;
  }
): void {
  if (!handle) {
    return;
  }
  handle.sqlite.prepare(`
    UPDATE video_assets
    SET status = 'deleted',
        deleted_at = @deletedAt
    WHERE workspace_id = @workspaceId AND job_id = @jobId AND deleted_at IS NULL
  `).run(input);
  handle.sqlite.prepare(`
    UPDATE video_jobs
    SET status = 'expired'
    WHERE workspace_id = @workspaceId AND id = @jobId
  `).run(input);
}

async function readJobFile(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

async function deleteVideoFiles(
  jobDir: string,
  onDeleteError?: (error: unknown, filePath: string) => void | Promise<void>
): Promise<{ deletedFiles: number; failedDeletes: number }> {
  const targets = [
    ...(await listVideoFiles(join(jobDir, "raw"))),
    ...(await listVideoFiles(join(jobDir, "final")))
  ];
  let deletedFiles = 0;
  let failedDeletes = 0;
  for (const target of targets) {
    try {
      await rm(target, { force: true });
      deletedFiles += 1;
    } catch (error) {
      failedDeletes += 1;
      await onDeleteError?.(error, target);
    }
  }
  return { deletedFiles, failedDeletes };
}

async function listVideoFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && isVideoFile(path) && await isRegularFile(path)) {
        files.push(path);
      }
    }
  }
  await walk(root);
  return files;
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function isVideoFile(path: string): boolean {
  return [".mp4", ".mov", ".m4v", ".webm"].includes(extname(path).toLowerCase());
}
