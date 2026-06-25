import { describe, expect, it } from "vitest";

import {
  consoleSectionFromUrl,
  consoleSectionUrl,
  productStudioProductSkuFromUrl,
  productStudioProductUrl,
  productStudioStepFromUrl,
  productStudioStepUrl,
  type ConsoleSection
} from "../../src/client/consoleNavigation.js";

describe("console navigation", () => {
  it("restores a valid console section from the URL", () => {
    expect(consoleSectionFromUrl("http://127.0.0.1:4173/?section=ledger")).toBe("ledger");
    expect(consoleSectionFromUrl("http://127.0.0.1:4173/?section=wallet")).toBe("wallet");
    expect(consoleSectionFromUrl("http://127.0.0.1:4173/?section=pricing")).toBe("pricing");
    expect(consoleSectionFromUrl("http://127.0.0.1:4173/?section=video")).toBe("video");
    expect(consoleSectionFromUrl("http://127.0.0.1:4173/?section=templates")).toBe("settings");
  });

  it("falls back to video creation for missing, unknown, or removed sections", () => {
    expect(consoleSectionFromUrl("http://127.0.0.1:4173/")).toBe("video");
    expect(consoleSectionFromUrl("http://127.0.0.1:4173/?section=all")).toBe("video");
    expect(consoleSectionFromUrl("http://127.0.0.1:4173/?section=review")).toBe("video");
    expect(consoleSectionFromUrl("http://127.0.0.1:4173/?section=products")).toBe("video");
  });

  it("builds a shareable URL for the selected section without dropping existing query state", () => {
    const url = consoleSectionUrl("http://127.0.0.1:4173/?provider=mock&section=dashboard", "ledger");

    expect(url).toBe("http://127.0.0.1:4173/?provider=mock&section=ledger");
  });

  it("drops product studio state when leaving video creation", () => {
    const url = consoleSectionUrl("http://127.0.0.1:4173/?section=video&step=storyboard&productSku=TK-001", "ledger");

    expect(url).toBe("http://127.0.0.1:4173/?section=ledger");
  });

  it("restores and writes the product studio step from the URL", () => {
    expect(productStudioStepFromUrl("http://127.0.0.1:4173/?section=video&step=storyboard")).toBe("storyboard");
    expect(productStudioStepFromUrl("http://127.0.0.1:4173/?section=video&step=review")).toBeUndefined();
    expect(productStudioStepFromUrl("http://127.0.0.1:4173/?section=video&step=unknown")).toBeUndefined();
    expect(productStudioStepUrl("http://127.0.0.1:4173/?section=video", "generate")).toBe("http://127.0.0.1:4173/?section=video&step=generate");
  });

  it("restores and writes the selected product for video creation", () => {
    expect(productStudioProductSkuFromUrl("http://127.0.0.1:4173/?section=video&productSku=TK-001")).toBe("TK-001");
    expect(productStudioProductSkuFromUrl("http://127.0.0.1:4173/?section=video")).toBe("");
    expect(productStudioProductUrl("http://127.0.0.1:4173/?section=video&step=generate", "TK-001")).toBe("http://127.0.0.1:4173/?section=video&step=generate&productSku=TK-001");
    expect(productStudioProductUrl("http://127.0.0.1:4173/?section=video&step=generate&productSku=TK-001", "")).toBe("http://127.0.0.1:4173/?section=video&step=generate");
  });

  it.each<ConsoleSection>(["dashboard", "video", "ledger", "wallet", "pricing", "settings"])(
    "accepts %s as a known console section",
    (section) => {
      expect(consoleSectionFromUrl(`http://127.0.0.1:4173/?section=${section}`)).toBe(section);
    }
  );
});
