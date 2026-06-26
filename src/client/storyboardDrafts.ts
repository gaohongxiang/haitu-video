import type { ProductDetail } from "./productWorkflowViewModel.js";

export type StoryboardTemplateName = "scene" | "pain-point" | "benefit" | "ugc" | "unboxing";

export const storyboardTemplateNames: StoryboardTemplateName[] = ["scene", "pain-point", "benefit", "ugc", "unboxing"];

const defaultVideoDurationSeconds = 10;

export function isStoryboardTemplateName(value: unknown): value is StoryboardTemplateName {
  return typeof value === "string" && storyboardTemplateNames.includes(value as StoryboardTemplateName);
}

export function templateLabel(value?: string): string {
  if (value === "scene") return "场景型";
  if (value === "pain-point") return "痛点型";
  if (value === "benefit") return "卖点型";
  if (value === "ugc") return "UGC 型";
  if (value === "unboxing") return "开箱型";
  return value || "-";
}

export function splitDraftLines(value: string): string[] | undefined {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : undefined;
}

export function defaultStoryboardDraft(template: StoryboardTemplateName, durationSeconds: number): string {
  const ranges = storyboardTimeRanges(durationSeconds);
  return defaultStoryboardDraftForTemplate(template)
    .map((description, index) => `${ranges[index]}: ${description}`)
    .join("\n");
}

export function defaultStoryboardDraftForTemplate(template: StoryboardTemplateName): string[] {
  const descriptions: Record<StoryboardTemplateName, string[]> = {
    scene: [
      "展示商品所处的真实使用环境和整体外观。",
      "切近景展示使用动作，让商品自然进入画面主体。",
      "展示材质、尺寸、结构和手部操作细节。",
      "回到完整使用场景，呈现使用后的效果和商品整体。"
    ],
    "pain-point": [
      "先展示没有使用商品时的不便或痛点场景。",
      "切到商品出现并快速解决核心问题。",
      "用近景强化关键卖点和操作过程。",
      "展示解决后的轻松状态和商品整体。"
    ],
    benefit: [
      "开场直接展示最重要的卖点和结果。",
      "用近景说明卖点对应的结构或材质细节。",
      "切换到使用过程，连续展示多个优势。",
      "用整体彩色或多角度画面收束，强化购买理由。"
    ],
    ugc: [
      "以手持或第一视角开场，像真实用户刚拿到商品。",
      "边展示边试用，用自然动作呈现第一感受。",
      "近景拍摄细节、材质和使用中的小发现。",
      "用真实使用后的评价式画面收尾。"
    ],
    unboxing: [
      "从包装或桌面开场，展示开箱前的整洁画面。",
      "打开包装并取出商品，让主体自然进入镜头。",
      "依次展示配件、材质、尺寸和关键细节。",
      "摆放商品并进入简单使用场景，完成开箱收尾。"
    ]
  };
  return descriptions[template] ?? descriptions.scene;
}

export function storyboardTimeRanges(durationSeconds: number): string[] {
  const duration = Math.max(4, Math.min(15, Math.floor(durationSeconds || defaultVideoDurationSeconds)));
  const firstEnd = Math.max(1, Math.min(2, Math.floor(duration * 0.2)));
  const secondEnd = Math.max(firstEnd + 1, Math.min(duration - 2, Math.floor(duration * 0.4)));
  const thirdEnd = Math.max(secondEnd + 1, Math.min(duration - 1, Math.floor(duration * 0.7)));
  return [
    `0-${firstEnd}s`,
    `${firstEnd}-${secondEnd}s`,
    `${secondEnd}-${thirdEnd}s`,
    `${thirdEnd}-${duration}s`
  ];
}

export function defaultStudioScriptDraft(product: ProductDetail, durationSeconds: number, template: StoryboardTemplateName): string {
  const scenes = safeChineseDraftText(product.usage_scenes.slice(0, 2).join("、"), "日常使用");
  const sellingPoints = product.verified_selling_points.slice(0, 3).map((point, index) => safeChineseDraftFact(point, index === 0 ? "核心卖点" : "已确认卖点"));
  const materialsText = safeChineseDraftText(product.materials.join("、"), "材质细节");
  return [
    `类型: ${templateLabel(template)} / 时长: ${durationSeconds}s`,
    `面向${scenes}场景里的用户，开头 1 秒先展示痛点或使用场景。`,
    `自然展示「${product.title_ja}」的外观，以及${sellingPoints[0] || "商品资料里确认过的核心卖点"}。`,
    `用手部动作展示${sellingPoints.slice(1).join("、") || "商品资料中已确认的特点"}。`,
    product.materials.length > 0 ? `加入能看出${materialsText}的近景。` : ""
  ].filter(Boolean).join("\n");
}

export function defaultStudioStoryboardDraft(product: ProductDetail, durationSeconds: number, template: StoryboardTemplateName): string {
  const firstScene = safeChineseDraftText(product.usage_scenes[0], "使用场景");
  const firstPoint = safeChineseDraftFact(product.verified_selling_points[0], "商品细节");
  const middle = Math.max(2, Math.floor(durationSeconds * 0.45));
  const closing = Math.max(middle + 1, durationSeconds - 2);
  return [
    `0-2s: 以${templateLabel(template)}开场，展示${firstScene}和商品整体。`,
    `2-${middle}s: 近景展示${firstPoint}。`,
    `${middle}-${closing}s: 展示使用中的手部动作、质感和尺寸感。`,
    `${closing}-${durationSeconds}s: 再次展示使用后的效果和商品整体。`
  ].join("\n");
}

export function defaultStudioStoryboardCnDraft(product: ProductDetail, durationSeconds: number, template: StoryboardTemplateName): string {
  const firstScene = safeChineseDraftText(product.usage_scenes[0], "使用场景");
  const firstPoint = safeChineseDraftFact(product.verified_selling_points[0], "商品细节");
  const middle = Math.max(2, Math.floor(durationSeconds * 0.45));
  const closing = Math.max(middle + 1, durationSeconds - 2);
  return [
    `0-2 秒：以${templateLabel(template)}开场，展示${firstScene}和商品整体。`,
    `2-${middle} 秒：近景展示${firstPoint}。`,
    `${middle}-${closing} 秒：展示使用中的手部动作、质感和尺寸感。`,
    `${closing}-${durationSeconds} 秒：再次展示使用后的效果和商品整体。`
  ].join("\n");
}

function safeChineseDraftFact(value: string | undefined, fallback: string): string {
  return safeChineseDraftText(value, fallback);
}

function safeChineseDraftText(value: string | undefined, fallback: string): string {
  if (!value?.trim()) {
    return fallback;
  }
  return containsJapaneseKana(value) ? fallback : value.trim();
}

function containsJapaneseKana(value: string): boolean {
  return /[\u3040-\u30ffー]/.test(value);
}
