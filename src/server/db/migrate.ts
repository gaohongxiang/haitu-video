import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { DatabaseHandle } from "./client.js";
import { closeDatabase, openDatabase } from "./client.js";
import { resolveDataDir } from "../storagePaths.js";

const MIGRATIONS_TABLE = "__drizzle_migrations";

interface Migration {
  id: string;
  sql: string;
}

const migrations: Migration[] = [
  {
    id: "0001_initial_platform_tables",
    sql: readMigrationSql("0001_initial_platform_tables.sql")
  },
  {
    id: "0002_auth_sessions",
    sql: readMigrationSql("0002_auth_sessions.sql")
  },
  {
    id: "0003_better_auth",
    sql: readMigrationSql("0003_better_auth.sql")
  },
  {
    id: "0006_unified_model_configs",
    sql: readMigrationSql("0006_unified_model_configs.sql")
  },
  {
    id: "0007_wallet_and_api_modes",
    sql: readMigrationSql("0007_wallet_and_api_modes.sql")
  },
  {
    id: "0008_model_service_preferences",
    sql: readMigrationSql("0008_model_service_preferences.sql")
  },
  {
    id: "0009_wallet_recharge_orders",
    sql: readMigrationSql("0009_wallet_recharge_orders.sql")
  },
  {
    id: "0010_billing_policies",
    sql: readMigrationSql("0010_billing_policies.sql")
  },
  {
    id: "0011_console_settings",
    sql: readMigrationSql("0011_console_settings.sql")
  },
  {
    id: "0012_billing_service_fees",
    sql: readMigrationSql("0012_billing_service_fees.sql")
  },
  {
    id: "0013_model_pricing_catalog_versions",
    sql: readMigrationSql("0013_model_pricing_catalog_versions.sql")
  },
  {
    id: "0014_model_service_preference_model_choices",
    sql: readMigrationSql("0014_model_service_preference_model_choices.sql")
  }
];

function readMigrationSql(fileName: string): string {
  return readFileSync(join(dirname(fileURLToPath(import.meta.url)), "migrations", fileName), "utf8");
}

export function runMigrations(handle: DatabaseHandle): void {
  handle.sqlite.exec(`
CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`);
  const hasMigration = handle.sqlite
    .prepare(`SELECT 1 FROM ${MIGRATIONS_TABLE} WHERE id = ?`)
    .pluck();
  const insertMigration = handle.sqlite.prepare(
    `INSERT INTO ${MIGRATIONS_TABLE} (id, applied_at) VALUES (?, ?)`
  );

  for (const migration of migrations) {
    if (hasMigration.get(migration.id)) {
      continue;
    }
    const apply = handle.sqlite.transaction(() => {
      applyCompatibilityFixesBeforeMigration(handle, migration.id);
      handle.sqlite.exec(migration.sql);
      insertMigration.run(migration.id, new Date().toISOString());
    });
    apply();
  }
}

function applyCompatibilityFixesBeforeMigration(handle: DatabaseHandle, migrationId: string): void {
  if (migrationId !== "0014_model_service_preference_model_choices") {
    return;
  }
  ensureColumns(handle, "model_service_preferences", [
    ["text_model_config_id", "TEXT"],
    ["image_model_config_id", "TEXT"],
    ["video_model_config_id", "TEXT"]
  ]);
}

function ensureColumns(handle: DatabaseHandle, tableName: string, columns: Array<[name: string, type: string]>): void {
  const existingColumns = new Set(
    (handle.sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>).map((column) => column.name)
  );
  for (const [name, type] of columns) {
    if (existingColumns.has(name)) {
      continue;
    }
    handle.sqlite.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${name} ${type}`).run();
  }
}

export function ensureDefaultWorkspace(handle: DatabaseHandle): void {
  const now = new Date().toISOString();
  handle.sqlite.prepare(`
    INSERT INTO workspaces (id, name, created_at, updated_at)
    VALUES ('default', 'Default Workspace', @now, @now)
    ON CONFLICT(id) DO NOTHING
  `).run({ now });
}

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const dataDir = resolveDataDir({ rootDir, env: process.env });
  const handle = openDatabase({ dataDir, env: process.env });
  try {
    runMigrations(handle);
    ensureDefaultWorkspace(handle);
    console.log(`SQLite migrations applied: ${handle.path}`);
  } finally {
    closeDatabase(handle);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
