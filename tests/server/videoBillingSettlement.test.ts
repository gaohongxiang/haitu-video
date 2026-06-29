import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { officialModelPricingUpdatedAt } from "../../src/modelPricing/officialModelPricingCatalog.js";
import { BillingPolicyStore } from "../../src/server/billingPolicyStore.js";
import { captureVideoJobWalletCharge } from "../../src/server/consoleVideoJobPersistence.js";
import type { VideoJobRecord } from "../../src/server/consoleVideoJobTypes.js";
import { closeDatabase, openDatabase } from "../../src/server/db/client.js";
import { ensureDefaultWorkspace, runMigrations } from "../../src/server/db/migrate.js";
import { modelPricingSnapshotForUsage } from "../../src/server/modelPricing.js";
import { WalletStore } from "../../src/server/walletStore.js";

const tempDirs: string[] = [];

describe("video billing settlement", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("captures actual platform-model usage with the official price snapshot in wallet metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-video-billing-settlement-"));
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
      const reserved = walletStore.reserve({
        amountCny: 20,
        description: "视频生成预扣"
      });
      const billingPolicyStore = new BillingPolicyStore({ handle });
      const record: VideoJobRecord = {
        id: "job-actual-usage",
        workspaceId: "default",
        status: "completed",
        productPath: "/tmp/product.json",
        provider: "volcengine-seedance",
        providerModel: "doubao-seedance-2-0-260128",
        durationSeconds: 5,
        resolution: "1080p",
        aspectRatio: "16:9",
        confirmPaid: true,
        apiBillingMode: "platform",
        platformFeeCny: 1,
        upstreamEstimatedCostCny: 20,
        walletReservationId: reserved.reservationId,
        totalTokens: 243000,
        outDir: "/tmp/job",
        createdAt: "2026-06-28T00:00:00.000Z",
        updatedAt: "2026-06-28T00:00:00.000Z"
      };

      captureVideoJobWalletCharge({
        databaseHandle: handle,
        record,
        workspaceId: "default",
        billingPolicyStore
      });

      const charge = walletStore.getSummary().transactions.find((item) => item.type === "charge");
      expect(charge).toEqual(expect.objectContaining({
        amountCny: -13.39,
        jobId: "job-actual-usage"
      }));
      expect(charge?.metadata).toEqual(expect.objectContaining({
        apiBillingMode: "platform",
        platformFeeCny: 1,
        upstreamCostCny: 12.39,
        priceSnapshot: expect.objectContaining({
          catalogVersion: officialModelPricingUpdatedAt,
          model: "doubao-seedance-2.0",
          providerId: "volcengine",
          currency: "CNY",
          unit: "video_tokens_1m",
          unitPriceCny: 51,
          sourceUrl: "https://www.volcengine.com/docs/82379/1544106"
        })
      }));
    } finally {
      closeDatabase(handle);
    }
  });

  it("settles queued video jobs with the price snapshot locked at reservation time", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-video-billing-settlement-locked-snapshot-"));
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
      const lockedSnapshot = modelPricingSnapshotForUsage({
        kind: "video",
        model: "doubao-seedance-2-0-260128",
        resolution: "1080p",
        aspectRatio: "16:9",
        totalTokens: 243000,
        catalogVersion: "2026-06-28"
      });
      const reserved = walletStore.reserve({
        amountCny: 20,
        description: "视频生成预扣",
        metadata: {
          priceSnapshot: lockedSnapshot
        }
      });
      const billingPolicyStore = new BillingPolicyStore({ handle });
      const record: VideoJobRecord = {
        id: "job-locked-snapshot",
        workspaceId: "default",
        status: "completed",
        productPath: "/tmp/product.json",
        provider: "volcengine-seedance",
        providerModel: "doubao-seedance-2-0-260128",
        durationSeconds: 5,
        resolution: "1080p",
        aspectRatio: "16:9",
        confirmPaid: true,
        apiBillingMode: "platform",
        platformFeeCny: 1,
        upstreamEstimatedCostCny: 20,
        walletReservationId: reserved.reservationId,
        billingPriceSnapshot: lockedSnapshot,
        billingCatalogVersion: "2026-06-28",
        totalTokens: 243000,
        outDir: "/tmp/job",
        createdAt: "2026-06-28T00:00:00.000Z",
        updatedAt: "2026-06-28T00:00:00.000Z"
      };

      captureVideoJobWalletCharge({
        databaseHandle: handle,
        record,
        workspaceId: "default",
        billingPolicyStore,
        modelPricingCatalog: [
          {
            providerId: "volcengine",
            model: "doubao-seedance-2.0",
            aliases: ["doubao-seedance-2-0-260128"],
            kind: "video",
            resourceKey: "doubao-seedance-2.0",
            label: "高质量视频",
            unit: "/ 1M tokens",
            input: "¥99.00",
            output: "¥99.00",
            status: "verified",
            sourceUrl: "https://www.volcengine.com/docs/82379/1544106",
            videoTokenPriceCnyPerMillion: 99,
            videoTokenPriceCnyPerMillionByResolution: {
              "480p": 99,
              "720p": 99,
              "1080p": 99,
              "4k": 99
            },
            settlement: {
              kind: "video",
              unit: "video_tokens_1m",
              currency: "CNY",
              videoTokenPriceCnyPerMillion: 99,
              videoTokenPriceCnyPerMillionByResolution: {
                "480p": 99,
                "720p": 99,
                "1080p": 99,
                "4k": 99
              }
            }
          }
        ]
      });

      const charge = walletStore.getSummary().transactions.find((item) => item.type === "charge");
      expect(charge?.metadata?.priceSnapshot).toEqual(expect.objectContaining({
        catalogVersion: "2026-06-28",
        unitPriceCny: 51
      }));
    } finally {
      closeDatabase(handle);
    }
  });
});
