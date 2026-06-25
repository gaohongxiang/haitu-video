import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ensurePlatformBundles, ensurePlatformModelProvisioning } from "../../src/server/platformModelProvisioning.js";
import { closeDatabase, openDatabase } from "../../src/server/db/client.js";
import { ensureDefaultWorkspace, runMigrations } from "../../src/server/db/migrate.js";
import { SqliteModelConfigStore } from "../../src/server/db/sqliteModelConfigStore.js";
import { ModelBundleStore } from "../../src/server/modelBundleStore.js";
import { ModelServicePreferenceStore } from "../../src/server/modelServicePreferenceStore.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("ensurePlatformModelProvisioning", () => {
  it("creates platform configs and a workspace platform bundle from server-only env keys", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-platform-models-"));
    tempDirs.push(root);
    const handle = openDatabase({ dataDir: join(root, "data"), env: {} });
    runMigrations(handle);
    ensureDefaultWorkspace(handle);
    handle.sqlite.prepare(`
      INSERT INTO workspaces (id, name, created_at, updated_at)
      VALUES ('workspace-user-1', 'User Workspace', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    `).run();

    try {
      const platformModelConfigStore = new SqliteModelConfigStore({
        handle,
        secretKey: "test-secret-key-with-more-than-32-bytes",
        workspaceId: "default"
      });
      const modelBundleStore = new ModelBundleStore({
        handle,
        workspaceId: "workspace-user-1",
        now: () => new Date("2026-01-02T00:00:00.000Z")
      });
      const modelServicePreferenceStore = new ModelServicePreferenceStore({
        handle,
        workspaceId: "workspace-user-1",
        now: () => new Date("2026-01-02T00:00:00.000Z")
      });

      await ensurePlatformModelProvisioning({
        env: {
          HAITU_PLATFORM_DEEPSEEK_API_KEY: "platform-deepseek-key",
          HAITU_PLATFORM_OPENAI_API_KEY: "platform-openai-key",
          HAITU_PLATFORM_VOLCENGINE_API_KEY: "platform-volcengine-key",
          HAITU_PLATFORM_DEFAULT_TEXT_MODEL: "deepseek-v4-pro",
          HAITU_PLATFORM_DEFAULT_IMAGE_MODEL: "gpt-image-2",
          HAITU_PLATFORM_DEFAULT_VIDEO_MODEL: "seedance-2.0-fast"
        },
        platformModelConfigStore,
        modelBundleStore,
        modelServicePreferenceStore
      });

      const textConfigs = await platformModelConfigStore.listConfigs("openai-compatible-text");
      const imageConfigs = await platformModelConfigStore.listConfigs("openai-compatible-image");
      const videoConfigs = await platformModelConfigStore.listConfigs("volcengine-seedance");
      expect(textConfigs.find((config) => config.model === "deepseek-v4-pro")).toEqual(expect.objectContaining({
        apiOwner: "platform",
        apiKey: "platform-deepseek-key",
        vendor: "deepseek"
      }));
      expect(imageConfigs.find((config) => config.model === "gpt-image-2")).toEqual(expect.objectContaining({
        apiOwner: "platform",
        apiKey: "platform-openai-key",
        vendor: "openai"
      }));
      expect(videoConfigs.find((config) => config.model === "doubao-seedance-2-0-fast-260128")).toEqual(expect.objectContaining({
        apiOwner: "platform",
        apiKey: "platform-volcengine-key",
        vendor: "volcengine"
      }));

      const bundles = modelBundleStore.list();
      expect(bundles).toEqual(expect.arrayContaining([expect.objectContaining({
        bundleId: "platform-quality-bundle",
        apiOwner: "platform",
        label: "高质量",
        enabled: true
      })]));
      expect(modelServicePreferenceStore.get()).toEqual(expect.objectContaining({
        serviceMode: "byok",
        platformBundleId: "platform-quality-bundle"
      }));
    } finally {
      closeDatabase(handle);
    }
  });

  it("creates built-in platform bundles for quality and low-cost combinations", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-platform-model-bundles-"));
    tempDirs.push(root);
    const handle = openDatabase({ dataDir: join(root, "data"), env: {} });
    runMigrations(handle);
    ensureDefaultWorkspace(handle);
    handle.sqlite.prepare(`
      INSERT INTO workspaces (id, name, created_at, updated_at)
      VALUES ('workspace-user-2', 'User Workspace 2', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    `).run();

    try {
      const platformModelConfigStore = new SqliteModelConfigStore({
        handle,
        secretKey: "test-secret-key-with-more-than-32-bytes",
        workspaceId: "default"
      });
      const modelBundleStore = new ModelBundleStore({
        handle,
        workspaceId: "workspace-user-2",
        now: () => new Date("2026-01-02T00:00:00.000Z")
      });
      const modelServicePreferenceStore = new ModelServicePreferenceStore({
        handle,
        workspaceId: "workspace-user-2",
        now: () => new Date("2026-01-02T00:00:00.000Z")
      });

      await ensurePlatformModelProvisioning({
        env: {
          HAITU_PLATFORM_OPENAI_API_KEY: "platform-openai-secret",
          HAITU_PLATFORM_DEEPSEEK_API_KEY: "platform-deepseek-secret",
          HAITU_PLATFORM_GEMINI_API_KEY: "platform-gemini-secret",
          HAITU_PLATFORM_VOLCENGINE_API_KEY: "platform-volcengine-secret"
        },
        platformModelConfigStore,
        modelBundleStore,
        modelServicePreferenceStore
      });

      const bundles = modelBundleStore.list();

      expect(bundles).toEqual(expect.arrayContaining([
        expect.objectContaining({ bundleId: "platform-quality-bundle", label: "高质量" }),
        expect.objectContaining({ bundleId: "platform-low-cost-bundle", label: "低成本" })
      ]));
      expect(bundles.filter((bundle) => bundle.apiOwner === "platform")).toHaveLength(2);
      expect(bundles.map((bundle) => bundle.bundleId)).not.toContain("platform-custom-bundle");
      expect(bundles.map((bundle) => bundle.bundleId)).not.toContain("platform-default-bundle");
      expect(bundles.map((bundle) => bundle.bundleId)).not.toContain("platform-fast-bundle");
    } finally {
      closeDatabase(handle);
    }
  });

  it("builds quality and low-cost bundles from enabled admin platform versions only", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-platform-model-enabled-versions-"));
    tempDirs.push(root);
    const handle = openDatabase({ dataDir: join(root, "data"), env: {} });
    runMigrations(handle);
    ensureDefaultWorkspace(handle);

    try {
      const platformModelConfigStore = new SqliteModelConfigStore({
        handle,
        secretKey: "test-secret-key-with-more-than-32-bytes",
        workspaceId: "default"
      });
      const modelBundleStore = new ModelBundleStore({
        handle,
        workspaceId: "default",
        now: () => new Date("2026-01-02T00:00:00.000Z")
      });
      const modelServicePreferenceStore = new ModelServicePreferenceStore({
        handle,
        workspaceId: "default",
        now: () => new Date("2026-01-02T00:00:00.000Z")
      });

      await platformModelConfigStore.set("openai-compatible-text", {
        configId: "platform-text-pro",
        apiKey: "platform-text-key",
        apiOwner: "platform",
        name: "DeepSeek",
        vendor: "deepseek",
        model: "deepseek-v4-pro",
        enabled: true,
        priority: 100
      });
      await platformModelConfigStore.set("openai-compatible-text", {
        configId: "platform-text-flash",
        apiKey: "platform-text-key",
        apiOwner: "platform",
        name: "DeepSeek",
        vendor: "deepseek",
        model: "deepseek-v4-flash",
        enabled: true,
        priority: 90
      });
      await platformModelConfigStore.set("openai-compatible-image", {
        configId: "platform-image-quality",
        apiKey: "platform-image-key",
        apiOwner: "platform",
        name: "OpenAI",
        vendor: "openai",
        model: "gpt-image-2",
        enabled: true,
        priority: 100
      });
      await platformModelConfigStore.set("openai-compatible-image", {
        configId: "platform-image-flash",
        apiKey: "platform-image-key",
        apiOwner: "platform",
        name: "Gemini",
        vendor: "gemini",
        model: "gemini-2.5-flash-image",
        enabled: true,
        priority: 90
      });
      await platformModelConfigStore.set("volcengine-seedance", {
        configId: "platform-video-fast",
        apiKey: "platform-video-key",
        apiOwner: "platform",
        name: "Seedance",
        vendor: "volcengine",
        model: "seedance-2.0-fast",
        enabled: true,
        priority: 100
      });
      await platformModelConfigStore.set("volcengine-seedance", {
        configId: "platform-video-quality",
        apiKey: "platform-video-key",
        apiOwner: "platform",
        name: "Seedance",
        vendor: "volcengine",
        model: "seedance-2.0",
        enabled: true,
        priority: 90
      });

      await ensurePlatformBundles({
        platformModelConfigStore,
        modelBundleStore,
        modelServicePreferenceStore
      });

      expect(modelBundleStore.list()).toEqual(expect.arrayContaining([
        expect.objectContaining({
          bundleId: "platform-quality-bundle",
          textModelConfigId: "platform-text-pro",
          imageModelConfigId: "platform-image-quality",
          videoModelConfigId: "platform-video-quality"
        }),
        expect.objectContaining({
          bundleId: "platform-low-cost-bundle",
          textModelConfigId: "platform-text-flash",
          imageModelConfigId: "platform-image-flash",
          videoModelConfigId: "platform-video-fast"
        })
      ]));
    } finally {
      closeDatabase(handle);
    }
  });

  it("preserves saved numbered platform custom bundles when platform bundles refresh", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-platform-model-custom-bundle-"));
    tempDirs.push(root);
    const handle = openDatabase({ dataDir: join(root, "data"), env: {} });
    runMigrations(handle);
    ensureDefaultWorkspace(handle);

    try {
      const platformModelConfigStore = new SqliteModelConfigStore({
        handle,
        secretKey: "test-secret-key-with-more-than-32-bytes",
        workspaceId: "default"
      });
      const modelBundleStore = new ModelBundleStore({
        handle,
        workspaceId: "default",
        now: () => new Date("2026-01-02T00:00:00.000Z")
      });
      const modelServicePreferenceStore = new ModelServicePreferenceStore({
        handle,
        workspaceId: "default",
        now: () => new Date("2026-01-02T00:00:00.000Z")
      });

      await platformModelConfigStore.set("openai-compatible-text", {
        configId: "platform-text-quality",
        apiKey: "platform-text-key",
        apiOwner: "platform",
        vendor: "deepseek",
        model: "deepseek-v4-pro",
        enabled: true,
        priority: 100,
        tags: ["高质量"]
      });
      await platformModelConfigStore.set("openai-compatible-text", {
        configId: "platform-text-low-cost",
        apiKey: "platform-text-key",
        apiOwner: "platform",
        vendor: "deepseek",
        model: "deepseek-v4-flash",
        enabled: true,
        priority: 90,
        tags: ["低成本"]
      });
      await platformModelConfigStore.set("openai-compatible-image", {
        configId: "platform-image-quality",
        apiKey: "platform-image-key",
        apiOwner: "platform",
        vendor: "openai",
        model: "gpt-image-2",
        enabled: true,
        priority: 100
      });
      await platformModelConfigStore.set("volcengine-seedance", {
        configId: "platform-video-fast",
        apiKey: "platform-video-key",
        apiOwner: "platform",
        vendor: "volcengine",
        model: "seedance-2.0-fast",
        enabled: true,
        priority: 100
      });

      await ensurePlatformBundles({
        platformModelConfigStore,
        modelBundleStore,
        modelServicePreferenceStore
      });
      modelBundleStore.set({
        bundleId: "platform-custom-bundle",
        apiOwner: "platform",
        label: "自定义",
        textModelConfigId: "auto",
        imageModelConfigId: "auto",
        videoModelConfigId: "auto",
        enabled: true,
        priority: 80
      });
      modelBundleStore.set({
        bundleId: "platform-custom-bundle-1",
        apiOwner: "platform",
        label: "新增组合1",
        textModelConfigId: "platform-text-low-cost",
        imageModelConfigId: "platform-image-quality",
        videoModelConfigId: "platform-video-fast",
        enabled: true,
        priority: 80
      });

      await ensurePlatformBundles({
        platformModelConfigStore,
        modelBundleStore,
        modelServicePreferenceStore
      });

      expect(modelBundleStore.list()).toEqual(expect.arrayContaining([
        expect.objectContaining({
          bundleId: "platform-custom-bundle-1",
          label: "新增组合1",
          textModelConfigId: "platform-text-low-cost",
          imageModelConfigId: "platform-image-quality",
          videoModelConfigId: "platform-video-fast"
        })
      ]));
      expect(modelBundleStore.list().map((bundle) => bundle.bundleId)).not.toContain("platform-custom-bundle");
    } finally {
      closeDatabase(handle);
    }
  });
});
