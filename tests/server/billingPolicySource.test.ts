import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const storePath = "src/server/billingPolicyStore.ts";
const videoBillingPath = "src/server/videoJobBilling.ts";
const aiBillingPath = "src/server/aiBilling.ts";
const adminSettingsPath = "src/server/adminBillingSettings.ts";
const adminRoutesPath = "src/server/authAdminRoutes.ts";

describe("billing policy source boundaries", () => {
  it("keeps generation service fees in policy store and upstream costs in model pricing", async () => {
    const storeSource = await readFile(storePath, "utf8");
    const videoBillingSource = await readFile(videoBillingPath, "utf8");
    const aiBillingSource = await readFile(aiBillingPath, "utf8");
    const adminSettingsSource = await readFile(adminSettingsPath, "utf8");
    const adminRoutesSource = await readFile(adminRoutesPath, "utf8");

    await expect(access(storePath)).resolves.toBeUndefined();
    expect(storeSource).toContain("export class BillingPolicyStore");
    expect(storeSource).toContain("billing_price_rules");
    expect(storeSource).not.toContain("upstream_unit_cost_cents");
    expect(storeSource).not.toContain("upstreamUnitCostCny");
    expect(adminSettingsSource).toContain("new BillingPolicyStore");
    expect(adminRoutesSource).toContain('url.pathname === "/api/admin/billing-settings"');
    expect(videoBillingSource).toContain("billingPolicyStore.getRule(\"video\")");
    expect(aiBillingSource).toContain("input.billingPolicyStore.getRule(input.kind)");
    expect(videoBillingSource).toContain("estimateVideoUpstreamCostCny");
    expect(aiBillingSource).toContain("estimateAiUpstreamCostCny");
    expect(videoBillingSource).not.toContain("HAITU_PLATFORM_FEE_CNY_PER_VIDEO");
    expect(aiBillingSource).not.toContain("HAITU_PLATFORM_FEE_CNY_PER_TEXT");
    expect(aiBillingSource).not.toContain("HAITU_PLATFORM_FEE_CNY_PER_IMAGE");
  });
});
