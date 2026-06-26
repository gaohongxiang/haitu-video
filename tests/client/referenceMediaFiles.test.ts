import { describe, expect, it, vi } from "vitest";

import {
  isReferenceImageFile,
  isSameOriginMediaReference,
  mediaReferenceFileName,
  mediaReferenceMimeType,
  mediaReferenceToFile
} from "../../src/client/referenceMediaFiles.js";

describe("reference media file helpers", () => {
  it("accepts supported image files by MIME type or extension", () => {
    expect(isReferenceImageFile(new File([""], "photo.jpeg", { type: "image/jpeg" }))).toBe(true);
    expect(isReferenceImageFile(new File([""], "photo.PNG", { type: "" }))).toBe(true);
    expect(isReferenceImageFile(new File([""], "photo.webp", { type: "application/octet-stream" }))).toBe(true);
    expect(isReferenceImageFile(new File([""], "photo.gif", { type: "image/gif" }))).toBe(false);
    expect(isReferenceImageFile(new File([""], "notes.txt", { type: "text/plain" }))).toBe(false);
  });

  it("detects same-origin media references with supported image paths", () => {
    const currentHref = "https://console.example.test/workbench?tab=video";

    expect(isSameOriginMediaReference("/media?path=products/a.jpg", currentHref)).toBe(true);
    expect(isSameOriginMediaReference("https://console.example.test/media?path=products/a.webp", currentHref)).toBe(true);
    expect(isSameOriginMediaReference("https://cdn.example.test/media?path=products/a.jpg", currentHref)).toBe(false);
    expect(isSameOriginMediaReference("/media?path=products/a.gif", currentHref)).toBe(false);
    expect(isSameOriginMediaReference("/other?path=products/a.jpg", currentHref)).toBe(false);
    expect(isSameOriginMediaReference("not a url", currentHref)).toBe(false);
  });

  it("converts same-origin media references to files with stable names and MIME fallbacks", async () => {
    const blob = new Blob(["image-bytes"], { type: "" });
    const fetchMedia = vi.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => blob
    }));

    const file = await mediaReferenceToFile("/media?path=products/nested/photo.webp", {
      currentHref: "https://console.example.test/video",
      fetchMedia,
      FileCtor: File
    });

    expect(fetchMedia).toHaveBeenCalledWith("/media?path=products/nested/photo.webp");
    expect(file.name).toBe("photo.webp");
    expect(file.type).toBe("image/webp");
    expect(mediaReferenceFileName(new URL("https://console.example.test/media?path=products/raw"), "image/png")).toBe("copied-reference.png");
    expect(mediaReferenceMimeType("reference.JPG")).toBe("image/jpeg");
  });

  it("surfaces media fetch failures with the existing Chinese error text", async () => {
    await expect(mediaReferenceToFile("/media?path=missing.jpg", {
      currentHref: "https://console.example.test/video",
      fetchMedia: async () => ({ ok: false, status: 404, blob: async () => new Blob() }),
      FileCtor: File
    })).rejects.toThrow("参考图读取失败: HTTP 404");
  });
});
