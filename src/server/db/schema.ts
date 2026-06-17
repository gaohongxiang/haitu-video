import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash"),
  displayName: text("display_name"),
  role: text("role").notNull().default("user"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => ({
  emailUnique: uniqueIndex("users_email_unique").on(table.email)
}));

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const workspaceMembers = sqliteTable("workspace_members", {
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull()
}, (table) => ({
  pk: primaryKey({ columns: [table.workspaceId, table.userId] }),
  userIndex: index("workspace_members_user_id_idx").on(table.userId)
}));

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  sku: text("sku").notNull(),
  title: text("title"),
  productJsonPath: text("product_json_path").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => ({
  workspaceSkuUnique: uniqueIndex("products_workspace_sku_unique").on(table.workspaceId, table.sku),
  workspaceIndex: index("products_workspace_id_idx").on(table.workspaceId)
}));

export const productAssets = sqliteTable("product_assets", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  storageProvider: text("storage_provider").notNull().default("file"),
  storagePath: text("storage_path").notNull(),
  createdAt: text("created_at").notNull()
}, (table) => ({
  productIndex: index("product_assets_product_id_idx").on(table.productId),
  workspaceIndex: index("product_assets_workspace_id_idx").on(table.workspaceId)
}));

export const storyboards = sqliteTable("storyboards", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  style: text("style").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  script: text("script").notNull(),
  createdAt: text("created_at").notNull()
}, (table) => ({
  productIndex: index("storyboards_product_id_idx").on(table.productId),
  workspaceIndex: index("storyboards_workspace_id_idx").on(table.workspaceId)
}));

export const videoJobs = sqliteTable("video_jobs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
  status: text("status").notNull(),
  model: text("model"),
  language: text("language"),
  durationSeconds: integer("duration_seconds"),
  outputCount: integer("output_count"),
  jobDir: text("job_dir").notNull(),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
  expiresAt: text("expires_at")
}, (table) => ({
  workspaceIndex: index("video_jobs_workspace_id_idx").on(table.workspaceId),
  productIndex: index("video_jobs_product_id_idx").on(table.productId)
}));

export const videoAssets = sqliteTable("video_assets", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  jobId: text("job_id").notNull().references(() => videoJobs.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  storageProvider: text("storage_provider").notNull().default("file"),
  storagePath: text("storage_path").notNull(),
  sizeBytes: integer("size_bytes"),
  expiresAt: text("expires_at"),
  deletedAt: text("deleted_at")
}, (table) => ({
  jobIndex: index("video_assets_job_id_idx").on(table.jobId),
  workspaceIndex: index("video_assets_workspace_id_idx").on(table.workspaceId)
}));

export const providerKeys = sqliteTable("provider_keys", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  configId: text("config_id").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  keyPreview: text("key_preview").notNull(),
  name: text("name"),
  vendor: text("vendor"),
  priority: integer("priority").notNull().default(0),
  baseUrl: text("base_url"),
  model: text("model"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => ({
  workspaceProviderUnique: uniqueIndex("provider_keys_workspace_provider_config_unique").on(
    table.workspaceId,
    table.provider,
    table.configId
  ),
  workspaceIndex: index("provider_keys_workspace_id_idx").on(table.workspaceId)
}));

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadataJson: text("metadata_json"),
  createdAt: text("created_at").notNull()
}, (table) => ({
  workspaceIndex: index("audit_logs_workspace_id_idx").on(table.workspaceId),
  actorIndex: index("audit_logs_actor_user_id_idx").on(table.actorUserId)
}));

export const userSessions = sqliteTable("user_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull()
}, (table) => ({
  userIndex: index("user_sessions_user_id_idx").on(table.userId),
  workspaceIndex: index("user_sessions_workspace_id_idx").on(table.workspaceId),
  expiresAtIndex: index("user_sessions_expires_at_idx").on(table.expiresAt)
}));

export const schema = {
  auditLogs,
  productAssets,
  products,
  providerKeys,
  storyboards,
  userSessions,
  users,
  videoAssets,
  videoJobs,
  workspaceMembers,
  workspaces
};
