import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { normalizeFinalVideoLanguage } from "../core/videoLanguage.js";
import { runMakeVideoPipeline, type MakeVideoReport } from "../pipeline/makeVideoPipeline.js";
import type { ReferenceImageUrlResolver } from "../providers/types.js";
import { normalizeVideoAspectRatio } from "../providers/videoGeometry.js";
import type { BillingPolicyStore } from "./billingPolicyStore.js";
import { resolveWithin } from "./consoleAssetService.js";
import type { ConsoleSettingsStore } from "./consoleSettings.js";
import type { ModelConfigStore } from "./modelConfigStore.js";
import { resolveVideoRequestModel } from "./modelConfigSelection.js";
import type { ModelServicePreferenceStore } from "./modelServicePreferenceStore.js";
import { assertPaidProductReady } from "./productReadiness.js";
import type { MakeVideoRequest } from "./videoJobService.js";
import { assertTemplateEnabled } from "./videoTemplateService.js";
import { tokenPriceCnyPerMillionForVideoModel } from "./videoJobBilling.js";

export async function runConsoleMakeVideo(
  body: MakeVideoRequest,
  options: {
    rootDir: string;
    outputsDir: string;
    settingsStore: ConsoleSettingsStore;
    modelConfigStore: ModelConfigStore;
    platformModelConfigStore?: ModelConfigStore;
    modelServicePreferenceStore?: ModelServicePreferenceStore;
    fetchImpl?: typeof fetch;
    runMakeVideoPipeline?: typeof runMakeVideoPipeline;
    referenceImageUrlResolver?: ReferenceImageUrlResolver;
    billingPolicyStore?: BillingPolicyStore;
  }
): Promise<MakeVideoReport> {
  const productPath = resolveWithin(options.rootDir, body.productPath);
  const outDirName = sanitizePathSegment(body.outDirName ?? `console-${Date.now()}`);
  const settings = await options.settingsStore.read();
  const providerName = body.provider ?? settings.defaultProvider;
  const videoModel = await resolveVideoRequestModel({
    modelConfigStore: options.modelConfigStore,
    platformModelConfigStore: options.platformModelConfigStore,
    modelServicePreferenceStore: options.modelServicePreferenceStore,
    provider: providerName,
    body
  });
  await assertTemplateEnabled(body, options.settingsStore);
  await assertPaidProductReady({
    provider: providerName,
    productPath,
    rootDir: options.rootDir
  });
  await mkdir(options.outputsDir, { recursive: true });
  const runPipeline = options.runMakeVideoPipeline ?? runMakeVideoPipeline;
  return runPipeline({
    productPath,
    outDir: join(options.outputsDir, outDirName),
    providerName,
    durationSeconds: body.duration ?? settings.defaultDurationSeconds,
    resolution: body.resolution,
    aspectRatio: normalizeVideoAspectRatio(body.aspectRatio),
    template: body.template ?? settings.defaultTemplate,
    finalLanguage: normalizeFinalVideoLanguage(body.finalLanguage ?? settings.defaultLanguage),
    cta: body.cta ?? settings.defaultCta,
    scriptLines: sanitizeLines(body.scriptLines),
    storyboardLines: sanitizeLines(body.storyboardLines),
    confirmPaid: body.confirmPaid ?? providerName !== "mock",
    reuseManifestPath: body.reuseManifest ? resolveWithin(options.rootDir, body.reuseManifest) : undefined,
    apiKey: videoModel.config?.apiKey,
    providerBaseUrl: videoModel.config?.baseUrl,
    providerModelConfigId: videoModel.providerModelConfigId,
    providerModel: videoModel.providerModel,
    tokenPriceCnyPerMillion: tokenPriceCnyPerMillionForVideoModel(videoModel.providerModel, body.resolution),
    fetchImpl: options.fetchImpl,
    referenceImageUrlResolver: options.referenceImageUrlResolver
  });
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "run";
}

function sanitizeLines(lines?: string[]): string[] | undefined {
  const cleaned = (lines ?? []).map((line) => line.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}
