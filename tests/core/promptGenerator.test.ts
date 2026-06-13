import { describe, expect, it } from "vitest";

import type { ProductFacts } from "../../src/core/productFacts.js";
import { generateVideoPrompt } from "../../src/core/promptGenerator.js";

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

describe("generateVideoPrompt", () => {
  it("creates a 15 second 9:16 prompt with product references and soft storyboard", () => {
    const prompt = generateVideoPrompt(product, {
      durationSeconds: 15,
      aspectRatio: "9:16",
      template: "pain-point"
    });

    expect(prompt).toContain("9:16");
    expect(prompt).toContain("15 seconds");
    expect(prompt).toContain("main.jpg");
    expect(prompt).toContain("0-3s");
    expect(prompt).toContain("3-8s");
    expect(prompt).toContain("8-12s");
    expect(prompt).toContain("12-15s");
    expect(prompt).toContain("Do not create burned-in subtitles");
    expect(prompt).toContain("Final video language: Japanese");
    expect(prompt).toContain("Do not use Chinese or English text in the final video");
  });

  it("creates a compact storyboard for 4 second low-cost traffic videos", () => {
    const prompt = generateVideoPrompt(product, {
      durationSeconds: 4,
      aspectRatio: "9:16",
      template: "pain-point"
    });

    expect(prompt).toContain("4 seconds");
    expect(prompt).toContain("0-1s");
    expect(prompt).toContain("1-3s");
    expect(prompt).toContain("3-4s");
    expect(prompt).not.toContain("12-15s");
  });

  it("includes operator-edited storyboard lines when provided", () => {
    const prompt = generateVideoPrompt(product, {
      durationSeconds: 8,
      aspectRatio: "9:16",
      template: "scene",
      storyboardLines: [
        "0-2s: start with the box folded flat on a kitchen counter.",
        "2-6s: show opening the box and placing small items inside.",
        "6-8s: hold on the organized shelf with clean space for CTA."
      ]
    });

    expect(prompt).toContain("Operator-edited storyboard:");
    expect(prompt).toContain("0-2s: start with the box folded flat on a kitchen counter.");
    expect(prompt).not.toContain("0-2s: 展示日常痛点或使用场景开场。");
  });

  it("can target simplified Chinese as the final video language", () => {
    const prompt = generateVideoPrompt(product, {
      durationSeconds: 8,
      aspectRatio: "9:16",
      template: "scene",
      finalLanguage: "zh"
    });

    expect(prompt).toContain("Final video language: Simplified Chinese");
    expect(prompt).toContain("Do not use Japanese or English text in the final video");
  });
});
