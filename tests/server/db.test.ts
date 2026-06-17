import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "../../src/server/db/crypto.js";
import {
  closeDatabase,
  openDatabase,
  resolveDatabasePath
} from "../../src/server/db/client.js";
import { ensureDefaultWorkspace, runMigrations } from "../../src/server/db/migrate.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("SQLite database infrastructure", () => {
  it("defaults the SQLite file to HAITU_DATA_DIR/haitu.sqlite", async () => {
    const dataDir = await makeTempDir();

    expect(resolveDatabasePath({ dataDir, env: {} })).toBe(join(dataDir, "haitu.sqlite"));
  });

  it("allows HAITU_DB_PATH to override the default database path", async () => {
    const dataDir = await makeTempDir();
    const dbPath = join(await makeTempDir(), "custom.sqlite");

    expect(resolveDatabasePath({ dataDir, env: { HAITU_DB_PATH: dbPath } })).toBe(dbPath);
  });

  it("opens SQLite with WAL, busy timeout, and foreign keys enabled", async () => {
    const dataDir = await makeTempDir();
    const handle = openDatabase({ dataDir, env: {} });

    try {
      const journal = handle.sqlite.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
      const busyTimeout = handle.sqlite.prepare("PRAGMA busy_timeout").get() as { timeout: number };
      const foreignKeys = handle.sqlite.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };

      expect(journal.journal_mode).toBe("wal");
      expect(busyTimeout.timeout).toBe(30000);
      expect(foreignKeys.foreign_keys).toBe(1);
      expect(existsSync(join(dataDir, "haitu.sqlite"))).toBe(true);
    } finally {
      closeDatabase(handle);
    }
  });

  it("runs migrations and creates the first relational tables", async () => {
    const dataDir = await makeTempDir();
    const handle = openDatabase({ dataDir, env: {} });

    try {
      runMigrations(handle);
      const rows = handle.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all() as Array<{ name: string }>;

      expect(rows.map((row) => row.name)).toEqual(expect.arrayContaining([
        "audit_logs",
        "product_assets",
        "products",
        "provider_keys",
        "storyboards",
        "users",
        "video_assets",
        "video_jobs",
        "workspace_members",
        "workspaces"
      ]));
    } finally {
      closeDatabase(handle);
    }
  });

  it("seeds the first-stage default workspace for SQLite-backed settings", async () => {
    const dataDir = await makeTempDir();
    const handle = openDatabase({ dataDir, env: {} });

    try {
      runMigrations(handle);
      ensureDefaultWorkspace(handle);
      const workspace = handle.sqlite
        .prepare("SELECT id, name FROM workspaces WHERE id = 'default'")
        .get() as { id: string; name: string };

      expect(workspace).toEqual({
        id: "default",
        name: "Default Workspace"
      });
    } finally {
      closeDatabase(handle);
    }
  });

  it("stores provider key metadata without a plaintext api_key column", async () => {
    const dataDir = await makeTempDir();
    const handle = openDatabase({ dataDir, env: {} });

    try {
      runMigrations(handle);
      const columns = handle.sqlite.prepare("PRAGMA table_info(provider_keys)").all() as Array<{ name: string }>;

      expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining([
        "encrypted_key",
        "key_preview",
        "provider",
        "workspace_id"
      ]));
      expect(columns.map((column) => column.name)).not.toContain("api_key");
    } finally {
      closeDatabase(handle);
    }
  });

  it("encrypts provider keys without writing the plaintext and decrypts them for model calls", async () => {
    const secretKey = "0123456789abcdef0123456789abcdef";
    const plaintext = "sk-live-secret-value-123456";

    const encrypted = encryptSecret(plaintext, secretKey);

    expect(encrypted).not.toContain(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decryptSecret(encrypted, secretKey)).toBe(plaintext);
  });

  it("keeps full provider keys out of the database while preserving keyPreview", async () => {
    const dataDir = await makeTempDir();
    const dbPath = join(dataDir, "haitu.sqlite");
    const handle = openDatabase({ dataDir, env: { HAITU_DB_PATH: dbPath } });

    try {
      runMigrations(handle);
      handle.sqlite.prepare(`
        INSERT INTO workspaces (id, name, created_at, updated_at)
        VALUES ('default', 'Default Workspace', '2026-06-15T00:00:00.000Z', '2026-06-15T00:00:00.000Z')
      `).run();
      const plaintext = "ark-secret-key-abcdef";
      const encrypted = encryptSecret(plaintext, "0123456789abcdef0123456789abcdef");
      handle.sqlite.prepare(`
        INSERT INTO provider_keys (
          id,
          workspace_id,
          provider,
          config_id,
          encrypted_key,
          key_preview,
          created_at,
          updated_at
        ) VALUES (
          'provider-key-1',
          'default',
          'volcengine-seedance',
          'default',
          @encrypted,
          'ark-...cdef',
          '2026-06-15T00:00:00.000Z',
          '2026-06-15T00:00:00.000Z'
        )
      `).run({ encrypted });

      const databaseBytes = await readFile(dbPath, "utf8");
      const row = handle.sqlite
        .prepare("SELECT encrypted_key, key_preview FROM provider_keys WHERE id = 'provider-key-1'")
        .get() as { encrypted_key: string; key_preview: string };

      expect(row.key_preview).toBe("ark-...cdef");
      expect(row.encrypted_key).not.toContain(plaintext);
      expect(databaseBytes).not.toContain(plaintext);
    } finally {
      closeDatabase(handle);
    }
  });
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "haitu-db-"));
  tempDirs.push(dir);
  return dir;
}
