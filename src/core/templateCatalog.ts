import type { ScriptTemplate } from "./scriptGenerator.js";

export interface VideoTemplateDefinition {
  id: ScriptTemplate;
  label: string;
  purpose: string;
  opening: string;
  storyboard: string[];
}

export interface TemplateCatalogState {
  templates: Array<VideoTemplateDefinition & {
    enabled: boolean;
    isDefault: boolean;
  }>;
  enabledTemplates: ScriptTemplate[];
  defaultTemplate: ScriptTemplate;
}

export const videoTemplateDefinitions: VideoTemplateDefinition[] = [
  {
    id: "scene",
    label: "场景型",
    purpose: "突出真实使用场景，适合日用品、收纳、服饰配件等常规商品。",
    opening: "从买家日常场景切入，先看到商品，再展示细节。",
    storyboard: ["0-2s 场景开场", "2-6s 商品细节和使用", "6-8s 定格 CTA"]
  },
  {
    id: "pain-point",
    label: "痛点型",
    purpose: "先点出使用前的不便，再用商品事实解决问题，适合功能明确的商品。",
    opening: "用一个轻痛点开场，不夸大功效，不制造焦虑。",
    storyboard: ["0-2s 痛点/不便", "2-6s 商品解决方式", "6-8s 卖点和 CTA"]
  },
  {
    id: "benefit",
    label: "卖点型",
    purpose: "快速罗列 2-3 个已验证卖点，适合卖点清晰、图片信息丰富的商品。",
    opening: "商品第一秒露出，随后切近景解释已验证卖点。",
    storyboard: ["0-2s 商品露出", "2-6s 卖点近景", "6-8s 使用场景和 CTA"]
  },
  {
    id: "ugc",
    label: "UGC 型",
    purpose: "模拟买家口吻做轻推荐，适合 TikTok 引流和自然种草。",
    opening: "用“これ、...”这类自然日语开场，避免硬广腔。",
    storyboard: ["0-2s 手持/使用感开场", "2-6s 商品体验", "6-8s 自然 CTA"]
  },
  {
    id: "unboxing",
    label: "开箱型",
    purpose: "强调打开、拿取、展示结构，适合钱包、收纳、配件等有结构细节的商品。",
    opening: "从开箱或打开商品开始，清楚展示内部结构。",
    storyboard: ["0-2s 打开/取出", "2-6s 结构细节", "6-8s 定格 CTA"]
  }
];

export const allTemplateIds = videoTemplateDefinitions.map((template) => template.id);

export function buildTemplateCatalogState(input: {
  enabledTemplates?: ScriptTemplate[];
  defaultTemplate: ScriptTemplate;
}): TemplateCatalogState {
  const enabledTemplates = normalizeEnabledTemplates(input.enabledTemplates);
  const defaultTemplate = enabledTemplates.includes(input.defaultTemplate)
    ? input.defaultTemplate
    : enabledTemplates[0];
  return {
    templates: videoTemplateDefinitions.map((template) => ({
      ...template,
      enabled: enabledTemplates.includes(template.id),
      isDefault: template.id === defaultTemplate
    })),
    enabledTemplates,
    defaultTemplate
  };
}

export function normalizeEnabledTemplates(value: unknown): ScriptTemplate[] {
  if (!Array.isArray(value)) {
    return [...allTemplateIds];
  }
  const enabled = value.filter(isScriptTemplate);
  const unique = Array.from(new Set(enabled));
  return unique.length > 0 ? unique : [...allTemplateIds];
}

export function isScriptTemplate(value: unknown): value is ScriptTemplate {
  return allTemplateIds.includes(value as ScriptTemplate);
}
