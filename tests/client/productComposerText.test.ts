import { describe, expect, it } from "vitest";

import {
  draftReferenceImageStatuses,
  defaultProductDraft,
  productComposerTextToDraft,
  removeDraftReferenceImage,
  removeReferenceFromComposerText
} from "../../src/client/productComposerText.js";

describe("productComposerTextToDraft", () => {
  it("extracts bare image URLs from pasted product text into reference images", () => {
    const imageUrl = "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/c5633a662f964e4889c530fd4fd4b263~tplv-o3syd03w52-origin-jpeg.jpeg?dr=15568&t=555f072d";

    const draft = productComposerTextToDraft([
      "标题：接触冷感アームカバー",
      "分类：アームカバー",
      "材质：ポリエステル",
      "尺寸/重量：約52cm",
      "卖点：通気性のある生地",
      imageUrl
    ].join("\n"), defaultProductDraft);

    expect(draft.reference_images).toBe(imageUrl);
  });

  it("turns draft image URLs into previewable reference statuses before saving", () => {
    const imageUrl = "https://cdn.example.test/reference.webp?token=1";

    expect(draftReferenceImageStatuses({
      ...defaultProductDraft,
      reference_images: imageUrl
    })).toEqual([
      {
        original: imageUrl,
        resolvedPath: imageUrl,
        previewUrl: imageUrl,
        status: "remote"
      }
    ]);
  });

  it("removes a draft reference URL from the unsaved product draft", () => {
    expect(removeDraftReferenceImage({
      ...defaultProductDraft,
      reference_images: [
        "https://cdn.example.test/main.jpg",
        "https://cdn.example.test/detail.jpg"
      ].join("\n")
    }, "https://cdn.example.test/main.jpg").reference_images).toBe("https://cdn.example.test/detail.jpg");
  });

  it("removes a parsed image URL from product text without rewriting the rest", () => {
    const imageUrl = "https://cdn.example.test/main.jpg";

    expect(removeReferenceFromComposerText([
      "这是用户原始粘贴的商品资料",
      imageUrl,
      "材质看起来像 PU"
    ].join("\n"), imageUrl)).toBe([
      "这是用户原始粘贴的商品资料",
      "材质看起来像 PU"
    ].join("\n"));
  });
});
