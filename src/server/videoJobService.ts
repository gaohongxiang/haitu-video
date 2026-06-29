import { isAbsolute, relative, resolve } from "node:path";

import type { ScriptTemplate } from "../core/scriptGenerator.js";
import { normalizeFinalVideoLanguage, type FinalVideoLanguage } from "../core/videoLanguage.js";
import type { VideoProviderName } from "../providers/providerFactory.js";
import type { VideoAspectRatio, VideoResolution } from "../providers/types.js";
import type { ModelPricingEntry } from "../modelPricing/officialModelPricingCatalog.js";
import { normalizeVideoAspectRatio } from "../providers/videoGeometry.js";
import type { ConsoleSettingsStore } from "./consoleSettings.js";
import type { BillingPolicyStore } from "./billingPolicyStore.js";
import { LocalVideoJobQueue } from "./consoleVideoJobQueue.js";
import type { ModelBundleStore } from "./modelBundleStore.js";
import type { ModelConfigStore } from "./modelConfigStore.js";
import type { ModelServicePreferenceStore } from "./modelServicePreferenceStore.js";
import { resolveVideoRequestModel } from "./modelConfigSelection.js";
import { findProductFileBySku } from "./productFileStore.js";
import { assertPaidProductReady } from "./productReadiness.js";
import { assertTemplateEnabled } from "./videoTemplateService.js";
import { reserveVideoJobBilling } from "./videoJobBilling.js";
import { WalletStore } from "./walletStore.js";

export interface MakeVideoRequest {
  productPath: string;
  outDirName?: string;
  provider?: VideoProviderName;
  providerModelConfigId?: string;
  providerModel?: string;
  duration?: number;
  resolution?: VideoResolution;
  aspectRatio?: VideoAspectRatio;
  template?: ScriptTemplate;
  finalLanguage?: FinalVideoLanguage;
  cta?: string;
  scriptLines?: string[];
  storyboardLines?: string[];
  confirmPaid?: boolean;
  reuseManifest?: string;
}

export interface BatchVideoJobRequest extends MakeVideoRequest {
  versions?: number;
}

export type ProductVideoJobRequest = Omit<BatchVideoJobRequest, "productPath">;

interface EnqueueVideoJobOptions {
  rootDir: string;
  settingsStore: ConsoleSettingsStore;
  modelConfigStore: ModelConfigStore;
  platformModelConfigStore: ModelConfigStore;
  modelBundleStore: ModelBundleStore;
  modelServicePreferenceStore: ModelServicePreferenceStore;
  walletStore: WalletStore;
  videoJobQueue: LocalVideoJobQueue;
  billingPolicyStore: BillingPolicyStore;
  modelPricingCatalog?: readonly ModelPricingEntry[];
  modelPricingCatalogVersion?: string;
}

interface EnqueueBatchVideoJobsOptions extends EnqueueVideoJobOptions {
  outputsDir: string;
  fixturesDir: string;
}

interface EnqueueProductVideoJobsBySkuOptions extends EnqueueBatchVideoJobsOptions {
  sku: string;
}

export async function enqueueBatchVideoJobs(
  body: BatchVideoJobRequest,
  options: EnqueueBatchVideoJobsOptions
) {
  const versions = clampInteger(body.versions ?? 1, 1, 5);
  const jobs = [];
  for (let index = 1; index <= versions; index += 1) {
    jobs.push(await enqueueVideoJob({
      ...body,
      outDirName: body.outDirName
        ? `${sanitizePathSegment(body.outDirName)}-v${index}`
        : undefined
    }, options));
  }
  return jobs;
}

export async function enqueueVideoJob(
  body: MakeVideoRequest,
  options: EnqueueVideoJobOptions
) {
  const productPath = resolveWithin(options.rootDir, body.productPath);
  const settings = await options.settingsStore.read();
  const providerName = body.provider ?? settings.defaultProvider;
  const videoModel = await resolveVideoRequestModel({
    modelConfigStore: options.modelConfigStore,
    platformModelConfigStore: options.platformModelConfigStore,
    modelBundleStore: options.modelBundleStore,
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
  const billing = reserveVideoJobBilling({
    walletStore: options.walletStore,
    provider: providerName,
    modelConfig: videoModel.config,
    durationSeconds: body.duration ?? settings.defaultDurationSeconds,
    resolution: normalizeVideoResolution(body.resolution),
    aspectRatio: normalizeVideoAspectRatio(body.aspectRatio),
    billingPolicyStore: options.billingPolicyStore,
    modelPricingCatalog: options.modelPricingCatalog,
    modelPricingCatalogVersion: options.modelPricingCatalogVersion
  });
  return options.videoJobQueue.enqueue({
    productPath,
    outDirName: body.outDirName,
    provider: body.provider,
    providerModelConfigId: videoModel.providerModelConfigId,
    providerModel: videoModel.providerModel,
    duration: body.duration,
    resolution: normalizeVideoResolution(body.resolution),
    aspectRatio: normalizeVideoAspectRatio(body.aspectRatio),
    template: body.template,
    finalLanguage: normalizeFinalVideoLanguage(body.finalLanguage ?? settings.defaultLanguage),
    cta: body.cta,
    scriptLines: sanitizeLines(body.scriptLines),
    storyboardLines: sanitizeLines(body.storyboardLines),
    confirmPaid: body.confirmPaid ?? providerName !== "mock",
    ...billing,
    reuseManifest: body.reuseManifest ? resolveWithin(options.rootDir, body.reuseManifest) : undefined
  });
}

export async function enqueueProductVideoJobsBySku(
  body: ProductVideoJobRequest,
  options: EnqueueProductVideoJobsBySkuOptions
) {
  const productPath = await findProductFileBySku(options.fixturesDir, options.sku);
  return enqueueBatchVideoJobs({
    ...body,
    productPath
  }, options);
}

function normalizeVideoResolution(value: unknown): VideoResolution {
  if (value === "720p" || value === "1080p" || value === "4k") {
    return value;
  }
  return "480p";
}

function resolveWithin(rootDir: string, path: string): string {
  const resolved = resolve(rootDir, path);
  if (!isPathInsideRoot(rootDir, resolved)) {
    throw new Error(`Path is outside project root: ${path}`);
  }
  return resolved;
}

function isPathInsideRoot(rootDir: string, path: string): boolean {
  const resolved = resolve(path);
  const root = resolve(rootDir);
  const relativePath = relative(root, resolved);
  return relativePath !== ".." && !relativePath.startsWith(`..${"/"}`) && !isAbsolute(relativePath);
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "run";
}

function sanitizeLines(lines?: string[]): string[] | undefined {
  const cleaned = (lines ?? []).map((line) => line.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isInteger(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
