import { dirname, isAbsolute, join } from "node:path";

export function resolveReferenceImages(
  referenceImages: string[],
  options: {
    productFilePath: string;
  }
): string[] {
  const productDir = dirname(options.productFilePath);
  return referenceImages.map((reference) => {
    if (isRemoteOrEncodedReference(reference) || isAbsolute(reference)) {
      return reference;
    }
    return join(productDir, reference);
  });
}

function isRemoteOrEncodedReference(reference: string): boolean {
  return (
    reference.startsWith("http://") ||
    reference.startsWith("https://") ||
    reference.startsWith("data:image/") ||
    reference.startsWith("asset://")
  );
}
