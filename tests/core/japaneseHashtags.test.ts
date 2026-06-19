import { describe, expect, it } from "vitest";

import { generateJapaneseHashtags, normalizeJapaneseHashtags } from "../../src/core/japaneseHashtags.js";

describe("generateJapaneseHashtags", () => {
  it("generates Japanese hashtags with # for TikTok uploads", () => {
    const hashtags = generateJapaneseHashtags({
      product: {
        sku: "TK-001",
        title_ja: "折りたたみ収納ボックス",
        category: "収納用品",
        materials: ["PP"],
        verified_selling_points: ["折りたたみ可能", "積み重ね可能", "省スペース"],
        usage_scenes: ["キッチン", "洗面所", "クローゼット"]
      },
      script: {
        voiceover: "キッチンや洗面所の収納をすっきり。",
        subtitleLines: ["折りたたみ可能。", "今すぐチェック"]
      }
    });

    expect(hashtags).toEqual(expect.arrayContaining([
      "#収納グッズ",
      "#省スペース",
      "#キッチン収納",
      "#洗面所収納",
      "#コンパクト",
      "#TikTokShop"
    ]));
    expect(hashtags.every((tag) => tag.startsWith("#"))).toBe(true);
  });

  it("normalizes pasted tags and removes duplicates", () => {
    expect(normalizeJapaneseHashtags(["便利グッズ", "#便利グッズ", " #収納グッズ "])).toEqual([
      "#便利グッズ",
      "#収納グッズ"
    ]);
  });

  it("keeps core tags stable while rotating discovery tags by video key", () => {
    const product = {
      sku: "TK-001",
      title_ja: "折りたたみ収納ボックス",
      category: "収納用品",
      materials: ["PP"],
      verified_selling_points: ["折りたたみ可能", "積み重ね可能", "省スペース"],
      usage_scenes: ["キッチン", "洗面所", "クローゼット"]
    };
    const script = {
      voiceover: "キッチンや洗面所の収納をすっきり。",
      subtitleLines: ["折りたたみ可能。", "今すぐチェック"]
    };

    const first = generateJapaneseHashtags({ product, script, variantKey: "TK-001-v1" });
    const firstAgain = generateJapaneseHashtags({ product, script, variantKey: "TK-001-v1" });
    const second = generateJapaneseHashtags({ product, script, variantKey: "TK-001-v2" });

    expect(first).toEqual(firstAgain);
    expect(first.slice(0, 5)).toEqual(second.slice(0, 5));
    expect(first.slice(5)).not.toEqual(second.slice(5));
    expect(first.every((tag) => tag.startsWith("#"))).toBe(true);
    expect(second.every((tag) => tag.startsWith("#"))).toBe(true);
  });
});
