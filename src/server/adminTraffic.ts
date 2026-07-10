import { createHash, randomUUID } from "node:crypto";

import type { DatabaseHandle } from "./db/client.js";

export type TrafficEventName =
  | "page_view"
  | "cta_click"
  | "auth_signup"
  | "auth_login"
  | "wallet_recharge_created"
  | "wallet_recharge_paid"
  | "creative_job_created"
  | "creative_job_completed"
  | "seo_index_submit";

export interface RecordTrafficEventInput {
  handle: DatabaseHandle;
  eventName: TrafficEventName;
  path: string;
  referrer?: string | null;
  occurredAt?: Date;
  sessionId?: string;
  userId?: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
}

export interface RecordIndexingSubmissionInput {
  handle: DatabaseHandle;
  provider: string;
  submissionType: string;
  url: string;
  payloadHash?: string;
  statusCode?: number;
  responseExcerpt?: string;
  errorMessage?: string;
  retryCount?: number;
  submittedAt?: Date;
}

export interface AdminTrafficDateRangeInput {
  handle: DatabaseHandle;
  from?: string;
  to?: string;
}

export interface AdminTrafficOverview {
  metrics: {
    visitors: number;
    pageViews: number;
    ctaClicks: number;
    signups: number;
    logins: number;
    rechargeOrders: number;
    paidRecharges: number;
    creativeJobs: number;
    completedCreativeJobs: number;
    indexSubmissions: number;
  };
  trend: Array<{
    date: string;
    visitors: number;
    pageViews: number;
    ctaClicks: number;
    signups: number;
    paidRecharges: number;
    completedCreativeJobs: number;
  }>;
}

export interface AdminTrafficSources {
  sources: Array<{
    source: string;
    visitors: number;
    pageViews: number;
    ctaClicks: number;
    signups: number;
    paidRecharges: number;
    completedCreativeJobs: number;
  }>;
}

export interface AdminTrafficPages {
  pages: Array<{
    path: string;
    locale?: string;
    pageType: string;
    visitors: number;
    pageViews: number;
    searchClicks: number;
    searchImpressions: number;
    searchCtr?: number;
    averagePosition?: number;
    ctaClicks: number;
    signups: number;
    paidRecharges: number;
    completedCreativeJobs: number;
  }>;
}

export interface AdminTrafficIndexing {
  submissions: Array<{
    id: string;
    submittedAt: string;
    provider: string;
    submissionType: string;
    url: string;
    statusCode?: number;
    responseExcerpt?: string;
    errorMessage?: string;
    retryCount: number;
  }>;
}

export interface AdminTrafficSettings {
  integrations: Array<{
    id: string;
    label: string;
    configured: boolean;
    status: "configured" | "not_configured";
    description: string;
  }>;
}

export interface AdminTrafficSearch {
  rows: Array<{
    date: string;
    query: string;
    page: string;
    country?: string;
    device?: string;
    clicks: number;
    impressions: number;
    ctr?: number;
    position?: number;
  }>;
}

export interface AdminTrafficCloudflare {
  rows: Array<{
    date: string;
    country?: string;
    status?: string;
    crawler?: string;
    requests: number;
  }>;
}

export interface AdminTrafficGeoSummary {
  pagesReviewed: number;
  searchClicks: number;
  searchImpressions: number;
  edgeRequests: number;
  opportunities: Array<{
    path: string;
    reason: string;
    searchClicks: number;
    searchImpressions: number;
    searchCtr?: number;
    averagePosition?: number;
    pageViews: number;
    ctaClicks: number;
  }>;
}

export interface RecordTrafficDailyMetricInput {
  handle: DatabaseHandle;
  metricDate: string;
  provider: string;
  dataset: string;
  dimension: Record<string, unknown>;
  metric: Record<string, unknown>;
  syncedAt?: Date;
}

interface CountRow {
  count: number;
}

interface EventAggregateRow {
  visitors: number;
  page_views: number;
  cta_clicks: number;
  signups: number;
  logins: number;
  recharge_orders: number;
  paid_recharges: number;
  creative_jobs: number;
  completed_creative_jobs: number;
}

interface TrendRow {
  date: string;
  visitors: number;
  page_views: number;
  cta_clicks: number;
  signups: number;
  paid_recharges: number;
  completed_creative_jobs: number;
}

interface SourceRow {
  source_group: string;
  visitors: number;
  page_views: number;
  cta_clicks: number;
  signups: number;
  paid_recharges: number;
  completed_creative_jobs: number;
}

interface PageRow {
  canonical_path: string;
  locale: string | null;
  page_type: string;
  visitors: number;
  page_views: number;
  cta_clicks: number;
  signups: number;
  paid_recharges: number;
  completed_creative_jobs: number;
}

interface SearchMetricRow {
  metric_date: string;
  dimension_json: string;
  metric_json: string;
}

interface CloudflareMetricRow {
  metric_date: string;
  dimension_json: string;
  metric_json: string;
}

interface IndexingRow {
  id: string;
  submitted_at: string;
  provider: string;
  submission_type: string;
  url: string;
  status_code: number | null;
  response_excerpt: string | null;
  error_message: string | null;
  retry_count: number;
}

const allowedEventNames = new Set<TrafficEventName>([
  "page_view",
  "cta_click",
  "auth_signup",
  "auth_login",
  "wallet_recharge_created",
  "wallet_recharge_paid",
  "creative_job_created",
  "creative_job_completed",
  "seo_index_submit"
]);

const sourceOrder = new Map([
  ["Organic Search", 0],
  ["AI Answer Engines", 1],
  ["Paid / UTM", 2],
  ["Direct", 3],
  ["Referral", 4],
  ["Social", 5],
  ["Unknown", 6]
]);

export function isAllowedTrafficEventName(value: string): value is TrafficEventName {
  return allowedEventNames.has(value as TrafficEventName);
}

export function recordTrafficEvent(input: RecordTrafficEventInput): void {
  const occurredAt = input.occurredAt ?? new Date();
  const normalized = normalizePath(input.path);
  const referrerHost = hostFromUrl(input.referrer);
  const sessionHash = hashSessionId(input.sessionId, input.env);
  const firstSessionTouch = sessionHash
    ? findFirstSessionTouch(input.handle, sessionHash)
    : undefined;
  const classifiedSource = classifySource({
    referrerHost,
    utmSource: normalized.utmSource,
    utmMedium: normalized.utmMedium
  });
  const sourceGroup = classifiedSource === "Direct" && firstSessionTouch?.source_group
    ? firstSessionTouch.source_group
    : classifiedSource;
  const canonicalPath = input.eventName === "page_view"
    ? normalized.canonicalPath
    : firstSessionTouch?.canonical_path ?? normalized.canonicalPath;
  const locale = input.eventName === "page_view"
    ? normalized.locale
    : firstSessionTouch?.locale ?? normalized.locale;
  const pageType = input.eventName === "page_view"
    ? normalized.pageType
    : firstSessionTouch?.page_type ?? normalized.pageType;
  input.handle.sqlite.prepare(`
    INSERT INTO traffic_events (
      id,
      occurred_at,
      event_name,
      path,
      canonical_path,
      locale,
      page_type,
      source_group,
      referrer_host,
      utm_source,
      utm_medium,
      utm_campaign,
      session_hash,
      user_id,
      workspace_id,
      metadata_json
    ) VALUES (
      @id,
      @occurredAt,
      @eventName,
      @path,
      @canonicalPath,
      @locale,
      @pageType,
      @sourceGroup,
      @referrerHost,
      @utmSource,
      @utmMedium,
      @utmCampaign,
      @sessionHash,
      @userId,
      @workspaceId,
      @metadataJson
    )
  `).run({
    id: `traffic-event-${randomUUID()}`,
    occurredAt: occurredAt.toISOString(),
    eventName: input.eventName,
    path: normalized.path,
    canonicalPath,
    locale,
    pageType,
    sourceGroup,
    referrerHost,
    utmSource: normalized.utmSource,
    utmMedium: normalized.utmMedium,
    utmCampaign: normalized.utmCampaign,
    sessionHash,
    userId: input.userId,
    workspaceId: input.workspaceId,
    metadataJson: serializeMetadata(input.metadata)
  });
}

export function recordIndexingSubmission(input: RecordIndexingSubmissionInput): void {
  const submittedAt = input.submittedAt ?? new Date();
  input.handle.sqlite.prepare(`
    INSERT INTO indexing_submissions (
      id,
      submitted_at,
      provider,
      submission_type,
      url,
      payload_hash,
      status_code,
      response_excerpt,
      error_message,
      retry_count
    ) VALUES (
      @id,
      @submittedAt,
      @provider,
      @submissionType,
      @url,
      @payloadHash,
      @statusCode,
      @responseExcerpt,
      @errorMessage,
      @retryCount
    )
  `).run({
    id: `indexing-submission-${randomUUID()}`,
    submittedAt: submittedAt.toISOString(),
    provider: input.provider,
    submissionType: input.submissionType,
    url: input.url,
    payloadHash: input.payloadHash,
    statusCode: input.statusCode,
    responseExcerpt: truncate(input.responseExcerpt, 1000),
    errorMessage: truncate(input.errorMessage, 1000),
    retryCount: input.retryCount ?? 0
  });
}

export function recordTrafficDailyMetric(input: RecordTrafficDailyMetricInput): void {
  const dimensionJson = stableJson(input.dimension);
  input.handle.sqlite.prepare(`
    INSERT INTO traffic_daily_metrics (
      id,
      metric_date,
      provider,
      dataset,
      dimension_json,
      metric_json,
      synced_at
    ) VALUES (
      @id,
      @metricDate,
      @provider,
      @dataset,
      @dimensionJson,
      @metricJson,
      @syncedAt
    )
    ON CONFLICT(metric_date, provider, dataset, dimension_json) DO UPDATE SET
      metric_json = excluded.metric_json,
      synced_at = excluded.synced_at
  `).run({
    id: `traffic-metric-${randomUUID()}`,
    metricDate: input.metricDate,
    provider: input.provider,
    dataset: input.dataset,
    dimensionJson,
    metricJson: stableJson(input.metric),
    syncedAt: (input.syncedAt ?? new Date()).toISOString()
  });
}

export function buildAdminTrafficOverview(input: AdminTrafficDateRangeInput): AdminTrafficOverview {
  const range = normalizeRange(input);
  const metrics = input.handle.sqlite.prepare(`
    SELECT
      COUNT(DISTINCT COALESCE(session_hash, user_id, workspace_id, id)) AS visitors,
      SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS page_views,
      SUM(CASE WHEN event_name = 'cta_click' THEN 1 ELSE 0 END) AS cta_clicks,
      SUM(CASE WHEN event_name = 'auth_signup' THEN 1 ELSE 0 END) AS signups,
      SUM(CASE WHEN event_name = 'auth_login' THEN 1 ELSE 0 END) AS logins,
      SUM(CASE WHEN event_name = 'wallet_recharge_created' THEN 1 ELSE 0 END) AS recharge_orders,
      SUM(CASE WHEN event_name = 'wallet_recharge_paid' THEN 1 ELSE 0 END) AS paid_recharges,
      SUM(CASE WHEN event_name = 'creative_job_created' THEN 1 ELSE 0 END) AS creative_jobs,
      SUM(CASE WHEN event_name = 'creative_job_completed' THEN 1 ELSE 0 END) AS completed_creative_jobs
    FROM traffic_events
    WHERE occurred_at >= @from AND occurred_at < @to
  `).get(range) as EventAggregateRow | undefined;
  const indexSubmissions = count(input.handle, `
    SELECT COUNT(*) AS count
    FROM indexing_submissions
    WHERE submitted_at >= @from AND submitted_at < @to
  `, range);
  const trendRows = input.handle.sqlite.prepare(`
    SELECT
      substr(occurred_at, 1, 10) AS date,
      COUNT(DISTINCT COALESCE(session_hash, user_id, workspace_id, id)) AS visitors,
      SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS page_views,
      SUM(CASE WHEN event_name = 'cta_click' THEN 1 ELSE 0 END) AS cta_clicks,
      SUM(CASE WHEN event_name = 'auth_signup' THEN 1 ELSE 0 END) AS signups,
      SUM(CASE WHEN event_name = 'wallet_recharge_paid' THEN 1 ELSE 0 END) AS paid_recharges,
      SUM(CASE WHEN event_name = 'creative_job_completed' THEN 1 ELSE 0 END) AS completed_creative_jobs
    FROM traffic_events
    WHERE occurred_at >= @from AND occurred_at < @to
    GROUP BY substr(occurred_at, 1, 10)
    ORDER BY date ASC
  `).all(range) as TrendRow[];

  return {
    metrics: {
      visitors: metrics?.visitors ?? 0,
      pageViews: metrics?.page_views ?? 0,
      ctaClicks: metrics?.cta_clicks ?? 0,
      signups: metrics?.signups ?? 0,
      logins: metrics?.logins ?? 0,
      rechargeOrders: metrics?.recharge_orders ?? 0,
      paidRecharges: metrics?.paid_recharges ?? 0,
      creativeJobs: metrics?.creative_jobs ?? 0,
      completedCreativeJobs: metrics?.completed_creative_jobs ?? 0,
      indexSubmissions
    },
    trend: trendRows.map((row) => ({
      date: row.date,
      visitors: row.visitors,
      pageViews: row.page_views,
      ctaClicks: row.cta_clicks,
      signups: row.signups,
      paidRecharges: row.paid_recharges,
      completedCreativeJobs: row.completed_creative_jobs
    }))
  };
}

export function buildAdminTrafficSources(input: AdminTrafficDateRangeInput): AdminTrafficSources {
  const rows = input.handle.sqlite.prepare(`
    SELECT
      source_group,
      COUNT(DISTINCT COALESCE(session_hash, user_id, workspace_id, id)) AS visitors,
      SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS page_views,
      SUM(CASE WHEN event_name = 'cta_click' THEN 1 ELSE 0 END) AS cta_clicks,
      SUM(CASE WHEN event_name = 'auth_signup' THEN 1 ELSE 0 END) AS signups,
      SUM(CASE WHEN event_name = 'wallet_recharge_paid' THEN 1 ELSE 0 END) AS paid_recharges,
      SUM(CASE WHEN event_name = 'creative_job_completed' THEN 1 ELSE 0 END) AS completed_creative_jobs
    FROM traffic_events
    WHERE occurred_at >= @from AND occurred_at < @to
    GROUP BY source_group
  `).all(normalizeRange(input)) as SourceRow[];
  return {
    sources: rows
      .map((row) => ({
        source: row.source_group,
        visitors: row.visitors,
        pageViews: row.page_views,
        ctaClicks: row.cta_clicks,
        signups: row.signups,
        paidRecharges: row.paid_recharges,
        completedCreativeJobs: row.completed_creative_jobs
      }))
      .sort((a, b) => {
        const orderDelta = (sourceOrder.get(a.source) ?? 99) - (sourceOrder.get(b.source) ?? 99);
        return orderDelta || b.visitors - a.visitors || a.source.localeCompare(b.source);
      })
  };
}

export function buildAdminTrafficPages(input: AdminTrafficDateRangeInput & {
  pageType?: string;
  locale?: string;
}): AdminTrafficPages {
  const filters = ["occurred_at >= @from", "occurred_at < @to"];
  const params: Record<string, unknown> = normalizeRange(input);
  if (input.pageType) {
    filters.push("page_type = @pageType");
    params.pageType = input.pageType;
  }
  if (input.locale) {
    filters.push("locale = @locale");
    params.locale = input.locale;
  }
  const rows = input.handle.sqlite.prepare(`
    SELECT
      canonical_path,
      locale,
      page_type,
      COUNT(DISTINCT COALESCE(session_hash, user_id, workspace_id, id)) AS visitors,
      SUM(CASE WHEN event_name = 'page_view' THEN 1 ELSE 0 END) AS page_views,
      SUM(CASE WHEN event_name = 'cta_click' THEN 1 ELSE 0 END) AS cta_clicks,
      SUM(CASE WHEN event_name = 'auth_signup' THEN 1 ELSE 0 END) AS signups,
      SUM(CASE WHEN event_name = 'wallet_recharge_paid' THEN 1 ELSE 0 END) AS paid_recharges,
      SUM(CASE WHEN event_name = 'creative_job_completed' THEN 1 ELSE 0 END) AS completed_creative_jobs
    FROM traffic_events
    WHERE ${filters.join(" AND ")}
    GROUP BY canonical_path, locale, page_type
    ORDER BY page_views DESC, visitors DESC, canonical_path ASC
    LIMIT 100
  `).all(params) as PageRow[];
  return {
    pages: rows.map((row) => ({
      ...searchMetricsForPage(input.handle, row.canonical_path, params.from as string, params.to as string),
      path: row.canonical_path,
      locale: row.locale ?? undefined,
      pageType: row.page_type,
      visitors: row.visitors,
      pageViews: row.page_views,
      ctaClicks: row.cta_clicks,
      signups: row.signups,
      paidRecharges: row.paid_recharges,
      completedCreativeJobs: row.completed_creative_jobs
    }))
  };
}

export function buildAdminTrafficSearch(input: AdminTrafficDateRangeInput & {
  page?: string;
  query?: string;
}): AdminTrafficSearch {
  const range = normalizeRange(input);
  const rows = input.handle.sqlite.prepare(`
    SELECT metric_date, dimension_json, metric_json
    FROM traffic_daily_metrics
    WHERE provider = 'search_console'
      AND dataset = 'query_page'
      AND metric_date >= substr(@from, 1, 10)
      AND metric_date <= substr(@to, 1, 10)
    ORDER BY metric_date DESC, rowid DESC
    LIMIT 500
  `).all(range) as SearchMetricRow[];
  const pageFilter = input.page?.toLowerCase();
  const queryFilter = input.query?.toLowerCase();
  return {
    rows: rows
      .map(searchMetricFromRow)
      .filter((row): row is AdminTrafficSearch["rows"][number] => Boolean(row))
      .filter((row) => !pageFilter || row.page.toLowerCase().includes(pageFilter))
      .filter((row) => !queryFilter || row.query.toLowerCase().includes(queryFilter))
  };
}

export function buildAdminTrafficCloudflare(input: AdminTrafficDateRangeInput): AdminTrafficCloudflare {
  const range = normalizeRange(input);
  const rows = input.handle.sqlite.prepare(`
    SELECT metric_date, dimension_json, metric_json
    FROM traffic_daily_metrics
    WHERE provider = 'cloudflare'
      AND dataset = 'edge_requests'
      AND metric_date >= substr(@from, 1, 10)
      AND metric_date <= substr(@to, 1, 10)
    ORDER BY metric_date DESC, rowid DESC
    LIMIT 500
  `).all(range) as CloudflareMetricRow[];
  return {
    rows: rows.map(cloudflareMetricFromRow)
  };
}

export function buildAdminTrafficGeoSummary(input: AdminTrafficDateRangeInput): AdminTrafficGeoSummary {
  const range = normalizeRange(input);
  const pages = buildAdminTrafficPages({ handle: input.handle, ...range }).pages;
  const cloudflare = buildAdminTrafficCloudflare({ handle: input.handle, ...range });
  const searchClicks = pages.reduce((total, page) => total + page.searchClicks, 0);
  const searchImpressions = pages.reduce((total, page) => total + page.searchImpressions, 0);
  const edgeRequests = cloudflare.rows.reduce((total, row) => total + row.requests, 0);
  return {
    pagesReviewed: pages.length,
    searchClicks,
    searchImpressions,
    edgeRequests,
    opportunities: pages
      .filter((page) => page.searchImpressions >= 50 && (page.searchCtr ?? 0) < 0.03)
      .slice(0, 20)
      .map((page) => ({
        path: page.path,
        reason: "High search impressions with low CTR",
        searchClicks: page.searchClicks,
        searchImpressions: page.searchImpressions,
        searchCtr: page.searchCtr,
        averagePosition: page.averagePosition,
        pageViews: page.pageViews,
        ctaClicks: page.ctaClicks
      }))
  };
}

export function buildAdminTrafficIndexing(input: AdminTrafficDateRangeInput & {
  limit?: number;
}): AdminTrafficIndexing {
  const params = {
    ...normalizeRange(input),
    limit: Math.min(Math.max(input.limit ?? 50, 1), 200)
  };
  const rows = input.handle.sqlite.prepare(`
    SELECT
      id,
      submitted_at,
      provider,
      submission_type,
      url,
      status_code,
      response_excerpt,
      error_message,
      retry_count
    FROM indexing_submissions
    WHERE submitted_at >= @from AND submitted_at < @to
    ORDER BY submitted_at DESC, rowid DESC
    LIMIT @limit
  `).all(params) as IndexingRow[];
  return {
    submissions: rows.map((row) => ({
      id: row.id,
      submittedAt: row.submitted_at,
      provider: row.provider,
      submissionType: row.submission_type,
      url: row.url,
      statusCode: row.status_code ?? undefined,
      responseExcerpt: row.response_excerpt ?? undefined,
      errorMessage: row.error_message ?? undefined,
      retryCount: row.retry_count
    }))
  };
}

export function buildAdminTrafficSettings(input: {
  handle: DatabaseHandle;
  env?: NodeJS.ProcessEnv;
}): AdminTrafficSettings {
  const env = input.env ?? process.env;
  const googleCredentialsConfigured = hasGoogleCredentials(env);
  return {
    integrations: [
      {
        id: "first-party",
        label: "Haitu first-party events",
        configured: isEnabled(env.HAITU_TRAFFIC_ANALYTICS_ENABLED),
        status: isEnabled(env.HAITU_TRAFFIC_ANALYTICS_ENABLED) ? "configured" : "not_configured",
        description: "Records low-sensitive page, CTA, signup, recharge, and creative events."
      },
      {
        id: "ga4",
        label: "Google Analytics 4",
        configured: Boolean(env.HAITU_GA4_PROPERTY_ID && googleCredentialsConfigured),
        status: env.HAITU_GA4_PROPERTY_ID && googleCredentialsConfigured ? "configured" : "not_configured",
        description: "Caches GA4 traffic and event reports when credentials are configured."
      },
      {
        id: "search-console",
        label: "Google Search Console",
        configured: Boolean(env.HAITU_SEARCH_CONSOLE_SITE_URL && googleCredentialsConfigured),
        status: env.HAITU_SEARCH_CONSOLE_SITE_URL && googleCredentialsConfigured ? "configured" : "not_configured",
        description: "Caches search clicks, impressions, CTR, position, queries, and pages."
      },
      {
        id: "bing-webmaster",
        label: "Bing Webmaster Tools",
        configured: Boolean(env.HAITU_BING_WEBMASTER_API_KEY),
        status: env.HAITU_BING_WEBMASTER_API_KEY ? "configured" : "not_configured",
        description: "Tracks Bing webmaster configuration and future URL submission sync."
      },
      {
        id: "indexnow",
        label: "IndexNow",
        configured: Boolean(env.HAITU_INDEXNOW_KEY),
        status: env.HAITU_INDEXNOW_KEY ? "configured" : "not_configured",
        description: "Records IndexNow URL notification attempts and results."
      },
      {
        id: "cloudflare",
        label: "Cloudflare Analytics",
        configured: Boolean(env.HAITU_CLOUDFLARE_ACCOUNT_ID && env.HAITU_CLOUDFLARE_ZONE_ID && env.HAITU_CLOUDFLARE_API_TOKEN),
        status: env.HAITU_CLOUDFLARE_ACCOUNT_ID && env.HAITU_CLOUDFLARE_ZONE_ID && env.HAITU_CLOUDFLARE_API_TOKEN
          ? "configured"
          : "not_configured",
        description: "Caches edge request, status code, country, and crawler reports when configured."
      }
    ]
  };
}

export function parseAdminTrafficDateRange(url: URL, now = new Date()): {
  from: string;
  to: string;
} | Response {
  const fromValue = url.searchParams.get("from");
  const toValue = url.searchParams.get("to");
  const to = toValue ? parseDateParam(toValue) : new Date(now.getTime() + 1);
  if (!to) {
    return new Response(JSON.stringify({ error: "Invalid traffic date range" }, null, 2), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
  const from = fromValue ? parseDateParam(fromValue) : new Date(to.getTime() - 28 * 24 * 60 * 60 * 1000);
  if (!from || from >= to) {
    return new Response(JSON.stringify({ error: "Invalid traffic date range" }, null, 2), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
  return {
    from: from.toISOString(),
    to: to.toISOString()
  };
}

export async function submitIndexNow(input: {
  handle: DatabaseHandle;
  urls: string[];
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<{
  ok: boolean;
  provider: "indexnow";
  status: "submitted" | "not_configured" | "failed";
  statusCode?: number;
  error?: string;
}> {
  const env = input.env ?? process.env;
  const key = env.HAITU_INDEXNOW_KEY;
  const cleanUrls = input.urls.map((url) => url.trim()).filter(isPublicHttpUrl);
  if (!key) {
    recordIndexingSubmission({
      handle: input.handle,
      provider: "indexnow",
      submissionType: "batch",
      url: cleanUrls[0] ?? "https://haitu.online/sitemap.xml",
      errorMessage: "HAITU_INDEXNOW_KEY is not configured.",
      submittedAt: input.now
    });
    return {
      ok: true,
      provider: "indexnow",
      status: "not_configured"
    };
  }
  if (cleanUrls.length === 0) {
    return {
      ok: false,
      provider: "indexnow",
      status: "failed",
      error: "No public URL can be submitted."
    };
  }
  const firstUrl = new URL(cleanUrls[0]);
  const host = firstUrl.hostname;
  const payload = {
    host,
    key,
    keyLocation: `https://${host}/${key}.txt`,
    urlList: cleanUrls
  };
  const submittedAt = input.now ?? new Date();
  try {
    const response = await (input.fetchImpl ?? fetch)("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const responseExcerpt = await response.text();
    recordIndexingSubmission({
      handle: input.handle,
      provider: "indexnow",
      submissionType: cleanUrls.length === 1 ? "url" : "batch",
      url: cleanUrls[0],
      payloadHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
      statusCode: response.status,
      responseExcerpt,
      errorMessage: response.ok ? undefined : responseExcerpt || `HTTP ${response.status}`,
      submittedAt
    });
    return {
      ok: response.ok,
      provider: "indexnow",
      status: response.ok ? "submitted" : "failed",
      statusCode: response.status,
      error: response.ok ? undefined : responseExcerpt || `HTTP ${response.status}`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordIndexingSubmission({
      handle: input.handle,
      provider: "indexnow",
      submissionType: cleanUrls.length === 1 ? "url" : "batch",
      url: cleanUrls[0],
      payloadHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
      errorMessage: message,
      submittedAt
    });
    return {
      ok: false,
      provider: "indexnow",
      status: "failed",
      error: message
    };
  }
}

function normalizeRange(input: AdminTrafficDateRangeInput): {
  from: string;
  to: string;
} {
  const to = input.to ?? new Date().toISOString();
  const from = input.from ?? new Date(Date.parse(to) - 28 * 24 * 60 * 60 * 1000).toISOString();
  return { from, to };
}

function searchMetricFromRow(row: SearchMetricRow): AdminTrafficSearch["rows"][number] | undefined {
  const dimension = parseJsonRecord(row.dimension_json);
  const metric = parseJsonRecord(row.metric_json);
  const query = stringMetric(dimension.query);
  const page = stringMetric(dimension.page);
  if (!query || !page) {
    return undefined;
  }
  return {
    date: row.metric_date,
    query,
    page,
    country: stringMetric(dimension.country),
    device: stringMetric(dimension.device),
    clicks: numberMetric(metric.clicks),
    impressions: numberMetric(metric.impressions),
    ctr: optionalNumberMetric(metric.ctr),
    position: optionalNumberMetric(metric.position)
  };
}

function cloudflareMetricFromRow(row: CloudflareMetricRow): AdminTrafficCloudflare["rows"][number] {
  const dimension = parseJsonRecord(row.dimension_json);
  const metric = parseJsonRecord(row.metric_json);
  return {
    date: row.metric_date,
    country: stringMetric(dimension.country),
    status: stringMetric(dimension.status),
    crawler: stringMetric(dimension.crawler),
    requests: numberMetric(metric.requests)
  };
}

function searchMetricsForPage(handle: DatabaseHandle, path: string, from: string, to: string): {
  searchClicks: number;
  searchImpressions: number;
  searchCtr?: number;
  averagePosition?: number;
} {
  const search = buildAdminTrafficSearch({ handle, from, to });
  const rows = search.rows.filter((row) => canonicalPathFromUrl(row.page) === path);
  const searchClicks = rows.reduce((total, row) => total + row.clicks, 0);
  const searchImpressions = rows.reduce((total, row) => total + row.impressions, 0);
  const weightedPositionTotal = rows.reduce((total, row) => total + (row.position ?? 0) * row.impressions, 0);
  return {
    searchClicks,
    searchImpressions,
    searchCtr: searchImpressions > 0 ? searchClicks / searchImpressions : undefined,
    averagePosition: searchImpressions > 0 ? weightedPositionTotal / searchImpressions : undefined
  };
}

function canonicalPathFromUrl(value: string): string {
  try {
    return normalizePathname(new URL(value).pathname);
  } catch {
    return normalizePathname(value);
  }
}

function stableJson(value: Record<string, unknown>): string {
  return JSON.stringify(Object.keys(value).sort().reduce<Record<string, unknown>>((result, key) => {
    result[key] = value[key];
    return result;
  }, {}));
}

function parseJsonRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function stringMetric(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberMetric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function optionalNumberMetric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:")
      && !["/admin", "/console", "/app", "/api"].some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
  } catch {
    return false;
  }
}

function normalizePath(value: string): {
  path: string;
  canonicalPath: string;
  locale?: string;
  pageType: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
} {
  const url = value.startsWith("http://") || value.startsWith("https://")
    ? new URL(value)
    : new URL(value.startsWith("/") ? value : `/${value}`, "https://haitu.online");
  const pathname = normalizePathname(url.pathname);
  return {
    path: `${pathname}${url.search}`,
    canonicalPath: pathname,
    locale: inferLocale(pathname),
    pageType: inferPageType(pathname),
    utmSource: trimToUndefined(url.searchParams.get("utm_source")),
    utmMedium: trimToUndefined(url.searchParams.get("utm_medium")),
    utmCampaign: trimToUndefined(url.searchParams.get("utm_campaign"))
  };
}

function normalizePathname(value: string): string {
  const pathname = value.startsWith("/") ? value : `/${value}`;
  if (pathname !== "/" && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname || "/";
}

function inferLocale(pathname: string): string | undefined {
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    return "en";
  }
  return "zh";
}

function inferPageType(pathname: string): string {
  const path = pathname === "/en" ? "/" : pathname.replace(/^\/en(?=\/)/, "");
  if (path === "/") {
    return "home";
  }
  if (path.startsWith("/features/")) {
    return "feature";
  }
  if (path.startsWith("/platforms/")) {
    return "platform";
  }
  if (path.startsWith("/use-cases/")) {
    return "use-case";
  }
  if (path.startsWith("/categories/")) {
    return "category";
  }
  if (path.startsWith("/tools/")) {
    return "tool";
  }
  if (path.startsWith("/compare/")) {
    return "compare";
  }
  if (["/terms", "/privacy", "/refund", "/contact"].includes(path)) {
    return "trust";
  }
  return "other";
}

function classifySource(input: {
  referrerHost?: string;
  utmSource?: string;
  utmMedium?: string;
}): string {
  const utmSource = input.utmSource?.toLowerCase();
  const utmMedium = input.utmMedium?.toLowerCase();
  const host = input.referrerHost?.toLowerCase();
  if (host && isAiHost(host)) {
    return "AI Answer Engines";
  }
  if (utmSource || utmMedium) {
    if (isAiHost(utmSource ?? "")) {
      return "AI Answer Engines";
    }
    return "Paid / UTM";
  }
  if (!host || host === "haitu.online" || host.endsWith(".haitu.online")) {
    return "Direct";
  }
  if (isAiHost(host)) {
    return "AI Answer Engines";
  }
  if (isSearchHost(host)) {
    return "Organic Search";
  }
  if (isSocialHost(host)) {
    return "Social";
  }
  return "Referral";
}

function isSearchHost(host: string): boolean {
  return [
    "google.",
    "bing.com",
    "yahoo.",
    "duckduckgo.com",
    "baidu.com",
    "yandex."
  ].some((needle) => host.includes(needle));
}

function isAiHost(host: string): boolean {
  return [
    "chatgpt",
    "perplexity",
    "copilot",
    "gemini",
    "claude"
  ].some((needle) => host.includes(needle));
}

function isSocialHost(host: string): boolean {
  return [
    "x.com",
    "twitter.com",
    "facebook.com",
    "linkedin.com",
    "instagram.com",
    "tiktok.com",
    "youtube.com",
    "reddit.com"
  ].some((needle) => host.includes(needle));
}

function hostFromUrl(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function hashSessionId(sessionId: string | undefined, env: NodeJS.ProcessEnv | undefined): string | undefined {
  if (!sessionId) {
    return undefined;
  }
  const salt = env?.HAITU_TRAFFIC_EVENT_SALT ?? process.env.HAITU_TRAFFIC_EVENT_SALT ?? "haitu-traffic-local-salt";
  return createHash("sha256").update(`${salt}:${sessionId}`).digest("hex");
}

function serializeMetadata(metadata: Record<string, unknown> | undefined): string | undefined {
  if (!metadata) {
    return undefined;
  }
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata).slice(0, 20)) {
    if (!/^[a-zA-Z0-9_.:-]{1,64}$/.test(key)) {
      continue;
    }
    if (typeof value === "string") {
      safe[key] = truncate(value, 256);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      safe[key] = value;
    }
  }
  return JSON.stringify(safe);
}

function truncate(value: string | undefined, maxLength: number): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function trimToUndefined(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function count(handle: DatabaseHandle, sql: string, params: Record<string, unknown>): number {
  const row = handle.sqlite.prepare(sql).get(params) as CountRow | undefined;
  return row?.count ?? 0;
}

function findFirstSessionTouch(handle: DatabaseHandle, sessionHash: string): {
  canonical_path: string;
  locale: string | null;
  page_type: string;
  source_group: string;
} | undefined {
  return handle.sqlite.prepare(`
    SELECT canonical_path, locale, page_type, source_group
    FROM traffic_events
    WHERE session_hash = @sessionHash
    ORDER BY occurred_at ASC, rowid ASC
    LIMIT 1
  `).get({ sessionHash }) as {
    canonical_path: string;
    locale: string | null;
    page_type: string;
    source_group: string;
  } | undefined;
}

function parseDateParam(value: string): Date | undefined {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function isEnabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function hasGoogleCredentials(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.HAITU_GOOGLE_APPLICATION_CREDENTIALS
    || env.HAITU_GOOGLE_ACCESS_TOKEN
    || env.GOOGLE_ACCESS_TOKEN
  );
}
