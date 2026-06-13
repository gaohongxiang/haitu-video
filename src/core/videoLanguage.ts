export type FinalVideoLanguage = "ja" | "zh";

export const defaultFinalVideoLanguage: FinalVideoLanguage = "ja";

export function normalizeFinalVideoLanguage(value: unknown): FinalVideoLanguage {
  return value === "zh" ? "zh" : defaultFinalVideoLanguage;
}

export function finalVideoLanguageLabel(language: FinalVideoLanguage): string {
  return language === "zh" ? "Simplified Chinese" : "Japanese";
}

export function finalVideoLanguageUiLabel(language: FinalVideoLanguage): string {
  return language === "zh" ? "中文" : "日文";
}

export function finalVideoLanguageRestriction(language: FinalVideoLanguage): string {
  return language === "zh"
    ? "Do not use Japanese or English text in the final video."
    : "Do not use Chinese or English text in the final video.";
}

export function providerScriptLanguageLabel(language: FinalVideoLanguage): string {
  return language === "zh"
    ? "Chinese operator storyboard notes; final video language is Simplified Chinese"
    : "Chinese operator storyboard notes; final video language is Japanese";
}
