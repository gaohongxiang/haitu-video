import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createConsoleServer as createRawConsoleServer, type ConsoleServerHandle, type ConsoleServerOptions } from "../../src/server/consoleServer.js";
import { SqliteConsoleSettingsStore } from "../../src/server/consoleSettings.js";
import { closeDatabase, openDatabase } from "../../src/server/db/client.js";
import { encryptSecret } from "../../src/server/db/crypto.js";
import { importFileWorkspace } from "../../src/server/db/importFileWorkspace.js";
import { runMigrations } from "../../src/server/db/migrate.js";
import { WalletStore } from "../../src/server/walletStore.js";

let tempDirs: string[] = [];

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThan(-1);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

beforeEach(() => {
  vi.stubEnv("HAITU_RECHARGE_ORDER_EXPIRES_IN_SECONDS", "3600");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("console API", () => {
  it("stores products and reference images under HAITU_DATA_DIR workspaces/default without reading legacy runtime folders", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-data-dir-"));
    const dataDir = join(root, "runtime-data");
    tempDirs.push(root);
    await mkdir(join(root, "fixtures", "products"), { recursive: true });
    await writeFile(join(root, "fixtures", "products", "legacy.json"), JSON.stringify({
      sku: "LEGACY-001",
      title_ja: "旧ディレクトリ商品",
      category: "旧",
      materials: ["紙"],
      dimensions: "1cm",
      verified_selling_points: ["旧データ"],
      usage_scenes: ["旧"],
      forbidden_claims: [],
      reference_images: []
    }), "utf8");
    const server = createConsoleServer({ rootDir: root, dataDir, autoStartSavedJobs: false });

    await expect(server.fetchJson("/api/products")).resolves.toEqual({ products: [] });
    const saved = await server.fetchJson("/api/products", {
      method: "POST",
      body: JSON.stringify({
        sku: "TK-001",
        title_ja: "冷感アームカバー",
        category: "アームカバー",
        materials: ["ナイロン"],
        dimensions: "約40cm",
        verified_selling_points: ["接触冷感"],
        usage_scenes: ["通勤"],
        forbidden_claims: ["UV数値未確認"],
        reference_images: []
      })
    });
    const uploaded = await server.fetchJson("/api/products/TK-001/reference-images", {
      method: "POST",
      body: JSON.stringify({
        files: [{
          fileName: "cover.jpg",
          mimeType: "image/jpeg",
          base64: Buffer.from("image-bytes").toString("base64")
        }]
      })
    });
    const listed = await server.fetchJson("/api/products");
    const productFile = join(dataDir, "workspaces", "default", "products", "TK-001", "product.json");
    const refFile = join(dataDir, "workspaces", "default", "products", "TK-001", "refs", "reference-01.jpg");
    const stored = JSON.parse(await readFile(productFile, "utf8"));

    expect(saved.product.path).toBe(productFile);
    expect(uploaded.uploaded[0]).toEqual(expect.objectContaining({
      path: refFile,
      reference: "refs/reference-01.jpg"
    }));
    expect(uploaded.product.reference_images).toEqual(["refs/reference-01.jpg"]);
    expect(uploaded.product.reference_image_statuses[0]).toEqual(expect.objectContaining({
      previewUrl: `/media?path=${encodeURIComponent(refFile)}`,
      status: "previewable"
    }));
    expect(listed.products.map((product: { sku: string }) => product.sku)).toEqual(["TK-001"]);
    expect(stored).toEqual(expect.objectContaining({
      workspaceId: "default",
      sku: "TK-001",
      reference_images: ["refs/reference-01.jpg"]
    }));
    await expect(readFile(refFile, "utf8")).resolves.toBe("image-bytes");
  });

  it("persists optional source text with saved product facts", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-source-text-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const server = createConsoleServer({ rootDir: root, fixturesDir });

    const response = await server.fetchJson("/api/products", {
      method: "POST",
      body: JSON.stringify({
        sku: "SOURCE-001",
        title_ja: "接触冷感アームカバー",
        category: "アームカバー",
        materials: ["ポリエステル"],
        dimensions: "約52cm",
        verified_selling_points: ["接触冷感"],
        usage_scenes: ["通勤"],
        forbidden_claims: [],
        reference_images: [],
        source_text: "原始资料：接触冷感アームカバー"
      })
    });

    const productPath = testProductPath(fixturesDir, "SOURCE-001");
    const stored = JSON.parse(await readFile(productPath, "utf8"));
    expect(response.product).toEqual(expect.objectContaining({
      sku: "SOURCE-001",
      source_text: "原始资料：接触冷感アームカバー"
    }));
    expect(stored).toEqual(expect.objectContaining({
      source_text: "原始资料：接触冷感アームカバー"
    }));
  });

  it("downloads remote reference image URLs when saving product facts", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-remote-reference-save-"));
    tempDirs.push(root);
    const dataDir = join(root, "data");
    const imageUrl = "https://cdn.example.test/products/arm-cover.jpeg?token=abc";
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === imageUrl) {
        return new Response(Buffer.from("remote-image-bytes"), {
          headers: {
            "content-type": "image/jpeg"
          }
        });
      }
      return new Response(JSON.stringify({ unexpected: true }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    }) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, dataDir, fetchImpl, autoStartSavedJobs: false });

    const response = await server.fetchJson("/api/products", {
      method: "POST",
      body: JSON.stringify({
        sku: "REMOTE-REF-001",
        title_ja: "接触冷感アームカバー",
        category: "アームカバー",
        materials: ["ポリエステル"],
        dimensions: "約52cm",
        verified_selling_points: ["通気性のある生地"],
        usage_scenes: ["通勤"],
        forbidden_claims: [],
        reference_images: [imageUrl]
      })
    });

    const refFile = join(dataDir, "workspaces", "default", "products", "REMOTE-REF-001", "refs", "reference-01.jpg");
    const productFile = join(dataDir, "workspaces", "default", "products", "REMOTE-REF-001", "product.json");
    const stored = JSON.parse(await readFile(productFile, "utf8"));
    expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toBe(imageUrl);
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]).toEqual(expect.objectContaining({ redirect: "manual" }));
    expect(response.product.reference_images).toEqual(["refs/reference-01.jpg"]);
    expect(response.product.reference_image_statuses[0]).toEqual(expect.objectContaining({
      previewUrl: `/media?path=${encodeURIComponent(refFile)}`,
      status: "previewable"
    }));
    expect(stored.reference_images).toEqual(["refs/reference-01.jpg"]);
    await expect(readFile(refFile, "utf8")).resolves.toBe("remote-image-bytes");
  });

  it("persists storyboard history in the selected product directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-storyboards-"));
    const dataDir = join(root, "data");
    tempDirs.push(root);
    const server = createConsoleServer({ rootDir: root, dataDir, autoStartSavedJobs: false });
    await server.fetchJson("/api/products", {
      method: "POST",
      body: JSON.stringify({
        sku: "TK-001",
        title_ja: "冷感アームカバー",
        category: "アームカバー",
        materials: ["ナイロン"],
        dimensions: "約40cm",
        verified_selling_points: ["接触冷感"],
        usage_scenes: ["通勤"],
        forbidden_claims: ["UV数値未確認"],
        reference_images: []
      })
    });

    const created = await server.fetchJson("/api/products/TK-001/storyboards", {
      method: "POST",
      body: JSON.stringify({
        style: "scene",
        duration: 10,
        script: "0-2s: 商品全体を見せる。\n2-10s: 使用シーンを見せる。"
      })
    });
    const listed = await server.fetchJson("/api/products/TK-001/storyboards");
    const storyboardsFile = join(dataDir, "workspaces", "default", "products", "TK-001", "storyboards.json");
    const stored = JSON.parse(await readFile(storyboardsFile, "utf8"));
    const deleted = await server.fetchJson(`/api/products/TK-001/storyboards/${created.storyboard.id}`, {
      method: "DELETE"
    });
    const afterDelete = await server.fetchJson("/api/products/TK-001/storyboards");

    expect(created.storyboard).toEqual({
      id: expect.any(String),
      createdAt: expect.any(String),
      style: "scene",
      duration: 10,
      script: "0-2s: 商品全体を見せる。\n2-10s: 使用シーンを見せる。"
    });
    expect(listed).toEqual({
      storyboards: [created.storyboard]
    });
    expect(stored).toEqual({
      workspaceId: "default",
      productSku: "TK-001",
      storyboards: [created.storyboard]
    });
    expect(deleted).toEqual({
      deleted: true,
      id: created.storyboard.id
    });
    expect(afterDelete).toEqual({ storyboards: [] });
  });

  it("stores system settings, sessions, model configs, and audit logs under HAITU_DATA_DIR and rejects outside media", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-system-data-"));
    const dataDir = join(root, "data");
    tempDirs.push(root);
    const server = createConsoleServer({ rootDir: root, dataDir, autoStartSavedJobs: false });

    await server.fetchJson("/api/model-configs/openai-compatible-text", {
      method: "PUT",
      body: JSON.stringify({ apiKey: "text-secret-123456" })
    });
    await server.fetchJson("/api/settings", {
      method: "PUT",
      body: JSON.stringify({ defaultCta: "詳しく見る" })
    });
    const dataMediaPath = join(dataDir, "workspaces", "default", "products", "TK-001", "refs", "reference-01.jpg");
    await mkdir(join(dataMediaPath, ".."), { recursive: true });
    await writeFile(dataMediaPath, Buffer.from("image"));
    const mediaResponse = await server.fetch(`/media?path=${encodeURIComponent(dataMediaPath)}`);
    const outsideMedia = await server.fetch(`/media?path=${encodeURIComponent(join(root, "outside.jpg"))}`);

    const settingsRows = readConsoleSettingsRows(dataDir);
    expect(settingsRows).toEqual([expect.objectContaining({
      id: "global",
      default_cta: "詳しく見る"
    })]);
    await expect(access(join(dataDir, "system", "console-settings.json"))).rejects.toThrow();
    await expect(readFile(join(dataDir, "system", "audit-log.jsonl"), "utf8")).resolves.toContain("model_config.saved");
    const handle = openDatabase({ dataDir, env: process.env });
    try {
      const sessions = handle.sqlite.prepare("SELECT COUNT(*) AS count FROM auth_sessions").get() as { count: number };
      const keys = handle.sqlite
        .prepare("SELECT key_preview, encrypted_key FROM model_credentials")
        .all() as Array<{ key_preview: string; encrypted_key: string }>;
      expect(sessions.count).toBeGreaterThanOrEqual(1);
      expect(keys).toEqual(expect.arrayContaining([expect.objectContaining({
        key_preview: "text...3456"
      })]));
      expect(keys.find((row) => row.key_preview === "text...3456")?.encrypted_key).not.toContain("text-secret-123456");
    } finally {
      closeDatabase(handle);
    }
    expect(mediaResponse.status).toBe(200);
    expect(outsideMedia.status).toBe(403);
  });

  it("serves public asset tokens without auth and rejects unknown tokens", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-public-assets-"));
    const dataDir = join(root, "data");
    tempDirs.push(root);
    const assetPath = join(dataDir, "workspaces", "default", "products", "TK-001", "refs", "reference-01.png");
    await mkdir(dirname(assetPath), { recursive: true });
    await writeFile(assetPath, "image-bytes");
    const server = createConsoleServer({ rootDir: root, dataDir, autoStartSavedJobs: false });
    const tokenStore = server.raw.publicAssetTokenStoreForTests;
    expect(tokenStore).toBeDefined();
    const token = tokenStore?.create({
      filePath: assetPath,
      mimeType: "image/png",
      workspaceId: "default",
      ttlMs: 60_000
    });

    const response = await server.raw.fetch(token?.urlPath ?? "");
    const missing = await server.raw.fetch("/api/public-assets/missing");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, max-age=300");
    await expect(response.text()).resolves.toBe("image-bytes");
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({
      error: "Public asset not found or expired."
    });
  });

  it("protects console APIs with a SQLite user session from the unified entrypoint", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-auth-"));
    tempDirs.push(root);
    const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

    const healthResponse = await server.fetch("/api/health");
    const blockedProducts = await server.raw.fetch("/api/products");
    const sessionBeforeLogin = await server.fetchJson("/api/auth/session");
    const firstEntry = await server.fetch("/api/auth/enter", {
      method: "POST",
      body: JSON.stringify({
        email: "owner@example.com",
        password: "correct horse battery staple"
      })
    });
    const verificationCode = await latestEmailOtp(testDataDir(root), "owner@example.com", "email-verification");
    const verified = await server.fetch("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({
        email: "owner@example.com",
        otp: verificationCode
      })
    });
    const cookie = verified.headers.get("set-cookie") ?? "";
    const failedEntry = await server.fetch("/api/auth/enter", {
      method: "POST",
      body: JSON.stringify({
        email: "owner@example.com",
        password: "wrong password"
      })
    });
    const secondEntry = await server.fetch("/api/auth/enter", {
      method: "POST",
      body: JSON.stringify({
        email: "owner@example.com",
        password: "correct horse battery staple"
      })
    });
    const authedProducts = await server.raw.fetch("/api/products", {
      headers: { cookie }
    });
    const sessionAfterEntry = await server.fetchJson("/api/auth/session", {
      headers: { cookie }
    });
    const logoutResponse = await server.fetch("/api/auth/logout", {
      method: "POST",
      headers: { cookie }
    });
    const blockedAfterLogout = await server.raw.fetch("/api/products", {
      headers: { cookie }
    });

    expect(healthResponse.status).toBe(200);
    expect(blockedProducts.status).toBe(401);
    await expect(blockedProducts.json()).resolves.toEqual({
      error: "Authentication required"
    });
    expect(sessionBeforeLogin).toEqual({
      authEnabled: true,
      authenticated: false
    });
    expect(firstEntry.status).toBe(202);
    expect(verified.status).toBe(200);
    expect(failedEntry.status).toBe(401);
    expect(secondEntry.status).toBe(200);
    expect(cookie).toContain("better-auth.session_token=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(authedProducts.status).toBe(200);
    expect(sessionAfterEntry).toMatchObject({
      authEnabled: true,
      authenticated: true,
      user: {
        email: "owner@example.com"
      }
    });
    expect(logoutResponse.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(logoutResponse.headers.getSetCookie()).toHaveLength(3);
    expect(logoutResponse.headers.getSetCookie()).toEqual(expect.arrayContaining([
      expect.stringContaining("better-auth.session_token="),
      expect.stringContaining("better-auth.session_data="),
      expect.stringContaining("better-auth.dont_remember=")
    ]));
    expect(blockedAfterLogout.status).toBe(401);
  });

  it("requires HAITU_SECRET_KEY before starting the console server", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-secret-required-"));
    tempDirs.push(root);
    vi.unstubAllEnvs();
    vi.stubEnv("HAITU_SECRET_KEY", "");

    expect(() => createRawConsoleServer({ rootDir: root, autoStartSavedJobs: false })).toThrow("HAITU_SECRET_KEY must be at least 32 bytes long.");
  });

  it("records sensitive and cost-related console operations in an audit log without storing secrets", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-audit-"));
    tempDirs.push(root);
    const dataDir = join(root, "data");
    vi.stubEnv("HAITU_ADMIN_EMAIL", "console-test@example.com");
    const server = createConsoleServer({ rootDir: root, dataDir, autoStartSavedJobs: false });

    const auditEntry = await server.fetch("/api/auth/enter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "audit@example.com",
        password: "correct horse battery staple"
      })
    });
    const auditOtp = await latestEmailOtp(dataDir, "audit@example.com", "email-verification");
    await server.fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "audit@example.com",
        otp: auditOtp
      })
    });
    await server.fetch("/api/auth/enter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "audit@example.com",
        password: "wrong password"
      })
    });
    await server.fetch("/api/auth/enter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "audit@example.com",
        password: "correct horse battery staple"
      })
    });
    await server.fetchJson("/api/model-configs/volcengine-seedance", {
      method: "PUT",
      body: JSON.stringify({ apiKey: "sk-super-secret" })
    });
    await server.fetchJson("/api/model-configs/volcengine-seedance", {
      method: "DELETE"
    });
    const audit = await server.fetchJson("/api/audit-log");
    const events = audit.events.map((event: { action: string }) => event.action);
    const auditFile = await readFile(join(dataDir, "system", "audit-log.jsonl"), "utf8");

    expect(auditEntry.status).toBe(202);
    expect(events).toEqual(expect.arrayContaining([
      "auth.enter_failed",
      "auth.enter",
      "auth.email_verified",
      "model_config.saved",
      "model_config.deleted"
    ]));
    expect(audit.events[0]).toEqual(expect.objectContaining({
      id: expect.any(String),
      at: expect.any(String),
      actor: "system",
      action: expect.any(String)
    }));
    expect(audit.summary.totalEvents).toBeGreaterThanOrEqual(5);
    expect(auditFile).not.toContain("sk-super-secret");
    expect(auditFile).not.toContain("correct horse battery staple");
  });

  it("returns a safe health check for VPS process supervision", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-health-"));
    tempDirs.push(root);
    const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

    const response = await server.fetchJson("/api/health");

    expect(response).toEqual(expect.objectContaining({
      ok: true,
      service: "haitu-video-console",
      storage: "local",
      uptimeSeconds: expect.any(Number),
      checkedAt: expect.any(String)
    }));
    expect(JSON.stringify(response)).not.toContain("API_KEY");
    expect(JSON.stringify(response)).not.toContain("secret");
  });

  it("serves the React/Tailwind console shell and keeps paid-request safety in the client", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-shell-"));
    tempDirs.push(root);
    const consoleDistDir = join(root, "dist", "console");
    await mkdir(join(consoleDistDir, "assets"), { recursive: true });
    await writeFile(
      join(consoleDistDir, "index.html"),
      '<!doctype html><html><body><div id="root"></div><script type="module" src="/assets/index-test.js"></script></body></html>',
      "utf8"
    );
    await writeFile(join(consoleDistDir, "assets", "index-test.js"), "console.log('react shell');", "utf8");
    await writeFile(join(consoleDistDir, "favicon.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"></svg>', "utf8");
    const server = createConsoleServer({ rootDir: root, consoleDistDir });

    const htmlResponse = await server.fetch("/app");
    const jsResponse = await server.fetch("/assets/index-test.js");
    const faviconResponse = await server.raw.fetch("/favicon.svg");
    const html = await htmlResponse.text();
    const js = await jsResponse.text();
    const favicon = await faviconResponse.text();
    const appSource = await readFile(join(process.cwd(), "src", "client", "App.tsx"), "utf8");
    const consoleApiClientSource = await readFile(join(process.cwd(), "src", "client", "consoleApiClient.ts"), "utf8");
    const modelServiceSelectionSource = await readFile(join(process.cwd(), "src", "client", "modelServiceSelection.ts"), "utf8");
    const stylesSource = await readFile(join(process.cwd(), "src", "client", "styles.css"), "utf8");
    const staticConsoleHtml = await readFile(join(process.cwd(), "src", "server", "static", "console.html"), "utf8");
    const staticConsoleJs = await readFile(join(process.cwd(), "src", "server", "static", "console.js"), "utf8");
    const viteConfig = await readFile(join(process.cwd(), "vite.config.ts"), "utf8");

    expect(htmlResponse.status).toBe(200);
    expect(html).toContain('id="root"');
    expect(jsResponse.status).toBe(200);
    expect(js).toContain("react shell");
    expect(faviconResponse.status).toBe(200);
    expect(faviconResponse.headers.get("content-type")).toBe("image/svg+xml");
    expect(favicon).toContain("<svg");
    expect(appSource).toContain("from \"lucide-react\"");
    expect(appSource).toContain("echarts-for-react/esm/core.js");
    expect(appSource).toContain('from "echarts/core"');
    expect(appSource).toContain('from "echarts/charts"');
    expect(appSource).toContain('from "echarts/components"');
    expect(appSource).toContain('from "echarts/renderers"');
    expect(appSource).toContain("echartsCore.use");
    expect(appSource).not.toContain('import * as EChartsForReact from "echarts-for-react"');
    expect(appSource).toContain("from \"./components/ui/button.js\"");
    expect(appSource).toContain("from \"./components/ui/card.js\"");
    expect(appSource).toContain("from \"./components/ui/field.js\"");
    expect(appSource).toContain("/api/auth/session");
    expect(appSource).toContain("/api/auth/enter");
    expect(appSource).toContain("/api/auth/verify-email");
    expect(appSource).toContain("/api/auth/request-password-reset");
    expect(appSource).toContain("/api/auth/reset-password");
    expect(appSource).not.toContain("/api/auth/login");
    expect(appSource).not.toContain("/api/auth/register");
    expect(appSource).toContain("/api/auth/logout");
    expect(appSource).toContain('tAuth("title")');
    expect(appSource).toContain('tAuth("entry.subtitle")');
    expect(appSource).toContain('tAuth("email")');
    expect(appSource).toContain('tAuth("password")');
    expect(appSource).toContain('tAuth("entry.submit")');
    expect(appSource).not.toContain("未注册邮箱会自动创建账号");
    expect(appSource).not.toContain("登录已有账号，或用新邮箱创建账号");
    expect(appSource).toContain('tAuth("entry.forgotPassword")');
    expect(appSource).toContain('tAuth("verify.submit")');
    expect(appSource).toContain('tAuth("otp.label")');
    expect(appSource).toContain("authOtpSendLabel");
    expect(appSource).not.toContain("重新发送验证码");
    expect(appSource).toContain('i18n.t("app:auth.otp.cooldown"');
    expect(appSource).toContain("authOtpCooldownSeconds");
    expect(appSource).toContain("startAuthOtpCooldown");
    expect(appSource).toContain("forgotPasswordOtpSent");
    expect(appSource).toContain("authOtpSendLabel");
    expect(appSource).toContain("onResendVerificationCode");
    expect(appSource).toContain("function AuthOtpField");
    expect(appSource.split("<AuthOtpField")).toHaveLength(3);
    expect(appSource).toContain('tAuth("reset.submit")');
    expect(appSource).toContain('tAuth("reset.newPasswordPlaceholder")');
    expect(appSource).not.toContain("至少 12 位");
    const resetPasswordFormSource = appSource.slice(
      appSource.indexOf("onSubmit={onResetPassword}"),
      appSource.indexOf('tAuth("backToEntry")', appSource.indexOf("onSubmit={onResetPassword}"))
    );
    expect(resetPasswordFormSource.indexOf('label={tAuth("reset.newPassword")}')).toBeLessThan(resetPasswordFormSource.indexOf("<AuthOtpField"));
    expect(appSource).not.toContain("验证码已发送到邮箱，请输入后继续。");
    expect(appSource).not.toContain("验证码已重新发送，请查看邮箱。");
    expect(appSource).not.toContain("验证码已发送到邮箱，请输入验证码和新密码。");
    expect(appSource).toContain('tApp("auth.reset.success")');
    expect(appSource).not.toContain("onSubmit={onRequestPasswordReset}");
    expect(appSource).toContain("setActiveSection(defaultConsoleSection)");
    expect(appSource).not.toContain("已退出登录");
    expect(appSource).not.toContain("管理员密码");
    expect(appSource).not.toContain("进入控制台");
    expect(appSource).toContain('tAccount("logout")');
    expect(appSource).toContain("function AccountMenu");
    expect(appSource).toContain("<AccountMenu");
    expect(appSource).toContain("authSession.user?.email");
    expect(appSource).toContain('tAccount("menu")');
    expect(appSource).toContain('tAccount("label")');
    expect(appSource).not.toContain('onClick={() => void logout()} disabled={isBusy}');
    expect(appSource).toContain("setAuthSession");
    expect(appSource).toContain("Authentication required");
    expect(appSource).toContain("h-dvh");
    expect(appSource).toContain("overflow-y-auto");
    expect(appSource).toContain("activeSection");
    expect(appSource).toContain("setActiveSection");
    expect(appSource).toContain("renderActiveSection");
    expect(appSource).toContain("consoleSectionFromUrl");
    expect(appSource).toContain("consoleSectionUrl");
    expect(appSource).toContain("dashboardNavItems");
    expect(appSource).toContain("primaryNavItems");
    expect(appSource).toContain("managementNavItems");
    expect(appSource).toContain('labelKey: "workflow"');
    expect(appSource).toContain('labelKey: "management"');
    const dashboardNavSource = appSource.slice(appSource.indexOf("const dashboardNavItems"), appSource.indexOf("const primaryNavItems"));
    const primaryNavSource = appSource.slice(appSource.indexOf("const primaryNavItems"), appSource.indexOf("const managementNavItems"));
    const managementNavSource = appSource.slice(appSource.indexOf("const managementNavItems"), appSource.indexOf("const navItems"));
    expect(dashboardNavSource).toContain('labelKey: "dashboard"');
    expect(primaryNavSource).not.toContain("仪表盘");
    expect(primaryNavSource).toContain('labelKey: "creative"');
    expect(primaryNavSource).not.toContain('labelKey: "image"');
    expect(primaryNavSource).toContain('labelKey: "ledger"');
    expect(primaryNavSource).not.toContain("商品管理");
    expect(primaryNavSource).not.toContain("审核发布");
    expect(primaryNavSource).not.toContain("商品项目");
    expect(primaryNavSource).not.toContain("生成记录");
    expect(managementNavSource).not.toContain("生成记录");
    expect(managementNavSource).not.toContain("仪表盘");
    expect(managementNavSource).not.toContain("模板管理");
    expect(managementNavSource).not.toContain("任务记录");
    expect(managementNavSource).toContain('labelKey: "wallet"');
    expect(managementNavSource).not.toContain('labelKey: "transactions"');
    expect(managementNavSource).toContain('labelKey: "pricing"');
    expect(managementNavSource).not.toContain("成本台账");
    expect(managementNavSource).toContain('labelKey: "settings"');
    expect(managementNavSource).not.toContain("审核发布");
    expect(managementNavSource).not.toContain("品牌设置");
    expect(appSource).not.toContain('aria-label="品牌设置"');
    expect(appSource).not.toContain("hiddenNavItems");
    expect(appSource).not.toContain('case "review"');
    expect(appSource).not.toContain('aria-label="审核发布"');
    expect(appSource).not.toContain("StatusPanel");
    expect(appSource).not.toContain("操作反馈");
    expect(appSource).not.toContain("当前模式");
    expect(appSource).not.toContain("运行状态");
    expect(appSource).not.toContain('aria-label="当前模块"');
    expect(appSource).toContain('aria-label={sidebarCollapsed ? tApp("shell.sidebarExpand") : tApp("shell.sidebarCollapse")}');
    expect(appSource).toContain("sidebarCollapsed");
    expect(appSource).toContain("setSidebarCollapsed");
    expect(appSource).toContain("const floatingTooltipClass");
    expect(appSource).toContain("floatingTooltipClass,");
    expect(appSource).toContain("min-[900px]:grid-cols-[56px_minmax(0,1fr)]");
    expect(appSource).toContain("min-[900px]:grid-cols-[232px_minmax(0,1fr)]");
    expect(appSource).not.toContain("min-[900px]:grid-cols-[72px_minmax(0,1fr)]");
    expect(appSource).not.toContain("min-[900px]:grid-cols-[64px_minmax(0,1fr)]");
    expect(appSource).not.toContain("min-[900px]:grid-cols-[196px_minmax(0,1fr)]");
    expect(appSource).toContain("app-sidebar-collapse-rail");
    expect(appSource).toContain("app-sidebar-collapse-button");
    expect(appSource).toContain("absolute inset-y-0 right-[-10px]");
    expect(appSource).not.toContain("app-sidebar-collapse-hitbox");
    expect(appSource).toContain("app-sidebar-collapse-button pointer-events-none grid h-8 w-8");
    expect(appSource).toContain("cursor-pointer");
    expect(appSource).not.toContain("MoveHorizontal");
    expect(appSource).toContain("opacity-0");
    expect(appSource).toContain("group-hover:opacity-100");
    expect(appSource).not.toContain("right-[-17px]");
    expect(appSource).not.toContain("top-5");
    expect(appSource).not.toContain("h-[34px] w-[34px] rounded-full");
    expect(appSource).not.toContain("left-[232px] top-[84px]");
    expect(appSource).not.toContain("mx-auto h-10 w-10 rounded-full");
    expect(appSource).toContain('sidebarCollapsed ? "w-[56px] overflow-visible" : "w-[232px] overflow-visible"');
    expect(appSource).toContain("h-[72px] items-center");
    expect(appSource).not.toContain("h-[72px] items-center border-b");
    expect(appSource).not.toContain("h-[84px] items-center border-b");
    expect(appSource).toContain('sidebarCollapsed ? "justify-center px-2" : "gap-2.5 px-3.5"');
    expect(appSource).toContain('sidebarCollapsed ? "px-1.5" : "px-2.5"');
    expect(appSource).toContain('sidebarCollapsed ? "overflow-visible" : "overflow-y-auto overflow-x-hidden"');
    expect(appSource).toContain("app-sidebar-nav-tooltip");
    expect(appSource).toContain("group-hover/sidebar-nav-item:opacity-100");
    expect(appSource).toContain("title={sidebarCollapsed ? label : undefined}");
    expect(appSource).toContain("grid min-h-9 w-full");
    expect(appSource).not.toContain("商品事实、生成预检、成本记录、审核发布和品牌默认值。");
    const appShell = appSource.slice(appSource.indexOf("<main"), appSource.indexOf("function LoginScreen"));
    expect(appShell).not.toContain("mock 免费");
    expect(appShell).not.toContain("付费通道");
    expect(appShell).not.toContain("本地模拟");
    expect(appSource).not.toContain("本地模拟");
    expect(appShell).not.toContain("<TopPill");
    expect(appShell).not.toContain("BadgeJapaneseYen");
    expect(appShell).not.toContain("min-[900px]:grid-cols-[246px_minmax(0,1fr)]");
    expect(appShell).not.toContain('aria-label="刷新控制台数据"');
    expect(appShell).not.toContain('title="重新拉取最新商品、任务、费用和配置数据"');
    expect(appShell).not.toContain("h-9 w-9 rounded-full p-0 text-[var(--muted)] shadow-[0_8px_18px_rgba(15,23,42,.05)]");
    expect(appShell).not.toContain("刷新最新数据");
    expect(appShell).not.toContain("refresh-tooltip");
    expect(appShell).not.toContain("重新拉取最新数据");
    expect(appShell).not.toContain(">刷新<");
    expect(appShell).toContain("app-sidebar-account");
    expect(appShell).toContain("grid-rows-[auto_minmax(0,1fr)_auto]");
    expect(appShell).toContain("activeSectionIsCreativeWorkspace");
    expect(appShell).toContain("overflow-hidden p-0");
    expect(appShell).not.toContain("sticky top-0");
    expect(appShell).not.toContain("activeSectionSubtitle");
    expect(appShell).not.toContain("min-h-[84px]");
    expect(appShell).not.toContain("px-5 py-4");
    expect(appShell).toContain("overflow-y-auto px-4 py-4");
    expect(appShell).not.toContain("overflow-y-auto px-4 py-5");
    expect(appSource).toContain("contentScrollerRef");
    expect(appSource).toContain("replaceState");
    expect(appSource).toContain("aria-current");
    expect(appSource).toContain("product-library-shell");
    expect(appSource).toContain("product-library-list");
    expect(appSource).toContain("ProductLibraryDialog");
    expect(appSource).toContain('tProductLibrary("title")');
    expect(appSource).toContain('tProductLibrary("dialog.close")');
    expect(appSource).toContain('tProductLibrary("addProduct")');
    expect(appSource).toContain('tProductLibrary("dialog.importBadge")');
    expect(appSource).toContain('tProductLibrary("actions.createVideo")');
    expect(appSource).toContain('tVideo("newProduct.title")');
    expect(appSource).not.toContain("开始创作");
    expect(appSource).not.toContain("用此商品创作视频");
    expect(appSource).toContain('tProductLibrary("dialog.pasteLabel")');
    expect(appSource).toContain('tProductLibrary("dialog.importDescription")');
    expect(appSource).not.toContain("店小秘");
    expect(appSource).not.toContain("1688");
    expect(appSource).not.toContain("商品页");
    expect(appSource).toContain('tProductLibrary("importPreview.title")');
    expect(appSource).toContain('tProductLibrary("importPreview.qualityTitle")');
    expect(appSource).toContain('makeAppTranslator("productStatus")');
    expect(appSource).toContain('tProductLibrary("importPreview.missingFields")');
    expect(appSource).toContain('tProductLibrary("importPreview.forbiddenClaims")');
    expect(appSource).toContain("quality");
    expect(appSource).toContain('tProductLibrary("importPreview.subtitle")');
    expect(appSource).not.toContain("检查结果没问题后保存到商品库。");
    ["商品资料草稿", "资料完整度", "拦截宣称", "禁用/未确认宣称", "手动微调", "禁止/未确认宣称", "生成资料草稿"].forEach((label) => {
      expect(appSource).not.toContain(label);
    });
    expect(appSource).toContain('tProductLibrary("dialog.pasteLabel")');
    expect(appSource).toContain('tProductLibrary("dialog.aiSave")');
    expect(appSource).toContain("ensureTextModelConfigured");
    expect(appSource).toContain("ensureImageModelConfigured");
    expect(appSource).toContain("ensureVideoModelConfigured");
    expect(appSource).toContain("ConsoleToast");
    expect(appSource).toContain("consoleToast={consoleToast}");
    expect(appSource).toContain("showConsoleToast");
    expect(appSource).toContain("handleConsoleToastClose");
    expect(appSource).toContain("consoleToastCloseRef");
    expect(appSource).toContain("setConsoleToast(undefined)");
    expect(appSource).toContain("window.setTimeout(onClose, 3000)");
    expect(appSource).toContain("window.clearTimeout(timeout)");
    expect(appSource).toContain('tApp("shell.toastTitle")');
    expect(appSource).toContain("readableVideoJobError");
    const providerErrorSource = await readFile(join(import.meta.dirname, "../../src/core/videoProviderErrors.ts"), "utf8");
    const creativeVersionsSource = await readFile(join(import.meta.dirname, "../../src/client/videoCreativeVersions.ts"), "utf8");
    const videoDisplayViewModelSource = await readFile(join(import.meta.dirname, "../../src/client/videoDisplayViewModel.ts"), "utf8");
    expect(creativeVersionsSource).toContain("errorDetails?: VideoJobErrorDetails");
    expect(appSource).toContain("readableVideoJobError(job.error, job.errorDetails, appLocale)");
    expect(videoDisplayViewModelSource).toContain("readableVideoJobError(job.videoJob?.error, job.videoJob?.errorDetails, locale)");
    expect(videoDisplayViewModelSource).toContain("rawMessage: details.message");
    expect(providerErrorSource).toContain("参考图太多：Seedance 最多支持");
    expect(providerErrorSource).toContain("参考图里可能包含真人、人脸或隐私信息");
    expect(appSource).toContain('tApp("status.textModelRequired")');
    expect(appSource).toContain('tApp("status.imageModelRequired")');
    expect(appSource).toContain('tApp("status.videoModelRequired")');
    expect(appSource).not.toContain("openApiManagementWithMessage");
    expect(appSource).not.toContain("ModelConfigNotice");
    expect(appSource).not.toContain("ConsoleStatusNotice");
    const textModelGuard = appSource.slice(appSource.indexOf("function ensureTextModelConfigured"), appSource.indexOf("function ensureImageModelConfigured"));
    const imageModelGuard = appSource.slice(appSource.indexOf("function ensureImageModelConfigured"), appSource.indexOf("function ensureVideoModelConfigured"));
    const videoModelGuard = appSource.slice(appSource.indexOf("function ensureVideoModelConfigured"), appSource.indexOf("useEffect(() =>"));
    expect(textModelGuard).not.toContain('setActiveSection("settings")');
    expect(imageModelGuard).not.toContain('setActiveSection("settings")');
    expect(videoModelGuard).not.toContain('setActiveSection("settings")');
    expect(appSource).toContain("importProductsBatch");
    expect(appSource).toContain("/api/products/import-batch");
    expect(appSource).toContain("importProductAndSave");
    expect(appSource).toContain("/api/products/import-ai-preview");
    expect(appSource).toContain('tProductLibrary("dialog.manualBadge")');
    expect(appSource).toContain("importNotes");
    expect(appSource).toContain('tProductLibrary("importPreview.notes")');
    expect(appSource).toContain("/api/products/import-preview");
    expect(appSource).toContain("ProductDraftForm");
    expect(appSource).toContain("loadProductIntoDraft");
    expect(appSource).toContain("openProductStudio");
    expect(appSource).toContain("onCreateVideo");
    expect(appSource).not.toContain("onOpenAdvancedVideoParams");
    expect(appSource).toContain("ProductCreationWorkspace");
    expect(appSource).toContain("ProductCreationComposer");
    expect(appSource).toContain("video-workspace-shell");
    expect(appSource).toContain("video-product-library-column");
    expect(appSource).toContain("video-operation-column");
    expect(appSource).toContain("ProductCreationProductLibrary");
    expect(appSource).toContain("ProductCreationOperationWorkspace");
    expect(appSource).not.toContain("ProductCreationProductPicker");
    expect(appSource).not.toContain("product-creation-product-menu");
    expect(appSource).not.toContain("product-control-bar");
    expect(appSource).not.toContain("creation-parameter-dock");
    expect(appSource).not.toContain("product-studio-shell");
    expect(appSource).not.toContain("product-studio-topbar");
    expect(appSource).not.toContain("product-studio-step-actions");
    expect(appSource).not.toContain("ProductStudioPipeline");
    expect(appSource).not.toContain("ProductStudioStepPanel");
    expect(appSource).not.toContain("VideoCreationEmptyShell");
    expect(appSource).toContain("product-library-shell");
    expect(appSource).toContain("product-library-list");
    expect(appSource).toContain("ProductLibraryDialog");
    expect(appSource).toContain('tProductLibrary("title")');
    expect(appSource).toContain('tProductLibrary("addProduct")');
    expect(appSource).toContain('tProductLibrary("actions.createVideo")');
    expect(appSource).not.toContain('case "products"');
    expect(appSource).not.toContain('aria-label="商品管理"');
    const productLibraryHome = appSource.slice(appSource.indexOf("function ProductLibraryHome"), appSource.indexOf("function ProductLibraryDialog"));
    expect(productLibraryHome).toContain("product-library-toolbar");
    expect(productLibraryHome).toContain('tProductLibrary("columns.facts")');
    expect(productLibraryHome).toContain('const tProductStatus = makeAppTranslator("productStatus")');
    expect(productLibraryHome).toContain("productLibraryStatus(product, tProductStatus)");
    expect(productLibraryHome).not.toContain("可创作");
    expect(productLibraryHome).not.toContain("待补图");
    expect(productLibraryHome).not.toContain("资料完整");
    expect(productLibraryHome).not.toContain("参考图 {referenceImageCount} 张");
    const productLibraryStatusSource = appSource.slice(appSource.indexOf("function productLibraryStatus"), appSource.indexOf("function videoAssetKindTone"));
    expect(productLibraryStatusSource).toContain('makeAppTranslator("productStatus")');
    expect(productLibraryStatusSource).toContain('tProductStatus("readyStatus")');
    expect(productLibraryStatusSource).toContain('tProductStatus("referenceImages"');
    expect(productLibraryStatusSource).not.toContain("需补参考图");
    expect(productLibraryStatusSource).not.toContain("资料待补");
    expect(productLibraryStatusSource).not.toContain("还差");
    expect(productLibraryStatusSource).not.toContain("可创作");
    expect(productLibraryStatusSource).not.toContain("待补图");
    expect(productLibraryHome).not.toContain("事实 ");
    expect(productLibraryHome).not.toContain("事实分");
    expect(productLibraryHome).not.toContain("商品库只负责");
    expect(productLibraryHome).not.toContain("个可创作");
    expect(productLibraryHome).not.toContain("个待补图");
    expect(productLibraryHome).not.toContain("素材就绪");
    expect(productLibraryHome).toContain("onCreateVideo");
    expect(productLibraryHome).toContain("onCreateVideo(product)");
    expect(productLibraryHome).toContain("onEdit(product.sku)");
    expect(productLibraryHome).toContain("onDeleteProduct(product.sku)");
    expect(productLibraryHome).not.toContain("{product.sku}</div>");
    expect(productLibraryHome).toContain('tProductLibrary("actions.createVideo")');
    expect(productLibraryHome).toContain('tProductLibrary("actions.edit")');
    expect(productLibraryHome).toContain('tProductLibrary("actions.delete")');
    expect(productLibraryHome).not.toContain('role="button"');
    expect(productLibraryHome).not.toContain("tabIndex={0}");
    expect(productLibraryHome).not.toContain("event.key === \"Enter\"");
    expect(productLibraryHome).toContain("product-library-row-action");
    expect(productLibraryHome).not.toContain("ChevronRight size={15}");
    expect(productLibraryHome).not.toContain("buttonVariants({ size: \"sm\", variant: \"primary\" })");
    expect(productLibraryHome).not.toContain("event.stopPropagation()");
    expect(productLibraryHome).not.toContain("cursor-pointer");
    expect(productLibraryHome).toContain("hover:bg-[var(--card)]");
    expect(productLibraryHome).not.toContain("onView(product.sku)");
    expect(productLibraryHome).toContain('tProductLibrary("addProduct")');
    expect(productLibraryHome).toContain("openProductDialog");
    expect(productLibraryHome).toContain('setDialogMode("import")');
    expect(productLibraryHome).not.toContain("导入商品");
    expect(productLibraryHome).not.toContain("新增商品");
    expect(productLibraryHome).not.toContain("openImportDialog");
    expect(productLibraryHome).not.toContain("openManualDialog");
    expect(productLibraryHome).not.toContain('setDialogMode("manual")');
    const productLibraryDialog = appSource.slice(appSource.indexOf("function ProductLibraryDialog"), appSource.indexOf("function ProductImportResultPreview"));
    expect(productLibraryDialog).toContain('tProductLibrary("dialog.aiSave")');
    expect(appSource).toContain('type ProductLibraryDialogMode = ProductEditorMode | "edit" | undefined;');
    expect(appSource).toContain('setProductLibraryDialogMode("edit")');
    expect(productLibraryDialog).toContain('const isEditMode = mode === "edit";');
    expect(productLibraryDialog).toContain('isEditMode ? tProductLibrary("dialog.editTitle") : tProductLibrary("dialog.addTitle")');
    expect(productLibraryDialog).toContain('!isEditMode ? (');
    expect(productLibraryDialog).toContain('{!isEditMode && activeMode === "import" ? (');
    expect(productLibraryDialog).toContain('submitLabel={isEditMode ? tProductLibrary("dialog.saveChanges") : tProductLibrary("dialog.saveProduct")}');
    expect(productLibraryDialog).not.toContain("预览整理结果");
    expect(productLibraryDialog).not.toContain("批量保存");
    expect(productLibraryDialog.split('tProductLibrary("dialog.aiSave")')).toHaveLength(2);
    const productImportResultPreview = appSource.slice(appSource.indexOf("function ProductImportResultPreview"), appSource.indexOf("function ProductImportQualityPanel"));
    expect(productImportResultPreview).toContain('tProductLibrary("importPreview.subtitle")');
    expect(productImportResultPreview).not.toContain("检查结果没问题后保存到商品库。");
    expect(productImportResultPreview).not.toContain("确认后可直接保存");
    expect(productImportResultPreview).not.toContain('label="SKU"');
    expect(productLibraryDialog).not.toContain("逐项填写 SKU");
    expect(productLibraryDialog).not.toContain('<Field label="SKU">');
    const productDraftFormSource = appSource.slice(appSource.indexOf("function ProductDraftForm"), appSource.indexOf("function DashboardStatsPanel"));
    expect(productDraftFormSource).toContain("ProductDraftSection");
    expect(productDraftFormSource).toContain("ProductDraftTextareaGroup");
    expect(productDraftFormSource).toContain("ProductDraftReferencePaths");
    expect(productDraftFormSource).toContain('tProductLibrary("draft.basicTitle")');
    expect(productDraftFormSource).toContain('tProductLibrary("draft.factsTitle")');
    expect(productDraftFormSource).toContain('tProductLibrary("draft.referenceTitle")');
    expect(productDraftFormSource).toContain('<form className="grid gap-5"');
    expect(productDraftFormSource).not.toContain('<form className="grid gap-3"');
    const productDraftFactsSource = await readFile(join(import.meta.dirname, "../../src/client/productDraftFacts.ts"), "utf8");
    expect(appSource).toContain('from "./productDraftFacts.js"');
    expect(appSource).not.toContain("function productDraftToFacts(");
    expect(appSource).not.toContain("function internalProductIdFromTitle(");
    expect(productDraftFactsSource).toContain("export function productDraftToFacts");
    expect(productDraftFactsSource).toContain("export function internalProductIdFromTitle");
    expect(productDraftFactsSource).toContain("sku: draft.sku.trim() || internalProductIdFromTitle(draft.title_ja");
    expect(appSource).not.toContain("商品 SKU:");
    expect(appSource).not.toContain("`SKU: ${product.sku}`");
    expect(appSource).not.toContain("productsResponse.products[0]");
    expect(appSource).not.toContain("ProductStudioProductList");
    expect(appSource).not.toContain("product-studio-product-list");
    expect(appSource).not.toContain("useProductForVideo");
    expect(appSource).not.toContain("onUseForVideo");
    expect(appSource).not.toContain("用此商品做视频");
    expect(appSource).toContain('labelKey: "creative"');
    expect(appSource).not.toContain('aria-label="商品管理"');
    expect(appSource).toContain('tVideo("history.title")');
    expect(appSource).not.toContain("高级新建任务");
    const renderCreativeWorkspaceSource = sourceBetween(appSource, "function renderCreativeWorkspace", "function renderActiveSection");
    const videoCase = appSource.slice(appSource.indexOf('case "video"'), appSource.indexOf('case "ledger"'));
    expect(renderCreativeWorkspaceSource).toContain("<ProductCreationWorkspace");
    expect(videoCase).toContain('case "image"');
    expect(renderCreativeWorkspaceSource).toContain("mode={creativeWorkspaceMode}");
    expect(renderCreativeWorkspaceSource).toContain("onModeChange={(nextMode) => setActiveSection(nextMode)}");
    expect(videoCase).not.toContain("<VideoJobsPanel");
    expect(videoCase).not.toContain("<ReportsPanel");
    expect(videoCase).not.toContain("手动生成参数");
    expect(videoCase).not.toContain("<details");
    expect(videoCase).not.toContain("<StorageBackupPanel");
    expect(videoCase).not.toContain("<AuditLogPanel");
    expect(videoCase).not.toContain("<VideoAssetsPanel");
    const creationWorkspaceSource = appSource.slice(appSource.indexOf("function ProductCreationWorkspace"), appSource.indexOf("function ProductLibraryHome"));
    const creationComposerSource = appSource.slice(appSource.indexOf("function ProductCreationComposer"), appSource.indexOf("function ProductLibraryHome"));
    const productCreativeWorkbenchSource = sourceBetween(appSource, "function ProductCreativeWorkbench", "function ProductCreativeSettingsTray");
    const modelConfigChoiceSource = modelServiceSelectionSource.slice(modelServiceSelectionSource.indexOf("export function configuredModelOptions"), modelServiceSelectionSource.indexOf("export function modelConfigChoiceLabel"));
    const modelConfigChoiceLabelSource = modelServiceSelectionSource.slice(modelServiceSelectionSource.indexOf("export function modelConfigChoiceLabel"), modelServiceSelectionSource.indexOf("export function platformConfiguredModels"));
    const productLibraryColumnSource = appSource.slice(appSource.indexOf("function ProductCreationProductLibrary"), appSource.indexOf("function ProductCreationOperationWorkspace"));
    const storyboardPanelSource = appSource.slice(appSource.indexOf("function StoryboardComposerPanel"), appSource.indexOf("function VideoHistoryPanel"));
    const settingsTraySource = sourceBetween(appSource, "function ProductCreativeSettingsTray", "function ProductCreativeToolbarChoice");
    const modeSwitchSource = sourceBetween(appSource, "function ProductCreativeModeSwitch", "function ProductCreativeToolbarChoice");
    const productDetailsSource = sourceBetween(creationComposerSource, "product-creative-product-details", "<ProductComposerReferenceTray");
    const referenceTraySource = sourceBetween(appSource, "function ProductComposerReferenceTray", "function StoryboardComposerPanel");
    const videoHistorySource = appSource.slice(appSource.indexOf("function VideoHistoryPanel"), appSource.indexOf("function ProductLibraryHome"));
    const productWorkflowSource = await readFile(join(import.meta.dirname, "../../src/client/productWorkflowViewModel.ts"), "utf8");
    const storyboardDraftsSource = await readFile(join(import.meta.dirname, "../../src/client/storyboardDrafts.ts"), "utf8");
    const referenceMediaFilesSource = await readFile(join(import.meta.dirname, "../../src/client/referenceMediaFiles.ts"), "utf8");
    const videoCreativeVersionsSource = await readFile(join(import.meta.dirname, "../../src/client/videoCreativeVersions.ts"), "utf8");
    const buildLatestCreativeJobsSource = videoCreativeVersionsSource.slice(
      videoCreativeVersionsSource.indexOf("export function buildLatestCreativeJobs"),
      videoCreativeVersionsSource.indexOf("export function videoJobToCreativeVersion")
    );
    const formatCreativeVersionTimeSource = videoDisplayViewModelSource.slice(
      videoDisplayViewModelSource.indexOf("export function formatCreativeVersionTime"),
      videoDisplayViewModelSource.indexOf("function splitLines")
    );
    const formatDeletionTimeSource = videoDisplayViewModelSource.slice(
      videoDisplayViewModelSource.indexOf("export function formatDeletionTime"),
      videoDisplayViewModelSource.indexOf("export function formatAbsoluteMinuteTime")
    );
    const queueProductVideoJobsSource = appSource.slice(
      appSource.indexOf("async function queueProductVideoJobs"),
      appSource.indexOf("async function importProductPreview")
    );
    const retryVideoJobSource = appSource.slice(
      appSource.indexOf("async function retryVideoJob"),
      appSource.indexOf("async function recoverVideoJobDownload")
    );
    const recoverVideoJobDownloadSource = appSource.slice(
      appSource.indexOf("async function recoverVideoJobDownload"),
      appSource.indexOf("async function createBackupArchive")
    );
    expect(renderCreativeWorkspaceSource).toContain("onOrganizeProductPackage={organizeProductPackage}");
    expect(renderCreativeWorkspaceSource).toContain("onStartNewProduct={startNewVideoProduct}");
    expect(renderCreativeWorkspaceSource).toContain("onDeleteProduct={deleteProduct}");
    expect(renderCreativeWorkspaceSource).toContain("pendingImageFiles={pendingImageFiles}");
    expect(renderCreativeWorkspaceSource).toContain("setPendingImageFiles={setPendingImageFiles}");
    expect(renderCreativeWorkspaceSource).toContain("ledgerJobs={ledger?.jobs ?? []}");
    expect(creationWorkspaceSource).toContain("<ProductCreationComposer");
    expect(creationWorkspaceSource).not.toContain("selectedProductStoryboardHistory");
    expect(creationWorkspaceSource).toContain("ledgerJobs: LedgerJob[];");
    expect(creationWorkspaceSource).toContain("pendingImageFiles: File[];");
    expect(creationWorkspaceSource).toContain("setPendingImageFiles: Dispatch<SetStateAction<File[]>>;");
    expect(creationWorkspaceSource).toContain("pendingImageFiles={pendingImageFiles}");
    expect(creationWorkspaceSource).toContain("setPendingImageFiles={setPendingImageFiles}");
    expect(creationWorkspaceSource).toContain("mergeLedgerJobs");
    expect(creationWorkspaceSource).not.toContain("<ProductStudio");
    expect(creationWorkspaceSource).not.toContain("ensureVideoProductSelection");
    expect(modelServiceSelectionSource).toContain('export type ModelConfigChoice = "auto" | string;');
    expect(appSource).toContain('useState<ModelConfigChoice>("auto")');
    expect(appSource).toContain("selectedTextModelConfigId");
    expect(appSource).toContain("selectedImageModelConfigId");
    expect(appSource).toContain("selectedVideoModelConfigId");
    expect(appSource).toContain("useState(defaultVideoDurationSeconds)");
    expect(appSource).toContain('const defaultVideoTemplate: TemplateName = "auto";');
    expect(appSource).toContain("useState<TemplateName>(defaultVideoTemplate)");
    expect(appSource).toContain("setTemplate(defaultVideoTemplate)");
    expect(appSource).toContain("setSelectedTextModelConfigId(modelServicePreferenceResponse.preference.textModelConfigId ?? \"auto\")");
    expect(appSource).toContain("setSelectedImageModelConfigId(modelServicePreferenceResponse.preference.imageModelConfigId ?? \"auto\")");
    expect(appSource).toContain("setSelectedVideoModelConfigId(modelServicePreferenceResponse.preference.videoModelConfigId ?? \"auto\")");
    expect(appSource).not.toContain("setTemplate(nextSettings.enabledTemplates.includes(nextSettings.defaultTemplate)");
    expect(appSource).toContain("type StoryboardDraftSource");
    expect(productWorkflowSource).toContain('export type StoryboardDraftSource = "default" | "ai" | "manual";');
    expect(appSource).toContain('useState<StoryboardDraftSource>("default")');
    expect(appSource).toContain('setStoryboardDraftSource("ai")');
    expect(appSource).toContain('onStoryboardDraftChange={(nextDraft, source = "manual") => {');
    expect(appSource).toContain("setStoryboardDraftSource(source)");
    expect(storyboardDraftsSource).toContain("export function defaultStoryboardDraftForTemplate");
    expect(appSource).not.toContain("function defaultStoryboardDraftForTemplate");
    expect(appSource).toContain('const [studioStoryboardDraft, setStudioStoryboardDraft] = useState("");');
    expect(appSource).not.toContain("function injectTemplateStoryboardDraft(nextTemplate: TemplateName)");
    expect(appSource).not.toContain("injectTemplateStoryboardDraft(nextTemplate);");
    expect(appSource).not.toContain("setStudioStoryboardDraft(localizedDefaultStoryboardDraft(nextTemplate, duration, appLocale))");
    expect(appSource).not.toContain("Preserve the storyboard once the user edits it manually.");
    expect(appSource).not.toContain("storyboardDraftIsGuidance={!storyboardDraftTouched}");
    expect(creationComposerSource).toContain("video-workspace-shell");
    expect(creationComposerSource).toContain("h-[100dvh] max-h-[100dvh] min-h-0 grid-rows-[minmax(0,1fr)]");
    expect(creationComposerSource).toContain("transition-[grid-template-columns] duration-200");
    expect(creationComposerSource).toContain("min-[900px]:grid-cols-[var(--product-library-column-width)_minmax(0,1fr)]");
    expect(creationComposerSource).toContain('style={{ "--product-library-column-width": `${productLibraryColumnWidth}px` } as CSSProperties}');
    expect(creationComposerSource).toContain("PRODUCT_LIBRARY_DEFAULT_WIDTH");
    expect(creationComposerSource).toContain("PRODUCT_LIBRARY_COLLAPSED_WIDTH");
    expect(creationComposerSource).not.toContain("PRODUCT_LIBRARY_COLLAPSE_SNAP_WIDTH");
    expect(creationComposerSource).not.toContain("PRODUCT_LIBRARY_MIN_WIDTH");
    expect(creationComposerSource).not.toContain("PRODUCT_LIBRARY_MAX_WIDTH");
    expect(creationComposerSource).toContain("productLibraryCollapsed");
    expect(creationComposerSource).toContain("productLibraryColumnWidth");
    expect(creationComposerSource).not.toContain("const [productLibraryWidth");
    expect(creationComposerSource).not.toContain("handleProductLibraryResizeStart");
    expect(creationComposerSource).not.toContain("handleProductLibraryResizeKeyDown");
    expect(creationComposerSource).not.toContain('role="separator"');
    expect(creationComposerSource).not.toContain('aria-orientation="vertical"');
    expect(creationComposerSource).not.toContain("aria-valuenow={productLibraryColumnWidth}");
    expect(creationComposerSource).toContain("video-product-library-collapse-rail");
    expect(creationComposerSource).toContain("video-product-library-collapse-button");
    expect(creationComposerSource).toContain("transition-[left,color]");
    expect(creationComposerSource).not.toContain("video-product-library-resizer");
    expect(creationComposerSource).not.toContain("productLibraryResizing");
    expect(creationComposerSource).not.toContain("setProductLibraryResizing");
    expect(creationComposerSource).not.toContain("MoveHorizontal");
    expect(creationComposerSource).toContain("cursor-pointer");
    expect(creationComposerSource).toContain("opacity-0");
    expect(creationComposerSource).toContain("group-hover:opacity-100");
    expect(creationComposerSource).toContain('aria-label={productLibraryCollapsed ? tVideo("productLibrary.expand") : tVideo("productLibrary.collapse")}');
    expect(creationComposerSource).toContain('title={productLibraryCollapsed ? tVideo("productLibrary.expand") : tVideo("productLibrary.collapse")}');
    expect(creationComposerSource).toContain("onClick={() => setProductLibraryCollapsed((collapsed) => !collapsed)}");
    expect(creationComposerSource).not.toContain("拖动调整商品库宽度");
    expect(creationComposerSource).toContain("ProductCreationProductLibrary");
    expect(creationComposerSource).toContain("ProductCreationOperationWorkspace");
    expect(creationComposerSource).toContain("collapsed={productLibraryCollapsed}");
    expect(creationComposerSource).toContain("video-product-library-column");
    expect(creationComposerSource).toContain("video-operation-column");
    expect(creationComposerSource).not.toContain("product-control-bar");
    expect(creationComposerSource).not.toContain("video-parameter-row grid");
    expect(creationComposerSource).not.toContain("<ProductCreationProductPicker");
    expect(creationComposerSource).toContain("grid content-start gap-3");
    expect(creationComposerSource).not.toContain("grid min-h-full content-start gap-3");
    expect(creationComposerSource).toContain("ProductCreativeWorkbench");
    expect(creationComposerSource).toContain("product-creative-workbench");
    expect(creationComposerSource).toContain("product-creative-controls");
    expect(creationComposerSource).toContain("prompt-inline-settings");
    expect(appSource).toContain("active-model-control");
    expect(creationComposerSource).toContain('layout="pill"');
    expect(creationComposerSource).toContain("ProductCreativeToolbarChoice");
    expect(creationComposerSource).not.toContain("model-scheme-chip-row");
    expect(creationComposerSource).not.toContain("ModelSchemeChip");
    expect(creationComposerSource).not.toContain("{schemeSummary}");
    expect(creationComposerSource).not.toContain("model-scheme-summary min-w-0 whitespace-normal break-words");
    expect(creationComposerSource).not.toContain("model-scheme-summary min-w-0 truncate");
    expect(creationComposerSource).toContain('label={tVideo("controls.resolution")}');
    expect(creationComposerSource).toContain("videoResolutionOptions");
    expect(creationComposerSource).toContain("selectedVideoResolution");
    expect(creationComposerSource).toContain("resolution: selectedVideoResolution");
    expect(creationComposerSource).toContain('label={tVideo("controls.aspectRatio")}');
    expect(creationComposerSource).toContain("videoAspectRatioOptions");
    expect(creationComposerSource).toContain("selectedVideoAspectRatio");
    expect(creationComposerSource).toContain("aspectRatio: selectedVideoAspectRatio");
    expect(creationComposerSource).toContain('const languageOptions: FinalVideoLanguage[] = ["ja", "zh", "en"]');
    expect(appSource).toContain('if (value === "en") return t("languages.en");');
    expect(queueProductVideoJobsSource).toContain("resolution: videoGenerationOptions.resolution ?? selectedVideoResolution");
    expect(creationComposerSource).toContain('density="micro"');
    expect(creationComposerSource).toContain("prompt-composer-primary-action-slot");
    expect(creationComposerSource).toContain("primaryActionDisabled");
    expect(creationComposerSource).toContain("primaryActionLabel");
    expect(creationComposerSource).not.toContain("video-generate-summary");
    expect(creationComposerSource).not.toContain("{generateVideoSummary}");
    expect(creationComposerSource).not.toContain("product-creative-action-summary");
    expect(creationComposerSource).not.toContain("video-generate-summary min-w-0 truncate");
    expect(creationComposerSource).not.toContain("generateVideoSummaryItems.map");
    expect(creationComposerSource).not.toContain("video-generate-summary-item");
    expect(creationComposerSource).not.toContain("video-generate-summary-separator");
    expect(creationComposerSource).not.toContain("generation-status-message");
    expect(creationComposerSource).not.toContain("video-generate-status-center");
    expect(creationComposerSource).not.toContain("subtitle={generateVideoSummary}");
    expect(creationComposerSource).not.toContain("video-generate-bar");
    expect(creationComposerSource).not.toContain('<div className="min-w-0 truncate text-xs font-bold text-[var(--muted)]">{schemeSummary}</div>');
    expect(creationComposerSource).not.toContain("footer={");
    expect(creationComposerSource.indexOf("product-creative-compose-panel")).toBeLessThan(creationComposerSource.indexOf("product-creative-history"));
    expect(productCreativeWorkbenchSource).not.toContain("max-w-[960px]");
    expect(productCreativeWorkbenchSource).not.toContain("mx-auto");
    expect(creationComposerSource).toContain("product-creative-product-details");
    expect(creationComposerSource).toContain("<ProductCreativeSettingsTray");
    expect(creationComposerSource).toContain("product-creative-context-strip");
    expect(creationComposerSource).not.toContain("product-creative-settings");
    expect(creationComposerSource).toContain("product-facts-editor");
    expect(creationComposerSource).toContain("product-facts-body h-[104px] min-h-[104px] max-h-[104px]");
    expect(creationComposerSource).toContain("overflow-y-auto");
    expect(productDetailsSource).toContain("grid-rows-[36px_minmax(104px,auto)]");
    expect(productDetailsSource).toContain("product-facts-header flex h-9 items-center");
    expect(productDetailsSource).toContain("product-facts-action h-9 min-h-9");
    expect(productDetailsSource).toContain("product-creative-product-details grid self-start");
    expect(productDetailsSource).toContain("border-0 bg-transparent px-0 py-0");
    expect(productDetailsSource).not.toContain("border-[var(--border)] bg-[var(--panel)]");
    expect(productDetailsSource).not.toContain('<div className="min-h-5">');
    expect(referenceTraySource).toContain("product-reference-inline grid self-start content-start gap-2 rounded-[8px] px-3 py-2");
    expect(referenceTraySource).toContain('referenceCount > 0 ? "grid-rows-[36px_minmax(104px,auto)]" : "grid-rows-[36px]"');
    expect(referenceTraySource).toContain("product-reference-actions flex h-9 min-w-0 flex-nowrap items-center gap-2");
    expect(referenceTraySource).toContain('tVideo("reference.title")');
    expect(referenceTraySource).toContain("reference-add-button inline-flex h-9 min-h-9");
    expect(referenceTraySource).not.toContain("reference-generate-action");
    expect(referenceTraySource).not.toContain('tVideo("reference.generate")');
    expect(referenceTraySource).toContain("reference-image-list flex h-[104px] min-h-[104px]");
    expect(productDetailsSource).not.toContain("<details");
    expect(productDetailsSource).not.toContain("<summary");
    expect(productDetailsSource).not.toContain("productDetailsOpen");
    expect(creationComposerSource).toContain("overflow-visible");
    expect(creationComposerSource).toContain('menuPlacement="top"');
    expect(creationComposerSource).toContain('menuWidth="content"');
    expect(creationComposerSource).not.toContain("prompt-inline-settings flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto");
    expect(creationComposerSource.indexOf("product-creative-product-details")).toBeLessThan(creationComposerSource.indexOf("ProductComposerReferenceTray"));
    expect(creationComposerSource).not.toContain("product-creative-media-rail");
    expect(creationComposerSource).not.toContain("product-creative-result-rail");
    expect(productLibraryColumnSource).toContain("dedupeProductSummaries(products)");
    expect(productLibraryColumnSource).toContain("collapsed");
    expect(productLibraryColumnSource).toContain("onExpand");
    expect(productLibraryColumnSource).toContain('const tProductStatus = makeAppTranslator("productStatus")');
    expect(productLibraryColumnSource).toContain("productLibraryStatus(product, tProductStatus)");
    expect(productLibraryColumnSource).toContain("onDeleteProduct(product.sku)");
    expect(productLibraryColumnSource).toContain("onSelectProduct(product)");
    expect(productWorkflowSource).toContain("export function productGenerationReadiness");
    expect(productWorkflowSource).toContain("export function productFactsStatusLabel");
    expect(productWorkflowSource).toContain("export function storyboardStatusLabel");
    expect(appSource).not.toContain("function productGenerationReadiness");
    expect(appSource).not.toContain("function productFactsStatusLabel");
    expect(appSource).not.toContain("function storyboardStatusLabel");
    expect(creationComposerSource).toContain("const generationReadiness = localizedProductGenerationReadiness({");
    expect(creationComposerSource).toContain("const generateVideoDisabled = packingDisabled || !generationReadiness.ready");
    expect(creationComposerSource).toContain("const storyboardProductReady = Boolean(selectedProduct || importText.trim())");
    expect(creationComposerSource).toContain("async function handleGenerateStoryboardDraft()");
    expect(creationComposerSource).toContain("function previewProductForPromptCompiler");
    expect(creationComposerSource).not.toContain("const productForStoryboard = await onFlushProductFactsAutoSave() ?? selectedProduct;");
    expect(creationComposerSource).not.toContain("const productForStoryboard = await onFlushProductFactsAutoSave() ?? selectedProduct ?? await handleOrganizeProductPackage({ silentSuccess: true })");
    expect(creationComposerSource).toContain("compileProductPrompt({");
    expect(creationComposerSource).toContain("userPrompt: storyboardDraft,");
    expect(creationComposerSource).toContain('onToast(tVideo("storyboard.previewNeedsFacts"))');
    expect(creationComposerSource).toContain('onToast(errorMessage(error))');
    expect(creationComposerSource).not.toContain("generationReadinessMessageClass");
    expect(creationComposerSource).not.toContain("generation-status-message video-generate-status-center flex min-h-12 w-full items-center justify-center text-center");
    expect(creationComposerSource).not.toContain("min-h-12 w-full max-w-[360px]");
    expect(creationComposerSource).not.toContain("justify-self-center");
    expect(creationComposerSource).not.toContain("rounded-[14px] border px-4");
    expect(creationComposerSource).toContain("if (!generationReadiness.ready) {");
    expect(creationComposerSource).toContain("onToast(generationReadiness.label);");
    expect(creationComposerSource).toContain("if (packingDisabled) return;");
    expect(creationComposerSource).toContain('const primaryActionDisabled = mode === "video" ? generateVideoDisabled : imageGenerateDisabled');
    expect(creationComposerSource).toContain('const primaryActionTitle = mode === "video"');
    expect(creationComposerSource).toContain("disabled={primaryActionDisabled}");
    expect(creationComposerSource).toContain("aria-disabled={primaryActionDisabled}");
    expect(creationComposerSource).toContain('variant={primaryActionDisabled ? "default" : "primary"}');
    expect(creationComposerSource).toContain('primaryActionDisabled && "border-[var(--border-strong)] bg-[var(--panel2)]');
    expect(creationComposerSource).toContain("onGenerateVideo={handleGenerateVideo}");
    expect(creationComposerSource).not.toContain('className="min-h-12 w-full justify-center rounded-[14px] text-sm disabled:opacity-100"');
    expect(creationComposerSource).toContain("title={primaryActionTitle}");
    expect(creationComposerSource).not.toContain("generation-status-message");
    expect(creationComposerSource).not.toContain('generationReadiness.ready ? "text-[var(--muted)]" : "text-[var(--danger)]"');
    expect(creationComposerSource).toContain("generationReadiness.ready ? generateVideoButtonLabel : generationReadiness.label");
    expect(creationComposerSource).not.toContain("localizedProductFactsStatusLabel({");
    expect(creationComposerSource).not.toContain("localizedStoryboardStatusLabel(storyboardDraftSource, tVideo)");
    expect(productWorkflowSource).toContain('return appText("videoStudio.facts.raw", locale)');
    expect(productWorkflowSource).toContain('return appText("videoStudio.facts.savedPackage", locale)');
    expect(productWorkflowSource).not.toContain('return "资料待补"');
    expect(productWorkflowSource).toContain('return appText("videoStudio.storyboard.default", locale)');
    expect(productWorkflowSource).toContain('return appText("videoStudio.storyboard.ai", locale)');
    expect(productWorkflowSource).toContain('return appText("videoStudio.storyboard.manual", locale)');
    expect(productWorkflowSource).toContain('return { ready: true, label: appText("videoStudio.readiness.saved", locale) };');
    expect(productWorkflowSource).toContain('return { ready: true, label: appText("videoStudio.readiness.willOrganize", locale) };');
    expect(creationComposerSource).toContain("generateVideoButtonLabel");
    expect(creationComposerSource).toContain('versionCount > 1 ? tVideo("generate.buttonWithCount", { count: versionCount }) : tVideo("generate.button")');
    expect(appSource).not.toContain("const videoModelOptions: VideoModelChoice[]");
    expect(appSource).not.toContain("const videoModelConfigs");
    expect(appSource).not.toContain("defaultVideoModelChoice");
    expect(modelConfigChoiceSource).toContain("return models.map((model) => model.configId)");
    expect(modelConfigChoiceSource).not.toContain('return ["auto", ...models.map((model) => model.configId)');
    expect(modelServiceSelectionSource).toContain("effectiveModelConfigChoice");
    expect(modelServiceSelectionSource).toContain('value !== "auto" && options.includes(value)');
    expect(creationComposerSource).toContain("videoModelOptions");
    expect(creationComposerSource).toContain("imageModelOptions");
    expect(creationComposerSource).not.toContain("localizedModelSchemeSummary");
    expect(creationComposerSource).not.toContain("schemeSummary");
    expect(creationComposerSource).not.toContain("activeModelSchemeId");
    expect(creationComposerSource).not.toContain("localizedModelSchemeChoiceLabel");
    expect(appSource).toContain('mode === "image" ? selectedImageModelConfigId : selectedVideoModelConfigId');
    expect(appSource).toContain('mode === "image" ? imageModelOptions : videoModelOptions');
    expect(appSource).toContain('mode === "image" ? onImageModelConfigChange : onVideoModelConfigChange');
    expect(modelConfigChoiceLabelSource).toContain("return modelLabelForId(effectiveModel.id, effectiveModel.model);");
    expect(modelConfigChoiceLabelSource).not.toContain("return `${model.label} · ${displayModel}`;");
    expect(creationComposerSource).not.toContain('label={tVideo("controls.modelScheme")}');
    expect(creationComposerSource).not.toContain('label="文本模型"');
    expect(creationComposerSource).not.toContain('label="图片模型"');
    expect(creationComposerSource).not.toContain('label="视频模型"');
    expect(appSource).toContain("const defaultVideoDurationSeconds = 10");
    expect(appSource).not.toContain("seed" + "nice");
    expect(creationComposerSource).toContain("selectedVideoModelConfigId");
    expect(creationComposerSource).toContain("providerModelConfigId: effectiveSelectedVideoModelConfigId");
    expect(creationComposerSource).not.toContain("provider: videoModelConfig.provider");
    expect(creationComposerSource).not.toContain("providerModel: videoModelConfig.model");
    expect(creationComposerSource).not.toContain("confirmPaid: videoModelConfig.confirmPaid");
    expect(creationComposerSource).not.toContain("已填分镜");
    expect(creationComposerSource).not.toContain("自动分镜");
    expect(creationComposerSource).not.toContain("允许使用付费模型生成当前商品视频");
    expect(creationComposerSource).not.toContain("creation-parameter-dock");
    expect(creationComposerSource).not.toContain("product-creation-canvas overflow-visible rounded-[22px] border");
    expect(creationComposerSource).not.toContain("video-creation-frame grid gap-4 overflow-visible rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-4");
    expect(creationComposerSource).not.toContain("product-creation-canvas overflow-visible rounded-[20px] bg-white");
    expect(appSource).not.toContain("window.confirm");
    expect(appSource).not.toContain("window.alert");
    expect(appSource).not.toContain("window.prompt");
    expect(appSource).toContain("function ConfirmActionDialog");
    expect(appSource).toContain("<ConfirmActionDialog");
    expect(appSource).toContain('tApp("status.deleteProductTitle")');
    expect(appSource).toContain('tApp("status.retryTitle")');
    expect(appSource).toContain('tApp("status.deleteAssetTitle")');
    expect(creationComposerSource).toContain("product-reference-inline");
    expect(appSource).toContain("ProductFileImportDialog");
    expect(appSource).toContain("/api/products/import-file-preview");
    expect(appSource).toContain("/api/products/import-file-commit");
    expect(productLibraryColumnSource).toContain('tVideo("productLibrary.importFile")');
    expect(creationComposerSource).not.toContain("导入文件");
    expect(appSource).toContain('tFileImport("summaryWithProducts"');
    expect(appSource).toContain("const nextText = row.sourceText.trim() || productDraftToComposerText(nextDraft);");
    expect(appSource).toContain('tFileImport("importSelected"');
    expect(appSource).toContain('tFileImport("fillCurrent")');
    expect(appSource).toContain('tFileImport("defaultOne")');
    expect(appSource).not.toContain("ProductFileImportMode");
    expect(productWorkflowSource).toContain('return appText(`fileImport.rowStatus.${status}`, locale)');
    expect(appSource).toContain("fileImportRowLabel(row.status, locale)");
    expect(appSource).toContain("fileImportSourceRowsLabel(row, locale)");
    expect(appSource).toContain("fileImportCanSelect(row)");
    expect(appSource).toContain('tFileImport("selectAll")');
    expect(appSource).toContain("whitespace-nowrap");
    expect(creationComposerSource).toContain("acceptReferenceFiles");
    expect(creationComposerSource).toContain("isReferenceImageFile");
    expect(referenceMediaFilesSource).toContain("export function isReferenceImageFile");
    expect(appSource).not.toContain("function isReferenceImageFile(");
    expect(creationComposerSource).toContain("onDrop=");
    expect(creationComposerSource).toContain("onPaste=");
    expect(creationComposerSource).toContain("clipboardData.files");
    expect(creationComposerSource).toContain("event.dataTransfer.files");
    expect(creationComposerSource).toContain("dragOver");
    expect(creationComposerSource).toContain('tVideo("reference.addHint")');
    expect(creationComposerSource).toContain("pendingReferenceImageStatuses");
    expect(creationComposerSource).toContain("URL.createObjectURL");
    expect(creationComposerSource).toContain("URL.revokeObjectURL");
    expect(creationComposerSource).toContain('alt={`${fileName} preview`}');
    expect(creationComposerSource).toContain('tVideo("reference.pending"');
    expect(creationComposerSource).toContain("previewableReferenceImages");
    expect(creationComposerSource).toContain("onPendingPreview");
    expect(creationComposerSource).toContain("onPendingPreview(index)");
    expect(creationComposerSource).toContain('title={tVideo("reference.previewPending")}');
    expect(creationComposerSource).toContain("clipboardReferenceFiles");
    expect(creationComposerSource).toContain("handleProductFactsPaste");
    expect(creationComposerSource).toContain("event.stopPropagation()");
    expect(creationComposerSource).toContain("event.preventDefault()");
    expect(creationComposerSource).toContain('event.clipboardData.getData("text/plain")');
    expect(creationComposerSource).toContain('event.clipboardData.getData("text/html")');
    expect(creationComposerSource).toContain("copyPastedMediaReferencesToProduct");
    expect(creationComposerSource).toContain("isSameOriginMediaReference");
    expect(referenceMediaFilesSource).toContain("export function isSameOriginMediaReference");
    expect(referenceMediaFilesSource).toContain("export async function mediaReferenceToFile");
    expect(appSource).not.toContain("function isSameOriginMediaReference(");
    expect(appSource).not.toContain("async function mediaReferenceToFile(");
    expect(creationComposerSource).toContain("onProductFactsPaste={handleProductFactsPaste}");
    expect(creationComposerSource).toContain("storyboard-side-panel");
    expect(storyboardPanelSource).not.toContain("storyboardDraftIsGuidance");
    expect(storyboardPanelSource).toContain("productReady: boolean");
    expect(storyboardPanelSource).toContain("promptPreviewActionDisabled");
    expect(storyboardPanelSource).toContain("promptPreviewActionLoading");
    expect(storyboardPanelSource).toContain("bg-[var(--card)]");
    expect(storyboardPanelSource).not.toContain("text-[#9a8776]");
    expect(storyboardPanelSource).toContain("text-[var(--text)]");
    expect(creationComposerSource).toContain("product-facts-editor");
    expect(creationComposerSource).toContain("product-creative-product-details");
    expect(creationComposerSource).toContain("product-facts-body");
    expect(creationComposerSource).toContain("productFactsBodyRef");
    expect(creationComposerSource).toContain("productFactsBodyRef.current.scrollTop = 0");
    expect(creationComposerSource).not.toContain("Math.max(4, Math.min(8");
    expect(creationComposerSource).toContain("product-facts-body h-[104px] min-h-[104px] max-h-[104px]");
    expect(creationComposerSource).toContain("border-0 bg-transparent px-0 py-0");
    expect(creationComposerSource).toContain("resize-none overflow-y-auto");
    expect(creationComposerSource).not.toContain("submitHint");
    expect(creationComposerSource).not.toContain("{submitHint ? (");
    expect(creationComposerSource).not.toContain("{submitHint}");
    expect(creationComposerSource).not.toContain('<div className="min-h-5 truncate text-xs font-bold text-[var(--accent)]">{submitHint}</div>');
    expect(creationComposerSource).toContain('onToast(tVideo("generate.packageReadyToast"), "ok")');
    expect(creationComposerSource).toContain('onToast(tVideo("generate.queuedToast"), "ok")');
    expect(creationComposerSource).toContain("disabled:opacity-100");
    expect(creationComposerSource).not.toContain("productPackageButtonLabel");
    expect(creationComposerSource).not.toContain('"保存资料包"');
    expect(creationComposerSource).toContain('tVideo("facts.organize")');
    expect(creationComposerSource).not.toContain("创建生成任务中");
    expect(creationComposerSource).not.toContain("product-facts-body h-full min-h-[520px]");
    expect(creationComposerSource).not.toContain("max-h-[312px]");
    expect(creationComposerSource).not.toContain("min-h-[350px] resize-y border-0");
    expect(creationComposerSource).not.toContain("max-h-[340px]");
    expect(creationComposerSource).not.toContain("grid min-h-[430px]");
    expect(creationComposerSource).not.toContain("product-creative-source-column");
    expect(creationComposerSource).not.toContain("product-creative-intent-column");
    expect(creationComposerSource).not.toContain("product-creative-output-column");
    expect(appSource).toContain("const [pendingImageFiles, setPendingImageFiles] = useState<File[]>([]);");
    expect(creationComposerSource).toContain("pendingImageFiles: File[];");
    expect(creationComposerSource).toContain("setPendingImageFiles: Dispatch<SetStateAction<File[]>>;");
    expect(creationComposerSource).not.toContain("useState<File[]>([])");
    expect(creationComposerSource).not.toContain("setImportText(productDraftToComposerText(productFactsToDraft(selectedProduct)))");
    expect(creationComposerSource).not.toContain("选择已有商品");
    expect(creationComposerSource).not.toContain('label="商品来源"');
    expect(creationComposerSource).not.toContain("商品资料完整，可进入视频预检");
    expect(creationComposerSource).not.toContain("referenceReadiness(actionProduct)");
    expect(creationComposerSource).not.toContain("参考图 5 张 · 可生成视频");
    expect(creationComposerSource).toContain('tVideo("facts.title")');
    expect(creationComposerSource).toContain('tVideo("reference.add")');
    expect(creationComposerSource).toContain("onPreviewReferenceImage");
    expect(creationComposerSource).toContain("onDeleteReferenceImage");
    expect(creationComposerSource).toContain("onReorderReferenceImage");
    expect(appSource).toContain("/reference-images/order");
    expect(creationComposerSource).not.toContain("aria-disabled={!product}");
    expect(creationComposerSource).not.toContain('tVideo("reference.generateDisabledToast")');
    expect(creationComposerSource).toContain('tVideo("facts.organize")');
    expect(creationComposerSource).toContain('isPacking ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Package size={13} />');
    expect(creationComposerSource).toContain('{isPacking ? tVideo("facts.organizing") : tVideo("facts.organize")}');
    expect(creationComposerSource).toContain("productAutoSaveStatus");
    expect(creationComposerSource).toContain("localizedProductAutoSaveStatusLabel(productAutoSaveStatus, tVideo)");
    expect(productWorkflowSource).toContain('export type ProductAutoSaveStatus = "idle" | "dirty" | "saving" | "saved" | "failed";');
    expect(appSource).toContain("const productAutoSaveTimerRef = useRef<number | undefined>(undefined);");
    expect(appSource).toContain("async function autoSaveProductFacts");
    expect(appSource).toContain("async function flushProductFactsAutoSave");
    expect(appSource).toContain("scheduleProductFactsAutoSave");
    expect(appSource).toContain('productComposerSourceRef.current !== "structured"');
    expect(appSource).toContain("onFlushProductFactsAutoSave={flushProductFactsAutoSave}");
    expect(creationComposerSource).toContain("onFlushProductFactsAutoSave");
    expect(creationComposerSource).toContain("await onFlushProductFactsAutoSave()");
    expect(creationComposerSource).toContain("const compiledVideoPrompt = compileProductPrompt({");
    expect(creationComposerSource).toContain("storyboardLines: splitDraftLines(compiledVideoPrompt.prompt)");
    expect(creationComposerSource).toContain("const selectedReferenceImages = selectedCreationReferenceImagesForProduct(savedProduct) ?? [];");
    expect(creationComposerSource).toContain("referenceImages: selectedReferenceImages,");
    expect(storyboardPanelSource).toContain('promptPreviewActionLoading ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Eye size={13} />');
    expect(storyboardPanelSource).toContain("promptPreviewActionLabel");
    expect(storyboardPanelSource).toContain('tVideo("storyboard.generate")');
    expect(storyboardPanelSource).not.toContain('"预览模型提示词"');
    expect(productDetailsSource).toContain("product-facts-header");
    expect(productDetailsSource).toContain("product-facts-action");
    expect(productDetailsSource.indexOf("product-facts-action")).toBeLessThan(productDetailsSource.indexOf("product-facts-editor"));
    expect(productDetailsSource).not.toContain("sm:grid-cols-[minmax(0,1fr)_auto]");
    expect(storyboardPanelSource).toContain("storyboard-title-row");
    expect(storyboardPanelSource).toContain("storyboard-title-action");
    expect(storyboardPanelSource).toContain("prompt-composer-footer grid min-h-12");
    expect(storyboardPanelSource).toContain("grid-cols-[auto_minmax(0,1fr)_minmax(176px,240px)]");
    expect(storyboardPanelSource).toContain("h-10 min-h-10");
    expect(storyboardPanelSource).toContain("whitespace-nowrap");
    expect(storyboardPanelSource).toContain("prompt-composer-mode-slot");
    expect(storyboardPanelSource).toContain("prompt-composer-settings-slot");
    expect(storyboardPanelSource).toContain("prompt-composer-primary-action-slot");
    expect(storyboardPanelSource).not.toContain("storyboard-title-history");
    expect(modeSwitchSource).toContain("product-creative-mode-switch flex h-10 shrink-0 items-center gap-1.5");
    expect(storyboardPanelSource).toContain("prompt-composer-settings-slot flex min-w-0 flex-nowrap items-center gap-1.5 overflow-visible");
    expect(storyboardPanelSource).toContain("min-w-[176px] max-w-[240px]");
    expect(storyboardPanelSource).not.toContain('Badge className="min-h-5 shrink-0 px-1.5 text-[10px]"');
    expect(storyboardPanelSource).toContain("active-model-control");
    expect(creationComposerSource).not.toContain("localizedCompactModelSchemeChoiceLabel");
    expect(creationComposerSource).toContain("formatActiveLabel={(option) => localizedTemplateLabel(option, tVideo)}");
    expect(creationComposerSource).toContain("formatActiveLabel={(option) => compactFinalLanguageLabel(option, tVideo)}");
    expect(creationComposerSource).toContain('`${option} 个`');
    expect(storyboardPanelSource.indexOf("storyboard-title-action")).toBeLessThan(storyboardPanelSource.indexOf("storyboard-history-dropdown"));
    const storyboardFooterSource = storyboardPanelSource.slice(storyboardPanelSource.indexOf("prompt-composer-footer"));
    expect(storyboardFooterSource).not.toContain('tVideo("storyboard.generate")');
    expect(storyboardFooterSource).not.toContain("<ActionButtonCost tVideo={tVideo} estimate={estimate} />");
    expect(creationComposerSource).toContain("placeholder={promptPlaceholder}");
    expect(creationComposerSource).not.toContain("整理资料并生成视频");
    expect(creationComposerSource).toContain('label={tVideo("controls.creativeStyle")}');
    expect(creationComposerSource).toContain('label={tVideo("controls.duration")}');
    expect(creationComposerSource).toContain('label={tVideo("controls.finalLanguage")}');
    expect(creationComposerSource).not.toContain('label={tVideo("controls.modelScheme")}');
    expect(creationComposerSource).not.toContain('label="生成模型"');
    expect(creationComposerSource).toContain("CompactChoiceDropdown");
    expect(appSource).toContain('from "./productComposerText.js"');
    expect(creationComposerSource).toContain("handleGenerateVideo");
    expect(creationComposerSource).toContain("await onGenerateVideo(productActionSummary(savedProduct), {");
    expect(creationComposerSource).toContain('provider: "volcengine-seedance"');
    expect(creationComposerSource).toContain("providerModelConfigId: effectiveSelectedVideoModelConfigId");
    expect(creationComposerSource).not.toContain("provider: videoModelConfig.provider");
    expect(creationComposerSource).not.toContain("providerModel: videoModelConfig.model");
    expect(creationComposerSource).not.toContain("confirmPaid: videoModelConfig.confirmPaid");
    expect(creationComposerSource).toContain("DeleteCreativeVersionDialog");
    expect(creationComposerSource).toContain("imagePromptReferenceIndex");
    expect(creationComposerSource).toContain("selectedImagePromptReference");
    expect(creationComposerSource).toContain("previewReferenceImages");
    expect(creationComposerSource).not.toContain("InlineProductFactsFields");
    expect(creationComposerSource).not.toContain('Field label="标题"');
    expect(creationComposerSource).not.toContain("<Select");
    expect(creationComposerSource).not.toContain("AI 视频");
    expect(creationComposerSource).not.toContain("AI 图片");
    expect(creationComposerSource).not.toContain("lg:grid-cols-[minmax(220px,.34fr)_minmax(0,1fr)]");
    expect(creationComposerSource).not.toContain("上一步");
    expect(creationComposerSource).not.toContain("下一步");
    expect(productLibraryColumnSource).toContain('tVideo("productLibrary.title")');
    expect(productLibraryColumnSource).toContain("video-product-library-column");
    expect(productLibraryColumnSource).toContain("min-h-[68px]");
    expect(productLibraryColumnSource).not.toContain("已保存商品");
    expect(productLibraryColumnSource).not.toContain("直接填写新商品资料");
    expect(productLibraryColumnSource).not.toContain('aria-haspopup="listbox"');
    expect(productLibraryColumnSource).not.toContain('role="listbox"');
    expect(productLibraryColumnSource).not.toContain("handleProductPickerSelect");
    expect(productLibraryColumnSource).toContain('tVideo("newProduct.title")');
    expect(productLibraryColumnSource).toContain("dedupeProductSummaries(products)");
    expect(productLibraryColumnSource).toContain("draftTitle");
    expect(productLibraryColumnSource).toContain('const draftProductTitle = draftTitle?.trim() ?? "";');
    expect(productLibraryColumnSource).toContain("productLibrarySearchQuery");
    expect(productLibraryColumnSource).toContain("filterProductLibraryProducts(productOptions, productLibrarySearchQuery");
    expect(productLibraryColumnSource).toContain("product-library-search");
    expect(productLibraryColumnSource).toContain('aria-label={tVideo("productLibrary.search")}');
    expect(productLibraryColumnSource).toContain('placeholder={tVideo("productLibrary.search")}');
    expect(productLibraryColumnSource).not.toContain("搜索商品 / SKU");
    expect(productLibraryColumnSource).toContain("product-library-scroll min-h-0 overflow-y-auto");
    expect(productLibraryColumnSource).toContain("filteredProductOptions.map");
    expect(productLibraryColumnSource).toContain('tVideo("productLibrary.noMatches")');
    expect(productLibraryColumnSource).toContain('tVideo("productLibrary.clearSearch")');
    expect(productLibraryColumnSource).not.toContain("手动填写或粘贴商品资料");
    expect(productLibraryColumnSource).not.toContain("+ 新建商品");
    const referenceThumbnailSource = appSource.slice(appSource.indexOf("function ReferenceImageThumbnail"), appSource.indexOf("function ReferenceImageFigure"));
    const referenceFigureSource = appSource.slice(appSource.indexOf("function ReferenceImageFigure"), appSource.indexOf("function ReferenceImagePreviewDialog"));
    const referencePreviewSource = appSource.slice(appSource.indexOf("function ReferenceImagePreviewDialog"), appSource.indexOf("function ProductEntryModeButton"));
    expect(referenceThumbnailSource).toContain("image-reference-thumbnail");
    expect(referenceThumbnailSource).toContain("image-prompt-reference-thumb");
    expect(referenceThumbnailSource).toContain("singleClickTimerRef");
    expect(referenceThumbnailSource).toContain("onClick={handleClick}");
    expect(referenceThumbnailSource).toContain("onDoubleClick={handleDoubleClick}");
    expect(referenceThumbnailSource).toContain("window.setTimeout(onSelect");
    expect(referenceThumbnailSource).toContain("window.clearTimeout(singleClickTimerRef.current)");
    expect(referenceThumbnailSource).toContain("image-prompt-reference-remove");
    expect(referenceThumbnailSource).toContain("function ReferenceImageRemoveButton");
    expect(referenceThumbnailSource).toContain("<X size={11} strokeWidth={2.4} />");
    expect(referenceFigureSource).not.toContain("reference-image-actions");
    expect(referenceFigureSource).toContain("draggable");
    expect(referenceFigureSource).toContain('tVideo("reference.reorderTitle")');
    expect(referenceFigureSource).toContain("onReorder");
    expect(referenceFigureSource).toContain("grid h-[74px] w-[176px] shrink-0");
    expect(referenceFigureSource).toContain("grid-cols-[64px_minmax(0,1fr)_28px]");
    expect(referenceFigureSource).toContain("<ReferenceImageThumbnail");
    expect(referenceFigureSource).toContain("onSelect={onSelect}");
    expect(referenceFigureSource).toContain("onPreview={onPreview}");
    expect(referenceFigureSource).toContain("<ReferenceImageRemoveButton");
    expect(referenceFigureSource).toContain("className=\"right-2 top-1/2 -translate-y-1/2\"");
    expect(referenceFigureSource).not.toContain('title={tVideo("reference.selectPromptTarget")}');
    expect(referenceFigureSource).not.toContain("grid-cols-[72px_minmax(0,1fr)_auto]");
    expect(referenceFigureSource).toContain('title={tVideo("reference.delete")}');
    expect(referenceFigureSource).not.toContain("canDelete");
    expect(appSource).not.toContain("canDelete={images.length > 0}");
    expect(referencePreviewSource).toContain("onPrevious");
    expect(referencePreviewSource).toContain("onNext");
    expect(referencePreviewSource).toContain("touchStartXRef");
    expect(referencePreviewSource).toContain("ArrowLeft");
    expect(referencePreviewSource).toContain("ArrowRight");
    expect(storyboardPanelSource).toContain('tVideo("storyboard.title")');
    expect(storyboardPanelSource).toContain('tVideo("storyboard.placeholder")');
    expect(storyboardPanelSource).not.toContain("<Badge>{localizedTemplateLabel(template, tVideo)}</Badge>");
    expect(storyboardPanelSource).not.toContain("<Badge>{formatDuration(duration)}</Badge>");
    expect(storyboardPanelSource).not.toContain('label="视频分镜"');
    expect(storyboardPanelSource).toContain("grid min-h-[300px] grid-rows-[auto_minmax(0,1fr)]");
    expect(storyboardPanelSource).toContain("storyboard-prompt-shell grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]");
    expect(storyboardPanelSource).toContain("storyboard-prompt-media-row flex min-h-[82px]");
    expect(storyboardPanelSource).toContain("storyboard-prompt-textarea h-full min-h-[220px] resize-none");
    expect(storyboardPanelSource).toContain("storyboard-history-dropdown relative");
    expect(storyboardPanelSource).toContain("prompt-composer-footer grid min-h-12");
    expect(storyboardPanelSource).not.toContain("pb-12 pt-[96px]");
    expect(storyboardPanelSource).toContain("flex-nowrap items-center gap-1.5 overflow-visible");
    expect(storyboardPanelSource).toContain("<ProductCreativeSettingsTray");
    expect(settingsTraySource).toContain("prompt-inline-settings");
    expect(settingsTraySource).toContain("overflow-visible");
    expect(storyboardPanelSource).toContain('menuPlacement="top"');
    expect(storyboardPanelSource).toContain('menuWidth="content"');
    expect(storyboardPanelSource).not.toContain("absolute bottom-20 left-3 right-3");
    expect(storyboardPanelSource).not.toContain("{hint ? (");
    expect(storyboardPanelSource).not.toContain("min-h-5 truncate text-xs font-bold text-[var(--accent)]");
    expect(storyboardPanelSource).toContain('tVideo("storyboard.generate")');
    expect(storyboardPanelSource).not.toContain('tVideo("storyboard.history")');
    expect(storyboardPanelSource).toContain("storyboard-history-dropdown");
    expect(storyboardPanelSource).not.toContain("onDeleteStoryboardHistory");
    expect(storyboardPanelSource).not.toContain("onApplyStoryboardHistory(record)");
    expect(storyboardPanelSource).not.toContain("onDeleteStoryboardHistory(record.id)");
    expect(storyboardPanelSource).not.toContain('tVideo("storyboard.deleteRecord")');
    expect(storyboardPanelSource).not.toContain("回填");
    expect(storyboardPanelSource).not.toContain("补充要点");
    expect(storyboardPanelSource).not.toContain("可补充镜头重点、禁用表达、旁白方向。");
    expect(storyboardPanelSource).not.toContain("scriptDraft");
    expect(storyboardPanelSource).not.toContain("onScriptDraftChange");
    expect(storyboardPanelSource).not.toContain("正在请求文本模型");
    expect(storyboardPanelSource).not.toContain("通常需要 10-30 秒");
    expect(storyboardPanelSource).not.toContain("请先填写商品资料。");
    expect(storyboardPanelSource).not.toContain("请先整理并保存资料包。");
    expect(storyboardPanelSource).not.toContain("时间线");
    expect(storyboardPanelSource).not.toContain("镜头脚本");
    expect(storyboardPanelSource).not.toContain("画面/旁白要点");
    expect(videoHistorySource).toContain('tVideo("history.title")');
    expect(videoHistorySource).toContain('tVideo("history.subtitle")');
    expect(videoHistorySource).toContain("generation-history-scroll");
    expect(videoHistorySource).toContain("max-h-[360px]");
    expect(videoHistorySource).toContain("overflow-y-auto");
    expect(videoHistorySource).toContain("localizedVideoLabel(index, tVideo)");
    expect(videoHistorySource).toContain("hasPlayableVideo(job)");
    expect(videoHistorySource).toContain("localizedCreativeVersionLifecycleHint(job, tVideo, appLocale)");
    expect(videoDisplayViewModelSource).toContain("export function creativeVersionLifecycleHint");
    expect(appSource).not.toContain("function creativeVersionLifecycleHint");
    expect(videoHistorySource).not.toContain("playableVideo ? videoExpiryLabel(job) : creativeVersionDisplayStatus(job)");
    expect(videoDisplayViewModelSource).toContain('appText("videoStudio.videoStatus.failed", locale)');
    expect(videoDisplayViewModelSource).toContain("formatDeletionTime");
    expect(videoDisplayViewModelSource).toContain('appText("videoStudio.history.deleteAt"');
    expect(videoDisplayViewModelSource).toContain("export function formatAbsoluteMinuteTime");
    expect(appSource).not.toContain('return "刚刚"');
    expect(videoHistorySource).toContain("const failureReason = creativeVersionFailureReason(job, appLocale);");
    expect(videoHistorySource).toContain("{[...metaParts, failureReason ? \"\" : lifecycleLabel].filter(Boolean).join(\" · \")}");
    expect(videoHistorySource).toContain("<AlertTriangle");
    expect(videoHistorySource).toContain("<span>{failureReason}</span>");
    expect(appSource).toContain("function creativeVersionMetaParts");
    expect(formatCreativeVersionTimeSource).toContain('job.status !== "completed" && job.status !== "succeeded" && !hasPlayableVideo(job)');
    expect(formatCreativeVersionTimeSource).toContain("job.completedAt ?? job.createdAt");
    expect(formatCreativeVersionTimeSource).not.toContain('"刚刚"');
    expect(formatDeletionTimeSource).toContain("formatAbsoluteMinuteTime(value");
    expect(formatDeletionTimeSource).not.toContain("今天");
    expect(formatDeletionTimeSource).not.toContain("明天");
    expect(appSource).not.toContain("剩余 ${remainingHours} 小时");
    expect(videoHistorySource).toContain('tVideo("history.preview")');
    expect(videoHistorySource).toContain('tVideo("history.download")');
    expect(videoHistorySource).toContain("download={videoDownloadFileName(job, productDownloadContext)}");
    expect(videoHistorySource).not.toContain("设为最终");
    expect(videoHistorySource).not.toContain("已设最终");
    expect(appSource).not.toContain("selectFinalVersion");
    expect(appSource).not.toContain("已选择最终版本");
    expect(videoHistorySource).toContain('tVideo("history.delete")');
    expect(videoHistorySource).toContain("onDelete(job)");
    expect(buildLatestCreativeJobsSource).toContain("new Set(productVideoJobs.map((job) => job.id))");
    expect(buildLatestCreativeJobsSource).not.toContain("new Set(matchingVideoJobs.map((job) => job.id))");
    expect(appSource).toContain('tApp("commonActions.confirmDelete")');
    expect(appSource).toContain('tVideo("deleteDialog.ledgerDescription")');
    expect(appSource).toContain("async function organizeProductPackage");
    expect(appSource).toContain("function startNewVideoProduct");
    expect(appSource).toContain("productImportText.trim()");
    expect(appSource).toContain('"/api/products/import-ai-preview"');
    expect(appSource).toContain('postJson<{ product: ProductDetail }>("/api/products"');
    expect(appSource).toContain("setProductDraft(productFactsToDraft(response.product))");
    expect(appSource).toContain("uploadPendingImages(savedProduct)");
    expect(appSource).toContain("onUploadImages(product.sku, pendingImageFiles)");
    const organizeProductPackageWrapperSource = appSource.slice(
      appSource.indexOf("async function handleOrganizeProductPackage"),
      appSource.indexOf("async function handleGenerateVideo")
    );
    expect(organizeProductPackageWrapperSource).not.toContain("请先填写商品资料，或选择一个已有商品。");
    expect(appSource).toContain("detectCompletedVideoJobTransitions");
    expect(appSource).toContain("refreshSelectedProductForStudio");
    expect(appSource).toContain("restoreProductStudioSku(productsResponse.products, currentStudioSku)");
    expect(appSource).toContain('tAppGlobal("status.studioAutoRefreshTitle")');
    expect(appSource).toContain("selectedProductGroup");
    expect(appSource).toContain("/video-jobs");
    expect(appSource).toContain("/storyboards");
    expect(appSource).toContain("queueProductVideoJobs");
    expect(queueProductVideoJobsSource).toContain("ensureVideoModelConfigured()");
    expect(queueProductVideoJobsSource).toContain("mergeVideoJobs(response.jobs, current)");
    expect(queueProductVideoJobsSource).not.toContain("scriptLines: splitDraftLines(studioScriptDraft)");
    expect(queueProductVideoJobsSource).toContain("storyboardLines: videoGenerationOptions.storyboardLines ?? splitDraftLines(studioStoryboardDraft)");
    expect(queueProductVideoJobsSource).toContain("throw new Error");
    expect(queueProductVideoJobsSource).not.toContain('setActiveSection("video")');
    expect(queueProductVideoJobsSource).not.toContain("个验证版本");
    expect(appSource).toContain("StoryboardHistoryRecord");
    expect(appSource).toContain("pushStoryboardHistory");
    expect(appSource).toContain("loadProductStoryboards");
    expect(appSource).not.toContain("STORYBOARD_HISTORY_STORAGE_KEY");
    expect(appSource).not.toContain("haitu.storyboardHistory.v1");
    expect(appSource).not.toContain("loadStoryboardHistory");
    expect(appSource).not.toContain("saveStoryboardHistory");
    expect(appSource).toContain("clientLocaleStorageKey");
    expect(appSource).not.toContain('window.localStorage.setItem("haitu.storyboardHistory.v1"');
    expect(appSource).not.toContain("haitu.productStudio.productSku.v1");
    expect(appSource).not.toContain("const selectedProductStoryboardHistory = selectedProduct");
    expect(appSource).not.toContain("record.productSku === selectedProduct.sku");
    expect(appSource).toContain("setTemplate(record.style)");
    expect(appSource).toContain("setDuration(record.duration)");
    expect(appSource).toContain('setStudioScriptDraft("");');
    expect(appSource).not.toContain("setStudioStoryboardDraft(localizedDefaultStoryboardDraft(nextTemplate, duration, appLocale))");
    expect(appSource).not.toContain("setStudioScriptDraft(defaultStudioScriptDraft(selectedProduct, duration, template));");
    expect(appSource).not.toContain("setStudioStoryboardDraft(defaultStudioStoryboardDraft(selectedProduct, duration, template));");
    expect(appSource).not.toContain("ProductFactSummaryStrip");
    expect(appSource).not.toContain("ProductNarrativeList");
    expect(appSource).not.toContain("ProductSceneTags");
    expect(appSource).not.toContain("ProductRiskList");
    expect(appSource).not.toContain("product-reference-strip");
    expect(appSource).not.toContain("最近版本");
    expect(appSource).not.toContain("生成版本");
    expect(appSource).not.toContain("发布素材");
    expect(appSource).not.toContain("审核发布");
    expect(appSource).toContain("onGenerateVideo");
    expect(staticConsoleHtml).toContain("API 管理");
    expect(staticConsoleHtml).not.toContain('value="mock"');
    expect(staticConsoleHtml).not.toContain("mock 免费");
    expect(staticConsoleHtml).not.toContain("发布素材");
    expect(staticConsoleHtml).not.toContain("审核发布");
    expect(staticConsoleHtml).not.toContain("品牌设置");
    expect(staticConsoleHtml).not.toContain("发布包");
    expect(staticConsoleJs).not.toContain("mock 免费");
    expect(staticConsoleJs).not.toContain("本地 mock");
    expect(staticConsoleJs).not.toContain("本地模拟");
    expect(staticConsoleJs).not.toContain(">mock<");
    expect(staticConsoleJs).not.toContain("设为最终");
    expect(staticConsoleJs).not.toContain("已选");
    expect(staticConsoleJs).not.toContain("data-select-final");
    expect(staticConsoleJs).not.toContain("发布素材");
    expect(staticConsoleJs).not.toContain("审核发布");
    expect(staticConsoleJs).not.toContain("品牌设置");
    expect(staticConsoleJs).not.toContain("发布包");
    expect(appSource).toContain('tLedger("jobs.cancelQueued")');
    expect(appSource).toContain("/retry");
    expect(appSource).toContain("/recover-download");
    expect(appSource).toContain('tLedger("jobs.retry")');
    expect(appSource).toContain('tLedger("jobs.redownload")');
    expect(appSource).toContain("retryVideoJob");
    expect(appSource).toContain("recoverVideoJobDownload");
    expect(retryVideoJobSource).toContain("mergeVideoJobs([response.job], current)");
    expect(retryVideoJobSource).not.toContain("await refreshConsole()");
    expect(recoverVideoJobDownloadSource).toContain("mergeVideoJobs([response.job], current)");
    expect(recoverVideoJobDownloadSource).not.toContain("confirmPaid");
    expect(appSource).toContain('tApp("status.retryDetail")');
    expect(appSource).toContain("videoDownloadFileName(job, videoJobDownloadProductContext(job, products))");
    expect(appSource).toContain('tLedger("jobs.result")');
    expect(appSource).toContain('tLedger("jobs.openVideo")');
    expect(appSource).toContain('tLedger("jobs.downloadVideo")');
    expect(appSource).toContain('tLedger("jobs.openReport")');
    expect(videoDisplayViewModelSource).toContain('appText("ledger.jobs.resultHints.failed", locale)');
    const videoJobsPanelSource = appSource.slice(appSource.indexOf("function VideoJobsPanel"), appSource.indexOf("function AuditLogPanel"));
    expect(videoJobsPanelSource).toContain("xl:grid-cols-[minmax(210px,1.05fr)_minmax(180px,.9fr)_minmax(240px,1.05fr)_minmax(260px,1.05fr)]");
    expect(videoJobsPanelSource).not.toContain("_auto");
    expect(appSource).toContain("estimatedCostCny");
    expect(appSource).toContain('tDashboard("provider.title")');
    expect(appSource).toContain('tDashboard("trend.title")');
    expect(appSource).toContain('tDashboard("recent.title")');
    expect(consoleApiClientSource).toContain("/api/qc-summary");
    expect(appSource).toContain('tAppGlobal("status.qc.fail")');
    expect(appSource).toContain("qcTone");
    expect(appSource).toContain('tLedger("providerUsage.title")');
    expect(appSource).toContain("/api/provider-tasks?");
    const ledgerCase = appSource.slice(appSource.indexOf('case "ledger"'), appSource.indexOf('case "settings"'));
    expect(ledgerCase).toContain("<VideoJobsPanel");
    expect(ledgerCase).not.toContain("<ProviderUsagePanel");
    expect(ledgerCase).not.toContain("<FeeSummaryPanel");
    expect(ledgerCase).not.toContain("<ReportsPanel");
    expect(ledgerCase).not.toContain("<PublishPackagesPanel");
    expect(ledgerCase).not.toContain("<StorageBackupPanel");
    expect(ledgerCase).not.toContain("<AuditLogPanel");
    expect(ledgerCase).toContain("<VideoAssetsPanel");
    expect(ledgerCase).not.toContain("<ProviderTaskPanel");
    expect(ledgerCase).not.toContain("<InternalValidationPanel");
    const dashboardCase = appSource.slice(appSource.indexOf('case "dashboard"'), appSource.indexOf('case "video"'));
    expect(dashboardCase).toContain('aria-label={tApp("dashboard.ariaLabel")}');
    expect(appSource).toContain('{ id: "dashboard", labelKey: "dashboard"');
    expect(appSource.indexOf("dashboardNavItems")).toBeLessThan(appSource.indexOf("primaryNavItems"));
    expect(appSource).not.toContain("运营概览");
    const feeSummaryPanelSource = appSource.slice(appSource.indexOf("function FeeSummaryPanel"), appSource.indexOf("function ReportsPanel"));
    expect(feeSummaryPanelSource).toContain('tLedger("fees.title")');
    expect(feeSummaryPanelSource).toContain('tLedger("fees.byProduct")');
    ["复用 raw", "取消 queued", "生成报告"].forEach((label) => {
      expect(feeSummaryPanelSource).not.toContain(label);
    });
    expect(videoCase).not.toContain("<ReportsPanel");
    expect(videoCase).not.toContain("<StorageBackupPanel");
    expect(videoCase).not.toContain("<AuditLogPanel");
    expect(videoCase).not.toContain("<VideoAssetsPanel");
    expect(consoleApiClientSource).toContain("/api/storage-backup");
    expect(consoleApiClientSource).toContain("/api/backups");
    expect(appSource).toContain("StorageBackupPanel");
    expect(appSource).toContain('tLedger("storage.title")');
    expect(appSource).toContain('tLedger("storage.longTerm")');
    expect(appSource).toContain('tLedger("storage.backupCommand")');
    expect(appSource).toContain('tLedger("storage.createBackup")');
    expect(appSource).toContain('tLedger("storage.downloadBackup")');
    expect(consoleApiClientSource).toContain("/api/audit-log");
    expect(appSource).toContain("AuditLogPanel");
    expect(appSource).toContain('tLedger("audit.title")');
    expect(appSource).toContain('tLedger("audit.latestAction")');
    expect(consoleApiClientSource).toContain("/api/video-assets");
    expect(appSource).toContain("VideoAssetsPanel");
    expect(appSource).toContain("formatBytes");
    expect(appSource).toContain('tLedger("assets.title")');
    expect(appSource).toContain("deleteVideoAsset");
    expect(appSource).toContain('tLedger("assets.deleteFile")');
    expect(appSource).not.toContain("/api/reviews/rate-version");
    expect(appSource).not.toContain("ProductGroupsPanel");
    expect(appSource).not.toContain("PublishPackagesPanel");
    expect(appSource).not.toContain("批量生成发布素材");
    expect(appSource).not.toContain("createPublishPackagesBatch");
    expect(appSource).not.toContain("PublishPackageFileStatus");
    expect(appSource).not.toContain("/api/publish-packages/batch");
    expect(appSource).not.toContain("导出素材表");
    expect(appSource).not.toContain("/api/publish-packages/export.csv");
    expect(appSource).not.toContain("haitu-publish-packages.csv");
    expect(appSource).toContain('tLedger("jobs.template")');
    expect(appSource).not.toContain("/api/templates");
    expect(appSource).not.toContain("TemplateManagementPanel");
    expect(appSource).not.toContain("启用风格");
    expect(appSource).not.toContain("设为默认");
    const settingsCase = appSource.slice(appSource.indexOf('case "settings"'), appSource.indexOf("if (authSession.authEnabled"));
    const walletCase = appSource.slice(appSource.indexOf('case "wallet"'), appSource.indexOf('case "pricing"'));
    expect(settingsCase).not.toContain("<TemplateManagementPanel");
    expect(settingsCase).toContain("<ApiModelConfigPanel");
    expect(settingsCase).not.toContain("wallet={wallet}");
    expect(settingsCase).not.toContain("onTopUpWallet");
    expect(walletCase).toContain("<WalletRechargePanel");
    expect(walletCase).toContain("wallet={wallet}");
    expect(walletCase).toContain("onRequestRecharge={openRechargeDialog}");
    expect(walletCase).not.toContain("<WalletTransactionsPanel");
    expect(walletCase).not.toContain('tApp("transactions.ariaLabel")');
    expect(walletCase).not.toContain("onTopUpWallet={topUpWallet}");
    expect(consoleApiClientSource).toContain("/api/payment-methods");
    expect(appSource).toContain("paymentMethodsResponse");
    expect(appSource).toContain("setPaymentMethods(paymentMethodsResponse.methods)");
    expect(appSource).toContain("PaymentMethodDialog");
    expect(appSource).toContain("pendingRechargeAmountCny");
    expect(appSource).toContain('tPayment("title")');
    expect(appSource).toContain('tPayment("rmb")');
    expect(appSource).toContain('tPayment("crypto")');
    expect(appSource).toContain('if (id === "infini") return "Infini";');
    expect(appSource).toContain("selectedPaymentKind");
    expect(appSource).toContain("payment-kind-card-grid");
    expect(appSource).toContain("payment-kind-card");
    expect(appSource).toContain("payment-kind-card-heading-icon");
    expect(appSource).not.toContain('className="grid grid-cols-2 rounded-[10px] border border-[var(--border)] bg-[var(--field)] p-1 text-xs font-black"');
    expect(appSource).not.toContain("继续支付");
    expect(appSource).toContain('tPayment("pay")');
    expect(appSource).toContain('tPayment("processing")');
    expect(appSource).toContain("animate-spin");
    expect(appSource).toContain("fixed right-5 top-[86px] z-[100]");
    expect(appSource).not.toContain("fixed right-5 top-[86px] z-[70]");
    expect(appSource).toContain("recharge-transaction-type-badge");
    expect(appSource).toContain("wallet-consumption-transaction-table");
    expect(appSource).toContain("wallet-consumption-transaction-table overflow-hidden");
    expect(appSource).toContain("w-full table-fixed");
    expect(appSource).not.toContain("w-full min-w-[1040px] table-fixed");
    expect(appSource).toContain("<colgroup>");
    expect(appSource).not.toContain("disabled={cryptoMethods.length === 0}");
    expect(appSource).not.toContain("disabled={rmbMethods.length === 0}");
    expect(appSource).toContain("Stripe");
    expect(appSource).toContain("continueWalletRecharge");
    expect(settingsCase).not.toContain("<SettingsPanel");
    const apiManagementSource = await readFile(join(process.cwd(), "src", "client", "components", "apiModelConfigPanel.tsx"), "utf8");
    const sharedModelConfigSource = await readFile(join(process.cwd(), "src", "client", "components", "modelServiceConfig.tsx"), "utf8");
    expect(apiManagementSource).toContain("API Key");
    expect(appSource).not.toContain("这里配置的是你自己的模型 API Key");
    expect(appSource).not.toContain("系统会按你的配置调用文本、图片和视频模型");
    expect(apiManagementSource).not.toContain("这里配置的是平台自己的模型 API Key");
    expect(apiManagementSource).not.toContain("不要让普通用户在这里填写他们自己的密钥");
    expect(apiManagementSource).not.toContain("HAITU_DATA_DIR");
    expect(apiManagementSource).not.toContain("环境变量");
    expect(appSource).toContain('tApp("status.apiKeyCleared")');
    expect(apiManagementSource).toContain('tSettings("groups.text.title")');
    expect(apiManagementSource).toContain('tSettings("groups.image.title")');
    expect(apiManagementSource).toContain('tSettings("groups.video.title")');
    expect(apiManagementSource).not.toContain("默认生成设置");
    expect(sharedModelConfigSource).toContain("Base URL");
    expect(sharedModelConfigSource).not.toContain("优先级");
    expect(sharedModelConfigSource).not.toContain("draft.priority");
    expect(sharedModelConfigSource).not.toContain('label="优先级"');
    expect(sharedModelConfigSource).toContain('label={<ModelVersionFieldLabel testStatus={testStatus} isTesting={isTesting} />}');
    expect(sharedModelConfigSource).toContain("function ModelVersionFieldLabel");
    expect(sharedModelConfigSource).toContain('type="checkbox"');
    expect(sharedModelConfigSource).toContain('tSettings("serviceDialog.officialModelId")');
    expect(appSource).toContain('tApp("status.modelVersionRequired")');
    expect(sharedModelConfigSource).toContain("models: nextModels");
    expect(appSource).not.toContain("const finalModels = nextModels.length > 0 ? nextModels");
    expect(sharedModelConfigSource).toContain("catalogEntriesForVendor(providerId, draft.vendor)");
    expect(apiManagementSource).not.toContain("模型版本（逗号或换行分隔）");
    expect(apiManagementSource).not.toContain("模型（逗号分隔）");
    expect(sharedModelConfigSource).toContain('tSettings("serviceDialog.endpointPrefix")');
    expect(sharedModelConfigSource).toContain('tSettings("actions.test")');
    expect(sharedModelConfigSource).toContain('tSettings("actions.edit")');
    expect(sharedModelConfigSource).toContain('tSettings("actions.delete")');
    expect(apiManagementSource).toContain('tSettings("configuredCount"');
    expect(sharedModelConfigSource).toContain('tSettings("available"');
    expect(sharedModelConfigSource).toContain('tSettings("default")');
    expect(sharedModelConfigSource).toContain("const configuredModels = models.filter((model) => model.configured);");
    expect(sharedModelConfigSource).toContain("const configuredServices = groupConfiguredModelServices(providerId, configuredModels);");
    expect(sharedModelConfigSource).toContain("configuredServices.length === 0");
    expect(sharedModelConfigSource).toContain('tSettings("emptyServices")');
    expect(sharedModelConfigSource).toContain("{configuredServices.map((service, index) => (");
    expect(sharedModelConfigSource).toContain("{service.serviceLabel}");
    expect(sharedModelConfigSource).toContain('if (!canManageServices && apiOwner === "platform")');
    expect(sharedModelConfigSource).toContain("platformModelNames.map");
    ["Key 来源", "Key 预览", "Token 单价", "估算秒价", "接口地址"].forEach((label) => {
      expect(apiManagementSource).not.toContain(label);
    });
    ["API 模式", "Responses 流式", "Responses 非流式", "Chat Completions 兼容"].forEach((label) => {
      expect(apiManagementSource).not.toContain(label);
    });
    expect(appSource).not.toContain('aria-label="视频风格后台"');
    expect(appSource).not.toContain("风格后台");
    expect(appSource).toContain('tVideo("reference.add")');
    expect(appSource).not.toContain('tVideo("reference.generate")');
    expect(appSource).not.toContain("/api/internal-validation/export.csv");
    expect(appSource).not.toContain("导出审核表");
    expect(appSource).toContain("finalVideoUrl");
    expect(appSource).toContain('method: "DELETE"');
    expect(appSource).toContain("maxEstimatedCostCnyPerVideo");
    expect(appSource).toContain("testCreditBalanceCny");
    expect(appSource).toContain('tPreflight("currentEstimate")');
    expect(appSource).toContain('tPreflight("historyEstimate")');
    expect(appSource).not.toContain("额度状态");
    expect(appSource).not.toContain("请先生成预检并勾选确认允许付费请求");
    expect(appSource).not.toContain("paidRunBlockedReason");
    expect(appSource).toContain('tPreflight("notReadyForPaid")');
    expect(appSource).not.toContain("剩余测试额度不足");
    expect(consoleApiClientSource).toContain("/api/provider-config");
    expect(consoleApiClientSource).toContain("/api/wallet");
    expect(consoleApiClientSource).not.toContain("/api/model-bundles");
    expect(consoleApiClientSource).toContain("/api/model-service-preference");
    expect(apiManagementSource).not.toContain("钱包余额");
    expect(apiManagementSource).not.toContain("充值 ¥50");
    expect(appSource).toContain('tWallet("title")');
    expect(appSource).toContain("WalletRechargePanel");
    expect(appSource).toContain('tWallet("tabs.consumption")');
    expect(appSource).toContain("wallet-balance-hero");
    expect(appSource).toContain("wallet-balance-actions");
    expect(appSource).toContain("wallet-balance-summary");
    expect(appSource).toContain("wallet-recharge-panel");
    expect(appSource).toContain("min-[900px]:border-l");
    expect(appSource).not.toContain('tWallet("availableBadge"');
    expect(appSource).toContain('tWallet("quickRecharge")');
    expect(appSource).toContain("wallet-recharge-options");
    expect(appSource).toContain("lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(170px,1.2fr)]");
    expect(appSource).toContain("wallet-recharge-option");
    expect(appSource).toContain("wallet-custom-recharge-option");
    expect(appSource).toContain("selectedRechargeAmountCny");
    expect(appSource).toContain("setSelectedRechargeAmountCny(amount)");
    expect(appSource).toContain("selectedRechargePaymentAmountCny");
    expect(appSource).toContain("wallet-selected-recharge-pay");
    expect(appSource).toContain('tWallet("pay")');
    expect(appSource).toContain('tWallet("paySelected"');
    expect(appSource).toContain('tWallet("customRecharge.inputAriaLabel")');
    expect(appSource).toContain("customRechargeAmountValid");
    expect(appSource).toContain("normalizeCustomRechargeAmountCny");
    expect(appSource).not.toContain('tWallet("customRecharge.label")');
    expect(appSource).not.toContain('tWallet("customRecharge.submitAriaLabel")');
    expect(appSource).not.toContain("<ChevronRight size={15}");
    expect(appSource).not.toContain('Field className="min-w-[150px] flex-1" label={tWallet("customRecharge.label")}');
    expect(appSource).not.toContain('tWallet("customRecharge.pay")');
    expect(appSource).not.toContain('tWallet("customRecharge.hint")');
    expect(appSource).toContain("wallet-tab-strip");
    expect(appSource).toContain("wallet-recharge-order-table");
    expect(appSource).toContain("wallet-recharge-order-row");
    expect(appSource).toContain('tWallet("orderTable.order")');
    expect(appSource).toContain('tWallet("orderTable.topUpAmount")');
    expect(appSource).not.toContain('tWallet("orderTable.paid")');
    expect(appSource).toContain('tWallet("orderTable.paymentMethod")');
    expect(appSource).toContain('tWallet("orderTable.status")');
    expect(appSource).toContain('tWallet("orderTable.createdAt")');
    expect(appSource).toContain('tWallet("orderTable.action")');
    expect(appSource).toContain("wallet-transaction-empty");
    expect(appSource).toContain("walletRechargeOrders");
    expect(appSource).toContain("WalletRechargeOrderTable");
    expect(appSource).toContain("walletRechargeOrderDisplayCode");
    expect(appSource).toContain("walletRechargeOrderCreditAmountText");
    expect(appSource).toContain("walletRechargeOrderSettlementAmountText");
    expect(appSource).not.toContain("walletRechargeOrderPaymentAmountText");
    expect(appSource).toContain("wallet-recharge-order-settlement");
    expect(appSource).toContain("walletRechargeOrderPaymentMethodView");
    expect(appSource).toContain("walletRechargeOrderEffectiveStatus");
    expect(appSource).toContain("walletRechargeOrderExpiresInText");
    expect(appSource).toContain("window.setInterval(() => setNowTick(Date.now()), 1000)");
    expect(appSource).not.toContain("setNowTick(Date.now()), 30_000");
    expect(appSource).toContain('className="h-8 min-h-8 whitespace-nowrap px-2.5 text-[12px]"');
    expect(appSource).toContain("wallet-recharge-order-countdown");
    expect(appSource).not.toContain("grid justify-items-start gap-1");
    expect(appSource).toContain("rechargeTransactionsByOrderId");
    expect(appSource).toContain("cryptoCurrency");
    expect(appSource).toContain("cryptoNetwork");
    expect(appSource).toContain("cardLast4");
    expect(appSource).toContain('title={order.id}');
    expect(appSource).not.toContain(">{order.id}</div>");
    expect(appSource).not.toContain("showTypeBadge={false}");
    expect(appSource).toContain("walletConsumptionTransactions");
    expect(appSource).toContain("wallet-consumption-transaction-table");
    expect(appSource).toContain("wallet-consumption-transaction-row");
    expect(appSource).toContain("WalletConsumptionTransactionTable");
    expect(appSource).toContain('tWallet("transactionTable.type")');
    expect(appSource).toContain('tWallet("transactionTable.description")');
    expect(appSource).toContain('tWallet("transactionTable.amount")');
    expect(appSource).toContain('tWallet("transactionTable.balance")');
    expect(appSource).toContain('tWallet("transactionTable.createdAt")');
    expect(appSource).toContain('tWallet("transactionTable.action")');
    expect(appSource).not.toContain("min-[900px]:grid-cols-[minmax(340px,1fr)_minmax(360px,520px)]");
    expect(appSource).not.toContain("shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_18%,transparent)]");
    expect(appSource).not.toContain('className="mt-4 flex flex-wrap gap-2 rounded-lg border');
    expect(appSource).not.toContain("WalletTransactionsPanel");
    expect(apiManagementSource).toContain('tSettings("serviceMode.label")');
    expect(apiManagementSource).toContain('tSettings("serviceMode.platform.title")');
    expect(apiManagementSource).toContain('tSettings("serviceMode.byok.title")');
    expect(apiManagementSource).toContain("ModelServiceOwnerPanel");
    expect(apiManagementSource).not.toContain("PlatformModelModePanel");
    expect(apiManagementSource).not.toContain("ByokModelModePanel");
    expect(apiManagementSource).toContain("apiOwner={activeMode}");
    expect(apiManagementSource).toContain("canManageServices={activeMode === \"byok\"}");
    expect(apiManagementSource).toContain("onServiceModeChange");
    expect(appSource).not.toContain("saveByokModelBundle");
    expect(appSource).not.toContain("savePlatformModelBundle");
    expect(appSource).toContain("const apiOwner = modelServicePreference.serviceMode");
    expect(appSource).toContain('const textModelOptions = apiOwner === "platform" ? platformTextModelOptions : byokTextModelOptions');
    expect(appSource).toContain('const imageModelOptions = apiOwner === "platform" ? platformImageModelOptions : byokImageModelOptions');
    expect(appSource).toContain('const videoModelOptions = apiOwner === "platform" ? platformVideoModelOptions : byokVideoModelOptions');
    expect(appSource).not.toContain("selectedSchemeOwner");
    expect(appSource).not.toContain("activeModelSchemeId");
    expect(appSource).not.toContain("schemeSummary");
    const ownerModeSource = apiManagementSource.slice(apiManagementSource.indexOf("function ModelServiceOwnerPanel"), apiManagementSource.indexOf("function ModelConfigCard"));
    expect(ownerModeSource).toContain("ownerModelsForGroup(group.models, apiOwner)");
    expect(ownerModeSource).not.toContain("平台模型组合");
    expect(ownerModeSource).not.toContain("自带 API 服务");
    expect(ownerModeSource).not.toContain("平台密钥只在后台保存，并加密写入数据库");
    expect(ownerModeSource).not.toContain("平台可用服务");
    expect(ownerModeSource).not.toContain("configuredOwnerModels");
    expect(ownerModeSource).toContain("<SharedModelServiceGroup");
    expect(apiManagementSource).not.toContain("ModelBundleSummary");
    expect(apiManagementSource).not.toContain("ByokBundleManager");
    expect(apiManagementSource).not.toContain("平台预设组合");
    expect(apiManagementSource).not.toContain("后台发布平台组合后，这里会显示可用方案。");
    expect(apiManagementSource).not.toContain("还没有模型组合");
    expect(apiManagementSource).not.toContain("保存成组合");
    expect(ownerModeSource).not.toContain("模型自选组合");
    expect(ownerModeSource).not.toContain("保存当前组合");
    expect(apiManagementSource).not.toContain("模型自选组合");
    expect(appSource).toContain("ApiModelConfigPanel");
    expect(apiManagementSource).toContain("API Key");
    expect(sharedModelConfigSource).toContain("showApiKey");
    expect(appSource).toContain("revealModelConfigApiKey");
    expect(sharedModelConfigSource).toContain("storedApiKeyMask");
    expect(sharedModelConfigSource).toContain('tSettings("serviceDialog.apiKeyKeepPlaceholder")');
    expect(sharedModelConfigSource).toContain("const apiKeyInputPlaceholder = isEditingExisting");
    expect(sharedModelConfigSource).toContain("const isShowingStoredApiKey = hasStoredApiKey && !isEditingApiKey && !draft.apiKey;");
    expect(sharedModelConfigSource).toContain("const apiKeyFieldValue = isShowingStoredApiKey");
    expect(sharedModelConfigSource).toContain("setIsEditingApiKey(true)");
    expect(sharedModelConfigSource).toContain("setRevealedApiKey(response)");
    expect(sharedModelConfigSource).toContain('className="relative"');
    expect(sharedModelConfigSource).toContain('"pr-11"');
    expect(sharedModelConfigSource).toContain('className="absolute right-1.5 top-1/2 -translate-y-1/2"');
    expect(appSource).not.toContain("已保存 API Key");
    expect(appSource).not.toContain("showStoredApiKey");
    expect(appSource).not.toContain("showApiKeyInputReveal");
    expect(appSource).not.toContain("apiKeyPlaceholder");
    expect(appSource).not.toContain("const apiKeyDisplayValue = draft.apiKey;");
    expect(appSource).not.toContain("draft.apiKey || storedApiKeyMask");
    expect(appSource).not.toContain("apiKey: response.apiKey");
    expect(sharedModelConfigSource).toContain('aria-label={showApiKey ? tSettings("serviceDialog.hideApiKey") : tSettings("serviceDialog.showApiKey")}');
    expect(sharedModelConfigSource).toContain('{showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}');
    expect(apiManagementSource).toContain("draftFromProviderConfig(providerId, model, models)");
    expect(sharedModelConfigSource).toContain('const serviceModels = "models" in model && Array.isArray(model.models) ? model.models : undefined;');
    expect(sharedModelConfigSource).toContain("const relatedModels = serviceModels && serviceModels.length > 0");
    expect(sharedModelConfigSource).toContain("? serviceModels");
    expect(sharedModelConfigSource).toContain("item.credentialId === model.credentialId");
    expect(sharedModelConfigSource).toContain('tSettings("serviceDialog.nameLabel")');
    expect(appSource).toContain('tLedger(`audit.actions.${action}`)');
    expect(appSource).toContain('`/api/model-configs/${providerId}/test`');
    expect(appSource).toContain("testModelConfig");
    expect(appSource).toContain('tApp("status.testing")');
    expect(appSource).toContain("testStatus");
    expect(sharedModelConfigSource).toContain("{isTesting ? <RefreshCcw className=\"h-4 w-4 animate-spin\" /> : null}");
    expect(sharedModelConfigSource).toContain('{isTesting ? tSettings("actions.testing") : tSettings("actions.test")}');
    expect(sharedModelConfigSource).toContain('tSettings("serviceDialog.modelVersions")');
    expect(sharedModelConfigSource).toContain("inlineStatus.message");
    expect(sharedModelConfigSource).not.toContain("{!isTesting && testStatus ? (");
    expect(appSource).toContain('tApp("status.testSuccess"');
    expect(appSource).toContain('tApp("status.testFailed"');
    expect(appSource).toContain("setModelConfigTestStatus");
    expect(appSource).toContain("productStudioLoadError");
    expect(appSource).toContain("loadError={productStudioLoadError}");
    expect(appSource).toContain("selectedTextModelConfigId");
    expect(appSource).toContain("selectedImageModelConfigId");
    expect(appSource).toContain("selectedVideoModelConfigId");
    expect(appSource).toContain("localizedModelConfigChoiceLabel");
    expect(modelServiceSelectionSource).toContain("export function modelConfigChoiceLabel");
    expect(modelServiceSelectionSource).not.toContain('appText("videoStudio.models.auto"');
    expect(appSource).not.toContain('return tVideo("models.auto")');
    expect(modelServiceSelectionSource).toContain("modelsForOwnerAndCapability");
    expect(modelServiceSelectionSource).not.toContain("buildModelSchemeOptions");
    expect(appSource).toContain("textModelConfigId: effectiveSelectedTextModelConfigId");
    expect(appSource).toContain("imageModelConfigId: effectiveSelectedImageModelConfigId");
    expect(appSource).toContain("async function generateProductReferenceImages(sku: string, options: ProductImageGenerationOptions = {})");
    expect(appSource).toContain("referenceImages: options.referenceImages ?? []");
    expect(appSource).toContain("prompt: options.prompt?.trim() || undefined");
    expect(appSource).toContain("await onGenerateReferenceImages(savedProduct.sku, {");
    expect(appSource).toContain("prompt: imagePrompt,");
    expect(appSource).toContain("referenceImages: selectedCreationReferenceImagesForProduct(savedProduct) ?? []");
    expect(appSource).toContain('const [imagePrompt, setImagePrompt] = useState("");');
    expect(appSource).toContain("StoryboardComposerPanel");
    expect(appSource).not.toContain("ProductImagePromptPanel");
    expect(appSource).not.toContain("product-image-prompt-body");
    expect(appSource).toContain("图片提示词");
    expect(appSource).toContain("ProductCreativeModeSwitch");
    expect(appSource).toContain("const [imagePromptReferences, setImagePromptReferences] = useState<ReferenceImageStatus[]>([]);");
    expect(appSource).toContain("selectedImagePromptReference = imagePromptReferenceIndex === undefined ? undefined : imagePromptReferences[imagePromptReferenceIndex]");
    expect(appSource).toContain("imagePromptReferences={imagePromptReferences}");
    expect(appSource).toContain("imagePromptReferenceIndex={imagePromptReferenceIndex}");
    expect(appSource).toContain("const [previewImagePromptReferenceIndex, setPreviewImagePromptReferenceIndex] = useState<number | undefined>();");
    expect(appSource).toContain("function handleSelectReferenceImage(index: number)");
    expect(appSource).toContain("function handlePreviewReferenceImage(index: number)");
    expect(appSource).toContain("setPreviewReferenceImageIndex(index);");
    expect(appSource).toContain("function handleSelectImagePromptReference(index: number)");
    expect(appSource).toContain("function handlePreviewImagePromptReference(index: number)");
    expect(appSource).toContain("setPreviewImagePromptReferenceIndex(index);");
    expect(appSource).toContain("onImagePromptReferenceSelect={handleSelectImagePromptReference}");
    expect(appSource).toContain("onImagePromptReferencePreview={handlePreviewImagePromptReference}");
    expect(appSource).toContain("async function handleImagePromptReferenceFiles(files: FileList | File[] | null)");
    expect(appSource).toContain("onImagePromptReferenceRemove={handleRemoveImagePromptReference}");
    expect(appSource).toContain("onImagePromptReferenceFilesChange={handleImagePromptReferenceFiles}");
    expect(appSource).toContain("const pasteInsidePrompt = event.target instanceof Node");
    expect(appSource).not.toContain('const pasteInsidePrompt = mode === "image"');
    expect(appSource).toContain("void handleImagePromptReferenceFiles(files);");
    expect(appSource).toContain("onSelectReferenceImage={handleSelectReferenceImage}");
    expect(appSource).toContain("onPreviewReferenceImage={handlePreviewReferenceImage}");
    expect(appSource).toContain("onPendingSelect={handleSelectReferenceImage}");
    expect(appSource).toContain("onPendingPreview={handlePreviewReferenceImage}");
    expect(appSource).toContain("images={imagePromptReferences}");
    expect(appSource).toContain("index={previewImagePromptReferenceIndex}");
    expect(appSource).not.toContain("imagePromptReferences={previewableReferenceImages}");
    expect(appSource).toContain("image-prompt-media-strip");
    expect(appSource).toContain("<ReferenceImageThumbnail");
    expect(appSource).toContain("image-prompt-reference-thumb");
    expect(appSource).toContain("image-prompt-add-tile");
    expect(appSource).not.toContain("image-prompt-target-chip");
    expect(appSource).not.toContain("清除目标图");
    expect(appSource).toContain("active-model-control");
    expect(appSource).toContain("selectedImageModelConfigId={selectedImageModelConfigId}");
    expect(appSource).toContain("onImageModelConfigChange={onImageModelConfigChange}");
    expect(appSource).toContain('const generateImageButtonLabel = "生成图片";');
    expect(appSource).toContain("providerModelConfigId: effectiveSelectedVideoModelConfigId");
    expect(appSource).toContain("textModelOptions");
    expect(appSource).toContain("imageModelOptions");
    expect(appSource).toContain("videoModelOptions");
    expect(appSource).not.toContain('label={tVideo("controls.modelScheme")}');
    expect(apiManagementSource).toContain('title: tSettings("groups.text.title")');
    expect(apiManagementSource).toContain('title: tSettings("groups.image.title")');
    expect(apiManagementSource).toContain('title: tSettings("groups.video.title")');
    expect(appSource).not.toContain('label="生成模型"');
    expect(appSource).not.toContain("InlineProductFactsFields");
    expect(appSource).toContain("ProductComposerReferenceTray");
    expect(appSource).toContain("ProductCreationProductLibrary");
    expect(appSource).not.toContain("ProductCreationProductPicker");
    expect(appSource).not.toContain("ProductFactSummaryStrip");
    expect(appSource).not.toContain("ProductNarrativeList");
    expect(appSource).not.toContain("ProductSceneTags");
    expect(appSource).not.toContain("ProductRiskList");
    expect(appSource).not.toContain("product-reference-strip");
    expect(appSource).not.toContain("默认生成设置");
    expect(appSource).toContain("`/api/model-configs/${providerId}`");
    expect(appSource).toContain("?configId=");
    expect(appSource).toContain('"openai-compatible-text"');
    expect(appSource).toContain('"openai-compatible-image"');
    expect(appSource).toContain('"volcengine-seedance"');
    const modelPresetSource = sharedModelConfigSource.slice(sharedModelConfigSource.indexOf("function modelConfigPresetsForProvider"), sharedModelConfigSource.indexOf("export function defaultModelConfigPreset"));
    expect(modelPresetSource).toContain("catalogVendorsForProvider(providerId)");
    expect(modelPresetSource).toContain("modelConfigDraftFromVendor(providerId, vendor.value)");
    expect(modelPresetSource).not.toContain(".map(modelConfigDraftFromCatalogEntry)");
    const officialPricingCatalogSource = await readFile(join(process.cwd(), "src", "modelPricing", "officialModelPricingCatalog.ts"), "utf8");
    expect(officialPricingCatalogSource).toContain("doubao-seedance-2-0-fast-260128");
    expect(officialPricingCatalogSource).toContain("doubao-seedance-2-0-260128");
    expect(modelPresetSource).not.toContain("doubao-seedance-1-5-pro-251215");
    [
      "ChatFire 推荐-文本",
      "OpenRouter 推荐-文本",
      "ChatFire 推荐-图片",
      "火山推荐-图片",
      "Vidu 推荐-视频",
      "阿里推荐-视频"
    ].forEach((label) => {
      expect(modelPresetSource).not.toContain(label);
    });
    expect(stylesSource).toContain('@import "tailwindcss"');
    expect(viteConfig).toContain("@tailwindcss/vite");
    expect(viteConfig).toContain("manualChunks");
    expect(viteConfig).toContain("vendor-react");
    expect(viteConfig).toContain("vendor-echarts-core");
    expect(viteConfig).toContain("vendor-echarts-line");
    expect(viteConfig).toContain("vendor-echarts-bar");
    expect(viteConfig).toContain("vendor-echarts-pie");
    expect(viteConfig).toContain("vendor-echarts-components");
    expect(viteConfig).toContain("vendor-zrender");
  });

  it("keeps provider configuration lists empty until users save model configs", async () => {
    const previousSeedanceKey = process.env.SEEDANCE_API_KEY;
    const previousArkKey = process.env.ARK_API_KEY;
    const previousBaseUrl = process.env.SEEDANCE_BASE_URL;
    const previousModel = process.env.SEEDANCE_MODEL;
    const previousTokenPrice = process.env.SEEDANCE_TOKEN_PRICE_CNY_PER_MILLION;
    const previousWatermark = process.env.SEEDANCE_WATERMARK;
    process.env.SEEDANCE_API_KEY = "sk-secret-seedance-provider-key-123456";
    delete process.env.ARK_API_KEY;
    process.env.SEEDANCE_BASE_URL = "https://ark.example.test";
    process.env.SEEDANCE_MODEL = "doubao-seedance-test";
    process.env.SEEDANCE_TOKEN_PRICE_CNY_PER_MILLION = "37";
    process.env.SEEDANCE_WATERMARK = "true";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-provider-config-"));
      tempDirs.push(root);
      const server = createConsoleServer({ rootDir: root });

      const response = await server.fetchJson("/api/provider-config");
      const serialized = JSON.stringify(response);

      expect(serialized).not.toContain("sk-secret-seedance-provider-key-123456");
      expect(response.textModels).toEqual([]);
      expect(response.imageModels).toEqual([]);
      expect(response.videoModels).toEqual([]);
      expect(response.providers).toEqual(response.videoModels);
      expect(response.runtime).toEqual({
        textConfigured: false,
        imageConfigured: false,
        videoConfigured: false
      });
    } finally {
      restoreEnv("SEEDANCE_API_KEY", previousSeedanceKey);
      restoreEnv("ARK_API_KEY", previousArkKey);
      restoreEnv("SEEDANCE_BASE_URL", previousBaseUrl);
      restoreEnv("SEEDANCE_MODEL", previousModel);
      restoreEnv("SEEDANCE_TOKEN_PRICE_CNY_PER_MILLION", previousTokenPrice);
      restoreEnv("SEEDANCE_WATERMARK", previousWatermark);
    }
  });

  it("does not show ARK_API_KEY fallback as a deletable video model config", async () => {
    const previousSeedanceKey = process.env.SEEDANCE_API_KEY;
    const previousArkKey = process.env.ARK_API_KEY;
    delete process.env.SEEDANCE_API_KEY;
    process.env.ARK_API_KEY = "ark-secret-provider-key-abcdef";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-provider-config-ark-"));
      tempDirs.push(root);
      const server = createConsoleServer({ rootDir: root });

      const response = await server.fetchJson("/api/provider-config");
      const serialized = JSON.stringify(response);

      expect(serialized).not.toContain("ark-secret-provider-key-abcdef");
      expect(response.videoModels).toEqual([]);
      expect(response.runtime.videoConfigured).toBe(false);
    } finally {
      restoreEnv("SEEDANCE_API_KEY", previousSeedanceKey);
      restoreEnv("ARK_API_KEY", previousArkKey);
    }
  });

  it("does not import platform model keys from legacy environment variables", async () => {
    const previousOpenAiPlatformKey = process.env.HAITU_PLATFORM_OPENAI_API_KEY;
    const previousDeepSeekPlatformKey = process.env.HAITU_PLATFORM_DEEPSEEK_API_KEY;
    const previousVolcenginePlatformKey = process.env.HAITU_PLATFORM_VOLCENGINE_API_KEY;
    const previousDefaultTextModel = process.env.HAITU_PLATFORM_DEFAULT_TEXT_MODEL;
    const previousDefaultImageModel = process.env.HAITU_PLATFORM_DEFAULT_IMAGE_MODEL;
    const previousDefaultVideoModel = process.env.HAITU_PLATFORM_DEFAULT_VIDEO_MODEL;
    process.env.HAITU_PLATFORM_OPENAI_API_KEY = "platform-openai-secret-9999";
    process.env.HAITU_PLATFORM_DEEPSEEK_API_KEY = "platform-deepseek-secret-8888";
    process.env.HAITU_PLATFORM_VOLCENGINE_API_KEY = "platform-volcengine-secret-7777";
    process.env.HAITU_PLATFORM_DEFAULT_TEXT_MODEL = "deepseek-v4-pro";
    process.env.HAITU_PLATFORM_DEFAULT_IMAGE_MODEL = "gpt-image-2";
    process.env.HAITU_PLATFORM_DEFAULT_VIDEO_MODEL = "seedance-2.0-fast";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-platform-env-"));
      tempDirs.push(root);
      const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

      const [providerConfig, preferenceResponse] = await Promise.all([
        server.fetchJson("/api/provider-config"),
        server.fetchJson("/api/model-service-preference")
      ]);
      const serialized = JSON.stringify({ providerConfig, preferenceResponse });
      const database = openDatabase({ dataDir: join(root, "data"), env: process.env });
      const rows = database.sqlite.prepare(`
        SELECT api_owner, encrypted_key, key_preview
        FROM model_credentials
        WHERE api_owner = 'platform'
      `).all() as Array<{ api_owner: string; encrypted_key: string; key_preview: string }>;
      closeDatabase(database);

      expect(serialized).not.toContain("platform-openai-secret-9999");
      expect(serialized).not.toContain("platform-deepseek-secret-8888");
      expect(serialized).not.toContain("platform-volcengine-secret-7777");
      expect(providerConfig.textModels.filter((model: { apiOwner: string }) => model.apiOwner === "platform")).toEqual([]);
      expect(providerConfig.imageModels.filter((model: { apiOwner: string }) => model.apiOwner === "platform")).toEqual([]);
      expect(providerConfig.videoModels.filter((model: { apiOwner: string }) => model.apiOwner === "platform")).toEqual([]);
      expect(preferenceResponse.preference).toEqual(expect.objectContaining({
        serviceMode: "byok"
      }));
      expect(rows).toEqual([]);
    } finally {
      restoreEnv("HAITU_PLATFORM_OPENAI_API_KEY", previousOpenAiPlatformKey);
      restoreEnv("HAITU_PLATFORM_DEEPSEEK_API_KEY", previousDeepSeekPlatformKey);
      restoreEnv("HAITU_PLATFORM_VOLCENGINE_API_KEY", previousVolcenginePlatformKey);
      restoreEnv("HAITU_PLATFORM_DEFAULT_TEXT_MODEL", previousDefaultTextModel);
      restoreEnv("HAITU_PLATFORM_DEFAULT_IMAGE_MODEL", previousDefaultImageModel);
      restoreEnv("HAITU_PLATFORM_DEFAULT_VIDEO_MODEL", previousDefaultVideoModel);
    }
  });

  it("does not create combination storage when platform model configs change", async () => {
    const previousAdminEmail = process.env.HAITU_ADMIN_EMAIL;
    process.env.HAITU_ADMIN_EMAIL = "console-test@example.com";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-platform-model-cleanup-"));
      tempDirs.push(root);
      const dataDir = testDataDir(root);
      const database = openDatabase({ dataDir, env: process.env });
      runMigrations(database);
      database.sqlite.prepare(`
        INSERT INTO workspaces (id, name, created_at, updated_at)
        VALUES ('workspace-extra-cleanup', 'Extra Workspace', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
      `).run();
      closeDatabase(database);

      const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });
      await server.fetchJson("/api/platform/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "platform-cleanup-text-key",
          vendor: "deepseek",
          model: "deepseek-v4-pro"
        })
      });

      const verifiedDatabase = openDatabase({ dataDir, env: process.env });
      const tableNames = verifiedDatabase.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .pluck()
        .all() as string[];
      closeDatabase(verifiedDatabase);

      expect(tableNames).not.toContain("model_bundles");
    } finally {
      restoreEnv("HAITU_ADMIN_EMAIL", previousAdminEmail);
    }
  });

  it("stores admin-saved platform keys encrypted in model credentials", async () => {
    const previousAdminEmail = process.env.HAITU_ADMIN_EMAIL;
    process.env.HAITU_ADMIN_EMAIL = "console-test@example.com";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-platform-key-db-"));
      tempDirs.push(root);
      const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

      await server.fetchJson("/api/platform/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "platform-openai-db-secret-123456",
          vendor: "openai",
          model: "gpt-5.5"
        })
      });
      const providerConfig = await server.fetchJson("/api/provider-config");
      const database = openDatabase({ dataDir: join(root, "data"), env: process.env });
      const rows = database.sqlite.prepare(`
        SELECT api_owner, encrypted_key, key_preview
        FROM model_credentials
        WHERE api_owner = 'platform'
      `).all() as Array<{ api_owner: string; encrypted_key: string; key_preview: string }>;
      closeDatabase(database);
      const serialized = JSON.stringify(providerConfig);

      expect(rows.length).toBeGreaterThan(0);
      expect(rows.some((row) => row.encrypted_key === "platform-openai-db-secret-123456")).toBe(false);
      expect(rows.some((row) => row.encrypted_key.includes("platform-openai-db-secret-123456"))).toBe(false);
      expect(rows).toEqual(expect.arrayContaining([
        expect.objectContaining({
          api_owner: "platform",
          key_preview: "plat...3456"
        })
      ]));
      expect(serialized).not.toContain("platform-openai-db-secret-123456");
    } finally {
      restoreEnv("HAITU_ADMIN_EMAIL", previousAdminEmail);
    }
  });

  it("lets users switch to platform mode without choosing a model combination", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-platform-mode-toggle-"));
    tempDirs.push(root);
    const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

    const savedPreference = await server.fetchJson("/api/model-service-preference", {
      method: "PUT",
      body: JSON.stringify({
        serviceMode: "platform",
        textModelConfigId: "auto",
        imageModelConfigId: "auto",
        videoModelConfigId: "auto"
      })
    });

    expect(savedPreference.preference).toEqual(expect.objectContaining({
      serviceMode: "platform",
      textModelConfigId: "auto",
      imageModelConfigId: "auto",
      videoModelConfigId: "auto"
    }));
  });

  it("overwrites stale platform model config selections by capability", async () => {
    const previousAdminEmail = process.env.HAITU_ADMIN_EMAIL;
    process.env.HAITU_ADMIN_EMAIL = "console-test@example.com";
    const root = await mkdtemp(join(tmpdir(), "haitu-platform-mode-stale-config-"));
    tempDirs.push(root);
    try {
      const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });
      await server.fetchJson("/api/platform/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "platform-stale-text-key",
          vendor: "deepseek",
          model: "deepseek-v4-pro"
        })
      });
      await server.fetchJson("/api/platform/model-configs/openai-compatible-image", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "platform-stale-image-key",
          vendor: "openai",
          model: "gpt-image-2"
        })
      });
      await server.fetchJson("/api/platform/model-configs/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "platform-stale-video-key",
          vendor: "volcengine",
          model: "seedance-2.0-fast"
        })
      });
      const providerConfig = await server.fetchJson("/api/provider-config");
      const platformText = providerConfig.textModels.find((model: { apiOwner: string }) => model.apiOwner === "platform");
      const platformImage = providerConfig.imageModels.find((model: { apiOwner: string }) => model.apiOwner === "platform");
      const platformVideo = providerConfig.videoModels.find((model: { apiOwner: string }) => model.apiOwner === "platform");
      await server.fetchJson("/api/model-service-preference", {
        method: "PUT",
        body: JSON.stringify({
          serviceMode: "platform",
          textModelConfigId: platformText.configId,
          imageModelConfigId: platformImage.configId,
          videoModelConfigId: platformVideo.configId
        })
      });

      const savedPreference = await server.fetchJson("/api/model-service-preference", {
        method: "PUT",
        body: JSON.stringify({
          serviceMode: "platform",
          textModelConfigId: "auto",
          imageModelConfigId: "auto",
          videoModelConfigId: "auto"
        })
      });

      expect(savedPreference.preference).toEqual(expect.objectContaining({
        serviceMode: "platform",
        textModelConfigId: "auto",
        imageModelConfigId: "auto",
        videoModelConfigId: "auto"
      }));
    } finally {
      restoreEnv("HAITU_ADMIN_EMAIL", previousAdminEmail);
    }
  });

  it("stores a local BYOK video model config without exposing the secret", async () => {
    const previousSeedanceKey = process.env.SEEDANCE_API_KEY;
    const previousArkKey = process.env.ARK_API_KEY;
    delete process.env.SEEDANCE_API_KEY;
    delete process.env.ARK_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-model-config-store-"));
      tempDirs.push(root);
      const outputsDir = testJobsDir(root);
      const server = createConsoleServer({ rootDir: root, outputsDir });

      const saved = await server.fetchJson("/api/model-configs/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "byok-secret-seedance-provider-key-9999"
        })
      });
      const serializedSaved = JSON.stringify(saved);

      expect(serializedSaved).not.toContain("byok-secret-seedance-provider-key-9999");
      expect(saved.provider).toEqual(expect.objectContaining({
        id: "volcengine-seedance",
        configured: true,
        keySource: "LOCAL_BYOK",
        keyPreview: "byok...9999"
      }));
      const storedKey = await readStoredModelCredential(root, "volcengine-seedance");
      expect(storedKey.key_preview).toBe("byok...9999");
      expect(storedKey.encrypted_key).not.toContain("byok-secret-seedance-provider-key-9999");

      const config = await server.fetchJson("/api/provider-config");
      const serializedConfig = JSON.stringify(config);
      expect(serializedConfig).not.toContain("byok-secret-seedance-provider-key-9999");
      expect(config.videoModels[0]).toEqual(expect.objectContaining({
        configured: true,
        keySource: "LOCAL_BYOK",
        keyPreview: "byok...9999"
      }));

      const cleared = await server.fetchJson("/api/model-configs/volcengine-seedance", {
        method: "DELETE"
      });
      expect(cleared.provider).toEqual(expect.objectContaining({
        configured: false
      }));
      expect(cleared.provider).not.toHaveProperty("keySource");
      expect(cleared.provider).not.toHaveProperty("keyPreview");
    } finally {
      restoreEnv("SEEDANCE_API_KEY", previousSeedanceKey);
      restoreEnv("ARK_API_KEY", previousArkKey);
    }
  });

  it("stores local BYOK model configs in encrypted SQLite when HAITU_SECRET_KEY is set", async () => {
    const previousSecretKey = process.env.HAITU_SECRET_KEY;
    const previousSeedanceKey = process.env.SEEDANCE_API_KEY;
    const previousArkKey = process.env.ARK_API_KEY;
    process.env.HAITU_SECRET_KEY = "0123456789abcdef0123456789abcdef";
    delete process.env.SEEDANCE_API_KEY;
    delete process.env.ARK_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-model-config-sqlite-"));
      tempDirs.push(root);
      const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });
      const session = await registerConsoleUser(testDataDir(root), server, "sqlite-key@example.com");

      const saved = await server.fetchJson("/api/model-configs/volcengine-seedance", {
        method: "PUT",
        headers: { cookie: session.cookie },
        body: JSON.stringify({
          apiKey: "sqlite-secret-seedance-provider-key-9999",
          baseUrl: "https://ark.sqlite.example",
          model: "seedance-2.0-fast"
        })
      });

      expect(JSON.stringify(saved)).not.toContain("sqlite-secret-seedance-provider-key-9999");
      expect(saved.provider).toEqual(expect.objectContaining({
        configured: true,
        keySource: "LOCAL_BYOK",
        keyPreview: "sqli...9999"
      }));
      const dbPath = join(testDataDir(root), "haitu.sqlite");
      const databaseBytes = await readFile(dbPath, "utf8");
      expect(databaseBytes).not.toContain("sqlite-secret-seedance-provider-key-9999");
      const handle = openDatabase({ dataDir: testDataDir(root), env: process.env });
      try {
        const row = handle.sqlite
          .prepare("SELECT key_preview, encrypted_key FROM model_credentials WHERE provider_id = 'volcengine-seedance' AND workspace_id = ?")
          .get(session.workspaceId) as { key_preview: string; encrypted_key: string };
        expect(row.key_preview).toBe("sqli...9999");
        expect(row.encrypted_key).not.toContain("sqlite-secret-seedance-provider-key-9999");
      } finally {
        closeDatabase(handle);
      }

      const config = await server.fetchJson("/api/provider-config", {
        headers: { cookie: session.cookie }
      });
      expect(JSON.stringify(config)).not.toContain("sqlite-secret-seedance-provider-key-9999");
      expect(config.videoModels[0]).toEqual(expect.objectContaining({
        configured: true,
        keySource: "LOCAL_BYOK",
        keyPreview: "sqli...9999",
        baseUrl: "https://ark.sqlite.example",
        model: "doubao-seedance-2-0-fast-260128"
      }));
    } finally {
      restoreEnv("HAITU_SECRET_KEY", previousSecretKey);
      restoreEnv("SEEDANCE_API_KEY", previousSeedanceKey);
      restoreEnv("ARK_API_KEY", previousArkKey);
    }
  });

  it("tracks wallet top-ups and transaction ledger for the current workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-wallet-topup-"));
    tempDirs.push(root);
    const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

    await expect(server.fetchJson("/api/wallet")).resolves.toEqual(expect.objectContaining({
      balanceCny: 0,
      reservedCny: 0,
      availableCny: 0,
      transactions: []
    }));

    const toppedUp = await creditTestWallet(server, 20, "manual test recharge");
    const wallet = await server.fetchJson("/api/wallet");

    expect(toppedUp.wallet).toEqual(expect.objectContaining({
      balanceCny: 20,
      reservedCny: 0,
      availableCny: 20
    }));
    expect(wallet.transactions).toEqual([
      expect.objectContaining({
        type: "recharge",
        amountCny: 20,
        description: "manual test recharge"
      })
    ]);
  });

  it("lets admins inspect wallet balances and append audited balance adjustments", async () => {
    vi.stubEnv("HAITU_ADMIN_EMAIL", "console-test@example.com");
    const root = await mkdtemp(join(tmpdir(), "haitu-admin-wallet-adjustment-"));
    tempDirs.push(root);
    const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });
    await creditTestWallet(server, 20, "user recharge before adjustment");

    const before = await server.fetchJson("/api/admin/wallets");
    const adjusted = await server.fetchJson("/api/admin/wallet-adjustments", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: server.workspaceId,
        amountCny: -3.5,
        reason: "测试扣减误发余额"
      })
    });
    const after = await server.fetchJson("/api/admin/wallets");
    const wallet = await server.fetchJson("/api/wallet");

    expect(before.wallets).toEqual([
      expect.objectContaining({
        workspaceId: server.workspaceId,
        ownerEmail: "console-test@example.com",
        balanceCny: 20,
        reservedCny: 0,
        availableCny: 20
      })
    ]);
    expect(adjusted.wallet).toEqual(expect.objectContaining({
      workspaceId: server.workspaceId,
      balanceCny: 16.5,
      availableCny: 16.5
    }));
    expect(after.wallets[0]).toEqual(expect.objectContaining({
      balanceCny: 16.5,
      availableCny: 16.5,
      lastTransactionType: "adjustment"
    }));
    expect(wallet.transactions[0]).toEqual(expect.objectContaining({
      type: "adjustment",
      amountCny: -3.5,
      description: "后台余额调整：测试扣减误发余额"
    }));
  });

  it("lets admins review, draft, preview, and publish model pricing catalogs", async () => {
    vi.stubEnv("HAITU_ADMIN_EMAIL", "console-test@example.com");
    const root = await mkdtemp(join(tmpdir(), "haitu-admin-model-pricing-catalog-"));
    tempDirs.push(root);
    const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

    const active = await server.fetchJson("/api/admin/model-pricing-catalog");
    const draft = await server.fetchJson("/api/admin/model-pricing-catalog/draft", {
      method: "PUT",
      body: JSON.stringify({
        version: "2026-06-29",
        entries: active.active.entries.map((entry: { model: string; imagePriceCnyPerImage?: number }) => (
          entry.model === "gpt-image-2"
            ? { ...entry, imagePriceCnyPerImage: 0.31 }
            : entry
        ))
      })
    });
    const diff = await server.fetchJson(`/api/admin/model-pricing-catalog/draft/${encodeURIComponent(draft.draft.id)}/diff`);
    const published = await server.fetchJson("/api/admin/model-pricing-catalog/publish", {
      method: "POST",
      body: JSON.stringify({ draftId: draft.draft.id })
    });
    const publicCatalog = await server.fetchJson("/api/model-pricing-catalog");

    expect(active.active).toEqual(expect.objectContaining({
      source: "built_in",
      entries: expect.arrayContaining([
        expect.objectContaining({ model: "gpt-image-2" })
      ])
    }));
    expect(diff.changed).toEqual([
      expect.objectContaining({
        model: "gpt-image-2",
        changedFields: expect.arrayContaining(["imagePriceCnyPerImage"])
      })
    ]);
    expect(published.active).toEqual(expect.objectContaining({
      source: "database",
      version: "2026-06-29"
    }));
    expect(publicCatalog.active).toEqual(expect.objectContaining({
      source: "database",
      version: "2026-06-29",
      entries: expect.arrayContaining([
        expect.objectContaining({
          model: "gpt-image-2",
          imagePriceCnyPerImage: 0.31
        })
      ])
    }));
  });

  it("serves every endpoint required by the admin shell refresh", async () => {
    vi.stubEnv("HAITU_ADMIN_EMAIL", "console-test@example.com");
    const root = await mkdtemp(join(tmpdir(), "haitu-admin-shell-refresh-"));
    tempDirs.push(root);
    const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

    const endpoints = [
      "/api/admin/overview",
      "/api/admin/platform-model-configs",
      "/api/admin/payment-methods",
      "/api/admin/wallets",
      "/api/admin/wallet-transactions",
      "/api/admin/recharge-orders",
      "/api/admin/billing-settings",
      "/api/admin/content/summary",
      "/api/admin/content/products",
      "/api/admin/content/video-jobs",
      "/api/admin/model-pricing-catalog",
      "/api/admin/site-settings"
    ];

    const statuses = await Promise.all(endpoints.map(async (endpoint) => {
      const response = await server.fetch(endpoint);
      return [endpoint, response.status] as const;
    }));

    expect(statuses).toEqual(endpoints.map((endpoint) => [endpoint, 200]));
  });

  it("creates Stripe recharge orders without crediting the wallet until webhook completion", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_recharge_order");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_recharge_order");
    vi.stubEnv("STRIPE_CURRENCY", "hkd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-stripe-recharge-order-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === "https://api.frankfurter.dev/v2/rates?base=CNY&quotes=HKD") {
        return jsonResponse([{
          date: "2026-07-03",
          base: "CNY",
          quote: "HKD",
          rate: 1
        }]);
      }
      expect(String(url)).toBe("https://api.stripe.com/v1/checkout/sessions");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual(expect.objectContaining({
        authorization: "Bearer sk_test_recharge_order",
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": expect.stringMatching(/^wallet-recharge-/)
      }));
      const params = new URLSearchParams(String(init?.body));
      expect(params.get("mode")).toBe("payment");
      expect(params.get("currency")).toBe("hkd");
      expect(params.get("line_items[0][price_data][unit_amount]")).toBe("5000");
      expect(params.get("line_items[0][price_data][currency]")).toBe("hkd");
      expect(params.get("expires_at")).toBe("1783077630");
      expect(params.has("automatic_payment_methods[enabled]")).toBe(false);
      expect(params.get("metadata[walletCreditCents]")).toBe("5000");
      expect(params.get("success_url")).toContain("payment=stripe-success");
      expect(params.get("cancel_url")).toContain("payment=stripe-cancel");
      expect(params.get("success_url")).toContain("https://haitu.online/console?");
      expect(params.get("cancel_url")).toContain("https://haitu.online/console?");
      return jsonResponse({
        id: "cs_test_wallet_recharge",
        url: "https://checkout.stripe.com/c/pay/cs_test_wallet_recharge",
        payment_intent: "pi_test_wallet_recharge",
        expires_at: 1790000000
      });
    }) as unknown as typeof fetch;
    const server = createConsoleServer({
      rootDir: root,
      fetchImpl,
      autoStartSavedJobs: false,
      now: () => new Date("2026-07-03T10:20:30.000Z")
    });

    const created = await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 50 })
    });
    const wallet = await server.fetchJson("/api/wallet");

    expect(created).toEqual(expect.objectContaining({
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_wallet_recharge",
      order: expect.objectContaining({
        provider: "stripe",
        providerSessionId: "cs_test_wallet_recharge",
        creditCny: 50,
        paymentAmount: 50,
        paymentCurrency: "hkd",
        walletCurrency: "cny",
        fxRateSnapshot: expect.objectContaining({
          from: "cny",
          to: "hkd",
          rate: 1
        }),
        status: "pending"
      })
    }));
    expect(wallet).toEqual(expect.objectContaining({
      balanceCny: 0,
      reservedCny: 0,
      availableCny: 0,
      transactions: []
    }));
  });

  it("rejects recharge order amounts outside the supported integer range", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-recharge-amount-validation-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "should-not-create" })) as unknown as typeof fetch;
    const server = createConsoleServer({
      rootDir: root,
      fetchImpl,
      autoStartSavedJobs: false,
      now: () => new Date("2026-07-03T09:00:30.000Z")
    });

    for (const amountCny of [49, 1001, 88.5]) {
      const response = await server.fetch("/api/wallet/recharge-orders", {
        method: "POST",
        body: JSON.stringify({ amountCny })
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "充值金额必须是 50 到 1000 之间的整数。"
      });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("lets admins control which recharge payment methods users can choose", async () => {
    vi.stubEnv("HAITU_ADMIN_EMAIL", "console-test@example.com");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_payment_method_admin");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_payment_method_admin");
    vi.stubEnv("INFINI_PUBLIC_KEY", "infini_payment_method_key");
    vi.stubEnv("INFINI_PRIVATE_KEY", "infini_payment_method_secret");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "infini_payment_method_webhook_secret");
    vi.stubEnv("STRIPE_CURRENCY", "hkd");
    vi.stubEnv("INFINI_CURRENCY", "hkd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-payment-methods-admin-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      liveFxResponse(url) ?? jsonResponse({
        id: "cs_test_disabled_should_not_call",
        url: "https://checkout.stripe.com/c/pay/cs_test_disabled_should_not_call"
      })
    ) as unknown as typeof fetch;
    const server = createConsoleServer({
      rootDir: root,
      fetchImpl,
      autoStartSavedJobs: false,
      now: () => new Date("2026-07-03T09:00:30.000Z")
    });

    const initialUserMethods = await server.fetchJson("/api/payment-methods");
    const initialAdminMethods = await server.fetchJson("/api/admin/payment-methods");
    await server.fetchJson("/api/admin/payment-methods", {
      method: "PUT",
      body: JSON.stringify({
        methods: [
          { id: "stripe", enabled: false },
          { id: "infini", enabled: false }
        ]
      })
    });
    const afterDisable = await server.fetchJson("/api/payment-methods");
    const blocked = await server.fetch("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({
        amountCny: 50,
        paymentMethodId: "stripe"
      })
    });

    expect(initialUserMethods.methods).toEqual([
      expect.objectContaining({
        id: "stripe",
        kind: "rmb",
        enabled: true,
        configured: true,
        available: true
      }),
      expect.objectContaining({
        id: "infini",
        kind: "crypto",
        enabled: true,
        configured: true,
        available: true
      })
    ]);
    expect(initialAdminMethods.methods).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "stripe", enabled: true, configured: true }),
      expect.objectContaining({ id: "infini", enabled: true, configured: true })
    ]));
    expect(afterDisable.methods).toEqual([]);
    expect(blocked.status).toBe(422);
    await expect(blocked.json()).resolves.toEqual({
      error: "该支付方式已停用，请在后台启用后再充值。"
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("shows enabled recharge payment methods to users even when server secrets are incomplete", async () => {
    vi.stubEnv("HAITU_ADMIN_EMAIL", "console-test@example.com");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_payment_method_visible");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_payment_method_visible");
    vi.stubEnv("INFINI_PUBLIC_KEY", "");
    vi.stubEnv("INFINI_PRIVATE_KEY", "");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "");
    const root = await mkdtemp(join(tmpdir(), "haitu-payment-methods-unconfigured-visible-"));
    tempDirs.push(root);
    const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

    const methods = await server.fetchJson("/api/payment-methods");
    const blocked = await server.fetch("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({
        amountCny: 50,
        paymentMethodId: "infini"
      })
    });

    expect(methods.methods).toEqual([
      expect.objectContaining({
        id: "stripe",
        enabled: true,
        configured: true,
        available: true
      }),
      expect.objectContaining({
        id: "infini",
        kind: "crypto",
        enabled: true,
        configured: false,
        available: false,
        unavailableReason: "缺少 INFINI_PUBLIC_KEY、INFINI_PRIVATE_KEY 或 INFINI_WEBHOOK_SECRET"
      })
    ]);
    expect(blocked.status).toBe(422);
    await expect(blocked.json()).resolves.toEqual({
      error: "该支付方式尚未配置完成，请先在服务器环境变量中配置。"
    });
  });

  it("quotes non-CNY recharge payment methods with live exchange rates", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_payment_method_live_fx");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_payment_method_live_fx");
    vi.stubEnv("INFINI_PUBLIC_KEY", "infini_payment_method_live_fx_key");
    vi.stubEnv("INFINI_PRIVATE_KEY", "infini_payment_method_live_fx_secret");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "infini_payment_method_live_fx_webhook_secret");
    vi.stubEnv("INFINI_CURRENCY", "usd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-payment-methods-live-fx-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe("https://api.frankfurter.dev/v2/rates?base=CNY&quotes=USD");
      return jsonResponse([{
        date: "2026-07-03",
        base: "CNY",
        quote: "USD",
        rate: 0.14737
      }]);
    }) as unknown as typeof fetch;
    const server = createConsoleServer({
      rootDir: root,
      fetchImpl,
      autoStartSavedJobs: false,
      mockLiveFx: false,
      now: () => new Date("2026-07-03T10:20:30.000Z")
    });

    const methods = await server.fetchJson("/api/payment-methods?amountCny=50");

    expect(methods.methods).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "infini",
        configured: true,
        available: true,
        paymentCurrency: "usd",
        quote: expect.objectContaining({
          walletCurrency: "cny",
          creditCny: 50,
          creditCents: 5000,
          paymentCurrency: "usd",
          paymentAmount: 7.37,
          paymentAmountCents: 737,
          fxRateSnapshot: expect.objectContaining({
            from: "cny",
            to: "usd",
            rate: 0.14737,
            source: "frankfurter",
            sourceLabel: "Frankfurter",
            asOfDate: "2026-07-03",
            fetchedAt: "2026-07-03T10:20:30.000Z"
          })
        })
      })
    ]));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("quotes only the requested recharge payment method when methodId is provided", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_payment_method_scoped_quote");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_payment_method_scoped_quote");
    vi.stubEnv("INFINI_PUBLIC_KEY", "infini_payment_method_scoped_quote_key");
    vi.stubEnv("INFINI_PRIVATE_KEY", "infini_payment_method_scoped_quote_secret");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "infini_payment_method_scoped_quote_webhook_secret");
    vi.stubEnv("STRIPE_CURRENCY", "cny");
    vi.stubEnv("INFINI_CURRENCY", "usd");
    const root = await mkdtemp(join(tmpdir(), "haitu-payment-methods-scoped-quote-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe("https://api.frankfurter.dev/v2/rates?base=CNY&quotes=USD");
      return new Response(JSON.stringify({ error: "temporarily unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" }
      });
    }) as unknown as typeof fetch;
    const server = createConsoleServer({
      rootDir: root,
      fetchImpl,
      autoStartSavedJobs: false,
      now: () => new Date("2026-07-03T10:20:30.000Z")
    });

    const methods = await server.fetchJson("/api/payment-methods?amountCny=50&methodId=stripe");

    expect(methods.methods).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "stripe",
        available: true,
        paymentCurrency: "cny",
        quote: expect.objectContaining({
          paymentAmount: 50,
          paymentCurrency: "cny",
          fxRateSnapshot: expect.objectContaining({
            source: "identity",
            rate: 1
          })
        })
      })
    ]));
    const infiniMethod = methods.methods.find((method: { id: string }) => method.id === "infini");
    expect(infiniMethod).toEqual(expect.objectContaining({
      id: "infini",
      available: true,
      paymentCurrency: "usd"
    }));
    expect(infiniMethod).not.toHaveProperty("quote");
    expect(infiniMethod).not.toHaveProperty("unavailableReason");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("marks non-CNY recharge payment methods unavailable when live exchange-rate lookup fails", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_payment_method_fx");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_payment_method_fx");
    vi.stubEnv("INFINI_PUBLIC_KEY", "infini_payment_method_fx_key");
    vi.stubEnv("INFINI_PRIVATE_KEY", "infini_payment_method_fx_secret");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "infini_payment_method_fx_webhook_secret");
    vi.stubEnv("INFINI_CURRENCY", "usd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-payment-methods-fx-missing-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe("https://api.frankfurter.dev/v2/rates?base=CNY&quotes=USD");
      return new Response(JSON.stringify({ error: "temporarily unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" }
      });
    }) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl, autoStartSavedJobs: false, mockLiveFx: false });

    const methods = await server.fetchJson("/api/payment-methods?amountCny=50");
    const blocked = await server.fetch("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({
        amountCny: 50,
        paymentMethodId: "infini"
      })
    });

    expect(methods.methods).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "infini",
        configured: true,
        available: false,
        unavailableReason: "无法获取 CNY 到 USD 的实时汇率。请稍后重试。"
      })
    ]));
    expect(blocked.status).toBe(422);
    await expect(blocked.json()).resolves.toEqual({
      error: "无法获取 CNY 到 USD 的实时汇率。请稍后重试。"
    });
    expect(fetchImpl).toHaveBeenCalledWith("https://api.frankfurter.dev/v2/rates?base=CNY&quotes=USD");
  });

  it("rejects unknown recharge payment method ids instead of falling back to Stripe", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unknown_payment_method");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_unknown_payment_method");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-payment-methods-unknown-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      liveFxResponse(url) ?? jsonResponse({
        id: "cs_test_unknown_should_not_call",
        url: "https://checkout.stripe.com/c/pay/cs_test_unknown_should_not_call"
      })
    ) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl, autoStartSavedJobs: false });

    const response = await server.fetch("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({
        amountCny: 50,
        paymentMethodId: "paypal"
      })
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "暂不支持该支付方式。"
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("creates Infini recharge orders without crediting the wallet until webhook completion", async () => {
    vi.stubEnv("INFINI_PUBLIC_KEY", "infini_create_order_key");
    vi.stubEnv("INFINI_PRIVATE_KEY", "infini_create_order_secret");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "infini_create_order_webhook_secret");
    vi.stubEnv("INFINI_ENV", "sandbox");
    vi.stubEnv("INFINI_CURRENCY", "hkd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-infini-recharge-order-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://openapi-sandbox.infini.money/v1/acquiring/order");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual(expect.objectContaining({
        "content-type": "application/json"
      }));
      expect(Object.fromEntries(new Headers(init?.headers).entries())).toEqual(expect.objectContaining({
        authorization: expect.stringContaining('keyId="infini_create_order_key"'),
        date: expect.any(String),
        digest: expect.stringMatching(/^SHA-256=/)
      }));
      const payload = JSON.parse(String(init?.body));
      expect(payload).toEqual(expect.objectContaining({
        amount: "50.00",
        currency: "HKD",
        client_reference: expect.stringMatching(/^wallet-recharge-/),
        request_id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
        order_desc: "Haitu 余额充值",
        merchant_alias: "Haitu",
        pay_methods: [1],
        expires_in: 3600
      }));
      expect(payload.request_id).not.toBe(payload.client_reference);
      expect(payload).not.toHaveProperty("expires_at");
      expect(payload.success_url).toContain("payment=infini-success");
      expect(payload.success_url).toContain("https://haitu.online/console?");
      expect(payload.failure_url).toContain("https://haitu.online/console?");
      expect(payload.failure_url).toContain("payment=infini-cancel");
      return jsonResponse({
        order_id: "infini_order_wallet_recharge",
        request_id: payload.request_id,
        checkout_url: "https://checkout-sandbox.infini.money/pay/infini_order_wallet_recharge",
        client_reference: payload.client_reference,
        expires_at: 1790000000
      });
    }) as unknown as typeof fetch;
    const server = createConsoleServer({
      rootDir: root,
      fetchImpl,
      autoStartSavedJobs: false,
      now: () => new Date("2026-07-03T10:20:30.000Z")
    });

    const created = await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 50, paymentMethodId: "infini" })
    });
    const wallet = await server.fetchJson("/api/wallet");

    expect(created).toEqual(expect.objectContaining({
      checkoutUrl: "https://checkout-sandbox.infini.money/pay/infini_order_wallet_recharge",
      order: expect.objectContaining({
        provider: "infini",
        providerSessionId: "infini_order_wallet_recharge",
        creditCny: 50,
        paymentAmount: 50,
        paymentCurrency: "hkd",
        walletCurrency: "cny",
        status: "pending"
      })
    }));
    expect(wallet).toEqual(expect.objectContaining({
      balanceCny: 0,
      reservedCny: 0,
      availableCny: 0,
      transactions: []
    }));
  });

  it("creates non-CNY recharge orders from a live exchange-rate quote and stores the quote snapshot", async () => {
    vi.stubEnv("INFINI_PUBLIC_KEY", "infini_live_fx_order_key");
    vi.stubEnv("INFINI_PRIVATE_KEY", "infini_live_fx_order_secret");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "infini_live_fx_order_webhook_secret");
    vi.stubEnv("INFINI_ENV", "sandbox");
    vi.stubEnv("INFINI_CURRENCY", "usd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-infini-live-fx-recharge-order-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === "https://api.frankfurter.dev/v2/rates?base=CNY&quotes=USD") {
        return jsonResponse([{
          date: "2026-07-03",
          base: "CNY",
          quote: "USD",
          rate: 0.14737
        }]);
      }
      expect(String(url)).toBe("https://openapi-sandbox.infini.money/v1/acquiring/order");
      const payload = JSON.parse(String(init?.body));
      expect(payload).toEqual(expect.objectContaining({
        amount: "7.37",
        currency: "USD"
      }));
      return jsonResponse({
        order_id: "infini_order_live_fx_wallet_recharge",
        request_id: payload.request_id,
        checkout_url: "https://checkout-sandbox.infini.money/pay/infini_order_live_fx_wallet_recharge",
        client_reference: payload.client_reference,
        expires_at: 1790000000
      });
    }) as unknown as typeof fetch;
    const server = createConsoleServer({
      rootDir: root,
      fetchImpl,
      autoStartSavedJobs: false,
      mockLiveFx: false,
      now: () => new Date("2026-07-03T10:20:30.000Z")
    });

    const created = await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 50, paymentMethodId: "infini" })
    });

    expect(created.order).toEqual(expect.objectContaining({
      provider: "infini",
      creditCny: 50,
      paymentAmount: 7.37,
      paymentCurrency: "usd",
      walletCurrency: "cny",
      fxRateSnapshot: expect.objectContaining({
        from: "cny",
        to: "usd",
        rate: 0.14737,
        source: "frankfurter",
        sourceLabel: "Frankfurter",
        asOfDate: "2026-07-03",
        fetchedAt: "2026-07-03T10:20:30.000Z"
      })
    }));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("lists wallet recharge orders for the current workspace", async () => {
    vi.stubEnv("INFINI_PUBLIC_KEY", "infini_list_order_key");
    vi.stubEnv("INFINI_PRIVATE_KEY", "infini_list_order_secret");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "infini_list_order_webhook_secret");
    vi.stubEnv("INFINI_ENV", "sandbox");
    vi.stubEnv("INFINI_CURRENCY", "cny");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-wallet-recharge-order-list-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      return jsonResponse({
        order_id: "infini_order_list_wallet",
        request_id: payload.request_id,
        checkout_url: "https://checkout-sandbox.infini.money/pay/infini_order_list_wallet",
        client_reference: payload.client_reference,
        expires_at: 1800003600
      });
    }) as unknown as typeof fetch;
    const server = createConsoleServer({
      rootDir: root,
      fetchImpl,
      autoStartSavedJobs: false,
      now: () => new Date("2026-07-03T10:20:30.000Z")
    });
    const created = await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 50, paymentMethodId: "infini" })
    });

    const listed = await server.fetchJson("/api/wallet/recharge-orders");

    expect(listed.orders).toEqual([
      expect.objectContaining({
        id: created.order.id,
        provider: "infini",
        providerSessionId: "infini_order_list_wallet",
        paymentAmount: 50,
        paymentCurrency: "cny",
        creditCny: 50,
        status: "pending",
        checkoutUrl: "https://checkout-sandbox.infini.money/pay/infini_order_list_wallet",
        createdAt: "2026-07-03T10:20:30.000Z",
        expiresAt: "2027-01-15T09:00:00.000Z"
      })
    ]);
  });

  it("marks expired pending recharge orders before listing them", async () => {
    vi.stubEnv("INFINI_PUBLIC_KEY", "infini_expired_list_key");
    vi.stubEnv("INFINI_PRIVATE_KEY", "infini_expired_list_secret");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "infini_expired_list_webhook_secret");
    vi.stubEnv("INFINI_ENV", "sandbox");
    vi.stubEnv("INFINI_CURRENCY", "cny");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-wallet-recharge-order-expired-list-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      return jsonResponse({
        order_id: "infini_order_expired_list_wallet",
        request_id: payload.request_id,
        checkout_url: "https://checkout-sandbox.infini.money/pay/infini_order_expired_list_wallet",
        client_reference: payload.client_reference,
        expires_at: 1783071000
      });
    }) as unknown as typeof fetch;
    const server = createConsoleServer({
      rootDir: root,
      fetchImpl,
      autoStartSavedJobs: false,
      now: () => new Date("2026-07-03T09:30:01.000Z")
    });
    const created = await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 50, paymentMethodId: "infini" })
    });

    const listed = await server.fetchJson("/api/wallet/recharge-orders");

    expect(created.order).toEqual(expect.objectContaining({
      status: "pending",
      expiresAt: "2026-07-03T09:30:00.000Z"
    }));
    expect(listed.orders).toEqual([
      expect.objectContaining({
        id: created.order.id,
        provider: "infini",
        providerSessionId: "infini_order_expired_list_wallet",
        status: "expired",
        checkoutUrl: "https://checkout-sandbox.infini.money/pay/infini_order_expired_list_wallet",
        expiresAt: "2026-07-03T09:30:00.000Z"
      })
    ]);
  });

  it("queries Infini for the real order expiration time when creation omits expires_at", async () => {
    vi.stubEnv("INFINI_PUBLIC_KEY", "infini_query_expiry_key");
    vi.stubEnv("INFINI_PRIVATE_KEY", "infini_query_expiry_secret");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "infini_query_expiry_webhook_secret");
    vi.stubEnv("INFINI_ENV", "sandbox");
    vi.stubEnv("INFINI_CURRENCY", "cny");
    vi.stubEnv("HAITU_RECHARGE_ORDER_EXPIRES_IN_SECONDS", "1800");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-wallet-recharge-order-query-expiry-"));
    tempDirs.push(root);
    let clientReference = "";
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === "https://openapi-sandbox.infini.money/v1/acquiring/order" && init?.method === "POST") {
        const payload = JSON.parse(String(init?.body));
        clientReference = payload.client_reference;
        expect(payload.expires_in).toBe(1800);
        expect(payload).not.toHaveProperty("expires_at");
        return jsonResponse({
          order_id: "infini_order_query_expiry_wallet",
          request_id: payload.request_id,
          checkout_url: "https://checkout-sandbox.infini.money/pay/infini_order_query_expiry_wallet",
          client_reference: payload.client_reference
        });
      }
      expect(String(url)).toBe("https://openapi-sandbox.infini.money/v1/acquiring/order?order_id=infini_order_query_expiry_wallet");
      expect(init?.method).toBe("GET");
      return jsonResponse({
        code: 0,
        data: {
          order_id: "infini_order_query_expiry_wallet",
          status: "pending",
          amount: "50",
          currency: "CNY",
          expires_at: 1783071030,
          client_reference: clientReference
        }
      });
    }) as unknown as typeof fetch;
    const server = createConsoleServer({
      rootDir: root,
      fetchImpl,
      autoStartSavedJobs: false,
      now: () => new Date("2026-07-03T09:00:30.000Z")
    });

    const created = await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 50, paymentMethodId: "infini" })
    });

    expect(created.order).toEqual(expect.objectContaining({
      provider: "infini",
      providerSessionId: "infini_order_query_expiry_wallet",
      status: "pending",
      expiresAt: "2026-07-03T09:30:30.000Z"
    }));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("uses one recharge expiration policy for Stripe and Infini without provider-specific TTL envs", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unified_expiry");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_unified_expiry");
    vi.stubEnv("STRIPE_CURRENCY", "cny");
    vi.stubEnv("INFINI_PUBLIC_KEY", "infini_unified_expiry_key");
    vi.stubEnv("INFINI_PRIVATE_KEY", "infini_unified_expiry_secret");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "infini_unified_expiry_webhook_secret");
    vi.stubEnv("INFINI_ENV", "sandbox");
    vi.stubEnv("INFINI_CURRENCY", "cny");
    vi.stubEnv("HAITU_RECHARGE_ORDER_EXPIRES_IN_SECONDS", "7200");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-unified-recharge-expiry-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === "https://api.stripe.com/v1/checkout/sessions") {
        const params = new URLSearchParams(String(init?.body));
        expect(params.get("expires_at")).toBe("1783081230");
        return jsonResponse({
          id: "cs_test_unified_expiry",
          url: "https://checkout.stripe.com/c/pay/cs_test_unified_expiry",
          payment_intent: "pi_test_unified_expiry",
          expires_at: 1783081230
        });
      }
      expect(String(url)).toBe("https://openapi-sandbox.infini.money/v1/acquiring/order");
      const payload = JSON.parse(String(init?.body));
      expect(payload.expires_in).toBe(7200);
      expect(payload).not.toHaveProperty("expires_at");
      return jsonResponse({
        order_id: "infini_order_unified_expiry",
        request_id: payload.request_id,
        checkout_url: "https://checkout-sandbox.infini.money/pay/infini_order_unified_expiry",
        client_reference: payload.client_reference,
        expires_at: 1783081230
      });
    }) as unknown as typeof fetch;
    const server = createConsoleServer({
      rootDir: root,
      fetchImpl,
      autoStartSavedJobs: false,
      now: () => new Date("2026-07-03T10:20:30.000Z")
    });

    await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 50, paymentMethodId: "stripe" })
    });
    await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 50, paymentMethodId: "infini" })
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("surfaces Infini business errors instead of hiding them behind missing checkout links", async () => {
    vi.stubEnv("INFINI_PUBLIC_KEY", "infini_business_error_key");
    vi.stubEnv("INFINI_PRIVATE_KEY", "infini_business_error_secret");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "infini_business_error_webhook_secret");
    vi.stubEnv("INFINI_ENV", "sandbox");
    vi.stubEnv("INFINI_CURRENCY", "cny");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-infini-business-error-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request) => liveFxResponse(url) ?? jsonResponse({
      code: 40906,
      message: "Order expired"
    })) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl, autoStartSavedJobs: false, mockLiveFx: false });

    const response = await server.fetch("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 50, paymentMethodId: "infini" })
    });
    const handle = openDatabase({ dataDir: testDataDir(root), env: process.env });
    let orderStatus: { provider: string; status: string; failure_reason: string | null } | undefined;
    try {
      orderStatus = handle.sqlite.prepare(`
        SELECT provider, status, failure_reason
        FROM wallet_recharge_orders
        ORDER BY created_at DESC
        LIMIT 1
      `).get() as { provider: string; status: string; failure_reason: string | null } | undefined;
    } finally {
      closeDatabase(handle);
    }

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "创建 Infini 支付订单失败：Order expired"
    });
    expect(orderStatus).toEqual({
      provider: "infini",
      status: "failed",
      failure_reason: "创建 Infini 支付订单失败：Order expired"
    });
  });

  it("defaults Infini recharge orders to USD with a live exchange-rate quote", async () => {
    vi.stubEnv("INFINI_PUBLIC_KEY", "infini_default_cny_key");
    vi.stubEnv("INFINI_PRIVATE_KEY", "infini_default_cny_secret");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "infini_default_cny_webhook_secret");
    vi.stubEnv("INFINI_ENV", "sandbox");
    vi.stubEnv("INFINI_CURRENCY", "");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-infini-default-usd-recharge-order-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === "https://api.frankfurter.dev/v2/rates?base=CNY&quotes=USD") {
        return jsonResponse([{
          date: "2026-07-03",
          base: "CNY",
          quote: "USD",
          rate: 0.14737
        }]);
      }
      expect(String(url)).toBe("https://openapi-sandbox.infini.money/v1/acquiring/order");
      const payload = JSON.parse(String(init?.body));
      expect(payload).toEqual(expect.objectContaining({
        amount: "7.37",
        currency: "USD"
      }));
      return jsonResponse({
        order_id: "infini_order_default_usd_wallet_recharge",
        request_id: payload.request_id,
        checkout_url: "https://checkout-sandbox.infini.money/pay/infini_order_default_usd_wallet_recharge",
        client_reference: payload.client_reference,
        expires_at: 1790000000
      });
    }) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl, autoStartSavedJobs: false });

    const created = await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 50, paymentMethodId: "infini" })
    });

    expect(created.order).toEqual(expect.objectContaining({
      provider: "infini",
      paymentAmount: 7.37,
      paymentCurrency: "usd",
      walletCurrency: "cny",
      fxRateSnapshot: expect.objectContaining({
        from: "cny",
        to: "usd",
        rate: 0.14737,
        source: "frankfurter"
      })
    }));
  });

  it("returns a clear error when Stripe checkout session creation cannot reach Stripe", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_recharge_network_error");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_recharge_network_error");
    vi.stubEnv("STRIPE_CURRENCY", "hkd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-stripe-recharge-network-error-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl, autoStartSavedJobs: false });

    const response = await server.fetch("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 50 })
    });
    const handle = openDatabase({ dataDir: testDataDir(root), env: process.env });
    let orderStatus: { status: string; failure_reason: string | null } | undefined;
    try {
      orderStatus = handle.sqlite.prepare(`
        SELECT status, failure_reason
        FROM wallet_recharge_orders
        ORDER BY created_at DESC
        LIMIT 1
      `).get() as { status: string; failure_reason: string | null } | undefined;
    } finally {
      closeDatabase(handle);
    }

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Stripe 支付订单请求失败，请稍后重试。原因: fetch failed"
    });
    expect(orderStatus).toEqual({
      status: "failed",
      failure_reason: "Stripe 支付订单请求失败，请稍后重试。原因: fetch failed"
    });
  });

  it("returns a clear error when Infini checkout order creation cannot reach Infini", async () => {
    vi.stubEnv("INFINI_PUBLIC_KEY", "infini_network_error_key");
    vi.stubEnv("INFINI_PRIVATE_KEY", "infini_network_error_secret");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "infini_network_error_webhook_secret");
    vi.stubEnv("INFINI_ENV", "sandbox");
    vi.stubEnv("INFINI_CURRENCY", "hkd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-infini-recharge-network-error-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl, autoStartSavedJobs: false });

    const response = await server.fetch("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 50, paymentMethodId: "infini" })
    });
    const handle = openDatabase({ dataDir: testDataDir(root), env: process.env });
    let orderStatus: { provider: string; status: string; failure_reason: string | null } | undefined;
    try {
      orderStatus = handle.sqlite.prepare(`
        SELECT provider, status, failure_reason
        FROM wallet_recharge_orders
        ORDER BY created_at DESC
        LIMIT 1
      `).get() as { provider: string; status: string; failure_reason: string | null } | undefined;
    } finally {
      closeDatabase(handle);
    }

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Infini 支付订单请求失败，请稍后重试。原因: fetch failed"
    });
    expect(orderStatus).toEqual({
      provider: "infini",
      status: "failed",
      failure_reason: "Infini 支付订单请求失败，请稍后重试。原因: fetch failed"
    });
  });

  it("accepts Infini checkout orders returned inside a data envelope", async () => {
    vi.stubEnv("INFINI_PUBLIC_KEY", "infini_enveloped_order_key");
    vi.stubEnv("INFINI_PRIVATE_KEY", "infini_enveloped_order_secret");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "infini_enveloped_order_webhook_secret");
    vi.stubEnv("INFINI_ENV", "sandbox");
    vi.stubEnv("INFINI_CURRENCY", "hkd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-infini-recharge-envelope-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      return jsonResponse({
        code: 0,
        message: "success",
        data: {
          order_id: "infini_order_enveloped_wallet",
          request_id: payload.request_id,
          checkout_url: "https://checkout-sandbox.infini.money/pay/infini_order_enveloped_wallet",
          client_reference: payload.client_reference,
          expires_at: 1790000000
        }
      });
    }) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl, autoStartSavedJobs: false });

    const created = await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 100, paymentMethodId: "infini" })
    });

    expect(created).toEqual(expect.objectContaining({
      checkoutUrl: "https://checkout-sandbox.infini.money/pay/infini_order_enveloped_wallet",
      order: expect.objectContaining({
        provider: "infini",
        providerSessionId: "infini_order_enveloped_wallet",
        creditCny: 100,
        status: "pending"
      })
    }));
  });

  it("credits Stripe recharge orders with the actual selected payment method", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_webhook_recharge");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_webhook_recharge");
    vi.stubEnv("STRIPE_CURRENCY", "hkd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-stripe-webhook-recharge-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === "https://api.stripe.com/v1/checkout/sessions") {
        return jsonResponse({
          id: "cs_test_webhook_wallet",
          url: "https://checkout.stripe.com/c/pay/cs_test_webhook_wallet",
          payment_intent: "pi_test_webhook_wallet",
          expires_at: 1790000000
        });
      }
      expect(String(url)).toBe("https://api.stripe.com/v1/payment_intents/pi_test_webhook_wallet?expand%5B%5D=latest_charge");
      return jsonResponse({
        id: "pi_test_webhook_wallet",
        latest_charge: {
          id: "ch_test_webhook_wallet",
          payment_method_details: {
            type: "card",
            card: {
              brand: "visa",
              last4: "4242",
              wallet: { type: "apple_pay" }
            }
          }
        }
      });
    }) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl, autoStartSavedJobs: false });
    const created = await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 88 })
    });
    const payload = JSON.stringify({
      id: "evt_test_checkout_completed",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_webhook_wallet",
          object: "checkout.session",
          payment_status: "paid",
          amount_total: 8800,
          currency: "hkd",
          payment_intent: "pi_test_webhook_wallet"
        }
      }
    });
    const signature = stripeTestSignature(payload, "whsec_webhook_recharge");

    const first = await server.raw.fetch("/api/payments/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature
      },
      body: payload
    });
    const duplicate = await server.raw.fetch("/api/payments/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature
      },
      body: payload
    });
    const wallet = await server.fetchJson("/api/wallet");
    const rechargeOrders = await server.fetchJson("/api/wallet/recharge-orders");

    await expect(first.json()).resolves.toEqual({ received: true });
    await expect(duplicate.json()).resolves.toEqual({ received: true, duplicate: true });
    expect(wallet).toEqual(expect.objectContaining({
      balanceCny: 88,
      reservedCny: 0,
      availableCny: 88
    }));
    expect(wallet.transactions).toEqual([
      expect.objectContaining({
        type: "recharge",
        amountCny: 88,
        description: "Stripe Apple Pay Visa 尾号 4242 充值到账",
        metadata: expect.objectContaining({
          paymentMethodProvider: "stripe",
          paymentMethodType: "card",
          paymentMethodLabel: "Apple Pay Visa 尾号 4242",
          stripeChargeId: "ch_test_webhook_wallet",
          cardBrand: "visa",
          cardLast4: "4242",
          cardWallet: "apple_pay"
        })
      })
    ]);
    expect(rechargeOrders.orders).toEqual([
      expect.objectContaining({
        id: created.order.id,
        status: "paid",
        metadata: expect.objectContaining({
          paymentMethodProvider: "stripe",
          paymentMethodType: "card",
          paymentMethodLabel: "Apple Pay Visa 尾号 4242",
          stripeChargeId: "ch_test_webhook_wallet",
          cardBrand: "visa",
          cardLast4: "4242",
          cardWallet: "apple_pay"
        })
      })
    ]);
  });

  it("falls back to generic Stripe recharge descriptions when payment method details are unavailable", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_webhook_recharge");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_webhook_recharge");
    vi.stubEnv("STRIPE_CURRENCY", "hkd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-stripe-webhook-recharge-fallback-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === "https://api.stripe.com/v1/checkout/sessions") {
        return jsonResponse({
        id: "cs_test_webhook_wallet",
        url: "https://checkout.stripe.com/c/pay/cs_test_webhook_wallet",
        payment_intent: "pi_test_webhook_wallet",
        expires_at: 1790000000
        });
      }
      throw new TypeError("Stripe detail lookup failed");
    }) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl, autoStartSavedJobs: false });
    await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 88 })
    });
    const payload = JSON.stringify({
      id: "evt_test_checkout_completed",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_webhook_wallet",
          object: "checkout.session",
          payment_status: "paid",
          amount_total: 8800,
          currency: "hkd",
          payment_intent: "pi_test_webhook_wallet"
        }
      }
    });
    const signature = stripeTestSignature(payload, "whsec_webhook_recharge");

    const first = await server.raw.fetch("/api/payments/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature
      },
      body: payload
    });
    const duplicate = await server.raw.fetch("/api/payments/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature
      },
      body: payload
    });
    const wallet = await server.fetchJson("/api/wallet");

    await expect(first.json()).resolves.toEqual({ received: true });
    await expect(duplicate.json()).resolves.toEqual({ received: true, duplicate: true });
    expect(wallet).toEqual(expect.objectContaining({
      balanceCny: 88,
      reservedCny: 0,
      availableCny: 88
    }));
    expect(wallet.transactions).toEqual([
      expect.objectContaining({
        type: "recharge",
        amountCny: 88,
        description: "Stripe 充值到账"
      })
    ]);
  });

  it("labels Stripe wallet recharge records for non-card payment methods", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_webhook_alipay");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_webhook_alipay");
    vi.stubEnv("STRIPE_CURRENCY", "hkd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-stripe-webhook-alipay-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === "https://api.stripe.com/v1/checkout/sessions") {
        return jsonResponse({
          id: "cs_test_webhook_alipay",
          url: "https://checkout.stripe.com/c/pay/cs_test_webhook_alipay",
          payment_intent: "pi_test_webhook_alipay",
          expires_at: 1790000000
        });
      }
      return jsonResponse({
        id: "pi_test_webhook_alipay",
        latest_charge: {
          id: "ch_test_webhook_alipay",
          payment_method_details: {
            type: "alipay"
          }
        }
      });
    }) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl, autoStartSavedJobs: false });
    await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 50 })
    });
    const payload = JSON.stringify({
      id: "evt_test_checkout_alipay_completed",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_webhook_alipay",
          object: "checkout.session",
          payment_status: "paid",
          amount_total: 5000,
          currency: "hkd",
          payment_intent: "pi_test_webhook_alipay"
        }
      }
    });

    const response = await server.raw.fetch("/api/payments/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": stripeTestSignature(payload, "whsec_webhook_alipay")
      },
      body: payload
    });
    const wallet = await server.fetchJson("/api/wallet");

    expect(response.status).toBe(200);
    expect(wallet.transactions).toEqual([
      expect.objectContaining({
        type: "recharge",
        amountCny: 50,
        description: "Stripe 支付宝 充值到账",
        metadata: expect.objectContaining({
          paymentMethodLabel: "支付宝",
          paymentMethodType: "alipay",
          stripeChargeId: "ch_test_webhook_alipay"
        })
      })
    ]);
  });

  it("credits Infini recharge orders once and only after a signed order.completed webhook", async () => {
    vi.stubEnv("INFINI_PUBLIC_KEY", "infini_webhook_key");
    vi.stubEnv("INFINI_PRIVATE_KEY", "infini_webhook_secret");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "infini_webhook_signing_secret");
    vi.stubEnv("INFINI_ENV", "sandbox");
    vi.stubEnv("INFINI_CURRENCY", "hkd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-infini-webhook-recharge-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      return jsonResponse({
        order_id: "infini_order_webhook_wallet",
        request_id: payload.request_id,
        checkout_url: "https://checkout-sandbox.infini.money/pay/infini_order_webhook_wallet",
        client_reference: payload.client_reference,
        expires_at: 1790000000
      });
    }) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl, autoStartSavedJobs: false });
    await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 88, paymentMethodId: "infini" })
    });
    const processingPayload = JSON.stringify({
      event: "order.processing",
      order_id: "infini_order_webhook_wallet",
      client_reference: "",
      amount: "88.00",
      currency: "HKD",
      status: "processing",
      amount_confirmed: "0",
      amount_confirming: "88.00",
      created_at: 1800000000,
      updated_at: 1800000001
    });
    const completedPayload = JSON.stringify({
      event: "order.completed",
      order_id: "infini_order_webhook_wallet",
      client_reference: "",
      amount: "88.00",
      currency: "HKD",
      status: "paid",
      amount_confirmed: "88.00",
      amount_confirming: "0",
      payment_currency: "USDT",
      payment_network: "TRC20",
      tx_hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      created_at: 1800000000,
      updated_at: 1800000002
    });

    const processing = await server.raw.fetch("/api/payments/infini/webhook", {
      method: "POST",
      headers: infiniWebhookHeaders(processingPayload, "infini_webhook_signing_secret", "evt_infini_processing"),
      body: processingPayload
    });
    const beforeCompleted = await server.fetchJson("/api/wallet");
    const first = await server.raw.fetch("/api/payments/infini/webhook", {
      method: "POST",
      headers: infiniWebhookHeaders(completedPayload, "infini_webhook_signing_secret", "evt_infini_completed"),
      body: completedPayload
    });
    const duplicate = await server.raw.fetch("/api/payments/infini/webhook", {
      method: "POST",
      headers: infiniWebhookHeaders(completedPayload, "infini_webhook_signing_secret", "evt_infini_completed"),
      body: completedPayload
    });
    const wallet = await server.fetchJson("/api/wallet");
    const rechargeOrders = await server.fetchJson("/api/wallet/recharge-orders");

    expect(processing.status).toBe(200);
    await expect(processing.json()).resolves.toEqual({ received: true });
    expect(beforeCompleted.balanceCny).toBe(0);
    await expect(first.json()).resolves.toEqual({ received: true });
    await expect(duplicate.json()).resolves.toEqual({ received: true, duplicate: true });
    expect(wallet).toEqual(expect.objectContaining({
      balanceCny: 88,
      reservedCny: 0,
      availableCny: 88
    }));
    expect(wallet.transactions).toEqual([
      expect.objectContaining({
        type: "recharge",
        amountCny: 88,
        description: "Infini USDT-TRC20 充值到账",
        metadata: expect.objectContaining({
          paymentMethodProvider: "infini",
          paymentMethodType: "crypto",
          paymentMethodLabel: "USDT-TRC20",
          cryptoCurrency: "USDT",
          cryptoNetwork: "TRC20",
          cryptoTxHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
          cryptoTxHashShort: "0x123456...90abcdef"
        })
      })
    ]);
    expect(rechargeOrders.orders).toEqual([
      expect.objectContaining({
        status: "paid",
        metadata: expect.objectContaining({
          paymentMethodProvider: "infini",
          paymentMethodType: "crypto",
          paymentMethodLabel: "USDT-TRC20",
          cryptoCurrency: "USDT",
          cryptoNetwork: "TRC20",
          cryptoTxHashShort: "0x123456...90abcdef"
        })
      })
    ]);
  });

  it("syncs paid Infini recharge orders by querying Infini when local webhooks cannot be delivered", async () => {
    vi.stubEnv("INFINI_PUBLIC_KEY", "infini_sync_key");
    vi.stubEnv("INFINI_PRIVATE_KEY", "infini_sync_secret");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "infini_sync_webhook_secret");
    vi.stubEnv("INFINI_ENV", "sandbox");
    vi.stubEnv("INFINI_CURRENCY", "hkd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-infini-sync-recharge-"));
    tempDirs.push(root);
    let clientReference = "";
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === "https://openapi-sandbox.infini.money/v1/acquiring/order" && init?.method === "POST") {
        const payload = JSON.parse(String(init?.body));
        clientReference = payload.client_reference;
        return jsonResponse({
          order_id: "infini_order_sync_wallet",
          request_id: payload.request_id,
          checkout_url: "https://checkout-sandbox.infini.money/pay/infini_order_sync_wallet",
          client_reference: payload.client_reference,
          expires_at: 1790000000
        });
      }
      if (String(url) === "https://openapi-sandbox.infini.money/v1/acquiring/order?order_id=infini_order_sync_wallet" && init?.method === "GET") {
        expect(Object.fromEntries(new Headers(init.headers).entries())).toEqual(expect.objectContaining({
          authorization: expect.stringContaining('keyId="infini_sync_key"'),
          date: expect.any(String)
        }));
        return jsonResponse({
          code: 0,
          message: "",
          data: {
            order_id: "infini_order_sync_wallet",
            client_reference: clientReference,
            order_currency: "HKD",
            order_amount: "50",
            amount_confirmed: "50",
            amount_confirming: "0",
            status: "paid",
            payment_currency: "USDC",
            payment_network: "ERC20",
            tx_hash: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
            updated_at: 1800000002
          }
        });
      }
      throw new Error(`Unexpected Infini request ${String(url)}`);
    }) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl, autoStartSavedJobs: false });
    const created = await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 50, paymentMethodId: "infini" })
    });

    const beforeSync = await server.fetchJson("/api/wallet");
    const firstSync = await server.fetchJson(`/api/wallet/recharge-orders/${encodeURIComponent(created.order.id)}/sync`, {
      method: "POST",
      body: JSON.stringify({})
    });
    const duplicateSync = await server.fetchJson(`/api/wallet/recharge-orders/${encodeURIComponent(created.order.id)}/sync`, {
      method: "POST",
      body: JSON.stringify({})
    });
    const wallet = await server.fetchJson("/api/wallet");

    expect(beforeSync.balanceCny).toBe(0);
    expect(firstSync).toEqual(expect.objectContaining({
      synced: true,
      order: expect.objectContaining({
        provider: "infini",
        providerSessionId: "infini_order_sync_wallet",
        status: "paid"
      }),
      wallet: expect.objectContaining({
        balanceCny: 50,
        availableCny: 50
      })
    }));
    expect(duplicateSync).toEqual(expect.objectContaining({
      synced: false,
      order: expect.objectContaining({
        status: "paid"
      })
    }));
    expect(wallet.transactions).toEqual([
      expect.objectContaining({
        type: "recharge",
        amountCny: 50,
        description: "Infini USDC-ERC20 充值到账",
        metadata: expect.objectContaining({
          paymentMethodLabel: "USDC-ERC20",
          cryptoTxHashShort: "0xabcdef...cdefabcd"
        })
      })
    ]);
  });

  it("waits for async Stripe checkout success before crediting delayed payment methods", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_async_webhook_recharge");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_async_webhook_recharge");
    vi.stubEnv("STRIPE_CURRENCY", "hkd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-stripe-async-webhook-recharge-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      liveFxResponse(url) ?? jsonResponse({
        id: "cs_test_async_webhook_wallet",
        url: "https://checkout.stripe.com/c/pay/cs_test_async_webhook_wallet",
        payment_intent: "pi_test_async_webhook_wallet",
        expires_at: 1790000000
      })
    ) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl, autoStartSavedJobs: false });
    await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 88 })
    });
    const completedPayload = JSON.stringify({
      id: "evt_test_async_checkout_completed",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_async_webhook_wallet",
          object: "checkout.session",
          payment_status: "unpaid",
          amount_total: 8800,
          currency: "hkd",
          payment_intent: "pi_test_async_webhook_wallet"
        }
      }
    });
    const succeededPayload = JSON.stringify({
      id: "evt_test_async_checkout_succeeded",
      type: "checkout.session.async_payment_succeeded",
      data: {
        object: {
          id: "cs_test_async_webhook_wallet",
          object: "checkout.session",
          payment_status: "paid",
          amount_total: 8800,
          currency: "hkd",
          payment_intent: "pi_test_async_webhook_wallet"
        }
      }
    });

    const completed = await server.raw.fetch("/api/payments/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": stripeTestSignature(completedPayload, "whsec_async_webhook_recharge")
      },
      body: completedPayload
    });
    const walletBeforeAsyncSuccess = await server.fetchJson("/api/wallet");
    const succeeded = await server.raw.fetch("/api/payments/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": stripeTestSignature(succeededPayload, "whsec_async_webhook_recharge")
      },
      body: succeededPayload
    });
    const wallet = await server.fetchJson("/api/wallet");

    expect(completed.status).toBe(200);
    await expect(completed.json()).resolves.toEqual({ received: true });
    expect(walletBeforeAsyncSuccess.balanceCny).toBe(0);
    expect(succeeded.status).toBe(200);
    await expect(succeeded.json()).resolves.toEqual({ received: true });
    expect(wallet).toEqual(expect.objectContaining({
      balanceCny: 88,
      reservedCny: 0,
      availableCny: 88
    }));
    expect(wallet.transactions).toEqual([
      expect.objectContaining({
        type: "recharge",
        amountCny: 88,
        description: "Stripe 充值到账"
      })
    ]);
  });

  it("marks Stripe async checkout failures without crediting the wallet", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_async_webhook_failure");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_async_webhook_failure");
    vi.stubEnv("STRIPE_CURRENCY", "hkd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-stripe-async-webhook-failure-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      liveFxResponse(url) ?? jsonResponse({
        id: "cs_test_async_webhook_failure",
        url: "https://checkout.stripe.com/c/pay/cs_test_async_webhook_failure",
        payment_intent: "pi_test_async_webhook_failure",
        expires_at: 1790000000
      })
    ) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl, autoStartSavedJobs: false });
    await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 66 })
    });
    const payload = JSON.stringify({
      id: "evt_test_async_checkout_failed",
      type: "checkout.session.async_payment_failed",
      data: {
        object: {
          id: "cs_test_async_webhook_failure",
          object: "checkout.session",
          payment_status: "unpaid",
          amount_total: 6600,
          currency: "hkd",
          payment_intent: "pi_test_async_webhook_failure"
        }
      }
    });

    const response = await server.raw.fetch("/api/payments/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": stripeTestSignature(payload, "whsec_async_webhook_failure")
      },
      body: payload
    });
    const wallet = await server.fetchJson("/api/wallet");
    const handle = openDatabase({ dataDir: testDataDir(root), env: process.env });
    let orderStatus: { status: string; failure_reason: string | null } | undefined;
    try {
      orderStatus = handle.sqlite.prepare(`
        SELECT status, failure_reason
        FROM wallet_recharge_orders
        WHERE provider_session_id = ?
      `).get("cs_test_async_webhook_failure") as { status: string; failure_reason: string | null } | undefined;
    } finally {
      closeDatabase(handle);
    }

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(wallet.balanceCny).toBe(0);
    expect(wallet.transactions).toEqual([]);
    expect(orderStatus).toEqual({
      status: "failed",
      failure_reason: "Stripe 异步支付失败"
    });
  });

  it("rejects Stripe checkout webhooks whose amount does not match the recharge order", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_webhook_mismatch");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_webhook_mismatch");
    vi.stubEnv("STRIPE_CURRENCY", "hkd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-stripe-webhook-mismatch-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      liveFxResponse(url) ?? jsonResponse({
        id: "cs_test_webhook_mismatch",
        url: "https://checkout.stripe.com/c/pay/cs_test_webhook_mismatch",
        payment_intent: "pi_test_webhook_mismatch",
        expires_at: 1790000000
      })
    ) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl, autoStartSavedJobs: false });
    await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 88 })
    });
    const payload = JSON.stringify({
      id: "evt_test_checkout_mismatch",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_webhook_mismatch",
          object: "checkout.session",
          payment_status: "paid",
          amount_total: 9900,
          currency: "hkd",
          payment_intent: "pi_test_webhook_mismatch"
        }
      }
    });
    const response = await server.raw.fetch("/api/payments/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": stripeTestSignature(payload, "whsec_webhook_mismatch")
      },
      body: payload
    });
    const wallet = await server.fetchJson("/api/wallet");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      error: expect.stringContaining("Stripe 充值金额不匹配")
    }));
    expect(wallet.balanceCny).toBe(0);
    expect(wallet.transactions).toEqual([]);
  });

  it("rejects Stripe checkout webhooks signed outside the replay tolerance", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_webhook_old_signature");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_webhook_old_signature");
    vi.stubEnv("STRIPE_CURRENCY", "hkd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const nowSeconds = 1_800_000_000;
    const root = await mkdtemp(join(tmpdir(), "haitu-stripe-webhook-old-signature-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      liveFxResponse(url) ?? jsonResponse({
        id: "cs_test_webhook_old_signature",
        url: "https://checkout.stripe.com/c/pay/cs_test_webhook_old_signature",
        payment_intent: "pi_test_webhook_old_signature",
        expires_at: 1790000000
      })
    ) as unknown as typeof fetch;
    const server = createConsoleServer({
      rootDir: root,
      fetchImpl,
      autoStartSavedJobs: false,
      now: () => new Date(nowSeconds * 1000)
    });
    await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 88 })
    });
    const payload = JSON.stringify({
      id: "evt_test_checkout_old_signature",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_webhook_old_signature",
          object: "checkout.session",
          payment_status: "paid",
          amount_total: 8800,
          currency: "hkd",
          payment_intent: "pi_test_webhook_old_signature"
        }
      }
    });

    const response = await server.raw.fetch("/api/payments/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": stripeTestSignature(payload, "whsec_webhook_old_signature", nowSeconds - 301)
      },
      body: payload
    });
    const wallet = await server.fetchJson("/api/wallet");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      error: expect.stringContaining("Stripe webhook 签名时间")
    }));
    expect(wallet.balanceCny).toBe(0);
    expect(wallet.transactions).toEqual([]);
  });

  it("rejects Infini checkout webhooks signed outside the replay tolerance", async () => {
    vi.stubEnv("INFINI_PUBLIC_KEY", "infini_old_signature_key");
    vi.stubEnv("INFINI_PRIVATE_KEY", "infini_old_signature_secret");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "infini_old_signature_webhook_secret");
    vi.stubEnv("INFINI_ENV", "sandbox");
    vi.stubEnv("INFINI_CURRENCY", "hkd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const nowSeconds = 1_800_000_000;
    const root = await mkdtemp(join(tmpdir(), "haitu-infini-webhook-old-signature-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      return jsonResponse({
        order_id: "infini_order_old_signature",
        request_id: payload.request_id,
        checkout_url: "https://checkout-sandbox.infini.money/pay/infini_order_old_signature",
        client_reference: payload.client_reference,
        expires_at: 1790000000
      });
    }) as unknown as typeof fetch;
    const server = createConsoleServer({
      rootDir: root,
      fetchImpl,
      autoStartSavedJobs: false,
      now: () => new Date(nowSeconds * 1000)
    });
    await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 88, paymentMethodId: "infini" })
    });
    const payload = JSON.stringify({
      event: "order.completed",
      order_id: "infini_order_old_signature",
      client_reference: "",
      amount: "88.00",
      currency: "HKD",
      status: "paid",
      amount_confirmed: "88.00",
      amount_confirming: "0",
      created_at: nowSeconds,
      updated_at: nowSeconds
    });

    const response = await server.raw.fetch("/api/payments/infini/webhook", {
      method: "POST",
      headers: infiniWebhookHeaders(payload, "infini_old_signature_webhook_secret", "evt_infini_old_signature", nowSeconds - 1201),
      body: payload
    });
    const wallet = await server.fetchJson("/api/wallet");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      error: expect.stringContaining("Infini webhook 签名时间")
    }));
    expect(wallet.balanceCny).toBe(0);
    expect(wallet.transactions).toEqual([]);
  });

  it("rejects Infini checkout webhooks whose decimal amount has unsupported precision", async () => {
    vi.stubEnv("INFINI_PUBLIC_KEY", "infini_precision_key");
    vi.stubEnv("INFINI_PRIVATE_KEY", "infini_precision_secret");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "infini_precision_webhook_secret");
    vi.stubEnv("INFINI_ENV", "sandbox");
    vi.stubEnv("INFINI_CURRENCY", "hkd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-infini-webhook-precision-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      return jsonResponse({
        order_id: "infini_order_precision",
        request_id: payload.request_id,
        checkout_url: "https://checkout-sandbox.infini.money/pay/infini_order_precision",
        client_reference: payload.client_reference,
        expires_at: 1790000000
      });
    }) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl, autoStartSavedJobs: false });
    await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 88, paymentMethodId: "infini" })
    });
    const payload = JSON.stringify({
      event: "order.completed",
      order_id: "infini_order_precision",
      client_reference: "",
      amount: "88.001",
      currency: "HKD",
      status: "paid",
      amount_confirmed: "88.001",
      amount_confirming: "0"
    });

    const response = await server.raw.fetch("/api/payments/infini/webhook", {
      method: "POST",
      headers: infiniWebhookHeaders(payload, "infini_precision_webhook_secret", "evt_infini_precision"),
      body: payload
    });
    const wallet = await server.fetchJson("/api/wallet");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      error: expect.stringContaining("Infini 充值金额不匹配")
    }));
    expect(wallet.balanceCny).toBe(0);
    expect(wallet.transactions).toEqual([]);
  });

  it("marks Infini late payments for manual confirmation without crediting the wallet", async () => {
    vi.stubEnv("INFINI_PUBLIC_KEY", "infini_late_payment_key");
    vi.stubEnv("INFINI_PRIVATE_KEY", "infini_late_payment_secret");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "infini_late_payment_webhook_secret");
    vi.stubEnv("INFINI_ENV", "sandbox");
    vi.stubEnv("INFINI_CURRENCY", "hkd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-infini-late-payment-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      return jsonResponse({
        order_id: "infini_order_late_payment",
        request_id: payload.request_id,
        checkout_url: "https://checkout-sandbox.infini.money/pay/infini_order_late_payment",
        client_reference: payload.client_reference,
        expires_at: 1790000000
      });
    }) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl, autoStartSavedJobs: false });
    await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 88, paymentMethodId: "infini" })
    });
    const payload = JSON.stringify({
      event: "order.late_payment",
      order_id: "infini_order_late_payment",
      client_reference: "",
      amount: "88.00",
      currency: "HKD",
      status: "expired",
      amount_confirmed: "88.00",
      amount_confirming: "0"
    });

    const response = await server.raw.fetch("/api/payments/infini/webhook", {
      method: "POST",
      headers: infiniWebhookHeaders(payload, "infini_late_payment_webhook_secret", "evt_infini_late_payment"),
      body: payload
    });
    const wallet = await server.fetchJson("/api/wallet");
    const handle = openDatabase({ dataDir: testDataDir(root), env: process.env });
    let orderStatus: { status: string; failure_reason: string | null } | undefined;
    try {
      orderStatus = handle.sqlite.prepare(`
        SELECT status, failure_reason
        FROM wallet_recharge_orders
        WHERE provider_session_id = ?
      `).get("infini_order_late_payment") as { status: string; failure_reason: string | null } | undefined;
    } finally {
      closeDatabase(handle);
    }

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(wallet.balanceCny).toBe(0);
    expect(wallet.transactions).toEqual([]);
    expect(orderStatus).toEqual({
      status: "failed",
      failure_reason: "Infini 订单超时后收到付款，请后台人工确认"
    });
  });

  it("keeps webhook idempotency scoped per payment provider", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_provider_scoped_webhook");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_provider_scoped_webhook");
    vi.stubEnv("INFINI_PUBLIC_KEY", "infini_provider_scoped_key");
    vi.stubEnv("INFINI_PRIVATE_KEY", "infini_provider_scoped_secret");
    vi.stubEnv("INFINI_WEBHOOK_SECRET", "infini_provider_scoped_webhook_secret");
    vi.stubEnv("STRIPE_CURRENCY", "hkd");
    vi.stubEnv("INFINI_ENV", "sandbox");
    vi.stubEnv("INFINI_CURRENCY", "hkd");
    vi.stubEnv("HAITU_PUBLIC_BASE_URL", "https://haitu.online");
    const root = await mkdtemp(join(tmpdir(), "haitu-provider-scoped-webhooks-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === "https://api.stripe.com/v1/checkout/sessions") {
        return jsonResponse({
          id: "cs_test_provider_scoped",
          url: "https://checkout.stripe.com/c/pay/cs_test_provider_scoped",
          payment_intent: "pi_test_provider_scoped",
          expires_at: 1790000000
        });
      }
      if (String(url) === "https://openapi-sandbox.infini.money/v1/acquiring/order" && init?.method === "POST") {
        const payload = JSON.parse(String(init.body));
        return jsonResponse({
          order_id: "infini_order_provider_scoped",
          request_id: payload.request_id,
          checkout_url: "https://checkout-sandbox.infini.money/pay/infini_order_provider_scoped",
          client_reference: payload.client_reference,
          expires_at: 1790000000
        });
      }
      throw new Error(`Unexpected payment request ${String(url)}`);
    }) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl, autoStartSavedJobs: false });
    await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 50, paymentMethodId: "stripe" })
    });
    await server.fetchJson("/api/wallet/recharge-orders", {
      method: "POST",
      body: JSON.stringify({ amountCny: 60, paymentMethodId: "infini" })
    });
    const sharedEventId = "evt_shared_provider_scoped";
    const stripePayload = JSON.stringify({
      id: sharedEventId,
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_provider_scoped",
          object: "checkout.session",
          payment_status: "paid",
          amount_total: 5000,
          currency: "hkd",
          payment_intent: "pi_test_provider_scoped"
        }
      }
    });
    const infiniPayload = JSON.stringify({
      event: "order.completed",
      order_id: "infini_order_provider_scoped",
      client_reference: "",
      amount: "60.00",
      currency: "HKD",
      status: "paid",
      amount_confirmed: "60.00",
      amount_confirming: "0"
    });

    const stripeResponse = await server.raw.fetch("/api/payments/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": stripeTestSignature(stripePayload, "whsec_provider_scoped_webhook")
      },
      body: stripePayload
    });
    const infiniResponse = await server.raw.fetch("/api/payments/infini/webhook", {
      method: "POST",
      headers: infiniWebhookHeaders(infiniPayload, "infini_provider_scoped_webhook_secret", sharedEventId),
      body: infiniPayload
    });
    const wallet = await server.fetchJson("/api/wallet");

    expect(stripeResponse.status).toBe(200);
    expect(infiniResponse.status).toBe(200);
    await expect(stripeResponse.json()).resolves.toEqual({ received: true });
    await expect(infiniResponse.json()).resolves.toEqual({ received: true });
    expect(wallet).toEqual(expect.objectContaining({
      balanceCny: 110,
      availableCny: 110
    }));
    expect(wallet.transactions.map((transaction: { description?: string; amountCny: number }) => [
      transaction.description,
      transaction.amountCny
    ])).toEqual([
      ["Infini 数字货币充值到账", 60],
      ["Stripe 充值到账", 50]
    ]);
  });

  it("persists type-based model preferences without model bundles", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-model-preferences-"));
    tempDirs.push(root);
    const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });
    await server.fetchJson("/api/model-configs/openai-compatible-text", {
      method: "PUT",
      body: JSON.stringify({
        apiKey: "text-preference-key",
        name: "DeepSeek 文本",
        vendor: "deepseek",
        model: "deepseek-v4-pro",
        baseUrl: "https://api.deepseek.com"
      })
    });
    await server.fetchJson("/api/model-configs/openai-compatible-image", {
      method: "PUT",
      body: JSON.stringify({
        apiKey: "image-preference-key",
        name: "GPT Image",
        vendor: "openai",
        model: "gpt-image-2",
        baseUrl: "https://api.openai.com"
      })
    });
    await server.fetchJson("/api/model-configs/volcengine-seedance", {
      method: "PUT",
      body: JSON.stringify({
        apiKey: "video-preference-key",
        name: "Seedance Fast",
        vendor: "volcengine",
        model: "doubao-seedance-2-0-fast-260128",
        baseUrl: "https://ark.cn-beijing.volces.com"
      })
    });
    const providerConfig = await server.fetchJson("/api/provider-config");
    const textConfigId = providerConfig.textModels[0].configId;
    const imageConfigId = providerConfig.imageModels[0].configId;
    const videoConfigId = providerConfig.videoModels[0].configId;

    const saved = await server.fetchJson("/api/model-service-preference", {
      method: "PUT",
      body: JSON.stringify({
        serviceMode: "byok",
        textModelConfigId: textConfigId,
        imageModelConfigId: imageConfigId,
        videoModelConfigId: videoConfigId
      })
    });
    const listed = await server.fetchJson("/api/model-service-preference");
    const database = openDatabase({ dataDir: join(root, "data"), env: process.env });
    const tableNames = database.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .pluck()
      .all() as string[];
    closeDatabase(database);

    expect(saved.preference).toEqual(expect.objectContaining({
      serviceMode: "byok",
      textModelConfigId: textConfigId,
      imageModelConfigId: imageConfigId,
      videoModelConfigId: videoConfigId
    }));
    expect(listed.preference).toEqual(saved.preference);
    expect(saved.preference.platformBundleId).toBeUndefined();
    expect(saved.preference.byokBundleId).toBeUndefined();
    expect(tableNames).not.toContain("model_bundles");
  });

  it("allows partial type preferences and leaves missing capabilities on automatic selection", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-model-preference-partial-"));
    tempDirs.push(root);
    const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });
    await server.fetchJson("/api/model-configs/openai-compatible-text", {
      method: "PUT",
      body: JSON.stringify({
        apiKey: "text-draft-key",
        name: "DeepSeek 草稿",
        vendor: "deepseek",
        model: "deepseek-v4-pro",
        baseUrl: "https://api.deepseek.com"
      })
    });
    const providerConfig = await server.fetchJson("/api/provider-config");
    const textConfigId = providerConfig.textModels[0].configId;

    const saved = await server.fetchJson("/api/model-service-preference", {
      method: "PUT",
      body: JSON.stringify({
        serviceMode: "byok",
        textModelConfigId: textConfigId
      })
    });

    const listed = await server.fetchJson("/api/model-service-preference");
    expect(saved.preference).toEqual(expect.objectContaining({
      serviceMode: "byok",
      textModelConfigId: textConfigId
    }));
    expect(saved.preference.imageModelConfigId).toBeUndefined();
    expect(saved.preference.videoModelConfigId).toBeUndefined();
    expect(listed.preference).toEqual(saved.preference);
  });

  it("persists model service mode and uses the selected platform text model for AI calls", async () => {
    const previousAdminEmail = process.env.HAITU_ADMIN_EMAIL;
    process.env.HAITU_ADMIN_EMAIL = "console-test@example.com";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-service-mode-platform-"));
      tempDirs.push(root);
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sku: "PLATFORM-MODE-001",
                  title_ja: "平台模型 テスト商品",
                  category: "テスト",
                  materials: ["PP"],
                  dimensions: "約10cm",
                  verified_selling_points: ["平台模型"],
                  usage_scenes: ["デスク"],
                  forbidden_claims: [],
                  reference_images: []
                })
              }
            }
          ],
          usage: {
            total_tokens: 1000
          }
        })
      ) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fetchImpl, autoStartSavedJobs: false });
      await server.fetchJson("/api/admin/billing-settings", {
        method: "PUT",
        body: JSON.stringify({
          rules: [
            { usageKind: "text", serviceFeeCny: 0.2 }
          ]
        })
      });
      await server.fetchJson("/api/platform/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "platform-text-secret-9999",
          name: "平台 DeepSeek",
          vendor: "deepseek",
          baseUrl: "https://platform-text.example.test",
          model: "deepseek-v4-pro",
          apiMode: "chat_completions",
          priority: 10
        })
      });
      await server.fetchJson("/api/platform/model-configs/openai-compatible-image", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "platform-image-secret-9999",
          name: "平台图片",
          vendor: "openai",
          baseUrl: "https://platform-image.example.test",
          model: "gpt-image-2",
          priority: 10
        })
      });
      await server.fetchJson("/api/platform/model-configs/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "platform-video-secret-9999",
          name: "平台视频",
          vendor: "volcengine",
          baseUrl: "https://platform-video.example.test",
          model: "doubao-seedance-2-0-fast-260128",
          priority: 10
        })
      });
      const providerConfig = await server.fetchJson("/api/provider-config");
      const platformText = providerConfig.textModels.find((model: { apiOwner: string }) => model.apiOwner === "platform");
      const platformImage = providerConfig.imageModels.find((model: { apiOwner: string }) => model.apiOwner === "platform");
      const platformVideo = providerConfig.videoModels.find((model: { apiOwner: string }) => model.apiOwner === "platform");
      expect(platformText).toEqual(expect.objectContaining({
        apiOwner: "platform",
        model: "deepseek-v4-pro"
      }));
      const savedPreference = await server.fetchJson("/api/model-service-preference", {
        method: "PUT",
        body: JSON.stringify({
          serviceMode: "platform",
          textModelConfigId: platformText.configId,
          imageModelConfigId: platformImage.configId,
          videoModelConfigId: platformVideo.configId
        })
      });
      await creditTestWallet(server, 2, "platform model balance");

      const preview = await server.fetchJson("/api/products/import-ai-preview", {
        method: "POST",
        body: JSON.stringify({
          text: "商品名：平台模型 テスト商品"
        })
      });
      const listedPreference = await server.fetchJson("/api/model-service-preference");
      const wallet = await server.fetchJson("/api/wallet");

      expect(savedPreference.preference).toEqual(expect.objectContaining({
        serviceMode: "platform",
        textModelConfigId: platformText.configId,
        imageModelConfigId: platformImage.configId,
        videoModelConfigId: platformVideo.configId
      }));
      expect(listedPreference.preference).toEqual(expect.objectContaining({
        serviceMode: "platform",
        textModelConfigId: platformText.configId,
        imageModelConfigId: platformImage.configId,
        videoModelConfigId: platformVideo.configId
      }));
      expect(preview.product.sku).toBe("PLATFORM-MODE-001");
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://platform-text.example.test/v1/chat/completions");
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({
        authorization: "Bearer platform-text-secret-9999"
      }));
      expect(wallet).toEqual(expect.objectContaining({
        balanceCny: 1.79,
        reservedCny: 0,
        availableCny: 1.79
      }));
    } finally {
      restoreEnv("HAITU_ADMIN_EMAIL", previousAdminEmail);
    }
  });

  it("uses the selected BYOK text model when the service mode is own API", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-service-mode-byok-"));
      tempDirs.push(root);
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sku: "BYOK-MODE-001",
                  title_ja: "自带API テスト商品",
                  category: "テスト",
                  materials: ["PP"],
                  dimensions: "約10cm",
                  verified_selling_points: ["自带API"],
                  usage_scenes: ["デスク"],
                  forbidden_claims: [],
                  reference_images: []
                })
              }
            }
          ],
          usage: {
            total_tokens: 1000
          }
        })
      ) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fetchImpl, autoStartSavedJobs: false });
      await server.fetchJson("/api/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "byok-text-secret-2222",
          name: "用户 DeepSeek",
          vendor: "deepseek",
          baseUrl: "https://byok-text.example.test",
          model: "deepseek-v4-flash",
          apiMode: "chat_completions",
          priority: 10
        })
      });
      await server.fetchJson("/api/model-configs/openai-compatible-image", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "byok-image-secret-2222",
          name: "用户图片",
          vendor: "openai",
          baseUrl: "https://byok-image.example.test",
          model: "gpt-image-2",
          priority: 10
        })
      });
      await server.fetchJson("/api/model-configs/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "byok-video-secret-2222",
          name: "用户视频",
          vendor: "volcengine",
          baseUrl: "https://byok-video.example.test",
          model: "doubao-seedance-2-0-fast-260128",
          priority: 10
        })
      });
      const providerConfig = await server.fetchJson("/api/provider-config");
      const byokText = providerConfig.textModels.find((model: { apiOwner: string }) => model.apiOwner === "byok");
      const byokImage = providerConfig.imageModels.find((model: { apiOwner: string }) => model.apiOwner === "byok");
      const byokVideo = providerConfig.videoModels.find((model: { apiOwner: string }) => model.apiOwner === "byok");
      await server.fetchJson("/api/model-service-preference", {
        method: "PUT",
        body: JSON.stringify({
          serviceMode: "byok",
          textModelConfigId: byokText.configId,
          imageModelConfigId: byokImage.configId,
          videoModelConfigId: byokVideo.configId
        })
      });
      await creditTestWallet(server, 1, "byok model balance");

      const preview = await server.fetchJson("/api/products/import-ai-preview", {
        method: "POST",
        body: JSON.stringify({
          text: "商品名：自带API テスト商品"
        })
      });
      const wallet = await server.fetchJson("/api/wallet");

      expect(preview.product.sku).toBe("BYOK-MODE-001");
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://byok-text.example.test/v1/chat/completions");
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({
        authorization: "Bearer byok-text-secret-2222"
      }));
      expect(wallet).toEqual(expect.objectContaining({
        balanceCny: 0.8,
        reservedCny: 0,
        availableCny: 0.8
      }));
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("charges only the platform service fee when users generate video with their own BYOK API", async () => {
    const previousSeedanceKey = process.env.SEEDANCE_API_KEY;
    const previousArkKey = process.env.ARK_API_KEY;
    const previousAdminEmail = process.env.HAITU_ADMIN_EMAIL;
    delete process.env.SEEDANCE_API_KEY;
    delete process.env.ARK_API_KEY;
    process.env.HAITU_ADMIN_EMAIL = "console-test@example.com";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-wallet-byok-video-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const outputsDir = testJobsDir(root);
      const productPath = testProductPath(fixturesDir, "wallet-byok");
      await writeProduct(productPath, {
        sku: "WALLET-BYOK-001",
        title_ja: "BYOK ミニ財布",
        reference_images: ["main.jpg"]
      });
      await writeFile(productAssetPath(productPath, "main.jpg"), Buffer.from("main-image"));
      const server = createConsoleServer({
        rootDir: root,
        fixturesDir,
        outputsDir,
        runMakeVideoPipeline: async (input) => ({
          type: "haitu_make_video_report",
          status: "completed",
          productSku: "WALLET-BYOK-001",
          provider: input.providerName,
          durationSeconds: input.durationSeconds,
          paidRequestConfirmed: input.confirmPaid,
          raw: {
            manifestPath: join(input.outDir, "raw", "manifest.json"),
            outputPath: join(input.outDir, "raw", "video.mp4")
          },
          billing: {
            tokenPriceCnyPerMillion: 37,
            totalTokens: 100000,
            estimatedCostCny: 3.7
          },
          totalCost: {
            amount: 3.7,
            currency: "CNY"
          },
          reusedRawManifest: false,
          recoveredRawOutput: false,
          reportPath: join(input.outDir, "make-video-report.json")
        })
      });
      await server.fetchJson("/api/admin/billing-settings", {
        method: "PUT",
        body: JSON.stringify({
          rules: [
            { usageKind: "video", serviceFeeCny: 1.5 }
          ]
        })
      });
      await server.fetchJson("/api/model-configs/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "byok-video-secret-1234",
          name: "用户自带视频",
          vendor: "volcengine",
          baseUrl: "https://byok-video.example.test",
          model: "doubao-seedance-2-0-fast-260128"
        })
      });
      await creditTestWallet(server, 5, "BYOK service fee balance");

      const queued = await server.fetchJson("/api/video-jobs", {
        method: "POST",
        body: JSON.stringify({
          productPath,
          provider: "volcengine-seedance",
          duration: 8,
          template: "scene",
          confirmPaid: true
        })
      });
      await waitForJobStatus(server, queued.job.id, "completed");
      const wallet = await server.fetchJson("/api/wallet");
      const latest = await server.fetchJson(`/api/video-jobs/${queued.job.id}`);

      expect(latest.job).toEqual(expect.objectContaining({
        apiBillingMode: "byok",
        platformFeeCny: 1.5,
        upstreamEstimatedCostCny: 0
      }));
      expect(wallet).toEqual(expect.objectContaining({
        balanceCny: 3.5,
        reservedCny: 0,
        availableCny: 3.5
      }));
      expect(wallet.transactions.map((tx: { type: string; amountCny: number }) => [tx.type, tx.amountCny])).toEqual([
        ["charge", -1.5],
        ["reserve", -1.5],
        ["recharge", 5]
      ]);
    } finally {
      restoreEnv("SEEDANCE_API_KEY", previousSeedanceKey);
      restoreEnv("ARK_API_KEY", previousArkKey);
      restoreEnv("HAITU_ADMIN_EMAIL", previousAdminEmail);
    }
  });

  it("lets admins provide platform model configs and charges wallet for platform-hosted video generation", async () => {
    const previousAdminEmail = process.env.HAITU_ADMIN_EMAIL;
    process.env.HAITU_ADMIN_EMAIL = "console-test@example.com";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-wallet-platform-video-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const outputsDir = testJobsDir(root);
      const productPath = testProductPath(fixturesDir, "wallet-platform");
      await writeProduct(productPath, {
        sku: "WALLET-PLATFORM-001",
        title_ja: "平台托管 ミニ財布",
        reference_images: ["main.jpg"]
      });
      await writeFile(productAssetPath(productPath, "main.jpg"), Buffer.from("main-image"));
      const capturedInputs: unknown[] = [];
      const server = createConsoleServer({
        rootDir: root,
        fixturesDir,
        outputsDir,
        runMakeVideoPipeline: async (input) => {
          capturedInputs.push(input);
          return {
            type: "haitu_make_video_report",
            status: "completed",
            productSku: "WALLET-PLATFORM-001",
            provider: input.providerName,
            durationSeconds: input.durationSeconds,
            paidRequestConfirmed: input.confirmPaid,
            raw: {
              manifestPath: join(input.outDir, "raw", "manifest.json"),
              outputPath: join(input.outDir, "raw", "video.mp4")
            },
            billing: {
              tokenPriceCnyPerMillion: 46,
              totalTokens: 60000,
              estimatedCostCny: 2.76
            },
            totalCost: {
              amount: 2.76,
              currency: "CNY"
            },
            reusedRawManifest: false,
            recoveredRawOutput: false,
            reportPath: join(input.outDir, "make-video-report.json")
          };
        }
      });
      await server.fetchJson("/api/admin/billing-settings", {
        method: "PUT",
        body: JSON.stringify({
          rules: [
            { usageKind: "video", serviceFeeCny: 1 }
          ]
        })
      });
      await server.fetchJson("/api/platform/model-configs/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "platform-video-secret-9999",
          name: "平台 Seedance",
          vendor: "volcengine",
          priority: 10,
          baseUrl: "https://platform-video.example.test",
          model: "doubao-seedance-2-0-260128"
        })
      });
      const providerConfig = await server.fetchJson("/api/provider-config");
      const platformVideo = providerConfig.videoModels.find((model: { apiOwner: string }) => model.apiOwner === "platform");
      expect(platformVideo).toEqual(expect.objectContaining({
        apiOwner: "platform",
        model: "doubao-seedance-2-0-260128",
        tokenPriceCnyPerMillion: 46
      }));

      const blocked = await server.fetch("/api/video-jobs", {
        method: "POST",
        body: JSON.stringify({
          productPath,
          provider: "volcengine-seedance",
          providerModelConfigId: platformVideo.configId,
          duration: 8,
          template: "scene",
          confirmPaid: true
        })
      });
      expect(blocked.status).toBe(402);
      await expect(blocked.json()).resolves.toEqual({
        error: "余额不足，请先充值后再生成视频。"
      });

      await creditTestWallet(server, 10, "platform video balance");
      const queued = await server.fetchJson("/api/video-jobs", {
        method: "POST",
        body: JSON.stringify({
          productPath,
          provider: "volcengine-seedance",
          providerModelConfigId: platformVideo.configId,
          duration: 8,
          template: "scene",
          confirmPaid: true
        })
      });
      await waitForJobStatus(server, queued.job.id, "completed");
      const wallet = await server.fetchJson("/api/wallet");

      expect(capturedInputs[0]).toEqual(expect.objectContaining({
        apiKey: "platform-video-secret-9999",
        providerBaseUrl: "https://platform-video.example.test",
        tokenPriceCnyPerMillion: 46
      }));
      expect(wallet).toEqual(expect.objectContaining({
        balanceCny: 6.24,
        reservedCny: 0,
        availableCny: 6.24
      }));
      expect(wallet.transactions.map((tx: { type: string; amountCny: number }) => [tx.type, tx.amountCny])).toEqual([
        ["refund", 0.95],
        ["charge", -3.76],
        ["reserve", -4.71],
        ["recharge", 10]
      ]);
    } finally {
      restoreEnv("HAITU_ADMIN_EMAIL", previousAdminEmail);
    }
  });

  it("lets admins configure platform text image and video models without platform bundles", async () => {
    const previousAdminEmail = process.env.HAITU_ADMIN_EMAIL;
    process.env.HAITU_ADMIN_EMAIL = "console-test@example.com";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-admin-platform-models-"));
      tempDirs.push(root);
      const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

      await server.fetchJson("/api/platform/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "platform-text-secret-123456",
          vendor: "deepseek",
          model: ["deepseek-v4-pro"],
          enabled: true
        })
      });
      await server.fetchJson("/api/platform/model-configs/openai-compatible-image", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "platform-image-secret-abcdef",
          vendor: "openai",
          model: ["gpt-image-2"],
          enabled: true
        })
      });
      await server.fetchJson("/api/platform/model-configs/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "platform-video-secret-fedcba",
          vendor: "volcengine",
          model: ["seedance-2.0-fast"],
          enabled: true
        })
      });

      const providerConfig = await server.fetchJson("/api/provider-config");
      const serialized = JSON.stringify({ providerConfig });
      const database = openDatabase({ dataDir: join(root, "data"), env: process.env });
      const rows = database.sqlite.prepare(`
        SELECT api_owner, encrypted_key, key_preview
        FROM model_credentials
        WHERE api_owner = 'platform'
        ORDER BY provider_id
      `).all() as Array<{ api_owner: string; encrypted_key: string; key_preview: string }>;
      closeDatabase(database);

      expect(providerConfig.textModels).toEqual(expect.arrayContaining([
        expect.objectContaining({
          apiOwner: "platform",
          providerLabel: "deepseek",
          model: "deepseek-v4-pro",
          configured: true
        })
      ]));
      expect(providerConfig.imageModels).toEqual(expect.arrayContaining([
        expect.objectContaining({
          apiOwner: "platform",
          providerLabel: "openai",
          model: "gpt-image-2",
          configured: true
        })
      ]));
      expect(providerConfig.videoModels).toEqual(expect.arrayContaining([
        expect.objectContaining({
          apiOwner: "platform",
          providerLabel: "volcengine",
          model: "doubao-seedance-2-0-fast-260128",
          configured: true
        })
      ]));
      expect(rows).toHaveLength(3);
      expect(rows.some((row) => row.encrypted_key.includes("platform-text-secret-123456"))).toBe(false);
      expect(rows.some((row) => row.encrypted_key.includes("platform-image-secret-abcdef"))).toBe(false);
      expect(rows.some((row) => row.encrypted_key.includes("platform-video-secret-fedcba"))).toBe(false);
      expect(serialized).not.toContain("platform-text-secret-123456");
      expect(serialized).not.toContain("platform-image-secret-abcdef");
      expect(serialized).not.toContain("platform-video-secret-fedcba");
    } finally {
      restoreEnv("HAITU_ADMIN_EMAIL", previousAdminEmail);
    }
  });

  it("lets admins read saved platform model configs without plaintext keys", async () => {
    const previousAdminEmail = process.env.HAITU_ADMIN_EMAIL;
    process.env.HAITU_ADMIN_EMAIL = "console-test@example.com";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-admin-platform-models-read-"));
      tempDirs.push(root);
      const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

      await server.fetchJson("/api/platform/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "platform-read-secret-123456",
          vendor: "deepseek",
          model: ["deepseek-v4-flash"],
          enabled: true
        })
      });

      const response = await server.fetchJson("/api/platform/model-configs");
      const serialized = JSON.stringify(response);

      expect(response.textModels).toEqual([
        expect.objectContaining({
          apiOwner: "platform",
          configured: true,
          keyPreview: "plat...3456",
          model: "deepseek-v4-flash",
          vendor: "deepseek"
        })
      ]);
      expect(response.imageModels).toEqual([]);
      expect(response.videoModels).toEqual([]);
      expect(serialized).not.toContain("platform-read-secret-123456");
    } finally {
      restoreEnv("HAITU_ADMIN_EMAIL", previousAdminEmail);
    }
  });

  it("lets admins reveal and delete saved platform model configs", async () => {
    const previousAdminEmail = process.env.HAITU_ADMIN_EMAIL;
    process.env.HAITU_ADMIN_EMAIL = "console-test@example.com";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-admin-platform-models-reveal-delete-"));
      tempDirs.push(root);
      const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

      await server.fetchJson("/api/platform/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "platform-reveal-secret-123456",
          vendor: "deepseek",
          model: ["deepseek-v4-pro", "deepseek-v4-flash"],
          enabled: true
        })
      });

      const saved = await server.fetchJson("/api/platform/model-configs");
      expect(saved.textModels).toHaveLength(2);
      const configId = saved.textModels[0].configId;
      const credentialId = saved.textModels[0].credentialId;

      const revealed = await server.fetchJson(`/api/platform/model-configs/openai-compatible-text/key?configId=${encodeURIComponent(configId)}`);
      expect(revealed).toEqual({
        ok: true,
        provider: "openai-compatible-text",
        configId,
        apiKey: "platform-reveal-secret-123456",
        keyPreview: "plat...3456"
      });

      await server.fetchJson(`/api/platform/model-configs/openai-compatible-text?configId=${encodeURIComponent(configId)}`, {
        method: "DELETE"
      });
      const afterDelete = await server.fetchJson("/api/platform/model-configs");
      expect(afterDelete.textModels.some((model: { credentialId?: string }) => model.credentialId === credentialId)).toBe(false);
      expect(JSON.stringify(afterDelete)).not.toContain("platform-reveal-secret-123456");
    } finally {
      restoreEnv("HAITU_ADMIN_EMAIL", previousAdminEmail);
    }
  });

  it("returns credential ids for grouped platform model variants", async () => {
    const previousAdminEmail = process.env.HAITU_ADMIN_EMAIL;
    process.env.HAITU_ADMIN_EMAIL = "console-test@example.com";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-admin-platform-models-grouped-"));
      tempDirs.push(root);
      const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

      await server.fetchJson("/api/platform/model-configs/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "platform-grouped-video-secret-123456",
          name: "Seedance",
          vendor: "volcengine",
          baseUrl: "https://ark.cn-beijing.volces.com",
          model: ["seedance-2.0-fast", "seedance-2.0"],
          enabled: true
        })
      });

      const response = await server.fetchJson("/api/platform/model-configs");
      const credentialIds = response.videoModels.map((model: { credentialId?: string }) => model.credentialId);

      expect(response.videoModels).toHaveLength(2);
      expect(credentialIds.every(Boolean)).toBe(true);
      expect(new Set(credentialIds).size).toBe(1);
      expect(response.videoModels.map((model: { model: string }) => model.model)).toEqual([
        "doubao-seedance-2-0-fast-260128",
        "doubao-seedance-2-0-260128"
      ]);
    } finally {
      restoreEnv("HAITU_ADMIN_EMAIL", previousAdminEmail);
    }
  });

  it("lets admins keep multiple platform configs per model kind with custom base urls", async () => {
    const previousAdminEmail = process.env.HAITU_ADMIN_EMAIL;
    process.env.HAITU_ADMIN_EMAIL = "console-test@example.com";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-admin-platform-models-multi-"));
      tempDirs.push(root);
      const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

      await server.fetchJson("/api/platform/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "platform-deepseek-secret-123456",
          vendor: "deepseek",
          baseUrl: "https://deepseek-proxy.example.test",
          model: ["deepseek-v4-pro"],
          priority: 90,
          enabled: true
        })
      });
      await server.fetchJson("/api/platform/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "platform-openai-secret-abcdef",
          vendor: "openai",
          baseUrl: "https://openai-proxy.example.test",
          model: ["gpt-5.5"],
          priority: 100,
          enabled: true
        })
      });

      const response = await server.fetchJson("/api/platform/model-configs");
      const providerConfig = await server.fetchJson("/api/provider-config");
      const serialized = JSON.stringify({ response, providerConfig });

      expect(response.textModels).toEqual([
        expect.objectContaining({
          vendor: "openai",
          model: "gpt-5.5",
          baseUrl: "https://openai-proxy.example.test",
          keyPreview: "plat...cdef"
        }),
        expect.objectContaining({
          vendor: "deepseek",
          model: "deepseek-v4-pro",
          baseUrl: "https://deepseek-proxy.example.test",
          keyPreview: "plat...3456"
        })
      ]);
      expect(providerConfig.textModels).toEqual(expect.arrayContaining([
        expect.objectContaining({
          apiOwner: "platform",
          providerLabel: "openai",
          baseUrl: "https://openai-proxy.example.test",
          model: "gpt-5.5"
        }),
        expect.objectContaining({
          apiOwner: "platform",
          providerLabel: "deepseek",
          baseUrl: "https://deepseek-proxy.example.test",
          model: "deepseek-v4-pro"
        })
      ]));
      expect(serialized).not.toContain("platform-deepseek-secret-123456");
      expect(serialized).not.toContain("platform-openai-secret-abcdef");
    } finally {
      restoreEnv("HAITU_ADMIN_EMAIL", previousAdminEmail);
    }
  });

  it("charges only the platform service fee for BYOK AI product import", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-wallet-byok-text-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sku: "TEXT-BYOK-001",
                  title_ja: "BYOK AI整理 テスト商品",
                  category: "テスト",
                  materials: ["PP"],
                  dimensions: "約10cm",
                  verified_selling_points: ["AI整理"],
                  usage_scenes: ["デスク"],
                  forbidden_claims: [],
                  reference_images: []
                })
              }
            }
          ],
          usage: {
            total_tokens: 1000
          }
        })
      ) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fixturesDir, fetchImpl, autoStartSavedJobs: false });
      await server.fetchJson("/api/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "byok-text-secret-1234",
          name: "用户自带文本",
          vendor: "deepseek",
          baseUrl: "https://api.deepseek.com",
          model: "deepseek-v4-pro",
          apiMode: "chat_completions"
        })
      });
      const blocked = await server.fetch("/api/products/import-ai-preview", {
        method: "POST",
        body: JSON.stringify({
          text: "商品名：BYOK AI整理 テスト商品"
        })
      });
      expect(blocked.status).toBe(402);
      await expect(blocked.json()).resolves.toEqual({
        error: "余额不足，请先充值后再使用 AI 功能。"
      });
      await creditTestWallet(server, 1, "BYOK text balance");

      const preview = await server.fetchJson("/api/products/import-ai-preview", {
        method: "POST",
        body: JSON.stringify({
          text: "商品名：BYOK AI整理 テスト商品"
        })
      });
      const wallet = await server.fetchJson("/api/wallet");

      expect(preview.product.sku).toBe("TEXT-BYOK-001");
      expect(wallet).toEqual(expect.objectContaining({
        balanceCny: 0.8,
        reservedCny: 0,
        availableCny: 0.8
      }));
      expect(wallet.transactions.map((tx: { type: string; amountCny: number; description?: string }) => [tx.type, tx.amountCny, tx.description])).toEqual([
        ["charge", -0.2, "AI 资料整理扣费"],
        ["reserve", -0.2, "AI 资料整理预扣"],
        ["recharge", 1, "BYOK text balance"]
      ]);
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("charges platform fee and upstream estimate for platform-hosted image generation", async () => {
    const previousAdminEmail = process.env.HAITU_ADMIN_EMAIL;
    process.env.HAITU_ADMIN_EMAIL = "console-test@example.com";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-wallet-platform-image-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const productPath = testProductPath(fixturesDir, "wallet-image");
      await writeProduct(productPath, {
        sku: "IMG-WALLET-001",
        title_ja: "平台图片 テスト商品",
        reference_images: []
      });
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          data: [
            { b64_json: Buffer.from("generated-one").toString("base64"), mime_type: "image/png" },
            { b64_json: Buffer.from("generated-two").toString("base64"), mime_type: "image/png" }
          ]
        })
      ) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fixturesDir, fetchImpl, autoStartSavedJobs: false });
      await server.fetchJson("/api/admin/billing-settings", {
        method: "PUT",
        body: JSON.stringify({
          rules: [
            { usageKind: "image", serviceFeeCny: 0.3 }
          ]
        })
      });
      await server.fetchJson("/api/platform/model-configs/openai-compatible-image", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "platform-image-secret-9999",
          name: "平台图片",
          vendor: "openai",
          baseUrl: "https://platform-image.example.test",
          model: "gpt-image-2",
          priority: 10
        })
      });
      const providerConfig = await server.fetchJson("/api/provider-config");
      const platformImage = providerConfig.imageModels.find((model: { apiOwner: string }) => model.apiOwner === "platform");
      expect(platformImage).toEqual(expect.objectContaining({
        apiOwner: "platform",
        model: "gpt-image-2"
      }));

      const blocked = await server.fetch("/api/products/IMG-WALLET-001/reference-images/generate", {
        method: "POST",
        body: JSON.stringify({
          count: 2,
          imageModelConfigId: platformImage.configId
        })
      });
      expect(blocked.status).toBe(402);
      await expect(blocked.json()).resolves.toEqual({
        error: "余额不足，请先充值后再使用 AI 功能。"
      });
      await creditTestWallet(server, 5, "platform image balance");

      const generated = await server.fetchJson("/api/products/IMG-WALLET-001/reference-images/generate", {
        method: "POST",
        body: JSON.stringify({
          count: 2,
          imageModelConfigId: platformImage.configId
        })
      });
      const wallet = await server.fetchJson("/api/wallet");

      expect(generated.generated).toHaveLength(2);
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://platform-image.example.test/v1/images/generations");
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({
        authorization: "Bearer platform-image-secret-9999"
      }));
      expect(wallet).toEqual(expect.objectContaining({
        balanceCny: 3.8,
        reservedCny: 0,
        availableCny: 3.8
      }));
      expect(wallet.transactions.map((tx: { type: string; amountCny: number; description?: string }) => [tx.type, tx.amountCny, tx.description])).toEqual([
        ["charge", -1.2, "AI 图片生成扣费"],
        ["reserve", -1.2, "AI 图片生成预扣"],
        ["recharge", 5, "platform image balance"]
      ]);
    } finally {
      restoreEnv("HAITU_ADMIN_EMAIL", previousAdminEmail);
    }
  });

  it("uses unified model config tables as the API management source of truth", async () => {
    const previousSecretKey = process.env.HAITU_SECRET_KEY;
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.HAITU_SECRET_KEY = "0123456789abcdef0123456789abcdef";
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-model-config-source-"));
      tempDirs.push(root);
      const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });
      const session = await registerConsoleUser(testDataDir(root), server, "sqlite-migrate@example.com");

      await server.fetchJson("/api/model-configs/openai-compatible-text", {
        method: "PUT",
        headers: { cookie: session.cookie },
        body: JSON.stringify({
          configId: "unified-text",
          apiKey: "legacy-text-secret-123456",
          name: "Unified Text",
          vendor: "deepseek",
          priority: 5,
          baseUrl: "https://api.deepseek.com/",
          model: "deepseek-v4-pro",
          apiMode: "chat_completions",
          enabled: true
        })
      });

      const firstConfig = await server.fetchJson("/api/provider-config", {
        headers: { cookie: session.cookie }
      });
      expect(firstConfig.textModels[0]).toEqual(expect.objectContaining({
        configId: "unified-text",
        configured: true,
        keySource: "LOCAL_BYOK",
        keyPreview: "lega...3456",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-pro",
        apiMode: "chat_completions"
      }));

      const handle = openDatabase({ dataDir: testDataDir(root), env: process.env });
      try {
        runMigrations(handle);
        handle.sqlite.prepare(`
          UPDATE model_credentials
          SET
            encrypted_key = @encryptedKey,
            key_preview = 'dbfi...9999',
            base_url = 'https://sqlite-first.example',
            api_mode = 'responses_stream'
          WHERE provider_id = 'openai-compatible-text'
            AND credential_id = (
              SELECT credential_id FROM model_variants
              WHERE provider_id = 'openai-compatible-text' AND config_id = 'unified-text'
              LIMIT 1
            )
            AND workspace_id = @workspaceId
        `).run({
          workspaceId: session.workspaceId,
          encryptedKey: encryptSecret("dbfirst-secret-9999", process.env.HAITU_SECRET_KEY)
        });
        handle.sqlite.prepare(`
          UPDATE model_variants
          SET model = 'gpt-5.5'
          WHERE provider_id = 'openai-compatible-text'
            AND config_id = 'unified-text'
            AND workspace_id = @workspaceId
        `).run({
          workspaceId: session.workspaceId
        });
      } finally {
        closeDatabase(handle);
      }

      const secondConfig = await server.fetchJson("/api/provider-config", {
        headers: { cookie: session.cookie }
      });
      expect(secondConfig.textModels[0]).toEqual(expect.objectContaining({
        keyPreview: "dbfi...9999",
        baseUrl: "https://sqlite-first.example",
        model: "gpt-5.5",
        apiMode: "responses_stream"
      }));
    } finally {
      restoreEnv("HAITU_SECRET_KEY", previousSecretKey);
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("stores local BYOK keys for text and image models without exposing secrets", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    const previousImageKey = process.env.IMAGE_MODEL_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.IMAGE_MODEL_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-model-key-store-"));
      tempDirs.push(root);
      const outputsDir = testJobsDir(root);
      const server = createConsoleServer({ rootDir: root, outputsDir });

      const savedText = await server.fetchJson("/api/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "text-model-secret-key-123456",
          name: "DeepSeek 推荐-文本",
          vendor: "deepseek",
          priority: 8,
          baseUrl: "https://api.deepseek.com/",
          model: "deepseek-v4-pro",
          apiMode: "chat_completions"
        })
      });
      const savedImage = await server.fetchJson("/api/model-configs/openai-compatible-image", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "image-model-secret-key-abcdef"
        })
      });

      expect(JSON.stringify(savedText)).not.toContain("text-model-secret-key-123456");
      expect(JSON.stringify(savedImage)).not.toContain("image-model-secret-key-abcdef");
      expect(savedText.provider).toEqual(expect.objectContaining({
        id: "openai-compatible-text",
        configured: true,
        keySource: "LOCAL_BYOK",
        keyPreview: "text...3456"
      }));
      expect(savedImage.provider).toEqual(expect.objectContaining({
        id: "openai-compatible-image",
        configured: true,
        keySource: "LOCAL_BYOK",
        keyPreview: "imag...cdef"
      }));

      const storedTextKey = await readStoredModelCredential(root, "openai-compatible-text");
      const storedImageKey = await readStoredModelCredential(root, "openai-compatible-image");
      expect(storedTextKey).toEqual(expect.objectContaining({
        key_preview: "text...3456",
        base_url: "https://api.deepseek.com",
        model: "deepseek-v4-pro",
        api_mode: "chat_completions"
      }));
      expect(storedImageKey).toEqual(expect.objectContaining({
        key_preview: "imag...cdef"
      }));
      expect(storedTextKey.encrypted_key).not.toContain("text-model-secret-key-123456");
      expect(storedImageKey.encrypted_key).not.toContain("image-model-secret-key-abcdef");

      const config = await server.fetchJson("/api/provider-config");
      expect(JSON.stringify(config)).not.toContain("text-model-secret-key-123456");
      expect(JSON.stringify(config)).not.toContain("image-model-secret-key-abcdef");
      expect(config.textModels[0]).toEqual(expect.objectContaining({
        label: "DeepSeek 推荐-文本",
        providerLabel: "deepseek",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-pro",
        apiMode: "chat_completions",
        configured: true,
        keySource: "LOCAL_BYOK",
        keyPreview: "text...3456"
      }));
      expect(config.imageModels[0]).toEqual(expect.objectContaining({
        configured: true,
        keySource: "LOCAL_BYOK",
        keyPreview: "imag...cdef"
      }));

      const revealedText = await server.fetchJson(`/api/model-configs/openai-compatible-text/key?configId=${encodeURIComponent(config.textModels[0].configId)}`);
      const revealedImage = await server.fetchJson(`/api/model-configs/openai-compatible-image/key?configId=${encodeURIComponent(config.imageModels[0].configId)}`);
      expect(revealedText).toEqual({
        ok: true,
        provider: "openai-compatible-text",
        configId: config.textModels[0].configId,
        apiKey: "text-model-secret-key-123456",
        keyPreview: "text...3456"
      });
      expect(revealedImage).toEqual({
        ok: true,
        provider: "openai-compatible-image",
        configId: config.imageModels[0].configId,
        apiKey: "image-model-secret-key-abcdef",
        keyPreview: "imag...cdef"
      });
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
      restoreEnv("IMAGE_MODEL_API_KEY", previousImageKey);
    }
  });

  it("splits a batch text model save into one credential and multiple selectable variants", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-text-model-variants-"));
      tempDirs.push(root);
      const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

      const saved = await server.fetchJson("/api/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "text-variant-secret-key-123456",
          name: "DeepSeek 文本",
          vendor: "deepseek",
          priority: 7,
          baseUrl: "https://api.deepseek.com/",
          model: "deepseek-v4-pro, deepseek-v4-flash",
          apiMode: "chat_completions"
        })
      });
      const config = await server.fetchJson("/api/provider-config");
      const stored = await readStoredTextModelRows(root);

      expect(JSON.stringify(saved)).not.toContain("text-variant-secret-key-123456");
      expect(JSON.stringify(config)).not.toContain("text-variant-secret-key-123456");
      expect(saved.provider).toEqual(expect.objectContaining({
        id: "openai-compatible-text",
        configured: true,
        keySource: "LOCAL_BYOK",
        keyPreview: "text...3456"
      }));
      expect(config.textModels).toHaveLength(2);
      expect(config.textModels.map((item: { model: string }) => item.model)).toEqual([
        "deepseek-v4-pro",
        "deepseek-v4-flash"
      ]);
      expect(config.textModels.map((item: { label: string }) => item.label)).toEqual([
        "DeepSeek 文本",
        "DeepSeek 文本"
      ]);
      expect(config.textModels).toEqual(config.textModels.map((item: Record<string, unknown>) => expect.objectContaining({
        id: "openai-compatible-text",
        providerLabel: "deepseek",
        configured: true,
        keySource: "LOCAL_BYOK",
        keyPreview: "text...3456",
        baseUrl: "https://api.deepseek.com",
        apiMode: "chat_completions",
        modelKind: "text"
      })));
      expect(new Set(config.textModels.map((item: { configId: string }) => item.configId)).size).toBe(2);
      expect(stored.credentials).toEqual([
        expect.objectContaining({
          key_preview: "text...3456",
          name: "DeepSeek 文本",
          vendor: "deepseek",
          base_url: "https://api.deepseek.com",
          api_mode: "chat_completions"
        })
      ]);
      expect(stored.credentials[0]?.encrypted_key).not.toContain("text-variant-secret-key-123456");
      expect(stored.variants.map((row) => row.model)).toEqual([
        "deepseek-v4-pro",
        "deepseek-v4-flash"
      ]);
      expect(new Set(stored.variants.map((row) => row.credential_id))).toEqual(new Set([stored.credentials[0]?.credential_id]));
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("updates provider config after unchecked text model variants are saved", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-text-model-uncheck-api-"));
      tempDirs.push(root);
      const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

      await server.fetchJson("/api/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "text-variant-secret-key-123456",
          name: "DeepSeek 文本",
          vendor: "deepseek",
          priority: 7,
          baseUrl: "https://api.deepseek.com/",
          model: ["deepseek-v4-pro", "deepseek-v4-flash"],
          apiMode: "chat_completions"
        })
      });
      const firstConfig = await server.fetchJson("/api/provider-config");
      const firstConfigId = firstConfig.textModels[0]?.configId;

      await server.fetchJson("/api/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          configId: firstConfigId,
          name: "DeepSeek 文本",
          vendor: "deepseek",
          priority: 7,
          baseUrl: "https://api.deepseek.com/",
          model: ["deepseek-v4-pro"],
          apiMode: "chat_completions"
        })
      });

      const updatedConfig = await server.fetchJson("/api/provider-config");
      expect(updatedConfig.textModels.map((item: { model: string }) => item.model)).toEqual(["deepseek-v4-pro"]);
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("reinfers text API mode from edited model config when no mode is submitted", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-text-model-mode-reinfer-"));
      tempDirs.push(root);
      const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

      await server.fetchJson("/api/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "text-mode-reinfer-secret-123456",
          name: "OpenAI 文本",
          vendor: "openai",
          baseUrl: "https://api.openai.com",
          model: "gpt-5.5",
          apiMode: "responses_stream"
        })
      });
      const openAiConfig = await server.fetchJson("/api/provider-config");
      expect(openAiConfig.textModels[0]).toEqual(expect.objectContaining({
        apiMode: "responses_stream"
      }));

      await server.fetchJson("/api/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          configId: openAiConfig.textModels[0].configId,
          name: "DeepSeek 文本",
          vendor: "deepseek",
          baseUrl: "https://api.deepseek.com",
          model: "deepseek-v4-pro"
        })
      });
      const deepSeekConfig = await server.fetchJson("/api/provider-config");
      const stored = await readStoredTextModelRows(root);

      expect(deepSeekConfig.textModels[0]).toEqual(expect.objectContaining({
        providerLabel: "deepseek",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-pro",
        apiMode: "chat_completions"
      }));
      expect(stored.credentials[0]).toEqual(expect.objectContaining({
        vendor: "deepseek",
        base_url: "https://api.deepseek.com",
        api_mode: "chat_completions"
      }));
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("uses a manually selected text model variant for AI product import", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-text-model-manual-select-"));
      tempDirs.push(root);
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sku: "MANUAL-FLASH-001",
                  title_ja: "Flash手动选择 テスト商品",
                  category: "テスト",
                  materials: ["PP"],
                  dimensions: "約10cm",
                  verified_selling_points: ["手动选择版本"],
                  usage_scenes: ["デスク"],
                  forbidden_claims: [],
                  reference_images: []
                })
              }
            }
          ]
        })
      ) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fetchImpl, autoStartSavedJobs: false });
      await server.fetchJson("/api/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "manual-selection-secret-123456",
          name: "DeepSeek 文本",
          vendor: "deepseek",
          priority: 5,
          baseUrl: "https://api.deepseek.com",
          model: "deepseek-v4-pro, deepseek-v4-flash",
          apiMode: "chat_completions"
        })
      });
      const config = await server.fetchJson("/api/provider-config");
      const flashConfig = config.textModels.find((item: { model: string }) => item.model === "deepseek-v4-flash");

      expect(flashConfig).toBeDefined();
      await topUpWalletForAiUsage(server);
      const response = await server.fetchJson("/api/products/import-ai-preview", {
        method: "POST",
        body: JSON.stringify({
          text: "商品名：Flash手动选择 テスト商品",
          textModelConfigId: flashConfig.configId
        })
      });

      expect(response.product.sku).toBe("MANUAL-FLASH-001");
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://api.deepseek.com/v1/chat/completions");
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({
        authorization: "Bearer manual-selection-secret-123456"
      }));
      const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body));
      expect(body.model).toBe("deepseek-v4-flash");
      expect(body.messages.at(-1).content).toContain("Flash手动选择");
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("tests provider model configs against the real provider endpoint without saving secrets", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-provider-test-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url);
      if (path === "https://api.openai.com/v1/responses") {
        return new Response([
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "{\"ok\":true}" })}\n\n`,
          "data: [DONE]\n\n"
        ].join(""), {
          status: 200,
          headers: { "content-type": "text/event-stream" }
        });
      }
      if (path === "https://api.openai.com/v1/chat/completions") {
        return jsonResponse({
          choices: [{ message: { content: "{\"ok\":true}" } }]
        });
      }
      if (path === "https://api.openai.com/v1/images/generations") {
        return jsonResponse({
          data: [{ b64_json: Buffer.from("fake image").toString("base64"), mime_type: "image/png" }]
        });
      }
      if (path.startsWith("https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks?")) {
        return jsonResponse({
          total: 0,
          items: []
        });
      }
      throw new Error(`Unexpected URL: ${path}`);
    }) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, outputsDir, fetchImpl });

    const text = await server.fetchJson("/api/model-configs/openai-compatible-text/test", {
      method: "POST",
      body: JSON.stringify({
        apiKey: "text-test-secret",
        baseUrl: "https://api.openai.com",
        model: "gpt-5.5"
      })
    });
    const image = await server.fetchJson("/api/model-configs/openai-compatible-image/test", {
      method: "POST",
      body: JSON.stringify({
        apiKey: "image-test-secret",
        baseUrl: "https://api.openai.com",
        model: "gpt-image-2"
      })
    });
    const video = await server.fetchJson("/api/model-configs/volcengine-seedance/test", {
      method: "POST",
      body: JSON.stringify({
        apiKey: "video-test-secret",
        baseUrl: "https://ark.cn-beijing.volces.com",
        model: "doubao-seedance-2-0-260128"
      })
    });

    expect(text).toEqual(expect.objectContaining({
      ok: true,
      provider: "openai-compatible-text",
      model: "gpt-5.5"
    }));
    expect(image).toEqual(expect.objectContaining({
      ok: true,
      provider: "openai-compatible-image",
      model: "gpt-image-2"
    }));
    expect(video).toEqual(expect.objectContaining({
      ok: true,
      provider: "volcengine-seedance",
      model: "doubao-seedance-2-0-260128"
    }));
    expect(JSON.stringify(text)).not.toContain("text-test-secret");
    expect(JSON.stringify(image)).not.toContain("image-test-secret");
    expect(JSON.stringify(video)).not.toContain("video-test-secret");
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({
      authorization: "Bearer text-test-secret"
    }));
    expect(vi.mocked(fetchImpl).mock.calls[1]?.[1]?.headers).toEqual(expect.objectContaining({
      authorization: "Bearer image-test-secret"
    }));
    expect(vi.mocked(fetchImpl).mock.calls[2]?.[1]?.method).toBe("GET");
    expect(vi.mocked(fetchImpl).mock.calls[2]?.[1]?.headers).toEqual(expect.objectContaining({
      authorization: "Bearer video-test-secret"
    }));
  });

  it("tests edited text model configs with inferred mode when no mode is submitted", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-provider-test-mode-reinfer-"));
      tempDirs.push(root);
      const fetchImpl = vi.fn(async (input) => {
        const path = String(input);
        if (path === "https://api.deepseek.com/v1/chat/completions") {
          return jsonResponse({
            choices: [{ message: { content: "{\"ok\":true}" } }]
          });
        }
        throw new Error(`Unexpected URL: ${path}`);
      }) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fetchImpl });

      await server.fetchJson("/api/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "text-test-mode-reinfer-secret-123456",
          vendor: "openai",
          baseUrl: "https://api.openai.com",
          model: "gpt-5.5",
          apiMode: "responses_stream"
        })
      });
      const config = await server.fetchJson("/api/provider-config");
      const tested = await server.fetchJson("/api/model-configs/openai-compatible-text/test", {
        method: "POST",
        body: JSON.stringify({
          configId: config.textModels[0].configId,
          baseUrl: "https://api.deepseek.com",
          model: "deepseek-v4-pro"
        })
      });

      expect(tested).toEqual(expect.objectContaining({
        ok: true,
        provider: "openai-compatible-text",
        model: "deepseek-v4-pro"
      }));
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://api.deepseek.com/v1/chat/completions");
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({
        authorization: "Bearer text-test-mode-reinfer-secret-123456"
      }));
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("times out provider config tests with a clear error", async () => {
    const previousTimeout = process.env.PROVIDER_CONFIG_TEST_TIMEOUT_MS;
    process.env.PROVIDER_CONFIG_TEST_TIMEOUT_MS = "20";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-provider-test-timeout-"));
      tempDirs.push(root);
      const fetchImpl = vi.fn(async () => new Promise<Response>(() => undefined)) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fetchImpl });

      const response = await server.fetch("/api/model-configs/openai-compatible-text/test", {
        method: "POST",
        body: JSON.stringify({
          apiKey: "text-test-secret",
          baseUrl: "https://api.openai.com",
          model: "gpt-5.5"
        })
      });

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "模型测试超时，请检查 Base URL、网络或服务商状态。"
      });
    } finally {
      restoreEnv("PROVIDER_CONFIG_TEST_TIMEOUT_MS", previousTimeout);
    }
  });

  it("keeps multiple model configs per type and uses the most recently saved text config by default", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-multi-model-config-"));
      tempDirs.push(root);
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          output_text: JSON.stringify({
            sku: "MULTI-001",
            title_ja: "優先モデル テスト商品",
            category: "テスト",
            materials: ["ABS"],
            dimensions: "10x10x10cm",
            verified_selling_points: ["整理しやすい"],
            usage_scenes: ["デスク"],
            forbidden_claims: ["防水未確認"],
            reference_images: ["multi-01.jpg"]
          }),
          usage: {
            total_tokens: 123
          }
        })
      ) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fetchImpl });

      await server.fetchJson("/api/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "older-text-secret-0001",
          name: "旧文本服务",
          vendor: "openai",
          priority: 100,
          baseUrl: "https://api.deepseek.com",
          model: "deepseek-v4-flash"
        })
      });
      await sleep(5);
      await server.fetchJson("/api/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "newer-text-secret-9999",
          name: "新文本服务",
          vendor: "openai",
          priority: 1,
          baseUrl: "https://api.openai.com/",
          model: "gpt-5.5"
        })
      });

      const config = await server.fetchJson("/api/provider-config");
      expect(config.textModels).toHaveLength(2);
      expect(config.textModels.map((item: { label: string }) => item.label)).toEqual(["新文本服务", "旧文本服务"]);
      expect(config.textModels).toEqual(config.textModels.map((item: Record<string, unknown>) => expect.not.objectContaining({
        priority: expect.any(Number)
      })));
      expect(JSON.stringify(config)).not.toContain("newer-text-secret-9999");
      expect(JSON.stringify(config)).not.toContain("older-text-secret-0001");

      await topUpWalletForAiUsage(server);
      await server.fetchJson("/api/products/import-ai-preview", {
        method: "POST",
        body: JSON.stringify({
          text: "商品名：優先モデル テスト商品"
        })
      });

      expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/responses");
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({
        authorization: "Bearer newer-text-secret-9999"
      }));
      const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body));
      expect(body.model).toBe("gpt-5.5");
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("uses the local BYOK video model config for read-only usage checks when env keys are absent", async () => {
    const previousSeedanceKey = process.env.SEEDANCE_API_KEY;
    const previousArkKey = process.env.ARK_API_KEY;
    delete process.env.SEEDANCE_API_KEY;
    delete process.env.ARK_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-model-config-usage-"));
      tempDirs.push(root);
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          id: "cgt-byok-usage",
          model: "doubao-seedance-2-0-fast-260128",
          status: "succeeded",
          usage: {
            total_tokens: 1000
          },
          resolution: "480p",
          ratio: "9:16",
          duration: 8
        })
      ) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fetchImpl });
      await server.fetchJson("/api/model-configs/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "byok-usage-secret-1234"
        })
      });

      await server.fetchJson("/api/provider-tasks/cgt-byok-usage");

      expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.headers).toEqual({
        authorization: "Bearer byok-usage-secret-1234"
      });
    } finally {
      restoreEnv("SEEDANCE_API_KEY", previousSeedanceKey);
      restoreEnv("ARK_API_KEY", previousArkKey);
    }
  });

  it("consolidates product management into video creation", async () => {
    const appSource = await readFile(join(process.cwd(), "src", "client", "App.tsx"), "utf8");

    const primaryNavSource = appSource.slice(appSource.indexOf("const primaryNavItems"), appSource.indexOf("const managementNavItems"));
    expect(primaryNavSource).toContain('labelKey: "creative"');
    expect(primaryNavSource).not.toContain('labelKey: "image"');
    expect(primaryNavSource).toContain('labelKey: "ledger"');
    expect(primaryNavSource).not.toContain("商品管理");
    expect(primaryNavSource).not.toContain("审核发布");
    expect(primaryNavSource).not.toContain("商品项目");
    expect(primaryNavSource).not.toContain("后台记录");

    expect(appSource).not.toContain("hiddenNavItems");
    expect(appSource).not.toContain('case "products"');
    expect(appSource).not.toContain('aria-label="商品管理"');

    const renderCreativeWorkspaceSource = sourceBetween(appSource, "function renderCreativeWorkspace", "function renderActiveSection");
    const videoCase = appSource.slice(appSource.indexOf('case "video"'), appSource.indexOf('case "ledger"'));
    expect(renderCreativeWorkspaceSource).toContain("<ProductCreationWorkspace");
    expect(renderCreativeWorkspaceSource).toContain("onDeleteProduct={deleteProduct}");
    expect(videoCase).toContain('case "image"');
    expect(renderCreativeWorkspaceSource).toContain("mode={creativeWorkspaceMode}");
    expect(videoCase).not.toContain("<VideoJobsPanel");
    expect(videoCase).not.toContain("<ReportsPanel");
    expect(videoCase).not.toContain("手动生成参数");
    expect(videoCase).not.toContain("<StorageBackupPanel");
    expect(videoCase).not.toContain("<AuditLogPanel");
    expect(videoCase).not.toContain("<VideoAssetsPanel");

    expect(renderCreativeWorkspaceSource).toContain("onModeChange={(nextMode) => setActiveSection(nextMode)}");
    expect(videoCase).not.toContain('tApp("image.empty")');

    const productCreationWorkspace = appSource.slice(appSource.indexOf("function ProductCreationWorkspace"), appSource.indexOf("function ProductLibraryHome"));
    expect(productCreationWorkspace).toContain("<ProductCreationComposer");
    expect(productCreationWorkspace).not.toContain("<ProductCreationStartPanel");
    expect(productCreationWorkspace).not.toContain("选择商品开始创作");
    expect(productCreationWorkspace).not.toContain("selectedProductStoryboardHistory");
    expect(productCreationWorkspace).toContain("onOrganizeProductPackage");
    expect(productCreationWorkspace).toContain("onDeleteProduct");
    expect(productCreationWorkspace).not.toContain("ensureVideoProductSelection");

    const loadProductIntoDraftSource = appSource.slice(appSource.indexOf("async function loadProductIntoDraft"), appSource.indexOf("async function openProductStudio"));
    expect(loadProductIntoDraftSource).toContain("if (activeSectionIsCreativeWorkspace)");
    expect(loadProductIntoDraftSource).toContain("applyProductToCreationComposerWithStoryboards(response.product)");
    expect(loadProductIntoDraftSource).toContain("persistProductStudioSku(response.product.sku)");

    expect(appSource).not.toContain("function ProductCreationStartPanel");
    expect(appSource).not.toContain("product-creation-start");
    expect(appSource).toContain("video-product-library-column");
    expect(appSource).not.toContain("选择商品开始创作");
    expect(appSource).not.toContain("开始创作");

    const productLibraryColumnSource = appSource.slice(appSource.indexOf("function ProductCreationProductLibrary"), appSource.indexOf("function ProductCreationOperationWorkspace"));
    expect(appSource).not.toContain("product-studio-topbar");
    expect(appSource).not.toContain("ProductStudioProductPicker");
    expect(productLibraryColumnSource).toContain('tVideo("productLibrary.title")');
    expect(productLibraryColumnSource).toContain('tVideo("newProduct.title")');
    expect(productLibraryColumnSource).toContain("dedupeProductSummaries(products)");
    expect(productLibraryColumnSource).toContain("productLibrarySearchQuery");
    expect(productLibraryColumnSource).toContain("filterProductLibraryProducts(productOptions, productLibrarySearchQuery");
    expect(productLibraryColumnSource).toContain("product-library-search");
    expect(productLibraryColumnSource).toContain('aria-label={tVideo("productLibrary.search")}');
    expect(productLibraryColumnSource).toContain('placeholder={tVideo("productLibrary.search")}');
    expect(productLibraryColumnSource).not.toContain("搜索商品 / SKU");
    expect(productLibraryColumnSource).toContain("product-library-scroll min-h-0 overflow-y-auto");
    expect(productLibraryColumnSource).toContain("filteredProductOptions.map");
    expect(productLibraryColumnSource).toContain('tVideo("productLibrary.noMatches")');
    expect(productLibraryColumnSource).toContain('tVideo("productLibrary.clearSearch")');
    expect(productLibraryColumnSource).toContain("productLibraryStatus(product, tProductStatus)");
    expect(productLibraryColumnSource).toContain("onDeleteProduct");
    expect(productLibraryColumnSource).toContain('tVideo("productLibrary.deleteProduct")');
    expect(productLibraryColumnSource).toContain("onDeleteProduct(product.sku)");
    expect(productLibraryColumnSource).toContain("event.stopPropagation()");
    expect(productLibraryColumnSource).not.toContain("删除当前商品");
    expect(productLibraryColumnSource).not.toContain("setProductPickerOpen(false)");
    expect(productLibraryColumnSource).not.toContain("+ 新建商品");
    expect(productLibraryColumnSource).not.toContain("<Select");
    expect(productLibraryColumnSource).not.toContain("切换商品");
    expect(productLibraryColumnSource).not.toContain("返回视频创作");
    expect(productLibraryColumnSource).not.toContain("返回商品项目");
    expect(productLibraryColumnSource).not.toContain("手动填写或粘贴商品资料");
  });

  it("renders video creation as one composer with inline product packing, controls, storyboard, and video history", async () => {
    const appSource = await readFile(join(process.cwd(), "src", "client", "App.tsx"), "utf8");
    const modelServiceSelectionSource = await readFile(join(process.cwd(), "src", "client", "modelServiceSelection.ts"), "utf8");
    const storyboardDraftsSource = await readFile(join(process.cwd(), "src", "client", "storyboardDrafts.ts"), "utf8");

    const renderCreativeWorkspaceSource = sourceBetween(appSource, "function renderCreativeWorkspace", "function renderActiveSection");
    const videoCase = appSource.slice(appSource.indexOf('case "video"'), appSource.indexOf('case "ledger"'));
    expect(renderCreativeWorkspaceSource).toContain("<ProductCreationWorkspace");
    expect(videoCase).toContain('case "image"');
    expect(renderCreativeWorkspaceSource).toContain("mode={creativeWorkspaceMode}");
    expect(renderCreativeWorkspaceSource).toContain("onOrganizeProductPackage");
    expect(renderCreativeWorkspaceSource).toContain("onStartNewProduct");
    expect(videoCase).not.toContain("<ProductLibraryDialogMount");

    const workspaceSource = appSource.slice(appSource.indexOf("function ProductCreationWorkspace"), appSource.indexOf("function ProductLibraryHome"));
    const modelConfigChoiceSource = modelServiceSelectionSource.slice(modelServiceSelectionSource.indexOf("export function configuredModelOptions"), modelServiceSelectionSource.indexOf("export function modelConfigChoiceLabel"));
    const modelConfigChoiceLabelSource = modelServiceSelectionSource.slice(modelServiceSelectionSource.indexOf("export function modelConfigChoiceLabel"), modelServiceSelectionSource.indexOf("export function platformConfiguredModels"));
    const defaultStoryboardSource = storyboardDraftsSource.slice(storyboardDraftsSource.indexOf("export function defaultStoryboardDraft"), storyboardDraftsSource.indexOf("export function defaultStudioScriptDraft"));
    expect(workspaceSource).toContain("<ProductCreationComposer");
    expect(workspaceSource).not.toContain("selectedProductStoryboardHistory");
    expect(workspaceSource).not.toContain("<ProductStudio");
    expect(workspaceSource).not.toContain("<VideoCreationEmptyShell");
    expect(workspaceSource).not.toContain("ensureVideoProductSelection");
    expect(workspaceSource).not.toContain("ProductStudioPipeline");
    expect(modelServiceSelectionSource).toContain('export type ModelConfigChoice = "auto" | string;');
    expect(appSource).toContain('useState<ModelConfigChoice>("auto")');
    expect(appSource).toContain("selectedTextModelConfigId");
    expect(appSource).toContain("selectedImageModelConfigId");
    expect(appSource).toContain("selectedVideoModelConfigId");
    expect(appSource).toContain("useState(defaultVideoDurationSeconds)");
    expect(appSource).toContain('const defaultVideoTemplate: TemplateName = "auto";');
    expect(appSource).toContain("useState<TemplateName>(defaultVideoTemplate)");
    expect(appSource).toContain("setTemplate(defaultVideoTemplate)");
    expect(appSource).toContain("setSelectedTextModelConfigId(modelServicePreferenceResponse.preference.textModelConfigId ?? \"auto\")");
    expect(appSource).toContain("setSelectedImageModelConfigId(modelServicePreferenceResponse.preference.imageModelConfigId ?? \"auto\")");
    expect(appSource).toContain("setSelectedVideoModelConfigId(modelServicePreferenceResponse.preference.videoModelConfigId ?? \"auto\")");
    expect(appSource).not.toContain("setTemplate(nextSettings.enabledTemplates.includes(nextSettings.defaultTemplate)");
    expect(defaultStoryboardSource).toContain("scene");
    expect(defaultStoryboardSource).toContain("pain-point");
    expect(defaultStoryboardSource).toContain("benefit");
    expect(defaultStoryboardSource).toContain("ugc");
    expect(defaultStoryboardSource).toContain("unboxing");
    expect(defaultStoryboardSource).toContain("storyboardTimeRanges(durationSeconds)");
    expect(defaultStoryboardSource).toContain("`0-${firstEnd}s`");
    expect(appSource).toContain('from "./storyboardDrafts.js"');
    expect(appSource).not.toContain("function defaultStoryboardDraft(");
    expect(appSource).not.toContain("storyboardDraftIsGuidance={!storyboardDraftTouched}");

    const composerSource = appSource.slice(appSource.indexOf("function ProductCreationComposer"), appSource.indexOf("function ProductLibraryHome"));
    const productCreativeWorkbenchSource = sourceBetween(appSource, "function ProductCreativeWorkbench", "function ProductCreativeSettingsTray");
    const productDetailsSource = sourceBetween(composerSource, "product-creative-product-details", "<ProductComposerReferenceTray");
    expect(composerSource).toContain("video-workspace-shell");
    expect(composerSource).toContain("h-[100dvh] max-h-[100dvh] min-h-0 grid-rows-[minmax(0,1fr)]");
    expect(composerSource).toContain("transition-[grid-template-columns] duration-200");
    expect(composerSource).toContain("min-[900px]:grid-cols-[var(--product-library-column-width)_minmax(0,1fr)]");
    expect(composerSource).toContain('style={{ "--product-library-column-width": `${productLibraryColumnWidth}px` } as CSSProperties}');
    expect(composerSource).toContain("PRODUCT_LIBRARY_DEFAULT_WIDTH");
    expect(composerSource).toContain("PRODUCT_LIBRARY_COLLAPSED_WIDTH");
    expect(composerSource).not.toContain("PRODUCT_LIBRARY_COLLAPSE_SNAP_WIDTH");
    expect(composerSource).not.toContain("PRODUCT_LIBRARY_MIN_WIDTH");
    expect(composerSource).not.toContain("PRODUCT_LIBRARY_MAX_WIDTH");
    expect(composerSource).toContain("productLibraryCollapsed");
    expect(composerSource).toContain("productLibraryColumnWidth");
    expect(composerSource).not.toContain("const [productLibraryWidth");
    expect(composerSource).not.toContain("handleProductLibraryResizeStart");
    expect(composerSource).not.toContain("handleProductLibraryResizeKeyDown");
    expect(composerSource).not.toContain('role="separator"');
    expect(composerSource).not.toContain('aria-orientation="vertical"');
    expect(composerSource).not.toContain("aria-valuenow={productLibraryColumnWidth}");
    expect(composerSource).toContain("video-product-library-collapse-rail");
    expect(composerSource).toContain("video-product-library-collapse-button");
    expect(composerSource).toContain("transition-[left,color]");
    expect(composerSource).not.toContain("video-product-library-resizer");
    expect(composerSource).not.toContain("productLibraryResizing");
    expect(composerSource).not.toContain("setProductLibraryResizing");
    expect(composerSource).not.toContain("MoveHorizontal");
    expect(composerSource).toContain("cursor-pointer");
    expect(composerSource).toContain("opacity-0");
    expect(composerSource).toContain("group-hover:opacity-100");
    expect(composerSource).toContain('aria-label={productLibraryCollapsed ? tVideo("productLibrary.expand") : tVideo("productLibrary.collapse")}');
    expect(composerSource).toContain('title={productLibraryCollapsed ? tVideo("productLibrary.expand") : tVideo("productLibrary.collapse")}');
    expect(composerSource).toContain("onClick={() => setProductLibraryCollapsed((collapsed) => !collapsed)}");
    expect(composerSource).not.toContain("拖动调整商品库宽度");
    expect(composerSource).toContain("ProductCreationProductLibrary");
    expect(composerSource).toContain("ProductCreationOperationWorkspace");
    expect(composerSource).toContain("collapsed={productLibraryCollapsed}");
    expect(composerSource).toContain("video-product-library-column");
    expect(composerSource).toContain("video-operation-column");
    expect(composerSource).not.toContain("product-control-bar");
    expect(composerSource).not.toContain("video-parameter-row grid");
    expect(composerSource).not.toContain("<ProductCreationProductPicker");
    expect(composerSource).toContain("grid content-start gap-3");
    expect(composerSource).not.toContain("grid min-h-full content-start gap-3");
    expect(composerSource).toContain("ProductCreativeWorkbench");
    expect(composerSource).toContain("product-creative-workbench");
    expect(composerSource).toContain("product-creative-controls");
    expect(composerSource).toContain("prompt-inline-settings");
    expect(appSource).toContain("active-model-control");
    expect(composerSource).toContain('layout="pill"');
    expect(composerSource).toContain("ProductCreativeToolbarChoice");
    expect(composerSource).not.toContain("model-scheme-chip-row");
    expect(composerSource).not.toContain("ModelSchemeChip");
    expect(composerSource).not.toContain("{schemeSummary}");
    expect(composerSource).not.toContain("model-scheme-summary min-w-0 whitespace-normal break-words");
    expect(composerSource).not.toContain("model-scheme-summary min-w-0 truncate");
    expect(composerSource).toContain('label={tVideo("controls.resolution")}');
    expect(composerSource).toContain("videoResolutionOptions");
    expect(composerSource).toContain("selectedVideoResolution");
    expect(composerSource).toContain("resolution: selectedVideoResolution");
    expect(composerSource).toContain('label={tVideo("controls.aspectRatio")}');
    expect(composerSource).toContain("videoAspectRatioOptions");
    expect(composerSource).toContain("selectedVideoAspectRatio");
    expect(composerSource).toContain("aspectRatio: selectedVideoAspectRatio");
    expect(composerSource).toContain('const languageOptions: FinalVideoLanguage[] = ["ja", "zh", "en"]');
    expect(appSource).toContain('if (value === "en") return t("languages.en");');
    expect(composerSource).toContain('density="micro"');
    expect(composerSource).toContain("prompt-composer-primary-action-slot");
    expect(composerSource).toContain("primaryActionDisabled");
    expect(composerSource).toContain("primaryActionLabel");
    expect(composerSource).not.toContain("video-generate-summary");
    expect(composerSource).not.toContain("{generateVideoSummary}");
    expect(composerSource).not.toContain("product-creative-action-summary");
    expect(composerSource).not.toContain("video-generate-summary min-w-0 truncate");
    expect(composerSource).not.toContain("generateVideoSummaryItems.map");
    expect(composerSource).not.toContain("video-generate-summary-item");
    expect(composerSource).not.toContain("video-generate-summary-separator");
    expect(composerSource).not.toContain("generation-status-message");
    expect(composerSource).not.toContain("video-generate-status-center");
    expect(composerSource).not.toContain("subtitle={generateVideoSummary}");
    expect(composerSource).not.toContain("video-generate-bar");
    expect(composerSource).not.toContain('<div className="min-w-0 truncate text-xs font-bold text-[var(--muted)]">{schemeSummary}</div>');
    expect(composerSource).not.toContain("footer={");
    expect(composerSource.indexOf("product-creative-compose-panel")).toBeLessThan(composerSource.indexOf("product-creative-history"));
    expect(productCreativeWorkbenchSource).not.toContain("max-w-[960px]");
    expect(productCreativeWorkbenchSource).not.toContain("mx-auto");
    expect(composerSource).toContain("product-creative-product-details");
    expect(composerSource).toContain("<ProductCreativeSettingsTray");
    expect(composerSource).toContain("product-creative-context-strip");
    expect(composerSource).not.toContain("product-creative-settings");
    expect(composerSource).toContain("product-facts-editor");
    expect(composerSource).toContain("product-facts-body h-[104px] min-h-[104px] max-h-[104px]");
    expect(composerSource).toContain("overflow-y-auto");
    expect(productDetailsSource).not.toContain("<details");
    expect(productDetailsSource).not.toContain("<summary");
    expect(productDetailsSource).not.toContain("productDetailsOpen");
    expect(composerSource).toContain("overflow-visible");
    expect(composerSource).toContain('menuPlacement="top"');
    expect(composerSource).toContain('menuWidth="content"');
    expect(composerSource).not.toContain("prompt-inline-settings flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto");
    expect(composerSource.indexOf("product-creative-product-details")).toBeLessThan(composerSource.indexOf("ProductComposerReferenceTray"));
    expect(composerSource).not.toContain("product-creative-media-rail");
    expect(composerSource).not.toContain("product-creative-result-rail");
    expect(composerSource).toContain("generateVideoButtonLabel");
    expect(composerSource).toContain('versionCount > 1 ? tVideo("generate.buttonWithCount", { count: versionCount }) : tVideo("generate.button")');
    expect(appSource).not.toContain("const videoModelOptions: VideoModelChoice[]");
    expect(appSource).not.toContain("const videoModelConfigs");
    expect(appSource).not.toContain("defaultVideoModelChoice");
    expect(modelConfigChoiceSource).toContain("return models.map((model) => model.configId)");
    expect(modelConfigChoiceSource).not.toContain('return ["auto", ...models.map((model) => model.configId)');
    expect(modelServiceSelectionSource).toContain("effectiveModelConfigChoice");
    expect(modelServiceSelectionSource).toContain('value !== "auto" && options.includes(value)');
    expect(composerSource).toContain("videoModelOptions");
    expect(composerSource).toContain("imageModelOptions");
    expect(composerSource).not.toContain("localizedModelSchemeSummary");
    expect(composerSource).not.toContain("schemeSummary");
    expect(composerSource).not.toContain("activeModelSchemeId");
    expect(composerSource).not.toContain("localizedModelSchemeChoiceLabel");
    expect(appSource).toContain('mode === "image" ? selectedImageModelConfigId : selectedVideoModelConfigId');
    expect(appSource).toContain('mode === "image" ? imageModelOptions : videoModelOptions');
    expect(appSource).toContain('mode === "image" ? onImageModelConfigChange : onVideoModelConfigChange');
    expect(modelConfigChoiceLabelSource).toContain("return modelLabelForId(effectiveModel.id, effectiveModel.model);");
    expect(modelConfigChoiceLabelSource).not.toContain("return `${model.label} · ${displayModel}`;");
    expect(composerSource).not.toContain('label={tVideo("controls.modelScheme")}');
    expect(composerSource).not.toContain('label="文本模型"');
    expect(composerSource).not.toContain('label="图片模型"');
    expect(composerSource).not.toContain('label="视频模型"');
    expect(appSource).toContain("const defaultVideoDurationSeconds = 10");
    expect(appSource).not.toContain("seed" + "nice");
    expect(composerSource).toContain("selectedVideoModelConfigId");
    expect(composerSource).toContain("providerModelConfigId: effectiveSelectedVideoModelConfigId");
    expect(composerSource).not.toContain("provider: videoModelConfig.provider");
    expect(composerSource).not.toContain("providerModel: videoModelConfig.model");
    expect(composerSource).not.toContain("confirmPaid: videoModelConfig.confirmPaid");
    expect(composerSource).not.toContain("允许使用付费模型生成当前商品视频");
    expect(composerSource).not.toContain("creation-parameter-dock");
    expect(composerSource).not.toContain("product-creation-canvas overflow-visible rounded-[22px] border");
    expect(composerSource).not.toContain("video-creation-frame grid gap-4 overflow-visible rounded-[24px] border border-[var(--border)] bg-[var(--card)] p-4");
    expect(composerSource).not.toContain("product-creation-canvas overflow-visible rounded-[20px] bg-white");
    expect(composerSource).toContain("product-reference-inline");
    expect(composerSource).toContain("storyboard-side-panel");
    expect(composerSource).not.toContain("storyboardDraftIsGuidance");
    expect(composerSource).toContain("bg-[var(--card)]");
    expect(composerSource).not.toContain("text-[#9a8776]");
    expect(composerSource).toContain("text-[var(--text)]");
    expect(composerSource).toContain("product-facts-editor");
    expect(composerSource).toContain("product-creative-product-details");
    expect(composerSource).toContain("product-facts-body");
    expect(composerSource).toContain("productFactsBodyRef");
    expect(composerSource).toContain("productFactsBodyRef.current.scrollTop = 0");
    expect(composerSource).not.toContain("Math.max(4, Math.min(8");
    expect(composerSource).toContain("product-facts-body h-[104px] min-h-[104px] max-h-[104px]");
    expect(composerSource).toContain("border-0 bg-transparent px-0 py-0");
    expect(composerSource).toContain("resize-none overflow-y-auto");
    expect(composerSource).not.toContain("submitHint");
    expect(composerSource).not.toContain("{submitHint ? (");
    expect(composerSource).not.toContain("{submitHint}");
    expect(composerSource).not.toContain('<div className="min-h-5 truncate text-xs font-bold text-[var(--accent)]">{submitHint}</div>');
    expect(composerSource).toContain('onToast(tVideo("generate.packageReadyToast"), "ok")');
    expect(composerSource).toContain('onToast(tVideo("generate.queuedToast"), "ok")');
    expect(composerSource).toContain("disabled:opacity-100");
    expect(composerSource).not.toContain("productPackageButtonLabel");
    expect(composerSource).not.toContain('"保存资料包"');
    expect(composerSource).toContain('tVideo("facts.organize")');
    expect(composerSource).not.toContain("创建生成任务中");
    expect(composerSource).not.toContain("product-facts-body h-full min-h-[520px]");
    expect(composerSource).not.toContain("max-h-[312px]");
    expect(composerSource).not.toContain("min-h-[350px] resize-y border-0");
    expect(composerSource).not.toContain("max-h-[340px]");
    expect(composerSource).not.toContain("grid min-h-[430px]");
    expect(composerSource).not.toContain("product-creative-source-column");
    expect(composerSource).not.toContain("product-creative-intent-column");
    expect(composerSource).not.toContain("product-creative-output-column");
    expect(appSource).toContain("const [pendingImageFiles, setPendingImageFiles] = useState<File[]>([]);");
    expect(renderCreativeWorkspaceSource).toContain("pendingImageFiles={pendingImageFiles}");
    expect(renderCreativeWorkspaceSource).toContain("setPendingImageFiles={setPendingImageFiles}");
    expect(workspaceSource).toContain("pendingImageFiles: File[];");
    expect(workspaceSource).toContain("setPendingImageFiles: Dispatch<SetStateAction<File[]>>;");
    expect(composerSource).toContain("pendingImageFiles: File[];");
    expect(composerSource).toContain("setPendingImageFiles: Dispatch<SetStateAction<File[]>>;");
    expect(composerSource).not.toContain("useState<File[]>([])");
    expect(composerSource).not.toContain("setImportText(productDraftToComposerText(productFactsToDraft(selectedProduct)))");
    expect(composerSource).not.toContain("选择已有商品");
    expect(composerSource).not.toContain('label="商品来源"');
    expect(composerSource).not.toContain("商品资料完整，可进入视频预检");
    expect(composerSource).not.toContain("referenceReadiness(actionProduct)");
    expect(composerSource).not.toContain("参考图 5 张 · 可生成视频");
    expect(composerSource).toContain('tVideo("facts.title")');
    expect(composerSource).toContain('tVideo("reference.add")');
    expect(composerSource).toContain("onPreviewReferenceImage");
    expect(composerSource).toContain("onDeleteReferenceImage");
    expect(composerSource).not.toContain("aria-disabled={!product}");
    expect(composerSource).not.toContain('tVideo("reference.generateDisabledToast")');
    expect(composerSource).toContain("function selectedCreationReferenceImagesForProduct(product: ProductDetail)");
    expect(composerSource).toContain("if (imagePromptReferences.length === 0) return undefined;");
    expect(composerSource).toContain("referenceImages: selectedCreationReferenceImagesForProduct(savedProduct) ?? []");
    expect(composerSource).toContain('onToast(tVideo("storyboard.previewNeedsFacts"))');
    expect(composerSource).toContain('onToast(errorMessage(error))');
    expect(composerSource).toContain('tVideo("facts.organize")');
    expect(composerSource).toContain('isPacking ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Package size={13} />');
    expect(composerSource).toContain('{isPacking ? tVideo("facts.organizing") : tVideo("facts.organize")}');
    expect(composerSource).toContain("productAutoSaveStatus");
    expect(composerSource).toContain("localizedProductAutoSaveStatusLabel(productAutoSaveStatus, tVideo)");
    expect(appSource).toContain("onFlushProductFactsAutoSave={flushProductFactsAutoSave}");
    expect(composerSource).toContain("onFlushProductFactsAutoSave");
    expect(composerSource).toContain("await onFlushProductFactsAutoSave()");
    expect(composerSource).toContain("function previewProductForPromptCompiler");
    expect(composerSource).toContain("compileProductPrompt({");
    expect(composerSource).toContain("const compiledVideoPrompt = compileProductPrompt({");
    expect(composerSource).toContain("storyboardLines: splitDraftLines(compiledVideoPrompt.prompt)");
    expect(composerSource).toContain("const selectedReferenceImages = selectedCreationReferenceImagesForProduct(savedProduct) ?? [];");
    expect(composerSource).toContain("referenceImages: selectedReferenceImages,");
    expect(composerSource).not.toContain("const productForPrompt = await onFlushProductFactsAutoSave() ?? selectedProduct;");
    expect(composerSource).not.toContain("const productForPrompt = await onFlushProductFactsAutoSave() ?? selectedProduct ?? await handleOrganizeProductPackage({ silentSuccess: true })");
    expect(composerSource).toContain('promptPreviewActionLoading ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Eye size={13} />');
    expect(composerSource).toContain("promptPreviewActionLabel");
    expect(composerSource).toContain('tVideo("storyboard.generate")');
    expect(composerSource).toContain('variant="ghost"');
    expect(composerSource).toContain("max-w-[112px]");
    expect(composerSource).not.toContain('"预览模型提示词"');
    expect(composerSource).not.toContain("w-[168px]");
    expect(productDetailsSource).toContain("product-facts-header");
    expect(productDetailsSource).toContain("product-facts-action");
    expect(productDetailsSource.indexOf("product-facts-action")).toBeLessThan(productDetailsSource.indexOf("product-facts-editor"));
    expect(productDetailsSource).not.toContain("sm:grid-cols-[minmax(0,1fr)_auto]");
    expect(composerSource).toContain("storyboard-title-row");
    expect(composerSource).toContain("storyboard-title-action");
    expect(composerSource).toContain("prompt-composer-footer grid min-h-12");
    expect(composerSource).toContain("grid-cols-[auto_minmax(0,1fr)_minmax(176px,240px)]");
    expect(composerSource).toContain("h-10 min-h-10");
    expect(composerSource).toContain("whitespace-nowrap");
    expect(composerSource).toContain("prompt-composer-mode-slot");
    expect(composerSource).toContain("prompt-composer-settings-slot");
    expect(composerSource).toContain("prompt-composer-primary-action-slot");
    expect(composerSource).not.toContain("storyboard-title-history");
    expect(composerSource).toContain("prompt-composer-settings-slot flex min-w-0 flex-nowrap items-center gap-1.5 overflow-visible");
    expect(composerSource).toContain("placeholder={promptPlaceholder}");
    expect(composerSource).not.toContain("整理资料并生成视频");
    expect(composerSource).toContain('label={tVideo("controls.creativeStyle")}');
    expect(composerSource).toContain('label={tVideo("controls.duration")}');
    expect(composerSource).toContain('label={tVideo("controls.finalLanguage")}');
    expect(composerSource).not.toContain('label={tVideo("controls.modelScheme")}');
    expect(composerSource).not.toContain('label="生成模型"');
    expect(composerSource).toContain('tVideo("generate.button")');
    expect(composerSource).toContain("CompactChoiceDropdown");
    expect(appSource).toContain('from "./productComposerText.js"');
    expect(composerSource).toContain("storyboard-history-dropdown");
    expect(composerSource).not.toContain("补充要点");
    expect(composerSource).not.toContain("可补充镜头重点、禁用表达、旁白方向。");
    expect(composerSource).toContain('tVideo("storyboard.title")');
    expect(composerSource).toContain('tVideo("storyboard.generate")');
    expect(composerSource).toContain('tVideo("history.title")');
    expect(composerSource).toContain("localizedCreativeVersionLifecycleHint(job, tVideo, appLocale)");
    const videoDisplayViewModelSource = await readFile(join(process.cwd(), "src", "client", "videoDisplayViewModel.ts"), "utf8");
    expect(videoDisplayViewModelSource).toContain('return appText(`status.jobStatuses.${value}`, locale);');
    expect(videoDisplayViewModelSource).toContain('if (value === "failed") return appText("videoStudio.videoStatus.failed", locale);');
    expect(composerSource).toContain('tVideo("history.preview")');
    expect(composerSource).toContain('tVideo("history.download")');
    expect(appSource).toContain("VideoHashtagChips");
    expect(appSource).toContain('tVideo("history.copyTags")');
    expect(appSource).toContain('tVideo("history.tagsCopiedToast")');
    expect(appSource).toContain("normalizeDisplayHashtags");
    expect(composerSource).toContain("DeleteCreativeVersionDialog");
    expect(composerSource).toContain("imagePromptReferenceIndex");
    expect(composerSource).toContain("selectedImagePromptReference");
    expect(composerSource).toContain("previewReferenceImages");
    expect(composerSource).not.toContain("InlineProductFactsFields");
    expect(composerSource).not.toContain('Field label="标题"');
    expect(composerSource).not.toContain("<Select");
    expect(composerSource).not.toContain("AI 视频");
    expect(composerSource).not.toContain("AI 图片");
    expect(composerSource).not.toContain("lg:grid-cols-[minmax(220px,.34fr)_minmax(0,1fr)]");
    expect(composerSource).not.toContain("上一步");
    expect(composerSource).not.toContain("下一步");
    expect(composerSource).not.toContain("审核发布");
    expect(composerSource).not.toContain("发布素材");

    expect(appSource).toContain("async function organizeProductPackage");
    expect(appSource).toContain("productImportText.trim()");
    expect(appSource).toContain('"/api/products/import-ai-preview"');
    expect(appSource).toContain('postJson<{ product: ProductDetail }>("/api/products"');
    expect(appSource).toContain("setProductDraft(productFactsToDraft(response.product))");
    expect(appSource).toContain("function startNewVideoProduct");
  });

  it("cleans imported product text into a product fact draft without saving it", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-product-import-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const server = createConsoleServer({ rootDir: root, fixturesDir });

    const sourceText = [
      "SKU: WALLET-BLACK-001",
      "商品名：ラウンドファスナー ミニ財布 ブラック",
      "カテゴリ：財布",
      "素材：PUレザー、ポリエステル",
      "サイズ：約11x9x3cm",
      "卖点：カードを整理しやすい / 小銭入れ付き / ラウンドファスナー",
      "使用场景：買い物、通勤、旅行",
      "禁止：本革未確認、防水未確認、日本で大人気は未確認",
      "图片：/tmp/wallet-main.jpg, detail1.jpg"
    ].join("\n");
    const response = await server.fetchJson("/api/products/import-preview", {
      method: "POST",
      body: JSON.stringify({
        text: sourceText
      })
    });

    expect(response.product).toEqual({
      sku: "WALLET-BLACK-001",
      title_ja: "ラウンドファスナー ミニ財布 ブラック",
      category: "財布",
      materials: ["PUレザー", "ポリエステル"],
      dimensions: "約11x9x3cm",
      verified_selling_points: ["カードを整理しやすい", "小銭入れ付き", "ラウンドファスナー"],
      usage_scenes: ["買い物", "通勤", "旅行"],
      forbidden_claims: ["本革未確認", "防水未確認", "日本で大人気は未確認"],
      reference_images: ["/tmp/wallet-main.jpg", "detail1.jpg"],
      source_text: sourceText
    });
    expect(response.notes).toEqual([]);
    await expect(server.fetchJson("/api/products")).resolves.toEqual({ products: [] });
  });

  it("uses the configured text model to clean pasted product text into a draft", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-product-import-ai-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sku: "ITEM-AI-001",
                  title_ja: "AI整理 ミニ収納ケース",
                  category: "収納ケース",
                  materials: ["PP"],
                  dimensions: "約12x8x4cm",
                  verified_selling_points: ["小物を整理しやすい", "折りたたみ収納に対応"],
                  usage_scenes: ["デスク", "旅行"],
                  forbidden_claims: ["防水効果は未確認"],
                  reference_images: ["ai-case-01.jpg", "ai-case-02.jpg", "ai-case-03.jpg"]
                })
              }
            }
          ],
          usage: {
            total_tokens: 456
          }
        })
      ) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fixturesDir, fetchImpl });
      await server.fetchJson("/api/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "text-model-secret-key-123456",
          apiMode: "chat_completions"
        })
      });

      const sourceText = "商品名：AI整理 ミニ収納ケース\n素材：PP";
      await topUpWalletForAiUsage(server);
      const response = await server.fetchJson("/api/products/import-ai-preview", {
        method: "POST",
        body: JSON.stringify({
          text: sourceText
        })
      });

      expect(response.product).toEqual({
        sku: "ITEM-AI-001",
        title_ja: "AI整理 ミニ収納ケース",
        category: "収納ケース",
        materials: ["PP"],
        dimensions: "約12x8x4cm",
        verified_selling_points: ["小物を整理しやすい", "折りたたみ収納に対応"],
        usage_scenes: ["デスク", "旅行"],
        forbidden_claims: ["防水効果は未確認"],
        reference_images: [],
        source_text: sourceText
      });
      expect(response.notes).toContain("文本模型已整理商品资料。");
      expect(response.quality.ready).toBe(false);
      expect(response.quality.missingFields).toContain("参考图");
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/chat/completions");
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({
        authorization: "Bearer text-model-secret-key-123456"
      }));
      const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body));
      expect(body.model).toBe("gpt-5.5");
      expect(body.messages.at(-1).content).toContain("商品名");
      await expect(server.fetchJson("/api/products")).resolves.toEqual({ products: [] });
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("uses streamed Responses for OpenAI GPT text model configs by default", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-product-import-responses-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const fetchImpl = vi.fn(async () =>
        new Response([
          `data: ${JSON.stringify({
            type: "response.output_text.delta",
            delta: JSON.stringify({
              sku: "ITEM-RSP-001",
              title_ja: "Responses整理 ミニ収納ケース",
              category: "収納ケース",
              materials: ["PP"],
              dimensions: "約12x8x4cm",
              verified_selling_points: ["小物を整理しやすい"],
              usage_scenes: ["デスク"],
              forbidden_claims: ["防水効果は未確認"],
              reference_images: ["responses-case-01.jpg"]
            })
          })}\n\n`,
          "data: [DONE]\n\n"
        ].join(""), {
          status: 200,
          headers: { "content-type": "text/event-stream" }
        })
      ) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fixturesDir, fetchImpl });
      await server.fetchJson("/api/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "text-responses-secret-123456",
          baseUrl: "https://api.openai.com",
          model: "gpt-5.5"
        })
      });

      await topUpWalletForAiUsage(server);
      const response = await server.fetchJson("/api/products/import-ai-preview", {
        method: "POST",
        body: JSON.stringify({
          text: "商品名：Responses整理 ミニ収納ケース\n素材：PP"
        })
      });

      expect(response.product.sku).toBe("ITEM-RSP-001");
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/responses");
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({
        authorization: "Bearer text-responses-secret-123456"
      }));
      const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body));
      expect(body).toEqual(expect.objectContaining({
        model: "gpt-5.5",
        stream: true
      }));
      expect(body.instructions).toContain("电商商品资料整理助手");
      expect(body.input).toContain("Responses整理");
      expect(body.text?.format).toEqual({ type: "json_object" });
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("keeps DeepSeek text model configs on Chat Completions", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-product-import-deepseek-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sku: "ITEM-DS-001",
                  title_ja: "DeepSeek整理 ミニ収納ケース",
                  category: "収納ケース",
                  materials: ["PP"],
                  dimensions: "約12x8x4cm",
                  verified_selling_points: ["小物を整理しやすい"],
                  usage_scenes: ["デスク"],
                  forbidden_claims: ["防水効果は未確認"],
                  reference_images: ["deepseek-case-01.jpg"]
                })
              }
            }
          ]
        })
      ) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fixturesDir, fetchImpl });
      await server.fetchJson("/api/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "text-deepseek-secret-123456",
          vendor: "deepseek",
          baseUrl: "https://api.deepseek.com",
          model: "deepseek-v4-pro"
        })
      });

      await topUpWalletForAiUsage(server);
      const response = await server.fetchJson("/api/products/import-ai-preview", {
        method: "POST",
        body: JSON.stringify({
          text: "商品名：DeepSeek整理 ミニ収納ケース\n素材：PP"
        })
      });

      expect(response.product.sku).toBe("ITEM-DS-001");
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://api.deepseek.com/v1/chat/completions");
      const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body));
      expect(body.model).toBe("deepseek-v4-pro");
      expect(body.messages.at(-1).content).toContain("DeepSeek整理");
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("refreshes available models through the unified discovery endpoint", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-model-refresh-"));
      tempDirs.push(root);
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          data: [
            { id: "deepseek-v4-pro" },
            { id: "deepseek-v4-flash" }
          ]
        })
      ) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fetchImpl });

      const text = await server.fetchJson("/api/model-configs/openai-compatible-text/models", {
        method: "POST",
        body: JSON.stringify({
          apiKey: "text-discovery-secret",
          baseUrl: "https://api.deepseek.com"
        })
      });
      const video = await server.fetchJson("/api/model-configs/volcengine-seedance/models", {
        method: "POST",
        body: JSON.stringify({
          apiKey: "video-discovery-secret",
          baseUrl: "https://ark.cn-beijing.volces.com"
        })
      });

      expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://api.deepseek.com/models");
      expect(text.models.map((model: { id: string }) => model.id)).toEqual(["deepseek-v4-pro", "deepseek-v4-flash"]);
      expect(video.models.map((model: { label: string }) => model.label)).toEqual(["seedance-2.0-fast", "seedance-2.0"]);
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("keeps ordinary source-backed product features out of AI forbidden claims", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-product-import-ai-less-strict-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sku: "ARM-COVER-COOL",
                  title_ja: "接触冷感アームカバー",
                  category: "アームカバー",
                  materials: ["ポリエステル"],
                  dimensions: "約52cm",
                  verified_selling_points: ["指先までカバー"],
                  usage_scenes: ["通勤"],
                  forbidden_claims: [
                    "UVカット96%以上",
                    "日焼け防止",
                    "紫外線対策",
                    "接触冷感",
                    "肌に触れるとひんやりする",
                    "通気性が良い",
                    "真夏でも快適に着用可能",
                    "快適で冷たい着用感"
                  ],
                  reference_images: []
                })
              }
            }
          ],
          usage: {
            total_tokens: 789
          }
        })
      ) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fixturesDir, fetchImpl });
      await server.fetchJson("/api/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "text-model-secret-key-123456",
          apiMode: "chat_completions"
        })
      });

      await topUpWalletForAiUsage(server);
      const response = await server.fetchJson("/api/products/import-ai-preview", {
        method: "POST",
        body: JSON.stringify({
          text: [
            "商品名：接触冷感アームカバー",
            "素材：ポリエステル",
            "サイズ：約52cm",
            "卖点：日焼け防止、紫外線対策、接触冷感、肌に触れるとひんやりする、通気性が良い、真夏でも快適に着用可能、快適で冷たい着用感、UVカット96%以上"
          ].join("\n")
        })
      });

      expect(response.product.forbidden_claims).toEqual(["UVカット96%以上"]);
      expect(response.product.verified_selling_points).toEqual(expect.arrayContaining([
        "指先までカバー",
        "日焼け防止",
        "紫外線対策",
        "接触冷感",
        "肌に触れるとひんやりする",
        "通気性が良い",
        "真夏でも快適に着用可能",
        "快適で冷たい着用感"
      ]));
      expect(response.quality.blockedClaims).toEqual(["UVカット96%以上"]);
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("normalizes object-shaped AI import fields before validating product facts", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-product-import-ai-shape-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sku: "ARM-COVER-001",
                  title_ja: "接触冷感アームカバー",
                  category: "アームカバー",
                  materials: [
                    { name: "ポリエステル", ratio: "100%" },
                    { name: "ポリウレタン", ratio: "10%" }
                  ],
                  dimensions: {
                    length: "52cm",
                    wrist: "16-32cm"
                  },
                  verified_selling_points: [
                    { text: "接触冷感素材" },
                    { text: "指穴付き" }
                  ],
                  usage_scenes: [{ scene: "通勤" }, { scene: "日焼け対策" }],
                  forbidden_claims: [{ claim: "UVカット96%以上は証明未確認" }],
                  reference_images: [{ url: "https://cdn.example.com/arm-cover.jpg" }]
                })
              }
            }
          ],
          usage: {
            total_tokens: 789
          }
        })
      ) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fixturesDir, fetchImpl });
      await server.fetchJson("/api/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "text-model-secret-key-123456",
          apiMode: "chat_completions"
        })
      });

      await topUpWalletForAiUsage(server);
      const response = await server.fetchJson("/api/products/import-ai-preview", {
        method: "POST",
        body: JSON.stringify({
          text: "接触冷感アームカバー UV カット 96% 指穴付き\n参考图：https://cdn.example.com/arm-cover.jpg"
        })
      });

      expect(response.product).toEqual(expect.objectContaining({
        sku: "ARM-COVER-001",
        title_ja: "接触冷感アームカバー",
        category: "アームカバー",
        materials: ["ポリエステル 100%", "ポリウレタン 10%"],
        dimensions: "52cm、16-32cm",
        verified_selling_points: ["接触冷感素材", "指穴付き"],
        usage_scenes: ["通勤", "日焼け対策"],
        forbidden_claims: ["UVカット96%以上は証明未確認"],
        reference_images: ["https://cdn.example.com/arm-cover.jpg"]
      }));
      expect(response.notes).toContain("文本模型已整理商品资料。");
      expect(response.quality.ready).toBe(true);
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("does not trust AI-invented reference images when the source text has no image", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-product-import-ai-no-image-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sku: "ITEM-AI-002",
                  title_ja: "AI整理 ミニ収納ケース",
                  category: "収納ケース",
                  materials: ["PP"],
                  dimensions: "約12x8x4cm",
                  verified_selling_points: ["小物を整理しやすい"],
                  usage_scenes: ["デスク"],
                  forbidden_claims: ["防水効果は未確認"],
                  reference_images: ["reference.jpg", "ai-case-01.jpg"]
                })
              }
            }
          ],
          usage: {
            total_tokens: 456
          }
        })
      ) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fixturesDir, fetchImpl });
      await server.fetchJson("/api/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "text-model-secret-key-123456",
          apiMode: "chat_completions"
        })
      });

      await topUpWalletForAiUsage(server);
      const response = await server.fetchJson("/api/products/import-ai-preview", {
        method: "POST",
        body: JSON.stringify({
          text: "商品名：AI整理 ミニ収納ケース\n素材：PP"
        })
      });

      expect(response.product.reference_images).toEqual([]);
      expect(response.quality.missingFields).toContain("参考图");
      expect(response.quality.verifiedFacts).not.toContain("参考图");
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("keeps bare image URLs from source text when the AI omits reference images", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-product-import-ai-bare-image-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const imageUrl = "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/c5633a662f964e4889c530fd4fd4b263~tplv-o3syd03w52-origin-jpeg.jpeg?dr=15568&t=555f072d&ps=933b5bde&shp=a3510d86&shcp=6ce186a1&idc=my&from=2739998086";
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sku: "ARM-COVER-BARE-URL",
                  title_ja: "接触冷感アームカバー",
                  category: "アームカバー",
                  materials: ["ポリエステル"],
                  dimensions: "約52cm",
                  verified_selling_points: ["指穴付き"],
                  usage_scenes: ["通勤"],
                  forbidden_claims: [],
                  reference_images: []
                })
              }
            }
          ],
          usage: {
            total_tokens: 512
          }
        })
      ) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fixturesDir, fetchImpl });
      await server.fetchJson("/api/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "text-model-secret-key-123456",
          apiMode: "chat_completions"
        })
      });

      await topUpWalletForAiUsage(server);
      const response = await server.fetchJson("/api/products/import-ai-preview", {
        method: "POST",
        body: JSON.stringify({
          text: [
            "商品タイトル 接触冷感アームカバー",
            "素材 ポリエステル",
            imageUrl
          ].join("\n")
        })
      });

      expect(response.product.reference_images).toEqual([imageUrl]);
      expect(response.quality.verifiedFacts).toContain("参考图");
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("falls back to local product cleanup when the AI import response is not JSON", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-product-import-ai-non-json-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const imageOne = "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/c5633a662f964e4889c530fd4fd4b263~tplv-o3syd03w52-origin-jpeg.jpeg?dr=15568&t=555f072d&ps=933b5bde&shp=a3510d86&shcp=6ce186a1&idc=my&from=2739998086";
      const imageTwo = "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/914766b76fe743fba14a93d4f2419356~tplv-o3syd03w52-origin-jpeg.jpeg?dr=15568&t=555f072d&ps=933b5bde&shp=a3510d86&shcp=6ce186a1&idc=my&from=2739998086";
      const imageThree = "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/75a1e5143ccf437ab41b39afaf69d6dc~tplv-o3syd03w52-origin-jpeg.jpeg?dr=15568&t=555f072d&ps=933b5bde&shp=a3510d86&shcp=6ce186a1&idc=my&from=2739998086";
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: "已整理完成，但这里不是 JSON。"
              }
            }
          ],
          usage: {
            total_tokens: 321
          }
        })
      ) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fixturesDir, fetchImpl });
      await server.fetchJson("/api/model-configs/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "text-model-secret-key-123456",
          apiMode: "chat_completions"
        })
      });

      await topUpWalletForAiUsage(server);
      const response = await server.fetchJson("/api/products/import-ai-preview", {
        method: "POST",
        body: JSON.stringify({
          text: [
            "ショルダーバッグ レディース 財布 お財布 ショルダー お財布ポシェット お財布ショルダー ポシェット フェイクレザー ペットボトルがインる 長財布 バッグ お財布バッグ 大きい人 小さいさめ 大きめ 大容量 レザー おお財布機能付き 斜めめめ掛けけ 斜めがけ 軽量 軽い",
            imageOne.replace("2739998086", "27399980\n86"),
            imageTwo,
            imageThree
          ].join("\n")
        })
      });

      expect(response.notes).toContain("AI 整理返回格式异常，已改用本地规则整理资料。");
      expect(response.product.title_ja).toContain("ショルダーバッグ レディース 財布");
      expect(response.product.reference_images).toEqual([imageOne, imageTwo, imageThree]);
      expect(response.quality.verifiedFacts).toContain("参考图");
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("compiles video prompt drafts for the selected product and target video model", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-storyboard-ai-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      await writeProduct(testProductPath(fixturesDir, "storyboard"), {
        sku: "STORY-001",
        title_ja: "接触冷感アームカバー",
        category: "スポーツ用スリーブ",
        materials: ["ポリエステル"],
        dimensions: "15x10x5cm / 0.1kg",
        verified_selling_points: ["指先までカバーしやすい", "通気性のある生地"],
        usage_scenes: ["通勤", "スポーツ"],
        forbidden_claims: ["UVカット率は未確認"],
        reference_images: ["arm-01.jpg", "arm-02.jpg", "arm-03.jpg"]
      });
      const fetchImpl = vi.fn(async () => jsonResponse({ ok: true })) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fixturesDir, fetchImpl });
      await server.fetchJson("/api/model-configs/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "video-prompt-secret-7777",
          model: "seedance-2.0-fast"
        })
      });

      await topUpWalletForAiUsage(server);
      const response = await server.fetchJson("/api/products/STORY-001/storyboard-draft", {
        method: "POST",
        body: JSON.stringify({
          duration: 8,
          aspectRatio: "9:16",
          finalLanguage: "ja",
          template: "pain-point",
          creativeStyle: "ugc",
          prompt: "做日本 TikTok 通勤骑车视频，突出轻薄透气。",
          referenceImages: ["arm-02.jpg"]
        })
      });

      expect(response.scriptLines).toEqual([]);
      expect(response.storyboardCnLines).toEqual([]);
      expect(response.storyboardLines.join("\n")).toContain("生成 8 秒 9:16 竖版 TikTok Shop 商品视频");
      expect(response.storyboardLines.join("\n")).toContain("目标视频模型：volcengine-seedance");
      expect(response.storyboardLines.join("\n")).toContain("doubao-seedance-2-0-fast");
      expect(response.storyboardLines.join("\n")).toContain("arm-02.jpg");
      expect(response.storyboardLines.join("\n")).toContain("视频提示词：");
      expect(response.storyboardLines.join("\n")).toContain("真实 TikTok Shop 商品短视频");
      expect(response.storyboardLines.join("\n")).toContain("商品以已选参考图为准");
      expect(response.storyboardLines.join("\n")).toContain("视觉风格：真实 UGC 用户分享风");
      expect(response.storyboardLines.join("\n")).toContain("镜头运动：");
      expect(response.storyboardLines.join("\n")).toContain("质量与限制：");
      expect(response.storyboardLines.join("\n")).toContain("轻薄透气");
      expect(response.storyboardLines.join("\n")).toContain("UVカット率は未確認");
      expect(response.storyboardLines.join("\n")).not.toContain("商品标题：");
      expect(response.storyboardLines.join("\n")).not.toContain("用户意图：");
      expect(response.notes).toContain("已按 seedance-video@v2 编译为视频模型提示词。");
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("compiles image prompt drafts for the selected product and target image model", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-image-prompt-ai-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      await writeProduct(testProductPath(fixturesDir, "image-prompt"), {
        sku: "IMAGE-PROMPT-001",
        title_ja: "接触冷感アームカバー",
        category: "スポーツ用スリーブ",
        materials: ["ポリエステル"],
        dimensions: "15x10x5cm / 0.1kg",
        verified_selling_points: ["指先までカバーしやすい", "通気性のある生地"],
        usage_scenes: ["通勤", "スポーツ"],
        forbidden_claims: ["UVカット率は未確認"],
        reference_images: ["arm-01.jpg", "arm-02.jpg"]
      });
      const fetchImpl = vi.fn(async () => jsonResponse({ ok: true })) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fixturesDir, fetchImpl });
      await server.fetchJson("/api/model-configs/openai-compatible-image", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "image-prompt-secret-7777",
          model: "gpt-image-2"
        })
      });

      await topUpWalletForAiUsage(server);
      const response = await server.fetchJson("/api/products/IMAGE-PROMPT-001/image-prompt-draft", {
        method: "POST",
        body: JSON.stringify({
          prompt: "白底主图",
          targetImage: "arm-02.jpg",
          imageModelConfigId: "auto",
          locale: "en"
        })
      });

      expect(response.prompt).toContain("Create a clean ecommerce product image");
      expect(response.prompt).toContain("Target image model: openai-compatible-image");
      expect(response.prompt).toContain("gpt-image-2");
      expect(response.prompt).toContain("arm-02.jpg");
      expect(response.prompt).toContain("白底主图");
      expect(response.prompt).toContain("通気性のある生地");
      expect(response.prompt).toContain("UVカット率は未確認");
      expect(response.notes).toContain("Compiled image model prompt with commercial-image@v1.");
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("imports pasted product text into the product library after cleaning it", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-product-import-save-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const server = createConsoleServer({ rootDir: root, fixturesDir });

    const response = await server.fetchJson("/api/products/import", {
      method: "POST",
      body: JSON.stringify({
        text: [
          "店铺名：lumi",
          "商品ID 172397240576223361",
          "商品タイトル 接触冷感アームカバー 指穴付き ロング丈",
          "販売価格：¥1,280",
          "カテゴリ：レディース > ファッション小物 > アームカバー",
          "カラー：ホワイト / ブラック",
          "素材 ポリエステル",
          "・通気性のある生地",
          "・UVカット96%以上",
          "主图：https://cdn.example.com/main.jpg"
        ].join("\n")
      })
    });

    const productPath = testProductPath(fixturesDir, "DXM-172397240576223361");
    expect(response.product).toEqual(expect.objectContaining({
      path: productPath,
      sku: "DXM-172397240576223361",
      title_ja: "接触冷感アームカバー 指穴付き ロング丈",
      category: "アームカバー",
      verified_selling_points: ["通気性のある生地", "ホワイト、ブラックの2色展開"],
      forbidden_claims: expect.arrayContaining(["UVカット96%以上は証明未確認"]),
      reference_images: ["https://cdn.example.com/main.jpg"]
    }));
    expect(response.notes).toContain("已忽略店铺名: lumi");
    await expect(readFile(productPath, "utf8")).resolves.toContain("\"sku\": \"DXM-172397240576223361\"");
    await expect(server.fetchJson("/api/products")).resolves.toEqual({
      products: [
        expect.objectContaining({
          path: productPath,
          sku: "DXM-172397240576223361",
          title_ja: "接触冷感アームカバー 指穴付き ロング丈",
          referenceImageCount: 1
        })
      ]
    });
  });

  it("imports bare image URLs from pasted product text into reference images", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-product-import-bare-image-save-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const imageUrl = "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/c5633a662f964e4889c530fd4fd4b263~tplv-o3syd03w52-origin-jpeg.jpeg?dr=15568&t=555f072d&ps=933b5bde&shp=a3510d86&shcp=6ce186a1&idc=my&from=2739998086";
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === imageUrl) {
        return new Response(Buffer.from("remote-image-bytes"), {
          headers: {
            "content-type": "image/jpeg"
          }
        });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fixturesDir, fetchImpl });

    const response = await server.fetchJson("/api/products/import", {
      method: "POST",
      body: JSON.stringify({
        text: [
          "商品ID 172397240576223361",
          "商品タイトル 接触冷感アームカバー 指穴付き ロング丈",
          "カテゴリ：レディース > ファッション小物 > アームカバー",
          "素材 ポリエステル",
          "サイズ：長さ約52cm",
          "・通気性のある生地",
          imageUrl
        ].join("\n")
      })
    });

    const productPath = testProductPath(fixturesDir, "DXM-172397240576223361");
    const refFile = join(dirname(productPath), "refs", "reference-01.jpg");
    expect(response.product.reference_images).toEqual(["refs/reference-01.jpg"]);
    expect(response.product.reference_image_statuses[0]).toEqual(expect.objectContaining({
      previewUrl: `/media?path=${encodeURIComponent(refFile)}`,
      status: "previewable"
    }));
    await expect(readFile(productPath, "utf8")).resolves.toContain("refs/reference-01.jpg");
    await expect(readFile(refFile, "utf8")).resolves.toBe("remote-image-bytes");
  });

  it("imports multiple pasted product blocks and reports per-item errors", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-product-import-batch-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const server = createConsoleServer({ rootDir: root, fixturesDir });

    const response = await server.fetchJson("/api/products/import-batch", {
      method: "POST",
      body: JSON.stringify({
        text: [
          [
            "商品ID 172397240576223361",
            "商品タイトル 接触冷感アームカバー 指穴付き ロング丈",
            "カテゴリ：レディース > ファッション小物 > アームカバー",
            "素材 ポリエステル",
            "・通気性のある生地",
            "主图：https://cdn.example.com/arm.jpg"
          ].join("\n"),
          "---",
          [
            "SKU: WALLET-BLACK-001",
            "商品名：ラウンドファスナー ミニ財布 ブラック",
            "カテゴリ：財布",
            "素材：PUレザー、ポリエステル",
            "サイズ：約11x9x3cm",
            "卖点：カードを整理しやすい / 小銭入れ付き",
            "图片：/tmp/wallet-main.jpg"
          ].join("\n"),
          "---",
          "商品ID BROKEN-001\nカテゴリ：財布\n素材：PU"
        ].join("\n\n")
      })
    });

    expect(response.summary).toEqual({
      total: 3,
      imported: 2,
      failed: 1
    });
    expect(response.results).toEqual([
      expect.objectContaining({
        index: 1,
        status: "imported",
        product: expect.objectContaining({
          sku: "DXM-172397240576223361",
          title_ja: "接触冷感アームカバー 指穴付き ロング丈"
        })
      }),
      expect.objectContaining({
        index: 2,
        status: "imported",
        product: expect.objectContaining({
          sku: "WALLET-BLACK-001",
          title_ja: "ラウンドファスナー ミニ財布 ブラック"
        })
      }),
      {
        index: 3,
        status: "failed",
        error: "Imported product title is missing or invalid."
      }
    ]);
    const products = await server.fetchJson("/api/products");
    expect(products.products.map((product: { sku: string }) => product.sku)).toEqual([
      "DXM-172397240576223361",
      "WALLET-BLACK-001"
    ]);
    await expect(readFile(testProductPath(fixturesDir, "DXM-172397240576223361"), "utf8")).resolves.toContain("接触冷感アームカバー");
    await expect(readFile(testProductPath(fixturesDir, "WALLET-BLACK-001"), "utf8")).resolves.toContain("ラウンドファスナー");
  });

  it("previews CSV product file imports and commits only selected rows", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-product-file-import-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const imageUrl = "https://cdn.example.test/arm-main.jpg";
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === imageUrl) {
        return new Response(Buffer.from("remote-image-bytes"), {
          headers: {
            "content-type": "image/jpeg"
          }
        });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fixturesDir, fetchImpl });
    await server.fetchJson("/api/products", {
      method: "POST",
      body: JSON.stringify({
        sku: "WALLET-001",
        title_ja: "既存財布",
        category: "財布",
        materials: ["PU"],
        dimensions: "約11cm",
        verified_selling_points: ["カードを整理しやすい"],
        usage_scenes: ["買い物"],
        forbidden_claims: [],
        reference_images: []
      })
    });
    const csv = [
      "SKU,商品名,カテゴリ,素材,サイズ,卖点,使用场景,主图",
      `ARM-001,接触冷感アームカバー,アームカバー,ポリエステル,約52cm,通気性のある生地,通勤,${imageUrl}`,
      "WALLET-001,ラウンドファスナー ミニ財布,財布,PUレザー,約11x9x3cm,カードを整理しやすい,買い物,https://cdn.example.test/wallet.jpg"
    ].join("\n");

    const preview = await server.fetchJson("/api/products/import-file-preview", {
      method: "POST",
      body: JSON.stringify({
        fileName: "店小秘导出.csv",
        mimeType: "text/csv",
        base64: Buffer.from(csv, "utf8").toString("base64")
      })
    });

    expect(preview.summary).toEqual({
      total: 2,
      ready: 1,
      needsAi: 0,
      needsInput: 0,
      duplicateSku: 1,
      failed: 0
    });
    expect(preview.rows.map((row: { status: string; product?: { sku: string } }) => [row.status, row.product?.sku])).toEqual([
      ["ready", "ARM-001"],
      ["duplicate", "WALLET-001"]
    ]);

    const committed = await server.fetchJson("/api/products/import-file-commit", {
      method: "POST",
      body: JSON.stringify({
        rows: preview.rows,
        rowIds: [preview.rows[0].rowId]
      })
    });

    const armProductPath = testProductPath(fixturesDir, "ARM-001");
    const refFile = join(dirname(armProductPath), "refs", "reference-01.jpg");
    expect(committed.summary).toEqual({
      requested: 1,
      imported: 1,
      failed: 0
    });
    expect(committed.results[0]).toEqual(expect.objectContaining({
      rowId: preview.rows[0].rowId,
      status: "imported",
      product: expect.objectContaining({
        sku: "ARM-001",
        reference_images: ["refs/reference-01.jpg"]
      })
    }));
    expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toBe(imageUrl);
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]).toEqual(expect.objectContaining({ redirect: "manual" }));
    await expect(readFile(refFile, "utf8")).resolves.toBe("remote-image-bytes");
    const products = await server.fetchJson("/api/products");
    expect(products.products.map((product: { sku: string }) => product.sku)).toEqual(["ARM-001", "WALLET-001"]);
  });

  it("returns cleaning notes for messy ecommerce imports", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-product-import-notes-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const server = createConsoleServer({ rootDir: root, fixturesDir });

    const response = await server.fetchJson("/api/products/import-preview", {
      method: "POST",
      body: JSON.stringify({
        text: [
          "店铺名：lumi",
          "商品ID 172397240576223361",
          "商品タイトル 接触冷感アームカバー 指穴付き ロング丈",
          "販売価格：¥1,280",
          "カラー：ホワイト / ブラック",
          "素材 ポリエステル",
          "・通気性のある生地",
          "・UVカット96%以上",
          "主图：https://cdn.example.com/main.jpg"
        ].join("\n")
      })
    });

    expect(response.product).toEqual(expect.objectContaining({
      sku: "DXM-172397240576223361",
      title_ja: "接触冷感アームカバー 指穴付き ロング丈",
      materials: ["ポリエステル"],
      reference_images: ["https://cdn.example.com/main.jpg"]
    }));
    expect(response.notes).toEqual([
      "已忽略店铺名: lumi",
      "已识别价格但未写入商品资料: ¥1,280",
      "颜色已转为可确认卖点: ホワイト、ブラックの2色展開",
      "疑似夸大或需证明的宣称已移入禁止宣称: UVカット96%以上"
    ]);
    expect(response.quality).toEqual(expect.objectContaining({
      ready: false,
      score: 67,
      missingFields: ["分类", "尺寸/重量"],
      verifiedFacts: expect.arrayContaining(["标题", "材质", "已验证卖点", "使用场景", "参考图"]),
      blockedClaims: ["UVカット96%以上"],
      warnings: expect.arrayContaining([
        "价格已识别但不写入商品资料，后续可在字幕/CTA 阶段单独管理。",
        "存在未确认宣称，已放入禁止宣称，不会用于脚本或 prompt。",
        "请补充尺寸/重量，避免生成脚本时编造大小、容量或便携性。"
      ])
    }));
  });

  it("persists API management defaults for console video jobs", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-settings-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    const server = createConsoleServer({ rootDir: root, outputsDir });

    await expect(server.fetchJson("/api/settings")).resolves.toEqual({
      settings: {
        defaultLanguage: "ja",
        defaultDurationSeconds: 10,
        defaultTemplate: "scene",
        enabledTemplates: ["scene", "pain-point", "benefit", "ugc", "unboxing"],
        defaultCta: "今すぐチェック",
        defaultProvider: "volcengine-seedance",
        maxEstimatedCostCnyPerVideo: 5,
        testCreditBalanceCny: 0,
        forbiddenWords: ["日本で大人気", "ランキング1位", "完全防水", "医療用"],
        exaggerationRules: [
          "商品资料未确认的销量、排名、功效、耐荷重、防水、UV 数值不得出现在脚本和字幕里。"
        ],
        paymentMethods: [
          expect.objectContaining({ id: "stripe", enabled: true, kind: "rmb" }),
          expect.objectContaining({ id: "infini", enabled: true, kind: "crypto" })
        ]
      }
    });

    const response = await server.fetchJson("/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        defaultDurationSeconds: 10,
        defaultTemplate: "ugc",
        enabledTemplates: ["scene", "pain-point", "benefit", "ugc", "unboxing"],
        defaultCta: "プロフィールからチェック",
        defaultProvider: "volcengine-seedance",
        maxEstimatedCostCnyPerVideo: 12.5,
        testCreditBalanceCny: 20,
        forbiddenWords: ["絶対痩せる", "医療用"],
        exaggerationRules: ["未确认功效不写入视频。"]
      })
    });

    expect(response.settings).toEqual({
      defaultLanguage: "ja",
      defaultDurationSeconds: 10,
      defaultTemplate: "ugc",
      enabledTemplates: ["scene", "pain-point", "benefit", "ugc", "unboxing"],
      defaultCta: "プロフィールからチェック",
      defaultProvider: "volcengine-seedance",
      maxEstimatedCostCnyPerVideo: 12.5,
      testCreditBalanceCny: 20,
      forbiddenWords: ["絶対痩せる", "医療用"],
      exaggerationRules: ["未确认功效不写入视频。"],
      paymentMethods: [
        expect.objectContaining({ id: "stripe", enabled: true, kind: "rmb" }),
        expect.objectContaining({ id: "infini", enabled: true, kind: "crypto" })
      ]
    });
    expect(readConsoleSettingsRows(testDataDir(root))).toEqual([expect.objectContaining({
      id: "global",
      default_cta: "プロフィールからチェック",
      max_estimated_cost_cents_per_video: 1250,
      test_credit_balance_cents: 2000
    })]);
    await expect(access(join(testSystemDir(root), "console-settings.json"))).rejects.toThrow();
    await expect(server.fetchJson("/api/settings")).resolves.toEqual({
      settings: response.settings
    });
  });

  it("initializes database-backed console settings on startup", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-settings-startup-"));
    tempDirs.push(root);

    createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

    expect(readConsoleSettingsRows(testDataDir(root))).toEqual([expect.objectContaining({
      id: "global",
      default_cta: "今すぐチェック",
      max_estimated_cost_cents_per_video: 500,
      test_credit_balance_cents: 0
    })]);
  });

  it("lets admins manage database-backed generation billing settings", async () => {
    const previousAdminEmail = process.env.HAITU_ADMIN_EMAIL;
    process.env.HAITU_ADMIN_EMAIL = "console-test@example.com";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-admin-billing-settings-"));
      tempDirs.push(root);
      const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });

      const initial = await server.fetchJson("/api/admin/billing-settings");
      expect(initial.settings).toEqual({
        policy: expect.objectContaining({
          policyId: "metered-generation",
          mode: "metered_generation",
          enabled: true
        }),
        rules: [
          expect.objectContaining({ usageKind: "text", serviceFeeCny: 0.2 }),
          expect.objectContaining({ usageKind: "image", serviceFeeCny: 0.3 }),
          expect.objectContaining({ usageKind: "video", serviceFeeCny: 1 })
        ]
      });

      const updated = await server.fetchJson("/api/admin/billing-settings", {
        method: "PUT",
        body: JSON.stringify({
          rules: [
            { usageKind: "text", serviceFeeCny: 0.25 },
            { usageKind: "image", serviceFeeCny: 0.45 },
            { usageKind: "video", serviceFeeCny: 1.25 }
          ]
        })
      });
      const listed = await server.fetchJson("/api/admin/billing-settings");

      expect(updated.settings.rules.map((rule: { usageKind: string; serviceFeeCny: number }) => [
        rule.usageKind,
        rule.serviceFeeCny
      ])).toEqual([
        ["text", 0.25],
        ["image", 0.45],
        ["video", 1.25]
      ]);
      expect(listed.settings).toEqual(updated.settings);
    } finally {
      restoreEnv("HAITU_ADMIN_EMAIL", previousAdminEmail);
    }
  });

  it("manages built-in video templates and rejects disabled templates for preflight", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-templates-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    await writeProduct(testProductPath(fixturesDir, "box"));
    const server = createConsoleServer({ rootDir: root, fixturesDir });

    const initial = await server.fetchJson("/api/templates");
    expect(initial.templates.map((template: { id: string }) => template.id)).toEqual([
      "scene",
      "pain-point",
      "benefit",
      "ugc",
      "unboxing"
    ]);
    expect(initial.defaultTemplate).toBe("scene");
    expect(initial.enabledTemplates).toEqual(["scene", "pain-point", "benefit", "ugc", "unboxing"]);
    expect(initial.templates[0]).toEqual(expect.objectContaining({
      id: "scene",
      label: "场景型",
      purpose: expect.stringContaining("使用场景"),
      enabled: true,
      isDefault: true
    }));

    const updated = await server.fetchJson("/api/templates", {
      method: "PUT",
      body: JSON.stringify({
        defaultTemplate: "ugc",
        enabledTemplates: ["scene", "ugc"]
      })
    });
    expect(updated.defaultTemplate).toBe("ugc");
    expect(updated.enabledTemplates).toEqual(["scene", "ugc"]);
    expect(updated.templates.find((template: { id: string }) => template.id === "ugc")).toEqual(expect.objectContaining({
      enabled: true,
      isDefault: true
    }));
    expect(updated.templates.find((template: { id: string }) => template.id === "benefit")).toEqual(expect.objectContaining({
      enabled: false,
      isDefault: false
    }));

    const blocked = await server.fetch("/api/preflight", {
      method: "POST",
      body: JSON.stringify({
        productPath: testProductPath(fixturesDir, "box"),
        provider: "mock",
        duration: 8,
        template: "benefit",
        cta: "今すぐチェック"
      })
    });
    expect(blocked.status).toBe(422);
    await expect(blocked.json()).resolves.toEqual({
      error: "Template benefit is disabled. Enable it in template management before using it."
    });
  });

  it("lists product fixtures and existing make-video reports", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const outputsDir = testJobsDir(root);
    await writeProduct(testProductPath(fixturesDir, "box"));
    await mkdir(join(outputsDir, "box"), { recursive: true });
    await writeFile(
      join(outputsDir, "box", "make-video-report.json"),
      JSON.stringify({
        type: "haitu_make_video_report",
        productSku: "TK-001",
        provider: "mock",
        status: "completed"
      }),
      "utf8"
    );
    const server = createConsoleServer({ rootDir: root, fixturesDir, outputsDir });

    const products = await server.fetchJson("/api/products");
    const reports = await server.fetchJson("/api/reports");

    expect(products).toEqual({
      products: [
        expect.objectContaining({
          path: testProductPath(fixturesDir, "box"),
          sku: "TK-001",
          title_ja: "折りたたみ収納ボックス",
          referenceImageCount: 2
        })
      ]
    });
    expect(reports).toEqual({
      reports: [
        {
          path: join(outputsDir, "box", "make-video-report.json"),
          productSku: "TK-001",
          provider: "mock",
          status: "completed",
          durationSeconds: undefined,
          rawManifestPath: undefined,
          rawOutputPath: undefined,
          finalOutputPath: undefined,
          finalVideoUrl: undefined,
          billing: undefined,
          totalCost: undefined,
          taskId: undefined,
          reusedRawManifest: undefined
        }
      ]
    });
  });

  it("deduplicates product list entries that point to the same saved product", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-product-dedupe-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    await writeProduct(testProductPath(fixturesDir, "box"), {
      sku: "TK-001",
      title_ja: "折りたたみ収納ボックス",
      reference_images: ["main.jpg"]
    });
    await writeProduct(testProductPath(fixturesDir, "box-copy"), {
      sku: "TK-001",
      title_ja: "折りたたみ収納ボックス",
      reference_images: ["main.jpg", "detail1.jpg"]
    });
    await writeProduct(testProductPath(fixturesDir, "wallet"), {
      sku: "WALLET-001",
      title_ja: "ミニ財布"
    });
    const server = createConsoleServer({ rootDir: root, fixturesDir });

    const products = await server.fetchJson("/api/products");

    expect(products.products.map((product: { sku: string }) => product.sku)).toEqual(["TK-001", "WALLET-001"]);
    expect(products.products.filter((product: { sku: string }) => product.sku === "TK-001")).toHaveLength(1);
    expect(products.products.find((product: { sku: string }) => product.sku === "TK-001")).toEqual(expect.objectContaining({
      title_ja: "折りたたみ収納ボックス",
      referenceImageCount: 2
    }));
  });

  it("returns one product fact package by sku", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-product-detail-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const productPath = testProductPath(fixturesDir, "box");
    await writeProduct(productPath);
    await writeFile(productAssetPath(productPath, "main.jpg"), Buffer.from("main-image"));
    const server = createConsoleServer({ rootDir: root, fixturesDir });

    const response = await server.fetchJson("/api/products/TK-001");

    expect(response).toEqual({
      product: {
        path: productPath,
        sku: "TK-001",
        title_ja: "折りたたみ収納ボックス",
        category: "収納用品",
        materials: ["PP"],
        dimensions: "36x25x19cm",
        verified_selling_points: ["折りたたみ可能", "積み重ね可能", "省スペース"],
        usage_scenes: ["キッチン", "洗面所", "クローゼット"],
        forbidden_claims: ["防水未確認", "耐荷重未確認", "日本で大人気は未確認"],
        reference_images: ["main.jpg", "detail1.jpg"],
        referenceImageCount: 2,
        importQuality: {
          ready: true,
          score: 100,
          summary: "商品资料完整，可进入视频预检。",
          missingFields: [],
          verifiedFacts: ["标题", "分类", "材质", "尺寸/重量", "已验证卖点", "使用场景", "参考图"],
          warnings: []
        },
        paidReadiness: {
          readyForPaidGeneration: true,
          blockingReasons: [],
          warnings: ["1 张参考图缺失。"]
        },
        reference_image_urls: [
          `/media?path=${encodeURIComponent(productAssetPath(productPath, "main.jpg"))}`,
          null
        ],
        reference_image_statuses: [
          {
            original: "main.jpg",
            resolvedPath: productAssetPath(productPath, "main.jpg"),
            previewUrl: `/media?path=${encodeURIComponent(productAssetPath(productPath, "main.jpg"))}`,
            status: "previewable"
          },
          {
            original: "detail1.jpg",
            resolvedPath: productAssetPath(productPath, "detail1.jpg"),
            previewUrl: null,
            status: "missing"
          }
        ]
      }
    });
  });

  it("summarizes product fact quality and paid readiness in the product list", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-product-readiness-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    await writeProduct(testProductPath(fixturesDir, "ready-wallet"), {
      sku: "READY-WALLET",
      title_ja: "ラウンドファスナー ミニ財布",
      category: "財布",
      materials: ["PUレザー"],
      dimensions: "約11x9x3cm",
      verified_selling_points: ["カードを整理しやすい"],
      usage_scenes: ["買い物"],
      reference_images: ["ready-main.jpg"]
    });
    await writeFile(productAssetPath(testProductPath(fixturesDir, "ready-wallet"), "ready-main.jpg"), Buffer.from("ready-image"));
    await writeProduct(testProductPath(fixturesDir, "draft-wallet"), {
      sku: "DRAFT-WALLET",
      title_ja: "ミニ財布",
      category: "財布",
      materials: ["材质未确认"],
      dimensions: "尺寸未确认",
      verified_selling_points: ["商品资料已导入，卖点待确认"],
      usage_scenes: ["買い物"],
      reference_images: ["missing.jpg"]
    });
    const server = createConsoleServer({ rootDir: root, fixturesDir });

    const response = await server.fetchJson("/api/products");

    expect(response.products).toEqual([
      expect.objectContaining({
        sku: "DRAFT-WALLET",
        importQuality: expect.objectContaining({
          ready: false,
          missingFields: expect.arrayContaining(["材质", "尺寸/重量", "已验证卖点"]),
          summary: expect.stringContaining("缺少")
        }),
        paidReadiness: {
          readyForPaidGeneration: true,
          blockingReasons: [],
          warnings: expect.arrayContaining([
            "1 张参考图缺失。",
            "没有可用参考图，视频外观可能不稳定。",
            "请补充材质，避免脚本描述商品手感或面料时编造。",
            "请补充尺寸/重量，避免脚本编造大小、容量或便携性。",
            "请补充已验证卖点，避免脚本事实边界过宽。"
          ])
        }
      }),
      expect.objectContaining({
        sku: "READY-WALLET",
        importQuality: expect.objectContaining({
          ready: true,
          score: 100,
          summary: "商品资料完整，可进入视频预检。"
        }),
        paidReadiness: {
          readyForPaidGeneration: true,
          blockingReasons: [],
          warnings: []
        }
      })
    ]);
  });

  it("creates a local product fact package from the console", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-create-product-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const server = createConsoleServer({ rootDir: root, fixturesDir });

    const response = await server.fetchJson("/api/products", {
      method: "POST",
      body: JSON.stringify({
        sku: "NEW-WALLET/BLACK",
        title_ja: "ラウンドファスナー財布",
        category: "財布",
        materials: ["レザー調素材"],
        dimensions: "ミニサイズ",
        verified_selling_points: ["カードを整理しやすい", "小銭入れ付き"],
        usage_scenes: ["買い物", "通勤"],
        forbidden_claims: ["本革未確認", "防水未確認"],
        reference_images: ["refs/reference-01.jpg"]
      })
    });

    const productPath = testProductPath(fixturesDir, "NEW-WALLET-BLACK");
    expect(response.product).toEqual(expect.objectContaining({
      path: productPath,
      sku: "NEW-WALLET/BLACK",
      title_ja: "ラウンドファスナー財布"
    }));
    await expect(readFile(productPath, "utf8")).resolves.toContain("\"sku\": \"NEW-WALLET/BLACK\"");
    await expect(server.fetchJson("/api/products")).resolves.toEqual({
      products: [
        expect.objectContaining({
          path: productPath,
          sku: "NEW-WALLET/BLACK",
          title_ja: "ラウンドファスナー財布",
          referenceImageCount: 1
        })
      ]
    });
    await expect(server.fetchJson("/api/products/NEW-WALLET%2FBLACK")).resolves.toEqual({
      product: expect.objectContaining({
        path: productPath,
        sku: "NEW-WALLET/BLACK",
        title_ja: "ラウンドファスナー財布",
        reference_image_statuses: [
          expect.objectContaining({
            original: "refs/reference-01.jpg",
            status: "missing"
          })
        ]
      })
    });
  });

  it("does not create preview URLs for product images outside the project root", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-product-safe-image-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    await writeProduct(testProductPath(fixturesDir, "external"), {
      reference_images: [join(tmpdir(), "outside-wallet.jpg")]
    });
    const server = createConsoleServer({ rootDir: root, fixturesDir });

    const response = await server.fetchJson("/api/products/TK-001");

    expect(response.product.reference_image_urls).toEqual([null]);
    expect(response.product.reference_image_statuses).toEqual([
      {
        original: join(tmpdir(), "outside-wallet.jpg"),
        resolvedPath: join(tmpdir(), "outside-wallet.jpg"),
        previewUrl: null,
        status: "outside-project-root"
      }
    ]);
  });

  it("imports outside product reference images into project assets and updates the product file", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-import-assets-"));
    tempDirs.push(root);
    const outsideDir = await mkdtemp(join(tmpdir(), "haitu-outside-assets-"));
    tempDirs.push(outsideDir);
    const outsideImagePath = join(outsideDir, "wallet.jpg");
    await writeFile(outsideImagePath, Buffer.from("wallet-image"));
    vi.stubEnv("HAITU_LOCAL_IMPORT_ROOT", outsideDir);
    const fixturesDir = testProductsDir(root);
    const productPath = testProductPath(fixturesDir, "wallet");
    await writeProduct(productPath, {
      reference_images: [outsideImagePath]
    });
    const server = createConsoleServer({ rootDir: root, fixturesDir });

    const response = await server.fetchJson("/api/products/TK-001/import-assets", {
      method: "POST"
    });

    const importedPath = join(productPath, "..", "refs", "reference-01.jpg");
    const importedReference = "refs/reference-01.jpg";
    expect(response.imported).toEqual([
      {
        original: outsideImagePath,
        path: importedPath,
        reference: importedReference
      }
    ]);
    await expect(readFile(importedPath, "utf8")).resolves.toBe("wallet-image");
    await expect(readFile(productPath, "utf8")).resolves.toContain(importedReference);

    const detail = await server.fetchJson("/api/products/TK-001");
    expect(detail.product.reference_images).toEqual([importedReference]);
    expect(detail.product.reference_image_statuses[0]).toEqual({
      original: importedReference,
      resolvedPath: importedPath,
      previewUrl: `/media?path=${encodeURIComponent(importedPath)}`,
      status: "previewable"
    });
  });

  it("uploads product reference images into project assets and appends them to the product", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-upload-assets-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const productPath = testProductPath(fixturesDir, "wallet");
    await writeProduct(productPath, {
      reference_images: ["main.jpg"]
    });
    const server = createConsoleServer({ rootDir: root, fixturesDir });

    const response = await server.fetchJson("/api/products/TK-001/reference-images", {
      method: "POST",
      body: JSON.stringify({
        files: [
          {
            fileName: "钱包 黑色.JPG",
            mimeType: "image/jpeg",
            base64: Buffer.from("uploaded-wallet-image").toString("base64")
          }
        ]
      })
    });

    const uploadedPath = join(productPath, "..", "refs", "reference-02.jpg");
    const uploadedReference = "refs/reference-02.jpg";
    expect(response.uploaded).toEqual([
      {
        originalName: "钱包 黑色.JPG",
        path: uploadedPath,
        reference: uploadedReference
      }
    ]);
    await expect(readFile(uploadedPath, "utf8")).resolves.toBe("uploaded-wallet-image");
    await expect(readFile(productPath, "utf8")).resolves.toContain(uploadedReference);

    const detail = await server.fetchJson("/api/products/TK-001");
    expect(detail.product.reference_images).toEqual(["main.jpg", uploadedReference]);
    expect(detail.product.reference_image_statuses[1]).toEqual({
      original: uploadedReference,
      resolvedPath: uploadedPath,
      previewUrl: `/media?path=${encodeURIComponent(uploadedPath)}`,
      status: "previewable"
    });
  });

  it("does not reuse stale reference image filenames when uploading product images", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-upload-assets-stale-name-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const productPath = testProductPath(fixturesDir, "wallet");
    await writeProduct(productPath, {
      reference_images: ["refs/reference-01.jpg"]
    });
    const stalePath = join(productPath, "..", "refs", "reference-02.jpg");
    await mkdir(dirname(stalePath), { recursive: true });
    await writeFile(stalePath, Buffer.from("stale-deleted-image"));
    const server = createConsoleServer({ rootDir: root, fixturesDir });

    const response = await server.fetchJson("/api/products/TK-001/reference-images", {
      method: "POST",
      body: JSON.stringify({
        files: [
          {
            fileName: "copied-reference.jpg",
            mimeType: "image/jpeg",
            base64: Buffer.from("new-copied-image").toString("base64")
          }
        ]
      })
    });

    const uploadedPath = join(productPath, "..", "refs", "reference-03.jpg");
    const uploadedReference = "refs/reference-03.jpg";
    expect(response.uploaded).toEqual([
      {
        originalName: "copied-reference.jpg",
        path: uploadedPath,
        reference: uploadedReference
      }
    ]);
    expect(response.product.reference_images).toEqual(["refs/reference-01.jpg", uploadedReference]);
    await expect(readFile(stalePath, "utf8")).resolves.toBe("stale-deleted-image");
    await expect(readFile(uploadedPath, "utf8")).resolves.toBe("new-copied-image");
  });

  it("replaces placeholder reference image entries when uploading real product images", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-upload-replaces-placeholder-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const productPath = testProductPath(fixturesDir, "wallet");
    await writeProduct(productPath, {
      reference_images: ["reference.jpg"]
    });
    const server = createConsoleServer({ rootDir: root, fixturesDir });

    const response = await server.fetchJson("/api/products/TK-001/reference-images", {
      method: "POST",
      body: JSON.stringify({
        files: [
          {
            fileName: "wallet.png",
            mimeType: "image/png",
            base64: Buffer.from("uploaded-wallet-image").toString("base64")
          }
        ]
      })
    });

    const uploadedReference = "refs/reference-01.png";
    expect(response.product.reference_images).toEqual([uploadedReference]);
    expect(response.product.reference_image_statuses).toEqual([
      expect.objectContaining({
        original: uploadedReference,
        status: "previewable"
      })
    ]);
  });

  it("deletes a product reference image from the product file", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-delete-reference-image-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const productPath = testProductPath(fixturesDir, "wallet");
    const assetPath = productAssetPath(productPath, "refs/reference-02.jpg");
    const assetReference = "refs/reference-02.jpg";
    await mkdir(join(productPath, "..", "refs"), { recursive: true });
    await writeFile(assetPath, Buffer.from("uploaded-wallet-image"));
    await writeProduct(productPath, {
      reference_images: ["main.jpg", assetReference, "detail.jpg"]
    });
    const server = createConsoleServer({ rootDir: root, fixturesDir });

    const response = await server.fetchJson("/api/products/TK-001/reference-images/1", {
      method: "DELETE"
    });

    expect(response.deleted).toEqual({
      index: 1,
      reference: assetReference
    });
    expect(response.product.reference_images).toEqual(["main.jpg", "detail.jpg"]);
    await expect(readFile(productPath, "utf8")).resolves.not.toContain(assetReference);
    await expect(stat(assetPath)).resolves.toEqual(expect.objectContaining({
      size: "uploaded-wallet-image".length
    }));
  });

  it("reports missing image model before wallet balance when generating product images", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-image-model-missing-before-wallet-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const productPath = testProductPath(fixturesDir, "wallet");
    await writeProduct(productPath, {
      sku: "IMG-MODEL-MISSING-001",
      title_ja: "画像モデル未設定商品",
      reference_images: []
    });
    const server = createConsoleServer({ rootDir: root, fixturesDir, autoStartSavedJobs: false });

    const blocked = await server.fetch("/api/products/IMG-MODEL-MISSING-001/reference-images/generate", {
      method: "POST",
      body: JSON.stringify({ count: 1 })
    });

    expect(blocked.status).toBe(422);
    await expect(blocked.json()).resolves.toEqual({
      error: "请先在 API 管理配置图片模型 API Key。"
    });
  });

  it("reorders product reference images in the product file", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-reorder-reference-images-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const productPath = testProductPath(fixturesDir, "wallet");
    await writeProduct(productPath, {
      reference_images: ["main.jpg", "detail.jpg", "use.jpg"]
    });
    const server = createConsoleServer({ rootDir: root, fixturesDir });

    const response = await server.fetchJson("/api/products/TK-001/reference-images/order", {
      method: "PUT",
      body: JSON.stringify({
        referenceImages: ["use.jpg", "main.jpg", "detail.jpg"]
      })
    });

    expect(response.product.reference_images).toEqual(["use.jpg", "main.jpg", "detail.jpg"]);
    await expect(readFile(productPath, "utf8")).resolves.toContain('"reference_images": [\n    "use.jpg",\n    "main.jpg",\n    "detail.jpg"\n  ]');
  });

  it("uses a manually selected image model config to generate product reference images", async () => {
    const previousImageKey = process.env.IMAGE_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.IMAGE_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-console-generate-reference-images-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const productPath = testProductPath(fixturesDir, "wallet");
      await writeProduct(productPath, {
        sku: "IMG-001",
        title_ja: "接触冷感アームカバー",
        reference_images: ["main.jpg"]
      });
      await writeFile(productAssetPath(productPath, "main.jpg"), Buffer.from("main-reference"));
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          data: [
            {
              b64_json: Buffer.from("generated-reference-image").toString("base64")
            }
          ]
        })
      ) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fixturesDir, fetchImpl });
      await server.fetchJson("/api/model-configs/openai-compatible-image", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "selected-image-secret-0001",
          name: "手动选择图片",
          vendor: "openai",
          priority: 100,
          baseUrl: "https://api.openai.com",
          model: "gpt-image-2"
        })
      });
      await sleep(5);
      await server.fetchJson("/api/model-configs/openai-compatible-image", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "default-image-secret-9999",
          name: "默认图片",
          vendor: "gemini",
          priority: 1,
          baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
          model: "gemini-2.5-flash-image"
        })
      });
      const providerConfig = await server.fetchJson("/api/provider-config");
      const lowImageConfig = providerConfig.imageModels.find((model: { model: string }) => model.model === "gpt-image-2");
      expect(lowImageConfig).toBeDefined();

      await topUpWalletForAiUsage(server);
      const response = await server.fetchJson("/api/products/IMG-001/reference-images/generate", {
        method: "POST",
        body: JSON.stringify({
          count: 1,
          imageModelConfigId: lowImageConfig.configId
        })
      });

      const generatedPath = join(productPath, "..", "refs", "reference-02.png");
      const generatedReference = "refs/reference-02.png";
      expect(response.generated).toEqual([
        {
          path: generatedPath,
          reference: generatedReference
        }
      ]);
      await expect(readFile(generatedPath, "utf8")).resolves.toBe("generated-reference-image");
      expect(response.product.reference_images).toEqual(["main.jpg", generatedReference]);
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/images/generations");
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({
        authorization: "Bearer selected-image-secret-0001"
      }));
      const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body));
      expect(body.model).toBe("gpt-image-2");
      expect(body.prompt).toContain("接触冷感アームカバー");
      expect(body.n).toBe(1);
    } finally {
      restoreEnv("IMAGE_MODEL_API_KEY", previousImageKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("passes selected reference images into product image generation", async () => {
    const previousImageKey = process.env.IMAGE_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.IMAGE_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-console-generate-selected-reference-images-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const productPath = testProductPath(fixturesDir, "wallet");
      await writeProduct(productPath, {
        sku: "IMG-002",
        title_ja: "接触冷感アームカバー",
        reference_images: ["main.jpg", "detail.jpg"]
      });
      await writeFile(productAssetPath(productPath, "main.jpg"), Buffer.from("main-reference"));
      await writeFile(productAssetPath(productPath, "detail.jpg"), Buffer.from("detail-reference"));
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          data: [
            {
              b64_json: Buffer.from("generated-from-selected-reference").toString("base64")
            }
          ]
        })
      ) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fixturesDir, fetchImpl });
      await server.fetchJson("/api/model-configs/openai-compatible-image", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "selected-image-secret-0002",
          name: "手动选择图片",
          vendor: "openai",
          priority: 100,
          baseUrl: "https://api.openai.com",
          model: "gpt-image-2"
        })
      });

      await topUpWalletForAiUsage(server);
      await server.fetchJson("/api/products/IMG-002/reference-images/generate", {
        method: "POST",
        body: JSON.stringify({
          count: 1,
          prompt: "优化这张细节图",
          referenceImages: ["detail.jpg"]
        })
      });

      expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/images/edits");
      const body = vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body;
      expect(body).toBeInstanceOf(FormData);
      const formData = body as FormData;
      expect(formData.get("prompt")).toContain("优化这张细节图");
      expect(formData.getAll("image")).toHaveLength(1);
      expect((formData.get("image") as File).name).toBe("detail.jpg");
    } finally {
      restoreEnv("IMAGE_MODEL_API_KEY", previousImageKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("returns 404 when product sku does not exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-product-missing-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    await writeProduct(testProductPath(fixturesDir, "box"));
    const server = createConsoleServer({ rootDir: root, fixturesDir });

    const response = await server.fetch("/api/products/NOPE");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Product not found: NOPE"
    });
  });

  it("deletes a product fact package from product management", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-delete-product-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const productPath = testProductPath(fixturesDir, "box");
    await writeProduct(productPath);
    const server = createConsoleServer({ rootDir: root, fixturesDir });

    const response = await server.fetchJson("/api/products/TK-001", {
      method: "DELETE"
    });

    expect(response).toEqual({
      deleted: true,
      sku: "TK-001",
      path: productPath
    });
    await expect(stat(productPath)).rejects.toThrow();
    await expect(server.fetchJson("/api/products")).resolves.toEqual({
      products: []
    });
  });

  it("preflights a paid video generation without calling the provider", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-preflight-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const productPath = testProductPath(fixturesDir, "box");
    await writeProduct(productPath);
    await writeFile(productAssetPath(productPath, "main.jpg"), Buffer.from("main-image"));
    const fetchImpl = vi.fn(async (url: string | URL | Request) => liveFxResponse(url) ?? jsonResponse({ unexpected: true })) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fixturesDir, fetchImpl });

    const response = await server.fetchJson("/api/preflight", {
      method: "POST",
      body: JSON.stringify({
        productPath,
        provider: "volcengine-seedance",
        duration: 8,
        aspectRatio: "16:9",
        template: "scene",
        cta: "今すぐチェック"
      })
    });

    expect(vi.mocked(fetchImpl)).not.toHaveBeenCalled();
    expect(response).toEqual({
      preflight: expect.objectContaining({
        productSku: "TK-001",
        provider: "volcengine-seedance",
        durationSeconds: 8,
        aspectRatio: "16:9",
        paidProvider: true,
        requiresPaidConfirmation: true,
        estimatedTokens: {
          low: 60000,
          expected: 80640,
          high: 109000
        },
        estimatedCostCny: {
          low: 2.22,
          expected: 2.98,
          high: 4.03
        },
        assetSummary: {
          total: 2,
          previewable: 1,
          missing: 1,
          outsideProjectRoot: 0,
          remote: 0
        },
        readiness: {
          readyForPaidGeneration: true,
          blockingReasons: [],
          warnings: ["1 张参考图缺失。"]
        },
        warnings: ["1 reference image is missing."]
      })
    });
    expect(response.preflight.script.voiceover).toContain("折りたたみ収納ボックス");
    expect(response.preflight.prompt).toContain("Duration: 8 seconds");
    expect(response.preflight.prompt).toContain("Aspect ratio: 16:9");
    expect(response.preflight.prompt).toContain("Do not claim or imply");
    expect(response.preflight.referenceImages[0]).toEqual(expect.objectContaining({
      original: "main.jpg",
      status: "previewable"
    }));
  });

  it("warns and previews only the first nine Seedance reference images", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-preflight-reference-limit-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const productPath = testProductPath(fixturesDir, "wallet");
    await writeProduct(productPath, {
      sku: "TK-REF-LIMIT",
      title_ja: "ミニ財布",
      reference_images: Array.from({ length: 10 }, (_, index) => `ref-${index + 1}.jpg`)
    });
    for (let index = 1; index <= 10; index += 1) {
      await writeFile(productAssetPath(productPath, `ref-${index}.jpg`), Buffer.from(`image-${index}`));
    }
    const server = createConsoleServer({ rootDir: root, fixturesDir });

    const response = await server.fetchJson("/api/preflight", {
      method: "POST",
      body: JSON.stringify({
        productPath,
        provider: "volcengine-seedance",
        duration: 10,
        template: "pain-point",
        cta: "今すぐチェック"
      })
    });

    expect(response.preflight.assetSummary.total).toBe(10);
    expect(response.preflight.warnings).toContain("Seedance 最多支持 9 张参考图，本次会只使用前 9 张。");
    expect(response.preflight.readiness.warnings).toContain("参考图超过 9 张，生成时只会使用前 9 张。");
    expect(response.preflight.prompt).toContain("ref-9.jpg");
    expect(response.preflight.prompt).not.toContain("ref-10.jpg");
  });

  it("includes paid generation readiness warnings in preflight", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-preflight-readiness-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const productPath = testProductPath(fixturesDir, "box");
    await writeProduct(productPath, {
      materials: ["材质未确认"],
      dimensions: "尺寸未确认",
      reference_images: ["missing-main.jpg"]
    });
    const server = createConsoleServer({ rootDir: root, fixturesDir });

    const response = await server.fetchJson("/api/preflight", {
      method: "POST",
      body: JSON.stringify({
        productPath,
        provider: "volcengine-seedance",
        duration: 8,
        template: "scene",
        cta: "今すぐチェック"
      })
    });

    expect(response.preflight.readiness).toEqual({
      readyForPaidGeneration: true,
      blockingReasons: [],
      warnings: [
        "1 张参考图缺失。",
        "没有可用参考图，视频外观可能不稳定。",
        "请补充材质，避免脚本描述商品手感或面料时编造。",
        "请补充尺寸/重量，避免脚本编造大小、容量或便携性。"
      ]
    });
  });

  it("shows cost history in paid preflight estimates", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-credit-preflight-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const outputsDir = testJobsDir(root);
    const productPath = testProductPath(fixturesDir, "box");
    await writeProduct(productPath);
    await writeFileReport(join(outputsDir, "paid-run", "make-video-report.json"), {
      type: "haitu_make_video_report",
      productSku: "TK-001",
      provider: "volcengine-seedance",
      status: "completed",
      durationSeconds: 8,
      billing: {
        totalTokens: 27000,
        estimatedCostCny: 1
      },
      raw: {
        outputPath: join(outputsDir, "paid-run", "raw.mp4")
      },
      reportPath: join(outputsDir, "paid-run", "make-video-report.json")
    });
    const server = createConsoleServer({ rootDir: root, fixturesDir, outputsDir });
    await server.fetchJson("/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        testCreditBalanceCny: 5
      })
    });

    const response = await server.fetchJson("/api/preflight", {
      method: "POST",
      body: JSON.stringify({
        productPath,
        provider: "volcengine-seedance",
        duration: 8,
        template: "scene",
        cta: "今すぐチェック"
      })
    });

    expect(response.preflight.credit).toEqual({
      testCreditBalanceCny: 5,
      usedEstimatedCostCny: 1,
      availableEstimatedCostCny: 4,
      estimatedCostCny: 2.98,
      enoughCredit: true
    });
  });

  it("lists report preview fields and serves local video media inside the project root", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-media-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    const runDir = join(outputsDir, "wallet-video");
    const rawManifestPath = join(runDir, "raw", "TK-001", "v1", "manifest.json");
    const rawOutputPath = join(runDir, "raw", "TK-001", "v1", "wallet.seedance.mp4");
    const finalOutputPath = join(runDir, "final", "wallet.final.mp4");
    await mkdir(join(rawManifestPath, ".."), { recursive: true });
    await mkdir(join(finalOutputPath, ".."), { recursive: true });
    await writeFile(rawManifestPath, JSON.stringify({
      type: "raw",
      product: {
        sku: "WALLET-BLACK-001",
        title_ja: "カード収納ミニ財布",
        category: "財布",
        materials: ["PU"],
        verified_selling_points: ["カード収納", "コンパクト"],
        usage_scenes: ["通勤", "お出かけ"]
      },
      script: {
        voiceover: "カード収納が便利なミニ財布。",
        subtitleLines: ["カード収納。", "今すぐチェック"]
      },
      hashtags: ["財布", "#ミニ財布", "#便利グッズ"]
    }), "utf8");
    await writeFile(rawOutputPath, Buffer.from("raw-video"));
    await writeFile(finalOutputPath, Buffer.from("final-video"));
    await writeFile(
      join(runDir, "make-video-report.json"),
      JSON.stringify({
        type: "haitu_make_video_report",
        productSku: "TK-001",
        provider: "volcengine-seedance",
        durationSeconds: 8,
        status: "completed",
        raw: {
          manifestPath: rawManifestPath,
          outputPath: rawOutputPath,
          taskId: "cgt-test-task"
        },
        final: {
          manifestPath: join(runDir, "final", "final-manifest.json"),
          outputPath: finalOutputPath,
          subtitlePath: join(runDir, "final", "subtitle.ass")
        },
        billing: {
          tokenPriceCnyPerMillion: 37,
          totalTokens: 80770,
          estimatedCostCny: 2.99
        },
        totalCost: {
          amount: 0,
          currency: "CNY"
        },
        reusedRawManifest: true
      }),
      "utf8"
    );
    const server = createConsoleServer({ rootDir: root, outputsDir });

    const reports = await server.fetchJson("/api/reports");

    expect(reports.reports).toEqual([
      expect.objectContaining({
        path: join(runDir, "make-video-report.json"),
        productSku: "TK-001",
        provider: "volcengine-seedance",
        status: "completed",
        durationSeconds: 8,
        rawManifestPath,
        rawOutputPath,
        finalOutputPath,
        billing: {
          tokenPriceCnyPerMillion: 37,
          totalTokens: 80770,
          estimatedCostCny: 2.99
        },
        totalCost: {
          amount: 0,
          currency: "CNY"
        },
        taskId: "cgt-test-task",
        reusedRawManifest: true
      })
    ]);
    expect(reports.reports[0].finalVideoUrl).toBe(
      `/media?path=${encodeURIComponent(finalOutputPath)}`
    );

    const mediaResponse = await server.fetch(reports.reports[0].finalVideoUrl);
    expect(mediaResponse.status).toBe(200);
    expect(mediaResponse.headers.get("content-type")).toBe("video/mp4");
    expect(Buffer.from(await mediaResponse.arrayBuffer()).toString("utf8")).toBe("final-video");
  });

  it("filters reports by provider, status, product, and final video availability", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-report-filter-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    await writeFileReport(join(outputsDir, "mock-run", "make-video-report.json"), {
      type: "haitu_make_video_report",
      productSku: "TK-001",
      provider: "mock",
      status: "completed",
      raw: {
        manifestPath: join(outputsDir, "mock-run", "raw", "manifest.json"),
        outputPath: join(outputsDir, "mock-run", "raw", "video.txt")
      },
      totalCost: {
        amount: 0,
        currency: "USD"
      }
    });
    await writeFileReport(join(outputsDir, "paid-final", "make-video-report.json"), {
      type: "haitu_make_video_report",
      productSku: "WALLET-BLACK-001",
      provider: "volcengine-seedance",
      status: "completed",
      raw: {
        manifestPath: join(outputsDir, "paid-final", "raw", "manifest.json"),
        outputPath: join(outputsDir, "paid-final", "raw", "video.mp4")
      },
      final: {
        manifestPath: join(outputsDir, "paid-final", "final", "manifest.json"),
        outputPath: join(outputsDir, "paid-final", "final", "video.mp4"),
        subtitlePath: join(outputsDir, "paid-final", "final", "video.ass")
      },
      billing: {
        tokenPriceCnyPerMillion: 37,
        totalTokens: 80770,
        estimatedCostCny: 2.99
      },
      totalCost: {
        amount: 0,
        currency: "CNY"
      }
    });
    const server = createConsoleServer({ rootDir: root, outputsDir });

    const response = await server.fetchJson(
      "/api/reports?provider=volcengine-seedance&status=completed&productSku=WALLET-BLACK-001&finalOnly=true"
    );

    expect(response.reports).toHaveLength(1);
    expect(response.reports[0]).toEqual(expect.objectContaining({
      productSku: "WALLET-BLACK-001",
      provider: "volcengine-seedance",
      status: "completed",
      finalVideoUrl: expect.stringContaining("/media?path=")
    }));
  });

  it("rejects media requests outside the project root", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-safe-"));
    tempDirs.push(root);
    const server = createConsoleServer({ rootDir: root });

    const response = await server.fetch(`/media?path=${encodeURIComponent(join(tmpdir(), "outside.mp4"))}`);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Admin access required"
    });
  });

  it("queries official provider usage for one task id without creating a generation", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-usage-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
      jsonResponse({
        id: "cgt-usage",
        model: "doubao-seedance-2-0-fast-260128",
        status: "succeeded",
        usage: {
          completion_tokens: 80770,
          total_tokens: 80770
        },
        resolution: "480p",
        ratio: "9:16",
        duration: 8
      })
    ) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl });
    await saveByokSeedanceConfig(server);

    const response = await server.fetchJson("/api/provider-tasks/cgt-usage");

    expect(vi.mocked(fetchImpl)).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toContain(
      "/api/v3/contents/generations/tasks/cgt-usage"
    );
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.method).toBe("GET");
    expect(response).toEqual({
      task: {
        id: "cgt-usage",
        model: "doubao-seedance-2-0-fast-260128",
        status: "succeeded",
        completionTokens: 80770,
        totalTokens: 80770,
        estimatedCostCny: 2.99,
        resolution: "480p",
        ratio: "9:16",
        durationSeconds: 8
      }
    });
  });

  it("lists official provider usage for customer support without creating generations", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-usage-list-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      liveFxResponse(url) ?? jsonResponse({
        total: 2,
        items: [
          {
            id: "cgt-usage-1",
            model: "doubao-seedance-2-0-fast-260128",
            status: "succeeded",
            usage: {
              completion_tokens: 324900,
              total_tokens: 324900
            },
            created_at: 1780740000,
            updated_at: 1780740300,
            resolution: "480p",
            ratio: "9:16",
            duration: 8,
            service_tier: "default"
          },
          {
            id: "cgt-usage-2",
            model: "doubao-seedance-2-0-fast-260128",
            status: "succeeded",
            usage: {
              completion_tokens: 173280,
              total_tokens: 173280
            },
            created_at: 1780740600,
            updated_at: 1780740900,
            resolution: "480p",
            ratio: "9:16",
            duration: 8,
            service_tier: "default"
          }
        ]
      })
    ) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl });
    await saveByokSeedanceConfig(server);

    const response = await server.fetchJson(
      "/api/provider-tasks?pageSize=10&status=succeeded&model=doubao-seedance-2-0-fast-260128"
    );

    expect(vi.mocked(fetchImpl)).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toContain(
      "/api/v3/contents/generations/tasks?"
    );
    expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toContain("page_size=10");
    expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toContain("filter.status=succeeded");
    expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toContain(
      "filter.model=doubao-seedance-2-0-fast-260128"
    );
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.method).toBe("GET");
    expect(response).toEqual({
      usage: {
        total: 2,
        totalTokens: 498180,
        estimatedCostCny: 18.43,
        tokenPriceCnyPerMillion: 37,
        items: [
          expect.objectContaining({
            id: "cgt-usage-1",
            totalTokens: 324900,
            estimatedCostCny: 12.02,
            durationSeconds: 8,
            resolution: "480p"
          }),
          expect.objectContaining({
            id: "cgt-usage-2",
            totalTokens: 173280,
            estimatedCostCny: 6.41,
            durationSeconds: 8,
            resolution: "480p"
          })
        ]
      }
    });
  });

  it("serves local job ledger totals for dashboard and billing views", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-ledger-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    await writeFileReport(join(outputsDir, "paid-run", "make-video-report.json"), {
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "WALLET-BLACK-001",
      provider: "volcengine-seedance",
      durationSeconds: 8,
      raw: {
        manifestPath: join(outputsDir, "paid-run", "raw", "manifest.json"),
        outputPath: join(outputsDir, "paid-run", "raw", "video.mp4"),
        taskId: "cgt-paid"
      },
      final: {
        manifestPath: join(outputsDir, "paid-run", "final", "manifest.json"),
        outputPath: join(outputsDir, "paid-run", "final", "video.mp4"),
        subtitlePath: join(outputsDir, "paid-run", "final", "video.ass")
      },
      billing: {
        tokenPriceCnyPerMillion: 37,
        totalTokens: 80770,
        estimatedCostCny: 2.99
      },
      totalCost: {
        amount: 0,
        currency: "CNY"
      },
      reusedRawManifest: true,
      recoveredRawOutput: false
    });
    const server = createConsoleServer({ rootDir: root, outputsDir });

    const ledger = await server.fetchJson("/api/job-ledger");

    expect(ledger.summary).toEqual(expect.objectContaining({
      totalJobs: 1,
      paidJobs: 1,
      totalTokens: 80770,
      estimatedCostCny: 2.99,
      finalVideos: 1
    }));
    expect(ledger.jobs[0]).toEqual(expect.objectContaining({
      id: "paid-run",
      productSku: "WALLET-BLACK-001",
      taskId: "cgt-paid",
      estimatedCostCny: 2.99
    }));
  });

  it("deletes a legacy ledger video history entry by removing its output directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-ledger-delete-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    const legacyDir = join(outputsDir, "legacy-run");
    await writeFileReport(join(legacyDir, "make-video-report.json"), {
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "WALLET-BLACK-001",
      provider: "mock",
      durationSeconds: 8,
      raw: {
        manifestPath: join(legacyDir, "raw", "manifest.json"),
        outputPath: join(legacyDir, "raw", "video.txt")
      },
      totalCost: {
        amount: 0,
        currency: "USD"
      },
      reusedRawManifest: false,
      recoveredRawOutput: false
    });
    const server = createConsoleServer({ rootDir: root, outputsDir });

    const deleted = await server.fetchJson("/api/job-ledger/legacy-run", {
      method: "DELETE"
    });
    const ledger = await server.fetchJson("/api/job-ledger");

    expect(deleted).toEqual({
      deleted: true,
      jobId: "legacy-run",
      path: legacyDir
    });
    await expect(stat(legacyDir)).rejects.toThrow();
    expect(ledger.jobs).toEqual([]);
  });

  it("persists selected final version and returns it in the job ledger", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-review-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    await writeFileReport(join(outputsDir, "wallet-final", "make-video-report.json"), {
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "WALLET-BLACK-001",
      provider: "mock",
      durationSeconds: 8,
      raw: {
        manifestPath: join(outputsDir, "wallet-final", "raw", "manifest.json"),
        outputPath: join(outputsDir, "wallet-final", "raw", "video.txt")
      },
      final: {
        manifestPath: join(outputsDir, "wallet-final", "final", "manifest.json"),
        outputPath: join(outputsDir, "wallet-final", "final", "video.mp4"),
        subtitlePath: join(outputsDir, "wallet-final", "final", "video.ass")
      },
      totalCost: {
        amount: 0,
        currency: "USD"
      },
      reusedRawManifest: false,
      recoveredRawOutput: false
    });
    const server = createConsoleServer({ rootDir: root, outputsDir });

    const response = await server.fetchJson("/api/reviews/select-final", {
      method: "POST",
      body: JSON.stringify({
        productSku: "WALLET-BLACK-001",
        jobId: "wallet-final",
        note: "发布 TikTok"
      })
    });
    const ledger = await server.fetchJson("/api/job-ledger");

    expect(response.review.products["WALLET-BLACK-001"]).toEqual({
      selectedFinalJobId: "wallet-final",
      note: "发布 TikTok"
    });
    expect(ledger.products[0]).toEqual(expect.objectContaining({
      productSku: "WALLET-BLACK-001",
      selectedFinalJobId: "wallet-final",
      selectedFinalNote: "发布 TikTok"
    }));
    expect(ledger.products[0].jobs[0]).toEqual(expect.objectContaining({
      id: "wallet-final",
      selectedFinal: true
    }));
  });

  it("persists manual review ratings and returns them in the job ledger", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-manual-review-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    await writeFileReport(join(outputsDir, "wallet-v1", "make-video-report.json"), {
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "WALLET-BLACK-001",
      provider: "mock",
      durationSeconds: 8,
      raw: {
        manifestPath: join(outputsDir, "wallet-v1", "raw", "manifest.json"),
        outputPath: join(outputsDir, "wallet-v1", "raw", "video.txt")
      },
      final: {
        manifestPath: join(outputsDir, "wallet-v1", "final", "manifest.json"),
        outputPath: join(outputsDir, "wallet-v1", "final", "video.mp4"),
        subtitlePath: join(outputsDir, "wallet-v1", "final", "video.ass")
      },
      totalCost: {
        amount: 0,
        currency: "USD"
      },
      reusedRawManifest: false,
      recoveredRawOutput: false
    });
    const server = createConsoleServer({ rootDir: root, outputsDir });

    const response = await server.fetchJson("/api/reviews/rate-version", {
      method: "POST",
      body: JSON.stringify({
        productSku: "WALLET-BLACK-001",
        jobId: "wallet-v1",
        decision: "needs-edit",
        score: 4,
        note: "字幕を少し上に移動"
      })
    });
    const ledger = await server.fetchJson("/api/job-ledger");

    expect(response.review.products["WALLET-BLACK-001"].versionReviews["wallet-v1"]).toEqual(
      expect.objectContaining({
        decision: "needs-edit",
        score: 4,
        note: "字幕を少し上に移動",
        updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
      })
    );
    expect(ledger.products[0].jobs[0]).toEqual(expect.objectContaining({
      id: "wallet-v1",
      manualReview: expect.objectContaining({
        decision: "needs-edit",
        score: 4,
        note: "字幕を少し上に移動"
      })
    }));
  });

  it("summarizes manual review progress toward the internal validation target", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-review-progress-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    for (const jobId of ["wallet-v1", "wallet-v2", "wallet-v3", "wallet-v4"]) {
      await writeFileReport(join(outputsDir, jobId, "make-video-report.json"), {
        type: "haitu_make_video_report",
        status: "completed",
        productSku: "WALLET-BLACK-001",
        provider: "mock",
        durationSeconds: 8,
        raw: {
          manifestPath: join(outputsDir, jobId, "raw", "manifest.json"),
          outputPath: join(outputsDir, jobId, "raw", "video.txt")
        },
        final: {
          manifestPath: join(outputsDir, jobId, "final", "manifest.json"),
          outputPath: join(outputsDir, jobId, "final", "video.mp4"),
          subtitlePath: join(outputsDir, jobId, "final", "video.ass")
        },
        billing: {
          tokenPriceCnyPerMillion: 37,
          totalTokens: 1000,
          estimatedCostCny: 0.04
        },
        totalCost: {
          amount: 0,
          currency: "USD"
        },
        reusedRawManifest: false,
        recoveredRawOutput: false
      });
    }
    const server = createConsoleServer({ rootDir: root, outputsDir });
    await server.fetchJson("/api/reviews/rate-version", {
      method: "POST",
      body: JSON.stringify({
        productSku: "WALLET-BLACK-001",
        jobId: "wallet-v1",
        decision: "publishable",
        score: 5
      })
    });
    await server.fetchJson("/api/reviews/rate-version", {
      method: "POST",
      body: JSON.stringify({
        productSku: "WALLET-BLACK-001",
        jobId: "wallet-v2",
        decision: "needs-edit",
        score: 4
      })
    });
    await server.fetchJson("/api/reviews/rate-version", {
      method: "POST",
      body: JSON.stringify({
        productSku: "WALLET-BLACK-001",
        jobId: "wallet-v3",
        decision: "rejected",
        score: 2
      })
    });

    const ledger = await server.fetchJson("/api/job-ledger");

    expect(ledger.reviewSummary).toEqual({
      totalVersions: 4,
      reviewedVersions: 3,
      unreviewedVersions: 1,
      publishableVersions: 1,
      needsEditVersions: 1,
      rejectedVersions: 1,
      usableVersions: 2,
      usableTarget: 20,
      usableRemaining: 18,
      averageScore: 3.67
    });
    expect(ledger.internalValidationSummary).toEqual({
      targetUsableVideos: 20,
      usableVideos: 2,
      publishableVideos: 1,
      needsEditVideos: 1,
      rejectedVideos: 1,
      totalVideos: 4,
      reviewedVideos: 3,
      usableRate: 0.5,
      totalEstimatedCostCny: 0.16,
      paidEstimatedCostCny: 0,
      costPerUsableVideoCny: 0.08,
      remainingUsableVideos: 18
    });
  });

  it("exposes product readiness for internal validation batches", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-product-readiness-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const outputsDir = testJobsDir(root);
    await writeProduct(testProductPath(fixturesDir, "wallet"), {
      sku: "WALLET-BLACK-001",
      title_ja: "カード収納ミニ財布",
      reference_images: ["main.jpg", "detail.jpg", "use.jpg"]
    });
    await writeProduct(testProductPath(fixturesDir, "box"), {
      sku: "BOX-001",
      title_ja: "折りたたみ収納ボックス",
      reference_images: ["main.jpg"]
    });
    for (const jobId of ["wallet-v1", "wallet-v2", "wallet-v3"]) {
      await writeFileReport(join(outputsDir, jobId, "make-video-report.json"), {
        type: "haitu_make_video_report",
        status: "completed",
        productSku: "WALLET-BLACK-001",
        provider: "mock",
        durationSeconds: 8,
        raw: {
          manifestPath: join(outputsDir, jobId, "raw", "manifest.json"),
          outputPath: join(outputsDir, jobId, "raw", "video.txt")
        },
        final: {
          manifestPath: join(outputsDir, jobId, "final", "manifest.json"),
          outputPath: join(outputsDir, jobId, "final", "video.mp4"),
          subtitlePath: join(outputsDir, jobId, "final", "video.ass")
        },
        totalCost: {
          amount: 0,
          currency: "USD"
        },
        reusedRawManifest: false,
        recoveredRawOutput: false
      });
    }
    const server = createConsoleServer({ rootDir: root, fixturesDir, outputsDir });
    await server.fetchJson("/api/reviews/rate-version", {
      method: "POST",
      body: JSON.stringify({
        productSku: "WALLET-BLACK-001",
        jobId: "wallet-v1",
        decision: "publishable",
        score: 5
      })
    });

    const products = await server.fetchJson("/api/products");
    const ledger = await server.fetchJson("/api/job-ledger");

    expect(products.products).toEqual([
      expect.objectContaining({
        sku: "BOX-001",
        referenceImageCount: 1
      }),
      expect.objectContaining({
        sku: "WALLET-BLACK-001",
        referenceImageCount: 3
      })
    ]);
    expect(ledger.products.find((group: { productSku: string }) => group.productSku === "WALLET-BLACK-001")).toEqual(
      expect.objectContaining({
        jobCount: 3,
        reviewedJobs: 1,
        unreviewedJobs: 2,
        publishableJobs: 1,
        needsEditJobs: 0,
        rejectedJobs: 0,
        usableJobs: 1,
        readyForInternalValidation: true
      })
    );
  });

  it("exports internal validation progress as CSV", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-validation-export-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const outputsDir = testJobsDir(root);
    await writeProduct(testProductPath(fixturesDir, "wallet.csv"), {
      sku: "WALLET-BLACK-001",
      title_ja: "カード収納ミニ財布",
      reference_images: ["main.jpg", "detail.jpg", "use.jpg"]
    });
    await writeProduct(testProductPath(fixturesDir, "box.csv"), {
      sku: "BOX-001",
      title_ja: "折りたたみ収納ボックス",
      reference_images: ["main.jpg"]
    });
    await writeFileReport(join(outputsDir, "wallet-v1", "make-video-report.json"), {
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "WALLET-BLACK-001",
      provider: "mock",
      durationSeconds: 8,
      raw: {
        manifestPath: join(outputsDir, "wallet-v1", "raw", "manifest.json"),
        outputPath: join(outputsDir, "wallet-v1", "raw", "video.txt")
      },
      final: {
        manifestPath: join(outputsDir, "wallet-v1", "final", "manifest.json"),
        outputPath: join(outputsDir, "wallet-v1", "final", "video.mp4"),
        subtitlePath: join(outputsDir, "wallet-v1", "final", "video.ass")
      },
      billing: {
        tokenPriceCnyPerMillion: 37,
        totalTokens: 1000,
        estimatedCostCny: 0.04
      },
      totalCost: {
        amount: 0,
        currency: "USD"
      },
      reusedRawManifest: false,
      recoveredRawOutput: false
    });
    const server = createConsoleServer({ rootDir: root, fixturesDir, outputsDir });
    await server.fetchJson("/api/reviews/rate-version", {
      method: "POST",
      body: JSON.stringify({
        productSku: "WALLET-BLACK-001",
        jobId: "wallet-v1",
        decision: "publishable",
        score: 5,
        note: "发布候选"
      })
    });

    const response = await server.fetch("/api/internal-validation/export.csv");
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="haitu-internal-validation.csv"');
    expect(csv.split("\n")[0]).toBe("商品SKU,商品标题,参考图数量,版本数,任务ID,生成通道,任务状态,时长秒,审核结论,评分,人工备注,Token,估算成本CNY,最终视频,缺口提示");
    expect(csv).toContain("WALLET-BLACK-001,カード収納ミニ財布,3,1,wallet-v1,内部任务,已完成,8,可发布,5,发布候选,1000,0.04,是,补 2 个版本");
    expect(csv).toContain("BOX-001,折りたたみ収納ボックス,1,0,,,,,,,,0,0,否,补 2 张参考图 / 补 3 个版本");
  });

  it("refuses invalid manual review ratings", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-manual-review-invalid-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    await writeFileReport(join(outputsDir, "wallet-v1", "make-video-report.json"), {
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "WALLET-BLACK-001",
      provider: "mock",
      durationSeconds: 8,
      raw: {
        manifestPath: join(outputsDir, "wallet-v1", "raw", "manifest.json"),
        outputPath: join(outputsDir, "wallet-v1", "raw", "video.txt")
      },
      final: {
        manifestPath: join(outputsDir, "wallet-v1", "final", "manifest.json"),
        outputPath: join(outputsDir, "wallet-v1", "final", "video.mp4"),
        subtitlePath: join(outputsDir, "wallet-v1", "final", "video.ass")
      },
      totalCost: {
        amount: 0,
        currency: "USD"
      },
      reusedRawManifest: false,
      recoveredRawOutput: false
    });
    const server = createConsoleServer({ rootDir: root, outputsDir });

    const response = await server.fetch("/api/reviews/rate-version", {
      method: "POST",
      body: JSON.stringify({
        productSku: "WALLET-BLACK-001",
        jobId: "wallet-v1",
        decision: "maybe",
        score: 6
      })
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "Manual review requires productSku, jobId, decision, and score 1-5."
    });
  });

  it("summarizes local QC results for review decisions", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-qc-summary-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    const runDir = join(outputsDir, "wallet-final");
    const rawManifestPath = join(runDir, "raw", "manifest.json");
    await writeFileReport(rawManifestPath, {
      productSku: "WALLET-BLACK-001",
      version: 1,
      output: {
        path: join(runDir, "raw", "video.mp4"),
        width: 1080,
        height: 1920,
        durationSeconds: 8,
        mimeType: "video/mp4"
      },
      qc: {
        result: "fail",
        checks: [
          {
            name: "aspect_ratio_9_16",
            passed: true,
            message: "Output metadata should be 9:16."
          },
          {
            name: "no_forbidden_claims",
            passed: false,
            message: "Script should not include forbidden or unverified claims."
          }
        ]
      }
    });
    await writeFileReport(join(runDir, "make-video-report.json"), {
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "WALLET-BLACK-001",
      provider: "mock",
      durationSeconds: 8,
      raw: {
        manifestPath: rawManifestPath,
        outputPath: join(runDir, "raw", "video.mp4")
      },
      final: {
        manifestPath: join(runDir, "final", "final-manifest.json"),
        outputPath: join(runDir, "final", "wallet.final.mp4"),
        subtitlePath: join(runDir, "final", "wallet.ass")
      },
      totalCost: {
        amount: 0,
        currency: "USD"
      },
      reusedRawManifest: false,
      recoveredRawOutput: false
    });
    await writeFileReport(join(outputsDir, "wallet-missing-qc", "make-video-report.json"), {
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "WALLET-BLACK-001",
      provider: "mock",
      durationSeconds: 8,
      raw: {
        manifestPath: join(outputsDir, "wallet-missing-qc", "raw", "missing-manifest.json"),
        outputPath: join(outputsDir, "wallet-missing-qc", "raw", "video.mp4")
      },
      totalCost: {
        amount: 0,
        currency: "USD"
      },
      reusedRawManifest: false,
      recoveredRawOutput: false
    });
    const server = createConsoleServer({ rootDir: root, outputsDir });

    const response = await server.fetchJson("/api/qc-summary");

    expect(response.summary).toEqual({
      totalJobs: 2,
      passJobs: 0,
      warningJobs: 0,
      failJobs: 1,
      missingJobs: 1
    });
    expect(response.items).toEqual([
      expect.objectContaining({
        jobId: "wallet-final",
        productSku: "WALLET-BLACK-001",
        result: "fail",
        failedChecks: ["no_forbidden_claims"],
        rawManifestPath
      }),
      expect.objectContaining({
        jobId: "wallet-missing-qc",
        productSku: "WALLET-BLACK-001",
        result: "missing",
        failedChecks: ["qc_manifest_missing"]
      })
    ]);
  });

  it("creates a local publish package from the selected final version", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-publish-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    const runDir = join(outputsDir, "wallet-final");
    const rawManifestPath = join(runDir, "raw", "manifest.json");
    const finalManifestPath = join(runDir, "final", "final-manifest.json");
    const finalOutputPath = join(runDir, "final", "wallet.final.mp4");
    const subtitlePath = join(runDir, "final", "wallet.ass");
    await mkdir(join(rawManifestPath, ".."), { recursive: true });
    await mkdir(join(finalOutputPath, ".."), { recursive: true });
    await writeFile(rawManifestPath, JSON.stringify({
      type: "raw",
      product: {
        sku: "WALLET-BLACK-001",
        title_ja: "カード収納ミニ財布",
        category: "財布",
        materials: ["PU"],
        verified_selling_points: ["カード収納", "コンパクト"],
        usage_scenes: ["通勤", "お出かけ"]
      },
      script: {
        voiceover: "カード収納が便利なミニ財布。",
        subtitleLines: ["カード収納。", "今すぐチェック"]
      },
      hashtags: ["財布", "#ミニ財布", "#便利グッズ"]
    }), "utf8");
    await writeFile(finalManifestPath, JSON.stringify({ type: "postprocessed_final" }), "utf8");
    await writeFile(finalOutputPath, Buffer.from("final-video"));
    await writeFile(subtitlePath, "[Script Info]\n", "utf8");
    await writeFileReport(join(runDir, "make-video-report.json"), {
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "WALLET-BLACK-001",
      provider: "volcengine-seedance",
      durationSeconds: 8,
      raw: {
        manifestPath: rawManifestPath,
        outputPath: join(runDir, "raw", "wallet.seedance.mp4"),
        taskId: "cgt-wallet"
      },
      final: {
        manifestPath: finalManifestPath,
        outputPath: finalOutputPath,
        subtitlePath
      },
      billing: {
        tokenPriceCnyPerMillion: 37,
        totalTokens: 80770,
        estimatedCostCny: 2.99
      },
      totalCost: {
        amount: 0,
        currency: "CNY"
      },
      reusedRawManifest: true,
      recoveredRawOutput: false
    });
    const server = createConsoleServer({ rootDir: root, outputsDir });
    await server.fetchJson("/api/reviews/select-final", {
      method: "POST",
      body: JSON.stringify({
        productSku: "WALLET-BLACK-001",
        jobId: "wallet-final",
        note: "发布 TikTok"
      })
    });
    await server.fetchJson("/api/reviews/rate-version", {
      method: "POST",
      body: JSON.stringify({
        productSku: "WALLET-BLACK-001",
        jobId: "wallet-final",
        decision: "publishable",
        score: 5,
        note: "可直接发布"
      })
    });

    const response = await server.fetchJson("/api/publish-packages", {
      method: "POST",
      body: JSON.stringify({
        productSku: "WALLET-BLACK-001"
      })
    });

    const packageDir = join(outputsDir, "publish-packages", "WALLET-BLACK-001", "wallet-final");
    const packageManifestPath = join(packageDir, "publish-package.json");
    expect(response.package).toEqual(expect.objectContaining({
      type: "haitu_publish_package",
      productSku: "WALLET-BLACK-001",
      jobId: "wallet-final",
      provider: "volcengine-seedance",
      taskId: "cgt-wallet",
      durationSeconds: 8,
      totalTokens: 80770,
      estimatedCostCny: 2.99,
      hashtags: ["#財布", "#ミニ財布", "#便利グッズ"],
      selectedFinalNote: "发布 TikTok",
      packageDir,
      manifestPath: packageManifestPath,
      files: {
        videoPath: join(packageDir, "wallet.final.mp4"),
        subtitlePath: join(packageDir, "wallet.ass"),
        finalManifestPath: join(packageDir, "final-manifest.json"),
        sourceReportPath: join(runDir, "make-video-report.json"),
        rawManifestPath
      }
    }));
    await expect(readFile(join(packageDir, "wallet.final.mp4"), "utf8")).resolves.toBe("final-video");
    await expect(readFile(join(packageDir, "wallet.ass"), "utf8")).resolves.toBe("[Script Info]\n");
    await expect(readFile(packageManifestPath, "utf8")).resolves.toContain("\"productSku\": \"WALLET-BLACK-001\"");
  });

  it("creates publish packages in batch for selected final versions and skips existing packages", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-publish-batch-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    for (const [productSku, jobId] of [
      ["WALLET-BLACK-001", "wallet-final"],
      ["BOX-001", "box-final"]
    ]) {
      const runDir = join(outputsDir, jobId);
      const finalManifestPath = join(runDir, "final", "final-manifest.json");
      const finalOutputPath = join(runDir, "final", `${jobId}.mp4`);
      await mkdir(join(finalOutputPath, ".."), { recursive: true });
      await writeFile(finalManifestPath, JSON.stringify({ type: "postprocessed_final" }), "utf8");
      await writeFile(finalOutputPath, Buffer.from(`${jobId}-video`));
      await writeFileReport(join(runDir, "make-video-report.json"), {
        type: "haitu_make_video_report",
        status: "completed",
        productSku,
        provider: "mock",
        durationSeconds: 8,
        raw: {
          manifestPath: join(runDir, "raw", "manifest.json"),
          outputPath: join(runDir, "raw", `${jobId}.txt`)
        },
        final: {
          manifestPath: finalManifestPath,
          outputPath: finalOutputPath
        },
        totalCost: {
          amount: 0,
          currency: "USD"
        },
        reusedRawManifest: false,
        recoveredRawOutput: false
      });
    }
    const existingPackageDir = join(outputsDir, "publish-packages", "WALLET-BLACK-001", "wallet-final");
    await mkdir(existingPackageDir, { recursive: true });
    await writeFileReport(join(existingPackageDir, "publish-package.json"), {
      type: "haitu_publish_package",
      productSku: "WALLET-BLACK-001",
      jobId: "wallet-final",
      createdAt: "2026-06-07T08:00:00.000Z",
      files: {
        videoPath: join(existingPackageDir, "wallet-final.mp4"),
        sourceReportPath: join(outputsDir, "wallet-final", "make-video-report.json")
      }
    });
    const server = createConsoleServer({ rootDir: root, outputsDir });
    await server.fetchJson("/api/reviews/select-final", {
      method: "POST",
      body: JSON.stringify({
        productSku: "WALLET-BLACK-001",
        jobId: "wallet-final",
        note: "already packed"
      })
    });
    await server.fetchJson("/api/reviews/rate-version", {
      method: "POST",
      body: JSON.stringify({
        productSku: "WALLET-BLACK-001",
        jobId: "wallet-final",
        decision: "publishable",
        score: 5
      })
    });
    await server.fetchJson("/api/reviews/select-final", {
      method: "POST",
      body: JSON.stringify({
        productSku: "BOX-001",
        jobId: "box-final",
        note: "batch pack"
      })
    });
    await server.fetchJson("/api/reviews/rate-version", {
      method: "POST",
      body: JSON.stringify({
        productSku: "BOX-001",
        jobId: "box-final",
        decision: "publishable",
        score: 5
      })
    });

    const response = await server.fetchJson("/api/publish-packages/batch", {
      method: "POST",
      body: JSON.stringify({})
    });

    expect(response.packages).toHaveLength(1);
    expect(response.packages[0]).toEqual(expect.objectContaining({
      productSku: "BOX-001",
      jobId: "box-final",
      selectedFinalNote: "batch pack"
    }));
    expect(response.skipped).toEqual([
      {
        productSku: "WALLET-BLACK-001",
        jobId: "wallet-final",
        reason: "发布素材已存在"
      }
    ]);
    await expect(readFile(join(outputsDir, "publish-packages", "BOX-001", "box-final", "box-final.mp4"), "utf8")).resolves.toBe("box-final-video");
  });

  it("skips batch publish packages for final versions that are not manually marked publishable", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-publish-batch-review-gate-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    const runDir = join(outputsDir, "wallet-final");
    const finalOutputPath = join(runDir, "final", "wallet.final.mp4");
    await mkdir(join(finalOutputPath, ".."), { recursive: true });
    await writeFile(finalOutputPath, Buffer.from("final-video"));
    await writeFileReport(join(runDir, "make-video-report.json"), {
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "WALLET-BLACK-001",
      provider: "mock",
      durationSeconds: 8,
      raw: {
        manifestPath: join(runDir, "raw", "manifest.json"),
        outputPath: join(runDir, "raw", "wallet.txt")
      },
      final: {
        manifestPath: join(runDir, "final", "manifest.json"),
        outputPath: finalOutputPath
      },
      totalCost: {
        amount: 0,
        currency: "USD"
      },
      reusedRawManifest: false,
      recoveredRawOutput: false
    });
    const server = createConsoleServer({ rootDir: root, outputsDir });
    await server.fetchJson("/api/reviews/select-final", {
      method: "POST",
      body: JSON.stringify({
        productSku: "WALLET-BLACK-001",
        jobId: "wallet-final"
      })
    });
    await server.fetchJson("/api/reviews/rate-version", {
      method: "POST",
      body: JSON.stringify({
        productSku: "WALLET-BLACK-001",
        jobId: "wallet-final",
        decision: "needs-edit",
        score: 4
      })
    });

    const response = await server.fetchJson("/api/publish-packages/batch", {
      method: "POST",
      body: JSON.stringify({})
    });

    expect(response.packages).toEqual([]);
    expect(response.skipped).toEqual([
      {
        productSku: "WALLET-BLACK-001",
        jobId: "wallet-final",
        reason: "最终版未标记为可发布"
      }
    ]);
  });

  it("lists local publish packages for the console", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-publish-list-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    const packageDir = join(outputsDir, "publish-packages", "WALLET-BLACK-001", "wallet-final");
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, "wallet.final.mp4"), Buffer.from("final-video"));
    await writeFile(join(packageDir, "wallet.ass"), "[Script Info]\n", "utf8");
    await writeFileReport(join(packageDir, "publish-package.json"), {
      type: "haitu_publish_package",
      productSku: "WALLET-BLACK-001",
      jobId: "wallet-final",
      provider: "volcengine-seedance",
      taskId: "cgt-wallet",
      durationSeconds: 8,
      totalTokens: 80770,
      estimatedCostCny: 2.99,
      hashtags: ["#財布", "#ミニ財布"],
      packageDir,
      manifestPath: "old-manifest-path.json",
      createdAt: "2026-06-07T08:00:00.000Z",
      files: {
        videoPath: join(packageDir, "wallet.final.mp4"),
        subtitlePath: join(packageDir, "wallet.ass"),
        sourceReportPath: join(outputsDir, "wallet-final", "make-video-report.json")
      }
    });
    const server = createConsoleServer({ rootDir: root, outputsDir });

    const response = await server.fetchJson("/api/publish-packages");

    expect(response.summary).toEqual({
      totalPackages: 1,
      totalProducts: 1,
      totalTokens: 80770,
      estimatedCostCny: 2.99,
      latestCreatedAt: "2026-06-07T08:00:00.000Z"
    });
    expect(response.packages).toEqual([
      expect.objectContaining({
        productSku: "WALLET-BLACK-001",
        jobId: "wallet-final",
        provider: "volcengine-seedance",
        taskId: "cgt-wallet",
        hashtags: ["#財布", "#ミニ財布"],
        manifestPath: join(packageDir, "publish-package.json"),
        fileUrls: {
          videoUrl: `/media?path=${encodeURIComponent(join(packageDir, "wallet.final.mp4"))}`,
          subtitleUrl: `/media?path=${encodeURIComponent(join(packageDir, "wallet.ass"))}`,
          manifestUrl: `/media?path=${encodeURIComponent(join(packageDir, "publish-package.json"))}`,
          finalManifestUrl: undefined
        },
        fileStatus: {
          video: "ready",
          subtitle: "ready"
        }
      })
    ]);

    const videoResponse = await server.fetch(response.packages[0].fileUrls.videoUrl);
    expect(videoResponse.status).toBe(200);
    expect(await videoResponse.text()).toBe("final-video");
  });

  it("marks publish package files that no longer exist on disk", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-publish-missing-files-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    const packageDir = join(outputsDir, "publish-packages", "WALLET-BLACK-001", "wallet-final");
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, "wallet.ass"), "[Script Info]\n", "utf8");
    await writeFileReport(join(packageDir, "publish-package.json"), {
      type: "haitu_publish_package",
      productSku: "WALLET-BLACK-001",
      jobId: "wallet-final",
      provider: "mock",
      durationSeconds: 8,
      totalTokens: 0,
      estimatedCostCny: 0,
      packageDir,
      manifestPath: "old-manifest-path.json",
      createdAt: "2026-06-07T08:00:00.000Z",
      files: {
        videoPath: join(packageDir, "wallet.final.mp4"),
        subtitlePath: join(packageDir, "wallet.ass"),
        sourceReportPath: join(outputsDir, "wallet-final", "make-video-report.json")
      }
    });
    const server = createConsoleServer({ rootDir: root, outputsDir });

    const response = await server.fetchJson("/api/publish-packages");

    expect(response.packages[0]).toEqual(expect.objectContaining({
      fileStatus: {
        video: "missing",
        subtitle: "ready"
      }
    }));
  });

  it("exports publish packages as a customer-service CSV with media URLs", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-publish-csv-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    const packageDir = join(outputsDir, "publish-packages", "WALLET-BLACK-001", "wallet-final");
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, "wallet.final.mp4"), Buffer.from("final-video"));
    await writeFile(join(packageDir, "wallet.ass"), "[Script Info]\n", "utf8");
    await writeFile(join(packageDir, "final-manifest.json"), JSON.stringify({ type: "postprocessed_final" }), "utf8");
    await writeFileReport(join(packageDir, "publish-package.json"), {
      type: "haitu_publish_package",
      productSku: "WALLET-BLACK-001",
      jobId: "wallet-final",
      provider: "volcengine-seedance",
      taskId: "cgt-wallet",
      durationSeconds: 8,
      totalTokens: 80770,
      estimatedCostCny: 2.99,
      hashtags: ["#財布", "#ミニ財布", "#便利グッズ"],
      selectedFinalNote: "发布 TikTok, 店铺客服可下载",
      packageDir,
      manifestPath: "old-manifest-path.json",
      createdAt: "2026-06-07T08:00:00.000Z",
      files: {
        videoPath: join(packageDir, "wallet.final.mp4"),
        subtitlePath: join(packageDir, "wallet.ass"),
        finalManifestPath: join(packageDir, "final-manifest.json"),
        sourceReportPath: join(outputsDir, "wallet-final", "make-video-report.json")
      }
    });
    const server = createConsoleServer({ rootDir: root, outputsDir });

    const response = await server.fetch("/api/publish-packages/export.csv");
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="haitu-publish-packages.csv"');
    expect(csv.split("\n")[0]).toBe(
      "商品SKU,任务ID,生成通道,Task ID,时长秒,Token,估算成本CNY,视频地址,字幕地址,成品Manifest,发布清单,日文标签,人工备注,创建时间"
    );
    expect(csv).toContain("WALLET-BLACK-001,wallet-final,火山引擎 Seedance,cgt-wallet,8,80770,2.99");
    expect(csv).toContain(`/media?path=${encodeURIComponent(join(packageDir, "wallet.final.mp4"))}`);
    expect(csv).toContain(`/media?path=${encodeURIComponent(join(packageDir, "wallet.ass"))}`);
    expect(csv).toContain(`/media?path=${encodeURIComponent(join(packageDir, "final-manifest.json"))}`);
    expect(csv).toContain(`/media?path=${encodeURIComponent(join(packageDir, "publish-package.json"))}`);
    expect(csv).toContain("#財布 #ミニ財布 #便利グッズ");
    expect(csv).toContain('"发布 TikTok, 店铺客服可下载"');
  });

  it("lists locally stored video assets for long-term storage support", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-video-assets-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    const runDir = join(outputsDir, "wallet-final");
    const rawVideoPath = join(runDir, "raw", "wallet.seedance.mp4");
    const finalVideoPath = join(runDir, "final", "wallet.final.mp4");
    const packageDir = join(outputsDir, "publish-packages", "WALLET-BLACK-001", "wallet-final");
    const packageVideoPath = join(packageDir, "wallet.final.mp4");
    await mkdir(join(rawVideoPath, ".."), { recursive: true });
    await mkdir(join(finalVideoPath, ".."), { recursive: true });
    await mkdir(packageDir, { recursive: true });
    await writeFile(rawVideoPath, Buffer.from("raw-video-bytes"));
    await writeFile(finalVideoPath, Buffer.from("final-video-bytes"));
    await writeFile(packageVideoPath, Buffer.from("publish-video"));
    await writeFileReport(join(runDir, "make-video-report.json"), {
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "WALLET-BLACK-001",
      provider: "volcengine-seedance",
      durationSeconds: 8,
      raw: {
        manifestPath: join(runDir, "raw", "manifest.json"),
        outputPath: rawVideoPath,
        taskId: "cgt-wallet"
      },
      final: {
        manifestPath: join(runDir, "final", "manifest.json"),
        outputPath: finalVideoPath,
        subtitlePath: join(runDir, "final", "wallet.ass")
      },
      billing: {
        tokenPriceCnyPerMillion: 37,
        totalTokens: 80770,
        estimatedCostCny: 2.99
      },
      totalCost: {
        amount: 0,
        currency: "CNY"
      }
    });
    await writeFileReport(join(packageDir, "publish-package.json"), {
      type: "haitu_publish_package",
      productSku: "WALLET-BLACK-001",
      jobId: "wallet-final",
      provider: "volcengine-seedance",
      taskId: "cgt-wallet",
      durationSeconds: 8,
      totalTokens: 80770,
      estimatedCostCny: 2.99,
      packageDir,
      manifestPath: join(packageDir, "publish-package.json"),
      createdAt: "2026-06-07T08:00:00.000Z",
      files: {
        videoPath: packageVideoPath,
        sourceReportPath: join(runDir, "make-video-report.json")
      }
    });
    const server = createConsoleServer({ rootDir: root, outputsDir });

    const response = await server.fetchJson("/api/video-assets");

    expect(response.summary).toEqual({
      totalAssets: 3,
      totalBytes: Buffer.byteLength("raw-video-bytes") + Buffer.byteLength("final-video-bytes") + Buffer.byteLength("publish-video"),
      rawAssets: 1,
      finalAssets: 1,
      publishAssets: 1,
      missingAssets: 0
    });
    expect(response.assets).toEqual([
      expect.objectContaining({
        kind: "final",
        productSku: "WALLET-BLACK-001",
        jobId: "wallet-final",
        provider: "volcengine-seedance",
        path: finalVideoPath,
        exists: true,
        sizeBytes: Buffer.byteLength("final-video-bytes"),
        url: `/media?path=${encodeURIComponent(finalVideoPath)}`
      }),
      expect.objectContaining({
        kind: "raw",
        path: rawVideoPath,
        exists: true,
        sizeBytes: Buffer.byteLength("raw-video-bytes")
      }),
      expect.objectContaining({
        kind: "publish",
        path: packageVideoPath,
        exists: true,
        sizeBytes: Buffer.byteLength("publish-video")
      })
    ]);
    const videoResponse = await server.fetch(response.assets[0].url);
    expect(videoResponse.status).toBe(200);
    expect(await videoResponse.text()).toBe("final-video-bytes");
  });

  it("summarizes local storage scopes that must be backed up for long-term video retention", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-storage-backup-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    const fixturesDir = testProductsDir(root);
    await mkdir(join(outputsDir, "wallet-final", "final"), { recursive: true });
    await mkdir(join(fixturesDir), { recursive: true });
    await writeFile(join(outputsDir, "wallet-final", "make-video-report.json"), JSON.stringify({ productSku: "WALLET-BLACK-001" }), "utf8");
    await writeFile(join(outputsDir, "wallet-final", "final", "manifest.json"), JSON.stringify({ ok: true }), "utf8");
    await writeFile(join(outputsDir, "wallet-final", "final", "wallet.final.mp4"), Buffer.from("final-video"));
    await writeFile(join(outputsDir, "review-state.json"), JSON.stringify({ selectedFinal: {} }), "utf8");
    const walletProductPath = testProductPath(fixturesDir, "wallet");
    await writeProduct(walletProductPath, {
      sku: "WALLET-BLACK-001",
      reference_images: ["refs/reference-01.jpg"]
    });
    await mkdir(join(walletProductPath, "..", "refs"), { recursive: true });
    await writeFile(join(walletProductPath, "..", "refs", "reference-01.jpg"), Buffer.from("image-bytes"));
    vi.stubEnv("HAITU_ADMIN_EMAIL", "console-test@example.com");
    const server = createConsoleServer({ rootDir: root, outputsDir, fixturesDir });

    const response = await server.fetchJson("/api/storage-backup");

    expect(response.summary.totalBytes).toBeGreaterThan(0);
    expect(response.summary.totalFiles).toBe(6);
    expect(response.summary.videoFiles).toBe(0);
    expect(response.summary.manifestFiles).toBe(0);
    expect(response.summary.productFiles).toBe(1);
    expect(response.summary.referenceImages).toBe(1);
    expect(response.scopes).toEqual([
      expect.objectContaining({
        id: "products",
        label: "商品资料与参考图",
        path: fixturesDir,
        mustBackup: true,
        productFiles: 1,
        referenceImages: 1
      }),
      expect.objectContaining({
        id: "settings",
        label: "默认工作区设置",
        path: testSettingsDir(root),
        mustBackup: true
      }),
      expect.objectContaining({
        id: "system",
        label: "系统设置、会话和审计日志",
        path: testSystemDir(root),
        mustBackup: true
      }),
      expect.objectContaining({
        id: "job-metadata",
        label: "任务元数据",
        path: outputsDir,
        mustBackup: true,
        videoFiles: 0,
        manifestFiles: 0,
        jsonFiles: 2
      })
    ]);
    expect(response.backupCommands).toHaveLength(1);
    expect(response.backupCommands[0]).toContain(testDataDir(root));
    expect(response.backupCommands[0]).toContain("--exclude='workspaces/*/jobs/*/raw'");
    expect(response.backupCommands[0]).toContain("--exclude='workspaces/*/jobs/*/final'");
    expect(response.notes).toContain("备份只处理 HAITU_DATA_DIR，不包含代码目录。");
  });

  it("creates a downloadable local backup archive without nesting previous backups", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-backup-archive-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    const fixturesDir = testProductsDir(root);
    await mkdir(join(outputsDir, "wallet-final", "final"), { recursive: true });
    await mkdir(join(testDataDir(root), "backups"), { recursive: true });
    await mkdir(fixturesDir, { recursive: true });
    await writeFile(join(outputsDir, "wallet-final", "make-video-report.json"), JSON.stringify({ productSku: "WALLET-BLACK-001" }), "utf8");
    await writeFile(join(outputsDir, "wallet-final", "final", "wallet.final.mp4"), Buffer.from("final-video"));
    await writeFile(join(testDataDir(root), "backups", "old-backup.tar.gz"), Buffer.from("old-backup"));
    const walletProductPath = testProductPath(fixturesDir, "wallet");
    await writeProduct(walletProductPath, {
      sku: "WALLET-BLACK-001",
      reference_images: ["refs/reference-01.jpg"]
    });
    await mkdir(join(walletProductPath, "..", "refs"), { recursive: true });
    await writeFile(join(walletProductPath, "..", "refs", "reference-01.jpg"), Buffer.from("image-bytes"));
    vi.stubEnv("HAITU_ADMIN_EMAIL", "console-test@example.com");
    const server = createConsoleServer({ rootDir: root, outputsDir, fixturesDir });

    const created = await server.fetchJson("/api/backups", {
      method: "POST"
    });
    const listed = await server.fetchJson("/api/backups");
    const archiveResponse = await server.fetch(created.backup.url);
    const archiveList = spawnSync("tar", ["-tzf", created.backup.path], {
      encoding: "utf8"
    });
    const audit = await server.fetchJson("/api/audit-log");

    expect(created.backup).toEqual(expect.objectContaining({
      fileName: expect.stringMatching(/^haitu-backup-\d{8}-\d{6}\.tar\.gz$/),
      path: expect.stringContaining(join("data", "backups")),
      sizeBytes: expect.any(Number),
      url: `/media?path=${encodeURIComponent(created.backup.path)}`
    }));
    await expect(stat(created.backup.path)).resolves.toEqual(expect.objectContaining({
      size: created.backup.sizeBytes
    }));
    expect(listed.backups[0]).toEqual(expect.objectContaining({
      path: created.backup.path,
      sizeBytes: created.backup.sizeBytes,
      url: created.backup.url
    }));
    expect(archiveResponse.status).toBe(200);
    expect(archiveResponse.headers.get("content-type")).toBe("application/gzip");
    expect(archiveList.status).toBe(0);
    expect(archiveList.stdout).toContain("workspaces/default/jobs/wallet-final/make-video-report.json");
    expect(archiveList.stdout).not.toContain("workspaces/default/jobs/wallet-final/final/wallet.final.mp4");
    expect(archiveList.stdout).toContain("workspaces/default/products/wallet/product.json");
    expect(archiveList.stdout).toContain("workspaces/default/products/wallet/refs/reference-01.jpg");
    expect(archiveList.stdout).not.toContain("backups/old-backup.tar.gz");
    expect(audit.events[0]).toEqual(expect.objectContaining({
      action: "backup.created",
      target: created.backup.path
    }));
  });

  it("backs up HAITU_DATA_DIR long-lived data and job metadata without video files", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-data-backup-"));
    const dataDir = join(root, "data");
    tempDirs.push(root);
    const productDir = join(dataDir, "workspaces", "default", "products", "TK-001");
    const settingsDir = join(dataDir, "workspaces", "default", "settings");
    const systemDir = join(dataDir, "system");
    const jobDir = join(dataDir, "workspaces", "default", "jobs", "job-1");
    await mkdir(join(productDir, "refs"), { recursive: true });
    await mkdir(settingsDir, { recursive: true });
    await mkdir(systemDir, { recursive: true });
    await mkdir(join(jobDir, "raw"), { recursive: true });
    await mkdir(join(jobDir, "final"), { recursive: true });
    await mkdir(join(dataDir, "backups"), { recursive: true });
    await writeFile(join(productDir, "product.json"), JSON.stringify({ sku: "TK-001", workspaceId: "default" }), "utf8");
    await writeFile(join(productDir, "refs", "reference-01.jpg"), Buffer.from("image"));
    await writeFile(join(settingsDir, "workspace-settings.json"), JSON.stringify({ locale: "ja-JP" }), "utf8");
    const handle = openDatabase({ dataDir, env: process.env });
    try {
      runMigrations(handle);
      await new SqliteConsoleSettingsStore({ handle }).write({ defaultCta: "check" });
    } finally {
      closeDatabase(handle);
    }
    await writeFile(join(jobDir, "job.json"), JSON.stringify({ id: "job-1", workspaceId: "default" }), "utf8");
    await writeFile(join(jobDir, "make-video-report.json"), JSON.stringify({ productSku: "TK-001" }), "utf8");
    await writeFile(join(jobDir, "raw", "source.mp4"), Buffer.from("raw-video"));
    await writeFile(join(jobDir, "final", "final.mp4"), Buffer.from("final-video"));
    await writeFile(join(dataDir, "backups", "old-backup.tar.gz"), Buffer.from("old"));
    vi.stubEnv("HAITU_ADMIN_EMAIL", "console-test@example.com");
    const server = createConsoleServer({ rootDir: root, dataDir, autoStartSavedJobs: false });

    const report = await server.fetchJson("/api/storage-backup");
    const created = await server.fetchJson("/api/backups", { method: "POST" });
    const archiveList = spawnSync("tar", ["-tzf", created.backup.path], { encoding: "utf8" });

    expect(report.backupCommands[0]).toContain("-C");
    expect(report.backupCommands[0]).toContain(dataDir);
    expect(report.backupCommands[0]).toContain("--exclude='backups'");
    expect(report.backupCommands[0]).toContain("--exclude='workspaces/*/jobs/*/raw'");
    expect(report.backupCommands[0]).toContain("--exclude='workspaces/*/jobs/*/final'");
    expect(created.backup.path).toContain(join(dataDir, "backups"));
    expect(archiveList.status).toBe(0);
    expect(archiveList.stdout).toContain("workspaces/default/products/TK-001/product.json");
    expect(archiveList.stdout).toContain("workspaces/default/products/TK-001/refs/reference-01.jpg");
    expect(archiveList.stdout).toContain("workspaces/default/settings/workspace-settings.json");
    expect(archiveList.stdout).toContain("haitu.sqlite");
    expect(archiveList.stdout).toContain("workspaces/default/jobs/job-1/job.json");
    expect(archiveList.stdout).toContain("workspaces/default/jobs/job-1/make-video-report.json");
    expect(archiveList.stdout).not.toContain("workspaces/default/jobs/job-1/raw/source.mp4");
    expect(archiveList.stdout).not.toContain("workspaces/default/jobs/job-1/final/final.mp4");
    expect(archiveList.stdout).not.toContain("backups/old-backup.tar.gz");
  });

  it("requires explicit confirmation before deleting a local video asset", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-video-asset-confirm-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    const finalVideoPath = join(outputsDir, "wallet-final", "final", "wallet.final.mp4");
    await mkdir(join(finalVideoPath, ".."), { recursive: true });
    await writeFile(finalVideoPath, Buffer.from("final-video"));
    const server = createConsoleServer({ rootDir: root, outputsDir });

    const response = await server.fetch("/api/video-assets", {
      method: "DELETE",
      body: JSON.stringify({
        path: finalVideoPath
      })
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "Deleting a video asset requires confirm: true."
    });
    await expect(readFile(finalVideoPath, "utf8")).resolves.toBe("final-video");
  });

  it("deletes only the confirmed video file while keeping job metadata and billing history", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-video-asset-delete-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    const runDir = join(outputsDir, "wallet-final");
    const finalVideoPath = join(runDir, "final", "wallet.final.mp4");
    const reportPath = join(runDir, "make-video-report.json");
    await mkdir(join(finalVideoPath, ".."), { recursive: true });
    await writeFile(finalVideoPath, Buffer.from("final-video"));
    await writeFileReport(reportPath, {
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "WALLET-BLACK-001",
      provider: "volcengine-seedance",
      durationSeconds: 8,
      raw: {
        manifestPath: join(runDir, "raw", "manifest.json"),
        outputPath: join(runDir, "raw", "wallet.seedance.mp4"),
        taskId: "cgt-wallet"
      },
      final: {
        manifestPath: join(runDir, "final", "manifest.json"),
        outputPath: finalVideoPath,
        subtitlePath: join(runDir, "final", "wallet.ass")
      },
      billing: {
        tokenPriceCnyPerMillion: 37,
        totalTokens: 80770,
        estimatedCostCny: 2.99
      },
      totalCost: {
        amount: 0,
        currency: "CNY"
      }
    });
    const server = createConsoleServer({ rootDir: root, outputsDir });

    const deleted = await server.fetchJson("/api/video-assets", {
      method: "DELETE",
      body: JSON.stringify({
        path: finalVideoPath,
        confirm: true
      })
    });
    const assets = await server.fetchJson("/api/video-assets");
    const ledger = await server.fetchJson("/api/job-ledger");

    expect(deleted).toEqual({
      deleted: true,
      path: finalVideoPath,
      sizeBytes: Buffer.byteLength("final-video")
    });
    await expect(readFile(finalVideoPath, "utf8")).rejects.toThrow(/ENOENT/);
    await expect(readFile(reportPath, "utf8")).resolves.toContain("\"estimatedCostCny\": 2.99");
    expect(assets.summary).toEqual(expect.objectContaining({
      totalAssets: 2,
      totalBytes: 0,
      finalAssets: 1,
      missingAssets: 2
    }));
    const deletedAsset = assets.assets.find((asset: { path: string }) => asset.path === finalVideoPath);
    expect(deletedAsset).toEqual(expect.objectContaining({
      exists: false,
      sizeBytes: 0
    }));
    expect(deletedAsset).not.toHaveProperty("url");
    expect(ledger.summary).toEqual(expect.objectContaining({
      totalJobs: 1,
      estimatedCostCny: 2.99,
      finalVideos: 1
    }));
  });

  it("refuses to select a final version that has no final video", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-review-invalid-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    await writeFileReport(join(outputsDir, "wallet-raw", "make-video-report.json"), {
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "WALLET-BLACK-001",
      provider: "mock",
      durationSeconds: 8,
      raw: {
        manifestPath: join(outputsDir, "wallet-raw", "raw", "manifest.json"),
        outputPath: join(outputsDir, "wallet-raw", "raw", "video.txt")
      },
      totalCost: {
        amount: 0,
        currency: "USD"
      },
      reusedRawManifest: false,
      recoveredRawOutput: false
    });
    const server = createConsoleServer({ rootDir: root, outputsDir });

    const response = await server.fetch("/api/reviews/select-final", {
      method: "POST",
      body: JSON.stringify({
        productSku: "WALLET-BLACK-001",
        jobId: "wallet-raw"
      })
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "Selected final job must belong to the product and include a final video."
    });
  });

  it("cancels queued provider tasks only after checking their status", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-cancel-"));
    tempDirs.push(root);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: "cgt-queued",
          status: "queued"
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 })) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl });
    await saveByokSeedanceConfig(server);

    const response = await server.fetchJson("/api/provider-tasks/cgt-queued/cancel", {
      method: "POST"
    });

    expect(response).toEqual({
      cancelled: true,
      taskId: "cgt-queued"
    });
    expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.method).toBe("GET");
    expect(vi.mocked(fetchImpl).mock.calls[1]?.[1]?.method).toBe("DELETE");
  });

  it("refuses to cancel provider tasks that are not queued", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-cancel-running-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      liveFxResponse(url) ?? jsonResponse({
        id: "cgt-running",
        status: "running"
      })
    ) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl });
    await saveByokSeedanceConfig(server);

    const response = await server.fetch("/api/provider-tasks/cgt-running/cancel", {
      method: "POST"
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Can cancel only queued tasks. Task cgt-running is running."
    });
    expect(vi.mocked(fetchImpl)).toHaveBeenCalledTimes(1);
  });

  it("runs a mock make-video request through the API", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-run-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const outputsDir = testJobsDir(root);
    const productPath = testProductPath(fixturesDir, "box");
    await writeProduct(productPath);
    const server = createConsoleServer({ rootDir: root, fixturesDir, outputsDir });

    const response = await server.fetchJson("/api/make-video", {
      method: "POST",
      body: JSON.stringify({
        productPath,
        outDirName: "box-mock",
        provider: "mock",
        duration: 8,
        template: "scene",
        cta: "今すぐチェック"
      })
    });

    expect(response.report.provider).toBe("mock");
    expect(response.report.totalCost.amount).toBe(0);
    await expect(readFile(join(outputsDir, "box-mock", "make-video-report.json"), "utf8")).resolves.toContain(
      "\"productSku\": \"TK-001\""
    );
  });

  it("provides temporary public asset URLs to direct paid make-video requests", async () => {
    const previousSeedanceKey = process.env.SEEDANCE_API_KEY;
    const previousArkKey = process.env.ARK_API_KEY;
    const previousBaseUrl = process.env.BETTER_AUTH_URL;
    delete process.env.SEEDANCE_API_KEY;
    delete process.env.ARK_API_KEY;
    process.env.BETTER_AUTH_URL = "https://haitu.online";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-console-direct-public-assets-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const outputsDir = testJobsDir(root);
      const productPath = testProductPath(fixturesDir, "box");
      await writeProduct(productPath);
      await writeFile(productAssetPath(productPath, "main.jpg"), Buffer.from("main-image"));
      await writeFile(productAssetPath(productPath, "detail1.jpg"), Buffer.from("detail-image"));
      let resolvedUrl = "";
      const server = createConsoleServer({
        rootDir: root,
        fixturesDir,
        outputsDir,
        runMakeVideoPipeline: async (input) => {
          resolvedUrl = await input.referenceImageUrlResolver?.(productAssetPath(productPath, "main.jpg")) ?? "";
          return {
            type: "haitu_make_video_report",
            status: "completed",
            productSku: "TK-001",
            provider: input.providerName,
            durationSeconds: input.durationSeconds,
            paidRequestConfirmed: input.confirmPaid,
            raw: {
              manifestPath: join(input.outDir, "raw", "manifest.json"),
              outputPath: join(input.outDir, "raw", "video.mp4")
            },
            totalCost: {
              amount: 8,
              currency: "CNY"
            },
            reusedRawManifest: false,
            recoveredRawOutput: false,
            reportPath: join(input.outDir, "make-video-report.json")
          };
        }
      });
      await server.fetchJson("/api/model-configs/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "paid-key",
          baseUrl: "https://ark.example.test",
          model: "doubao-seedance-2-0-fast-260128"
        })
      });
      const walletHandle = openDatabase({ dataDir: server.dataDir, env: process.env });
      try {
        new WalletStore({ handle: walletHandle, workspaceId: server.workspaceId }).topUp({ amountCny: 10 });
      } finally {
        closeDatabase(walletHandle);
      }

      const response = await server.fetchJson("/api/make-video", {
        method: "POST",
        body: JSON.stringify({
          productPath,
          outDirName: "paid-direct",
          provider: "volcengine-seedance",
          providerModel: "doubao-seedance-2-0-fast-260128",
          duration: 8,
          template: "scene",
          confirmPaid: true
        })
      });
      const publicAssetResponse = await server.raw.fetch(new URL(resolvedUrl).pathname);

      expect(response.report.provider).toBe("volcengine-seedance");
      expect(resolvedUrl).toMatch(/^https:\/\/haitu\.online\/api\/public-assets\/[A-Za-z0-9_-]+$/);
      expect(publicAssetResponse.status).toBe(200);
      await expect(publicAssetResponse.text()).resolves.toBe("main-image");
    } finally {
      restoreEnv("SEEDANCE_API_KEY", previousSeedanceKey);
      restoreEnv("ARK_API_KEY", previousArkKey);
      restoreEnv("BETTER_AUTH_URL", previousBaseUrl);
    }
  });

  it("rejects direct paid make-video requests before running the pipeline when the video model API key is missing", async () => {
    const previousSeedanceKey = process.env.SEEDANCE_API_KEY;
    const previousArkKey = process.env.ARK_API_KEY;
    delete process.env.SEEDANCE_API_KEY;
    delete process.env.ARK_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-console-direct-missing-video-model-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const outputsDir = testJobsDir(root);
      const productPath = testProductPath(fixturesDir, "box");
      await writeProduct(productPath);
      const calls: string[] = [];
      const server = createConsoleServer({
        rootDir: root,
        fixturesDir,
        outputsDir,
        runMakeVideoPipeline: async (input) => {
          calls.push(input.outDir);
          throw new Error("Pipeline should not run when the video model is missing.");
        }
      });

      const response = await server.fetch("/api/make-video", {
        method: "POST",
        body: JSON.stringify({
          productPath,
          outDirName: "missing-video-model-direct",
          provider: "volcengine-seedance",
          duration: 8,
          template: "scene",
          cta: "今すぐチェック",
          confirmPaid: true
        })
      });

      expect(response.status).toBe(402);
      await expect(response.json()).resolves.toEqual({
        error: "请先配置视频模型，再生成视频。"
      });
      expect(calls).toEqual([]);
    } finally {
      restoreEnv("SEEDANCE_API_KEY", previousSeedanceKey);
      restoreEnv("ARK_API_KEY", previousArkKey);
    }
  });

  it("queues a mock video job and exposes async job status", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-video-job-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const outputsDir = testJobsDir(root);
    const productPath = testProductPath(fixturesDir, "box");
    await writeProduct(productPath);
    const server = createConsoleServer({ rootDir: root, fixturesDir, outputsDir });

    const queued = await server.fetchJson("/api/video-jobs", {
      method: "POST",
      body: JSON.stringify({
        productPath,
        provider: "mock",
        duration: 8,
        resolution: "1080p",
        aspectRatio: "16:9",
        template: "scene",
        cta: "今すぐチェック"
      })
    });

    expect(queued.job).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^job-/),
      status: "queued",
      provider: "mock",
      durationSeconds: 8,
      resolution: "1080p",
      aspectRatio: "16:9",
      confirmPaid: false
    }));

    let latest;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      latest = await server.fetchJson(`/api/video-jobs/${queued.job.id}`);
      if (latest.job.status === "completed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    expect(latest.job).toEqual(expect.objectContaining({
      id: queued.job.id,
      status: "completed",
      productSku: "TK-001",
      aspectRatio: "16:9",
      resolution: "1080p",
      reportPath: join(outputsDir, queued.job.id, "make-video-report.json")
    }));
    await expect(readFile(jobFilePath(outputsDir, queued.job.id), "utf8")).resolves.toContain(
      "\"status\": \"completed\""
    );
    await expect(readFile(jobFilePath(outputsDir, queued.job.id), "utf8")).resolves.toContain(
      "\"resolution\": \"1080p\""
    );
    await expect(readFile(jobFilePath(outputsDir, queued.job.id), "utf8")).resolves.toContain(
      "\"aspectRatio\": \"16:9\""
    );
  });

  it("passes the most recently saved enabled video model config into queued video generation by default", async () => {
    const previousSeedanceKey = process.env.SEEDANCE_API_KEY;
    const previousArkKey = process.env.ARK_API_KEY;
    delete process.env.SEEDANCE_API_KEY;
    delete process.env.ARK_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-console-video-config-job-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const outputsDir = testJobsDir(root);
      const productPath = testProductPath(fixturesDir, "box");
      await writeProduct(productPath);
      await writeFile(productAssetPath(productPath, "main.jpg"), Buffer.from("main-image"));
      await writeFile(productAssetPath(productPath, "detail1.jpg"), Buffer.from("detail-image"));
      const capturedInputs: unknown[] = [];
      const server = createConsoleServer({
        rootDir: root,
        fixturesDir,
        outputsDir,
        runMakeVideoPipeline: async (input) => {
          capturedInputs.push(input);
          return {
            type: "haitu_make_video_report",
            status: "completed",
            productSku: "TK-001",
            provider: input.providerName,
            durationSeconds: input.durationSeconds,
            paidRequestConfirmed: input.confirmPaid,
            raw: {
              manifestPath: join(input.outDir, "raw", "manifest.json"),
              outputPath: join(input.outDir, "raw", "video.mp4")
            },
            totalCost: {
              amount: 0,
              currency: "CNY"
            },
            reusedRawManifest: false,
            recoveredRawOutput: false,
            reportPath: join(input.outDir, "make-video-report.json")
          };
        }
      });
      await server.fetchJson("/api/model-configs/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "older-video-secret-0001",
          name: "旧视频服务",
          vendor: "volcengine",
          priority: 100,
          baseUrl: "https://low-video.example.test",
          model: "seedance-2.0-fast"
        })
      });
      await sleep(5);
      await server.fetchJson("/api/model-configs/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "newer-video-secret-9999",
          name: "新视频服务",
          vendor: "volcengine",
          priority: 1,
          baseUrl: "https://high-video.example.test/",
          model: "seedance-2.0"
        })
      });
      await topUpWalletForPaidVideo(server);

      const queued = await server.fetchJson("/api/video-jobs", {
        method: "POST",
        body: JSON.stringify({
          productPath,
          provider: "volcengine-seedance",
          duration: 8,
          template: "scene",
          cta: "今すぐチェック",
          finalLanguage: "ja",
          confirmPaid: true
        })
      });
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const latest = await server.fetchJson(`/api/video-jobs/${queued.job.id}`);
        if (latest.job.status === "completed") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      expect(capturedInputs).toHaveLength(1);
      expect(capturedInputs[0]).toEqual(expect.objectContaining({
        apiKey: "newer-video-secret-9999",
        providerBaseUrl: "https://high-video.example.test",
        providerModel: "doubao-seedance-2-0-260128",
        finalLanguage: "ja"
      }));
    } finally {
      restoreEnv("SEEDANCE_API_KEY", previousSeedanceKey);
      restoreEnv("ARK_API_KEY", previousArkKey);
    }
  });

  it("provides temporary public asset URLs to queued paid video generation", async () => {
    const previousSeedanceKey = process.env.SEEDANCE_API_KEY;
    const previousArkKey = process.env.ARK_API_KEY;
    const previousBaseUrl = process.env.BETTER_AUTH_URL;
    delete process.env.SEEDANCE_API_KEY;
    delete process.env.ARK_API_KEY;
    process.env.BETTER_AUTH_URL = "https://haitu.online";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-console-video-public-assets-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const outputsDir = testJobsDir(root);
      const productPath = testProductPath(fixturesDir, "box");
      await writeProduct(productPath);
      await writeFile(productAssetPath(productPath, "main.jpg"), Buffer.from("main-image"));
      let resolvedUrl = "";
      const server = createConsoleServer({
        rootDir: root,
        fixturesDir,
        outputsDir,
        runMakeVideoPipeline: async (input) => {
          resolvedUrl = await input.referenceImageUrlResolver?.(productAssetPath(productPath, "main.jpg")) ?? "";
          return {
            type: "haitu_make_video_report",
            status: "completed",
            productSku: "TK-001",
            provider: input.providerName,
            durationSeconds: input.durationSeconds,
            paidRequestConfirmed: input.confirmPaid,
            raw: {
              manifestPath: join(input.outDir, "raw", "manifest.json"),
              outputPath: join(input.outDir, "raw", "video.mp4")
            },
            totalCost: {
              amount: 8,
              currency: "CNY"
            },
            reusedRawManifest: false,
            recoveredRawOutput: false,
            reportPath: join(input.outDir, "make-video-report.json")
          };
        }
      });
      await server.fetchJson("/api/model-configs/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "paid-key",
          baseUrl: "https://ark.example.test",
          model: "doubao-seedance-2-0-fast-260128"
        })
      });
      await topUpWalletForPaidVideo(server);

      const queued = await server.fetchJson("/api/video-jobs", {
        method: "POST",
        body: JSON.stringify({
          productPath,
          provider: "volcengine-seedance",
          providerModel: "doubao-seedance-2-0-fast-260128",
          duration: 8,
          template: "scene",
          confirmPaid: true
        })
      });
      await waitForJobStatus(server, queued.job.id, "completed");
      const publicAssetResponse = await server.raw.fetch(new URL(resolvedUrl).pathname);

      expect(resolvedUrl).toMatch(/^https:\/\/haitu\.online\/api\/public-assets\/[A-Za-z0-9_-]+$/);
      expect(publicAssetResponse.status).toBe(200);
      await expect(publicAssetResponse.text()).resolves.toBe("main-image");
    } finally {
      restoreEnv("SEEDANCE_API_KEY", previousSeedanceKey);
      restoreEnv("ARK_API_KEY", previousArkKey);
      restoreEnv("BETTER_AUTH_URL", previousBaseUrl);
    }
  });

  it("does not provide localhost public asset URLs to queued paid video generation", async () => {
    const previousSeedanceKey = process.env.SEEDANCE_API_KEY;
    const previousArkKey = process.env.ARK_API_KEY;
    const previousBaseUrl = process.env.BETTER_AUTH_URL;
    delete process.env.SEEDANCE_API_KEY;
    delete process.env.ARK_API_KEY;
    process.env.BETTER_AUTH_URL = "http://127.0.0.1:4181";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-console-video-localhost-public-assets-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const outputsDir = testJobsDir(root);
      const productPath = testProductPath(fixturesDir, "box");
      await writeProduct(productPath);
      await writeFile(productAssetPath(productPath, "main.jpg"), Buffer.from("main-image"));
      let resolverWasProvided = true;
      const server = createConsoleServer({
        rootDir: root,
        fixturesDir,
        outputsDir,
        runMakeVideoPipeline: async (input) => {
          resolverWasProvided = Boolean(input.referenceImageUrlResolver);
          return {
            type: "haitu_make_video_report",
            status: "completed",
            productSku: "TK-001",
            provider: input.providerName,
            durationSeconds: input.durationSeconds,
            paidRequestConfirmed: input.confirmPaid,
            raw: {
              manifestPath: join(input.outDir, "raw", "manifest.json"),
              outputPath: join(input.outDir, "raw", "video.mp4")
            },
            totalCost: {
              amount: 8,
              currency: "CNY"
            },
            reusedRawManifest: false,
            recoveredRawOutput: false,
            reportPath: join(input.outDir, "make-video-report.json")
          };
        }
      });
      await server.fetchJson("/api/model-configs/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "paid-key",
          baseUrl: "https://ark.example.test",
          model: "doubao-seedance-2-0-fast-260128"
        })
      });
      await topUpWalletForPaidVideo(server);

      const queued = await server.fetchJson("/api/video-jobs", {
        method: "POST",
        body: JSON.stringify({
          productPath,
          provider: "volcengine-seedance",
          providerModel: "doubao-seedance-2-0-fast-260128",
          duration: 8,
          template: "scene",
          confirmPaid: true
        })
      });
      await waitForJobStatus(server, queued.job.id, "completed");

      expect(resolverWasProvided).toBe(false);
    } finally {
      restoreEnv("SEEDANCE_API_KEY", previousSeedanceKey);
      restoreEnv("ARK_API_KEY", previousArkKey);
      restoreEnv("BETTER_AUTH_URL", previousBaseUrl);
    }
  });

  it("caches remote reference image URLs before queued paid video generation", async () => {
    const previousSeedanceKey = process.env.SEEDANCE_API_KEY;
    const previousArkKey = process.env.ARK_API_KEY;
    const previousBaseUrl = process.env.BETTER_AUTH_URL;
    delete process.env.SEEDANCE_API_KEY;
    delete process.env.ARK_API_KEY;
    process.env.BETTER_AUTH_URL = "https://haitu.online";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-console-video-remote-public-assets-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const outputsDir = testJobsDir(root);
      const productPath = testProductPath(fixturesDir, "remote-box");
      const remoteImageUrl = "https://cdn.example.test/remote-reference.jpg?token=abc";
      await writeProduct(productPath, {
        sku: "REMOTE-BOX",
        title_ja: "remote box",
        reference_images: [remoteImageUrl]
      });
      const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        if (String(url) === remoteImageUrl) {
          return new Response(Buffer.from("remote-image-bytes"), {
            headers: {
              "content-type": "image/jpeg"
            }
          });
        }
        throw new Error(`Unexpected fetch: ${String(url)} ${init?.method ?? "GET"}`);
      }) as unknown as typeof fetch;
      let resolvedUrl = "";
      const server = createConsoleServer({
        rootDir: root,
        fixturesDir,
        outputsDir,
        fetchImpl,
        runMakeVideoPipeline: async (input) => {
          resolvedUrl = await input.referenceImageUrlResolver?.(remoteImageUrl) ?? "";
          return {
            type: "haitu_make_video_report",
            status: "completed",
            productSku: "REMOTE-BOX",
            provider: input.providerName,
            durationSeconds: input.durationSeconds,
            paidRequestConfirmed: input.confirmPaid,
            raw: {
              manifestPath: join(input.outDir, "raw", "manifest.json"),
              outputPath: join(input.outDir, "raw", "video.mp4")
            },
            totalCost: {
              amount: 8,
              currency: "CNY"
            },
            reusedRawManifest: false,
            recoveredRawOutput: false,
            reportPath: join(input.outDir, "make-video-report.json")
          };
        }
      });
      await server.fetchJson("/api/model-configs/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "paid-key",
          baseUrl: "https://ark.example.test",
          model: "doubao-seedance-2-0-fast-260128"
        })
      });
      await topUpWalletForPaidVideo(server);

      const queued = await server.fetchJson("/api/video-jobs", {
        method: "POST",
        body: JSON.stringify({
          productPath,
          provider: "volcengine-seedance",
          providerModel: "doubao-seedance-2-0-fast-260128",
          duration: 8,
          template: "scene",
          confirmPaid: true
        })
      });
      await waitForJobStatus(server, queued.job.id, "completed");
      const publicAssetResponse = await server.raw.fetch(new URL(resolvedUrl).pathname);

      expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toBe(remoteImageUrl);
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]).toEqual(expect.objectContaining({ redirect: "manual" }));
      expect(resolvedUrl).toMatch(/^https:\/\/haitu\.online\/api\/public-assets\/[A-Za-z0-9_-]+$/);
      expect(publicAssetResponse.status).toBe(200);
      await expect(publicAssetResponse.text()).resolves.toBe("remote-image-bytes");
    } finally {
      restoreEnv("SEEDANCE_API_KEY", previousSeedanceKey);
      restoreEnv("ARK_API_KEY", previousArkKey);
      restoreEnv("BETTER_AUTH_URL", previousBaseUrl);
    }
  });

  it("rejects real video jobs before enqueue when the video model API key is missing", async () => {
    const previousSeedanceKey = process.env.SEEDANCE_API_KEY;
    const previousArkKey = process.env.ARK_API_KEY;
    delete process.env.SEEDANCE_API_KEY;
    delete process.env.ARK_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-console-video-missing-key-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const outputsDir = testJobsDir(root);
      const productPath = testProductPath(fixturesDir, "box");
      await writeProduct(productPath);
      await writeFile(productAssetPath(productPath, "main.jpg"), Buffer.from("main-image"));
      await writeFile(productAssetPath(productPath, "detail1.jpg"), Buffer.from("detail-image"));
      const calls: string[] = [];
      const server = createConsoleServer({
        rootDir: root,
        fixturesDir,
        outputsDir,
        autoStartSavedJobs: false,
        runMakeVideoPipeline: async (input) => {
          calls.push(input.outDir);
          throw new Error("Provider should not be called when video API key is missing.");
        }
      });

      const response = await server.fetch("/api/video-jobs", {
        method: "POST",
        body: JSON.stringify({
          productPath,
          provider: "volcengine-seedance",
          duration: 8,
          template: "scene",
          cta: "今すぐチェック",
          confirmPaid: true
        })
      });
      const body = await response.json();

      expect(response.status).toBe(402);
      expect(body.error).toBe("请先配置视频模型，再生成视频。");
      expect(calls).toEqual([]);
      await expect(server.fetchJson("/api/video-jobs")).resolves.toEqual({
        jobs: []
      });
    } finally {
      restoreEnv("SEEDANCE_API_KEY", previousSeedanceKey);
      restoreEnv("ARK_API_KEY", previousArkKey);
    }
  });

  it("uses a manually selected video model config for product video jobs", async () => {
    const previousSeedanceKey = process.env.SEEDANCE_API_KEY;
    const previousArkKey = process.env.ARK_API_KEY;
    delete process.env.SEEDANCE_API_KEY;
    delete process.env.ARK_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-console-video-model-override-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const outputsDir = testJobsDir(root);
      const walletProductPath = testProductPath(fixturesDir, "wallet");
      await writeProduct(walletProductPath, {
        sku: "WALLET-BLACK-001",
        title_ja: "カード収納ミニ財布",
        reference_images: ["main.jpg", "detail.jpg", "use.jpg"]
      });
      await writeFile(productAssetPath(walletProductPath, "main.jpg"), Buffer.from("main-image"));
      await writeFile(productAssetPath(walletProductPath, "detail.jpg"), Buffer.from("detail-image"));
      await writeFile(productAssetPath(walletProductPath, "use.jpg"), Buffer.from("use-image"));
      const capturedInputs: unknown[] = [];
      const server = createConsoleServer({
        rootDir: root,
        fixturesDir,
        outputsDir,
        runMakeVideoPipeline: async (input) => {
          capturedInputs.push(input);
          return {
            type: "haitu_make_video_report",
            status: "completed",
            productSku: "WALLET-BLACK-001",
            provider: input.providerName,
            durationSeconds: input.durationSeconds,
            paidRequestConfirmed: input.confirmPaid,
            raw: {
              manifestPath: join(input.outDir, "raw", "manifest.json"),
              outputPath: join(input.outDir, "raw", "video.mp4")
            },
            totalCost: {
              amount: 0,
              currency: "CNY"
            },
            reusedRawManifest: false,
            recoveredRawOutput: false,
            reportPath: join(input.outDir, "make-video-report.json")
          };
        }
      });
      await server.fetchJson("/api/model-configs/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "configured-video-secret-9999",
          name: "默认 Fast",
          vendor: "volcengine",
          priority: 9,
          baseUrl: "https://seedance.example.test",
          model: "doubao-seedance-2-0-fast-260128"
        })
      });
      await server.fetchJson("/api/model-configs/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "standard-video-secret-0001",
          name: "标准版",
          vendor: "volcengine",
          priority: 1,
          baseUrl: "https://seedance-standard.example.test",
          model: "doubao-seedance-2-0-260128"
        })
      });
      const providerConfig = await server.fetchJson("/api/provider-config");
      const standardVideoConfig = providerConfig.videoModels.find((model: { model: string }) => model.model === "doubao-seedance-2-0-260128");
      expect(standardVideoConfig).toBeDefined();
      await topUpWalletForPaidVideo(server);

      const response = await server.fetchJson("/api/products/WALLET-BLACK-001/video-jobs", {
        method: "POST",
        body: JSON.stringify({
          provider: "volcengine-seedance",
          providerModelConfigId: standardVideoConfig.configId,
          duration: 8,
          template: "scene",
          cta: "今すぐチェック",
          versions: 1
        })
      });
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const latest = await server.fetchJson(`/api/video-jobs/${response.jobs[0].id}`);
        if (latest.job.status === "completed") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      expect(response.jobs[0]).toEqual(expect.objectContaining({
        provider: "volcengine-seedance",
        providerModelConfigId: standardVideoConfig.configId,
        providerModel: "doubao-seedance-2-0-260128",
        confirmPaid: true
      }));
      expect(capturedInputs[0]).toEqual(expect.objectContaining({
        apiKey: "standard-video-secret-0001",
        providerBaseUrl: "https://seedance-standard.example.test",
        providerModelConfigId: standardVideoConfig.configId,
        providerModel: "doubao-seedance-2-0-260128",
        confirmPaid: true
      }));
      await expect(readFile(jobFilePath(outputsDir, response.jobs[0].id), "utf8")).resolves.toContain(
        `"providerModelConfigId": "${standardVideoConfig.configId}"`
      );
      await expect(readFile(jobFilePath(outputsDir, response.jobs[0].id), "utf8")).resolves.toContain(
        "\"providerModel\": \"doubao-seedance-2-0-260128\""
      );
    } finally {
      restoreEnv("SEEDANCE_API_KEY", previousSeedanceKey);
      restoreEnv("ARK_API_KEY", previousArkKey);
    }
  });

  it("queues multiple video job versions for the same product in one request", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-video-job-batch-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const outputsDir = testJobsDir(root);
    const productPath = testProductPath(fixturesDir, "box");
    await writeProduct(productPath);
    const server = createConsoleServer({ rootDir: root, fixturesDir, outputsDir });

    const response = await server.fetchJson("/api/video-jobs/batch", {
      method: "POST",
      body: JSON.stringify({
        productPath,
        provider: "mock",
        duration: 8,
        template: "scene",
        cta: "今すぐチェック",
        versions: 3
      })
    });

    expect(response.jobs).toHaveLength(3);
    expect(response.jobs.map((job: { status: string }) => job.status)).toEqual(["queued", "queued", "queued"]);
    const outDirs = response.jobs.map((job: { outDir: string }) => job.outDir);
    expect(new Set(outDirs).size).toBe(3);
    expect(outDirs.every((outDir: string) => outDir.startsWith(join(outputsDir, "job-")))).toBe(true);
    expect(response.jobs.map((job: { provider: string }) => job.provider)).toEqual(["mock", "mock", "mock"]);

    for (const job of response.jobs as Array<{ id: string }>) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const latest = await server.fetchJson(`/api/video-jobs/${job.id}`);
        if (latest.job.status === "completed") {
          expect(latest.job.hashtags).toEqual(expect.arrayContaining([
            "#収納グッズ",
            "#省スペース",
            "#TikTokShop"
          ]));
          expect(latest.job.hashtags.every((tag: string) => tag.startsWith("#"))).toBe(true);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }
  });

  it("queues product video jobs by sku so product workflows do not pass local fixture paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-product-video-job-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const outputsDir = testJobsDir(root);
    await writeProduct(testProductPath(fixturesDir, "wallet"), {
      sku: "WALLET-BLACK-001",
      title_ja: "カード収納ミニ財布",
      reference_images: ["main.jpg", "detail.jpg", "use.jpg"]
    });
    const server = createConsoleServer({ rootDir: root, fixturesDir, outputsDir });

    const response = await server.fetchJson("/api/products/WALLET-BLACK-001/video-jobs", {
      method: "POST",
      body: JSON.stringify({
        provider: "mock",
        duration: 8,
        template: "scene",
        cta: "今すぐチェック",
        versions: 2
      })
    });

    expect(response).toEqual({
      productSku: "WALLET-BLACK-001",
      jobs: [
        expect.objectContaining({
          id: expect.stringMatching(/^job-/),
          status: "queued",
          productPath: testProductPath(fixturesDir, "wallet"),
          provider: "mock",
          durationSeconds: 8,
          outDir: expect.stringContaining(join(outputsDir, "job-"))
        }),
        expect.objectContaining({
          id: expect.stringMatching(/^job-/),
          status: "queued",
          productPath: testProductPath(fixturesDir, "wallet"),
          provider: "mock",
          durationSeconds: 8,
          outDir: expect.stringContaining(join(outputsDir, "job-"))
        })
      ]
    });
    expect(new Set(response.jobs.map((job: { outDir: string }) => job.outDir)).size).toBe(2);
    for (const job of response.jobs as Array<{ id: string }>) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const latest = await server.fetchJson(`/api/video-jobs/${job.id}`);
        if (latest.job.status === "completed") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }
  });

  it("tops up internal validation batches only for products with enough reference images", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-validation-topup-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const outputsDir = testJobsDir(root);
    await writeProduct(testProductPath(fixturesDir, "wallet"), {
      sku: "WALLET-BLACK-001",
      title_ja: "カード収納ミニ財布",
      reference_images: ["main.jpg", "detail.jpg", "use.jpg"]
    });
    await writeProduct(testProductPath(fixturesDir, "box"), {
      sku: "BOX-001",
      title_ja: "折りたたみ収納ボックス",
      reference_images: ["main.jpg"]
    });
    await writeFileReport(join(outputsDir, "wallet-v1", "make-video-report.json"), {
      type: "haitu_make_video_report",
      status: "completed",
      productSku: "WALLET-BLACK-001",
      provider: "mock",
      durationSeconds: 8,
      raw: {
        manifestPath: join(outputsDir, "wallet-v1", "raw", "manifest.json"),
        outputPath: join(outputsDir, "wallet-v1", "raw", "video.txt")
      },
      final: {
        manifestPath: join(outputsDir, "wallet-v1", "final", "manifest.json"),
        outputPath: join(outputsDir, "wallet-v1", "final", "video.mp4")
      },
      totalCost: {
        amount: 0,
        currency: "USD"
      },
      reusedRawManifest: false,
      recoveredRawOutput: false
    });
    const server = createConsoleServer({ rootDir: root, fixturesDir, outputsDir });

    const response = await server.fetchJson("/api/internal-validation/top-up", {
      method: "POST",
      body: JSON.stringify({})
    });

    expect(response.jobs).toHaveLength(2);
    expect(response.jobs.map((job: { provider: string }) => job.provider)).toEqual(["mock", "mock"]);
    expect(response.jobs.map((job: { durationSeconds: number }) => job.durationSeconds)).toEqual([8, 8]);
    expect(response.jobs.map((job: { outDir: string }) => job.outDir)).toEqual([
      join(outputsDir, "WALLET-BLACK-001-v2"),
      join(outputsDir, "WALLET-BLACK-001-v3")
    ]);
    expect(response.skipped).toEqual([
      {
        productSku: "BOX-001",
        reason: "参考图不足 3 张",
        referenceImageCount: 1,
        existingVersions: 0,
        missingVersions: 3
      }
    ]);
    for (const job of response.jobs as Array<{ id: string }>) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const latest = await server.fetchJson(`/api/video-jobs/${job.id}`);
        if (latest.job.status === "completed") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }
  });

  it("keeps the legacy video job groups endpoint stable when no queued job files exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-video-groups-empty-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    const server = createConsoleServer({ rootDir: root, outputsDir, autoStartSavedJobs: false });

    const response = await server.fetch("/api/video-jobs/groups");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      groups: [],
      products: []
    });
  });

  it("queues paid video jobs when estimated cost exceeds the legacy local budget reference", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-video-budget-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const outputsDir = testJobsDir(root);
    const productPath = testProductPath(fixturesDir, "box");
    await writeProduct(productPath);
    const calls: string[] = [];
    const server = createConsoleServer({
      rootDir: root,
      fixturesDir,
      outputsDir,
      autoStartSavedJobs: false,
      runMakeVideoPipeline: async (input) => {
        calls.push(input.outDir);
        return {
          type: "haitu_make_video_report",
          status: "completed",
          productSku: "TK-001",
          provider: input.providerName,
          durationSeconds: input.durationSeconds,
          paidRequestConfirmed: input.confirmPaid,
          raw: {
            manifestPath: join(input.outDir, "raw", "manifest.json"),
            outputPath: join(input.outDir, "raw", "video.mp4")
          },
          totalCost: {
            amount: 0,
            currency: "USD"
          },
          reusedRawManifest: false,
          recoveredRawOutput: false,
          reportPath: join(input.outDir, "make-video-report.json")
        };
      }
    });
    await configurePaidVideoModel(server);
    await server.fetchJson("/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        maxEstimatedCostCnyPerVideo: 1
      })
    });

    const response = await server.fetch("/api/video-jobs", {
      method: "POST",
      body: JSON.stringify({
        productPath,
        provider: "volcengine-seedance",
        duration: 8,
        template: "scene",
        cta: "今すぐチェック",
        confirmPaid: true
      })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.job).toEqual(expect.objectContaining({
      provider: "volcengine-seedance",
      status: "queued",
      confirmPaid: true
    }));
    await waitForJobStatus(server, body.job.id, "completed");
    expect(calls).toEqual([body.job.outDir]);
  });

  it("queues paid video jobs even when historical estimates exceed the configured cost reference", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-video-credit-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const outputsDir = testJobsDir(root);
    const productPath = testProductPath(fixturesDir, "box");
    await writeProduct(productPath);
    await writeFileReport(join(outputsDir, "paid-existing", "make-video-report.json"), {
      type: "haitu_make_video_report",
      productSku: "TK-001",
      provider: "volcengine-seedance",
      status: "completed",
      durationSeconds: 8,
      billing: {
        totalTokens: 94595,
        estimatedCostCny: 3.5
      },
      raw: {
        outputPath: join(outputsDir, "paid-existing", "raw.mp4")
      },
      reportPath: join(outputsDir, "paid-existing", "make-video-report.json")
    });
    const calls: string[] = [];
    const server = createConsoleServer({
      rootDir: root,
      fixturesDir,
      outputsDir,
      runMakeVideoPipeline: async (input) => {
        calls.push(input.outDir);
        await writeFileReport(join(input.outDir, "make-video-report.json"), {
          type: "haitu_make_video_report",
          status: "completed",
          productSku: "TK-001",
          provider: input.providerName,
          durationSeconds: input.durationSeconds,
          paidRequestConfirmed: input.confirmPaid,
          raw: {
            manifestPath: join(input.outDir, "raw", "manifest.json"),
            outputPath: join(input.outDir, "raw", "video.mp4")
          },
          totalCost: {
            amount: 0,
            currency: "USD"
          },
          reusedRawManifest: false,
          recoveredRawOutput: false,
          reportPath: join(input.outDir, "make-video-report.json")
        });
        return {
          type: "haitu_make_video_report",
          status: "completed",
          productSku: "TK-001",
          provider: input.providerName,
          durationSeconds: input.durationSeconds,
          paidRequestConfirmed: input.confirmPaid,
          raw: {
            manifestPath: join(input.outDir, "raw", "manifest.json"),
            outputPath: join(input.outDir, "raw", "video.mp4")
          },
          totalCost: {
            amount: 0,
            currency: "USD"
          },
          reusedRawManifest: false,
          recoveredRawOutput: false,
          reportPath: join(input.outDir, "make-video-report.json")
        };
      }
    });
    await configurePaidVideoModel(server);
    await server.fetchJson("/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        maxEstimatedCostCnyPerVideo: 5,
        testCreditBalanceCny: 5
      })
    });

    const queued = await server.fetchJson("/api/video-jobs", {
      method: "POST",
      body: JSON.stringify({
        productPath,
        provider: "volcengine-seedance",
        duration: 8,
        template: "scene",
        cta: "今すぐチェック",
        confirmPaid: true
      })
    });

    await waitForJobStatus(server, queued.job.id, "completed");
    expect(calls).toEqual([queued.job.outDir]);
  });

  it("queues paid batch video jobs even when combined estimates exceed the configured cost reference", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-video-batch-credit-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const outputsDir = testJobsDir(root);
    const productPath = testProductPath(fixturesDir, "box");
    await writeProduct(productPath);
    await writeFile(productAssetPath(productPath, "main.jpg"), Buffer.from("main-image"));
    const calls: string[] = [];
    const server = createConsoleServer({
      rootDir: root,
      fixturesDir,
      outputsDir,
      runMakeVideoPipeline: async (input) => {
        calls.push(input.outDir);
        await writeFileReport(join(input.outDir, "make-video-report.json"), {
          type: "haitu_make_video_report",
          status: "completed",
          productSku: "TK-001",
          provider: input.providerName,
          durationSeconds: input.durationSeconds,
          paidRequestConfirmed: input.confirmPaid,
          raw: {
            manifestPath: join(input.outDir, "raw", "manifest.json"),
            outputPath: join(input.outDir, "raw", "video.mp4")
          },
          totalCost: {
            amount: 0,
            currency: "USD"
          },
          reusedRawManifest: false,
          recoveredRawOutput: false,
          reportPath: join(input.outDir, "make-video-report.json")
        });
        return {
          type: "haitu_make_video_report",
          status: "completed",
          productSku: "TK-001",
          provider: input.providerName,
          durationSeconds: input.durationSeconds,
          paidRequestConfirmed: input.confirmPaid,
          raw: {
            manifestPath: join(input.outDir, "raw", "manifest.json"),
            outputPath: join(input.outDir, "raw", "video.mp4")
          },
          totalCost: {
            amount: 0,
            currency: "USD"
          },
          reusedRawManifest: false,
          recoveredRawOutput: false,
          reportPath: join(input.outDir, "make-video-report.json")
        };
      }
    });
    await configurePaidVideoModel(server);
    await server.fetchJson("/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        maxEstimatedCostCnyPerVideo: 5,
        testCreditBalanceCny: 6
      })
    });

    const response = await server.fetchJson("/api/video-jobs/batch", {
      method: "POST",
      body: JSON.stringify({
        productPath,
        provider: "volcengine-seedance",
        duration: 8,
        template: "scene",
        cta: "今すぐチェック",
        confirmPaid: true,
        versions: 3
      })
    });

    expect(response.jobs).toHaveLength(3);
    for (const job of response.jobs as Array<{ id: string }>) {
      await waitForJobStatus(server, job.id, "completed");
    }
    expect(calls).toHaveLength(3);
  });

  it("does not partially enqueue paid batch video jobs when the wallet cannot cover every version", async () => {
    const previousSeedanceKey = process.env.SEEDANCE_API_KEY;
    const previousArkKey = process.env.ARK_API_KEY;
    delete process.env.SEEDANCE_API_KEY;
    delete process.env.ARK_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-console-video-batch-partial-balance-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const outputsDir = testJobsDir(root);
      const productPath = testProductPath(fixturesDir, "box");
      await writeProduct(productPath);
      await writeFile(productAssetPath(productPath, "main.jpg"), Buffer.from("main-image"));
      const calls: string[] = [];
      const server = createConsoleServer({
        rootDir: root,
        fixturesDir,
        outputsDir,
        runMakeVideoPipeline: async (input) => {
          calls.push(input.outDir);
          return {
            type: "haitu_make_video_report",
            status: "completed",
            productSku: "TK-001",
            provider: input.providerName,
            durationSeconds: input.durationSeconds,
            paidRequestConfirmed: input.confirmPaid,
            raw: {
              manifestPath: join(input.outDir, "raw", "manifest.json"),
              outputPath: join(input.outDir, "raw", "video.mp4")
            },
            totalCost: {
              amount: 0,
              currency: "USD"
            },
            reusedRawManifest: false,
            recoveredRawOutput: false,
            reportPath: join(input.outDir, "make-video-report.json")
          };
        }
      });
      await server.fetchJson("/api/model-configs/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "paid-batch-key",
          baseUrl: "https://ark.example.test",
          model: "doubao-seedance-2-0-fast-260128"
        })
      });
      await creditTestWallet(server, 2, "partial batch video balance");

      const response = await server.fetch("/api/video-jobs/batch", {
        method: "POST",
        body: JSON.stringify({
          productPath,
          provider: "volcengine-seedance",
          duration: 8,
          template: "scene",
          cta: "今すぐチェック",
          confirmPaid: true,
          versions: 3
        })
      });
      const wallet = await server.fetchJson("/api/wallet");

      expect(response.status).toBe(402);
      await expect(response.json()).resolves.toEqual({
        error: "余额不足，请先充值后再生成视频。"
      });
      await expect(server.fetchJson("/api/video-jobs")).resolves.toEqual({
        jobs: []
      });
      expect(wallet).toEqual(expect.objectContaining({
        balanceCny: 2,
        reservedCny: 0,
        availableCny: 2
      }));
      expect(wallet.transactions.map((tx: { type: string; amountCny: number }) => [tx.type, tx.amountCny])).toEqual([
        ["recharge", 2]
      ]);
      expect(calls).toEqual([]);
    } finally {
      restoreEnv("SEEDANCE_API_KEY", previousSeedanceKey);
      restoreEnv("ARK_API_KEY", previousArkKey);
    }
  });

  it("keeps video jobs for one workspace on a single request queue", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-video-workspace-queue-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const outputsDir = testJobsDir(root);
    const productPath = testProductPath(fixturesDir, "box");
    await writeProduct(productPath);
    let releaseFirstJob!: () => void;
    const firstJobGate = new Promise<void>((resolve) => {
      releaseFirstJob = resolve;
    });
    const calls: string[] = [];
    const server = createConsoleServer({
      rootDir: root,
      fixturesDir,
      outputsDir,
      runMakeVideoPipeline: async (input) => {
        calls.push(input.outDir);
        if (calls.length === 1) {
          await firstJobGate;
        }
        return {
          type: "haitu_make_video_report",
          status: "completed",
          productSku: "TK-001",
          provider: input.providerName,
          durationSeconds: input.durationSeconds,
          paidRequestConfirmed: input.confirmPaid,
          raw: {
            manifestPath: join(input.outDir, "raw", "manifest.json"),
            outputPath: join(input.outDir, "raw", "video.txt")
          },
          totalCost: {
            amount: 0,
            currency: "USD"
          },
          reusedRawManifest: false,
          recoveredRawOutput: false,
          reportPath: join(input.outDir, "make-video-report.json")
        };
      }
    });

    const first = await server.fetchJson("/api/video-jobs", {
      method: "POST",
      body: JSON.stringify({
        productPath,
        provider: "mock",
        duration: 8,
        template: "scene",
        cta: "今すぐチェック"
      })
    });
    const second = await server.fetchJson("/api/video-jobs", {
      method: "POST",
      body: JSON.stringify({
        productPath,
        provider: "mock",
        duration: 8,
        template: "scene",
        cta: "今すぐチェック"
      })
    });
    await sleep(25);
    const queued = await server.fetchJson(`/api/video-jobs/${second.job.id}`);

    expect(calls).toEqual([first.job.outDir]);
    expect(queued.job.status).toBe("queued");

    releaseFirstJob();
    await waitForJobStatus(server, second.job.id, "completed");
  });

  it("queues paid video jobs even when reference images are missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-video-readiness-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const outputsDir = testJobsDir(root);
    const productPath = testProductPath(fixturesDir, "box");
    await writeProduct(productPath, {
      reference_images: ["missing-main.jpg"]
    });
    const calls: string[] = [];
    const server = createConsoleServer({
      rootDir: root,
      fixturesDir,
      outputsDir,
      runMakeVideoPipeline: async (input) => {
        calls.push(input.outDir);
        await writeFileReport(join(input.outDir, "make-video-report.json"), {
          type: "haitu_make_video_report",
          status: "completed",
          productSku: "TK-001",
          provider: input.providerName,
          durationSeconds: input.durationSeconds,
          paidRequestConfirmed: input.confirmPaid,
          raw: {
            manifestPath: join(input.outDir, "raw", "manifest.json"),
            outputPath: join(input.outDir, "raw", "video.mp4")
          },
          totalCost: {
            amount: 0,
            currency: "USD"
          },
          reusedRawManifest: false,
          recoveredRawOutput: false,
          reportPath: join(input.outDir, "make-video-report.json")
        });
        return {
          type: "haitu_make_video_report",
          status: "completed",
          productSku: "TK-001",
          provider: input.providerName,
          durationSeconds: input.durationSeconds,
          paidRequestConfirmed: input.confirmPaid,
          raw: {
            manifestPath: join(input.outDir, "raw", "manifest.json"),
            outputPath: join(input.outDir, "raw", "video.mp4")
          },
          totalCost: {
            amount: 0,
            currency: "USD"
          },
          reusedRawManifest: false,
          recoveredRawOutput: false,
          reportPath: join(input.outDir, "make-video-report.json")
        };
      }
    });
    await configurePaidVideoModel(server);

    const queued = await server.fetchJson("/api/video-jobs", {
      method: "POST",
      body: JSON.stringify({
        productPath,
        provider: "volcengine-seedance",
        duration: 8,
        template: "scene",
        cta: "今すぐチェック",
        confirmPaid: true
      })
    });

    await waitForJobStatus(server, queued.job.id, "completed");
    expect(calls).toEqual([queued.job.outDir]);
  });

  it("queues paid video jobs when optional product facts are unconfirmed", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-video-fact-readiness-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const outputsDir = testJobsDir(root);
    const productPath = testProductPath(fixturesDir, "box");
    await writeProduct(productPath, {
      materials: ["材质未确认"],
      dimensions: "尺寸未确认",
      reference_images: ["main.jpg"]
    });
    await writeFile(productAssetPath(productPath, "main.jpg"), Buffer.from("main-image"));
    const calls: string[] = [];
    const server = createConsoleServer({
      rootDir: root,
      fixturesDir,
      outputsDir,
      runMakeVideoPipeline: async (input) => {
        calls.push(input.outDir);
        await writeFileReport(join(input.outDir, "make-video-report.json"), {
          type: "haitu_make_video_report",
          status: "completed",
          productSku: "TK-001",
          provider: input.providerName,
          durationSeconds: input.durationSeconds,
          paidRequestConfirmed: input.confirmPaid,
          raw: {
            manifestPath: join(input.outDir, "raw", "manifest.json"),
            outputPath: join(input.outDir, "raw", "video.mp4")
          },
          totalCost: {
            amount: 0,
            currency: "USD"
          },
          reusedRawManifest: false,
          recoveredRawOutput: false,
          reportPath: join(input.outDir, "make-video-report.json")
        });
        return {
          type: "haitu_make_video_report",
          status: "completed",
          productSku: "TK-001",
          provider: input.providerName,
          durationSeconds: input.durationSeconds,
          paidRequestConfirmed: input.confirmPaid,
          raw: {
            manifestPath: join(input.outDir, "raw", "manifest.json"),
            outputPath: join(input.outDir, "raw", "video.mp4")
          },
          totalCost: {
            amount: 0,
            currency: "USD"
          },
          reusedRawManifest: false,
          recoveredRawOutput: false,
          reportPath: join(input.outDir, "make-video-report.json")
        };
      }
    });
    await configurePaidVideoModel(server);

    const queued = await server.fetchJson("/api/video-jobs", {
      method: "POST",
      body: JSON.stringify({
        productPath,
        provider: "volcengine-seedance",
        duration: 8,
        template: "scene",
        cta: "今すぐチェック",
        confirmPaid: true
      })
    });

    await waitForJobStatus(server, queued.job.id, "completed");
    expect(calls).toEqual([queued.job.outDir]);
  });

  it("queues paid batch video jobs even when reference images are missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-video-batch-readiness-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const outputsDir = testJobsDir(root);
    const productPath = testProductPath(fixturesDir, "box");
    await writeProduct(productPath, {
      reference_images: ["missing-main.jpg"]
    });
    const calls: string[] = [];
    const server = createConsoleServer({
      rootDir: root,
      fixturesDir,
      outputsDir,
      runMakeVideoPipeline: async (input) => {
        calls.push(input.outDir);
        await writeFileReport(join(input.outDir, "make-video-report.json"), {
          type: "haitu_make_video_report",
          status: "completed",
          productSku: "TK-001",
          provider: input.providerName,
          durationSeconds: input.durationSeconds,
          paidRequestConfirmed: input.confirmPaid,
          raw: {
            manifestPath: join(input.outDir, "raw", "manifest.json"),
            outputPath: join(input.outDir, "raw", "video.mp4")
          },
          totalCost: {
            amount: 0,
            currency: "USD"
          },
          reusedRawManifest: false,
          recoveredRawOutput: false,
          reportPath: join(input.outDir, "make-video-report.json")
        });
        return {
          type: "haitu_make_video_report",
          status: "completed",
          productSku: "TK-001",
          provider: input.providerName,
          durationSeconds: input.durationSeconds,
          paidRequestConfirmed: input.confirmPaid,
          raw: {
            manifestPath: join(input.outDir, "raw", "manifest.json"),
            outputPath: join(input.outDir, "raw", "video.mp4")
          },
          totalCost: {
            amount: 0,
            currency: "USD"
          },
          reusedRawManifest: false,
          recoveredRawOutput: false,
          reportPath: join(input.outDir, "make-video-report.json")
        };
      }
    });
    await configurePaidVideoModel(server);

    const response = await server.fetchJson("/api/video-jobs/batch", {
      method: "POST",
      body: JSON.stringify({
        productPath,
        provider: "volcengine-seedance",
        duration: 8,
        template: "scene",
        cta: "今すぐチェック",
        confirmPaid: true,
        versions: 3
      })
    });

    expect(response.jobs).toHaveLength(3);
    for (const job of response.jobs as Array<{ id: string }>) {
      await waitForJobStatus(server, job.id, "completed");
    }
    expect(calls).toHaveLength(3);
  });

  it("cancels a queued local video job from the console API", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-video-job-cancel-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const outputsDir = testJobsDir(root);
    const productPath = testProductPath(fixturesDir, "box");
    await writeProduct(productPath);
    let releaseFirstJob!: () => void;
    const firstJobGate = new Promise<void>((resolve) => {
      releaseFirstJob = resolve;
    });
    const calls: string[] = [];
    const server = createConsoleServer({
      rootDir: root,
      fixturesDir,
      outputsDir,
      runMakeVideoPipeline: async (input) => {
        calls.push(input.outDir);
        if (calls.length === 1) {
          await firstJobGate;
        }
        return {
          type: "haitu_make_video_report",
          status: "completed",
          productSku: "TK-001",
          provider: input.providerName,
          durationSeconds: input.durationSeconds,
          paidRequestConfirmed: input.confirmPaid,
          raw: {
            manifestPath: join(input.outDir, "raw", "manifest.json"),
            outputPath: join(input.outDir, "raw", "video.txt")
          },
          totalCost: {
            amount: 0,
            currency: "USD"
          },
          reusedRawManifest: false,
          recoveredRawOutput: false,
          reportPath: join(input.outDir, "make-video-report.json")
        };
      }
    });

    const first = await server.fetchJson("/api/video-jobs", {
      method: "POST",
      body: JSON.stringify({
        productPath,
        provider: "mock",
        duration: 8,
        template: "scene",
        cta: "今すぐチェック"
      })
    });
    const second = await server.fetchJson("/api/video-jobs", {
      method: "POST",
      body: JSON.stringify({
        productPath,
        provider: "mock",
        duration: 8,
        template: "scene",
        cta: "今すぐチェック"
      })
    });
    const third = await server.fetchJson("/api/video-jobs", {
      method: "POST",
      body: JSON.stringify({
        productPath,
        provider: "mock",
        duration: 8,
        template: "scene",
        cta: "今すぐチェック"
      })
    });

    const cancelled = await server.fetchJson(`/api/video-jobs/${third.job.id}/cancel`, {
      method: "POST"
    });
    releaseFirstJob();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const latestFirst = await server.fetchJson(`/api/video-jobs/${first.job.id}`);
      if (latestFirst.job.status === "completed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const jobPath = jobFilePath(outputsDir, third.job.id);

    expect(cancelled.job).toEqual(expect.objectContaining({
      id: third.job.id,
      status: "canceled"
    }));
    expect(calls.length).toBeGreaterThanOrEqual(1);
    await expect(readFile(jobPath, "utf8")).resolves.toContain("\"status\": \"canceled\"");
  });

  it("keeps a running local video job canceled after the worker returns", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-video-job-running-cancel-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const outputsDir = testJobsDir(root);
    const productPath = testProductPath(fixturesDir, "box");
    await writeProduct(productPath);
    let releaseJob!: () => void;
    const jobGate = new Promise<void>((resolve) => {
      releaseJob = resolve;
    });
    const server = createConsoleServer({
      rootDir: root,
      fixturesDir,
      outputsDir,
      runMakeVideoPipeline: async (input) => {
        await jobGate;
        await writeFileReport(join(input.outDir, "make-video-report.json"), {
          type: "haitu_make_video_report",
          status: "completed",
          productSku: "TK-001",
          provider: input.providerName,
          durationSeconds: input.durationSeconds,
          raw: {
            manifestPath: join(input.outDir, "raw", "manifest.json"),
            outputPath: join(input.outDir, "raw", "video.txt")
          },
          totalCost: {
            amount: 0,
            currency: "USD"
          },
          reusedRawManifest: false,
          recoveredRawOutput: false
        });
        return {
          type: "haitu_make_video_report",
          status: "completed",
          productSku: "TK-001",
          provider: input.providerName,
          durationSeconds: input.durationSeconds,
          paidRequestConfirmed: input.confirmPaid,
          raw: {
            manifestPath: join(input.outDir, "raw", "manifest.json"),
            outputPath: join(input.outDir, "raw", "video.txt")
          },
          totalCost: {
            amount: 0,
            currency: "USD"
          },
          reusedRawManifest: false,
          recoveredRawOutput: false,
          reportPath: join(input.outDir, "make-video-report.json")
        };
      }
    });

    const queued = await server.fetchJson("/api/video-jobs", {
      method: "POST",
      body: JSON.stringify({
        productPath,
        provider: "mock",
        duration: 8,
        template: "scene",
        cta: "今すぐチェック"
      })
    });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const latest = await server.fetchJson(`/api/video-jobs/${queued.job.id}`);
      if (latest.job.status === "running") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const cancelled = await server.fetchJson(`/api/video-jobs/${queued.job.id}/cancel`, {
      method: "POST"
    });
    releaseJob();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const latest = await server.fetchJson(`/api/video-jobs/${queued.job.id}`);
    const ledger = await server.fetchJson("/api/job-ledger");

    expect(cancelled.job).toEqual(expect.objectContaining({
      id: queued.job.id,
      status: "canceled"
    }));
    expect(latest.job).toEqual(expect.objectContaining({
      id: queued.job.id,
      status: "canceled"
    }));
    expect(ledger.jobs).toEqual([]);
  });

  it("retries a failed local video job from the console API", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-video-job-retry-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const outputsDir = testJobsDir(root);
    const productPath = testProductPath(fixturesDir, "box");
    await writeProduct(productPath);
    const calls: string[] = [];
    const server = createConsoleServer({
      rootDir: root,
      fixturesDir,
      outputsDir,
      runMakeVideoPipeline: async (input) => {
        calls.push(input.outDir);
        if (calls.length === 1) {
          throw new Error("temporary provider failure");
        }
        return {
          type: "haitu_make_video_report",
          status: "completed",
          productSku: "TK-001",
          provider: input.providerName,
          durationSeconds: input.durationSeconds,
          paidRequestConfirmed: input.confirmPaid,
          raw: {
            manifestPath: join(input.outDir, "raw", "manifest.json"),
            outputPath: join(input.outDir, "raw", "video.txt")
          },
          totalCost: {
            amount: 0,
            currency: "USD"
          },
          reusedRawManifest: false,
          recoveredRawOutput: false,
          reportPath: join(input.outDir, "make-video-report.json")
        };
      }
    });
    const first = await server.fetchJson("/api/video-jobs", {
      method: "POST",
      body: JSON.stringify({
        productPath,
        outDirName: "box-video",
        provider: "mock",
        duration: 8,
        template: "scene",
        cta: "今すぐチェック"
      })
    });
    let failed;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      failed = await server.fetchJson(`/api/video-jobs/${first.job.id}`);
      if (failed.job.status === "failed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const retried = await server.fetchJson(`/api/video-jobs/${first.job.id}/retry`, {
      method: "POST",
      body: JSON.stringify({})
    });
    let completedRetry;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      completedRetry = await server.fetchJson(`/api/video-jobs/${first.job.id}`);
      if (completedRetry.job.status === "completed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    expect(failed.job).toEqual(expect.objectContaining({
      id: first.job.id,
      status: "failed",
      error: "temporary provider failure"
    }));
    expect(retried.job).toEqual(expect.objectContaining({
      id: first.job.id,
      status: "queued",
      provider: "mock",
      durationSeconds: 8,
      template: "scene",
      confirmPaid: false
    }));
    expect(retried.job.error).toBeUndefined();
    expect(retried.job.outDir).toBe(join(outputsDir, "box-video"));
    expect(completedRetry.job).toEqual(expect.objectContaining({
      id: first.job.id,
      status: "completed",
      productSku: "TK-001"
    }));
    expect(calls).toEqual([
      join(outputsDir, "box-video"),
      join(outputsDir, "box-video")
    ]);
  });

  it("requires a fresh paid confirmation before retrying paid failed video jobs", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-video-job-retry-paid-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    const failedJobId = "job-paid-failed";
    await mkdir(join(outputsDir, failedJobId), { recursive: true });
    await writeFile(
      jobFilePath(outputsDir, failedJobId),
      JSON.stringify(
        {
          id: failedJobId,
          status: "failed",
          productPath: testProductPath(testProductsDir(root), "box"),
          provider: "volcengine-seedance",
          durationSeconds: 8,
          template: "scene",
          cta: "今すぐチェック",
          confirmPaid: true,
          outDir: join(outputsDir, "paid-failed"),
          error: "provider failed",
          createdAt: "2026-06-07T09:00:00.000Z",
          updatedAt: "2026-06-07T09:01:00.000Z",
          completedAt: "2026-06-07T09:01:00.000Z"
        },
        null,
        2
      ),
      "utf8"
    );
    const server = createConsoleServer({ rootDir: root, outputsDir });

    const response = await server.fetch(`/api/video-jobs/${failedJobId}/retry`, {
      method: "POST",
      body: JSON.stringify({})
    });
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error).toBe("Retrying a paid video job requires confirmPaid: true.");
    await expect(server.fetchJson("/api/video-jobs")).resolves.toEqual({
      jobs: [
        expect.objectContaining({
          id: failedJobId,
          status: "failed"
        })
      ]
    });
  });

  it("reserves and charges wallet again when retrying confirmed paid video jobs", async () => {
    const previousSeedanceKey = process.env.SEEDANCE_API_KEY;
    const previousArkKey = process.env.ARK_API_KEY;
    const previousAdminEmail = process.env.HAITU_ADMIN_EMAIL;
    delete process.env.SEEDANCE_API_KEY;
    delete process.env.ARK_API_KEY;
    process.env.HAITU_ADMIN_EMAIL = "console-test@example.com";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-console-video-job-retry-wallet-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      const outputsDir = testJobsDir(root);
      const productPath = testProductPath(fixturesDir, "wallet-retry");
      await writeProduct(productPath, {
        sku: "WALLET-RETRY-001",
        title_ja: "リトライ課金 ミニ財布",
        reference_images: ["main.jpg"]
      });
      await writeFile(productAssetPath(productPath, "main.jpg"), Buffer.from("main-image"));
      const calls: string[] = [];
      const server = createConsoleServer({
        rootDir: root,
        fixturesDir,
        outputsDir,
        runMakeVideoPipeline: async (input) => {
          calls.push(input.outDir);
          if (calls.length === 1) {
            throw new Error("temporary paid provider failure");
          }
          return {
            type: "haitu_make_video_report",
            status: "completed",
            productSku: "WALLET-RETRY-001",
            provider: input.providerName,
            durationSeconds: input.durationSeconds,
            paidRequestConfirmed: input.confirmPaid,
            raw: {
              manifestPath: join(input.outDir, "raw", "manifest.json"),
              outputPath: join(input.outDir, "raw", "video.mp4")
            },
            billing: {
              tokenPriceCnyPerMillion: 37,
              totalTokens: 100000,
              estimatedCostCny: 3.7
            },
            totalCost: {
              amount: 3.7,
              currency: "CNY"
            },
            reusedRawManifest: false,
            recoveredRawOutput: false,
            reportPath: join(input.outDir, "make-video-report.json")
          };
        }
      });
      await server.fetchJson("/api/admin/billing-settings", {
        method: "PUT",
        body: JSON.stringify({
          rules: [
            { usageKind: "video", serviceFeeCny: 1.5 }
          ]
        })
      });
      await server.fetchJson("/api/model-configs/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "byok-video-retry-secret",
          name: "用户自带视频重试",
          vendor: "volcengine",
          baseUrl: "https://byok-video-retry.example.test",
          model: "doubao-seedance-2-0-fast-260128"
        })
      });
      await creditTestWallet(server, 5, "retry paid video balance");
      const first = await server.fetchJson("/api/video-jobs", {
        method: "POST",
        body: JSON.stringify({
          productPath,
          outDirName: "wallet-retry-video",
          provider: "volcengine-seedance",
          duration: 8,
          template: "scene",
          confirmPaid: true
        })
      });
      const failed = await waitForJobStatus(server, first.job.id, "failed");

      const retried = await server.fetchJson(`/api/video-jobs/${first.job.id}/retry`, {
        method: "POST",
        body: JSON.stringify({
          confirmPaid: true
        })
      });
      const completedRetry = await waitForJobStatus(server, first.job.id, "completed");
      const wallet = await server.fetchJson("/api/wallet");

      expect(failed.job).toEqual(expect.objectContaining({
        id: first.job.id,
        status: "failed",
        error: "temporary paid provider failure"
      }));
      expect(retried.job).toEqual(expect.objectContaining({
        id: first.job.id,
        status: "queued",
        provider: "volcengine-seedance",
        confirmPaid: true
      }));
      expect(completedRetry.job).toEqual(expect.objectContaining({
        id: first.job.id,
        status: "completed",
        apiBillingMode: "byok",
        platformFeeCny: 1.5,
        upstreamEstimatedCostCny: 0
      }));
      expect(wallet).toEqual(expect.objectContaining({
        balanceCny: 3.5,
        reservedCny: 0,
        availableCny: 3.5
      }));
      expect(wallet.transactions.map((tx: { type: string; amountCny: number }) => [tx.type, tx.amountCny])).toEqual([
        ["charge", -1.5],
        ["reserve", -1.5],
        ["refund", 1.5],
        ["reserve", -1.5],
        ["recharge", 5]
      ]);
      expect(calls).toEqual([
        join(outputsDir, "wallet-retry-video"),
        join(outputsDir, "wallet-retry-video")
      ]);
    } finally {
      restoreEnv("SEEDANCE_API_KEY", previousSeedanceKey);
      restoreEnv("ARK_API_KEY", previousArkKey);
      restoreEnv("HAITU_ADMIN_EMAIL", previousAdminEmail);
    }
  });

  it("recovers a generated paid video download without requiring a paid retry confirmation", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-video-job-recover-download-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const outputsDir = testJobsDir(root);
    const productPath = testProductPath(fixturesDir, "box");
    await writeProduct(productPath);
    const failedJobId = "job-download-failed";
    const failedOutDir = join(outputsDir, failedJobId);
    const rawManifestPath = join(failedOutDir, "raw", "TK-001", "v1", "manifest.json");
    await mkdir(join(rawManifestPath, ".."), { recursive: true });
    await writeFile(
      rawManifestPath,
      JSON.stringify({
        jobId: "TK-001-v1",
        status: "completed",
        product: { sku: "TK-001", title_ja: "折りたたみ収納ボックス" },
        version: 1,
        provider: {
          name: "volcengine-seedance",
          model: "doubao-seedance-2-0-fast-260128",
          taskId: "task-generated"
        },
        script: {
          voiceover: "折りたたみ可能。今すぐチェック",
          subtitleLines: ["折りたたみ可能。", "今すぐチェック"],
          cta: "今すぐチェック"
        },
        prompt: "Create video",
        output: {
          path: join(failedOutDir, "raw", "TK-001", "v1", "missing.mp4"),
          width: 1080,
          height: 1920,
          durationSeconds: 10,
          mimeType: "video/mp4"
        },
        usage: { completionTokens: 90000, totalTokens: 90000 },
        qc: { result: "pass", checks: [] },
        cost: {
          provider: { amount: 8, currency: "CNY" },
          total: { amount: 8, currency: "CNY" }
        },
        hashtags: [],
        paths: {
          outputDir: join(rawManifestPath, ".."),
          manifest: rawManifestPath
        }
      }),
      "utf8"
    );
    await writeFile(
      jobFilePath(outputsDir, failedJobId),
      JSON.stringify(
        {
          id: failedJobId,
          status: "failed",
          productPath,
          productSku: "TK-001",
          provider: "volcengine-seedance",
          providerModel: "doubao-seedance-2-0-fast-260128",
          providerTaskId: "task-generated",
          recoverableRawManifestPath: rawManifestPath,
          canRecoverDownload: true,
          durationSeconds: 10,
          template: "scene",
          cta: "今すぐチェック",
          confirmPaid: true,
          outDir: failedOutDir,
          error: "视频已经生成，但服务器下载成片超时。",
          errorDetails: {
            message: "fetch failed",
            providerPhase: "download-output"
          },
          createdAt: "2026-06-07T09:00:00.000Z",
          updatedAt: "2026-06-07T09:01:00.000Z",
          completedAt: "2026-06-07T09:01:00.000Z"
        },
        null,
        2
      ),
      "utf8"
    );
    const calls: Array<{ confirmPaid: boolean; reuseManifestPath?: string }> = [];
    const server = createConsoleServer({
      rootDir: root,
      outputsDir,
      runMakeVideoPipeline: async (input) => {
        calls.push({
          confirmPaid: input.confirmPaid,
          reuseManifestPath: input.reuseManifestPath
        });
        const report = {
          type: "haitu_make_video_report" as const,
          status: "completed" as const,
          productSku: "TK-001",
          provider: input.providerName,
          durationSeconds: input.durationSeconds,
          paidRequestConfirmed: input.confirmPaid,
          raw: {
            manifestPath: input.reuseManifestPath ?? rawManifestPath,
            outputPath: join(input.outDir, "raw", "TK-001", "v1", "recovered.mp4"),
            taskId: "task-generated"
          },
          final: {
            manifestPath: join(input.outDir, "final", "manifest.json"),
            outputPath: join(input.outDir, "final", "final.mp4"),
            subtitlePath: join(input.outDir, "final", "subtitles.srt")
          },
          billing: {
            tokenPriceCnyPerMillion: 37,
            totalTokens: 90000,
            estimatedCostCny: 3.33
          },
          totalCost: {
            amount: 8,
            currency: "CNY" as const
          },
          reusedRawManifest: true,
          recoveredRawOutput: true,
          reportPath: join(input.outDir, "make-video-report.json")
        };
        await mkdir(join(report.reportPath, ".."), { recursive: true });
        await writeFile(report.reportPath, JSON.stringify(report, null, 2), "utf8");
        return report;
      }
    });

    const recovering = await server.fetchJson(`/api/video-jobs/${failedJobId}/recover-download`, {
      method: "POST",
      body: JSON.stringify({})
    });
    let completed;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      completed = await server.fetchJson(`/api/video-jobs/${failedJobId}`);
      if (completed.job.status === "completed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    expect(recovering.job).toEqual(expect.objectContaining({
      id: failedJobId,
      status: "queued",
      confirmPaid: false,
      reuseManifest: rawManifestPath
    }));
    expect(completed.job).toEqual(expect.objectContaining({
      id: failedJobId,
      status: "completed",
      finalVideoUrl: `/media?path=${encodeURIComponent(join(failedOutDir, "final", "final.mp4"))}`
    }));
    expect(calls).toEqual([
      {
        confirmPaid: false,
        reuseManifestPath: rawManifestPath
      }
    ]);
  });

  it("auto-resumes saved queued video jobs when the console server starts", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-video-job-resume-"));
    tempDirs.push(root);
    const fixturesDir = testProductsDir(root);
    const outputsDir = testJobsDir(root);
    const productPath = testProductPath(fixturesDir, "box");
    await writeProduct(productPath);
    const queuedJobId = "job-resume-queued";
    const queuedOutDir = join(outputsDir, queuedJobId);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await mkdir(queuedOutDir, { recursive: true });
    await writeFile(
      jobFilePath(outputsDir, queuedJobId),
      JSON.stringify(
        {
          id: queuedJobId,
          workspaceId: "default",
          status: "queued",
          productPath,
          outDir: queuedOutDir,
          createdAt: "2026-06-14T09:00:00.000Z",
          updatedAt: "2026-06-14T09:00:00.000Z",
          expiresAt,
          confirmPaid: false,
          finalLanguage: "ja",
          cta: "今すぐチェック",
          provider: "mock",
          durationSeconds: 8,
          template: "scene"
        },
        null,
        2
      ),
      "utf8"
    );
    await expect(readFile(jobFilePath(outputsDir, queuedJobId), "utf8")).resolves.toContain(
      "\"status\": \"queued\""
    );
    await expect(readFile(jobFilePath(outputsDir, queuedJobId), "utf8")).resolves.toContain(
      "\"workspaceId\": \"default\""
    );
    await expect(readFile(jobFilePath(outputsDir, queuedJobId), "utf8")).resolves.toContain(
      `"expiresAt": "${expiresAt}"`
    );
    const calls: string[] = [];
    const resumedServer = createConsoleServer({
      rootDir: root,
      fixturesDir,
      outputsDir,
      runMakeVideoPipeline: async (input) => {
        calls.push(input.outDir);
        return {
          type: "haitu_make_video_report",
          status: "completed",
          productSku: "TK-001",
          provider: input.providerName,
          durationSeconds: input.durationSeconds,
          paidRequestConfirmed: input.confirmPaid,
          raw: {
            manifestPath: join(input.outDir, "raw", "manifest.json"),
            outputPath: join(input.outDir, "raw", "video.txt")
          },
          totalCost: {
            amount: 0,
            currency: "USD"
          },
          reusedRawManifest: false,
          recoveredRawOutput: false,
          reportPath: join(input.outDir, "make-video-report.json")
        };
      }
    });

    let latest;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      latest = await resumedServer.fetchJson(`/api/video-jobs/${queuedJobId}`);
      if (latest.job.status === "completed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    expect(latest.job).toEqual(expect.objectContaining({
      id: queuedJobId,
      status: "completed",
      productSku: "TK-001"
    }));
    expect(calls).toEqual([queuedOutDir]);
  });
});

async function writeProduct(path: string, overrides: Record<string, unknown> = {}): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(
    path,
    JSON.stringify(
      {
        sku: "TK-001",
        title_ja: "折りたたみ収納ボックス",
        category: "収納用品",
        materials: ["PP"],
        dimensions: "36x25x19cm",
        verified_selling_points: ["折りたたみ可能", "積み重ね可能", "省スペース"],
        usage_scenes: ["キッチン", "洗面所", "クローゼット"],
        forbidden_claims: ["防水未確認", "耐荷重未確認", "日本で大人気は未確認"],
        reference_images: ["main.jpg", "detail1.jpg"],
        ...overrides
      },
      null,
      2
    ),
    "utf8"
  );
}

function testDataDir(root: string): string {
  return join(root, "data");
}

function readConsoleSettingsRows(dataDir: string): Array<{
  id: string;
  default_cta: string;
  max_estimated_cost_cents_per_video: number;
  test_credit_balance_cents: number;
}> {
  const handle = openDatabase({ dataDir, env: process.env });
  try {
    return handle.sqlite.prepare(`
      SELECT
        id,
        default_cta,
        max_estimated_cost_cents_per_video,
        test_credit_balance_cents
      FROM console_settings
      ORDER BY id ASC
    `).all() as Array<{
      id: string;
      default_cta: string;
      max_estimated_cost_cents_per_video: number;
      test_credit_balance_cents: number;
    }>;
  } finally {
    closeDatabase(handle);
  }
}

type TestConsoleServerHandle = ConsoleServerHandle & {
  raw: ConsoleServerHandle;
  authCookie: string;
  dataDir: string;
  workspaceId: string;
};

function createConsoleServer(options: ConsoleServerOptions & { mockLiveFx?: boolean } = {}): TestConsoleServerHandle {
  if (!process.env.HAITU_SECRET_KEY) {
    vi.stubEnv("HAITU_SECRET_KEY", "0123456789abcdef0123456789abcdef");
  }
  vi.stubEnv("HAITU_AUTH_EMAIL_FROM", "");
  vi.stubEnv("RESEND_API_KEY", "");
  const { mockLiveFx = true, ...serverOptions } = options;
  const rootDir = serverOptions.rootDir ?? process.cwd();
  const dataDir = serverOptions.dataDir
    ? isAbsolute(serverOptions.dataDir)
      ? serverOptions.dataDir
      : join(rootDir, serverOptions.dataDir)
    : testDataDir(rootDir);
  const fetchImpl = serverOptions.fetchImpl || mockLiveFx
    ? ((async (url: string | URL | Request, init?: RequestInit) => {
        const fxResponse = mockLiveFx ? liveFxResponse(url) : undefined;
        if (fxResponse) {
          return fxResponse;
        }
        const targetFetch = serverOptions.fetchImpl ?? fetch;
        return init === undefined ? targetFetch(url) : targetFetch(url, init);
      }) as typeof fetch)
    : undefined;
  const raw = createRawConsoleServer({
    ...serverOptions,
    fetchImpl,
    rootDir,
    dataDir
  });
  let authSession: Promise<{ cookie: string; workspaceId: string }> | undefined;

  async function session(): Promise<{ cookie: string; workspaceId: string }> {
    if (!authSession) {
      authSession = registerConsoleUser(dataDir, raw, "console-test@example.com")
        .then(async (current) => {
          await importDefaultWorkspaceFiles(dataDir, current.workspaceId);
          return current;
        });
    }
    return authSession;
  }

  const server: TestConsoleServerHandle = {
    raw,
    authCookie: "",
    dataDir,
    workspaceId: "",
    async fetch(path: string, init: RequestInit = {}): Promise<Response> {
      if (isAuthOrPublicPath(path)) {
        return raw.fetch(path, init);
      }
      const current = await session();
      server.authCookie = current.cookie;
      server.workspaceId = current.workspaceId;
      return raw.fetch(path, withCookie(init, current.cookie));
    },
    async fetchJson(path: string, init: RequestInit = {}): Promise<any> {
      const response = await server.fetch(path, init);
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || `HTTP ${response.status}`);
      }
      return response.json();
    },
    listen: raw.listen
  };

  return server;
}

async function saveByokSeedanceConfig(server: TestConsoleServerHandle): Promise<void> {
  await server.fetchJson("/api/model-configs/volcengine-seedance", {
    method: "PUT",
    body: JSON.stringify({
      apiKey: "byok-seedance-test-key",
      vendor: "volcengine",
      baseUrl: "https://ark.cn-beijing.volces.com",
      model: "seedance-2.0-fast"
    })
  });
}

async function importDefaultWorkspaceFiles(dataDir: string, workspaceId: string): Promise<void> {
  if (workspaceId !== "default") {
    return;
  }
  const handle = openDatabase({ dataDir, env: process.env });
  try {
    runMigrations(handle);
    await importFileWorkspace({
      handle,
      dataDir,
      sourceWorkspaceId: "default",
      adminEmail: "console-test@example.com"
    });
  } finally {
    closeDatabase(handle);
  }
}

function isAuthOrPublicPath(path: string): boolean {
  const pathname = path.startsWith("http") ? new URL(path).pathname : path.split("?")[0] ?? path;
  return pathname === "/" ||
    pathname === "/app" ||
    pathname === "/console" ||
    pathname === "/favicon.svg" ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/static/") ||
    pathname === "/api/health" ||
    pathname === "/api/payments/stripe/webhook" ||
    pathname === "/api/payments/infini/webhook" ||
    pathname.startsWith("/api/auth/");
}

function withCookie(init: RequestInit, cookie: string): RequestInit {
  const headers = new Headers(init.headers);
  if (!headers.has("cookie")) {
    headers.set("cookie", cookie);
  }
  return {
    ...init,
    headers
  };
}

function stripeTestSignature(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function infiniWebhookHeaders(payload: string, secret: string, eventId: string, timestamp = Math.floor(Date.now() / 1000)): HeadersInit {
  return {
    "content-type": "application/json",
    "x-webhook-timestamp": String(timestamp),
    "x-webhook-event-id": eventId,
    "x-webhook-signature": createHmac("sha256", secret)
      .update(`${timestamp}.${eventId}.${payload}`)
      .digest("hex")
  };
}

async function registerConsoleUser(
  dataDir: string,
  server: ConsoleServerHandle,
  email: string
): Promise<{ cookie: string; workspaceId: string }> {
  const response = await server.fetch("/api/auth/enter", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: "correct horse battery staple"
    })
  });
  if (response.status === 202) {
    const otp = await latestEmailOtp(dataDir, email, "email-verification");
    const verified = await server.fetch("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({
        email,
        otp
      })
    });
    expect(verified.status).toBe(200);
    const body = await verified.json() as { workspace: { id: string } };
    return {
      cookie: verified.headers.get("set-cookie") ?? "",
      workspaceId: body.workspace.id
    };
  }
  expect(response.status).toBe(200);
  const body = await response.json() as { workspace: { id: string } };
  return {
    cookie: response.headers.get("set-cookie") ?? "",
    workspaceId: body.workspace.id
  };
}

async function latestEmailOtp(dataDir: string, email: string, type: "email-verification" | "forget-password"): Promise<string> {
  const outboxPath = join(dataDir, "system", "auth-email-outbox.jsonl");
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const raw = await readFile(outboxPath, "utf8");
      const rows = raw
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { email: string; type: string; otp: string });
      const found = rows
        .reverse()
        .find((row) => row.email === email && row.type === type);
      if (found) {
        return found.otp;
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
    }
    await sleep(50);
  }
  throw new Error(`No OTP found for ${email} (${type})`);
}

async function readStoredModelCredential(root: string, provider: string): Promise<{
  key_preview: string;
  encrypted_key: string;
  base_url: string | null;
  model: string | null;
  api_mode: string | null;
}> {
  const handle = openDatabase({ dataDir: testDataDir(root), env: process.env });
  try {
    return handle.sqlite.prepare(`
      SELECT
        credential.key_preview,
        credential.encrypted_key,
        credential.base_url,
        variant.model,
        credential.api_mode
      FROM model_variants AS variant
      INNER JOIN model_credentials AS credential
        ON credential.workspace_id = variant.workspace_id
        AND credential.credential_id = variant.credential_id
      WHERE variant.provider_id = ?
      ORDER BY credential.updated_at DESC, credential.created_at DESC, variant.variant_order ASC, variant.updated_at DESC
      LIMIT 1
    `).get(provider) as {
      key_preview: string;
      encrypted_key: string;
      base_url: string | null;
      model: string | null;
      api_mode: string | null;
    };
  } finally {
    closeDatabase(handle);
  }
}

async function readStoredTextModelRows(root: string): Promise<{
  credentials: Array<{
    credential_id: string;
    encrypted_key: string;
    key_preview: string;
    name: string | null;
    vendor: string | null;
    base_url: string | null;
    api_mode: string | null;
  }>;
  variants: Array<{
    credential_id: string;
    config_id: string;
    label: string;
    model: string;
    priority: number;
  }>;
}> {
  const handle = openDatabase({ dataDir: testDataDir(root), env: process.env });
  try {
    const credentials = handle.sqlite.prepare(`
      SELECT credential_id, encrypted_key, key_preview, name, vendor, base_url, api_mode
      FROM model_credentials
      WHERE provider_id = 'openai-compatible-text'
      ORDER BY updated_at DESC, created_at DESC
    `).all() as Array<{
      credential_id: string;
      encrypted_key: string;
      key_preview: string;
      name: string | null;
      vendor: string | null;
      base_url: string | null;
      api_mode: string | null;
    }>;
    const variants = handle.sqlite.prepare(`
      SELECT credential_id, config_id, label, model, priority
      FROM model_variants
      WHERE provider_id = 'openai-compatible-text'
      ORDER BY updated_at DESC, created_at DESC, variant_order ASC
    `).all() as Array<{
      credential_id: string;
      config_id: string;
      label: string;
      model: string;
      priority: number;
    }>;
    return {
      credentials,
      variants
    };
  } finally {
    closeDatabase(handle);
  }
}

function testProductsDir(root: string): string {
  return join(testDataDir(root), "workspaces", "default", "products");
}

function testJobsDir(root: string): string {
  return join(testDataDir(root), "workspaces", "default", "jobs");
}

function testSettingsDir(root: string): string {
  return join(testDataDir(root), "workspaces", "default", "settings");
}

function testSystemDir(root: string): string {
  return join(testDataDir(root), "system");
}

function testProductPath(productsDir: string, id: string): string {
  return join(productsDir, id, "product.json");
}

function productAssetPath(productFilePath: string, fileName: string): string {
  return join(productFilePath, "..", fileName);
}

function jobFilePath(jobsDir: string, jobId: string): string {
  return join(jobsDir, jobId, "job.json");
}

async function waitForJobStatus(
  server: TestConsoleServerHandle,
  jobId: string,
  status: string
): Promise<Record<string, unknown>> {
  let latest: Record<string, unknown> = {};
  for (let attempt = 0; attempt < 50; attempt += 1) {
    latest = await server.fetchJson(`/api/video-jobs/${jobId}`);
    if ((latest.job as { status?: string } | undefined)?.status === status) {
      return latest;
    }
    await sleep(10);
  }
  throw new Error(`Timed out waiting for video job ${jobId} to become ${status}.`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeFileReport(path: string, report: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2), "utf8");
}

async function topUpWalletForPaidVideo(server: TestConsoleServerHandle, amountCny = 100): Promise<void> {
  await creditTestWallet(server, amountCny, "test paid video balance");
}

async function topUpWalletForAiUsage(server: TestConsoleServerHandle, amountCny = 10): Promise<void> {
  await creditTestWallet(server, amountCny, "test AI usage balance");
}

async function creditTestWallet(
  server: TestConsoleServerHandle,
  amountCny: number,
  description: string
): Promise<{ wallet: ReturnType<WalletStore["getSummary"]> }> {
  await server.fetchJson("/api/wallet");
  const handle = openDatabase({ dataDir: server.dataDir, env: process.env });
  try {
    const walletStore = new WalletStore({
      handle,
      workspaceId: server.workspaceId
    });
    return {
      wallet: walletStore.topUp({
        amountCny,
        description
      })
    };
  } finally {
    closeDatabase(handle);
  }
}

async function configurePaidVideoModel(server: TestConsoleServerHandle): Promise<void> {
  await server.fetchJson("/api/model-configs/volcengine-seedance", {
    method: "PUT",
    body: JSON.stringify({
      apiKey: "paid-key",
      baseUrl: "https://ark.example.test",
      model: "doubao-seedance-2-0-fast-260128"
    })
  });
  await topUpWalletForPaidVideo(server);
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function liveFxResponse(url: string | URL | Request): Response | undefined {
  const text = String(url);
  if (text === "https://api.frankfurter.dev/v2/rates?base=CNY&quotes=HKD") {
    return jsonResponse([{
      date: "2026-07-03",
      base: "CNY",
      quote: "HKD",
      rate: 1
    }]);
  }
  if (text === "https://api.frankfurter.dev/v2/rates?base=CNY&quotes=USD") {
    return jsonResponse([{
      date: "2026-07-03",
      base: "CNY",
      quote: "USD",
      rate: 0.14737
    }]);
  }
  return undefined;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
