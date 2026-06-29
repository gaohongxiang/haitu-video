import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getAdminSiteSettings } from "../../src/server/adminSiteSettings.js";
import { SqliteConsoleSettingsStore } from "../../src/server/consoleSettings.js";
import { closeDatabase, openDatabase, type DatabaseHandle } from "../../src/server/db/client.js";
import { ensureDefaultWorkspace, runMigrations } from "../../src/server/db/migrate.js";

const tempDirs: string[] = [];

describe("admin site settings", () => {
  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("returns site-level configuration status without exposing secrets", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_site_settings");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_site_settings");
    vi.stubEnv("INFINI_PUBLIC_KEY", "");
    vi.stubEnv("INFINI_PRIVATE_KEY", "");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "");
    const { handle, close } = await openTestDatabase("haitu-admin-site-settings-");
    try {
      const settingsStore = new SqliteConsoleSettingsStore({ handle });
      await settingsStore.write({
        defaultCta: "今すぐチェック",
        defaultProvider: "volcengine-seedance",
        paymentMethods: [
          {
            id: "stripe",
            label: "Stripe",
            kind: "rmb",
            enabled: true,
            description: "RMB"
          },
          {
            id: "infini",
            label: "Infini",
            kind: "crypto",
            enabled: false,
            description: "Crypto"
          }
        ]
      });

      const response = await getAdminSiteSettings({
        handle,
        settingsStore,
        env: process.env
      });

      expect(response.sections.map((item) => item.id)).toEqual([
        "public-pages",
        "seo-geo",
        "payments",
        "model-services",
        "billing",
        "model-pricing"
      ]);
      expect(response.publicPages).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "home", status: "configured" }),
        expect.objectContaining({ id: "pricing", status: "configured" })
      ]));
      expect(response.paymentMethods).toEqual([
        expect.objectContaining({
          id: "stripe",
          enabled: true,
          configured: true,
          available: true
        }),
        expect.objectContaining({
          id: "infini",
          enabled: false,
          configured: false,
          available: false
        })
      ]);
      expect(JSON.stringify(response)).not.toContain("sk_test_site_settings");
      expect(JSON.stringify(response)).not.toContain("whsec_site_settings");
      expect(response.modelPricing.activeVersion).toBeTruthy();
      expect(response.modelPricing.entryCount).toBeGreaterThan(0);
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
