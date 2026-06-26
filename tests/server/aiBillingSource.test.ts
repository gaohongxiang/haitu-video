import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const consoleErrorResponsePath = "src/server/consoleErrorResponse.ts";
const aiBillingPath = "src/server/aiBilling.ts";

describe("AI billing source boundaries", () => {
  it("keeps generic metered AI billing behind service and error response modules", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const consoleErrorResponseSource = await readFile(consoleErrorResponsePath, "utf8");

    await expect(access(aiBillingPath)).resolves.toBeUndefined();
    expect(consoleServerSource).not.toContain('from "./aiBilling.js"');
    expect(consoleErrorResponseSource).toContain('from "./aiBilling.js"');
    expect(consoleServerSource).not.toContain("async function runMeteredAiAction");
    expect(consoleServerSource).not.toContain("function platformFeeCnyForAi(");
    expect(consoleServerSource).not.toContain("function estimatedAiUpstreamCostCny(");
  });

  it("centralizes AI reserve, capture, release, and insufficient-balance messaging", async () => {
    const aiBillingSource = await readFile(aiBillingPath, "utf8");

    expect(aiBillingSource).toContain("export const aiInsufficientBalanceMessage");
    expect(aiBillingSource).toContain("export async function runMeteredAiAction");
    expect(aiBillingSource).toContain("walletStore.reserve");
    expect(aiBillingSource).toContain("walletStore.capture");
    expect(aiBillingSource).toContain("walletStore.release");
    expect(aiBillingSource).toContain("InsufficientWalletBalanceError");
  });
});
