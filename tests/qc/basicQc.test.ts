import { describe, expect, it } from "vitest";

import type { ProductFacts } from "../../src/core/productFacts.js";
import type { GeneratedScript } from "../../src/core/scriptGenerator.js";
import { runBasicQc } from "../../src/qc/basicQc.js";

const product: ProductFacts = {
  sku: "TK-001",
  title_ja: "折りたたみ収納ボックス",
  category: "収納用品",
  materials: ["PP"],
  dimensions: "36x25x19cm",
  verified_selling_points: ["折りたたみ可能", "積み重ね可能", "省スペース"],
  usage_scenes: ["キッチン", "洗面所", "クローゼット"],
  forbidden_claims: ["防水未確認", "耐荷重未確認", "日本で大人気は未確認"],
  reference_images: ["main.jpg", "detail1.jpg", "detail2.jpg"]
};

const script: GeneratedScript = {
  voiceover: "折りたたみ可能で省スペース。今すぐチェック",
  subtitleLines: ["折りたたみ可能で省スペース。", "今すぐチェック"],
  cta: "今すぐチェック"
};

describe("runBasicQc", () => {
  it("passes a 9:16 15 second output with non-empty subtitles", () => {
    const report = runBasicQc({
      product,
      script,
      output: {
        path: "mock.txt",
        width: 1080,
        height: 1920,
        durationSeconds: 15,
        mimeType: "text/plain"
      }
    });

    expect(report.result).toBe("pass");
  });

  it("passes an 8 second output when the target duration is 8 seconds", () => {
    const report = runBasicQc({
      product,
      script,
      targetDurationSeconds: 8,
      output: {
        path: "mock.txt",
        width: 1080,
        height: 1920,
        durationSeconds: 8,
        mimeType: "text/plain"
      }
    });

    expect(report.result).toBe("pass");
    expect(report.checks.find((check) => check.name === "duration_matches_target")?.passed).toBe(
      true
    );
  });

  it("fails when the script includes a forbidden claim stem", () => {
    const report = runBasicQc({
      product,
      script: {
        ...script,
        voiceover: "防水で日本で大人気。今すぐチェック"
      },
      output: {
        path: "mock.txt",
        width: 1080,
        height: 1920,
        durationSeconds: 15,
        mimeType: "text/plain"
      }
    });

    expect(report.result).toBe("fail");
    expect(report.checks.find((check) => check.name === "no_forbidden_claims")?.passed).toBe(false);
  });

  it("fails when the script includes a claim with a Japanese particle removed", () => {
    const report = runBasicQc({
      product,
      script: {
        ...script,
        voiceover: "日本で大人気。今すぐチェック"
      },
      output: {
        path: "mock.txt",
        width: 1080,
        height: 1920,
        durationSeconds: 15,
        mimeType: "text/plain"
      }
    });

    expect(report.result).toBe("fail");
    expect(report.checks.find((check) => check.name === "no_forbidden_claims")?.passed).toBe(false);
  });
});
