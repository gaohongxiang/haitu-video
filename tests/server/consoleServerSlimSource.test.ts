import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const assetReportRoutesPath = "src/server/assetReportRoutes.ts";

describe("console server slim source boundaries", () => {
  it("does not keep pass-through wrappers around extracted services", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const assetReportRoutesSource = await readFile(assetReportRoutesPath, "utf8");

    expect(consoleServerSource).not.toContain("async function buildWorkspaceJobLedger(");
    expect(consoleServerSource).toContain("createConsoleRequestHandler(");
    expect(consoleServerSource).not.toContain("handleConsoleApiRoutes(");
    expect(consoleServerSource).not.toContain("handleAssetReportRoutes(");
    expect(consoleServerSource).not.toContain("buildJobLedger(requestContext.outputsDir");
    expect(assetReportRoutesSource).toContain("buildJobLedger(requestContext.outputsDir");
  });
});
