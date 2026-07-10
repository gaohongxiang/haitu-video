import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { PublicAssetTokenStore } from "../../src/server/publicAssetTokenStore.js";
import {
  createReferenceImageUrlResolver,
  mediaResponse,
  publicAssetResponse,
  queryValue,
  resolveWithin
} from "../../src/server/consoleAssetService.js";

describe("console asset service", () => {
  it("serves local media with the expected content type", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-media-"));
    const videoPath = join(root, "outputs", "final.mp4");
    await mkdir(join(videoPath, ".."), { recursive: true });
    await writeFile(videoPath, "video-bytes");

    const response = await mediaResponse(videoPath, {
      rootDir: root,
      head: false
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    await expect(response.text()).resolves.toBe("video-bytes");
  });

  it("rejects media paths outside the configured root", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-media-root-"));

    expect(() => resolveWithin(root, "../outside.mp4")).toThrow("Path is outside project root");
  });

  it("returns missing public asset responses for absent or expired tokens", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-public-assets-"));
    let now = new Date("2026-06-26T00:00:00.000Z");
    const store = new PublicAssetTokenStore({
      rootDir: root,
      now: () => now
    });
    const assetPath = join(root, "public", "reference.jpg");
    await mkdir(join(assetPath, ".."), { recursive: true });
    await writeFile(assetPath, "asset-bytes");
    const token = store.create({
      filePath: assetPath,
      mimeType: "image/jpeg",
      workspaceId: "default",
      ttlMs: 1000
    });

    const fresh = await publicAssetResponse(store, token.token, { head: false });
    now = new Date("2026-06-26T00:00:02.000Z");
    const expired = await publicAssetResponse(store, token.token, { head: false });

    expect(fresh.status).toBe(200);
    expect(fresh.headers.get("content-type")).toBe("image/jpeg");
    await expect(fresh.text()).resolves.toBe("asset-bytes");
    expect(expired.status).toBe(404);
    await expect(expired.json()).resolves.toEqual({ error: "Public asset not found or expired." });
  });

  it("creates public URLs for cached remote reference images", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-reference-url-"));
    const store = new PublicAssetTokenStore({ rootDir: root });
    const fetchImpl = vi.fn(async () => new Response(Buffer.from("remote-image"), {
      headers: { "content-type": "image/jpeg" }
    })) as unknown as typeof fetch;
    const resolver = createReferenceImageUrlResolver({
      dataDir: root,
      workspaceId: "default",
      publicBaseUrl: "https://console.example.test/app/",
      publicAssetTokenStore: store,
      fetchImpl
    });

    const resolvedUrl = await resolver?.("https://cdn.example.test/reference.jpg?x=1");

    expect(resolvedUrl).toMatch(/^https:\/\/console\.example\.test\/app\/api\/public-assets\/[A-Za-z0-9_-]+$/);
    expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toBe("https://cdn.example.test/reference.jpg?x=1");
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]).toEqual(expect.objectContaining({ redirect: "manual" }));
    const token = resolvedUrl?.split("/").pop() ?? "";
    const record = store.resolve(token);
    expect(record).toEqual(expect.objectContaining({
      mimeType: "image/jpeg",
      workspaceId: "default"
    }));
    expect(record?.filePath).toContain(resolve(root, "workspaces", "default", "system", "public-reference-cache"));
    await expect(readFile(record?.filePath ?? "", "utf8")).resolves.toBe("remote-image");
  });

  it("normalizes all-valued query params to undefined", () => {
    const url = new URL("http://localhost/api/reports?status=all&model=seedance");

    expect(queryValue(url, "status")).toBeUndefined();
    expect(queryValue(url, "provider")).toBeUndefined();
    expect(queryValue(url, "model")).toBe("seedance");
  });
});
