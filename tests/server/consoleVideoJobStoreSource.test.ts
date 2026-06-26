import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const queuePath = "src/server/consoleVideoJobQueue.ts";
const storePath = "src/server/consoleVideoJobStore.ts";

describe("console video job store source boundaries", () => {
  it("keeps local JSON job storage out of the local job queue class", async () => {
    const queueSource = await readFile(queuePath, "utf8");

    await expect(access(storePath)).resolves.toBeUndefined();
    expect(queueSource).toContain('from "./consoleVideoJobStore.js"');
    expect(queueSource).toContain("new LocalVideoJobStore(");
    expect(queueSource).toContain("this.store.nextId(");
    expect(queueSource).toContain("this.store.outputDirFor(");
    expect(queueSource).toContain("this.store.list(");
    expect(queueSource).not.toContain("readFile(");
    expect(queueSource).not.toContain("writeFile(");
    expect(queueSource).not.toContain("readdir(");
    expect(queueSource).not.toContain("rename(");
    expect(queueSource).not.toContain("access(");
    expect(queueSource).not.toContain("private async nextId(");
    expect(queueSource).not.toContain("private pathFor(");
    expect(queueSource).not.toContain("private async jobExists(");
    expect(queueSource).not.toContain("function sanitizePathSegment(");
  });

  it("centralizes local JSON job storage and id/path generation", async () => {
    const storeSource = await readFile(storePath, "utf8");

    expect(storeSource).toContain("export class LocalVideoJobStore");
    expect(storeSource).toContain("async nextId(");
    expect(storeSource).toContain("async read(");
    expect(storeSource).toContain("async write(");
    expect(storeSource).toContain("async list(");
    expect(storeSource).toContain("outputDirFor(");
    expect(storeSource).toContain("sanitizePathSegment(");
    expect(storeSource).toContain("hydrateVideoJobRecord(");
    expect(storeSource).toContain("persistVideoJobRecord(");
    expect(storeSource).toContain("readFile(");
    expect(storeSource).toContain("writeFile(");
    expect(storeSource).toContain("readdir(");
    expect(storeSource).toContain("rename(");
    expect(storeSource).toContain("access(");
  });
});
