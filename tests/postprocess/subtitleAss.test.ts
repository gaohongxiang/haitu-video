import { describe, expect, it } from "vitest";

import { buildAssSubtitles } from "../../src/postprocess/subtitleAss.js";

describe("buildAssSubtitles", () => {
  it("creates ASS subtitle events across the target duration", () => {
    const ass = buildAssSubtitles({
      lines: ["通勤に便利。", "指先までカバー。", "今すぐチェック"],
      durationSeconds: 8,
      width: 1080,
      height: 1920
    });

    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1920");
    expect(ass).toContain("Dialogue: 0,0:00:00.00,0:00:02.66,Default,,0,0,0,,通勤に便利。");
    expect(ass).toContain("Dialogue: 0,0:00:05.33,0:00:08.00,CTA,,0,0,0,,今すぐチェック");
  });

  it("escapes ASS control characters in subtitle text", () => {
    const ass = buildAssSubtitles({
      lines: ["{cool}\\item"],
      durationSeconds: 4,
      width: 1080,
      height: 1920
    });

    expect(ass).toContain("\\{cool\\}\\\\item");
  });
});
