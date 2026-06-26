import { readFile } from "node:fs/promises";

import { normalizeJapaneseHashtags } from "../core/japaneseHashtags.js";
import type { MakeVideoReport } from "../pipeline/makeVideoPipeline.js";
import type { VideoJobRecord } from "./consoleVideoJobTypes.js";

export async function hydrateVideoJobRecord(input: {
  record: VideoJobRecord;
  mediaUrlForPath: (path: string) => string;
}): Promise<VideoJobRecord> {
  const { record } = input;
  if (!record.reportPath) {
    return record;
  }
  if (record.reportUrl && (record.finalVideoUrl || record.rawOutputUrl)) {
    return {
      ...record,
      canRecoverDownload: record.canRecoverDownload ?? canRecoverVideoJobDownload(record)
    };
  }
  try {
    const report = JSON.parse(await readFile(record.reportPath, "utf8")) as Partial<MakeVideoReport>;
    return {
      ...record,
      productSku: record.productSku ?? report.productSku,
      reportUrl: record.reportUrl ?? input.mediaUrlForPath(record.reportPath),
      rawOutputPath: record.rawOutputPath ?? report.raw?.outputPath,
      rawOutputUrl: record.rawOutputUrl ?? (report.raw?.outputPath ? input.mediaUrlForPath(report.raw.outputPath) : undefined),
      finalOutputPath: record.finalOutputPath ?? report.final?.outputPath,
      finalVideoUrl: record.finalVideoUrl ?? (report.final?.outputPath ? input.mediaUrlForPath(report.final.outputPath) : undefined),
      finalManifestPath: record.finalManifestPath ?? report.final?.manifestPath,
      finalManifestUrl: record.finalManifestUrl ?? (report.final?.manifestPath ? input.mediaUrlForPath(report.final.manifestPath) : undefined),
      subtitlePath: record.subtitlePath ?? report.final?.subtitlePath,
      subtitleUrl: record.subtitleUrl ?? (report.final?.subtitlePath ? input.mediaUrlForPath(report.final.subtitlePath) : undefined),
      hashtags: record.hashtags ?? await readHashtagsFromRawManifest(report.raw?.manifestPath),
      totalTokens: record.totalTokens ?? report.billing?.totalTokens ?? report.usage?.totalTokens,
      estimatedCostCny: record.estimatedCostCny ?? report.billing?.estimatedCostCny,
      providerTaskId: record.providerTaskId ?? report.raw?.taskId,
      recoverableRawManifestPath: record.recoverableRawManifestPath ?? report.raw?.manifestPath,
      canRecoverDownload: record.canRecoverDownload ?? canRecoverVideoJobDownload({
        ...record,
        recoverableRawManifestPath: record.recoverableRawManifestPath ?? report.raw?.manifestPath
      })
    };
  } catch {
    return {
      ...record,
      reportUrl: record.reportUrl ?? input.mediaUrlForPath(record.reportPath),
      canRecoverDownload: record.canRecoverDownload ?? canRecoverVideoJobDownload(record)
    };
  }
}

export function canRecoverVideoJobDownload(
  record: Pick<VideoJobRecord, "status" | "provider" | "recoverableRawManifestPath" | "providerTaskId" | "errorDetails">
): boolean {
  return record.status === "failed" &&
    record.provider === "volcengine-seedance" &&
    record.errorDetails?.providerPhase === "download-output" &&
    Boolean(record.recoverableRawManifestPath && record.providerTaskId);
}

export async function readHashtagsFromRawManifest(manifestPath: string | undefined): Promise<string[] | undefined> {
  if (!manifestPath) {
    return undefined;
  }
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { hashtags?: unknown };
    const hashtags = normalizeJapaneseHashtags(manifest.hashtags);
    return hashtags.length > 0 ? hashtags : undefined;
  } catch {
    return undefined;
  }
}
