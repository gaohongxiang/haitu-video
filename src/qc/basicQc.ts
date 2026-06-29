import type { ProductFacts } from "../core/productFacts.js";
import type { GeneratedScript } from "../core/scriptGenerator.js";
import type { VideoAspectRatio, VideoOutput, VideoResolution } from "../providers/types.js";
import { defaultVideoAspectRatio, normalizeVideoAspectRatio, videoDimensionsFor } from "../providers/videoGeometry.js";

export interface BasicQcReport {
  result: "pass" | "warning" | "fail";
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
  }>;
}

export function runBasicQc(input: {
  product: ProductFacts;
  script: GeneratedScript;
  output: VideoOutput;
  targetDurationSeconds?: number;
  targetAspectRatio?: VideoAspectRatio;
  targetResolution?: VideoResolution;
}): BasicQcReport {
  const targetDurationSeconds = input.targetDurationSeconds ?? 15;
  const targetAspectRatio = normalizeVideoAspectRatio(input.targetAspectRatio ?? defaultVideoAspectRatio);
  const checks = [
    {
      name: `aspect_ratio_${targetAspectRatio.replace(":", "_")}`,
      passed: matchesAspectRatio({
        output: input.output,
        aspectRatio: targetAspectRatio,
        resolution: input.targetResolution
      }),
      message: `Output metadata should be ${targetAspectRatio}.`
    },
    {
      name: "duration_matches_target",
      passed: Math.abs(input.output.durationSeconds - targetDurationSeconds) <= 1,
      message: `Output duration should be within 1 second of ${targetDurationSeconds} seconds.`
    },
    {
      name: "subtitle_not_empty",
      passed: input.script.subtitleLines.length > 0 && input.script.subtitleLines.every(Boolean),
      message: "Subtitle lines should not be empty."
    },
    {
      name: "no_forbidden_claims",
      passed: input.product.forbidden_claims.every((claim) => {
        const normalized = normalizeForbiddenClaim(claim);
        return normalized.length === 0 || !input.script.voiceover.includes(normalized);
      }),
      message: "Script should not include forbidden or unverified claims."
    }
  ];

  return {
    result: checks.every((check) => check.passed) ? "pass" : "fail",
    checks
  };
}

function normalizeForbiddenClaim(claim: string): string {
  return claim
    .replace(/[はがをにのも]?未確認/g, "")
    .replace(/未確認/g, "")
    .trim();
}

function matchesAspectRatio(input: {
  output: VideoOutput;
  aspectRatio: VideoAspectRatio;
  resolution?: VideoResolution;
}): boolean {
  if (input.resolution) {
    const expected = videoDimensionsFor({
      resolution: input.resolution,
      aspectRatio: input.aspectRatio
    });
    return input.output.width === expected.width && input.output.height === expected.height;
  }
  const { output, aspectRatio } = input;
  return aspectRatio === "16:9"
    ? output.width * 9 === output.height * 16
    : output.width * 16 === output.height * 9;
}
