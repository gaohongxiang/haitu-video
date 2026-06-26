export type FinalVideoLanguage = "ja" | "zh" | "en";

export const defaultFinalVideoLanguage: FinalVideoLanguage = "ja";

export function normalizeFinalVideoLanguage(value: unknown): FinalVideoLanguage {
  if (value === "en") return "en";
  return value === "zh" ? "zh" : defaultFinalVideoLanguage;
}

export function finalVideoLanguageLabel(language: FinalVideoLanguage): string {
  if (language === "en") return "English";
  return language === "zh" ? "Simplified Chinese" : "Japanese";
}

export function finalVideoLanguageUiLabel(language: FinalVideoLanguage): string {
  if (language === "en") return "英语";
  return language === "zh" ? "中文" : "日文";
}

export function finalVideoLanguageRestriction(language: FinalVideoLanguage): string {
  if (language === "en") {
    return "Do not use Japanese or Chinese text in the final video.";
  }
  return language === "zh"
    ? "Do not use Japanese or English text in the final video."
    : "Do not use Chinese or English text in the final video.";
}

export function providerScriptLanguageLabel(language: FinalVideoLanguage): string {
  if (language === "en") {
    return "Chinese operator storyboard notes; final video language is English";
  }
  return language === "zh"
    ? "Chinese operator storyboard notes; final video language is Simplified Chinese"
    : "Chinese operator storyboard notes; final video language is Japanese";
}
