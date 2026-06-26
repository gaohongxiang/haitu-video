import { spawn } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { basename, join } from "node:path";

export interface LocalBackupItem {
  fileName: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
  url: string;
}

export interface LocalBackupLedger {
  summary: {
    totalBackups: number;
    totalBytes: number;
    latestCreatedAt?: string;
  };
  backups: LocalBackupItem[];
}

export async function createLocalBackup(input: {
  dataDir: string;
}): Promise<LocalBackupItem> {
  const backupsDir = join(input.dataDir, "backups");
  await mkdir(backupsDir, { recursive: true });
  const fileName = backupFileName();
  const backupPath = join(backupsDir, fileName);
  await runCommand("tar", [
    "-czf",
    backupPath,
    "--exclude",
    "backups",
    "--exclude",
    "workspaces/*/jobs/*/raw",
    "--exclude",
    "workspaces/*/jobs/*/final",
    "-C",
    input.dataDir,
    "."
  ]);
  return toLocalBackupItem(backupPath, await stat(backupPath));
}

export async function listLocalBackups(input: {
  dataDir: string;
}): Promise<LocalBackupLedger> {
  const backupsDir = join(input.dataDir, "backups");
  const backups: LocalBackupItem[] = [];
  let entries: Dirent[];
  try {
    entries = await readdir(backupsDir, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".tar.gz")) {
      continue;
    }
    const path = join(backupsDir, entry.name);
    try {
      backups.push(toLocalBackupItem(path, await stat(path)));
    } catch {
      // Ignore files that disappear during a scan.
    }
  }
  backups.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.fileName.localeCompare(left.fileName));
  return {
    summary: {
      totalBackups: backups.length,
      totalBytes: backups.reduce((sum, backup) => sum + backup.sizeBytes, 0),
      latestCreatedAt: backups[0]?.createdAt
    },
    backups
  };
}

function toLocalBackupItem(path: string, fileStat: { size: number; mtime: Date }): LocalBackupItem {
  return {
    fileName: basename(path),
    path,
    sizeBytes: fileStat.size,
    createdAt: fileStat.mtime.toISOString(),
    url: mediaUrl(path)
  };
}

function backupFileName(now = new Date()): string {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");
  return `haitu-backup-${year}${month}${day}-${hour}${minute}${second}.tar.gz`;
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

function mediaUrl(path: string): string {
  return `/media?path=${encodeURIComponent(path)}`;
}
