import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { closeDatabase, openDatabase } from "../../src/server/db/client.js";
import { ensureDefaultWorkspace, runMigrations } from "../../src/server/db/migrate.js";
import { SqliteModelConfigStore } from "../../src/server/db/sqliteModelConfigStore.js";

const tempDirs: string[] = [];

describe("SqliteModelConfigStore", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("stores text, image, and video variants with the same API", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-model-config-store-"));
    tempDirs.push(root);
    const handle = openDatabase({ dataDir: join(root, "data"), env: process.env });
    runMigrations(handle);
    ensureDefaultWorkspace(handle);
    try {
      const store = new SqliteModelConfigStore({
        handle,
        secretKey: "test-secret-key-with-more-than-32-bytes",
        workspaceId: "default"
      });

      await store.set("openai-compatible-text", {
        apiKey: "text-secret-123456",
        name: "OpenAI",
        vendor: "openai",
        baseUrl: "https://api.openai.com",
        model: ["gpt-5.5", "gpt-5.4-mini"],
        apiMode: "responses_stream",
        priority: 9
      });
      await store.set("openai-compatible-image", {
        apiKey: "image-secret-abcdef",
        name: "OpenAI Image",
        vendor: "openai",
        baseUrl: "https://api.openai.com",
        model: "gpt-image-2",
        priority: 8
      });
      await store.set("volcengine-seedance", {
        apiKey: "video-secret-fedcba",
        name: "Seedance",
        vendor: "volcengine",
        baseUrl: "https://ark.cn-beijing.volces.com",
        model: ["doubao-seedance-2-0-fast-260128", "doubao-seedance-2-0-260128"],
        priority: 7
      });

      expect((await store.listConfigs("openai-compatible-text")).map((config) => config.model)).toEqual([
        "gpt-5.5",
        "gpt-5.4-mini"
      ]);
      expect((await store.listConfigs("openai-compatible-image")).map((config) => config.model)).toEqual(["gpt-image-2"]);
      expect((await store.listConfigs("volcengine-seedance")).map((config) => config.model)).toEqual([
        "doubao-seedance-2-0-fast-260128",
        "doubao-seedance-2-0-260128"
      ]);

      expect(await store.getConfig("openai-compatible-text")).toEqual(expect.objectContaining({
        modelKind: "text",
        providerId: "openai-compatible-text",
        apiKey: "text-secret-123456",
        model: "gpt-5.5",
        apiMode: "responses_stream",
        priority: 9
      }));
      expect(await store.getConfig("openai-compatible-image")).toEqual(expect.objectContaining({
        modelKind: "image",
        providerId: "openai-compatible-image",
        apiKey: "image-secret-abcdef",
        model: "gpt-image-2"
      }));
      expect(await store.getConfig("volcengine-seedance")).toEqual(expect.objectContaining({
        modelKind: "video",
        providerId: "volcengine-seedance",
        apiKey: "video-secret-fedcba",
        model: "doubao-seedance-2-0-fast-260128"
      }));
    } finally {
      closeDatabase(handle);
    }
  });

  it("chooses the most recently saved enabled config without using priority", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-model-config-store-order-"));
    tempDirs.push(root);
    const handle = openDatabase({ dataDir: join(root, "data"), env: process.env });
    runMigrations(handle);
    ensureDefaultWorkspace(handle);
    try {
      const store = new SqliteModelConfigStore({
        handle,
        secretKey: "test-secret-key-with-more-than-32-bytes",
        workspaceId: "default"
      });

      await store.set("openai-compatible-text", {
        apiKey: "older-text-secret",
        name: "旧文本服务",
        vendor: "openai",
        baseUrl: "https://old.example.test",
        model: "old-text-model",
        priority: 100
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await store.set("openai-compatible-text", {
        apiKey: "newer-text-secret",
        name: "新文本服务",
        vendor: "openai",
        baseUrl: "https://new.example.test",
        model: "new-text-model",
        priority: 1
      });

      expect((await store.listConfigs("openai-compatible-text")).map((config) => config.label)).toEqual([
        "新文本服务",
        "旧文本服务"
      ]);
      await expect(store.getConfig("openai-compatible-text")).resolves.toEqual(expect.objectContaining({
        label: "新文本服务",
        apiKey: "newer-text-secret",
        model: "new-text-model"
      }));
    } finally {
      closeDatabase(handle);
    }
  });

  it("canonicalizes catalog labels to real model IDs before saving variants", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-model-config-labels-"));
    tempDirs.push(root);
    const handle = openDatabase({ dataDir: join(root, "data"), env: process.env });
    runMigrations(handle);
    ensureDefaultWorkspace(handle);
    try {
      const store = new SqliteModelConfigStore({
        handle,
        secretKey: "test-secret-key-with-more-than-32-bytes",
        workspaceId: "default"
      });

      await store.set("openai-compatible-text", {
        apiKey: "text-secret-123456",
        vendor: "doubao",
        model: ["doubao-seed-2.0-pro"],
        priority: 7
      });
      await store.set("volcengine-seedance", {
        apiKey: "video-secret-fedcba",
        vendor: "volcengine",
        model: ["seedance-2.0-fast", "seedance-2.0"],
        priority: 8
      });

      expect((await store.listConfigs("openai-compatible-text")).map((config) => config.model)).toEqual([
        "doubao-seed-2-0-pro-260215"
      ]);
      expect((await store.listConfigs("volcengine-seedance")).map((config) => config.model)).toEqual([
        "doubao-seedance-2-0-fast-260128",
        "doubao-seedance-2-0-260128"
      ]);
    } finally {
      closeDatabase(handle);
    }
  });

  it("removes unchecked variants when editing a multi-model credential", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-model-config-uncheck-"));
    tempDirs.push(root);
    const handle = openDatabase({ dataDir: join(root, "data"), env: process.env });
    runMigrations(handle);
    ensureDefaultWorkspace(handle);
    try {
      const store = new SqliteModelConfigStore({
        handle,
        secretKey: "test-secret-key-with-more-than-32-bytes",
        workspaceId: "default"
      });

      await store.set("volcengine-seedance", {
        apiKey: "video-secret-fedcba",
        vendor: "volcengine",
        model: ["seedance-2.0-fast", "seedance-2.0"],
        priority: 8
      });
      const beforeEdit = await store.listConfigs("volcengine-seedance");

      await store.set("volcengine-seedance", {
        configId: beforeEdit[0]?.configId,
        vendor: "volcengine",
        model: ["seedance-2.0-fast"],
        priority: 8
      });

      expect((await store.listConfigs("volcengine-seedance")).map((config) => config.model)).toEqual([
        "doubao-seedance-2-0-fast-260128"
      ]);
    } finally {
      closeDatabase(handle);
    }
  });

  it("deletes every variant for a credential when deleting a grouped model config", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-model-config-delete-group-"));
    tempDirs.push(root);
    const handle = openDatabase({ dataDir: join(root, "data"), env: process.env });
    runMigrations(handle);
    ensureDefaultWorkspace(handle);
    try {
      const store = new SqliteModelConfigStore({
        handle,
        secretKey: "test-secret-key-with-more-than-32-bytes",
        workspaceId: "default"
      });

      await store.set("volcengine-seedance", {
        apiKey: "video-secret-fedcba",
        vendor: "volcengine",
        model: ["seedance-2.0-fast", "seedance-2.0"],
        priority: 8
      });
      const configs = await store.listConfigs("volcengine-seedance");

      await store.delete("volcengine-seedance", configs[0]?.configId);

      expect(await store.listConfigs("volcengine-seedance")).toEqual([]);
    } finally {
      closeDatabase(handle);
    }
  });
});
