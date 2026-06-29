import type { ProductStudioStepKey } from "./productStudioFlow.js";

export const consoleSections = ["dashboard", "video", "image", "ledger", "wallet", "pricing", "settings"] as const;

export type ConsoleSection = (typeof consoleSections)[number];

export const defaultConsoleSection: ConsoleSection = "video";
export const productStudioStepKeys = ["raw", "storyboard", "generate"] as const;

export function isConsoleSection(value: string | null | undefined): value is ConsoleSection {
  return consoleSections.includes(value as ConsoleSection);
}

export function consoleSectionFromUrl(currentUrl: string): ConsoleSection {
  const url = new URL(currentUrl);
  const section = url.searchParams.get("section");
  if (section === "templates") return "settings";
  if (section === "products") return "video";
  if (section === "transactions") return "wallet";
  return isConsoleSection(section) ? section : defaultConsoleSection;
}

export function consoleSectionUrl(currentUrl: string, section: ConsoleSection): string {
  const url = new URL(currentUrl);
  url.searchParams.set("section", section);
  if (section !== "video") {
    url.searchParams.delete("step");
    url.searchParams.delete("productSku");
  }
  return url.toString();
}

export function isProductStudioStep(value: string | null | undefined): value is ProductStudioStepKey {
  return productStudioStepKeys.includes(value as ProductStudioStepKey);
}

export function productStudioStepFromUrl(currentUrl: string): ProductStudioStepKey | undefined {
  const url = new URL(currentUrl);
  const step = url.searchParams.get("step");
  return isProductStudioStep(step) ? step : undefined;
}

export function productStudioStepUrl(currentUrl: string, step: ProductStudioStepKey): string {
  const url = new URL(currentUrl);
  url.searchParams.set("section", "video");
  url.searchParams.set("step", step);
  return url.toString();
}

export function productStudioProductSkuFromUrl(currentUrl: string): string {
  const url = new URL(currentUrl);
  return url.searchParams.get("productSku")?.trim() ?? "";
}

export function productStudioProductUrl(currentUrl: string, productSku: string): string {
  const url = new URL(currentUrl);
  url.searchParams.set("section", "video");
  if (productSku.trim()) {
    url.searchParams.set("productSku", productSku.trim());
  } else {
    url.searchParams.delete("productSku");
  }
  return url.toString();
}
