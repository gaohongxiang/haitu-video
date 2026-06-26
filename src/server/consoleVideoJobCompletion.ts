import type { MakeVideoReport } from "../pipeline/makeVideoPipeline.js";
import type { DatabaseHandle } from "./db/client.js";
import type { VideoJobRecord } from "./consoleVideoJobTypes.js";
import {
  readHashtagsFromRawManifest
} from "./consoleVideoJobRecord.js";
import {
  completedVideoJobPatch
} from "./consoleVideoJobStatePatch.js";
import {
  captureVideoJobWalletCharge
} from "./consoleVideoJobPersistence.js";

export async function completeVideoJob(input: {
  record: VideoJobRecord;
  report: MakeVideoReport;
  completedAt: string;
  mediaUrlForPath: (path: string) => string;
  databaseHandle?: DatabaseHandle;
  workspaceId?: string;
  now?: () => Date;
}): Promise<Partial<VideoJobRecord>> {
  const hashtags = await readHashtagsFromRawManifest(input.report.raw.manifestPath);
  const patch = completedVideoJobPatch({
    record: input.record,
    report: input.report,
    hashtags,
    completedAt: input.completedAt,
    mediaUrlForPath: input.mediaUrlForPath
  });
  captureVideoJobWalletCharge({
    databaseHandle: input.databaseHandle,
    workspaceId: input.workspaceId,
    now: input.now,
    record: {
      ...input.record,
      estimatedCostCny: input.report.billing?.estimatedCostCny
    }
  });
  return patch;
}
