import { describe, expect, it } from "vitest";

import {
  finalVideoLanguageLabel,
  finalVideoLanguageRestriction,
  finalVideoLanguageUiLabel,
  normalizeFinalVideoLanguage,
  providerScriptLanguageLabel
} from "../../src/core/videoLanguage.js";

describe("video language helpers", () => {
  it("supports English as a final video language", () => {
    expect(normalizeFinalVideoLanguage("en")).toBe("en");
    expect(finalVideoLanguageLabel("en")).toBe("English");
    expect(finalVideoLanguageUiLabel("en")).toBe("英语");
    expect(finalVideoLanguageRestriction("en")).toContain("Do not use Japanese or Chinese text");
    expect(providerScriptLanguageLabel("en")).toContain("final video language is English");
  });
});
