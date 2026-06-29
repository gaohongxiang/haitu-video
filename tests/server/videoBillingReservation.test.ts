import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { officialModelPricingUpdatedAt } from "../../src/modelPricing/officialModelPricingCatalog.js";
import { BillingPolicyStore } from "../../src/server/billingPolicyStore.js";
import { closeDatabase, openDatabase } from "../../src/server/db/client.js";
import { ensureDefaultWorkspace, runMigrations } from "../../src/server/db/migrate.js";
import { ModelPricingCatalogStore } from "../../src/server/modelPricingCatalogStore.js";
import { reserveVideoJobBilling } from "../../src/server/videoJobBilling.js";
import { WalletStore } from "../../src/server/walletStore.js";

const tempDirs: string[] = [];

describe("video billing reservation", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("stores the official price snapshot used for platform video precharge estimates", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-video-billing-reservation-"));
    tempDirs.push(root);
    const handle = openDatabase({ dataDir: join(root, "data"), env: process.env });
    runMigrations(handle);
    ensureDefaultWorkspace(handle);
    try {
      const walletStore = new WalletStore({ handle, workspaceId: "default" });
      walletStore.topUp({
        amountCny: 30,
        description: "测试充值"
      });
      const result = reserveVideoJobBilling({
        walletStore,
        provider: "volcengine-seedance",
        modelConfig: {
          apiOwner: "platform",
          model: "doubao-seedance-2-0-260128"
        },
        durationSeconds: 5,
        resolution: "1080p",
        aspectRatio: "16:9",
        billingPolicyStore: new BillingPolicyStore({ handle })
      });

      const reserve = walletStore.getSummary().transactions.find((item) => item.reservationId === result.walletReservationId);
      expect(reserve?.metadata).toEqual(expect.objectContaining({
        apiBillingMode: "platform",
        upstreamEstimatedCostCny: 12.39,
        priceSnapshot: expect.objectContaining({
          catalogVersion: officialModelPricingUpdatedAt,
          model: "doubao-seedance-2.0",
          providerId: "volcengine",
          currency: "CNY",
          unit: "video_tokens_1m",
          unitPriceCny: 51,
          resolution: "1080p",
          sourceUrl: "https://www.volcengine.com/docs/82379/1544106"
        })
      }));
    } finally {
      closeDatabase(handle);
    }
  });

  it("uses injected active catalog for new reservations without changing old wallet snapshots", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-video-billing-reservation-active-catalog-"));
    tempDirs.push(root);
    const handle = openDatabase({ dataDir: join(root, "data"), env: process.env });
    runMigrations(handle);
    ensureDefaultWorkspace(handle);
    try {
      const walletStore = new WalletStore({ handle, workspaceId: "default" });
      walletStore.topUp({ amountCny: 60, description: "测试充值" });
      const billingPolicyStore = new BillingPolicyStore({ handle });
      const first = reserveVideoJobBilling({
        walletStore,
        provider: "volcengine-seedance",
        modelConfig: {
          apiOwner: "platform",
          model: "doubao-seedance-2-0-260128"
        },
        durationSeconds: 5,
        resolution: "1080p",
        aspectRatio: "16:9",
        billingPolicyStore
      });
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
      const active = store.publishDraft({ draftId: draft.id });
      const activeCatalog = active.catalog;
      const second = reserveVideoJobBilling({
        walletStore,
        provider: "volcengine-seedance",
        modelConfig: {
          apiOwner: "platform",
          model: "doubao-seedance-2-0-260128"
        },
        durationSeconds: 5,
        resolution: "1080p",
        aspectRatio: "16:9",
        billingPolicyStore,
        modelPricingCatalog: activeCatalog,
        modelPricingCatalogVersion: active.version
      });

      const transactions = walletStore.getSummary().transactions;
      const firstReserve = transactions.find((item) => item.reservationId === first.walletReservationId);
      const secondReserve = transactions.find((item) => item.reservationId === second.walletReservationId);
      expect(firstReserve?.metadata?.priceSnapshot).toEqual(expect.objectContaining({
        unitPriceCny: 51
      }));
      expect(secondReserve?.metadata?.priceSnapshot).toEqual(expect.objectContaining({
        catalogVersion: "2026-06-29",
        unitPriceCny: 52
      }));
    } finally {
      closeDatabase(handle);
    }
  });
});
