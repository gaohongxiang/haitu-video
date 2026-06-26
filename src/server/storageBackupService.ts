import { readdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import {
  DEFAULT_WORKSPACE_ID,
  getStorageRoots,
  getWorkspacePaths
} from "./storagePaths.js";

export {
  createLocalBackup,
  listLocalBackups,
  type LocalBackupItem,
  type LocalBackupLedger
} from "./localBackupArchiveService.js";

interface StorageBackupScope {
  id: "products" | "settings" | "system" | "job-metadata";
  label: string;
  path: string;
  mustBackup: true;
  fileCount: number;
  totalBytes: number;
  videoFiles: number;
  manifestFiles: number;
  jsonFiles: number;
  productFiles: number;
  referenceImages: number;
}

export interface StorageBackupReport {
  summary: {
    totalFiles: number;
    totalBytes: number;
    videoFiles: number;
    manifestFiles: number;
    productFiles: number;
    referenceImages: number;
  };
  scopes: StorageBackupScope[];
  backupCommands: string[];
  notes: string[];
}

export async function buildStorageBackupReport(input: {
  dataDir: string;
}): Promise<StorageBackupReport> {
  const workspace = getWorkspacePaths(input.dataDir, DEFAULT_WORKSPACE_ID);
  const roots = getStorageRoots(input.dataDir);
  const scopes: StorageBackupScope[] = [
    await summarizeStorageScope({
      id: "products",
      label: "商品资料与参考图",
      path: workspace.productsDir
    }),
    await summarizeStorageScope({
      id: "settings",
      label: "默认工作区设置",
      path: workspace.settingsDir
    }),
    await summarizeStorageScope({
      id: "system",
      label: "系统设置、会话和审计日志",
      path: roots.systemDir
    }),
    await summarizeStorageScope({
      id: "job-metadata",
      label: "任务元数据",
      path: workspace.jobsDir
    })
  ];
  return {
    summary: {
      totalFiles: scopes.reduce((sum, scope) => sum + scope.fileCount, 0),
      totalBytes: scopes.reduce((sum, scope) => sum + scope.totalBytes, 0),
      videoFiles: scopes.reduce((sum, scope) => sum + scope.videoFiles, 0),
      manifestFiles: scopes.reduce((sum, scope) => sum + scope.manifestFiles, 0),
      productFiles: scopes.find((scope) => scope.id === "products")?.productFiles ?? 0,
      referenceImages: scopes.find((scope) => scope.id === "products")?.referenceImages ?? 0
    },
    scopes,
    backupCommands: [
      [
        `tar -czf ${join(input.dataDir, "backups", "haitu-backup-$(date +%Y%m%d).tar.gz")}`,
        "--exclude='backups'",
        "--exclude='workspaces/*/jobs/*/raw'",
        "--exclude='workspaces/*/jobs/*/final'",
        "-C",
        input.dataDir,
        "."
      ].join(" ")
    ],
    notes: [
      "备份只处理 HAITU_DATA_DIR，不包含代码目录。",
      "默认排除 jobs/*/raw 和 jobs/*/final，视频只保留 24 小时，用户应尽快下载。",
      "如需排查，可以保留 job.json 和 make-video-report.json 等任务元数据。"
    ]
  };
}

async function summarizeStorageScope(input: {
  id: StorageBackupScope["id"];
  label: string;
  path: string;
}): Promise<StorageBackupScope> {
  const files = await listStorageFiles(input.path, {
    excludeJobMediaDirs: input.id === "job-metadata"
  });
  return {
    id: input.id,
    label: input.label,
    path: input.path,
    mustBackup: true,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0),
    videoFiles: files.filter((file) => file.extension === ".mp4").length,
    manifestFiles: files.filter((file) => basename(file.path) === "manifest.json" || basename(file.path) === "final-manifest.json").length,
    jsonFiles: files.filter((file) => file.extension === ".json").length,
    productFiles: input.id === "products" ? files.filter((file) => basename(file.path) === "product.json").length : 0,
    referenceImages: input.id === "products" ? files.filter((file) => [".jpg", ".jpeg", ".png", ".webp"].includes(file.extension)).length : 0
  };
}

async function listStorageFiles(
  root: string,
  options: { excludeJobMediaDirs?: boolean } = {}
): Promise<Array<{ path: string; sizeBytes: number; extension: string }>> {
  const files: Array<{ path: string; sizeBytes: number; extension: string }> = [];
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
        if (options.excludeJobMediaDirs && (entry.name === "raw" || entry.name === "final")) {
          continue;
        }
        await walk(path);
      } else if (entry.isFile()) {
        try {
          const fileStat = await stat(path);
          files.push({
            path,
            sizeBytes: fileStat.size,
            extension: extname(path).toLowerCase()
          });
        } catch {
          // Ignore files that disappear during a scan.
        }
      }
    }
  }
  await walk(root);
  return files;
}
