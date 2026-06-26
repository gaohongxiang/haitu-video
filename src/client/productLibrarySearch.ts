export interface ProductLibrarySearchItem {
  sku: string;
  title_ja: string;
  path?: string;
}

function normalizeProductLibrarySearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\s+/g, "");
}

export function productLibraryFuzzyMatch(text: string, query: string): boolean {
  const normalizedText = normalizeProductLibrarySearchText(text);
  const normalizedQuery = normalizeProductLibrarySearchText(query);
  if (!normalizedQuery) return true;
  if (normalizedText.includes(normalizedQuery)) return true;

  let queryIndex = 0;
  for (const char of normalizedText) {
    if (char === normalizedQuery[queryIndex]) {
      queryIndex += 1;
      if (queryIndex === normalizedQuery.length) {
        return true;
      }
    }
  }
  return false;
}

export function filterProductLibraryProducts<T extends ProductLibrarySearchItem>(
  products: T[],
  query: string,
  extraSearchText: (product: T) => string[] = () => []
): T[] {
  const normalizedQuery = normalizeProductLibrarySearchText(query);
  if (!normalizedQuery) return products;

  return products.filter((product) => {
    const searchableText = [
      product.title_ja,
      product.sku,
      product.path ?? "",
      ...extraSearchText(product)
    ].join(" ");
    return productLibraryFuzzyMatch(searchableText, normalizedQuery);
  });
}
