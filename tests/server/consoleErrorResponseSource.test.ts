import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const requestHandlerPath = "src/server/consoleRequestHandler.ts";
const servicePath = "src/server/consoleErrorResponse.ts";

describe("console error response source boundaries", () => {
  it("keeps API error-to-status mapping out of the console server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const requestHandlerSource = await readFile(requestHandlerPath, "utf8");

    await expect(access(servicePath)).resolves.toBeUndefined();
    expect(consoleServerSource).not.toContain('from "./consoleErrorResponse.js"');
    expect(consoleServerSource).not.toContain("consoleErrorResponse(");
    expect(requestHandlerSource).toContain('from "./consoleErrorResponse.js"');
    expect(requestHandlerSource).toContain("consoleErrorResponse(");
    expect(consoleServerSource).not.toContain('message.includes("Can cancel only queued tasks")');
    expect(consoleServerSource).not.toContain('message.includes("Unknown model provider target")');
    expect(consoleServerSource).not.toContain('message.includes("Selected final job must belong")');
    expect(consoleServerSource).not.toContain("error instanceof InsufficientWalletBalanceError");
    expect(consoleServerSource).not.toContain("aiInsufficientBalanceMessage");
  });

  it("centralizes existing console API error mappings", async () => {
    const serviceSource = await readFile(servicePath, "utf8");

    expect(serviceSource).toContain("export function consoleErrorResponse(");
    expect(serviceSource).toContain('message.includes("Can cancel only queued tasks")');
    expect(serviceSource).toContain('message.includes("Unknown model provider target")');
    expect(serviceSource).toContain('message.includes("Selected final job must belong")');
    expect(serviceSource).toContain("error instanceof InsufficientWalletBalanceError");
    expect(serviceSource).toContain("aiInsufficientBalanceMessage");
  });
});
