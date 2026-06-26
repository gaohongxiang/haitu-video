import type { ReferenceImageUrlResolver } from "../providers/types.js";
import type { runMakeVideoPipeline } from "../pipeline/makeVideoPipeline.js";
import type { VideoJobRecord } from "./consoleVideoJobTypes.js";

type MakeVideoPipelineInput = Parameters<typeof runMakeVideoPipeline>[0];

export function createMakeVideoPipelineInput(input: {
  record: VideoJobRecord;
  fetchImpl?: typeof fetch;
  referenceImageUrlResolver?: ReferenceImageUrlResolver;
}): MakeVideoPipelineInput {
  return {
    productPath: input.record.productPath,
    outDir: input.record.outDir,
    providerName: input.record.provider ?? "mock",
    providerModelConfigId: input.record.providerModelConfigId,
    providerModel: input.record.providerModel,
    durationSeconds: input.record.durationSeconds ?? 8,
    resolution: input.record.resolution,
    template: input.record.template ?? "scene",
    finalLanguage: input.record.finalLanguage,
    cta: input.record.cta ?? "今すぐチェック",
    scriptLines: input.record.scriptLines,
    storyboardLines: input.record.storyboardLines,
    confirmPaid: input.record.confirmPaid,
    reuseManifestPath: input.record.reuseManifest,
    fetchImpl: input.fetchImpl,
    referenceImageUrlResolver: input.referenceImageUrlResolver
  };
}
