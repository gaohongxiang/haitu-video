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
import { listNamedFiles, resolveWithin } from "./consoleAssetService.js";
import type { FileConsoleSettingsStore } from "./consoleSettings.js";
import {
  buildPaidGenerationReadiness,
  describeReferenceImages,
  summarizeReferenceImages
} from "./productReadiness.js";
import { estimateVideoTokens } from "./videoJobBilling.js";
import { assertTemplateEnabled } from "./videoTemplateService.js";

export interface PreflightRequest {
  productPath: string;
  provider?: VideoProviderName;
  providerModelConfigId?: string;
  duration?: number;
  template?: ScriptTemplate;
  finalLanguage?: FinalVideoLanguage;
  cta?: string;
  scriptLines?: string[];
  storyboardLines?: string[];
}

export async function runConsolePreflight(
  body: PreflightRequest,
  options: {
    rootDir: string;
    outputsDir: string;
    settingsStore: FileConsoleSettingsStore;
  }
) {
  const productPath = resolveWithin(options.rootDir, body.productPath);
  const rawProduct = JSON.parse(await readFile(productPath, "utf8")) as unknown;
  const product = parseProductFacts(rawProduct);
  const settings = await options.settingsStore.read();
  const durationSeconds = body.duration ?? settings.defaultDurationSeconds;
  const template = body.template ?? settings.defaultTemplate;
  await assertTemplateEnabled({ template }, options.settingsStore);
  const provider = body.provider ?? settings.defaultProvider;
  const cta = body.cta ?? settings.defaultCta;
  const finalLanguage = normalizeFinalVideoLanguage(body.finalLanguage ?? settings.defaultLanguage);
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
    aspectRatio: "9:16",
    template,
    storyboardLines: sanitizeLines(body.storyboardLines),
    finalLanguage
  });
  const paidProvider = provider !== "mock";
  const estimatedTokens = estimateVideoTokens(durationSeconds);
  const tokenPriceCnyPerMillion = Number(process.env.SEEDANCE_TOKEN_PRICE_CNY_PER_MILLION ?? 37);
  const assetSummary = summarizeReferenceImages(referenceImages);
  const readiness = buildPaidGenerationReadiness(product, assetSummary);
  const estimatedCostCny = {
    low: estimateCny(estimatedTokens.low, tokenPriceCnyPerMillion),
    expected: estimateCny(estimatedTokens.expected, tokenPriceCnyPerMillion),
    high: estimateCny(estimatedTokens.high, tokenPriceCnyPerMillion)
  };
  return {
    productSku: product.sku,
    title_ja: product.title_ja,
    provider,
    durationSeconds,
    aspectRatio: "9:16",
    template,
    cta,
    paidProvider,
    requiresPaidConfirmation: paidProvider,
    referenceImages,
    assetSummary,
    script,
    prompt,
    estimatedTokens,
    tokenPriceCnyPerMillion,
    estimatedCostCny,
    credit: await summarizeTestCredit(options.outputsDir, {
      testCreditBalanceCny: settings.testCreditBalanceCny,
      estimatedCostCny: estimatedCostCny.expected
    }),
    readiness,
    warnings: buildPreflightWarnings(assetSummary)
  };
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

function sanitizeLines(lines?: string[]): string[] | undefined {
  const cleaned = (lines ?? []).map((line) => line.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}
