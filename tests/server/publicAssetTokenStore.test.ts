import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { PublicAssetTokenStore } from "../../src/server/publicAssetTokenStore.js";

describe("PublicAssetTokenStore", () => {
  it("creates and resolves an unexpired token for a file inside the root", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-public-assets-"));
    const filePath = join(root, "image.png");
    await writeFile(filePath, "png");
    const store = new PublicAssetTokenStore({
      rootDir: root,
      now: () => new Date("2026-06-17T00:00:00.000Z")
    });

    const asset = store.create({
      filePath,
      mimeType: "image/png",
      workspaceId: "workspace-1",
      ttlMs: 60_000
    });

    expect(asset.urlPath).toMatch(/^\/api\/public-assets\/[A-Za-z0-9_-]+$/);
    expect(store.resolve(asset.token)).toEqual({
      token: asset.token,
      filePath: resolve(filePath),
      mimeType: "image/png",
      workspaceId: "workspace-1",
      expiresAt: "2026-06-17T00:01:00.000Z"
    });
  });

  it("rejects expired and unknown tokens", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-public-assets-"));
    const filePath = join(root, "image.png");
    await writeFile(filePath, "png");
    let now = new Date("2026-06-17T00:00:00.000Z");
    const store = new PublicAssetTokenStore({ rootDir: root, now: () => now });
    const asset = store.create({
      filePath,
      mimeType: "image/png",
      workspaceId: "workspace-1",
      ttlMs: 1_000
    });

    expect(store.resolve("missing")).toBeUndefined();
    now = new Date("2026-06-17T00:00:02.000Z");
    expect(store.resolve(asset.token)).toBeUndefined();
  });

  it("rejects paths outside the configured root", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-public-assets-"));
    const outside = await mkdtemp(join(tmpdir(), "haitu-outside-"));
    const store = new PublicAssetTokenStore({ rootDir: root });

    expect(() =>
      store.create({
        filePath: join(outside, "image.png"),
        mimeType: "image/png",
        workspaceId: "workspace-1",
        ttlMs: 60_000
      })
    ).toThrow("Public asset path must stay inside data root.");
  });
});
