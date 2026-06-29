import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ProductFacts } from "../core/productFacts.js";
import { generateJapaneseHashtags } from "../core/japaneseHashtags.js";
import { generateVideoPrompt } from "../core/promptGenerator.js";
import { maxSeedanceReferenceImages } from "../core/videoProviderErrors.js";
import {
  generateJapaneseAdScript,
  type GeneratedScript,
  type ScriptTemplate
} from "../core/scriptGenerator.js";
import { defaultFinalVideoLanguage, type FinalVideoLanguage } from "../core/videoLanguage.js";
import type { BasicQcReport } from "../qc/basicQc.js";
import { runBasicQc } from "../qc/basicQc.js";
import type { MoneyAmount, VideoAspectRatio, VideoProvider, VideoProviderResult, VideoResolution } from "../providers/types.js";
import { defaultVideoResolution, normalizeVideoAspectRatio } from "../providers/videoGeometry.js";

export interface ProductJobManifest {
  jobId: string;
  status: "completed" | "failed";
  product: {
    sku: string;
    title_ja: string;
    category?: string;
    materials?: string[];
    verified_selling_points?: string[];
    usage_scenes?: string[];
  };
  version: number;
  provider: {
    name: string;
    model: string;
    taskId?: string;
  };
  script: GeneratedScript;
  prompt: string;
  output: VideoProviderResult["output"];
  usage?: VideoProviderResult["usage"];
  qc: BasicQcReport;
  cost: {
    provider: MoneyAmount;
    total: MoneyAmount;
  };
  hashtags: string[];
  paths: {
    outputDir: string;
    manifest: string;
  };
}

export async function runProductJob(input: {
  product: ProductFacts;
  version: number;
  outputRoot: string;
  provider: VideoProvider;
  cta: string;
  template: ScriptTemplate;
  durationSeconds?: number;
  resolution?: VideoResolution;
  aspectRatio?: VideoAspectRatio;
  scriptLines?: string[];
  storyboardLines?: string[];
  finalLanguage?: FinalVideoLanguage;
}): Promise<ProductJobManifest> {
  const durationSeconds = input.durationSeconds ?? 8;
  const aspectRatio = normalizeVideoAspectRatio(input.aspectRatio);
  const finalLanguage = input.finalLanguage ?? defaultFinalVideoLanguage;
  const jobId = `${input.product.sku}-v${input.version}`;
  const outputDir = join(input.outputRoot, input.product.sku, `v${input.version}`);
  await mkdir(outputDir, { recursive: true });

  const script = generateJapaneseAdScript(input.product, {
    cta: input.cta,
    template: input.template,
    scriptLines: input.scriptLines,
    finalLanguage
  });
  const generationProduct = {
    ...input.product,
    reference_images: input.product.reference_images.slice(0, maxSeedanceReferenceImages)
  };
  const prompt = generateVideoPrompt(generationProduct, {
    durationSeconds,
    aspectRatio,
    template: input.template,
    storyboardLines: input.storyboardLines,
    finalLanguage
  });
  const providerResult = await input.provider.generateVideo({
    jobId,
    productSku: input.product.sku,
    prompt,
    script: script.voiceover,
    durationSeconds,
    aspectRatio,
    resolution: input.resolution,
    outputDir,
    referenceImages: generationProduct.reference_images,
    finalLanguage
  });
  const qc = runBasicQc({
    product: input.product,
    script,
    output: providerResult.output,
    targetDurationSeconds: durationSeconds,
    targetAspectRatio: aspectRatio,
    targetResolution: input.resolution ?? defaultVideoResolution
  });
  const hashtags = generateJapaneseHashtags({
    product: input.product,
    script,
    variantKey: jobId
  });
  const manifestPath = join(outputDir, "manifest.json");
  const manifest: ProductJobManifest = {
    jobId,
    status: qc.result === "fail" ? "failed" : "completed",
    product: {
      sku: input.product.sku,
      title_ja: input.product.title_ja,
      category: input.product.category,
      materials: input.product.materials,
      verified_selling_points: input.product.verified_selling_points,
      usage_scenes: input.product.usage_scenes
    },
    version: input.version,
    provider: {
      name: providerResult.provider,
      model: providerResult.model,
      taskId: providerResult.providerTaskId
    },
    script,
    prompt,
    output: providerResult.output,
    usage: providerResult.usage,
    qc,
    cost: {
      provider: providerResult.cost,
      total: providerResult.cost
    },
    hashtags,
    paths: {
      outputDir,
      manifest: manifestPath
    }
  };

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  return manifest;
}
