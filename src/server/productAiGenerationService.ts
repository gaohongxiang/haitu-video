import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";

import { compileProductPrompt, type ProductPromptCreativeStyle } from "../core/productPromptCompiler.js";
import { parseProductFacts } from "../core/productFacts.js";
import { resolveReferenceImages } from "../core/productAssetResolver.js";
import type { ScriptTemplate } from "../core/scriptGenerator.js";
import type { VideoAspectRatio } from "../providers/types.js";
import type { FinalVideoLanguage } from "../core/videoLanguage.js";
import type { AppLocale } from "../i18n/config.js";
import type { ModelPricingEntry } from "../modelPricing/officialModelPricingCatalog.js";
import {
  clampInteger,
  extensionFromMimeType
} from "./productAiGenerationContent.js";
import { createImageModelProvider } from "./modelProviderService.js";
import { selectModelConfig, selectedVideoModelConfig } from "./modelConfigSelection.js";
import type { BillingPolicyStore } from "./billingPolicyStore.js";
import type { ModelConfigStore } from "./modelConfigStore.js";
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
  referenceImages?: string[];
  locale?: AppLocale;
}

export interface StoryboardDraftRequest {
  duration?: number;
  aspectRatio?: VideoAspectRatio;
  finalLanguage?: FinalVideoLanguage;
  template?: ScriptTemplate;
  creativeStyle?: ProductPromptCreativeStyle;
  videoModelConfigId?: string;
  prompt?: string;
  referenceImages?: string[];
  locale?: AppLocale;
}

export interface ImagePromptDraftRequest {
  prompt?: string;
  targetImage?: string;
  imageModelConfigId?: string;
  referenceImages?: string[];
  locale?: AppLocale;
}

export interface GeneratedProductReferenceImage {
  path: string;
  reference: string;
}

export async function buildAiImagePromptDraft(input: {
  sku: string;
  fixturesDir: string;
  rootDir: string;
  modelConfigStore: ModelConfigStore;
  platformModelConfigStore?: ModelConfigStore;
  modelServicePreferenceStore?: ModelServicePreferenceStore;
  walletStore: WalletStore;
  billingPolicyStore: BillingPolicyStore;
  modelPricingCatalog?: readonly ModelPricingEntry[];
  modelPricingCatalogVersion?: string;
  fetchImpl?: typeof fetch;
  input: ImagePromptDraftRequest;
}): Promise<{ prompt: string; notes: string[] }> {
  const product = await getProductBySku({
    fixturesDir: input.fixturesDir,
    rootDir: input.rootDir,
    sku: input.sku
  });
  const imageModelConfigId = input.input.imageModelConfigId;
  const imageConfig = await selectModelConfig({
    modelConfigStore: input.modelConfigStore,
    platformModelConfigStore: input.platformModelConfigStore,
    modelServicePreferenceStore: input.modelServicePreferenceStore,
    capability: "image",
    requestedConfigId: imageModelConfigId
  });
  if (imageModelConfigId && imageModelConfigId !== "auto" && !imageConfig) {
    throw new Error("所选图片模型配置不存在或已被删除。");
  }
  const selectedReferenceImages = sanitizeReferenceImages(input.input.referenceImages);
  const targetReferences = selectedReferenceImages.length > 0
    ? selectedReferenceImages
    : sanitizeReferenceImages([input.input.targetImage]);
  const result = compileProductPrompt({
    locale: input.input.locale,
    mode: "image",
    product,
    userPrompt: input.input.prompt,
    referenceImages: targetReferences,
    targetModel: {
      providerId: "openai-compatible-image",
      vendor: imageConfig?.vendor,
      model: imageConfig?.model,
      baseUrl: imageConfig?.baseUrl
    }
  });
  return {
    prompt: result.prompt,
    notes: result.notes
  };
}

export async function buildAiStoryboardDraft(input: {
  sku: string;
  fixturesDir: string;
  rootDir: string;
  modelConfigStore: ModelConfigStore;
  platformModelConfigStore?: ModelConfigStore;
  modelServicePreferenceStore?: ModelServicePreferenceStore;
  walletStore: WalletStore;
  billingPolicyStore: BillingPolicyStore;
  modelPricingCatalog?: readonly ModelPricingEntry[];
  modelPricingCatalogVersion?: string;
  fetchImpl?: typeof fetch;
  input: StoryboardDraftRequest;
}): Promise<{ scriptLines: string[]; storyboardLines: string[]; storyboardCnLines: string[]; notes: string[] }> {
  const product = await getProductBySku({
    fixturesDir: input.fixturesDir,
    rootDir: input.rootDir,
    sku: input.sku
  });
  const duration = clampInteger(Number(input.input.duration ?? 8), 4, 15);
  const videoConfig = await selectedVideoModelConfig({
    modelConfigStore: input.modelConfigStore,
    platformModelConfigStore: input.platformModelConfigStore,
    modelServicePreferenceStore: input.modelServicePreferenceStore,
    provider: "volcengine-seedance",
    providerModelConfigId: input.input.videoModelConfigId
  });
  const promptResult = compileProductPrompt({
    locale: input.input.locale,
    mode: "video",
    product,
    userPrompt: input.input.prompt,
    referenceImages: sanitizeReferenceImages(input.input.referenceImages),
    targetModel: {
      providerId: "volcengine-seedance",
      vendor: videoConfig.vendor,
      model: videoConfig.model,
      baseUrl: videoConfig.baseUrl
    },
    video: {
      durationSeconds: duration,
      aspectRatio: input.input.aspectRatio,
      finalLanguage: input.input.finalLanguage,
      creativeStyle: input.input.creativeStyle
    }
  });
  return {
    scriptLines: [],
    storyboardLines: promptResult.prompt.split("\n"),
    storyboardCnLines: [],
    notes: promptResult.notes
  };
}

export async function generateProductReferenceImages(input: {
  fixturesDir: string;
  rootDir: string;
  sku: string;
  modelConfigStore: ModelConfigStore;
  platformModelConfigStore?: ModelConfigStore;
  modelServicePreferenceStore?: ModelServicePreferenceStore;
  walletStore: WalletStore;
  billingPolicyStore: BillingPolicyStore;
  modelPricingCatalog?: readonly ModelPricingEntry[];
  modelPricingCatalogVersion?: string;
  fetchImpl?: typeof fetch;
  input: GenerateProductReferenceImagesRequest;
}): Promise<{
  generated: GeneratedProductReferenceImage[];
  product: Awaited<ReturnType<typeof getProductBySku>>;
}> {
  const productFilePath = await findProductFileBySku(input.fixturesDir, input.sku);
  const rawProduct = JSON.parse(await readFile(productFilePath, "utf8")) as Record<string, unknown>;
  const product = parseProductFacts(rawProduct);
  const selectedReferenceImages = sanitizeReferenceImages(input.input.referenceImages);
  const count = clampInteger(
    Number(input.input.count ?? Math.max(1, Math.min(3, 3 - product.reference_images.length))),
    1,
    4
  );
  const imageModel = await createImageModelProvider({
    modelConfigStore: input.modelConfigStore,
    platformModelConfigStore: input.platformModelConfigStore,
    modelServicePreferenceStore: input.modelServicePreferenceStore,
    imageModelConfigId: input.input.imageModelConfigId,
    fetchImpl: input.fetchImpl
  });
  if (!imageModel.config.apiKey) {
    throw new Error("请先在 API 管理配置图片模型 API Key。");
  }
  const images = await runMeteredAiAction({
    walletStore: input.walletStore,
    billingPolicyStore: input.billingPolicyStore,
    kind: "image",
    modelConfig: imageModel.config,
    modelPricingCatalog: input.modelPricingCatalog,
    modelPricingCatalogVersion: input.modelPricingCatalogVersion,
    units: count,
    reserveDescription: "AI 图片生成预扣",
    chargeDescription: "AI 图片生成扣费",
    action: async () => imageModel.provider.generateImages({
      count,
      prompt: compileProductPrompt({
        locale: input.input.locale,
        mode: "image",
        product,
        userPrompt: input.input.prompt,
        referenceImages: selectedReferenceImages,
        targetModel: {
          providerId: "openai-compatible-image",
          vendor: imageModel.config.vendor,
          model: imageModel.config.model,
          baseUrl: imageModel.config.baseUrl
        }
      }).prompt,
      referenceImages: await imageGenerationReferences({
        productFilePath,
        referenceImages: selectedReferenceImages,
        fetchImpl: input.fetchImpl
      })
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

function sanitizeReferenceImages(referenceImages: unknown): string[] {
  if (!Array.isArray(referenceImages)) {
    return [];
  }
  return referenceImages
    .map((reference) => typeof reference === "string" ? reference.trim() : "")
    .filter(Boolean);
}

async function imageGenerationReferences(input: {
  productFilePath: string;
  referenceImages: string[];
  fetchImpl?: typeof fetch;
}) {
  const resolvedReferences = resolveReferenceImages(input.referenceImages, {
    productFilePath: input.productFilePath
  });
  return Promise.all(resolvedReferences.map((reference) => imageGenerationReference(reference, input.fetchImpl)));
}

async function imageGenerationReference(reference: string, fetchImpl?: typeof fetch) {
  if (reference.startsWith("http://") || reference.startsWith("https://")) {
    const fetchReference = fetchImpl ?? fetch;
    const response = await fetchReference(reference);
    if (!response.ok) {
      throw new Error("参考图地址无法访问。请重新上传这张图，或换一张能稳定访问的图片后再生成。");
    }
    const mimeType = normalizeReferenceMimeType(response.headers.get("content-type") ?? undefined);
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      fileName: imageReferenceFileName(reference, mimeType),
      mimeType
    };
  }
  return {
    bytes: await readFile(reference),
    fileName: imageReferenceFileName(reference),
    mimeType: mimeTypeFromReferencePath(reference)
  };
}

function imageReferenceFileName(reference: string, mimeType?: string): string {
  const name = basename(reference.split("?")[0] ?? reference);
  if (name.includes(".")) {
    return name;
  }
  if (mimeType === "image/jpeg") {
    return `${name || "reference"}.jpg`;
  }
  if (mimeType === "image/webp") {
    return `${name || "reference"}.webp`;
  }
  return `${name || "reference"}.png`;
}

function mimeTypeFromReferencePath(reference: string): string {
  const lower = reference.split("?")[0]?.toLowerCase() ?? "";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  return "image/png";
}

function normalizeReferenceMimeType(value: string | undefined): string {
  const mimeType = value?.split(";")[0]?.trim().toLowerCase();
  if (mimeType === "image/jpeg" || mimeType === "image/webp" || mimeType === "image/png") {
    return mimeType;
  }
  return "image/png";
}
