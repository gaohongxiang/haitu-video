import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_WORKSPACE_ID,
  getJobPaths,
  getProductPaths,
  getStorageRoots,
  getWorkspacePaths,
  resolveDataDir
} from "../../src/server/storagePaths.js";

describe("storage path resolution", () => {
  it("defaults runtime data to the project data directory", () => {
    const rootDir = "/tmp/haitu-project";

    expect(resolveDataDir({ rootDir, env: {} })).toBe(resolve(rootDir, "data"));
  });

  it("uses HAITU_DATA_DIR when it is configured", () => {
    expect(resolveDataDir({
      rootDir: "/tmp/haitu-project",
      env: { HAITU_DATA_DIR: "/var/lib/haitu-video" }
    })).toBe("/var/lib/haitu-video");
  });

  it("lets tests pass an explicit temporary data directory", () => {
    expect(resolveDataDir({
      rootDir: "/tmp/haitu-project",
      dataDir: "/tmp/haitu-test-data",
      env: { HAITU_DATA_DIR: "/var/lib/haitu-video" }
    })).toBe("/tmp/haitu-test-data");
  });

  it("returns service, workspace, and backup roots inside the data directory", () => {
    const dataDir = "/tmp/haitu-data";
    const roots = getStorageRoots(dataDir);
    const workspace = getWorkspacePaths(dataDir);

    expect(roots).toEqual({
      dataDir,
      systemDir: join(dataDir, "system"),
      workspacesDir: join(dataDir, "workspaces"),
      backupsDir: join(dataDir, "backups")
    });
    expect(workspace).toEqual({
      workspaceId: DEFAULT_WORKSPACE_ID,
      dir: join(dataDir, "workspaces", "default"),
      productsDir: join(dataDir, "workspaces", "default", "products"),
      jobsDir: join(dataDir, "workspaces", "default", "jobs"),
      settingsDir: join(dataDir, "workspaces", "default", "settings")
    });
  });

  it("returns product and job paths within the default workspace", () => {
    const dataDir = "/tmp/haitu-data";

    expect(getProductPaths(dataDir, DEFAULT_WORKSPACE_ID, "arm-cover-cool")).toEqual({
      dir: join(dataDir, "workspaces", "default", "products", "arm-cover-cool"),
      productFile: join(dataDir, "workspaces", "default", "products", "arm-cover-cool", "product.json"),
      refsDir: join(dataDir, "workspaces", "default", "products", "arm-cover-cool", "refs"),
      storyboardsFile: join(dataDir, "workspaces", "default", "products", "arm-cover-cool", "storyboards.json")
    });
    expect(getJobPaths(dataDir, DEFAULT_WORKSPACE_ID, "job-20260614000000000-001")).toEqual({
      dir: join(dataDir, "workspaces", "default", "jobs", "job-20260614000000000-001"),
      jobFile: join(dataDir, "workspaces", "default", "jobs", "job-20260614000000000-001", "job.json"),
      reportFile: join(dataDir, "workspaces", "default", "jobs", "job-20260614000000000-001", "make-video-report.json"),
      rawDir: join(dataDir, "workspaces", "default", "jobs", "job-20260614000000000-001", "raw"),
      finalDir: join(dataDir, "workspaces", "default", "jobs", "job-20260614000000000-001", "final")
    });
  });

  it("rejects workspace ids, product skus, and job ids that could escape the data directory", () => {
    const dataDir = "/tmp/haitu-data";

    expect(() => getWorkspacePaths(dataDir, "../other")).toThrow(/Invalid workspace id/);
    expect(() => getProductPaths(dataDir, DEFAULT_WORKSPACE_ID, "../secret")).toThrow(/Invalid product sku/);
    expect(() => getProductPaths(dataDir, DEFAULT_WORKSPACE_ID, "nested/sku")).toThrow(/Invalid product sku/);
    expect(() => getJobPaths(dataDir, DEFAULT_WORKSPACE_ID, "../../job")).toThrow(/Invalid job id/);
    expect(() => getJobPaths(dataDir, DEFAULT_WORKSPACE_ID, "job/slash")).toThrow(/Invalid job id/);
  });
});
