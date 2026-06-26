import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

import type { MakeVideoReport } from "../pipeline/makeVideoPipeline.js";

export { buildQcSummary } from "./videoQcSummaryService.js";

export interface ReportFilters {
  productSku?: string;
  provider?: string;
  status?: string;
  finalOnly?: boolean;
}

export async function listReports(outputsDir: string, filters: ReportFilters = {}): Promise<
  Array<{
    path: string;
    productSku?: string;
    provider?: string;
    status?: string;
    durationSeconds?: number;
    rawManifestPath?: string;
    rawOutputPath?: string;
    finalOutputPath?: string;
    finalVideoUrl?: string;
    billing?: MakeVideoReport["billing"];
    totalCost?: MakeVideoReport["totalCost"];
    taskId?: string;
    reusedRawManifest?: boolean;
  }>
> {
  const files = await listNamedFiles(outputsDir, "make-video-report.json");
  const reports = [];
  for (const file of files) {
    const report = JSON.parse(await readFile(file, "utf8")) as Partial<MakeVideoReport>;
    const item = {
      path: file,
      productSku: report.productSku,
      provider: report.provider,
      status: report.status,
      durationSeconds: report.durationSeconds,
      rawManifestPath: report.raw?.manifestPath,
      rawOutputPath: report.raw?.outputPath,
      finalOutputPath: report.final?.outputPath,
      finalVideoUrl: report.final?.outputPath
        ? mediaUrl(report.final.outputPath)
        : undefined,
      billing: report.billing,
      totalCost: report.totalCost,
      taskId: report.raw?.taskId,
      reusedRawManifest: report.reusedRawManifest
    };
    if (matchesReportFilters(item, filters)) {
      reports.push(item);
    }
  }
  return reports.sort((left, right) => left.path.localeCompare(right.path));
}

function matchesReportFilters(
  report: {
    productSku?: string;
    provider?: string;
    status?: string;
    finalVideoUrl?: string;
  },
  filters: ReportFilters
): boolean {
  if (filters.productSku && report.productSku !== filters.productSku) {
    return false;
  }
  if (filters.provider && report.provider !== filters.provider) {
    return false;
  }
  if (filters.status && report.status !== filters.status) {
    return false;
  }
  if (filters.finalOnly && !report.finalVideoUrl) {
    return false;
  }
  return true;
}

function mediaUrl(path: string): string {
  return `/media?path=${encodeURIComponent(path)}`;
}

async function listNamedFiles(root: string, fileName: string): Promise<string[]> {
  const found: string[] = [];
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
        found.push(path);
      }
    }
  }
  await walk(root);
  return found.sort();
}
