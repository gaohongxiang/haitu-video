export type RefreshableVideoJobStatus = "queued" | "running" | "completed" | "failed" | "canceled" | string;

export interface RefreshableVideoJob {
  id: string;
  status: RefreshableVideoJobStatus;
  productSku?: string;
}

export interface CompletedVideoJobTransitions {
  completedJobIds: string[];
  affectedProductSkus: string[];
}

const activeVideoJobStatuses = new Set(["queued", "running"]);
const terminalVideoJobStatuses = new Set(["completed", "failed", "canceled"]);

export function isActiveVideoJobStatus(status?: RefreshableVideoJobStatus): boolean {
  return activeVideoJobStatuses.has(status ?? "");
}

export function isTerminalVideoJobStatus(status?: RefreshableVideoJobStatus): boolean {
  return terminalVideoJobStatuses.has(status ?? "");
}

export function detectCompletedVideoJobTransitions(
  previousJobs: RefreshableVideoJob[],
  nextJobs: RefreshableVideoJob[]
): CompletedVideoJobTransitions {
  const previousById = new Map(previousJobs.map((job) => [job.id, job]));
  const completedJobIds: string[] = [];
  const affectedProductSkus = new Set<string>();

  for (const nextJob of nextJobs) {
    const previousJob = previousById.get(nextJob.id);
    if (!previousJob) continue;
    if (!isActiveVideoJobStatus(previousJob.status)) continue;
    if (!isTerminalVideoJobStatus(nextJob.status)) continue;

    completedJobIds.push(nextJob.id);
    if (nextJob.productSku) {
      affectedProductSkus.add(nextJob.productSku);
    }
  }

  return {
    completedJobIds,
    affectedProductSkus: Array.from(affectedProductSkus).sort()
  };
}
