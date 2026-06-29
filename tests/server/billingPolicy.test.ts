import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { BillingPolicyStore } from "../../src/server/billingPolicyStore.js";
import { closeDatabase, openDatabase } from "../../src/server/db/client.js";
import { ensureDefaultWorkspace, runMigrations } from "../../src/server/db/migrate.js";

const tempDirs: string[] = [];

describe("BillingPolicyStore", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("keeps platform service fees in database-backed metered policy rules", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-billing-policy-"));
    tempDirs.push(root);
    const handle = openDatabase({ dataDir: join(root, "data"), env: process.env });
    runMigrations(handle);
    ensureDefaultWorkspace(handle);
    try {
      const store = new BillingPolicyStore({ handle, now: () => new Date("2026-06-28T10:00:00.000Z") });

      expect(store.getSettings()).toEqual({
        policy: expect.objectContaining({
          policyId: "metered-generation",
          mode: "metered_generation",
          enabled: true
        }),
        rules: [
          expect.objectContaining({
            usageKind: "text",
            serviceFeeCny: 0.2,
            enabled: true
          }),
          expect.objectContaining({
            usageKind: "image",
            serviceFeeCny: 0.3,
            enabled: true
          }),
          expect.objectContaining({
            usageKind: "video",
            serviceFeeCny: 1,
            enabled: true
          })
        ]
      });

      const updated = store.updateSettings({
        rules: [
          { usageKind: "text", serviceFeeCny: 0.25 },
          { usageKind: "image", serviceFeeCny: 0.45 },
          { usageKind: "video", serviceFeeCny: 1.25 }
        ]
      });

      expect(updated.rules.map((rule) => [rule.usageKind, rule.serviceFeeCny])).toEqual([
        ["text", 0.25],
        ["image", 0.45],
        ["video", 1.25]
      ]);
      expect(new BillingPolicyStore({ handle }).getSettings().rules.map((rule) => [
        rule.usageKind,
        rule.serviceFeeCny
      ])).toEqual([
        ["text", 0.25],
        ["image", 0.45],
        ["video", 1.25]
      ]);
    } finally {
      closeDatabase(handle);
    }
  });
});
