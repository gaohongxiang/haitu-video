import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { closeDatabase, openDatabase } from "../../src/server/db/client.js";
import { ensureDefaultWorkspace, runMigrations } from "../../src/server/db/migrate.js";
import { ModelBundleStore } from "../../src/server/modelBundleStore.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("ModelBundleStore", () => {
  it("lists model bundles by enabled state and recent edits without using priority as ordering", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-model-bundle-store-"));
    tempDirs.push(root);
    const handle = openDatabase({ dataDir: join(root, "data"), env: {} });
    runMigrations(handle);
    ensureDefaultWorkspace(handle);
    const timestamps = [
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:01:00.000Z",
      "2026-01-01T00:02:00.000Z"
    ];
    const store = new ModelBundleStore({
      handle,
      workspaceId: "default",
      now: () => new Date(timestamps.shift() ?? "2026-01-01T00:03:00.000Z")
    });

    try {
      store.set({
        bundleId: "old-complete-bundle",
        apiOwner: "byok",
        label: "旧完整组合",
        textModelConfigId: "text-old",
        imageModelConfigId: "image-old",
        videoModelConfigId: "video-old",
        enabled: true,
        priority: 100
      });
      store.set({
        bundleId: "disabled-new",
        apiOwner: "byok",
        label: "停用新组合",
        textModelConfigId: "text-disabled",
        imageModelConfigId: "image-disabled",
        videoModelConfigId: "video-disabled",
        enabled: false,
        priority: 999
      });
      store.set({
        bundleId: "new-complete-bundle",
        apiOwner: "byok",
        label: "新完整组合",
        textModelConfigId: "text-new",
        imageModelConfigId: "image-new",
        videoModelConfigId: "video-new",
        enabled: true,
        priority: 1
      });

      expect(store.list().map((bundle) => bundle.bundleId)).toEqual([
        "new-complete-bundle",
        "old-complete-bundle",
        "disabled-new"
      ]);
    } finally {
      closeDatabase(handle);
    }
  });

  it("lists managed platform presets with low-cost before quality without using priority", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-model-bundle-store-platform-order-"));
    tempDirs.push(root);
    const handle = openDatabase({ dataDir: join(root, "data"), env: {} });
    runMigrations(handle);
    ensureDefaultWorkspace(handle);
    const timestamps = [
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:01:00.000Z"
    ];
    const store = new ModelBundleStore({
      handle,
      workspaceId: "default",
      now: () => new Date(timestamps.shift() ?? "2026-01-01T00:02:00.000Z")
    });

    try {
      store.set({
        bundleId: "platform-low-cost-bundle",
        apiOwner: "platform",
        label: "低成本",
        textModelConfigId: "text-low",
        imageModelConfigId: "image-low",
        videoModelConfigId: "video-low",
        enabled: true,
        priority: 1
      });
      store.set({
        bundleId: "platform-quality-bundle",
        apiOwner: "platform",
        label: "高质量",
        textModelConfigId: "text-quality",
        imageModelConfigId: "image-quality",
        videoModelConfigId: "video-quality",
        enabled: true,
        priority: 999
      });

      expect(store.list().map((bundle) => bundle.bundleId)).toEqual([
        "platform-low-cost-bundle",
        "platform-quality-bundle"
      ]);
    } finally {
      closeDatabase(handle);
    }
  });
});
