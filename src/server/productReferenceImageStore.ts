import { readFile, writeFile } from "node:fs/promises";

import { parseProductFacts } from "../core/productFacts.js";
import { findProductFileBySku } from "./productFileStore.js";

export async function readProductReferenceImageFile(input: {
  fixturesDir: string;
  sku: string;
}): Promise<{
  productFilePath: string;
  rawProduct: Record<string, unknown>;
  product: ReturnType<typeof parseProductFacts>;
}> {
  const productFilePath = await findProductFileBySku(input.fixturesDir, input.sku);
  const rawProduct = JSON.parse(await readFile(productFilePath, "utf8")) as Record<string, unknown>;
  return {
    productFilePath,
    rawProduct,
    product: parseProductFacts(rawProduct)
  };
}

export async function writeProductReferenceImages(input: {
  productFilePath: string;
  rawProduct: Record<string, unknown>;
  referenceImages: string[];
}): Promise<void> {
  await writeFile(
    input.productFilePath,
    JSON.stringify(
      {
        ...input.rawProduct,
        reference_images: input.referenceImages
      },
      null,
      2
    ),
    "utf8"
  );
}
