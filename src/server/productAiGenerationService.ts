import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { parseProductFacts } from "../core/productFacts.js";
import type { ScriptTemplate } from "../core/scriptGenerator.js";
import {
  isScriptTemplate,
  videoTemplateDefinitions
} from "../core/templateCatalog.js";
import {
  buildChineseScriptFallback,
  buildChineseStoryboardFallback,
  buildProductReferenceImagePrompt,
  clampInteger,
  extensionFromMimeType,
  hasJapaneseOutsideAllowedProductNames,
  normalizeStringArray
} from "./productAiGenerationContent.js";
import { createImageModelProvider, createTextModelProvider } from "./modelProviderService.js";
import type { ModelConfigStore } from "./modelConfigStore.js";
import { ModelBundleStore } from "./modelBundleStore.js";
import { ModelServicePreferenceStore } from "./modelServicePreferenceStore.js";
import { findProductFileBySku } from "./productFileStore.js";
import {
  getProductBySku,
  nextAvailableReferenceImageTarget
} from "./productService.js";
import { WalletStore } from "./walletStore.js";
import { runMeteredAiAction } from "./aiBilling.js";

export interface GenerateProductReferenceImagesRequest {
  count?: number;
  prompt?: string;
  imageModelConfigId?: string;
}

export interface StoryboardDraftRequest {
  duration?: number;
  template?: ScriptTemplate;
  textModelConfigId?: string;
}

export interface GeneratedProductReferenceImage {
  path: string;
  reference: string;
}

export async function buildAiStoryboardDraft(input: {
  sku: string;
  fixturesDir: string;
  rootDir: string;
  modelConfigStore: ModelConfigStore;
  platformModelConfigStore?: ModelConfigStore;
  modelBundleStore?: ModelBundleStore;
  modelServicePreferenceStore?: ModelServicePreferenceStore;
  walletStore: WalletStore;
  fetchImpl?: typeof fetch;
  input: StoryboardDraftRequest;
}): Promise<{ scriptLines: string[]; storyboardLines: string[]; storyboardCnLines: string[]; notes: string[] }> {
  const product = await getProductBySku({
    fixturesDir: input.fixturesDir,
    rootDir: input.rootDir,
    sku: input.sku
  });
  const duration = clampInteger(Number(input.input.duration ?? 8), 4, 15);
  const template = isScriptTemplate(input.input.template) ? input.input.template : "scene";
  const textModel = await createTextModelProvider({
    modelConfigStore: input.modelConfigStore,
    platformModelConfigStore: input.platformModelConfigStore,
    modelBundleStore: input.modelBundleStore,
    modelServicePreferenceStore: input.modelServicePreferenceStore,
    textModelConfigId: input.input.textModelConfigId,
    fetchImpl: input.fetchImpl
  });
  const templateDefinition = videoTemplateDefinitions.find((item) => item.id === template);
  const draft = await runMeteredAiAction({
    walletStore: input.walletStore,
    kind: "text",
    modelConfig: textModel.config,
    reserveDescription: "AI 分镜预扣",
    chargeDescription: "AI 分镜扣费",
    action: () => textModel.provider.generateJson<{
      scriptLines?: unknown;
      storyboardLines?: unknown;
      storyboardCnLines?: unknown;
      notes?: unknown;
    }>({
      system: [
        "你是 TikTok 商品短视频脚本分镜助手。",
        "只输出 JSON object，不要 markdown。",
        "输出字段必须是 scriptLines、storyboardLines、storyboardCnLines、notes，四者都是字符串数组。",
        "scriptLines 必须使用简体中文，是给操作员参考的画面要点，不写字幕时间轴，不写 CTA。",
        "storyboardLines 必须使用简体中文，是视频分镜脚本，按秒数描述画面顺序、卖点出现位置和镜头节奏。",
        "storyboardCnLines 必须使用简体中文，是 storyboardLines 对应的生成说明，逐条解释镜头意图和注意点，不新增未经确认卖点。",
        "不要在 scriptLines、storyboardLines、storyboardCnLines 中使用英文句子或日文句子；商品名可保留原文。",
        "必须遵守 forbidden_claims，不要使用未确认功效、销量、排名、UV 数值等宣称。"
      ].join("\n"),
      user: [
        `视频类型: ${template}`,
        `视频类型说明: ${templateDefinition?.purpose ?? ""}`,
        `视频时长: ${duration}s`,
        "商品资料 JSON:",
        JSON.stringify({
          title_ja: product.title_ja,
          category: product.category,
          materials: product.materials,
          dimensions: product.dimensions,
          verified_selling_points: product.verified_selling_points,
          usage_scenes: product.usage_scenes,
          forbidden_claims: product.forbidden_claims,
          reference_images: product.reference_images
        }, null, 2)
      ].join("\n")
    })
  });
  const scriptLines = normalizeStringArray(draft.scriptLines);
  const storyboardLines = normalizeStringArray(draft.storyboardLines);
  const storyboardCnLines = normalizeStringArray(draft.storyboardCnLines);
  if (scriptLines.length === 0 || storyboardLines.length === 0 || storyboardCnLines.length === 0) {
    throw new Error("文本模型返回的脚本分镜不完整。");
  }
  if (hasJapaneseOutsideAllowedProductNames([...scriptLines, ...storyboardLines, ...storyboardCnLines], product.title_ja)) {
    const fallbackStoryboard = buildChineseStoryboardFallback({
      duration,
      template,
      product
    });
    return {
      scriptLines: buildChineseScriptFallback(product, template, duration),
      storyboardLines: fallbackStoryboard,
      storyboardCnLines: fallbackStoryboard,
      notes: [
        "文本模型返回内容混入日文，已改用中文模板分镜。",
        ...normalizeStringArray(draft.notes)
      ]
    };
  }
  return {
    scriptLines,
    storyboardLines,
    storyboardCnLines,
    notes: normalizeStringArray(draft.notes)
  };
}

export async function generateProductReferenceImages(input: {
  fixturesDir: string;
  rootDir: string;
  sku: string;
  modelConfigStore: ModelConfigStore;
  platformModelConfigStore?: ModelConfigStore;
  modelBundleStore?: ModelBundleStore;
  modelServicePreferenceStore?: ModelServicePreferenceStore;
  walletStore: WalletStore;
  fetchImpl?: typeof fetch;
  input: GenerateProductReferenceImagesRequest;
}): Promise<{
  generated: GeneratedProductReferenceImage[];
  product: Awaited<ReturnType<typeof getProductBySku>>;
}> {
  const productFilePath = await findProductFileBySku(input.fixturesDir, input.sku);
  const rawProduct = JSON.parse(await readFile(productFilePath, "utf8")) as Record<string, unknown>;
  const product = parseProductFacts(rawProduct);
  const count = clampInteger(
    Number(input.input.count ?? Math.max(1, Math.min(3, 3 - product.reference_images.length))),
    1,
    4
  );
  const imageModel = await createImageModelProvider({
    modelConfigStore: input.modelConfigStore,
    platformModelConfigStore: input.platformModelConfigStore,
    modelBundleStore: input.modelBundleStore,
    modelServicePreferenceStore: input.modelServicePreferenceStore,
    imageModelConfigId: input.input.imageModelConfigId,
    fetchImpl: input.fetchImpl
  });
  const images = await runMeteredAiAction({
    walletStore: input.walletStore,
    kind: "image",
    modelConfig: imageModel.config,
    units: count,
    reserveDescription: "AI 图片生成预扣",
    chargeDescription: "AI 图片生成扣费",
    action: () => imageModel.provider.generateImages({
      count,
      prompt: buildProductReferenceImagePrompt(product, input.input.prompt)
    }),
    actualUnits: (result) => result.length
  });
  const nextReferenceImages = [...product.reference_images];
  const generated: GeneratedProductReferenceImage[] = [];
  for (const image of images) {
    const target = await nextAvailableReferenceImageTarget({
      productFilePath,
      referenceImages: nextReferenceImages,
      startIndex: nextReferenceImages.length + 1,
      extension: extensionFromMimeType(image.mimeType)
    });
    const targetPath = target.path;
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, image.bytes);
    const reference = target.reference;
    nextReferenceImages.push(reference);
    generated.push({
      path: targetPath,
      reference
    });
  }
  await writeFile(
    productFilePath,
    JSON.stringify(
      {
        ...rawProduct,
        reference_images: nextReferenceImages
      },
      null,
      2
    ),
    "utf8"
  );
  return {
    generated,
    product: await getProductBySku({
      fixturesDir: input.fixturesDir,
      rootDir: input.rootDir,
      sku: input.sku
    })
  };
}
