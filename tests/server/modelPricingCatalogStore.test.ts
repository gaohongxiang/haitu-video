import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  officialModelPricingUpdatedAt,
  type ModelPricingEntry
} from "../../src/modelPricing/officialModelPricingCatalog.js";
import { closeDatabase, openDatabase, type DatabaseHandle } from "../../src/server/db/client.js";
import { ensureDefaultWorkspace, runMigrations } from "../../src/server/db/migrate.js";
import { ModelPricingCatalogStore } from "../../src/server/modelPricingCatalogStore.js";

const tempDirs: string[] = [];

describe("ModelPricingCatalogStore", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("uses the built-in official catalog when no database version has been published", async () => {
    const { handle, close } = await openTestDatabase("haitu-pricing-catalog-store-");
    try {
      const store = new ModelPricingCatalogStore({ handle });
      const active = store.getActiveCatalog();

      expect(active.version).toBe(officialModelPricingUpdatedAt);
      expect(active.source).toBe("built_in");
      expect(active.catalog.some((entry) => entry.model === "doubao-seedance-2.0")).toBe(true);
    } finally {
      close();
    }
  });

  it("saves drafts, previews changed fields, and publishes a database-backed active catalog", async () => {
    const { handle, close } = await openTestDatabase("haitu-pricing-catalog-publish-");
    try {
      const store = new ModelPricingCatalogStore({
        handle,
        now: () => new Date("2026-06-29T00:00:00.000Z")
      });
      const nextCatalog = store.getActiveCatalog().catalog.map((entry) => (
        entry.model === "doubao-seedance-2.0"
          ? withVideoResolutionPrice(entry, "1080p", 52)
          : entry
      ));

      const draft = store.saveDraft({
        version: "2026-06-29",
        catalog: nextCatalog,
        createdBy: "admin@example.com"
      });
      const diff = store.diffDraft(draft.id);
      const published = store.publishDraft({
        draftId: draft.id,
        publishedBy: "admin@example.com"
      });
      const active = store.getActiveCatalog();

      expect(diff.changed).toEqual([
        expect.objectContaining({
          model: "doubao-seedance-2.0",
          changedFields: expect.arrayContaining([
            "videoTokenPriceCnyPerMillionByResolution",
            "settlement"
          ])
        })
      ]);
      expect(published).toEqual(expect.objectContaining({
        version: "2026-06-29",
        source: "database",
        publishedAt: "2026-06-29T00:00:00.000Z"
      }));
      expect(active.source).toBe("database");
      expect(active.catalog.find((entry) => entry.model === "doubao-seedance-2.0")?.videoTokenPriceCnyPerMillionByResolution?.["1080p"]).toBe(52);
      expect(store.getDraft(draft.id)).toBeUndefined();
      expect(handle.sqlite.prepare("SELECT COUNT(*) AS count FROM model_pricing_catalog_versions WHERE status = 'published'").get()).toEqual({ count: 1 });
    } finally {
      close();
    }
  });

  it("rejects invalid catalogs before saving drafts", async () => {
    const { handle, close } = await openTestDatabase("haitu-pricing-catalog-invalid-");
    try {
      const store = new ModelPricingCatalogStore({ handle });

      expect(() => store.saveDraft({
        version: "2026-06-29",
        createdBy: "admin@example.com",
        catalog: store.getActiveCatalog().catalog.map((entry) => (
          entry.model === "gpt-image-2"
            ? { ...entry, imagePriceCnyPerImage: -1 }
            : entry
        ))
      })).toThrow("模型价格目录包含无效价格");
    } finally {
      close();
    }
  });
});

async function openTestDatabase(prefix: string): Promise<{ handle: DatabaseHandle; close: () => void }> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(root);
  const handle = openDatabase({ dataDir: join(root, "data"), env: process.env });
  runMigrations(handle);
  ensureDefaultWorkspace(handle);
  return {
    handle,
    close: () => closeDatabase(handle)
  };
}

function withVideoResolutionPrice(entry: ModelPricingEntry, resolution: "1080p", price: number): ModelPricingEntry {
  return {
    ...entry,
    videoTokenPriceCnyPerMillionByResolution: {
      ...entry.videoTokenPriceCnyPerMillionByResolution,
      [resolution]: price
    },
    settlement: entry.settlement?.kind === "video"
      ? {
          ...entry.settlement,
          videoTokenPriceCnyPerMillionByResolution: {
            ...entry.settlement.videoTokenPriceCnyPerMillionByResolution,
            [resolution]: price
          }
        }
      : entry.settlement
  };
}
