import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createConsoleServer } from "../../src/server/consoleServer.js";
import { closeDatabase, openDatabase } from "../../src/server/db/client.js";
import { recordTrafficDailyMetric } from "../../src/server/adminTraffic.js";

const tempDirs: string[] = [];

beforeEach(() => {
  vi.stubEnv("HAITU_SECRET_KEY", "0123456789abcdef0123456789abcdef");
  vi.stubEnv("HAITU_DATA_DIR", "");
  vi.stubEnv("HAITU_DB_PATH", "");
  vi.stubEnv("HAITU_ADMIN_EMAIL", "admin@example.com");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("admin traffic routes", () => {
  it("records public marketing page views and exposes traffic summaries only to admin users", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-admin-traffic-routes-"));
    tempDirs.push(root);
    const consoleDistDir = join(root, "dist", "console");
    await mkdir(join(consoleDistDir, "assets"), { recursive: true });
    await writeFile(
      join(consoleDistDir, "index.html"),
      '<!doctype html><html><head><title>Admin</title></head><body><div id="root"></div></body></html>',
      "utf8"
    );
    const server = createConsoleServer({
      rootDir: root,
      consoleDistDir,
      autoStartSavedJobs: false,
      now: () => new Date("2026-07-08T10:00:00.000Z")
    });

    await server.fetch("/", {
      headers: {
        referer: "https://www.google.com/search?q=haitu",
        "user-agent": "vitest browser"
      }
    });
    const anonymous = await server.fetch("/api/admin/traffic/overview");

    await server.fetch("/api/auth/enter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "admin-pass" })
    });
    const otp = await latestEmailOtp(root, "admin@example.com", "email-verification");
    const verifyResponse = await server.fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", otp })
    });
    const cookie = verifyResponse.headers.get("set-cookie") ?? "";
    const overviewResponse = await server.fetch("/api/admin/traffic/overview", {
      headers: { cookie }
    });
    const sourcesResponse = await server.fetch("/api/admin/traffic/sources", {
      headers: { cookie }
    });
    const pagesResponse = await server.fetch("/api/admin/traffic/pages", {
      headers: { cookie }
    });
    const settingsResponse = await server.fetch("/api/admin/traffic/settings", {
      headers: { cookie }
    });
    const searchResponse = await server.fetch("/api/admin/traffic/search", {
      headers: { cookie }
    });
    const syncResponse = await server.fetch("/api/admin/traffic/sync", {
      method: "POST",
      headers: { cookie }
    });

    expect(anonymous.status).toBe(401);
    expect(overviewResponse.status).toBe(200);
    expect(sourcesResponse.status).toBe(200);
    expect(pagesResponse.status).toBe(200);
    expect(settingsResponse.status).toBe(200);
    expect(searchResponse.status).toBe(200);
    expect(syncResponse.status).toBe(200);

    const overview = await overviewResponse.json();
    const sources = await sourcesResponse.json();
    const pages = await pagesResponse.json();
    const settings = await settingsResponse.json();
    const search = await searchResponse.json();
    const sync = await syncResponse.json();

    expect(overview.metrics.pageViews).toBe(1);
    expect(overview.metrics.visitors).toBe(2);
    expect(overview.metrics.signups).toBe(1);
    expect(sources.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: "Organic Search",
        pageViews: 1
      }),
      expect.objectContaining({
        source: "Direct",
        signups: 1
      })
    ]));
    expect(pages.pages).toEqual([
      expect.objectContaining({
        path: "/",
        pageType: "home",
        pageViews: 1
      })
    ]);
    expect(JSON.stringify(settings)).not.toContain("0123456789abcdef");
    expect(search.rows).toEqual([]);
    expect(sync.status).toBe("not_configured");
  });

  it("returns 403 for authenticated non-admin users on admin traffic APIs", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-admin-traffic-non-admin-"));
    tempDirs.push(root);
    const server = createConsoleServer({
      rootDir: root,
      autoStartSavedJobs: false,
      now: () => new Date("2026-07-08T10:00:00.000Z")
    });
    await server.fetch("/api/auth/enter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "seller@example.com", password: "seller-pass" })
    });
    const otp = await latestEmailOtp(root, "seller@example.com", "email-verification");
    const verifyResponse = await server.fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "seller@example.com", otp })
    });
    const cookie = verifyResponse.headers.get("set-cookie") ?? "";

    const overviewResponse = await server.fetch("/api/admin/traffic/overview", {
      headers: { cookie }
    });
    const syncResponse = await server.fetch("/api/admin/traffic/sync", {
      method: "POST",
      headers: { cookie }
    });

    expect(overviewResponse.status).toBe(403);
    expect(syncResponse.status).toBe(403);
  });

  it("exposes cached Search Console rows and records IndexNow submit attempts for admins", async () => {
    vi.stubEnv("HAITU_INDEXNOW_KEY", "test-indexnow-key");
    const root = await mkdtemp(join(tmpdir(), "haitu-admin-traffic-indexnow-"));
    tempDirs.push(root);
    const fetchCalls: Array<{ url: string; body: string }> = [];
    const server = createConsoleServer({
      rootDir: root,
      autoStartSavedJobs: false,
      fetchImpl: async (url, init) => {
        fetchCalls.push({
          url: String(url),
          body: String(init?.body ?? "")
        });
        return new Response("OK", { status: 200 });
      },
      now: () => new Date("2026-07-08T12:00:00.000Z")
    });
    const handle = openDatabase({ dataDir: join(root, "data"), env: process.env });
    try {
      recordTrafficDailyMetric({
        handle,
        metricDate: "2026-07-08",
        provider: "search_console",
        dataset: "query_page",
        dimension: {
          query: "haitu",
          page: "https://haitu.online/",
          country: "usa",
          device: "mobile"
        },
        metric: {
          clicks: 3,
          impressions: 50,
          ctr: 0.06,
          position: 5
        },
        syncedAt: new Date("2026-07-08T12:00:00.000Z")
      });
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
          requests: 88
        },
        syncedAt: new Date("2026-07-08T12:00:00.000Z")
      });
    } finally {
      closeDatabase(handle);
    }
    const cookie = await registerAdmin(root, server);

    const searchResponse = await server.fetch("/api/admin/traffic/search", {
      headers: { cookie }
    });
    const submitResponse = await server.fetch("/api/admin/traffic/indexnow/submit", {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        urls: ["https://haitu.online/"]
      })
    });
    const indexingResponse = await server.fetch("/api/admin/traffic/indexing", {
      headers: { cookie }
    });
    const cloudflareResponse = await server.fetch("/api/admin/traffic/cloudflare", {
      headers: { cookie }
    });
    const geoSummaryResponse = await server.fetch("/api/admin/traffic/geo-summary", {
      headers: { cookie }
    });

    expect(searchResponse.status).toBe(200);
    expect(submitResponse.status).toBe(200);
    expect(indexingResponse.status).toBe(200);
    expect(cloudflareResponse.status).toBe(200);
    expect(geoSummaryResponse.status).toBe(200);
    expect((await searchResponse.json()).rows).toEqual([
      expect.objectContaining({
        query: "haitu",
        clicks: 3,
        impressions: 50
      })
    ]);
    expect(await submitResponse.json()).toEqual(expect.objectContaining({
      ok: true,
      provider: "indexnow",
      statusCode: 200
    }));
    expect(fetchCalls[0].url).toBe("https://api.indexnow.org/indexnow");
    expect(fetchCalls[0].body).toContain("test-indexnow-key");
    expect((await indexingResponse.json()).submissions).toEqual([
      expect.objectContaining({
        provider: "indexnow",
        statusCode: 200,
        url: "https://haitu.online/"
      })
    ]);
    expect((await cloudflareResponse.json()).rows).toEqual([
      expect.objectContaining({
        country: "US",
        requests: 88
      })
    ]);
    expect(await geoSummaryResponse.json()).toEqual(expect.objectContaining({
      searchClicks: 3,
      searchImpressions: 50,
      edgeRequests: 88
    }));
  });

  it("records failed IndexNow attempts and manual sitemap submissions for admins", async () => {
    vi.stubEnv("HAITU_INDEXNOW_KEY", "test-indexnow-key");
    const root = await mkdtemp(join(tmpdir(), "haitu-admin-traffic-indexnow-failure-"));
    tempDirs.push(root);
    const server = createConsoleServer({
      rootDir: root,
      autoStartSavedJobs: false,
      fetchImpl: async () => new Response("rate limited", { status: 429 }),
      now: () => new Date("2026-07-08T13:00:00.000Z")
    });
    const cookie = await registerAdmin(root, server);

    const submitResponse = await server.fetch("/api/admin/traffic/indexnow/submit", {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        urls: ["https://haitu.online/features/ai-product-video-generator"]
      })
    });
    const sitemapResponse = await server.fetch("/api/admin/traffic/sitemap/submit", {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        url: "https://haitu.online/sitemap.xml"
      })
    });
    const indexingResponse = await server.fetch("/api/admin/traffic/indexing", {
      headers: { cookie }
    });

    expect(submitResponse.status).toBe(400);
    expect(await submitResponse.json()).toEqual(expect.objectContaining({
      ok: false,
      provider: "indexnow",
      status: "failed",
      statusCode: 429,
      error: "rate limited"
    }));
    expect(sitemapResponse.status).toBe(200);
    expect(await sitemapResponse.json()).toEqual(expect.objectContaining({
      ok: true,
      provider: "sitemap",
      status: "recorded",
      url: "https://haitu.online/sitemap.xml"
    }));
    expect((await indexingResponse.json()).submissions).toEqual([
      expect.objectContaining({
        provider: "sitemap",
        url: "https://haitu.online/sitemap.xml"
      }),
      expect.objectContaining({
        provider: "indexnow",
        statusCode: 429,
        errorMessage: "rate limited",
        url: "https://haitu.online/features/ai-product-video-generator"
      })
    ]);
  });

  it("syncs configured external traffic providers through the admin sync route", async () => {
    vi.stubEnv("HAITU_SEARCH_CONSOLE_SITE_URL", "https://haitu.online/");
    vi.stubEnv("HAITU_GOOGLE_APPLICATION_CREDENTIALS", "/secret/google.json");
    vi.stubEnv("HAITU_GOOGLE_ACCESS_TOKEN", "google-token");
    const root = await mkdtemp(join(tmpdir(), "haitu-admin-traffic-sync-route-"));
    tempDirs.push(root);
    const fetchCalls: string[] = [];
    const server = createConsoleServer({
      rootDir: root,
      autoStartSavedJobs: false,
      fetchImpl: async (url) => {
        fetchCalls.push(String(url));
        return new Response(JSON.stringify({
          rows: [
            {
              keys: ["haitu", "https://haitu.online/", "usa", "desktop"],
              clicks: 5,
              impressions: 90,
              ctr: 0.055,
              position: 4.8
            }
          ]
        }), { status: 200 });
      },
      now: () => new Date("2026-07-08T12:00:00.000Z")
    });
    const cookie = await registerAdmin(root, server);

    const syncResponse = await server.fetch("/api/admin/traffic/sync", {
      method: "POST",
      headers: { cookie }
    });
    const searchResponse = await server.fetch("/api/admin/traffic/search", {
      headers: { cookie }
    });

    expect(syncResponse.status).toBe(200);
    expect(await syncResponse.json()).toEqual(expect.objectContaining({
      ok: true,
      status: "synced",
      providers: expect.arrayContaining([
        expect.objectContaining({
          id: "search-console",
          status: "synced",
          rowsSynced: 1
        })
      ])
    }));
    expect(fetchCalls.map((url) => url.toLowerCase())).toEqual([expect.stringContaining("searchanalytics/query")]);
    expect(await searchResponse.json()).toEqual({
      rows: [
        expect.objectContaining({
          query: "haitu",
          page: "https://haitu.online/",
          clicks: 5,
          impressions: 90
        })
      ]
    });
  });

  it("accepts first-party CTA and conversion events without exposing the full traffic summary publicly", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-admin-traffic-track-"));
    tempDirs.push(root);
    const server = createConsoleServer({
      rootDir: root,
      autoStartSavedJobs: false,
      now: () => new Date("2026-07-08T11:00:00.000Z")
    });

    const trackResponse = await server.fetch("/api/traffic/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        referer: "https://haitu.online/"
      },
      body: JSON.stringify({
        eventName: "cta_click",
        path: "/",
        sessionId: "browser-session",
        metadata: { cta: "start" }
      })
    });
    const publicSummary = await server.fetch("/api/admin/traffic/overview");

    expect(trackResponse.status).toBe(200);
    expect(await trackResponse.json()).toEqual({ ok: true });
    expect(publicSummary.status).toBe(401);
  });
});

async function registerAdmin(root: string, server: ReturnType<typeof createConsoleServer>): Promise<string> {
  await server.fetch("/api/auth/enter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password: "admin-pass" })
  });
  const otp = await latestEmailOtp(root, "admin@example.com", "email-verification");
  const verifyResponse = await server.fetch("/api/auth/verify-email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", otp })
  });
  return verifyResponse.headers.get("set-cookie") ?? "";
}

async function latestEmailOtp(root: string, email: string, type: "email-verification" | "forget-password"): Promise<string> {
  const outboxPath = join(root, "data", "system", "auth-email-outbox.jsonl");
  const raw = await readFile(outboxPath, "utf8");
  const rows = raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { email: string; type: string; otp: string });
  const found = rows
    .reverse()
    .find((row) => row.email === email && row.type === type);
  if (!found) {
    throw new Error(`No OTP found for ${email} (${type})`);
  }
  return found.otp;
}
