import type { VideoJobRecord } from "./consoleVideoJobTypes.js";

export interface VideoJobRestartPlan {
  failRunningJobs: Array<{
    record: VideoJobRecord;
    patch: Partial<VideoJobRecord>;
  }>;
  resumeQueuedJobIds: string[];
}

export function createVideoJobRestartPlan(input: {
  records: VideoJobRecord[];
  completedAt: string;
}): VideoJobRestartPlan {
  return {
    failRunningJobs: input.records
      .filter((record) => record.status === "running")
      .map((record) => ({
        record,
        patch: {
          status: "failed",
          error: "Job was interrupted by a server restart before completion.",
          completedAt: input.completedAt
        }
      })),
    resumeQueuedJobIds: input.records
      .filter((record) => record.status === "queued")
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
      .map((record) => record.id)
  };
}
