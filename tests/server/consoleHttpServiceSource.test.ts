import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const servicePath = "src/server/consoleHttpService.ts";

describe("console HTTP service source boundaries", () => {
  it("keeps response, static asset, and Node HTTP bridge helpers out of the server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");

    await expect(access(servicePath)).resolves.toBeUndefined();
    expect(consoleServerSource).toContain('from "./consoleHttpService.js"');
    expect(consoleServerSource).not.toContain("function jsonResponse(");
    expect(consoleServerSource).not.toContain("function csvResponse(");
    expect(consoleServerSource).not.toContain("function userFacingErrorMessage(");
    expect(consoleServerSource).not.toContain("async function readConsoleIndex(");
    expect(consoleServerSource).not.toContain("async function readStatic(");
    expect(consoleServerSource).not.toContain("async function staticResponse(");
    expect(consoleServerSource).not.toContain("async function nodeRequestToFetch(");
    expect(consoleServerSource).not.toContain("async function writeNodeResponse(");
  });

  it("centralizes console HTTP response and static file helpers", async () => {
    const serviceSource = await readFile(servicePath, "utf8");

    expect(serviceSource).toContain("export function jsonResponse(");
    expect(serviceSource).toContain("export function csvResponse(");
    expect(serviceSource).toContain("export function userFacingErrorMessage(");
    expect(serviceSource).toContain("export async function readConsoleIndex(");
    expect(serviceSource).toContain("export async function staticResponse(");
    expect(serviceSource).toContain("export async function nodeRequestToFetch(");
    expect(serviceSource).toContain("export async function writeNodeResponse(");
    expect(serviceSource).toContain("export function nodeResponseHeaders(");
    expect(serviceSource).toContain("headers.getSetCookie()");
    expect(serviceSource).toContain("ZodError");
  });
});
