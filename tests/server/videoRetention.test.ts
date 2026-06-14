import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupExpiredVideos } from "../../src/server/videoRetention.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("video retention", () => {
  it("deletes expired video files while preserving job metadata and reports", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-video-retention-"));
    tempDirs.push(root);
    const dataDir = join(root, "data");
    const jobDir = join(dataDir, "workspaces", "default", "jobs", "job-old");
    const rawVideo = join(jobDir, "raw", "source.mp4");
    const rawManifest = join(jobDir, "raw", "manifest.json");
    const finalVideo = join(jobDir, "final", "final.mp4");
    const subtitle = join(jobDir, "final", "final.ass");
    const reportFile = join(jobDir, "make-video-report.json");
    const jobFile = join(jobDir, "job.json");
    await mkdir(join(jobDir, "raw"), { recursive: true });
    await mkdir(join(jobDir, "final"), { recursive: true });
    await writeFile(rawVideo, Buffer.from("raw-video"));
    await writeFile(rawManifest, JSON.stringify({ type: "manifest" }), "utf8");
    await writeFile(finalVideo, Buffer.from("final-video"));
    await writeFile(subtitle, "subtitle", "utf8");
    await writeFile(reportFile, JSON.stringify({
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "TK-001",
      final: { outputPath: finalVideo },
      raw: { outputPath: rawVideo }
    }, null, 2), "utf8");
    await writeFile(jobFile, JSON.stringify({
      id: "job-old",
      workspaceId: "default",
      status: "completed",
      createdAt: "2026-06-07T09:00:00.000Z",
      updatedAt: "2026-06-07T09:00:00.000Z",
      expiresAt: "2026-06-08T09:00:00.000Z"
    }, null, 2), "utf8");

    const result = await cleanupExpiredVideos({
      dataDir,
      now: new Date("2026-06-08T09:00:01.000Z")
    });
    const updatedJob = JSON.parse(await readFile(jobFile, "utf8"));

    expect(result).toEqual({
      scannedJobs: 1,
      expiredJobs: 1,
      deletedFiles: 2,
      failedDeletes: 0
    });
    await expect(stat(rawVideo)).rejects.toThrow();
    await expect(stat(finalVideo)).rejects.toThrow();
    await expect(readFile(rawManifest, "utf8")).resolves.toContain("manifest");
    await expect(readFile(subtitle, "utf8")).resolves.toBe("subtitle");
    await expect(readFile(reportFile, "utf8")).resolves.toContain("haitu_make_video_report");
    expect(updatedJob).toEqual(expect.objectContaining({
      expired: true,
      mediaDeletedAt: "2026-06-08T09:00:01.000Z"
    }));
  });

  it("keeps non-expired video files", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-video-retention-fresh-"));
    tempDirs.push(root);
    const dataDir = join(root, "data");
    const jobDir = join(dataDir, "workspaces", "default", "jobs", "job-fresh");
    const finalVideo = join(jobDir, "final", "final.mp4");
    await mkdir(join(jobDir, "final"), { recursive: true });
    await writeFile(finalVideo, Buffer.from("fresh-video"));
    await writeFile(join(jobDir, "job.json"), JSON.stringify({
      id: "job-fresh",
      workspaceId: "default",
      status: "completed",
      createdAt: "2026-06-07T09:00:00.000Z",
      updatedAt: "2026-06-07T09:00:00.000Z",
      expiresAt: "2026-06-08T09:00:00.000Z"
    }, null, 2), "utf8");

    const result = await cleanupExpiredVideos({
      dataDir,
      now: new Date("2026-06-08T08:59:59.000Z")
    });

    expect(result.expiredJobs).toBe(0);
    await expect(readFile(finalVideo, "utf8")).resolves.toBe("fresh-video");
  });
});
