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
import type { ModelConfigStore } from "./modelConfigStore.js";
import type { ModelServicePreferenceStore } from "./modelServicePreferenceStore.js";
import { resolveVideoRequestModel } from "./modelConfigSelection.js";
import { findProductFileBySku } from "./productFileStore.js";
import { assertPaidProductReady } from "./productReadiness.js";
import { assertTemplateEnabled } from "./videoTemplateService.js";
import { estimateVideoJobBilling, reserveVideoJobBilling } from "./videoJobBilling.js";
import { cnyToCents, InsufficientWalletBalanceError, WalletStore } from "./walletStore.js";

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
  referenceImages?: string[];
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

type VideoRequestModel = Awaited<ReturnType<typeof resolveVideoRequestModel>>;

interface PreparedVideoJob {
  productPath: string;
  settings: Awaited<ReturnType<ConsoleSettingsStore["read"]>>;
  providerName: VideoProviderName;
  videoModel: VideoRequestModel;
  durationSeconds: number;
  resolution: VideoResolution;
  aspectRatio: VideoAspectRatio;
}

export async function enqueueBatchVideoJobs(
  body: BatchVideoJobRequest,
  options: EnqueueBatchVideoJobsOptions
) {
  const versions = clampInteger(body.versions ?? 1, 1, 5);
  const prepared = await prepareVideoJob(body, options);
  assertWalletCanCoverBatch({
    walletStore: options.walletStore,
    versions,
    provider: prepared.providerName,
    modelConfig: prepared.videoModel.config,
    durationSeconds: prepared.durationSeconds,
    resolution: prepared.resolution,
    aspectRatio: prepared.aspectRatio,
    billingPolicyStore: options.billingPolicyStore,
    modelPricingCatalog: options.modelPricingCatalog,
    modelPricingCatalogVersion: options.modelPricingCatalogVersion
  });
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
  const prepared = await prepareVideoJob(body, options);
  const billing = reserveVideoJobBilling({
    walletStore: options.walletStore,
    provider: prepared.providerName,
    modelConfig: prepared.videoModel.config,
    durationSeconds: prepared.durationSeconds,
    resolution: prepared.resolution,
    aspectRatio: prepared.aspectRatio,
    billingPolicyStore: options.billingPolicyStore,
    modelPricingCatalog: options.modelPricingCatalog,
    modelPricingCatalogVersion: options.modelPricingCatalogVersion
  });
  return options.videoJobQueue.enqueue({
    productPath: prepared.productPath,
    outDirName: body.outDirName,
    provider: body.provider,
    providerModelConfigId: prepared.videoModel.providerModelConfigId,
    providerModel: prepared.videoModel.providerModel,
    duration: body.duration,
    resolution: prepared.resolution,
    aspectRatio: prepared.aspectRatio,
    template: body.template,
    finalLanguage: normalizeFinalVideoLanguage(body.finalLanguage ?? prepared.settings.defaultLanguage),
    cta: body.cta,
    scriptLines: sanitizeLines(body.scriptLines),
    storyboardLines: sanitizeLines(body.storyboardLines),
    referenceImages: sanitizeReferenceImages(body.referenceImages),
    confirmPaid: body.confirmPaid ?? prepared.providerName !== "mock",
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

async function prepareVideoJob(
  body: MakeVideoRequest,
  options: EnqueueVideoJobOptions
): Promise<PreparedVideoJob> {
  const productPath = resolveWithin(options.rootDir, body.productPath);
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
  return {
    productPath,
    settings,
    providerName,
    videoModel,
    durationSeconds: body.duration ?? settings.defaultDurationSeconds,
    resolution: normalizeVideoResolution(body.resolution),
    aspectRatio: normalizeVideoAspectRatio(body.aspectRatio)
  };
}

function assertWalletCanCoverBatch(input: {
  walletStore: WalletStore;
  versions: number;
  provider: VideoProviderName | undefined;
  modelConfig?: VideoRequestModel["config"];
  durationSeconds: number;
  resolution?: VideoResolution;
  aspectRatio?: VideoAspectRatio;
  billingPolicyStore: BillingPolicyStore;
  modelPricingCatalog?: readonly ModelPricingEntry[];
  modelPricingCatalogVersion?: string;
}): void {
  const billing = estimateVideoJobBilling({
    provider: input.provider,
    modelConfig: input.modelConfig,
    durationSeconds: input.durationSeconds,
    resolution: input.resolution,
    aspectRatio: input.aspectRatio,
    billingPolicyStore: input.billingPolicyStore,
    modelPricingCatalog: input.modelPricingCatalog,
    modelPricingCatalogVersion: input.modelPricingCatalogVersion
  });
  if (billing.reserveAmountCny <= 0) {
    return;
  }
  const requiredCents = cnyToCents(billing.reserveAmountCny) * input.versions;
  const availableCents = cnyToCents(input.walletStore.getSummary().availableCny);
  if (availableCents < requiredCents) {
    throw new InsufficientWalletBalanceError();
  }
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

function sanitizeReferenceImages(lines?: string[]): string[] | undefined {
  if (!Array.isArray(lines)) {
    return undefined;
  }
  return lines.map((line) => line.trim()).filter(Boolean);
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isInteger(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
