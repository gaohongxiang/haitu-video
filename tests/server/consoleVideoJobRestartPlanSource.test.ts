import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const queuePath = "src/server/consoleVideoJobQueue.ts";
const restartPlanPath = "src/server/consoleVideoJobRestartPlan.ts";

describe("console video job restart plan source boundaries", () => {
  it("keeps saved-job restart planning out of the local job queue class", async () => {
    const queueSource = await readFile(queuePath, "utf8");
    const startSavedJobsSource = queueSource.slice(
      queueSource.indexOf("async startSavedJobs("),
      queueSource.indexOf("async waitForIdle(")
    );

    await expect(access(restartPlanPath)).resolves.toBeUndefined();
    expect(queueSource).toContain('from "./consoleVideoJobRestartPlan.js"');
    expect(queueSource).toContain("createVideoJobRestartPlan(");
    expect(startSavedJobsSource).not.toContain("record.status === \"queued\"");
    expect(startSavedJobsSource).not.toContain("record.status === \"running\"");
    expect(startSavedJobsSource).not.toContain("Date.parse(left.createdAt)");
    expect(startSavedJobsSource).not.toContain("Job was interrupted by a server restart before completion.");
  });

  it("centralizes queued resume order and interrupted running-job patches", async () => {
    const restartPlanSource = await readFile(restartPlanPath, "utf8");

    expect(restartPlanSource).toContain("export function createVideoJobRestartPlan(");
    expect(restartPlanSource).toContain("record.status === \"queued\"");
    expect(restartPlanSource).toContain("record.status === \"running\"");
    expect(restartPlanSource).toContain("Date.parse(left.createdAt)");
    expect(restartPlanSource).toContain("Job was interrupted by a server restart before completion.");
    expect(restartPlanSource).toContain("failRunningJobs");
    expect(restartPlanSource).toContain("resumeQueuedJobIds");
  });
});
