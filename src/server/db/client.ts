import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema.js";

export interface DatabaseHandle {
  path: string;
  sqlite: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
}

export function resolveDatabasePath(input: {
  dataDir: string;
  dbPath?: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const configured = input.dbPath ?? input.env?.HAITU_DB_PATH;
  if (!configured || configured.trim() === "") {
    return resolve(input.dataDir, "haitu.sqlite");
  }
  return isAbsolute(configured) ? resolve(configured) : resolve(input.dataDir, configured);
}

export function openDatabase(input: {
  dataDir: string;
  dbPath?: string;
  env?: NodeJS.ProcessEnv;
}): DatabaseHandle {
  const path = resolveDatabasePath(input);
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 30000");
  sqlite.pragma("foreign_keys = ON");
  return {
    path,
    sqlite,
    db: drizzle(sqlite, { schema })
  };
}

export function closeDatabase(handle: DatabaseHandle): void {
  handle.sqlite.close();
}
