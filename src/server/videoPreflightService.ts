import { readFile } from "node:fs/promises";

import { resolveReferenceImages } from "../core/productAssetResolver.js";
import { parseProductFacts } from "../core/productFacts.js";
import { generateVideoPrompt } from "../core/promptGenerator.js";
import type { ScriptTemplate } from "../core/scriptGenerator.js";
import { generateJapaneseAdScript } from "../core/scriptGenerator.js";
import { normalizeFinalVideoLanguage, type FinalVideoLanguage } from "../core/videoLanguage.js";
import { maxSeedanceReferenceImages } from "../core/videoProviderErrors.js";
import type { MakeVideoReport } from "../pipeline/makeVideoPipeline.js";
import type { VideoProviderName } from "../providers/providerFactory.js";
import type { VideoAspectRatio, VideoResolution } from "../providers/types.js";
import { normalizeVideoAspectRatio } from "../providers/videoGeometry.js";
import type { BillingPolicyStore } from "./billingPolicyStore.js";
import { listNamedFiles, resolveWithin } from "./consoleAssetService.js";
import type { ConsoleSettingsStore } from "./consoleSettings.js";
import {
  buildPaidGenerationReadiness,
  describeReferenceImages,
  summarizeReferenceImages
} from "./productReadiness.js";
import {
  estimateVideoTokens,
  tokenPriceCnyPerMillionForVideoModel
} from "./videoJobBilling.js";
import { assertTemplateEnabled } from "./videoTemplateService.js";
import type { ModelBundleStore } from "./modelBundleStore.js";
import type { ModelConfigStore } from "./modelConfigStore.js";
import { resolveVideoRequestModel } from "./modelConfigSelection.js";
import type { ModelServicePreferenceStore } from "./modelServicePreferenceStore.js";

export interface PreflightRequest {
  productPath: string;
  provider?: VideoProviderName;
  providerModelConfigId?: string;
  duration?: number;
  template?: ScriptTemplate;
  finalLanguage?: FinalVideoLanguage;
  cta?: string;
  providerModel?: string;
  resolution?: VideoResolution;
  aspectRatio?: VideoAspectRatio;
  scriptLines?: string[];
  storyboardLines?: string[];
}

export async function runConsolePreflight(
  body: PreflightRequest,
  options: {
    rootDir: string;
    outputsDir: string;
    settingsStore: ConsoleSettingsStore;
    billingPolicyStore?: BillingPolicyStore;
    modelConfigStore?: ModelConfigStore;
    platformModelConfigStore?: ModelConfigStore;
    modelBundleStore?: ModelBundleStore;
    modelServicePreferenceStore?: ModelServicePreferenceStore;
  }
) {
  const productPath = resolveWithin(options.rootDir, body.productPath);
  const rawProduct = JSON.parse(await readFile(productPath, "utf8")) as unknown;
  const product = parseProductFacts(rawProduct);
  const settings = await options.settingsStore.read();
  const durationSeconds = body.duration ?? settings.defaultDurationSeconds;
  const resolution = normalizeVideoResolution(body.resolution);
  const aspectRatio = normalizeVideoAspectRatio(body.aspectRatio);
  const template = body.template ?? settings.defaultTemplate;
  await assertTemplateEnabled({ template }, options.settingsStore);
  const provider = body.provider ?? settings.defaultProvider;
  const cta = body.cta ?? settings.defaultCta;
  const finalLanguage = normalizeFinalVideoLanguage(body.finalLanguage ?? settings.defaultLanguage);
  const videoModel = await preflightVideoModel({
    provider,
    body,
    modelConfigStore: options.modelConfigStore,
    platformModelConfigStore: options.platformModelConfigStore,
    modelBundleStore: options.modelBundleStore,
    modelServicePreferenceStore: options.modelServicePreferenceStore
  });
  const apiBillingMode = videoModel.config?.apiOwner === "platform" ? "platform" : "byok";
  const platformServiceFeeCny = paidProviderServiceFee(options.billingPolicyStore);
  const referenceImages = await describeReferenceImages(product.reference_images, {
    productFilePath: productPath,
    rootDir: options.rootDir
  });
  const productWithResolvedImages = {
    ...product,
    reference_images: resolveReferenceImages(product.reference_images, {
      productFilePath: productPath
    }).slice(0, maxSeedanceReferenceImages)
  };
  const script = generateJapaneseAdScript(product, {
    cta,
    template,
    scriptLines: sanitizeLines(body.scriptLines),
    finalLanguage
  });
  const prompt = generateVideoPrompt(productWithResolvedImages, {
    durationSeconds,
    aspectRatio,
    template,
    storyboardLines: sanitizeLines(body.storyboardLines),
    finalLanguage
  });
  const paidProvider = provider !== "mock";
  const estimatedTokens = estimateVideoTokens(durationSeconds, resolution, aspectRatio);
  const providerModel = videoModel.providerModel;
  const tokenPriceCnyPerMillion = tokenPriceCnyPerMillionForVideoModel(providerModel, resolution);
  const assetSummary = summarizeReferenceImages(referenceImages);
  const readiness = buildPaidGenerationReadiness(product, assetSummary);
  const upstreamEstimatedCostCny = {
    low: paidProvider ? estimateCny(estimatedTokens.low, tokenPriceCnyPerMillion) : 0,
    expected: paidProvider ? estimateCny(estimatedTokens.expected, tokenPriceCnyPerMillion) : 0,
    high: paidProvider ? estimateCny(estimatedTokens.high, tokenPriceCnyPerMillion) : 0
  };
  const serviceFeeCny = {
    low: paidProvider ? platformServiceFeeCny : 0,
    expected: paidProvider ? platformServiceFeeCny : 0,
    high: paidProvider ? platformServiceFeeCny : 0
  };
  const estimatedCostCny = upstreamEstimatedCostCny;
  const walletEstimatedChargeCny = {
    low: roundMoney((apiBillingMode === "platform" ? upstreamEstimatedCostCny.low : 0) + serviceFeeCny.low),
    expected: roundMoney((apiBillingMode === "platform" ? upstreamEstimatedCostCny.expected : 0) + serviceFeeCny.expected),
    high: roundMoney((apiBillingMode === "platform" ? upstreamEstimatedCostCny.high : 0) + serviceFeeCny.high)
  };
  return {
    productSku: product.sku,
    title_ja: product.title_ja,
    provider,
    durationSeconds,
    resolution,
    aspectRatio,
    template,
    cta,
    paidProvider,
    apiBillingMode,
    requiresPaidConfirmation: paidProvider,
    referenceImages,
    assetSummary,
    script,
    prompt,
    estimatedTokens,
    tokenPriceCnyPerMillion,
    upstreamEstimatedCostCny,
    serviceFeeCny,
    walletEstimatedChargeCny,
    estimatedCostCny,
    credit: await summarizeTestCredit(options.outputsDir, {
      testCreditBalanceCny: settings.testCreditBalanceCny,
      estimatedCostCny: estimatedCostCny.expected
    }),
    readiness,
    warnings: buildPreflightWarnings(assetSummary)
  };
}

async function preflightVideoModel(input: {
  provider: VideoProviderName;
  body: Pick<PreflightRequest, "providerModelConfigId" | "providerModel">;
  modelConfigStore?: ModelConfigStore;
  platformModelConfigStore?: ModelConfigStore;
  modelBundleStore?: ModelBundleStore;
  modelServicePreferenceStore?: ModelServicePreferenceStore;
}): Promise<{ providerModel?: string; config?: { apiOwner?: string } }> {
  if (input.provider === "mock" || !input.modelConfigStore) {
    return {
      providerModel: input.provider === "mock" ? input.body.providerModel : undefined
    };
  }
  try {
    const resolved = await resolveVideoRequestModel({
      modelConfigStore: input.modelConfigStore,
      platformModelConfigStore: input.platformModelConfigStore,
      modelBundleStore: input.modelBundleStore,
      modelServicePreferenceStore: input.modelServicePreferenceStore,
      provider: input.provider,
      body: input.body
    });
    return {
      providerModel: resolved.providerModel,
      config: resolved.config
    };
  } catch {
    return {
      providerModel: undefined
    };
  }
}

function paidProviderServiceFee(store?: BillingPolicyStore): number {
  if (!store) {
    return 0;
  }
  try {
    return store.getRule("video").serviceFeeCny;
  } catch {
    return 0;
  }
}

function normalizeVideoResolution(value: unknown): VideoResolution {
  if (value === "720p" || value === "1080p" || value === "4k") {
    return value;
  }
  return "480p";
}

function buildPreflightWarnings(assetSummary: ReturnType<typeof summarizeReferenceImages>): string[] {
  const warnings: string[] = [];
  if (assetSummary.total > maxSeedanceReferenceImages) {
    warnings.push(`Seedance 最多支持 ${maxSeedanceReferenceImages} 张参考图，本次会只使用前 ${maxSeedanceReferenceImages} 张。`);
  }
  if (assetSummary.missing > 0) {
    warnings.push(`${assetSummary.missing} reference image ${assetSummary.missing === 1 ? "is" : "are"} missing.`);
  }
  if (assetSummary.outsideProjectRoot > 0) {
    warnings.push(
      `${assetSummary.outsideProjectRoot} reference image ${assetSummary.outsideProjectRoot === 1 ? "is" : "are"} outside the project root.`
    );
  }
  if (assetSummary.previewable === 0 && assetSummary.remote === 0) {
    warnings.push("No previewable reference images are available.");
  }
  return warnings;
}

async function summarizeTestCredit(
  outputsDir: string,
  input: {
    testCreditBalanceCny: number;
    estimatedCostCny: number;
  }
) {
  const usedEstimatedCostCny = await sumPaidEstimatedCostCny(outputsDir);
  const availableEstimatedCostCny = Math.max(0, Math.round((input.testCreditBalanceCny - usedEstimatedCostCny) * 100) / 100);
  return {
    testCreditBalanceCny: input.testCreditBalanceCny,
    usedEstimatedCostCny,
    availableEstimatedCostCny,
    estimatedCostCny: input.estimatedCostCny,
    enoughCredit: input.testCreditBalanceCny <= 0 || input.estimatedCostCny <= availableEstimatedCostCny
  };
}

async function sumPaidEstimatedCostCny(outputsDir: string): Promise<number> {
  const files = await listNamedFiles(outputsDir, "make-video-report.json");
  let total = 0;
  for (const file of files) {
    const report = JSON.parse(await readFile(file, "utf8")) as Partial<MakeVideoReport>;
    if (report.provider === "mock") {
      continue;
    }
    total += Number(report.billing?.estimatedCostCny ?? 0);
  }
  return Math.round(total * 100) / 100;
}

function estimateCny(tokens: number, tokenPriceCnyPerMillion: number): number {
  return Math.round((tokens / 1_000_000) * tokenPriceCnyPerMillion * 100) / 100;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function sanitizeLines(lines?: string[]): string[] | undefined {
  const cleaned = (lines ?? []).map((line) => line.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}
