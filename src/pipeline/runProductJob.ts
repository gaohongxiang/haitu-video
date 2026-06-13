import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ProductFacts } from "../core/productFacts.js";
import { generateVideoPrompt } from "../core/promptGenerator.js";
import {
  generateJapaneseAdScript,
  type GeneratedScript,
  type ScriptTemplate
} from "../core/scriptGenerator.js";
import { defaultFinalVideoLanguage, type FinalVideoLanguage } from "../core/videoLanguage.js";
import type { BasicQcReport } from "../qc/basicQc.js";
import { runBasicQc } from "../qc/basicQc.js";
import type { MoneyAmount, VideoProvider, VideoProviderResult } from "../providers/types.js";

export interface ProductJobManifest {
  jobId: string;
  status: "completed" | "failed";
  product: {
    sku: string;
    title_ja: string;
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
  scriptLines?: string[];
  storyboardLines?: string[];
  finalLanguage?: FinalVideoLanguage;
}): Promise<ProductJobManifest> {
  const durationSeconds = input.durationSeconds ?? 8;
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
  const prompt = generateVideoPrompt(input.product, {
    durationSeconds,
    aspectRatio: "9:16",
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
    aspectRatio: "9:16",
    outputDir,
    referenceImages: input.product.reference_images,
    finalLanguage
  });
  const qc = runBasicQc({
    product: input.product,
    script,
    output: providerResult.output,
    targetDurationSeconds: durationSeconds
  });
  const manifestPath = join(outputDir, "manifest.json");
  const manifest: ProductJobManifest = {
    jobId,
    status: qc.result === "fail" ? "failed" : "completed",
    product: {
      sku: input.product.sku,
      title_ja: input.product.title_ja
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
    paths: {
      outputDir,
      manifest: manifestPath
    }
  };

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  return manifest;
}
