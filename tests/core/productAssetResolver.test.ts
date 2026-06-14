import { describe, expect, it } from "vitest";

import { resolveReferenceImages } from "../../src/core/productAssetResolver.js";

describe("resolveReferenceImages", () => {
  it("resolves relative product image paths against the product file directory", () => {
    const references = resolveReferenceImages(["main.jpg", "detail/detail1.png"], {
      productFilePath: "/data/workspaces/default/products/TK-001/product.json"
    });

    expect(references).toEqual([
      "/data/workspaces/default/products/TK-001/main.jpg",
      "/data/workspaces/default/products/TK-001/detail/detail1.png"
    ]);
  });

  it("keeps remote URLs, data URLs, and asset IDs unchanged", () => {
    const references = resolveReferenceImages(
      [
        "https://example.com/main.jpg",
        "data:image/png;base64,abc",
        "asset://seedance-material-id"
      ],
      {
        productFilePath: "/data/workspaces/default/products/TK-001/product.json"
      }
    );

    expect(references).toEqual([
      "https://example.com/main.jpg",
      "data:image/png;base64,abc",
      "asset://seedance-material-id"
    ]);
  });
});
