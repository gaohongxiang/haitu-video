import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runMakeVideoPipeline } from "../../src/pipeline/makeVideoPipeline.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("runMakeVideoPipeline", () => {
  it("keeps an explicit empty reference image selection empty instead of falling back to product images", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-make-video-empty-refs-"));
    tempDirs.push(root);
    const productPath = join(root, "product.json");
    await writeFile(productPath, JSON.stringify({
      sku: "TK-001",
      title_ja: "折りたたみ収納ボックス",
      category: "収納用品",
      materials: ["PP"],
      dimensions: "36x25x19cm",
      verified_selling_points: ["折りたたみ可能"],
      usage_scenes: ["キッチン"],
      forbidden_claims: [],
      reference_images: ["main.jpg", "detail.jpg"]
    }), "utf8");

    const report = await runMakeVideoPipeline({
      productPath,
      outDir: join(root, "out"),
      providerName: "mock",
      durationSeconds: 5,
      cta: "今すぐチェック",
      template: "scene",
      referenceImages: [],
      confirmPaid: false,
      forceRegenerate: true
    });

    const manifest = JSON.parse(await readFile(report.raw.manifestPath, "utf8")) as { prompt: string };
    expect(manifest.prompt).toContain("Use these product reference images as strict visual references: .");
    expect(manifest.prompt).not.toContain("main.jpg");
    expect(manifest.prompt).not.toContain("detail.jpg");
  });
});
