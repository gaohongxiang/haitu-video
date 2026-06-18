import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ProductFacts } from "../../src/core/productFacts.js";
import { MockVideoProvider } from "../../src/providers/mockVideoProvider.js";
import type { VideoProvider, VideoProviderRequest, VideoProviderResult } from "../../src/providers/types.js";
import { runProductJob } from "../../src/pipeline/runProductJob.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

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

describe("runProductJob", () => {
  it("creates a manifest for one generated product video version", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "haitu-pipeline-"));
    tempDirs.push(outDir);

    const manifest = await runProductJob({
      product,
      version: 1,
      outputRoot: outDir,
      provider: new MockVideoProvider(),
      cta: "今すぐチェック",
      template: "pain-point"
    });

    expect(manifest.product.sku).toBe("TK-001");
    expect(manifest.version).toBe(1);
    expect(manifest.status).toBe("completed");
    expect(manifest.cost.total.amount).toBe(0);
    expect(manifest.qc.result).toBe("pass");
    expect(manifest.script.subtitleLines).toContain("今すぐチェック");
    expect(manifest.hashtags).toEqual(expect.arrayContaining([
      "#収納グッズ",
      "#省スペース",
      "#キッチン収納",
      "#TikTokShop"
    ]));
    expect(manifest.hashtags.every((tag) => tag.startsWith("#"))).toBe(true);
    await expect(readFile(manifest.paths.manifest, "utf8")).resolves.toContain("\"status\": \"completed\"");
  });

  it("defaults product video jobs to an 8 second low-cost duration", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "haitu-pipeline-low-cost-"));
    tempDirs.push(outDir);

    const manifest = await runProductJob({
      product,
      version: 1,
      outputRoot: outDir,
      provider: new MockVideoProvider(),
      cta: "今すぐチェック",
      template: "pain-point"
    });

    expect(manifest.output.durationSeconds).toBe(8);
    expect(manifest.prompt).toContain("8 seconds");
    expect(manifest.qc.result).toBe("pass");
  });

  it("accepts a longer duration when explicitly requested", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "haitu-pipeline-duration-"));
    tempDirs.push(outDir);

    const manifest = await runProductJob({
      product,
      version: 1,
      outputRoot: outDir,
      provider: new MockVideoProvider(),
      cta: "今すぐチェック",
      template: "pain-point",
      durationSeconds: 8
    });

    expect(manifest.output.durationSeconds).toBe(8);
    expect(manifest.prompt).toContain("8 seconds");
  });

  it("stores provider task id and usage for customer support billing display", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "haitu-pipeline-usage-"));
    tempDirs.push(outDir);
    const provider = new UsageVideoProvider();

    const manifest = await runProductJob({
      product,
      version: 1,
      outputRoot: outDir,
      provider,
      cta: "今すぐチェック",
      template: "pain-point"
    });

    expect(manifest.provider.taskId).toBe("cgt-support-1");
    expect(manifest.usage).toEqual({
      completionTokens: 173280,
      totalTokens: 173280
    });
    await expect(readFile(manifest.paths.manifest, "utf8")).resolves.toContain(
      "\"totalTokens\": 173280"
    );
  });
});

class UsageVideoProvider implements VideoProvider {
  async generateVideo(request: VideoProviderRequest): Promise<VideoProviderResult> {
    return {
      provider: "volcengine-seedance",
      model: "doubao-seedance-2-0-fast-260128",
      providerTaskId: "cgt-support-1",
      output: {
        path: join(request.outputDir, "support.mp4"),
        width: 1080,
        height: 1920,
        durationSeconds: request.durationSeconds,
        mimeType: "video/mp4"
      },
      usage: {
        completionTokens: 173280,
        totalTokens: 173280
      },
      cost: {
        amount: 6.41,
        currency: "CNY"
      },
      rawResponse: {}
    };
  }
}
