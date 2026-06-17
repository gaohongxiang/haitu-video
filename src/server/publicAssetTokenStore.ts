import { randomBytes } from "node:crypto";
import { relative, resolve } from "node:path";

export interface PublicAssetTokenRecord {
  token: string;
  filePath: string;
  mimeType: string;
  workspaceId: string;
  expiresAt: string;
}

export interface PublicAssetTokenStoreOptions {
  rootDir: string;
  now?: () => Date;
}

export interface CreatePublicAssetTokenInput {
  filePath: string;
  mimeType: string;
  workspaceId: string;
  ttlMs: number;
}

export interface CreatedPublicAssetToken extends PublicAssetTokenRecord {
  urlPath: string;
}

export class PublicAssetTokenStore {
  private readonly rootDir: string;
  private readonly records = new Map<string, PublicAssetTokenRecord>();

  constructor(private readonly options: PublicAssetTokenStoreOptions) {
    this.rootDir = resolve(options.rootDir);
  }

  create(input: CreatePublicAssetTokenInput): CreatedPublicAssetToken {
    this.cleanupExpired();
    const filePath = resolve(input.filePath);
    if (!isInside(this.rootDir, filePath)) {
      throw new Error("Public asset path must stay inside data root.");
    }
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(this.now().getTime() + input.ttlMs).toISOString();
    const record: PublicAssetTokenRecord = {
      token,
      filePath,
      mimeType: input.mimeType,
      workspaceId: input.workspaceId,
      expiresAt
    };
    this.records.set(token, record);
    return {
      ...record,
      urlPath: `/api/public-assets/${token}`
    };
  }

  resolve(token: string): PublicAssetTokenRecord | undefined {
    this.cleanupExpired();
    const record = this.records.get(token);
    if (!record) {
      return undefined;
    }
    if (Date.parse(record.expiresAt) <= this.now().getTime()) {
      this.records.delete(token);
      return undefined;
    }
    if (!isInside(this.rootDir, record.filePath)) {
      this.records.delete(token);
      return undefined;
    }
    return record;
  }

  private cleanupExpired(): void {
    const nowMs = this.now().getTime();
    for (const [token, record] of this.records) {
      if (Date.parse(record.expiresAt) <= nowMs) {
        this.records.delete(token);
      }
    }
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

function isInside(rootDir: string, filePath: string): boolean {
  const relativePath = relative(rootDir, filePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") &&
      !relativePath.startsWith("/") &&
      !relativePath.startsWith("\\"))
  );
}
