import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const publicRoutesPath = "src/server/consolePublicRoutes.ts";
const runtimePath = "src/server/consoleServerRuntime.ts";
const servicePath = "src/server/consoleAssetService.ts";
const publicReferencePath = "src/server/publicReferenceAssetService.ts";

describe("console asset service source boundaries", () => {
  it("keeps media, public asset, and static asset response helpers out of the HTTP server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const publicRoutesSource = await readFile(publicRoutesPath, "utf8");
    const runtimeSource = await readFile(runtimePath, "utf8");

    await expect(access(servicePath)).resolves.toBeUndefined();
    await expect(access(publicReferencePath)).resolves.toBeUndefined();
    expect(consoleServerSource).not.toContain('from "./consoleAssetService.js"');
    expect(publicRoutesSource).toContain('from "./consoleAssetService.js"');
    expect(runtimeSource).toContain('from "./consoleAssetService.js"');
    expect(consoleServerSource).not.toContain("async function mediaResponse(");
    expect(consoleServerSource).not.toContain("async function publicAssetResponse(");
    expect(consoleServerSource).not.toContain("async function consoleAssetResponse(");
    expect(consoleServerSource).not.toContain("function mediaContentType(");
    expect(consoleServerSource).not.toContain("function assetContentType(");
    expect(consoleServerSource).not.toContain("function createReferenceImageUrlResolver(");
    expect(runtimeSource).toContain("createReferenceImageUrlResolver(");
    expect(runtimeSource).toContain("publicBaseUrlFromEnv(");
    expect(consoleServerSource).not.toContain("async function cacheRemoteReferenceForPublicAsset(");
    expect(consoleServerSource).not.toContain("function resolveWithin(");
    expect(consoleServerSource).not.toContain("async function listNamedFiles(");
  });

  it("centralizes console asset serving and path helpers", async () => {
    const serviceSource = await readFile(servicePath, "utf8");

    expect(serviceSource).toContain("export async function mediaResponse(");
    expect(serviceSource).toContain("export async function publicAssetResponse(");
    expect(serviceSource).toContain("export async function consoleAssetResponse(");
    expect(serviceSource).toContain('from "./publicReferenceAssetService.js"');
    expect(serviceSource).not.toContain("export function createReferenceImageUrlResolver(");
    expect(serviceSource).not.toContain("async function cacheRemoteReferenceForPublicAsset(");
    expect(serviceSource).not.toContain("function localReferencePathForPublicAsset(");
    expect(serviceSource).toContain("export function resolveWithin(");
    expect(serviceSource).toContain("export async function listNamedFiles(");
    expect(serviceSource).toContain("export function publicBaseUrlFromEnv(");
  });

  it("centralizes public reference URL resolution and cache handling", async () => {
    const publicReferenceSource = await readFile(publicReferencePath, "utf8");

    expect(publicReferenceSource).toContain("export const publicAssetTokenTtlMs");
    expect(publicReferenceSource).toContain("export function createReferenceImageUrlResolver(");
    expect(publicReferenceSource).toContain("async function cacheRemoteReferenceForPublicAsset(");
    expect(publicReferenceSource).toContain("function localReferencePathForPublicAsset(");
    expect(publicReferenceSource).toContain("function mimeTypeForAssetPath(");
  });
});
