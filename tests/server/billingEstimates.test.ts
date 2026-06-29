import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { estimateBillingActions } from "../../src/server/billingEstimateService.js";
import { BillingPolicyStore } from "../../src/server/billingPolicyStore.js";
import { closeDatabase, openDatabase } from "../../src/server/db/client.js";
import { ensureDefaultWorkspace, runMigrations } from "../../src/server/db/migrate.js";
import { ModelPricingCatalogStore } from "../../src/server/modelPricingCatalogStore.js";
import type { ModelConfigStore, ModelStoredConfig } from "../../src/server/modelConfigStore.js";

const tempDirs: string[] = [];

describe("billing estimates", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("estimates each video creation action from selected model configs and service fees", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-billing-estimates-"));
    tempDirs.push(root);
    const handle = openDatabase({ dataDir: join(root, "data"), env: process.env });
    runMigrations(handle);
    ensureDefaultWorkspace(handle);
    try {
      const billingPolicyStore = new BillingPolicyStore({ handle });
      billingPolicyStore.updateSettings({
        rules: [
          { usageKind: "text", serviceFeeCny: 0.2 },
          { usageKind: "image", serviceFeeCny: 0.3 },
          { usageKind: "video", serviceFeeCny: 1.5 }
        ]
      });
      const modelConfigStore = modelStore([]);
      const platformModelConfigStore = modelStore([
        modelConfig("openai-compatible-text", "platform-text", "deepseek-v4-pro"),
        modelConfig("openai-compatible-image", "platform-image", "gpt-image-2"),
        modelConfig("volcengine-seedance", "platform-video", "doubao-seedance-2-0-fast-260128")
      ]);

      const estimates = await estimateBillingActions({
        billingPolicyStore,
        modelConfigStore,
        platformModelConfigStore,
        input: {
          textModelConfigId: "platform-text",
          imageModelConfigId: "platform-image",
          videoModelConfigId: "platform-video",
          referenceImageCount: 2,
          videoDurationSeconds: 8,
          videoResolution: "480p",
          videoAspectRatio: "9:16",
          videoCount: 2
        }
      });

      expect(estimates.estimates.organizeProduct).toEqual(expect.objectContaining({
        apiBillingMode: "platform",
        serviceFeeCny: 0.2,
        upstreamEstimatedCostCny: 0.01,
        walletEstimatedChargeCny: 0.21
      }));
      expect(estimates.estimates.storyboard).toEqual(expect.objectContaining({
        walletEstimatedChargeCny: 0.21
      }));
      expect(estimates.estimates.referenceImages).toEqual(expect.objectContaining({
        units: 2,
        serviceFeeCny: 0.6,
        upstreamEstimatedCostCny: 0.6,
        walletEstimatedChargeCny: 1.2
      }));
      expect(estimates.estimates.video).toEqual(expect.objectContaining({
        units: 2,
        serviceFeeCny: 3,
        upstreamEstimatedCostCny: 5.96,
        walletEstimatedChargeCny: 8.96
      }));
    } finally {
      closeDatabase(handle);
    }
  });

  it("scales video creation estimates by requested resolution", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-billing-estimates-resolution-"));
    tempDirs.push(root);
    const handle = openDatabase({ dataDir: join(root, "data"), env: process.env });
    runMigrations(handle);
    ensureDefaultWorkspace(handle);
    try {
      const billingPolicyStore = new BillingPolicyStore({ handle });
      const modelConfigStore = modelStore([]);
      const platformModelConfigStore = modelStore([
        modelConfig("volcengine-seedance", "platform-video", "doubao-seedance-2-0-fast-260128")
      ]);
      const baseInput = {
        videoModelConfigId: "platform-video",
        videoDurationSeconds: 10,
        videoCount: 1
      };

      const estimates480p = await estimateBillingActions({
        billingPolicyStore,
        modelConfigStore,
        platformModelConfigStore,
        input: {
          ...baseInput,
          videoResolution: "480p"
        }
      });
      const estimates720p = await estimateBillingActions({
        billingPolicyStore,
        modelConfigStore,
        platformModelConfigStore,
        input: {
          ...baseInput,
          videoResolution: "720p"
        }
      });

      expect(estimates480p.estimates.video.upstreamEstimatedCostCny).toBe(3.73);
      expect(estimates720p.estimates.video.upstreamEstimatedCostCny).toBe(7.99);
      expect(estimates720p.estimates.video.upstreamEstimatedCostCny).toBeGreaterThan(estimates480p.estimates.video.upstreamEstimatedCostCny);
    } finally {
      closeDatabase(handle);
    }
  });

  it("uses the injected active model pricing catalog for new billing estimates", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-billing-estimates-active-catalog-"));
    tempDirs.push(root);
    const handle = openDatabase({ dataDir: join(root, "data"), env: process.env });
    runMigrations(handle);
    ensureDefaultWorkspace(handle);
    try {
      const billingPolicyStore = new BillingPolicyStore({ handle });
      const store = new ModelPricingCatalogStore({ handle, now: () => new Date("2026-06-29T00:00:00.000Z") });
      const draft = store.saveDraft({
        version: "2026-06-29",
        catalog: store.getActiveCatalog().catalog.map((entry) => (
          entry.model === "doubao-seedance-2.0"
            ? {
                ...entry,
                videoTokenPriceCnyPerMillionByResolution: {
                  ...entry.videoTokenPriceCnyPerMillionByResolution,
                  "1080p": 52
                },
                settlement: entry.settlement?.kind === "video"
                  ? {
                      ...entry.settlement,
                      videoTokenPriceCnyPerMillionByResolution: {
                        ...entry.settlement.videoTokenPriceCnyPerMillionByResolution,
                        "1080p": 52
                      }
                    }
                  : entry.settlement
              }
            : entry
        ))
      });
      const activeCatalog = store.publishDraft({ draftId: draft.id }).catalog;
      const estimates = await estimateBillingActions({
        billingPolicyStore,
        modelConfigStore: modelStore([]),
        platformModelConfigStore: modelStore([
          modelConfig("volcengine-seedance", "platform-video", "doubao-seedance-2-0-260128")
        ]),
        modelPricingCatalog: activeCatalog,
        input: {
          videoModelConfigId: "platform-video",
          videoDurationSeconds: 5,
          videoResolution: "1080p",
          videoAspectRatio: "16:9",
          videoCount: 1
        }
      });

      expect(estimates.estimates.video.upstreamEstimatedCostCny).toBe(12.64);
    } finally {
      closeDatabase(handle);
    }
  });

  it("keeps vertical and horizontal estimates equal at the same resolution", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-billing-estimates-aspect-ratio-"));
    tempDirs.push(root);
    const handle = openDatabase({ dataDir: join(root, "data"), env: process.env });
    runMigrations(handle);
    ensureDefaultWorkspace(handle);
    try {
      const billingPolicyStore = new BillingPolicyStore({ handle });
      const modelConfigStore = modelStore([]);
      const platformModelConfigStore = modelStore([
        modelConfig("volcengine-seedance", "platform-video", "doubao-seedance-2-0-fast-260128")
      ]);
      const baseInput = {
        videoModelConfigId: "platform-video",
        videoDurationSeconds: 10,
        videoResolution: "720p" as const,
        videoCount: 1
      };

      const vertical = await estimateBillingActions({
        billingPolicyStore,
        modelConfigStore,
        platformModelConfigStore,
        input: {
          ...baseInput,
          videoAspectRatio: "9:16"
        }
      });
      const horizontal = await estimateBillingActions({
        billingPolicyStore,
        modelConfigStore,
        platformModelConfigStore,
        input: {
          ...baseInput,
          videoAspectRatio: "16:9"
        }
      });

      expect(vertical.estimates.video.upstreamEstimatedCostCny).toBe(7.99);
      expect(horizontal.estimates.video.upstreamEstimatedCostCny).toBe(7.99);
    } finally {
      closeDatabase(handle);
    }
  });

  it("always exposes official upstream video cost estimates while wallet charge follows API owner", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-billing-estimates-byok-upstream-"));
    tempDirs.push(root);
    const handle = openDatabase({ dataDir: join(root, "data"), env: process.env });
    runMigrations(handle);
    ensureDefaultWorkspace(handle);
    try {
      const billingPolicyStore = new BillingPolicyStore({ handle });
      billingPolicyStore.updateSettings({
        rules: [
          { usageKind: "text", serviceFeeCny: 0.2 },
          { usageKind: "image", serviceFeeCny: 0.3 },
          { usageKind: "video", serviceFeeCny: 1.5 }
        ]
      });
      const modelConfigStore = modelStore([
        {
          ...modelConfig("volcengine-seedance", "byok-video", "doubao-seedance-2-0-fast-260128"),
          apiOwner: "byok"
        }
      ]);
      const platformModelConfigStore = modelStore([]);

      const estimates = await estimateBillingActions({
        billingPolicyStore,
        modelConfigStore,
        platformModelConfigStore,
        input: {
          videoModelConfigId: "byok-video",
          videoDurationSeconds: 5,
          videoResolution: "720p",
          videoCount: 1
        }
      });

      expect(estimates.estimates.video).toEqual(expect.objectContaining({
        apiBillingMode: "byok",
        serviceFeeCny: 1.5,
        upstreamEstimatedCostCny: 4,
        walletEstimatedChargeCny: 1.5
      }));
    } finally {
      closeDatabase(handle);
    }
  });
});

function modelConfig(providerId: ModelStoredConfig["providerId"], configId: string, model: string): ModelStoredConfig {
  return {
    credentialId: `${configId}-credential`,
    configId,
    providerId,
    modelKind: providerId === "openai-compatible-text" ? "text" : providerId === "openai-compatible-image" ? "image" : "video",
    apiOwner: "platform",
    apiKey: `${configId}-key`,
    label: configId,
    priority: 0,
    model,
    enabled: true
  };
}

function modelStore(configs: ModelStoredConfig[]): ModelConfigStore {
  return {
    async listConfigs(providerId) {
      return configs.filter((config) => config.providerId === providerId);
    },
    async getConfig(providerId, configId) {
      if (configId && configId !== "auto") {
        return configs.find((config) => config.providerId === providerId && config.configId === configId);
      }
      return configs.find((config) => config.providerId === providerId && config.enabled);
    },
    async getConfigById(providerId, configId) {
      return configs.find((config) => config.providerId === providerId && config.configId === configId);
    },
    async set() {
      throw new Error("not implemented");
    },
    async delete() {
      throw new Error("not implemented");
    }
  };
}
