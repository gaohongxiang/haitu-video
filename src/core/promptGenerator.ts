import type { ProductFacts } from "./productFacts.js";
import type { ScriptTemplate } from "./scriptGenerator.js";
import type { VideoAspectRatio } from "../providers/types.js";
import {
  defaultFinalVideoLanguage,
  finalVideoLanguageLabel,
  finalVideoLanguageRestriction,
  type FinalVideoLanguage
} from "./videoLanguage.js";

export interface VideoPromptOptions {
  durationSeconds: number;
  aspectRatio: VideoAspectRatio;
  template: ScriptTemplate;
  storyboardLines?: string[];
  finalLanguage?: FinalVideoLanguage;
}

export function generateVideoPrompt(product: ProductFacts, options: VideoPromptOptions): string {
  const finalLanguage = options.finalLanguage ?? defaultFinalVideoLanguage;
  return [
    `Create a TikTok Shop product ad video for ${product.title_ja}.`,
    `Final video language: ${finalVideoLanguageLabel(finalLanguage)}.`,
    "If any text, caption, sticker, label, UI overlay, subtitle, voiceover, or spoken line appears, it must use the final video language only.",
    finalVideoLanguageRestriction(finalLanguage),
    "The storyboard below may be written in Chinese for operator readability; translate its intent into the final video language.",
    `Duration: ${options.durationSeconds} seconds. Aspect ratio: ${options.aspectRatio}.`,
    `Use these product reference images as strict visual references: ${product.reference_images.join(", ")}.`,
    `Keep the product color, shape, structure, and visible details consistent with the references.`,
    `Verified product facts only: ${product.verified_selling_points.join(", ")}.`,
    `Usage scenes: ${product.usage_scenes.join(", ")}.`,
    `Do not claim or imply: ${product.forbidden_claims.join(", ")}.`,
    options.storyboardLines?.some((line) => line.trim())
      ? "Operator-edited storyboard:"
      : "Soft storyboard in a single generation:",
    ...buildPromptStoryboard(options),
    "Do not create burned-in subtitles, prices, rankings, sales claims, or unreadable text."
  ].join("\n");
}

function buildPromptStoryboard(options: VideoPromptOptions): string[] {
  const editedLines = (options.storyboardLines ?? []).map((line) => line.trim()).filter(Boolean);
  return editedLines.length > 0 ? editedLines : buildStoryboard(options.durationSeconds);
}

function buildStoryboard(durationSeconds: number): string[] {
  if (durationSeconds <= 5) {
    return [
      "0-1s: 产品一开始就出现在画面里，用明确的使用场景做开场。",
      `1-${durationSeconds - 1}s: 清楚展示商品整体、细节近景和基础使用方式。`,
      `${durationSeconds - 1}-${durationSeconds}s: 停留在商品画面，给行动引导留出干净空间。`
    ];
  }

  if (durationSeconds <= 8) {
    return [
      "0-2s: 展示日常痛点或使用场景开场。",
      `2-${durationSeconds - 2}s: 清楚展示商品整体、细节近景和基础使用方式。`,
      `${durationSeconds - 2}-${durationSeconds}s: 停留在商品画面，给行动引导留出干净空间。`
    ];
  }

  return [
    "0-3s: 展示日常痛点或使用场景开场。",
    "3-8s: 清楚展示商品整体、细节近景和基础使用方式。",
    `8-${durationSeconds - 3}s: 展示商品在真实使用场景里的状态。`,
    `${durationSeconds - 3}-${durationSeconds}s: 停留在商品画面，给行动引导和价格信息留出干净空间。`
  ];
}
