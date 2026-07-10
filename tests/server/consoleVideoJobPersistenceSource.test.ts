import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const queuePath = "src/server/consoleVideoJobQueue.ts";
const persistencePath = "src/server/consoleVideoJobPersistence.ts";
const storePath = "src/server/consoleVideoJobStore.ts";
const completionPath = "src/server/consoleVideoJobCompletion.ts";

describe("console video job persistence source boundaries", () => {
  it("keeps database statements and wallet store construction out of the local job queue class", async () => {
    const queueSource = await readFile(queuePath, "utf8");
    const completionSource = await readFile(completionPath, "utf8");

    await expect(access(persistencePath)).resolves.toBeUndefined();
    expect(queueSource).toContain('from "./consoleVideoJobPersistence.js"');
    expect(queueSource).toContain("captureVideoJobWalletCharge(");
    expect(queueSource).toContain("releaseVideoJobWalletReservation(");
    expect(completionSource).not.toContain("captureVideoJobWalletCharge(");
    expect(queueSource).not.toContain("persistVideoJobRecord(");
    expect(queueSource).not.toContain('from "./walletStore.js"');
    expect(queueSource).not.toContain("new WalletStore(");
    expect(queueSource).not.toContain("INSERT INTO video_jobs");
    expect(queueSource).not.toContain("INSERT INTO video_assets");
  });

  it("indexes persisted job records from the local job store boundary", async () => {
    const storeSource = await readFile(storePath, "utf8");

    await expect(access(storePath)).resolves.toBeUndefined();
    expect(storeSource).toContain('from "./consoleVideoJobPersistence.js"');
    expect(storeSource).toContain("persistVideoJobRecord(");
  });

  it("centralizes video job database indexing and wallet settlement", async () => {
    const persistenceSource = await readFile(persistencePath, "utf8");

    expect(persistenceSource).toContain("export function persistVideoJobRecord(");
    expect(persistenceSource).toContain("export function captureVideoJobWalletCharge(");
    expect(persistenceSource).toContain("export function releaseVideoJobWalletReservation(");
    expect(persistenceSource).toContain('from "./walletStore.js"');
    expect(persistenceSource).toContain("new WalletStore(");
    expect(persistenceSource).toContain("INSERT INTO video_jobs");
    expect(persistenceSource).toContain("INSERT INTO video_assets");
  });
});
