import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildAdminModelPricingCatalog,
  buildAdminModelPricingDraftDiff,
  publishAdminModelPricingDraft,
  saveAdminModelPricingDraft
} from "../../src/server/adminModelPricingCatalog.js";
import { closeDatabase, openDatabase, type DatabaseHandle } from "../../src/server/db/client.js";
import { ensureDefaultWorkspace, runMigrations } from "../../src/server/db/migrate.js";
import { ModelPricingCatalogStore } from "../../src/server/modelPricingCatalogStore.js";

const tempDirs: string[] = [];

describe("admin model pricing catalog", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("returns active catalog rows for admin review", async () => {
    const { handle, close } = await openTestDatabase("haitu-admin-pricing-view-");
    try {
      const response = buildAdminModelPricingCatalog({
        store: new ModelPricingCatalogStore({ handle })
      });

      expect(response.active.source).toBe("built_in");
      expect(response.active.entries).toEqual(expect.arrayContaining([
        expect.objectContaining({
          model: "doubao-seedance-2.0",
          providerId: "volcengine",
          unit: "/ 1M tokens",
          sourceUrl: "https://www.volcengine.com/docs/82379/1544106"
        })
      ]));
    } finally {
      close();
    }
  });

  it("saves, previews, and publishes draft catalog versions", async () => {
    const { handle, close } = await openTestDatabase("haitu-admin-pricing-publish-");
    try {
      const store = new ModelPricingCatalogStore({
        handle,
        now: () => new Date("2026-06-29T00:00:00.000Z")
      });
      const active = buildAdminModelPricingCatalog({ store });
      const draft = saveAdminModelPricingDraft({
        store,
        adminEmail: "admin@example.com",
        request: {
          version: "2026-06-29",
          entries: active.active.entries.map((entry) => (
            entry.model === "gpt-image-2"
              ? { ...entry, imagePriceCnyPerImage: 0.31 }
              : entry
          ))
        }
      });
      const diff = buildAdminModelPricingDraftDiff({
        store,
        draftId: draft.draft.id
      });
      const published = publishAdminModelPricingDraft({
        store,
        adminEmail: "admin@example.com",
        request: { draftId: draft.draft.id }
      });

      expect(diff.changed).toEqual([
        expect.objectContaining({
          model: "gpt-image-2",
          changedFields: expect.arrayContaining(["imagePriceCnyPerImage", "settlement"])
        })
      ]);
      expect(published.active.version).toBe("2026-06-29");
      expect(published.active.source).toBe("database");
      expect(published.active.entries.find((entry) => entry.model === "gpt-image-2")?.imagePriceCnyPerImage).toBe(0.31);
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
