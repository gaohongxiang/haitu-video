import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";

import {
  buildAdminTrafficIndexing,
  buildAdminTrafficGeoSummary,
  buildAdminTrafficOverview,
  buildAdminTrafficPages,
  buildAdminTrafficCloudflare,
  buildAdminTrafficSearch,
  buildAdminTrafficSettings,
  buildAdminTrafficSources,
  recordTrafficDailyMetric,
  recordIndexingSubmission,
  recordTrafficEvent
} from "../../src/server/adminTraffic.js";
import { closeDatabase, openDatabase, type DatabaseHandle } from "../../src/server/db/client.js";
import { ensureDefaultWorkspace, runMigrations } from "../../src/server/db/migrate.js";
import { syncExternalTrafficMetrics } from "../../src/server/trafficExternalSync.js";

const tempDirs: string[] = [];

describe("admin traffic analytics", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("records first-party traffic events and aggregates overview, source, and page conversion metrics", async () => {
    const { handle, close } = await openTestDatabase("haitu-admin-traffic-");
    try {
      recordTrafficEvent({
        handle,
        eventName: "page_view",
        path: "/",
        referrer: "https://www.google.com/search?q=haitu",
        occurredAt: new Date("2026-07-08T08:00:00.000Z"),
        sessionId: "session-a"
      });
      recordTrafficEvent({
        handle,
        eventName: "cta_click",
        path: "/",
        referrer: "https://www.google.com/search?q=haitu",
        occurredAt: new Date("2026-07-08T08:01:00.000Z"),
        sessionId: "session-a",
        metadata: { cta: "console" }
      });
      recordTrafficEvent({
        handle,
        eventName: "auth_signup",
        path: "/",
        occurredAt: new Date("2026-07-08T08:05:00.000Z"),
        sessionId: "session-a",
        userId: "user-a"
      });
      recordTrafficEvent({
        handle,
        eventName: "wallet_recharge_paid",
        path: "/",
        occurredAt: new Date("2026-07-08T08:20:00.000Z"),
        sessionId: "session-a",
        userId: "user-a",
        workspaceId: "workspace-a"
      });
      recordTrafficEvent({
        handle,
        eventName: "creative_job_completed",
        path: "/features/ai-product-video-generator?utm_source=newsletter&utm_medium=email",
        referrer: "https://chatgpt.com/",
        occurredAt: new Date("2026-07-08T09:00:00.000Z"),
        sessionId: "session-b",
        workspaceId: "workspace-a"
      });
      recordIndexingSubmission({
        handle,
        provider: "indexnow",
        submissionType: "url",
        url: "https://haitu.online/",
        statusCode: 200,
        responseExcerpt: "OK",
        submittedAt: new Date("2026-07-08T10:00:00.000Z")
      });

      const overview = buildAdminTrafficOverview({
        handle,
        from: "2026-07-08T00:00:00.000Z",
        to: "2026-07-09T00:00:00.000Z"
      });
      const sources = buildAdminTrafficSources({
        handle,
        from: "2026-07-08T00:00:00.000Z",
        to: "2026-07-09T00:00:00.000Z"
      });
      const pages = buildAdminTrafficPages({
        handle,
        from: "2026-07-08T00:00:00.000Z",
        to: "2026-07-09T00:00:00.000Z"
      });
      const indexing = buildAdminTrafficIndexing({ handle });

      expect(overview.metrics).toEqual(expect.objectContaining({
        visitors: 2,
        pageViews: 1,
        ctaClicks: 1,
        signups: 1,
        paidRecharges: 1,
        completedCreativeJobs: 1,
        indexSubmissions: 1
      }));
      expect(overview.trend).toEqual([
        expect.objectContaining({
          date: "2026-07-08",
          pageViews: 1,
          signups: 1,
          paidRecharges: 1,
          completedCreativeJobs: 1
        })
      ]);
      expect(sources.sources).toEqual([
        expect.objectContaining({
          source: "Organic Search",
          visitors: 1,
          pageViews: 1,
          ctaClicks: 1,
          signups: 1,
          paidRecharges: 1
        }),
        expect.objectContaining({
          source: "AI Answer Engines",
          visitors: 1,
          completedCreativeJobs: 1
        })
      ]);
      expect(pages.pages).toEqual([
        expect.objectContaining({
          path: "/",
          pageType: "home",
          pageViews: 1,
          ctaClicks: 1,
          signups: 1,
          paidRecharges: 1
        }),
        expect.objectContaining({
          path: "/features/ai-product-video-generator",
          pageType: "feature",
          completedCreativeJobs: 1
        })
      ]);
      expect(indexing.submissions).toEqual([
        expect.objectContaining({
          provider: "indexnow",
          submissionType: "url",
          url: "https://haitu.online/",
          statusCode: 200,
          responseExcerpt: "OK"
        })
      ]);
    } finally {
      close();
    }
  });

  it("reports third-party analytics integration status without exposing secrets", async () => {
    const { handle, close } = await openTestDatabase("haitu-admin-traffic-settings-");
    try {
      const settings = buildAdminTrafficSettings({
        handle,
        env: {
          HAITU_TRAFFIC_ANALYTICS_ENABLED: "1",
          HAITU_TRAFFIC_EVENT_SALT: "do-not-return",
          HAITU_GA4_PROPERTY_ID: "properties/123456",
          HAITU_GOOGLE_APPLICATION_CREDENTIALS: "/secret/google.json",
          HAITU_SEARCH_CONSOLE_SITE_URL: "https://haitu.online/",
          HAITU_BING_WEBMASTER_API_KEY: "bing-secret",
          HAITU_INDEXNOW_KEY: "indexnow-secret",
          HAITU_CLOUDFLARE_ACCOUNT_ID: "cf-account",
          HAITU_CLOUDFLARE_ZONE_ID: "cf-zone",
          HAITU_CLOUDFLARE_API_TOKEN: "cf-secret"
        }
      });

      expect(settings.integrations).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "first-party", configured: true, status: "configured" }),
        expect.objectContaining({ id: "ga4", configured: true, status: "configured" }),
        expect.objectContaining({ id: "search-console", configured: true, status: "configured" }),
        expect.objectContaining({ id: "bing-webmaster", configured: true, status: "configured" }),
        expect.objectContaining({ id: "indexnow", configured: true, status: "configured" }),
        expect.objectContaining({ id: "cloudflare", configured: true, status: "configured" })
      ]));
      expect(JSON.stringify(settings)).not.toContain("do-not-return");
      expect(JSON.stringify(settings)).not.toContain("bing-secret");
      expect(JSON.stringify(settings)).not.toContain("cf-secret");
    } finally {
      close();
    }
  });

  it("treats a temporary Google access token as configured without exposing it", async () => {
    const { handle, close } = await openTestDatabase("haitu-admin-traffic-token-settings-");
    try {
      const settings = buildAdminTrafficSettings({
        handle,
        env: {
          HAITU_SEARCH_CONSOLE_SITE_URL: "https://haitu.online/",
          HAITU_GOOGLE_ACCESS_TOKEN: "temporary-google-token"
        }
      });

      expect(settings.integrations).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "search-console", configured: true, status: "configured" }),
        expect.objectContaining({ id: "ga4", configured: false, status: "not_configured" })
      ]));
      expect(JSON.stringify(settings)).not.toContain("temporary-google-token");
    } finally {
      close();
    }
  });

  it("reads cached Search Console metrics and merges page search performance", async () => {
    const { handle, close } = await openTestDatabase("haitu-admin-traffic-search-");
    try {
      recordTrafficDailyMetric({
        handle,
        metricDate: "2026-07-08",
        provider: "search_console",
        dataset: "query_page",
        dimension: {
          query: "ai product video generator",
          page: "https://haitu.online/features/ai-product-video-generator",
          country: "usa",
          device: "desktop"
        },
        metric: {
          clicks: 7,
          impressions: 100,
          ctr: 0.07,
          position: 8.5
        },
        syncedAt: new Date("2026-07-08T12:00:00.000Z")
      });
      recordTrafficEvent({
        handle,
        eventName: "page_view",
        path: "/features/ai-product-video-generator",
        occurredAt: new Date("2026-07-08T12:10:00.000Z"),
        sessionId: "session-search"
      });

      const search = buildAdminTrafficSearch({
        handle,
        from: "2026-07-08T00:00:00.000Z",
        to: "2026-07-09T00:00:00.000Z"
      });
      const pages = buildAdminTrafficPages({
        handle,
        from: "2026-07-08T00:00:00.000Z",
        to: "2026-07-09T00:00:00.000Z"
      });

      expect(search.rows).toEqual([
        expect.objectContaining({
          query: "ai product video generator",
          page: "https://haitu.online/features/ai-product-video-generator",
          clicks: 7,
          impressions: 100,
          ctr: 0.07,
          position: 8.5
        })
      ]);
      expect(pages.pages).toEqual([
        expect.objectContaining({
          path: "/features/ai-product-video-generator",
          pageViews: 1,
          searchClicks: 7,
          searchImpressions: 100,
          searchCtr: 0.07,
          averagePosition: 8.5
        })
      ]);
    } finally {
      close();
    }
  });

  it("reads cached Cloudflare edge rows and builds a simple SEO/GEO summary", async () => {
    const { handle, close } = await openTestDatabase("haitu-admin-traffic-cloudflare-");
    try {
      recordTrafficDailyMetric({
        handle,
        metricDate: "2026-07-08",
        provider: "cloudflare",
        dataset: "edge_requests",
        dimension: {
          country: "US",
          status: "200",
          crawler: "Googlebot"
        },
        metric: {
          requests: 120
        },
        syncedAt: new Date("2026-07-08T12:00:00.000Z")
      });
      recordTrafficEvent({
        handle,
        eventName: "page_view",
        path: "/features/ai-product-video-generator",
        occurredAt: new Date("2026-07-08T09:00:00.000Z"),
        sessionId: "traffic-page"
      });
      recordTrafficEvent({
        handle,
        eventName: "cta_click",
        path: "/features/ai-product-video-generator",
        occurredAt: new Date("2026-07-08T09:01:00.000Z"),
        sessionId: "traffic-page"
      });
      recordTrafficDailyMetric({
        handle,
        metricDate: "2026-07-08",
        provider: "search_console",
        dataset: "query_page",
        dimension: {
          query: "ai product video generator",
          page: "https://haitu.online/features/ai-product-video-generator",
          country: "usa",
          device: "desktop"
        },
        metric: {
          clicks: 2,
          impressions: 200,
          ctr: 0.01,
          position: 12
        },
        syncedAt: new Date("2026-07-08T12:00:00.000Z")
      });

      const cloudflare = buildAdminTrafficCloudflare({
        handle,
        from: "2026-07-08T00:00:00.000Z",
        to: "2026-07-09T00:00:00.000Z"
      });
      const summary = buildAdminTrafficGeoSummary({
        handle,
        from: "2026-07-08T00:00:00.000Z",
        to: "2026-07-09T00:00:00.000Z"
      });

      expect(cloudflare.rows).toEqual([
        expect.objectContaining({
          date: "2026-07-08",
          country: "US",
          status: "200",
          crawler: "Googlebot",
          requests: 120
        })
      ]);
      expect(summary).toEqual(expect.objectContaining({
        pagesReviewed: 1,
        searchImpressions: 200,
        searchClicks: 2,
        edgeRequests: 120
      }));
      expect(summary.opportunities).toEqual([
        expect.objectContaining({
          path: "/features/ai-product-video-generator",
          reason: "High search impressions with low CTR"
        })
      ]);
    } finally {
      close();
    }
  });

  it("syncs configured third-party traffic providers into the daily metric cache", async () => {
    const { handle, close } = await openTestDatabase("haitu-admin-traffic-sync-");
    const fetchCalls: string[] = [];
    try {
      const sync = await syncExternalTrafficMetrics({
        handle,
        env: {
          HAITU_GA4_PROPERTY_ID: "properties/123456",
          HAITU_GOOGLE_APPLICATION_CREDENTIALS: "/secret/google.json",
          HAITU_SEARCH_CONSOLE_SITE_URL: "https://haitu.online/",
          HAITU_BING_WEBMASTER_API_KEY: "bing-secret",
          HAITU_CLOUDFLARE_ACCOUNT_ID: "cf-account",
          HAITU_CLOUDFLARE_ZONE_ID: "cf-zone",
          HAITU_CLOUDFLARE_API_TOKEN: "cf-secret",
          HAITU_GOOGLE_ACCESS_TOKEN: "google-token"
        },
        now: new Date("2026-07-08T12:00:00.000Z"),
        fetchImpl: async (url) => {
          fetchCalls.push(String(url));
          const requestUrl = String(url);
          const normalizedRequestUrl = requestUrl.toLowerCase();
          if (normalizedRequestUrl.includes("searchanalytics/query")) {
            return new Response(JSON.stringify({
              rows: [
                {
                  keys: ["haitu", "https://haitu.online/", "usa", "desktop"],
                  clicks: 4,
                  impressions: 80,
                  ctr: 0.05,
                  position: 6.2
                }
              ]
            }), { status: 200 });
          }
          if (normalizedRequestUrl.includes("properties/123456:runreport")) {
            return new Response(JSON.stringify({
              rows: [
                {
                  dimensionValues: [
                    { value: "20260708" },
                    { value: "/" },
                    { value: "google / organic" },
                    { value: "US" },
                    { value: "desktop" },
                    { value: "page_view" }
                  ],
                  metricValues: [
                    { value: "9" },
                    { value: "7" },
                    { value: "11" },
                    { value: "13" },
                    { value: "2" }
                  ]
                }
              ]
            }), { status: 200 });
          }
          if (normalizedRequestUrl.includes("bing.com")) {
            return new Response(JSON.stringify({
              sitemaps: [
                {
                  url: "https://haitu.online/sitemap.xml",
                  submittedAt: "2026-07-08T00:00:00.000Z",
                  status: "Success",
                  indexedUrls: 42
                }
              ]
            }), { status: 200 });
          }
          if (normalizedRequestUrl.includes("cloudflare")) {
            return new Response(JSON.stringify({
              data: {
                viewer: {
                  zones: [
                    {
                      totals: [
                        {
                          date: "2026-07-08",
                          requests: 120,
                          country: "US",
                          status: "200",
                          crawler: "Googlebot"
                        }
                      ]
                    }
                  ]
                }
              }
            }), { status: 200 });
          }
          return new Response("unexpected", { status: 500 });
        }
      });

      expect(sync.status).toBe("synced");
      expect(sync.providers).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "search-console", configured: true, status: "synced", rowsSynced: 1 }),
        expect.objectContaining({ id: "ga4", configured: true, status: "synced", rowsSynced: 1 }),
        expect.objectContaining({ id: "bing-webmaster", configured: true, status: "synced", rowsSynced: 1 }),
        expect.objectContaining({ id: "cloudflare", configured: true, status: "synced", rowsSynced: 1 })
      ]));
      expect(fetchCalls.map((url) => url.toLowerCase())).toEqual(expect.arrayContaining([
        expect.stringContaining("searchanalytics/query"),
        expect.stringContaining("properties/123456:runreport"),
        expect.stringContaining("bing.com/webmaster"),
        expect.stringContaining("cloudflare")
      ]));

      const search = buildAdminTrafficSearch({
        handle,
        from: "2026-07-08T00:00:00.000Z",
        to: "2026-07-09T00:00:00.000Z"
      });
      expect(search.rows).toEqual([
        expect.objectContaining({
          query: "haitu",
          page: "https://haitu.online/",
          clicks: 4,
          impressions: 80
        })
      ]);
      const metricRows = handle.sqlite.prepare(`
        SELECT provider, dataset, dimension_json, metric_json
        FROM traffic_daily_metrics
        ORDER BY provider, dataset
      `).all() as Array<{
        provider: string;
        dataset: string;
        dimension_json: string;
        metric_json: string;
      }>;
      expect(metricRows).toEqual(expect.arrayContaining([
        expect.objectContaining({ provider: "ga4", dataset: "event_page" }),
        expect.objectContaining({ provider: "bing_webmaster", dataset: "sitemap" }),
        expect.objectContaining({ provider: "cloudflare", dataset: "edge_requests" }),
        expect.objectContaining({ provider: "search_console", dataset: "query_page" })
      ]));
      expect(JSON.stringify(metricRows)).not.toContain("google-token");
      expect(JSON.stringify(metricRows)).not.toContain("bing-secret");
      expect(JSON.stringify(metricRows)).not.toContain("cf-secret");
    } finally {
      close();
    }
  });

  it("reports provider errors during third-party traffic sync without blocking other providers", async () => {
    const { handle, close } = await openTestDatabase("haitu-admin-traffic-sync-errors-");
    try {
      const sync = await syncExternalTrafficMetrics({
        handle,
        env: {
          HAITU_SEARCH_CONSOLE_SITE_URL: "https://haitu.online/",
          HAITU_GOOGLE_APPLICATION_CREDENTIALS: "/secret/google.json",
          HAITU_GOOGLE_ACCESS_TOKEN: "google-token",
          HAITU_BING_WEBMASTER_API_KEY: "bing-secret"
        },
        now: new Date("2026-07-08T12:00:00.000Z"),
        fetchImpl: async (url) => {
          if (String(url).toLowerCase().includes("searchanalytics/query")) {
            return new Response("quota exceeded", { status: 429 });
          }
          return new Response(JSON.stringify({
            sitemaps: [
              {
                url: "https://haitu.online/sitemap.xml",
                status: "Success"
              }
            ]
          }), { status: 200 });
        }
      });

      expect(sync.status).toBe("partial_error");
      expect(sync.providers).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "search-console", configured: true, status: "error", rowsSynced: 0 }),
        expect.objectContaining({ id: "bing-webmaster", configured: true, status: "synced", rowsSynced: 1 }),
        expect.objectContaining({ id: "ga4", configured: false, status: "not_configured" })
      ]));
      expect(JSON.stringify(sync)).not.toContain("google-token");
      expect(JSON.stringify(sync)).not.toContain("bing-secret");
    } finally {
      close();
    }
  });

  it("uses Google service account credentials to obtain an access token for sync", async () => {
    const { handle, close, root } = await openTestDatabase("haitu-admin-traffic-google-credentials-");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const credentialsPath = join(root, "google-service-account.json");
    await writeFile(credentialsPath, JSON.stringify({
      client_email: "haitu-sync@example.iam.gserviceaccount.com",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" })
    }), "utf8");
    const fetchCalls: Array<{ url: string; authorization?: string; body?: string }> = [];
    try {
      const sync = await syncExternalTrafficMetrics({
        handle,
        env: {
          HAITU_SEARCH_CONSOLE_SITE_URL: "https://haitu.online/",
          HAITU_GOOGLE_APPLICATION_CREDENTIALS: credentialsPath
        },
        now: new Date("2026-07-08T12:00:00.000Z"),
        fetchImpl: async (url, init) => {
          fetchCalls.push({
            url: String(url),
            authorization: init?.headers instanceof Headers
              ? init.headers.get("authorization") ?? undefined
              : (init?.headers as Record<string, string> | undefined)?.authorization,
            body: String(init?.body ?? "")
          });
          if (String(url).includes("oauth2.googleapis.com/token")) {
            return new Response(JSON.stringify({ access_token: "derived-google-token" }), { status: 200 });
          }
          return new Response(JSON.stringify({
            rows: [
              {
                keys: ["haitu from credentials", "https://haitu.online/", "usa", "desktop"],
                clicks: 2,
                impressions: 20,
                ctr: 0.1,
                position: 3.5
              }
            ]
          }), { status: 200 });
        }
      });

      expect(sync.providers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "search-console",
          configured: true,
          status: "synced",
          rowsSynced: 1
        })
      ]));
      expect(fetchCalls[0]).toEqual(expect.objectContaining({
        url: "https://oauth2.googleapis.com/token",
        body: expect.stringContaining("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer")
      }));
      expect(fetchCalls[1]).toEqual(expect.objectContaining({
        authorization: "Bearer derived-google-token"
      }));
      expect(buildAdminTrafficSearch({
        handle,
        from: "2026-07-08T00:00:00.000Z",
        to: "2026-07-09T00:00:00.000Z"
      }).rows).toEqual([
        expect.objectContaining({
          query: "haitu from credentials",
          clicks: 2,
          impressions: 20
        })
      ]);
    } finally {
      close();
    }
  });
});

async function openTestDatabase(prefix: string): Promise<{ handle: DatabaseHandle; root: string; close: () => void }> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(root);
  const handle = openDatabase({ dataDir: join(root, "data"), env: process.env });
  runMigrations(handle);
  ensureDefaultWorkspace(handle);
  return {
    handle,
    root,
    close: () => closeDatabase(handle)
  };
}
