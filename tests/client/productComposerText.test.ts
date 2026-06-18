import { describe, expect, it } from "vitest";

import {
  defaultProductDraft,
  productComposerTextToDraft
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
});
