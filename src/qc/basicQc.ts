import type { ProductFacts } from "../core/productFacts.js";
import type { GeneratedScript } from "../core/scriptGenerator.js";
import type { VideoOutput } from "../providers/types.js";

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
}): BasicQcReport {
  const targetDurationSeconds = input.targetDurationSeconds ?? 15;
  const checks = [
    {
      name: "aspect_ratio_9_16",
      passed: input.output.width * 16 === input.output.height * 9,
      message: "Output metadata should be 9:16."
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
