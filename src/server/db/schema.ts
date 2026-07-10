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

export const modelCredentials = sqliteTable("model_credentials", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull(),
  providerId: text("provider_id").notNull(),
  modelKind: text("model_kind").notNull(),
  apiOwner: text("api_owner").notNull().default("byok"),
  encryptedKey: text("encrypted_key").notNull(),
  keyPreview: text("key_preview").notNull(),
  name: text("name"),
  vendor: text("vendor"),
  baseUrl: text("base_url"),
  apiMode: text("api_mode"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => ({
  workspaceCredentialUnique: uniqueIndex("model_credentials_workspace_credential_unique").on(
    table.workspaceId,
    table.credentialId
  ),
  workspaceIndex: index("model_credentials_workspace_id_idx").on(table.workspaceId),
  providerIndex: index("model_credentials_provider_idx").on(table.workspaceId, table.providerId)
}));

export const modelVariants = sqliteTable("model_variants", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull(),
  providerId: text("provider_id").notNull(),
  modelKind: text("model_kind").notNull(),
  apiOwner: text("api_owner").notNull().default("byok"),
  configId: text("config_id").notNull(),
  label: text("label").notNull(),
  model: text("model").notNull(),
  priority: integer("priority").notNull().default(0),
  taskScopesJson: text("task_scopes_json"),
  tagsJson: text("tags_json"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  variantOrder: integer("variant_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => ({
  workspaceConfigUnique: uniqueIndex("model_variants_workspace_config_unique").on(
    table.workspaceId,
    table.configId
  ),
  workspaceCredentialModelUnique: uniqueIndex("model_variants_workspace_credential_model_unique").on(
    table.workspaceId,
    table.credentialId,
    table.model
  ),
  workspaceIndex: index("model_variants_workspace_id_idx").on(table.workspaceId),
  providerIndex: index("model_variants_provider_idx").on(table.workspaceId, table.providerId),
  credentialIndex: index("model_variants_credential_idx").on(table.workspaceId, table.credentialId)
}));

export const walletTransactions = sqliteTable("wallet_transactions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  amountCents: integer("amount_cents").notNull(),
  balanceAfterCents: integer("balance_after_cents").notNull(),
  reservedAfterCents: integer("reserved_after_cents").notNull(),
  reservationId: text("reservation_id"),
  jobId: text("job_id"),
  description: text("description"),
  metadataJson: text("metadata_json"),
  createdAt: text("created_at").notNull()
}, (table) => ({
  workspaceIndex: index("wallet_transactions_workspace_id_idx").on(table.workspaceId),
  reservationIndex: index("wallet_transactions_reservation_idx").on(table.workspaceId, table.reservationId),
  jobIndex: index("wallet_transactions_job_idx").on(table.workspaceId, table.jobId)
}));

export const walletRechargeOrders = sqliteTable("wallet_recharge_orders", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerSessionId: text("provider_session_id"),
  providerPaymentIntentId: text("provider_payment_intent_id"),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  creditCents: integer("credit_cents").notNull(),
  reversedCreditCents: integer("reversed_credit_cents").notNull().default(0),
  status: text("status").notNull(),
  checkoutUrl: text("checkout_url"),
  failureReason: text("failure_reason"),
  metadataJson: text("metadata_json"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at"),
  expiresAt: text("expires_at")
}, (table) => ({
  workspaceIndex: index("wallet_recharge_orders_workspace_id_idx").on(table.workspaceId, table.createdAt),
  statusIndex: index("wallet_recharge_orders_status_idx").on(table.workspaceId, table.status),
  providerSessionUnique: uniqueIndex("wallet_recharge_orders_provider_session_unique").on(table.provider, table.providerSessionId)
}));

export const paymentWebhookEvents = sqliteTable("payment_webhook_events", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  eventType: text("event_type").notNull(),
  processedAt: text("processed_at").notNull(),
  payloadJson: text("payload_json")
});

export const billingPolicies = sqliteTable("billing_policies", {
  id: text("id").primaryKey(),
  mode: text("mode").notNull(),
  label: text("label").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const billingPriceRules = sqliteTable("billing_price_rules", {
  id: text("id").primaryKey(),
  policyId: text("policy_id").notNull().references(() => billingPolicies.id, { onDelete: "cascade" }),
  usageKind: text("usage_kind").notNull(),
  serviceFeeCents: integer("service_fee_cents").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => ({
  policyKindUnique: uniqueIndex("billing_price_rules_policy_kind_unique").on(table.policyId, table.usageKind),
  policyIndex: index("billing_price_rules_policy_idx").on(table.policyId, table.enabled)
}));

export const modelPricingCatalogVersions = sqliteTable("model_pricing_catalog_versions", {
  id: text("id").primaryKey(),
  version: text("version").notNull(),
  status: text("status").notNull(),
  catalogJson: text("catalog_json").notNull(),
  source: text("source").notNull(),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull(),
  publishedAt: text("published_at").notNull()
}, (table) => ({
  statusIndex: index("model_pricing_catalog_versions_status_idx").on(table.status, table.publishedAt)
}));

export const modelPricingCatalogDrafts = sqliteTable("model_pricing_catalog_drafts", {
  id: text("id").primaryKey(),
  baseVersionId: text("base_version_id").references(() => modelPricingCatalogVersions.id, { onDelete: "set null" }),
  version: text("version").notNull(),
  catalogJson: text("catalog_json").notNull(),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
}, (table) => ({
  updatedIndex: index("model_pricing_catalog_drafts_updated_idx").on(table.updatedAt)
}));

export const consoleSettings = sqliteTable("console_settings", {
  id: text("id").primaryKey(),
  defaultLanguage: text("default_language").notNull(),
  defaultDurationSeconds: integer("default_duration_seconds").notNull(),
  defaultTemplate: text("default_template").notNull(),
  enabledTemplatesJson: text("enabled_templates_json").notNull(),
  defaultCta: text("default_cta").notNull(),
  defaultProvider: text("default_provider").notNull(),
  maxEstimatedCostCentsPerVideo: integer("max_estimated_cost_cents_per_video").notNull(),
  testCreditBalanceCents: integer("test_credit_balance_cents").notNull(),
  forbiddenWordsJson: text("forbidden_words_json").notNull(),
  exaggerationRulesJson: text("exaggeration_rules_json").notNull(),
  paymentMethodsJson: text("payment_methods_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const modelServicePreferences = sqliteTable("model_service_preferences", {
  workspaceId: text("workspace_id").primaryKey().references(() => workspaces.id, { onDelete: "cascade" }),
  serviceMode: text("service_mode").notNull().default("byok"),
  textModelConfigId: text("text_model_config_id"),
  imageModelConfigId: text("image_model_config_id"),
  videoModelConfigId: text("video_model_config_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

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

export const trafficEvents = sqliteTable("traffic_events", {
  id: text("id").primaryKey(),
  occurredAt: text("occurred_at").notNull(),
  eventName: text("event_name").notNull(),
  path: text("path").notNull(),
  canonicalPath: text("canonical_path").notNull(),
  locale: text("locale"),
  pageType: text("page_type").notNull(),
  sourceGroup: text("source_group").notNull(),
  referrerHost: text("referrer_host"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  sessionHash: text("session_hash"),
  userId: text("user_id"),
  workspaceId: text("workspace_id"),
  metadataJson: text("metadata_json")
}, (table) => ({
  occurredAtIndex: index("traffic_events_occurred_at_idx").on(table.occurredAt),
  nameTimeIndex: index("traffic_events_name_time_idx").on(table.eventName, table.occurredAt),
  pageTimeIndex: index("traffic_events_page_time_idx").on(table.canonicalPath, table.occurredAt),
  sourceTimeIndex: index("traffic_events_source_time_idx").on(table.sourceGroup, table.occurredAt)
}));

export const trafficDailyMetrics = sqliteTable("traffic_daily_metrics", {
  id: text("id").primaryKey(),
  metricDate: text("metric_date").notNull(),
  provider: text("provider").notNull(),
  dataset: text("dataset").notNull(),
  dimensionJson: text("dimension_json").notNull(),
  metricJson: text("metric_json").notNull(),
  syncedAt: text("synced_at").notNull()
}, (table) => ({
  metricUnique: uniqueIndex("traffic_daily_metrics_unique_idx").on(
    table.metricDate,
    table.provider,
    table.dataset,
    table.dimensionJson
  ),
  providerDateIndex: index("traffic_daily_metrics_provider_date_idx").on(table.provider, table.metricDate)
}));

export const indexingSubmissions = sqliteTable("indexing_submissions", {
  id: text("id").primaryKey(),
  submittedAt: text("submitted_at").notNull(),
  provider: text("provider").notNull(),
  submissionType: text("submission_type").notNull(),
  url: text("url").notNull(),
  payloadHash: text("payload_hash"),
  statusCode: integer("status_code"),
  responseExcerpt: text("response_excerpt"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0)
}, (table) => ({
  submittedAtIndex: index("indexing_submissions_submitted_at_idx").on(table.submittedAt),
  providerTimeIndex: index("indexing_submissions_provider_time_idx").on(table.provider, table.submittedAt)
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
  billingPolicies,
  billingPriceRules,
  indexingSubmissions,
  productAssets,
  products,
  modelCredentials,
  modelPricingCatalogDrafts,
  modelPricingCatalogVersions,
  modelServicePreferences,
  modelVariants,
  storyboards,
  trafficDailyMetrics,
  trafficEvents,
  userSessions,
  users,
  videoAssets,
  videoJobs,
  walletTransactions,
  workspaceMembers,
  workspaces
};
