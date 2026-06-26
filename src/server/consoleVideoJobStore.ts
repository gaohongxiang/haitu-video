import { access, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  hydrateVideoJobRecord
} from "./consoleVideoJobRecord.js";
import {
  persistVideoJobRecord
} from "./consoleVideoJobPersistence.js";
import type { DatabaseHandle } from "./db/client.js";
import type { VideoJobRecord } from "./consoleVideoJobTypes.js";

export interface LocalVideoJobStoreOptions {
  outputsDir: string;
  workspaceId?: string;
  databaseHandle?: DatabaseHandle;
  mediaUrlForPath: (path: string) => string;
}

export class LocalVideoJobStore {
  private sequence = 0;

  constructor(private readonly options: LocalVideoJobStoreOptions) {}

  async nextId(createdAt: string): Promise<string> {
    const timestamp = createdAt.replace(/\D/g, "");
    while (true) {
      this.sequence += 1;
      const id = `job-${timestamp}-${String(this.sequence).padStart(3, "0")}`;
      if (!(await this.jobExists(id))) {
        return id;
      }
    }
  }

  outputDirFor(name: string): string {
    return join(this.jobsDir(), sanitizePathSegment(name));
  }

  async list(): Promise<VideoJobRecord[]> {
    let entries;
    try {
      entries = await readdir(this.jobsDir(), { withFileTypes: true });
    } catch {
      return [];
    }
    const records: VideoJobRecord[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          records.push(await this.read(entry.name));
        } catch {
          // Ignore non-job directories such as publish packages.
        }
      }
    }
    return records.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }

  async read(id: string): Promise<VideoJobRecord> {
    const record = JSON.parse(await readFile(this.pathFor(id), "utf8")) as VideoJobRecord;
    return hydrateVideoJobRecord({
      record,
      mediaUrlForPath: this.options.mediaUrlForPath
    });
  }

  async write(record: VideoJobRecord): Promise<void> {
    await mkdir(dirname(this.pathFor(record.id)), { recursive: true });
    const path = this.pathFor(record.id);
    const tempPath = `${path}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(tempPath, JSON.stringify(record, null, 2), "utf8");
    await rename(tempPath, path);
    persistVideoJobRecord({
      databaseHandle: this.options.databaseHandle,
      workspaceId: this.options.workspaceId,
      record
    });
  }

  private jobsDir(): string {
    return this.options.outputsDir;
  }

  private pathFor(id: string): string {
    return join(this.jobsDir(), sanitizePathSegment(id), "job.json");
  }

  private async jobExists(id: string): Promise<boolean> {
    try {
      await access(dirname(this.pathFor(id)));
      return true;
    } catch {
      return false;
    }
  }
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "job";
}
