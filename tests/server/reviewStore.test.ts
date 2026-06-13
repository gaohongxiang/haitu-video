import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FileReviewStore } from "../../src/server/reviewStore.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("FileReviewStore", () => {
  it("persists selected final job decisions per product", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-review-store-"));
    tempDirs.push(root);
    const storePath = join(root, "review-state.json");
    const store = new FileReviewStore(storePath);

    await store.setSelectedFinal({
      productSku: "WALLET-BLACK-001",
      jobId: "paid-run",
      note: "发布 TikTok 引流"
    });

    const loaded = await new FileReviewStore(storePath).read();
    expect(loaded.products["WALLET-BLACK-001"]).toEqual({
      selectedFinalJobId: "paid-run",
      note: "发布 TikTok 引流"
    });
    await expect(readFile(storePath, "utf8")).resolves.toContain("WALLET-BLACK-001");
  });

  it("persists manual review ratings per video version", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-review-store-"));
    tempDirs.push(root);
    const storePath = join(root, "review-state.json");
    const store = new FileReviewStore(storePath);

    await store.setManualReview({
      productSku: "WALLET-BLACK-001",
      jobId: "wallet-v2",
      decision: "publishable",
      score: 5,
      note: "財布の収納が見やすい"
    });

    const loaded = await new FileReviewStore(storePath).read();
    expect(loaded.products["WALLET-BLACK-001"]?.versionReviews?.["wallet-v2"]).toEqual({
      decision: "publishable",
      score: 5,
      note: "財布の収納が見やすい",
      updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
    });
  });
});
