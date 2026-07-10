import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

import type { DatabaseHandle } from "./db/client.js";
import { recordTrafficDailyMetric } from "./adminTraffic.js";

export type TrafficExternalProviderStatus = "not_configured" | "synced" | "error";

export interface TrafficExternalProviderSyncResult {
  id: "ga4" | "search-console" | "bing-webmaster" | "cloudflare";
  configured: boolean;
  status: TrafficExternalProviderStatus;
  rowsSynced: number;
  error?: string;
}

export interface TrafficExternalSyncResult {
  ok: boolean;
  status: "not_configured" | "synced" | "partial_error" | "error";
  providers: TrafficExternalProviderSyncResult[];
  checkedAt: string;
}

export interface SyncExternalTrafficMetricsInput {
  handle: DatabaseHandle;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: Date;
}

interface SearchConsoleRow {
  keys?: unknown[];
  clicks?: unknown;
  impressions?: unknown;
  ctr?: unknown;
  position?: unknown;
}

interface Ga4Row {
  dimensionValues?: Array<{ value?: unknown }>;
  metricValues?: Array<{ value?: unknown }>;
}

interface BingSitemapRow {
  url?: unknown;
  submittedAt?: unknown;
  lastSubmitted?: unknown;
  status?: unknown;
  indexedUrls?: unknown;
  errors?: unknown;
}

interface CloudflareMetricRow {
  date?: unknown;
  requests?: unknown;
  country?: unknown;
  status?: unknown;
  crawler?: unknown;
}

const dayMs = 24 * 60 * 60 * 1000;

export async function syncExternalTrafficMetrics(input: SyncExternalTrafficMetricsInput): Promise<TrafficExternalSyncResult> {
  const env = input.env ?? process.env;
  const now = input.now ?? new Date();
  const fetchImpl = input.fetchImpl ?? fetch;
  const providers: TrafficExternalProviderSyncResult[] = [];

  providers.push(await runProviderSync("ga4", isGa4Configured(env), () => syncGa4({
    ...input,
    env,
    fetchImpl,
    now
  })));
  providers.push(await runProviderSync("search-console", isSearchConsoleConfigured(env), () => syncSearchConsole({
    ...input,
    env,
    fetchImpl,
    now
  })));
  providers.push(await runProviderSync("bing-webmaster", isBingConfigured(env), () => syncBingWebmaster({
    ...input,
    env,
    fetchImpl,
    now
  })));
  providers.push(await runProviderSync("cloudflare", isCloudflareConfigured(env), () => syncCloudflare({
    ...input,
    env,
    fetchImpl,
    now
  })));

  const configured = providers.filter((provider) => provider.configured);
  const errored = configured.filter((provider) => provider.status === "error");
  return {
    ok: errored.length === 0,
    status: configured.length === 0
      ? "not_configured"
      : errored.length === 0
        ? "synced"
        : errored.length === configured.length
          ? "error"
          : "partial_error",
    providers,
    checkedAt: now.toISOString()
  };
}

async function runProviderSync(
  id: TrafficExternalProviderSyncResult["id"],
  configured: boolean,
  sync: () => Promise<number>
): Promise<TrafficExternalProviderSyncResult> {
  if (!configured) {
    return {
      id,
      configured: false,
      status: "not_configured",
      rowsSynced: 0
    };
  }
  try {
    return {
      id,
      configured: true,
      status: "synced",
      rowsSynced: await sync()
    };
  } catch (error) {
    return {
      id,
      configured: true,
      status: "error",
      rowsSynced: 0,
      error: safeErrorMessage(error)
    };
  }
}

async function syncSearchConsole(input: Required<Pick<SyncExternalTrafficMetricsInput, "handle" | "fetchImpl" | "now">> & {
  env: NodeJS.ProcessEnv;
}): Promise<number> {
  const siteUrl = input.env.HAITU_SEARCH_CONSOLE_SITE_URL;
  const token = await googleAccessToken(input.env, input.fetchImpl, input.now);
  if (!siteUrl || !token) {
    return 0;
  }
  const response = await input.fetchImpl(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        startDate: isoDate(daysBefore(input.now, 3)),
        endDate: isoDate(input.now),
        dimensions: ["query", "page", "country", "device"],
        rowLimit: 25000
      })
    }
  );
  const payload = await readJsonResponse(response);
  const rows = arrayValue<SearchConsoleRow>((payload as { rows?: unknown }).rows);
  let rowsSynced = 0;
  for (const row of rows) {
    const keys = row.keys ?? [];
    const query = stringValue(keys[0]);
    const page = stringValue(keys[1]);
    if (!query || !page) {
      continue;
    }
    recordTrafficDailyMetric({
      handle: input.handle,
      metricDate: isoDate(input.now),
      provider: "search_console",
      dataset: "query_page",
      dimension: {
        query,
        page,
        country: stringValue(keys[2]),
        device: stringValue(keys[3])
      },
      metric: {
        clicks: numberValue(row.clicks),
        impressions: numberValue(row.impressions),
        ctr: numberValue(row.ctr),
        position: numberValue(row.position)
      },
      syncedAt: input.now
    });
    rowsSynced += 1;
  }
  return rowsSynced;
}

async function syncGa4(input: Required<Pick<SyncExternalTrafficMetricsInput, "handle" | "fetchImpl" | "now">> & {
  env: NodeJS.ProcessEnv;
}): Promise<number> {
  const propertyId = input.env.HAITU_GA4_PROPERTY_ID;
  const token = await googleAccessToken(input.env, input.fetchImpl, input.now);
  if (!propertyId || !token) {
    return 0;
  }
  const propertyPath = propertyId.startsWith("properties/") ? propertyId : `properties/${propertyId}`;
  const response = await input.fetchImpl(
    `https://analyticsdata.googleapis.com/v1beta/${propertyPath}:runReport`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        dateRanges: [
          {
            startDate: isoDate(daysBefore(input.now, 3)),
            endDate: isoDate(input.now)
          }
        ],
        dimensions: [
          { name: "date" },
          { name: "pagePath" },
          { name: "sessionSourceMedium" },
          { name: "country" },
          { name: "deviceCategory" },
          { name: "eventName" }
        ],
        metrics: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "eventCount" },
          { name: "conversions" }
        ],
        limit: "25000"
      })
    }
  );
  const payload = await readJsonResponse(response);
  const rows = arrayValue<Ga4Row>((payload as { rows?: unknown }).rows);
  let rowsSynced = 0;
  for (const row of rows) {
    const dimensions = row.dimensionValues ?? [];
    const metrics = row.metricValues ?? [];
    const date = ga4Date(stringValue(dimensions[0]?.value)) ?? isoDate(input.now);
    const pagePath = stringValue(dimensions[1]?.value);
    if (!pagePath) {
      continue;
    }
    recordTrafficDailyMetric({
      handle: input.handle,
      metricDate: date,
      provider: "ga4",
      dataset: "event_page",
      dimension: {
        pagePath,
        sessionSourceMedium: stringValue(dimensions[2]?.value),
        country: stringValue(dimensions[3]?.value),
        deviceCategory: stringValue(dimensions[4]?.value),
        eventName: stringValue(dimensions[5]?.value)
      },
      metric: {
        activeUsers: numberValue(metrics[0]?.value),
        sessions: numberValue(metrics[1]?.value),
        screenPageViews: numberValue(metrics[2]?.value),
        eventCount: numberValue(metrics[3]?.value),
        conversions: numberValue(metrics[4]?.value)
      },
      syncedAt: input.now
    });
    rowsSynced += 1;
  }
  return rowsSynced;
}

async function syncBingWebmaster(input: Required<Pick<SyncExternalTrafficMetricsInput, "handle" | "fetchImpl" | "now">> & {
  env: NodeJS.ProcessEnv;
}): Promise<number> {
  const apiKey = input.env.HAITU_BING_WEBMASTER_API_KEY;
  if (!apiKey) {
    return 0;
  }
  const siteUrl = input.env.HAITU_SEARCH_CONSOLE_SITE_URL ?? "https://haitu.online/";
  const url = `https://ssl.bing.com/webmaster/api.svc/json/GetSitemaps?apikey=${encodeURIComponent(apiKey)}&siteUrl=${encodeURIComponent(siteUrl)}`;
  const response = await input.fetchImpl(url);
  const payload = await readJsonResponse(response);
  const rows = normalizeBingSitemaps(payload);
  let rowsSynced = 0;
  for (const row of rows) {
    const sitemapUrl = stringValue(row.url);
    if (!sitemapUrl) {
      continue;
    }
    recordTrafficDailyMetric({
      handle: input.handle,
      metricDate: isoDate(input.now),
      provider: "bing_webmaster",
      dataset: "sitemap",
      dimension: {
        sitemapUrl
      },
      metric: {
        status: stringValue(row.status),
        submittedAt: stringValue(row.submittedAt ?? row.lastSubmitted),
        indexedUrls: numberValue(row.indexedUrls),
        errors: numberValue(row.errors)
      },
      syncedAt: input.now
    });
    rowsSynced += 1;
  }
  return rowsSynced;
}

async function syncCloudflare(input: Required<Pick<SyncExternalTrafficMetricsInput, "handle" | "fetchImpl" | "now">> & {
  env: NodeJS.ProcessEnv;
}): Promise<number> {
  const accountId = input.env.HAITU_CLOUDFLARE_ACCOUNT_ID;
  const zoneId = input.env.HAITU_CLOUDFLARE_ZONE_ID;
  const token = input.env.HAITU_CLOUDFLARE_API_TOKEN;
  if (!accountId || !zoneId || !token) {
    return 0;
  }
  const response = await input.fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/graphql`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      query: `
        query HaituTraffic($zoneTag: string, $from: Time, $to: Time) {
          viewer {
            zones(filter: { zoneTag: $zoneTag }) {
              totals: httpRequestsAdaptiveGroups(limit: 1000, filter: { datetime_geq: $from, datetime_lt: $to }) {
                date: dimensions { date }
                requests: sum { requests }
              }
            }
          }
        }
      `,
      variables: {
        zoneTag: zoneId,
        from: daysBefore(input.now, 3).toISOString(),
        to: input.now.toISOString()
      }
    })
  });
  const payload = await readJsonResponse(response);
  const rows = normalizeCloudflareRows(payload);
  let rowsSynced = 0;
  for (const row of rows) {
    const date = stringValue(row.date) ?? isoDate(input.now);
    recordTrafficDailyMetric({
      handle: input.handle,
      metricDate: date.slice(0, 10),
      provider: "cloudflare",
      dataset: "edge_requests",
      dimension: {
        country: stringValue(row.country),
        status: stringValue(row.status),
        crawler: stringValue(row.crawler)
      },
      metric: {
        requests: numberValue(row.requests)
      },
      syncedAt: input.now
    });
    rowsSynced += 1;
  }
  return rowsSynced;
}

function isGa4Configured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.HAITU_GA4_PROPERTY_ID && hasGoogleCredentials(env));
}

function isSearchConsoleConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.HAITU_SEARCH_CONSOLE_SITE_URL && hasGoogleCredentials(env));
}

function isBingConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.HAITU_BING_WEBMASTER_API_KEY);
}

function isCloudflareConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.HAITU_CLOUDFLARE_ACCOUNT_ID && env.HAITU_CLOUDFLARE_ZONE_ID && env.HAITU_CLOUDFLARE_API_TOKEN);
}

function hasGoogleCredentials(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.HAITU_GOOGLE_APPLICATION_CREDENTIALS
    || env.HAITU_GOOGLE_ACCESS_TOKEN
    || env.GOOGLE_ACCESS_TOKEN
  );
}

async function googleAccessToken(env: NodeJS.ProcessEnv, fetchImpl: typeof fetch, now: Date): Promise<string | undefined> {
  const existing = env.HAITU_GOOGLE_ACCESS_TOKEN ?? env.GOOGLE_ACCESS_TOKEN;
  if (existing) {
    return existing;
  }
  const credentialsPath = env.HAITU_GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    return undefined;
  }
  const credentials = parseGoogleServiceAccountCredentials(readFileSync(credentialsPath, "utf8"));
  if (!credentials) {
    return undefined;
  }
  const assertion = createGoogleServiceAccountJwt({
    clientEmail: credentials.clientEmail,
    privateKey: credentials.privateKey,
    now,
    scope: "https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly"
  });
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }).toString()
  });
  const payload = await readJsonResponse(response) as { access_token?: unknown };
  return stringValue(payload.access_token);
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `HTTP ${response.status}`);
  }
  try {
    return text ? JSON.parse(text) as unknown : {};
  } catch {
    throw new Error("External analytics response was not valid JSON.");
  }
}

function normalizeBingSitemaps(payload: unknown): BingSitemapRow[] {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.sitemaps)) {
      return record.sitemaps as BingSitemapRow[];
    }
    if (Array.isArray(record.d)) {
      return record.d as BingSitemapRow[];
    }
    if (record.d && typeof record.d === "object" && Array.isArray((record.d as Record<string, unknown>).results)) {
      return (record.d as Record<string, unknown>).results as BingSitemapRow[];
    }
  }
  return [];
}

function normalizeCloudflareRows(payload: unknown): CloudflareMetricRow[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const root = payload as Record<string, unknown>;
  const directRows = root.rows ?? root.totals;
  if (Array.isArray(directRows)) {
    return directRows as CloudflareMetricRow[];
  }
  const zones = (((root.data as Record<string, unknown> | undefined)?.viewer as Record<string, unknown> | undefined)?.zones);
  if (!Array.isArray(zones)) {
    return [];
  }
  return zones.flatMap((zone) => {
    const totals = (zone as Record<string, unknown>).totals;
    if (!Array.isArray(totals)) {
      return [];
    }
    return totals.map((item) => {
      const record = item as Record<string, unknown>;
      const dimensions = record.dimensions as Record<string, unknown> | undefined;
      const sum = record.sum as Record<string, unknown> | undefined;
      return {
        date: record.date ?? dimensions?.date,
        country: record.country ?? dimensions?.clientCountryName,
        status: record.status ?? dimensions?.edgeResponseStatus,
        crawler: record.crawler ?? dimensions?.clientRequestHTTPHost,
        requests: record.requests ?? sum?.requests
      };
    });
  });
}

function parseGoogleServiceAccountCredentials(raw: string): {
  clientEmail: string;
  privateKey: string;
} | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }
    const record = parsed as Record<string, unknown>;
    const clientEmail = stringValue(record.client_email);
    const privateKey = stringValue(record.private_key);
    return clientEmail && privateKey ? { clientEmail, privateKey } : undefined;
  } catch {
    return undefined;
  }
}

function createGoogleServiceAccountJwt(input: {
  clientEmail: string;
  privateKey: string;
  now: Date;
  scope: string;
}): string {
  const issuedAt = Math.floor(input.now.getTime() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT"
  };
  const claim = {
    iss: input.clientEmail,
    scope: input.scope,
    aud: "https://oauth2.googleapis.com/token",
    exp: issuedAt + 3600,
    iat: issuedAt
  };
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(claim)}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(input.privateKey);
  return `${signingInput}.${base64Url(signature)}`;
}

function base64UrlJson(value: Record<string, unknown>): string {
  return base64Url(Buffer.from(JSON.stringify(value)));
}

function base64Url(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function arrayValue<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function ga4Date(value: string | undefined): string | undefined {
  if (!value || !/^\d{8}$/.test(value)) {
    return undefined;
  }
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function daysBefore(date: Date, days: number): Date {
  return new Date(date.getTime() - days * dayMs);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}
