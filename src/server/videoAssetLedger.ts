import { readFile, readdir, stat, unlink } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

import type { MakeVideoReport } from "../pipeline/makeVideoPipeline.js";
import { listPublishPackages } from "./publishPackage.js";

export interface DeleteVideoAssetRequest {
  path?: string;
  confirm?: boolean;
}

type VideoAssetKind = "raw" | "final" | "publish";

interface VideoAssetCandidate {
  kind: VideoAssetKind;
  path?: string;
  productSku?: string;
  jobId: string;
  provider?: string;
  taskId?: string;
  durationSeconds?: number;
  source: "report" | "publish-package";
  sourcePath: string;
}

interface VideoAssetItem extends Omit<VideoAssetCandidate, "path"> {
  path: string;
  exists: boolean;
  sizeBytes: number;
  url?: string;
}

export interface VideoAssetLedger {
  summary: {
    totalAssets: number;
    totalBytes: number;
    rawAssets: number;
    finalAssets: number;
    publishAssets: number;
    missingAssets: number;
  };
  assets: VideoAssetItem[];
}

export async function deleteVideoAsset(input: {
  rootDir: string;
  input: DeleteVideoAssetRequest;
}): Promise<{
  deleted: true;
  path: string;
  sizeBytes: number;
}> {
  if (input.input.confirm !== true) {
    throw new Error("Deleting a video asset requires confirm: true.");
  }
  if (typeof input.input.path !== "string" || !input.input.path.trim()) {
    throw new Error("Deleting a video asset requires a video path.");
  }
  if (!isVideoPath(input.input.path)) {
    throw new Error("Deleting a video asset requires an .mp4 file.");
  }
  const videoPath = resolveWithin(input.rootDir, input.input.path);
  const fileStat = await stat(videoPath);
  if (!fileStat.isFile()) {
    throw new Error(`Video asset is not a file: ${videoPath}`);
  }
  await unlink(videoPath);
  return {
    deleted: true,
    path: videoPath,
    sizeBytes: fileStat.size
  };
}

export async function listVideoAssets(input: {
  rootDir: string;
  outputsDir: string;
}): Promise<VideoAssetLedger> {
  const candidates = [
    ...(await videoAssetCandidatesFromReports(input.outputsDir)),
    ...(await videoAssetCandidatesFromPublishPackages(input.outputsDir))
  ];
  const assets = [];
  for (const candidate of candidates) {
    const asset = await toVideoAssetItem(candidate, input.rootDir);
    if (asset) {
      assets.push(asset);
    }
  }
  assets.sort(
    (left, right) =>
      kindRank(left.kind) - kindRank(right.kind) ||
      left.productSku?.localeCompare(right.productSku ?? "") ||
      left.jobId.localeCompare(right.jobId) ||
      left.path.localeCompare(right.path)
  );
  return {
    summary: summarizeVideoAssets(assets),
    assets
  };
}

async function videoAssetCandidatesFromReports(outputsDir: string): Promise<VideoAssetCandidate[]> {
  const files = await listNamedFiles(outputsDir, "make-video-report.json");
  const candidates: VideoAssetCandidate[] = [];
  for (const file of files) {
    const report = JSON.parse(await readFile(file, "utf8")) as Partial<MakeVideoReport>;
    const jobId = basename(dirname(file));
    candidates.push({
      kind: "final",
      path: report.final?.outputPath,
      productSku: report.productSku,
      jobId,
      provider: report.provider,
      taskId: report.raw?.taskId,
      durationSeconds: report.durationSeconds,
      source: "report",
      sourcePath: file
    });
    candidates.push({
      kind: "raw",
      path: report.raw?.outputPath,
      productSku: report.productSku,
      jobId,
      provider: report.provider,
      taskId: report.raw?.taskId,
      durationSeconds: report.durationSeconds,
      source: "report",
      sourcePath: file
    });
  }
  return candidates;
}

async function videoAssetCandidatesFromPublishPackages(outputsDir: string): Promise<VideoAssetCandidate[]> {
  const ledger = await listPublishPackages(outputsDir);
  return ledger.packages.map((item) => ({
    kind: "publish",
    path: item.files.videoPath,
    productSku: item.productSku,
    jobId: item.jobId,
    provider: item.provider,
    taskId: item.taskId,
    durationSeconds: item.durationSeconds,
    source: "publish-package",
    sourcePath: item.manifestPath
  }));
}

async function toVideoAssetItem(
  candidate: VideoAssetCandidate,
  rootDir: string
): Promise<VideoAssetItem | undefined> {
  if (!candidate.path || !isVideoPath(candidate.path)) {
    return undefined;
  }
  const resolvedPath = resolve(rootDir, candidate.path);
  if (!isPathInsideRoot(rootDir, resolvedPath)) {
    return undefined;
  }
  let sizeBytes = 0;
  let exists = true;
  try {
    const fileStat = await stat(resolvedPath);
    sizeBytes = fileStat.isFile() ? fileStat.size : 0;
    exists = fileStat.isFile();
  } catch {
    exists = false;
  }
  return {
    kind: candidate.kind,
    path: resolvedPath,
    productSku: candidate.productSku,
    jobId: candidate.jobId,
    provider: candidate.provider,
    taskId: candidate.taskId,
    durationSeconds: candidate.durationSeconds,
    source: candidate.source,
    sourcePath: candidate.sourcePath,
    exists,
    sizeBytes,
    url: exists ? mediaUrl(resolvedPath) : undefined
  };
}

function summarizeVideoAssets(assets: VideoAssetItem[]): VideoAssetLedger["summary"] {
  return {
    totalAssets: assets.length,
    totalBytes: assets.reduce((sum, asset) => sum + asset.sizeBytes, 0),
    rawAssets: assets.filter((asset) => asset.kind === "raw").length,
    finalAssets: assets.filter((asset) => asset.kind === "final").length,
    publishAssets: assets.filter((asset) => asset.kind === "publish").length,
    missingAssets: assets.filter((asset) => !asset.exists).length
  };
}

function kindRank(kind: VideoAssetKind): number {
  if (kind === "final") return 0;
  if (kind === "raw") return 1;
  return 2;
}

function isVideoPath(path: string): boolean {
  return extname(path).toLowerCase() === ".mp4";
}

function mediaUrl(path: string): string {
  return `/media?path=${encodeURIComponent(path)}`;
}

function isPathInsideRoot(rootDir: string, path: string): boolean {
  const relativePath = path.startsWith(rootDir) ? path.slice(rootDir.length) : "";
  return path === rootDir || Boolean(relativePath && !relativePath.startsWith(".."));
}

function resolveWithin(rootDir: string, path: string): string {
  const resolved = resolve(rootDir, path);
  if (!isPathInsideRoot(rootDir, resolved)) {
    throw new Error(`Path is outside storage root: ${path}`);
  }
  return resolved;
}

async function listNamedFiles(root: string, fileName: string): Promise<string[]> {
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
      } else if (entry.isFile() && entry.name === fileName) {
        files.push(path);
      }
    }
  }
  await walk(root);
  return files.sort();
}
