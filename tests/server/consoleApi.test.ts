import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createConsoleServer as createRawConsoleServer, type ConsoleServerHandle, type ConsoleServerOptions } from "../../src/server/consoleServer.js";
import { closeDatabase, openDatabase } from "../../src/server/db/client.js";
import { encryptSecret } from "../../src/server/db/crypto.js";
import { importFileWorkspace } from "../../src/server/db/importFileWorkspace.js";
import { runMigrations } from "../../src/server/db/migrate.js";

let tempDirs: string[] = [];

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

  it("stores system settings, sessions, provider keys, and audit logs under HAITU_DATA_DIR and rejects outside media", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-console-system-data-"));
    const dataDir = join(root, "data");
    tempDirs.push(root);
    const server = createConsoleServer({ rootDir: root, dataDir, autoStartSavedJobs: false });

    await server.fetchJson("/api/provider-keys/openai-compatible-text", {
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

    await expect(readFile(join(dataDir, "system", "console-settings.json"), "utf8")).resolves.toContain("詳しく見る");
    await expect(readFile(join(dataDir, "system", "audit-log.jsonl"), "utf8")).resolves.toContain("provider_key.saved");
    await expect(readFile(join(dataDir, "workspaces", "default", "settings", "provider-keys.json"), "utf8")).rejects.toThrow();
    const handle = openDatabase({ dataDir, env: process.env });
    try {
      const sessions = handle.sqlite.prepare("SELECT COUNT(*) AS count FROM auth_sessions").get() as { count: number };
      const keys = handle.sqlite.prepare("SELECT key_preview, encrypted_key FROM provider_keys").all() as Array<{ key_preview: string; encrypted_key: string }>;
      expect(sessions.count).toBeGreaterThanOrEqual(1);
      expect(keys[0]).toEqual(expect.objectContaining({
        key_preview: "text...3456"
      }));
      expect(keys[0]?.encrypted_key).not.toContain("text-secret-123456");
    } finally {
      closeDatabase(handle);
    }
    await expect(readFile(join(root, "outputs", "provider-keys.json"), "utf8")).rejects.toThrow();
    expect(mediaResponse.status).toBe(200);
    expect(outsideMedia.status).toBe(403);
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
    const outputsDir = join(dataDir, "workspaces", "default", "jobs");
    const videoPath = join(outputsDir, "wallet-final", "final", "wallet.final.mp4");
    await mkdir(join(videoPath, ".."), { recursive: true });
    await writeFile(videoPath, Buffer.from("final-video"));
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
    await server.fetchJson("/api/provider-keys/volcengine-seedance", {
      method: "PUT",
      body: JSON.stringify({ apiKey: "sk-super-secret" })
    });
    await server.fetchJson("/api/provider-keys/volcengine-seedance", {
      method: "DELETE"
    });
    await server.fetchJson("/api/video-assets", {
      method: "DELETE",
      body: JSON.stringify({ path: videoPath, confirm: true })
    });

    const audit = await server.fetchJson("/api/audit-log");
    const events = audit.events.map((event: { action: string }) => event.action);
    const auditFile = await readFile(join(dataDir, "system", "audit-log.jsonl"), "utf8");

    expect(auditEntry.status).toBe(202);
    expect(events).toEqual(expect.arrayContaining([
      "auth.enter_failed",
      "auth.enter",
      "auth.email_verified",
      "provider_key.saved",
      "provider_key.deleted",
      "video_asset.deleted"
    ]));
    expect(audit.events[0]).toEqual(expect.objectContaining({
      id: expect.any(String),
      at: expect.any(String),
      actor: "admin",
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
    const server = createConsoleServer({ rootDir: root, consoleDistDir });

    const htmlResponse = await server.fetch("/");
    const jsResponse = await server.fetch("/assets/index-test.js");
    const html = await htmlResponse.text();
    const js = await jsResponse.text();
    const appSource = await readFile(join(process.cwd(), "src", "client", "App.tsx"), "utf8");
    const stylesSource = await readFile(join(process.cwd(), "src", "client", "styles.css"), "utf8");
    const staticConsoleHtml = await readFile(join(process.cwd(), "src", "server", "static", "console.html"), "utf8");
    const staticConsoleJs = await readFile(join(process.cwd(), "src", "server", "static", "console.js"), "utf8");
    const viteConfig = await readFile(join(process.cwd(), "vite.config.ts"), "utf8");

    expect(htmlResponse.status).toBe(200);
    expect(html).toContain('id="root"');
    expect(jsResponse.status).toBe(200);
    expect(js).toContain("react shell");
    expect(appSource).toContain("from \"lucide-react\"");
    expect(appSource).toContain("echarts-for-react");
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
    expect(appSource).toContain("Haitu 账号入口");
    expect(appSource).toContain("登录或创建账号");
    expect(appSource).toContain("邮箱");
    expect(appSource).toContain("密码");
    expect(appSource).toContain("登录 / 创建账号");
    expect(appSource).not.toContain("未注册邮箱会自动创建账号");
    expect(appSource).not.toContain("登录已有账号，或用新邮箱创建账号");
    expect(appSource).toContain("忘记密码");
    expect(appSource).toContain("验证邮箱并进入");
    expect(appSource).toContain("发送验证码");
    expect(appSource).toContain("重发验证码");
    expect(appSource).not.toContain("重新发送验证码");
    expect(appSource).toContain("秒后可重新发送");
    expect(appSource).toContain("authOtpCooldownSeconds");
    expect(appSource).toContain("startAuthOtpCooldown");
    expect(appSource).toContain("forgotPasswordOtpSent");
    expect(appSource).toContain("authOtpSendLabel");
    expect(appSource).toContain("onResendVerificationCode");
    expect(appSource).toContain("function AuthOtpField");
    expect(appSource.split("<AuthOtpField")).toHaveLength(3);
    expect(appSource).toContain("重置密码");
    expect(appSource).toContain("至少 8 位");
    expect(appSource).not.toContain("至少 12 位");
    const resetPasswordFormSource = appSource.slice(
      appSource.indexOf("onSubmit={onResetPassword}"),
      appSource.indexOf("返回账号入口", appSource.indexOf("onSubmit={onResetPassword}"))
    );
    expect(resetPasswordFormSource.indexOf('label="新密码"')).toBeLessThan(resetPasswordFormSource.indexOf("<AuthOtpField"));
    expect(appSource).not.toContain("验证码已发送到邮箱，请输入后继续。");
    expect(appSource).not.toContain("验证码已重新发送，请查看邮箱。");
    expect(appSource).not.toContain("验证码已发送到邮箱，请输入验证码和新密码。");
    expect(appSource).toContain("密码已重置，请用新密码登录。");
    expect(appSource).not.toContain("onSubmit={onRequestPasswordReset}");
    expect(appSource).toContain("setActiveSection(defaultConsoleSection)");
    expect(appSource).not.toContain("已退出登录");
    expect(appSource).not.toContain("管理员密码");
    expect(appSource).not.toContain("进入控制台");
    expect(appSource).toContain("退出登录");
    expect(appSource).toContain("function AccountMenu");
    expect(appSource).toContain("<AccountMenu");
    expect(appSource).toContain("authSession.user?.email");
    expect(appSource).toContain("账号菜单");
    expect(appSource).toContain("账号");
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
    expect(appSource).toContain("primaryNavItems");
    expect(appSource).toContain("managementNavItems");
    expect(appSource).toContain("sectionSubtitles");
    expect(appSource).toContain("主流程");
    expect(appSource).toContain("管理");
    const primaryNavSource = appSource.slice(appSource.indexOf("const primaryNavItems"), appSource.indexOf("const managementNavItems"));
    const managementNavSource = appSource.slice(appSource.indexOf("const managementNavItems"), appSource.indexOf("const navItems"));
    expect(primaryNavSource).toContain("视频创作");
    expect(primaryNavSource).not.toContain("商品管理");
    expect(primaryNavSource).not.toContain("审核发布");
    expect(primaryNavSource).not.toContain("商品项目");
    expect(primaryNavSource).not.toContain("生成记录");
    expect(managementNavSource).not.toContain("生成记录");
    expect(managementNavSource).toContain("仪表盘");
    expect(managementNavSource).not.toContain("模板管理");
    expect(managementNavSource).toContain("任务记录");
    expect(managementNavSource).not.toContain("成本台账");
    expect(managementNavSource).toContain("API 管理");
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
    expect(appSource).toContain('aria-label="切换模块"');
    expect(appSource).toContain('aria-label={sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}');
    expect(appSource).toContain("sidebarCollapsed");
    expect(appSource).toContain("setSidebarCollapsed");
    expect(appSource).toContain("const floatingTooltipClass");
    expect(appSource).toContain("floatingTooltipClass,");
    expect(appSource).toContain("min-[900px]:grid-cols-[56px_minmax(0,1fr)]");
    expect(appSource).toContain("min-[900px]:grid-cols-[184px_minmax(0,1fr)]");
    expect(appSource).not.toContain("min-[900px]:grid-cols-[72px_minmax(0,1fr)]");
    expect(appSource).not.toContain("min-[900px]:grid-cols-[232px_minmax(0,1fr)]");
    expect(appSource).not.toContain("min-[900px]:grid-cols-[64px_minmax(0,1fr)]");
    expect(appSource).not.toContain("min-[900px]:grid-cols-[196px_minmax(0,1fr)]");
    expect(appSource).toContain("app-sidebar-toggle");
    expect(appSource).toContain("app-sidebar-collapse-edge");
    expect(appSource).toContain("app-sidebar-collapse-thumb");
    expect(appSource).toContain("absolute inset-y-0 right-[-8px]");
    expect(appSource).not.toContain("right-[-17px]");
    expect(appSource).not.toContain("top-5");
    expect(appSource).not.toContain("h-[34px] w-[34px] rounded-full");
    expect(appSource).not.toContain("left-[232px] top-[84px]");
    expect(appSource).not.toContain("mx-auto h-10 w-10 rounded-full");
    expect(appSource).toContain('sidebarCollapsed ? "w-[56px]" : "w-[184px]"');
    expect(appSource).toContain("h-[72px] items-center border-b");
    expect(appSource).not.toContain("h-[84px] items-center border-b");
    expect(appSource).toContain('sidebarCollapsed ? "justify-center px-2" : "gap-2.5 px-3.5"');
    expect(appSource).toContain('sidebarCollapsed ? "px-1.5" : "px-2.5"');
    expect(appSource).toContain('sidebarCollapsed ? "overflow-visible" : "overflow-y-auto"');
    expect(appSource).toContain("app-sidebar-nav-tooltip");
    expect(appSource).toContain("group-hover/sidebar-nav-item:opacity-100");
    expect(appSource).toContain("title={sidebarCollapsed ? label : undefined}");
    expect(appSource).toContain("grid min-h-9 w-full");
    expect(appSource).not.toContain("商品事实、生成预检、成本记录、审核发布和品牌默认值。");
    const appShell = appSource.slice(appSource.indexOf("<main"), appSource.indexOf("function LoginScreen"));
    expect(appShell).not.toContain("mock 免费");
    expect(appShell).not.toContain("付费通道");
    expect(appShell).not.toContain("本地模拟");
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
    expect(appShell).toContain("min-h-[72px]");
    expect(appShell).not.toContain("min-h-[84px]");
    expect(appShell).toContain("px-4 py-3");
    expect(appShell).not.toContain("px-5 py-4");
    expect(appShell).toContain("overflow-y-auto px-4 py-4");
    expect(appShell).not.toContain("overflow-y-auto px-4 py-5");
    expect(appSource).toContain("contentScrollerRef");
    expect(appSource).toContain("replaceState");
    expect(appSource).toContain("aria-current");
    expect(appSource).toContain("商品库");
    expect(appSource).toContain("product-library-shell");
    expect(appSource).toContain("product-library-list");
    expect(appSource).toContain("ProductLibraryDialog");
    expect(appSource).toContain("关闭弹窗");
    expect(appSource).toContain("添加商品");
    expect(appSource).toContain("粘贴导入");
    expect(appSource).toContain("创作视频");
    expect(appSource).toContain("创作商品");
    expect(appSource).toContain("新商品");
    expect(appSource).not.toContain("开始创作");
    expect(appSource).not.toContain("用此商品创作视频");
    expect(appSource).toContain("粘贴商品信息");
    expect(appSource).toContain("从店小秘、1688、商品页复制整段资料");
    expect(appSource).toContain("整理后的商品资料");
    expect(appSource).toContain("资料是否够用");
    expect(appSource).toContain("可生成视频");
    expect(appSource).toContain("资料待补");
    expect(appSource).toContain("缺失信息");
    expect(appSource).toContain("不可用卖点");
    expect(appSource).toContain("quality");
    expect(appSource).toContain("可以继续手动编辑，保存时会使用修改后的内容。");
    expect(appSource).not.toContain("检查结果没问题后保存到商品库。");
    ["商品资料草稿", "资料完整度", "拦截宣称", "禁用/未确认宣称", "手动微调", "禁止/未确认宣称", "生成资料草稿"].forEach((label) => {
      expect(appSource).not.toContain(label);
    });
    expect(appSource).toContain("粘贴商品信息");
    expect(appSource).toContain("AI 整理并保存");
    expect(appSource).toContain("ensureTextModelConfigured");
    expect(appSource).toContain("ensureImageModelConfigured");
    expect(appSource).toContain("ConsoleToast");
    expect(appSource).toContain("consoleToast={consoleToast}");
    expect(appSource).toContain("showConsoleToast");
    expect(appSource).toContain("setConsoleToast(undefined)");
    expect(appSource).toContain("操作提示");
    expect(appSource).toContain("请先配置文本模型，再使用 AI 整理或生成分镜。");
    expect(appSource).toContain("请先配置图片模型，再生成参考图。");
    expect(appSource).not.toContain("openApiManagementWithMessage");
    expect(appSource).not.toContain("ModelConfigNotice");
    expect(appSource).not.toContain("ConsoleStatusNotice");
    const textModelGuard = appSource.slice(appSource.indexOf("function ensureTextModelConfigured"), appSource.indexOf("function ensureImageModelConfigured"));
    const imageModelGuard = appSource.slice(appSource.indexOf("function ensureImageModelConfigured"), appSource.indexOf("useEffect(() =>"));
    expect(textModelGuard).not.toContain('setActiveSection("settings")');
    expect(imageModelGuard).not.toContain('setActiveSection("settings")');
    expect(appSource).toContain("importProductsBatch");
    expect(appSource).toContain("/api/products/import-batch");
    expect(appSource).toContain("importProductAndSave");
    expect(appSource).toContain("/api/products/import-ai-preview");
    expect(appSource).toContain("手动填写");
    expect(appSource).toContain("importNotes");
    expect(appSource).toContain("整理提示");
    expect(appSource).toContain("/api/products/import-preview");
    expect(appSource).toContain("ProductDraftForm");
    expect(appSource).toContain("loadProductIntoDraft");
    expect(appSource).toContain("openProductStudio");
    expect(appSource).toContain("onCreateVideo");
    expect(appSource).not.toContain("onOpenAdvancedVideoParams");
    expect(appSource).toContain("ProductCreationWorkspace");
    expect(appSource).toContain("ProductCreationComposer");
    expect(appSource).toContain("video-creation-frame");
    expect(appSource).toContain("product-creation-picker");
    expect(appSource).toContain("product-creation-product-menu");
    expect(appSource).toContain("product-control-bar");
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
    expect(appSource).toContain("商品库");
    expect(appSource).toContain("添加商品");
    expect(appSource).toContain("创作视频");
    expect(appSource).not.toContain('case "products"');
    expect(appSource).not.toContain('aria-label="商品管理"');
    const productLibraryHome = appSource.slice(appSource.indexOf("function ProductLibraryHome"), appSource.indexOf("function ProductLibraryDialog"));
    expect(productLibraryHome).toContain("product-library-toolbar");
    expect(productLibraryHome).toContain("商品资料");
    expect(productLibraryHome).toContain("productLibraryStatus(product)");
    expect(productLibraryHome).not.toContain("可创作");
    expect(productLibraryHome).not.toContain("待补图");
    expect(productLibraryHome).not.toContain("资料完整");
    expect(productLibraryHome).not.toContain("参考图 {referenceImageCount} 张");
    const productLibraryStatusSource = appSource.slice(appSource.indexOf("function productLibraryStatus"), appSource.indexOf("function videoAssetKindTone"));
    expect(productLibraryStatusSource).toContain("可生成视频");
    expect(productLibraryStatusSource).toContain("需补参考图");
    expect(productLibraryStatusSource).toContain("资料待补");
    expect(productLibraryStatusSource).toContain("还差");
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
    expect(productLibraryHome).toContain("创作视频");
    expect(productLibraryHome).toContain("编辑");
    expect(productLibraryHome).toContain("删除");
    expect(productLibraryHome).not.toContain('role="button"');
    expect(productLibraryHome).not.toContain("tabIndex={0}");
    expect(productLibraryHome).not.toContain("event.key === \"Enter\"");
    expect(productLibraryHome).toContain("product-library-row-action");
    expect(productLibraryHome).not.toContain("ChevronRight size={15}");
    expect(productLibraryHome).not.toContain("buttonVariants({ size: \"sm\", variant: \"primary\" })");
    expect(productLibraryHome).not.toContain("event.stopPropagation()");
    expect(productLibraryHome).not.toContain("cursor-pointer");
    expect(productLibraryHome).toContain("hover:bg-[#f8fbff]");
    expect(productLibraryHome).not.toContain("onView(product.sku)");
    expect(productLibraryHome).toContain("添加商品");
    expect(productLibraryHome).toContain("openProductDialog");
    expect(productLibraryHome).toContain('setDialogMode("import")');
    expect(productLibraryHome).not.toContain("导入商品");
    expect(productLibraryHome).not.toContain("新增商品");
    expect(productLibraryHome).not.toContain("openImportDialog");
    expect(productLibraryHome).not.toContain("openManualDialog");
    expect(productLibraryHome).not.toContain('setDialogMode("manual")');
    const productLibraryDialog = appSource.slice(appSource.indexOf("function ProductLibraryDialog"), appSource.indexOf("function ProductImportResultPreview"));
    expect(productLibraryDialog).toContain("AI 整理并保存");
    expect(appSource).toContain('type ProductLibraryDialogMode = ProductEditorMode | "edit" | undefined;');
    expect(appSource).toContain('setProductLibraryDialogMode("edit")');
    expect(productLibraryDialog).toContain('const isEditMode = mode === "edit";');
    expect(productLibraryDialog).toContain('{isEditMode ? "编辑当前商品" : "添加商品"}');
    expect(productLibraryDialog).toContain('!isEditMode ? (');
    expect(productLibraryDialog).toContain('{!isEditMode && activeMode === "import" ? (');
    expect(productLibraryDialog).toContain('submitLabel={isEditMode ? "保存修改" : "保存商品"}');
    expect(productLibraryDialog).not.toContain("预览整理结果");
    expect(productLibraryDialog).not.toContain("批量保存");
    expect(productLibraryDialog.split("AI 整理并保存")).toHaveLength(2);
    const productImportResultPreview = appSource.slice(appSource.indexOf("function ProductImportResultPreview"), appSource.indexOf("function ProductImportQualityPanel"));
    expect(productImportResultPreview).toContain("可以继续手动编辑，保存时会使用修改后的内容。");
    expect(productImportResultPreview).not.toContain("检查结果没问题后保存到商品库。");
    expect(productImportResultPreview).not.toContain("确认后可直接保存");
    expect(productImportResultPreview).not.toContain('label="SKU"');
    expect(productLibraryDialog).not.toContain("逐项填写 SKU");
    expect(productLibraryDialog).not.toContain('<Field label="SKU">');
    const productDraftFormSource = appSource.slice(appSource.indexOf("function ProductDraftForm"), appSource.indexOf("function DashboardStatsPanel"));
    expect(productDraftFormSource).toContain("ProductDraftSection");
    expect(productDraftFormSource).toContain("ProductDraftTextareaGroup");
    expect(productDraftFormSource).toContain("ProductDraftReferencePaths");
    expect(productDraftFormSource).toContain("基础信息");
    expect(productDraftFormSource).toContain("创作事实");
    expect(productDraftFormSource).toContain("参考图路径");
    expect(productDraftFormSource).toContain('<form className="grid gap-5"');
    expect(productDraftFormSource).not.toContain('<form className="grid gap-3"');
    expect(appSource).toContain("internalProductIdFromTitle");
    expect(appSource).toContain("sku: draft.sku.trim() || internalProductIdFromTitle(draft.title_ja)");
    expect(appSource).not.toContain("商品 SKU:");
    expect(appSource).not.toContain("`SKU: ${product.sku}`");
    expect(appSource).not.toContain("productsResponse.products[0]");
    expect(appSource).not.toContain("ProductStudioProductList");
    expect(appSource).not.toContain("product-studio-product-list");
    expect(appSource).not.toContain("useProductForVideo");
    expect(appSource).not.toContain("onUseForVideo");
    expect(appSource).not.toContain("用此商品做视频");
    expect(appSource).toContain("视频创作");
    expect(appSource).not.toContain('aria-label="商品管理"');
    expect(appSource).toContain("历史记录");
    expect(appSource).not.toContain("高级新建任务");
    const videoCase = appSource.slice(appSource.indexOf('case "video"'), appSource.indexOf('case "ledger"'));
    expect(videoCase).toContain("<ProductCreationWorkspace");
    expect(videoCase).not.toContain("<VideoJobsPanel");
    expect(videoCase).not.toContain("<ReportsPanel");
    expect(videoCase).not.toContain("手动生成参数");
    expect(videoCase).not.toContain("<details");
    expect(videoCase).not.toContain("<StorageBackupPanel");
    expect(videoCase).not.toContain("<AuditLogPanel");
    expect(videoCase).not.toContain("<VideoAssetsPanel");
    const creationWorkspaceSource = appSource.slice(appSource.indexOf("function ProductCreationWorkspace"), appSource.indexOf("function ProductLibraryHome"));
    const creationComposerSource = appSource.slice(appSource.indexOf("function ProductCreationComposer"), appSource.indexOf("function ProductLibraryHome"));
    const videoModelSource = appSource.slice(appSource.indexOf("const videoModelOptions"), appSource.indexOf("const modelConfigPresets"));
    const productPickerSource = appSource.slice(appSource.indexOf("function ProductCreationProductPicker"), appSource.indexOf("function ReferenceImageFigure"));
    const storyboardPanelSource = appSource.slice(appSource.indexOf("function StoryboardComposerPanel"), appSource.indexOf("function VideoHistoryPanel"));
    const videoHistorySource = appSource.slice(appSource.indexOf("function VideoHistoryPanel"), appSource.indexOf("function productDraftToProductDetail"));
    const buildLatestCreativeJobsSource = appSource.slice(
      appSource.indexOf("function buildLatestCreativeJobs"),
      appSource.indexOf("function videoJobToCreativeVersion")
    );
    const queueProductVideoJobsSource = appSource.slice(
      appSource.indexOf("async function queueProductVideoJobs"),
      appSource.indexOf("async function importProductPreview")
    );
    expect(videoCase).toContain("onOrganizeProductPackage={organizeProductPackage}");
    expect(videoCase).toContain("onStartNewProduct={startNewVideoProduct}");
    expect(videoCase).toContain("onDeleteProduct={deleteProduct}");
    expect(videoCase).toContain("pendingImageFiles={pendingImageFiles}");
    expect(videoCase).toContain("setPendingImageFiles={setPendingImageFiles}");
    expect(videoCase).toContain("ledgerJobs={ledger?.jobs ?? []}");
    expect(creationWorkspaceSource).toContain("<ProductCreationComposer");
    expect(creationWorkspaceSource).toContain("selectedProductStoryboardHistory");
    expect(creationWorkspaceSource).toContain("ledgerJobs: LedgerJob[];");
    expect(creationWorkspaceSource).toContain("pendingImageFiles: File[];");
    expect(creationWorkspaceSource).toContain("setPendingImageFiles: Dispatch<SetStateAction<File[]>>;");
    expect(creationWorkspaceSource).toContain("pendingImageFiles={pendingImageFiles}");
    expect(creationWorkspaceSource).toContain("setPendingImageFiles={setPendingImageFiles}");
    expect(creationWorkspaceSource).toContain("mergeLedgerJobs");
    expect(creationWorkspaceSource).not.toContain("<ProductStudio");
    expect(creationWorkspaceSource).not.toContain("ensureVideoProductSelection");
    expect(appSource).toContain("useState<VideoModelChoice>(defaultVideoModelChoice)");
    expect(appSource).toContain("useState(defaultVideoDurationSeconds)");
    expect(appSource).toContain('const defaultVideoTemplate: TemplateName = "scene";');
    expect(appSource).toContain("useState<TemplateName>(defaultVideoTemplate)");
    expect(appSource).toContain("setTemplate(defaultVideoTemplate)");
    expect(appSource).not.toContain("setTemplate(nextSettings.enabledTemplates.includes(nextSettings.defaultTemplate)");
    expect(appSource).toContain('type StoryboardDraftSource = "default" | "ai" | "manual";');
    expect(appSource).toContain('useState<StoryboardDraftSource>("default")');
    expect(appSource).toContain('setStoryboardDraftSource("ai")');
    expect(appSource).toContain('setStoryboardDraftSource("manual")');
    expect(appSource).toContain("defaultStoryboardDraftForTemplate");
    expect(appSource).toContain("defaultStoryboardDraft(template, duration)");
    expect(appSource).toContain("用户已手动编辑分镜时不覆盖");
    expect(appSource).toContain("storyboardDraftIsGuidance={!storyboardDraftTouched}");
    expect(creationComposerSource).toContain("product-creation-canvas");
    expect(creationComposerSource).toContain("product-control-bar");
    expect(creationComposerSource).toContain("video-parameter-row grid");
    expect(creationComposerSource).toContain("min-[1280px]:grid-cols-[repeat(6,minmax(132px,1fr))]");
    expect(creationComposerSource).toContain("video-generate-bar");
    expect(appSource).toContain("function productGenerationReadiness");
    expect(appSource).toContain("function productFactsStatusLabel");
    expect(appSource).toContain("function storyboardStatusLabel");
    expect(creationComposerSource).toContain("const generationReadiness = productGenerationReadiness({");
    expect(creationComposerSource).toContain("const generateVideoDisabled = packingDisabled || !generationReadiness.ready");
    expect(creationComposerSource).toContain("const storyboardProductReady = Boolean(selectedProduct || importText.trim())");
    expect(creationComposerSource).toContain("async function handleGenerateStoryboardDraft()");
    expect(creationComposerSource).toContain("const productForStoryboard = await onFlushProductFactsAutoSave() ?? selectedProduct ?? await handleOrganizeProductPackage({ silentSuccess: true })");
    expect(creationComposerSource).toContain("if (!productForStoryboard) return;");
    expect(creationComposerSource).toContain("await onGenerateStoryboardDraft(productForStoryboard)");
    expect(creationComposerSource).toContain("const generateVideoButtonClass = cn(");
    expect(creationComposerSource).toContain('generateVideoDisabled && "border-[#d6dee9] bg-[#edf2f7] text-[#93a0b3] shadow-none hover:brightness-100 disabled:opacity-100"');
    expect(creationComposerSource).toContain('const generationReadinessMessageClass = cn(');
    expect(creationComposerSource).toContain("min-h-12 w-full max-w-[360px]");
    expect(creationComposerSource).toContain("justify-self-center");
    expect(creationComposerSource).not.toContain("rounded-[14px] border px-4");
    expect(creationComposerSource).toContain("if (!generationReadiness.ready) {");
    expect(creationComposerSource).toContain("onToast(generationReadiness.label);");
    expect(creationComposerSource).toContain("if (packingDisabled) return;");
    expect(creationComposerSource).toContain("disabled={generateVideoDisabled}");
    expect(creationComposerSource).toContain("aria-disabled={generateVideoDisabled}");
    expect(creationComposerSource).toContain('variant={generateVideoDisabled ? "default" : "primary"}');
    expect(creationComposerSource).toContain("className={generateVideoButtonClass}");
    expect(creationComposerSource).toContain("onClick={generateVideoDisabled ? undefined : () => void handleGenerateVideo()}");
    expect(creationComposerSource).not.toContain('className="min-h-12 w-full justify-center rounded-[14px] text-sm disabled:opacity-100"');
    expect(creationComposerSource).toContain("title={generationReadiness.ready ? generateVideoButtonLabel : generationReadiness.label}");
    expect(creationComposerSource).toContain("generation-readiness-message");
    expect(creationComposerSource).toContain("text-[var(--danger)]");
    expect(creationComposerSource).toContain('generationReadiness.ready ? "text-[#6c7890]" : "text-[var(--danger)]"');
    expect(creationComposerSource).toContain("{generationReadiness.label}");
    expect(creationComposerSource).toContain("productFactsStatusLabel({");
    expect(creationComposerSource).toContain("storyboardStatusLabel(storyboardDraftSource)");
    expect(appSource).toContain('return "原始资料"');
    expect(appSource).toContain('return "已整理资料包"');
    expect(appSource).toContain('return "默认分镜"');
    expect(appSource).toContain('return "AI 生成分镜"');
    expect(appSource).toContain('return "手动分镜"');
    expect(appSource).toContain('return { ready: true, label: "将先整理资料包，再生成视频。" };');
    expect(creationComposerSource).toContain("generateVideoButtonLabel");
    expect(creationComposerSource).toContain('versionCount > 1 ? `生成 ${versionCount} 个视频` : "生成视频"');
    expect(creationComposerSource).toContain("videoModelOptions");
    expect(videoModelSource).toContain("seednice-2-fast");
    expect(videoModelSource).toContain("seednice-2");
    expect(videoModelSource).toContain("seednice2.0 fast");
    expect(videoModelSource).toContain("seednice2.0");
    expect(videoModelSource).toContain("const defaultVideoDurationSeconds = 10");
    expect(videoModelSource).toContain('const defaultVideoModelChoice: VideoModelChoice = "seednice-2-fast"');
    expect(creationComposerSource).toContain("videoModelChoice");
    expect(creationComposerSource).toContain("provider: videoModelConfig.provider");
    expect(creationComposerSource).toContain("providerModel: videoModelConfig.model");
    expect(creationComposerSource).toContain("confirmPaid: videoModelConfig.confirmPaid");
    expect(creationComposerSource).not.toContain("已填分镜");
    expect(creationComposerSource).not.toContain("自动分镜");
    expect(creationComposerSource).not.toContain("允许使用付费模型生成当前商品视频");
    expect(creationComposerSource).not.toContain("creation-parameter-dock");
    expect(creationComposerSource).not.toContain("product-creation-canvas overflow-visible rounded-[22px] border");
    expect(creationComposerSource).not.toContain("video-creation-frame grid gap-4 overflow-visible rounded-[24px] border border-[#dbe4f0] bg-[#fbfdff] p-4");
    expect(creationComposerSource).not.toContain("product-creation-canvas overflow-visible rounded-[20px] bg-white");
    expect(creationComposerSource).toContain("product-reference-inline");
    expect(creationComposerSource).toContain("acceptReferenceFiles");
    expect(creationComposerSource).toContain("isReferenceImageFile");
    expect(creationComposerSource).toContain("onDrop=");
    expect(creationComposerSource).toContain("onPaste=");
    expect(creationComposerSource).toContain("clipboardData.files");
    expect(creationComposerSource).toContain("event.dataTransfer.files");
    expect(creationComposerSource).toContain("dragOver");
    expect(creationComposerSource).toContain("拖拽或粘贴图片");
    expect(creationComposerSource).toContain("pendingReferenceImageStatuses");
    expect(creationComposerSource).toContain("URL.createObjectURL");
    expect(creationComposerSource).toContain("URL.revokeObjectURL");
    expect(creationComposerSource).toContain('alt={`${fileName} preview`}');
    expect(creationComposerSource).toContain("待上传");
    expect(creationComposerSource).toContain("previewableReferenceImages");
    expect(creationComposerSource).toContain("onPendingPreview");
    expect(creationComposerSource).toContain("onPendingPreview(index)");
    expect(creationComposerSource).toContain('title="查看待上传图片"');
    expect(creationComposerSource).toContain("clipboardReferenceFiles");
    expect(creationComposerSource).toContain("handleProductFactsPaste");
    expect(creationComposerSource).toContain("event.stopPropagation()");
    expect(creationComposerSource).toContain("event.preventDefault()");
    expect(creationComposerSource).not.toContain('event.clipboardData.getData("text/plain")');
    expect(creationComposerSource).toContain("onPaste={handleProductFactsPaste}");
    expect(creationComposerSource).toContain("storyboard-side-panel");
    expect(storyboardPanelSource).toContain("storyboardDraftIsGuidance");
    expect(storyboardPanelSource).toContain("productReady: boolean");
    expect(storyboardPanelSource).toContain("disabled={isGeneratingStoryboard || !productReady}");
    expect(storyboardPanelSource).toContain("text-[#9aa7ba]");
    expect(storyboardPanelSource).toContain("text-[#172033]");
    expect(creationComposerSource).toContain("product-facts-editor");
    expect(creationComposerSource).toContain("product-facts-actions");
    expect(creationComposerSource).toContain("product-facts-body");
    expect(creationComposerSource).toContain("productFactsBodyRef");
    expect(creationComposerSource).toContain("productFactsBodyRef.current.scrollTop = 0");
    expect(creationComposerSource).toContain("Math.max(8, Math.min(15");
    expect(creationComposerSource).toContain("grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]");
    expect(creationComposerSource).toContain("product-facts-body h-full min-h-0");
    expect(creationComposerSource).not.toContain("submitHint");
    expect(creationComposerSource).not.toContain("{submitHint ? (");
    expect(creationComposerSource).not.toContain("{submitHint}");
    expect(creationComposerSource).not.toContain('<div className="min-h-5 truncate text-xs font-bold text-[var(--accent)]">{submitHint}</div>');
    expect(creationComposerSource).toContain('onToast("资料包已整理。", "ok")');
    expect(creationComposerSource).toContain('onToast("已加入历史记录，生成中可删除取消，完成后可预览和下载。", "ok")');
    expect(creationComposerSource).toContain("disabled:opacity-100");
    expect(creationComposerSource).not.toContain("productPackageButtonLabel");
    expect(creationComposerSource).not.toContain('"保存资料包"');
    expect(creationComposerSource).toContain('"AI 整理资料包"');
    expect(creationComposerSource).not.toContain("创建生成任务中");
    expect(creationComposerSource).not.toContain("product-facts-body h-full min-h-[520px]");
    expect(creationComposerSource).not.toContain("max-h-[312px]");
    expect(creationComposerSource).not.toContain("min-h-[350px] resize-y border-0");
    expect(creationComposerSource).not.toContain("max-h-[340px]");
    expect(creationComposerSource).not.toContain("grid min-h-[430px]");
    expect(creationComposerSource).toContain("grid items-stretch gap-0");
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
    expect(creationComposerSource).toContain("商品资料");
    expect(creationComposerSource).toContain("添加图片");
    expect(creationComposerSource).toContain("onPreviewReferenceImage");
    expect(creationComposerSource).toContain("onDeleteReferenceImage");
    expect(creationComposerSource).toContain("AI 整理资料包");
    expect(creationComposerSource).toContain('isPacking ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Package size={13} />');
    expect(creationComposerSource).toContain('{isPacking ? "整理中" : "AI 整理资料包"}');
    expect(creationComposerSource).toContain("productAutoSaveStatus");
    expect(creationComposerSource).toContain("productAutoSaveStatusLabel(productAutoSaveStatus)");
    expect(appSource).toContain('type ProductAutoSaveStatus = "idle" | "dirty" | "saving" | "saved" | "failed";');
    expect(appSource).toContain("const productAutoSaveTimerRef = useRef<number | undefined>(undefined);");
    expect(appSource).toContain("async function autoSaveProductFacts");
    expect(appSource).toContain("async function flushProductFactsAutoSave");
    expect(appSource).toContain("scheduleProductFactsAutoSave");
    expect(appSource).toContain('productComposerSourceRef.current !== "structured"');
    expect(appSource).toContain("onFlushProductFactsAutoSave={flushProductFactsAutoSave}");
    expect(creationComposerSource).toContain("onFlushProductFactsAutoSave");
    expect(creationComposerSource).toContain("await onFlushProductFactsAutoSave()");
    expect(storyboardPanelSource).toContain('isGeneratingStoryboard ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Sparkles size={15} />');
    expect(storyboardPanelSource).toContain('{isGeneratingStoryboard ? "生成中" : "AI 生成分镜"}');
    expect(creationComposerSource).toContain("placeholder=\"\"");
    expect(creationComposerSource).not.toContain("整理资料并生成视频");
    expect(creationComposerSource).toContain("视频风格");
    expect(creationComposerSource).toContain("视频时长");
    expect(creationComposerSource).toContain("成片语言");
    expect(creationComposerSource).toContain("生成模型");
    expect(creationComposerSource).toContain("CompactChoiceDropdown");
    expect(appSource).toContain("function productDraftToComposerText");
    expect(creationComposerSource).toContain("handleGenerateVideo");
    expect(creationComposerSource).toContain("await onGenerateVideo(productActionSummary(savedProduct), {");
    expect(creationComposerSource).toContain("provider: videoModelConfig.provider");
    expect(creationComposerSource).toContain("providerModel: videoModelConfig.model");
    expect(creationComposerSource).toContain("confirmPaid: videoModelConfig.confirmPaid");
    expect(creationComposerSource).toContain("DeleteCreativeVersionDialog");
    expect(creationComposerSource).toContain("previewReferenceIndex");
    expect(creationComposerSource).toContain("previewReferenceImages");
    expect(creationComposerSource).not.toContain("InlineProductFactsFields");
    expect(creationComposerSource).not.toContain('Field label="标题"');
    expect(creationComposerSource).not.toContain("<Select");
    expect(creationComposerSource).not.toContain("AI 视频");
    expect(creationComposerSource).not.toContain("AI 图片");
    expect(creationComposerSource).not.toContain("lg:grid-cols-[minmax(220px,.34fr)_minmax(0,1fr)]");
    expect(creationComposerSource).not.toContain("上一步");
    expect(creationComposerSource).not.toContain("下一步");
    expect(productPickerSource).toContain("创作商品");
    expect(productPickerSource).toContain("product-creation-product-menu");
    expect(productPickerSource).toContain("min-h-11");
    expect(productPickerSource).not.toContain("已保存商品");
    expect(productPickerSource).not.toContain("直接填写新商品资料");
    expect(productPickerSource).toContain('aria-haspopup="listbox"');
    expect(productPickerSource).toContain('role="listbox"');
    expect(productPickerSource).toContain("handleProductPickerSelect(NEW_PRODUCT_SELECT_VALUE)");
    expect(productPickerSource).toContain("新商品");
    expect(productPickerSource).toContain("dedupeProductSummaries(products)");
    expect(productPickerSource).not.toContain("+ 新建商品");
    const referenceFigureSource = appSource.slice(appSource.indexOf("function ReferenceImageFigure"), appSource.indexOf("function ReferenceImagePreviewDialog"));
    const referencePreviewSource = appSource.slice(appSource.indexOf("function ReferenceImagePreviewDialog"), appSource.indexOf("function ProductEntryModeButton"));
    expect(referenceFigureSource).toContain("reference-image-actions");
    expect(referenceFigureSource).toContain("group-hover:opacity-100");
    expect(referenceFigureSource).toContain("relative grid grid-cols-[72px_minmax(0,1fr)]");
    expect(referenceFigureSource).not.toContain("grid-cols-[72px_minmax(0,1fr)_auto]");
    expect(referenceFigureSource).toContain("absolute right-2 top-1/2");
    expect(referenceFigureSource).toContain("pointer-events-none");
    expect(referenceFigureSource).toContain("group-hover:pointer-events-auto");
    expect(referencePreviewSource).toContain("onPrevious");
    expect(referencePreviewSource).toContain("onNext");
    expect(referencePreviewSource).toContain("touchStartXRef");
    expect(referencePreviewSource).toContain("ArrowLeft");
    expect(referencePreviewSource).toContain("ArrowRight");
    expect(storyboardPanelSource).toContain("脚本分镜");
    expect(storyboardPanelSource).not.toContain('label="视频分镜"');
    expect(storyboardPanelSource).toContain("grid h-full min-h-[398px] grid-rows-[auto_minmax(0,1fr)_auto]");
    expect(storyboardPanelSource).toContain('className="min-h-0"');
    expect(storyboardPanelSource).toContain("h-full min-h-0 resize-none");
    expect(storyboardPanelSource).toContain("className=\"grid gap-2\"");
    expect(storyboardPanelSource).not.toContain("{hint ? (");
    expect(storyboardPanelSource).not.toContain("min-h-5 truncate text-xs font-bold text-[var(--accent)]");
    expect(storyboardPanelSource).toContain("AI 生成分镜");
    expect(storyboardPanelSource).toContain("分镜历史记录");
    expect(storyboardPanelSource).toContain("storyboard-history-dropdown");
    expect(storyboardPanelSource).toContain("onDeleteStoryboardHistory");
    expect(storyboardPanelSource).toContain("onApplyStoryboardHistory(record)");
    expect(storyboardPanelSource).toContain("onDeleteStoryboardHistory(record.id)");
    expect(storyboardPanelSource).toContain("删除分镜记录");
    expect(storyboardPanelSource).toContain("event.stopPropagation()");
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
    expect(videoHistorySource).toContain("历史记录");
    expect(videoHistorySource).toContain("当前商品生成过的视频都会显示在这里。");
    expect(videoHistorySource).toContain("generation-history-scroll");
    expect(videoHistorySource).toContain("max-h-[360px]");
    expect(videoHistorySource).toContain("overflow-y-auto");
    expect(videoHistorySource).toContain("videoLabel(index)");
    expect(videoHistorySource).toContain("hasPlayableVideo(job)");
    expect(videoHistorySource).toContain("预览视频");
    expect(videoHistorySource).toContain("下载视频");
    expect(videoHistorySource).toContain("设为最终");
    expect(videoHistorySource).toContain("删除");
    expect(videoHistorySource).toContain("onDelete(job)");
    expect(buildLatestCreativeJobsSource).toContain("new Set(productVideoJobs.map((job) => job.id))");
    expect(buildLatestCreativeJobsSource).not.toContain("new Set(matchingVideoJobs.map((job) => job.id))");
    expect(appSource).toContain("确认删除");
    expect(appSource).toContain("本地输出目录也会一起删除");
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
    expect(appSource).toContain("当前商品创作已刷新");
    expect(appSource).toContain("selectedProductGroup");
    expect(appSource).toContain("/video-jobs");
    expect(appSource).toContain("/storyboards");
    expect(appSource).toContain("queueProductVideoJobs");
    expect(queueProductVideoJobsSource).toContain("mergeVideoJobs(response.jobs, current)");
    expect(queueProductVideoJobsSource).not.toContain("scriptLines: splitDraftLines(studioScriptDraft)");
    expect(queueProductVideoJobsSource).toContain("storyboardLines: splitDraftLines(studioStoryboardDraft)");
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
    expect(appSource).not.toContain("window.localStorage");
    expect(appSource).not.toContain("haitu.productStudio.productSku.v1");
    expect(appSource).toContain("const selectedProductStoryboardHistory = selectedProduct");
    expect(appSource).not.toContain("record.productSku === selectedProduct.sku");
    expect(appSource).toContain("setTemplate(record.style)");
    expect(appSource).toContain("setDuration(record.duration)");
    expect(appSource).toContain('setStudioScriptDraft("");');
    expect(appSource).toContain("setStudioStoryboardDraft(defaultStoryboardDraft(template, duration))");
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
    expect(staticConsoleHtml).not.toContain("发布素材");
    expect(staticConsoleHtml).not.toContain("审核发布");
    expect(staticConsoleHtml).not.toContain("品牌设置");
    expect(staticConsoleHtml).not.toContain("发布包");
    expect(staticConsoleJs).not.toContain("发布素材");
    expect(staticConsoleJs).not.toContain("审核发布");
    expect(staticConsoleJs).not.toContain("品牌设置");
    expect(staticConsoleJs).not.toContain("发布包");
    expect(appSource).toContain("取消排队");
    expect(appSource).toContain("/retry");
    expect(appSource).toContain("重试任务");
    expect(appSource).toContain("retryVideoJob");
    expect(appSource).toContain("任务结果");
    expect(appSource).toContain("打开成片");
    expect(appSource).toContain("下载成片");
    expect(appSource).toContain("查看报告");
    expect(appSource).toContain("estimatedCostCny");
    expect(appSource).toContain("模型分布");
    expect(appSource).toContain("Token / 成本趋势");
    expect(appSource).toContain("最近使用");
    expect(appSource).toContain("/api/qc-summary");
    expect(appSource).toContain("检查失败");
    expect(appSource).toContain("qcTone");
    expect(appSource).toContain("官方用量");
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
    expect(dashboardCase).toContain('aria-label="仪表盘"');
    expect(appSource).toContain('{ id: "dashboard", label: "仪表盘"');
    expect(appSource).not.toContain("运营概览");
    const feeSummaryPanelSource = appSource.slice(appSource.indexOf("function FeeSummaryPanel"), appSource.indexOf("function ReportsPanel"));
    expect(feeSummaryPanelSource).toContain("费用汇总");
    expect(feeSummaryPanelSource).toContain("按商品费用");
    ["Raw", "Task", "manifest", "复用 raw", "取消 queued", "生成报告"].forEach((label) => {
      expect(feeSummaryPanelSource).not.toContain(label);
    });
    expect(videoCase).not.toContain("<ReportsPanel");
    expect(videoCase).not.toContain("<StorageBackupPanel");
    expect(videoCase).not.toContain("<AuditLogPanel");
    expect(videoCase).not.toContain("<VideoAssetsPanel");
    expect(appSource).toContain("/api/storage-backup");
    expect(appSource).toContain("/api/backups");
    expect(appSource).toContain("StorageBackupPanel");
    expect(appSource).toContain("存储与备份");
    expect(appSource).toContain("长期保存");
    expect(appSource).toContain("备份命令");
    expect(appSource).toContain("生成备份包");
    expect(appSource).toContain("下载备份");
    expect(appSource).toContain("/api/audit-log");
    expect(appSource).toContain("AuditLogPanel");
    expect(appSource).toContain("操作审计");
    expect(appSource).toContain("最近操作");
    expect(appSource).toContain("/api/video-assets");
    expect(appSource).toContain("VideoAssetsPanel");
    expect(appSource).toContain("formatBytes");
    expect(appSource).toContain("视频资产");
    expect(appSource).toContain("deleteVideoAsset");
    expect(appSource).toContain("删除文件");
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
    expect(appSource).toContain("视频类型");
    expect(appSource).not.toContain("/api/templates");
    expect(appSource).not.toContain("TemplateManagementPanel");
    expect(appSource).not.toContain("启用风格");
    expect(appSource).not.toContain("设为默认");
    const settingsCase = appSource.slice(appSource.indexOf('case "settings"'), appSource.indexOf("if (authSession.authEnabled"));
    expect(settingsCase).not.toContain("<TemplateManagementPanel");
    expect(settingsCase).toContain("<ApiModelConfigPanel");
    expect(settingsCase).not.toContain("<SettingsPanel");
    const apiManagementSource = appSource.slice(appSource.indexOf("function ApiModelConfigPanel"), appSource.indexOf("function VideoJobsPanel"));
    expect(apiManagementSource).toContain("API Key");
    expect(apiManagementSource).toContain("这里配置的是平台自己的模型 API Key");
    expect(apiManagementSource).toContain("不要让普通用户在这里填写他们自己的密钥");
    expect(apiManagementSource).not.toContain("HAITU_DATA_DIR");
    expect(apiManagementSource).not.toContain("环境变量");
    expect(apiManagementSource).not.toContain("你的密钥");
    expect(appSource).toContain("已清除平台 API Key");
    expect(apiManagementSource).toContain("文本模型");
    expect(apiManagementSource).toContain("图片模型");
    expect(apiManagementSource).toContain("视频模型");
    expect(apiManagementSource).not.toContain("默认生成设置");
    expect(apiManagementSource).toContain("Base URL");
    expect(apiManagementSource).toContain("优先级");
    expect(apiManagementSource).toContain("模型（逗号分隔）");
    expect(apiManagementSource).toContain("测试配置");
    expect(apiManagementSource).toContain("编辑");
    expect(apiManagementSource).toContain("删除");
    expect(apiManagementSource).toContain("条已配置");
    expect(apiManagementSource).toContain("条可用");
    expect(apiManagementSource).toContain("默认");
    ["Key 来源", "Key 预览", "Token 单价", "估算秒价", "接口地址"].forEach((label) => {
      expect(apiManagementSource).not.toContain(label);
    });
    expect(appSource).not.toContain('aria-label="视频风格后台"');
    expect(appSource).not.toContain("风格后台");
    expect(appSource).toContain("参考图");
    expect(appSource).not.toContain("/api/internal-validation/export.csv");
    expect(appSource).not.toContain("导出审核表");
    expect(appSource).toContain("finalVideoUrl");
    expect(appSource).toContain('method: "DELETE"');
    expect(appSource).toContain("maxEstimatedCostCnyPerVideo");
    expect(appSource).toContain("testCreditBalanceCny");
    expect(appSource).toContain("额度状态");
    expect(appSource).toContain("请先生成预检并勾选确认允许付费请求");
    expect(appSource).toContain("paidRunBlockedReason");
    expect(appSource).toContain("商品资料暂不可付费生成");
    expect(appSource).toContain("剩余测试额度不足");
    expect(appSource).toContain("/api/provider-config");
    expect(appSource).toContain("ApiModelConfigPanel");
    expect(appSource).toContain("API Key");
    expect(appSource).toContain("配置名称");
    expect(appSource).toContain("保存 Key");
    expect(appSource).toContain("清除 Key");
    expect(appSource).toContain('`/api/provider-keys/${providerId}/test`');
    expect(appSource).toContain("testModelConfig");
    expect(appSource).toContain("测试配置中");
    expect(appSource).toContain("testStatus");
    expect(apiManagementSource).toContain("{isTesting ? <RefreshCcw className=\"h-4 w-4 animate-spin\" /> : null}");
    expect(apiManagementSource).toContain("{isTesting ? \"测试中\" : \"测试配置\"}");
    expect(apiManagementSource).toContain("{!isTesting && testStatus ? (");
    expect(appSource).toContain("测试成功");
    expect(appSource).toContain("测试失败");
    expect(appSource).toContain("setModelConfigTestStatus");
    expect(appSource).toContain("productStudioLoadError");
    expect(appSource).toContain("loadError={productStudioLoadError}");
    expect(appSource).not.toContain("InlineProductFactsFields");
    expect(appSource).toContain("ProductComposerReferenceTray");
    expect(appSource).toContain("ProductCreationProductPicker");
    expect(appSource).not.toContain("ProductFactSummaryStrip");
    expect(appSource).not.toContain("ProductNarrativeList");
    expect(appSource).not.toContain("ProductSceneTags");
    expect(appSource).not.toContain("ProductRiskList");
    expect(appSource).not.toContain("product-reference-strip");
    expect(appSource).not.toContain("默认生成设置");
    expect(appSource).toContain("`/api/provider-keys/${providerId}`");
    expect(appSource).toContain("?configId=");
    expect(appSource).toContain('"openai-compatible-text"');
    expect(appSource).toContain('"openai-compatible-image"');
    expect(appSource).toContain('"volcengine-seedance"');
    const modelPresetSource = appSource.slice(appSource.indexOf("const modelConfigPresets"), appSource.indexOf("const NEW_PRODUCT_SELECT_VALUE"));
    expect(modelPresetSource).toContain('name: "OpenAI 推荐-文本"');
    expect(modelPresetSource).toContain('model: "gpt-5.5"');
    expect(modelPresetSource).toContain('name: "DeepSeek 推荐-文本"');
    expect(modelPresetSource).toContain('model: "deepseek-v4-pro"');
    expect(modelPresetSource).toContain('name: "豆包推荐-文本"');
    expect(modelPresetSource).toContain('model: "doubao-seed-2-0-pro-260215"');
    expect(modelPresetSource).toContain('name: "Gemini 推荐-图片"');
    expect(modelPresetSource).toContain('model: "gemini-3-pro-image"');
    expect(modelPresetSource).toContain('name: "OpenAI 推荐-图片"');
    expect(modelPresetSource).toContain('model: "gpt-image-2"');
    expect(modelPresetSource).toContain('name: "豆包 seednice2.0 fast 推荐-视频"');
    expect(modelPresetSource).toContain('model: "doubao-seedance-2-0-fast-260128"');
    expect(modelPresetSource).toContain('name: "豆包 seednice2.0 推荐-视频"');
    expect(modelPresetSource).toContain('model: "doubao-seedance-2-0-260128"');
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
  });

  it("reports provider configuration without exposing API keys", async () => {
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
      expect(response.textModels).toEqual([
        expect.objectContaining({
          id: "openai-compatible-text",
          label: "文本模型",
          configured: false,
          baseUrl: "https://api.openai.com",
          model: "gpt-5.5",
          capabilities: ["商品整理", "脚本分镜"]
        })
      ]);
      expect(response.imageModels).toEqual([
        expect.objectContaining({
          id: "openai-compatible-image",
          label: "图片模型",
          configured: false,
          baseUrl: "https://api.openai.com",
          model: "gpt-image-2",
          capabilities: ["商品图生成", "素材图生成"]
        })
      ]);
      expect(response.videoModels).toEqual([
        expect.objectContaining({
          id: "volcengine-seedance",
          label: "视频模型",
          providerLabel: "火山引擎 Seedance",
          configured: true,
          keySource: "SEEDANCE_API_KEY",
          keyPreview: "sk-s...3456",
          baseUrl: "https://ark.example.test",
          model: "doubao-seedance-test",
          priority: 0,
          capabilities: ["视频生成"],
          modelKind: "video",
          resolution: "480p",
          tokenPriceCnyPerMillion: 37,
          estimatedCostCnyPerSecond: 0.8,
          watermark: true,
          docsUrl: "https://www.volcengine.com/docs/82379/1541595?lang=zh"
        })
      ]);
      expect(response.providers).toEqual(response.videoModels);
    } finally {
      restoreEnv("SEEDANCE_API_KEY", previousSeedanceKey);
      restoreEnv("ARK_API_KEY", previousArkKey);
      restoreEnv("SEEDANCE_BASE_URL", previousBaseUrl);
      restoreEnv("SEEDANCE_MODEL", previousModel);
      restoreEnv("SEEDANCE_TOKEN_PRICE_CNY_PER_MILLION", previousTokenPrice);
      restoreEnv("SEEDANCE_WATERMARK", previousWatermark);
    }
  });

  it("reports ARK_API_KEY as the provider key fallback when Seedance key is absent", async () => {
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
      expect(response.videoModels[0]).toEqual(expect.objectContaining({
        configured: true,
        keySource: "ARK_API_KEY",
        keyPreview: "ark-...cdef"
      }));
    } finally {
      restoreEnv("SEEDANCE_API_KEY", previousSeedanceKey);
      restoreEnv("ARK_API_KEY", previousArkKey);
    }
  });

  it("stores a local BYOK provider key without exposing the secret", async () => {
    const previousSeedanceKey = process.env.SEEDANCE_API_KEY;
    const previousArkKey = process.env.ARK_API_KEY;
    delete process.env.SEEDANCE_API_KEY;
    delete process.env.ARK_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-provider-key-store-"));
      tempDirs.push(root);
      const outputsDir = testJobsDir(root);
      const server = createConsoleServer({ rootDir: root, outputsDir });

      const saved = await server.fetchJson("/api/provider-keys/volcengine-seedance", {
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
      await expect(readFile(join(testSettingsDir(root), "provider-keys.json"), "utf8")).rejects.toThrow();
      const storedKey = await readStoredProviderKey(root, "volcengine-seedance");
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

      const cleared = await server.fetchJson("/api/provider-keys/volcengine-seedance", {
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

  it("stores local BYOK provider keys in encrypted SQLite when HAITU_SECRET_KEY is set", async () => {
    const previousSecretKey = process.env.HAITU_SECRET_KEY;
    const previousSeedanceKey = process.env.SEEDANCE_API_KEY;
    const previousArkKey = process.env.ARK_API_KEY;
    process.env.HAITU_SECRET_KEY = "0123456789abcdef0123456789abcdef";
    delete process.env.SEEDANCE_API_KEY;
    delete process.env.ARK_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-provider-key-sqlite-"));
      tempDirs.push(root);
      const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });
      const session = await registerConsoleUser(testDataDir(root), server, "sqlite-key@example.com");

      const saved = await server.fetchJson("/api/provider-keys/volcengine-seedance", {
        method: "PUT",
        headers: { cookie: session.cookie },
        body: JSON.stringify({
          apiKey: "sqlite-secret-seedance-provider-key-9999",
          baseUrl: "https://ark.sqlite.example",
          model: "seedance-sqlite-model"
        })
      });

      expect(JSON.stringify(saved)).not.toContain("sqlite-secret-seedance-provider-key-9999");
      expect(saved.provider).toEqual(expect.objectContaining({
        configured: true,
        keySource: "LOCAL_BYOK",
        keyPreview: "sqli...9999"
      }));
      await expect(readFile(join(testDataDir(root), "workspaces", session.workspaceId, "settings", "provider-keys.json"), "utf8")).rejects.toThrow();

      const dbPath = join(testDataDir(root), "haitu.sqlite");
      const databaseBytes = await readFile(dbPath, "utf8");
      expect(databaseBytes).not.toContain("sqlite-secret-seedance-provider-key-9999");
      const handle = openDatabase({ dataDir: testDataDir(root), env: process.env });
      try {
        const row = handle.sqlite
          .prepare("SELECT key_preview, encrypted_key FROM provider_keys WHERE provider = 'volcengine-seedance' AND workspace_id = ?")
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
        model: "seedance-sqlite-model"
      }));
    } finally {
      restoreEnv("HAITU_SECRET_KEY", previousSecretKey);
      restoreEnv("SEEDANCE_API_KEY", previousSeedanceKey);
      restoreEnv("ARK_API_KEY", previousArkKey);
    }
  });

  it("migrates first-stage provider-keys.json into SQLite and reads SQLite first", async () => {
    const previousSecretKey = process.env.HAITU_SECRET_KEY;
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.HAITU_SECRET_KEY = "0123456789abcdef0123456789abcdef";
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-provider-key-migrate-"));
      tempDirs.push(root);
      const server = createConsoleServer({ rootDir: root, autoStartSavedJobs: false });
      const session = await registerConsoleUser(testDataDir(root), server, "sqlite-migrate@example.com");
      const workspaceSettingsDir = join(testDataDir(root), "workspaces", session.workspaceId, "settings");
      await mkdir(workspaceSettingsDir, { recursive: true });
      await writeFile(
        join(workspaceSettingsDir, "provider-keys.json"),
        JSON.stringify({
          providers: {
            "openai-compatible-text": {
              configId: "legacy-text",
              apiKey: "legacy-text-secret-123456",
              name: "Legacy Text",
              vendor: "legacy",
              priority: 5,
              baseUrl: "https://legacy.example/",
              model: "legacy-model",
              enabled: true
            }
          }
        }),
        "utf8"
      );

      const firstConfig = await server.fetchJson("/api/provider-config", {
        headers: { cookie: session.cookie }
      });
      expect(firstConfig.textModels[0]).toEqual(expect.objectContaining({
        configId: "legacy-text",
        configured: true,
        keySource: "LOCAL_BYOK",
        keyPreview: "lega...3456",
        baseUrl: "https://legacy.example",
        model: "legacy-model"
      }));

      const handle = openDatabase({ dataDir: testDataDir(root), env: process.env });
      try {
        runMigrations(handle);
        handle.sqlite.prepare(`
          UPDATE provider_keys
          SET
            encrypted_key = @encryptedKey,
            key_preview = 'dbfi...9999',
            base_url = 'https://sqlite-first.example',
            model = 'sqlite-first-model'
          WHERE provider = 'openai-compatible-text' AND config_id = 'legacy-text'
            AND workspace_id = @workspaceId
        `).run({
          workspaceId: session.workspaceId,
          encryptedKey: encryptSecret("dbfirst-secret-9999", process.env.HAITU_SECRET_KEY)
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
        model: "sqlite-first-model"
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

      const savedText = await server.fetchJson("/api/provider-keys/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "text-model-secret-key-123456",
          name: "ChatFire 推荐-文本",
          vendor: "chatfire",
          priority: 8,
          baseUrl: "https://api.chatfire.site/",
          model: "gemini-3-pro-preview"
        })
      });
      const savedImage = await server.fetchJson("/api/provider-keys/openai-compatible-image", {
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

      await expect(readFile(join(testSettingsDir(root), "provider-keys.json"), "utf8")).rejects.toThrow();
      const storedTextKey = await readStoredProviderKey(root, "openai-compatible-text");
      const storedImageKey = await readStoredProviderKey(root, "openai-compatible-image");
      expect(storedTextKey).toEqual(expect.objectContaining({
        key_preview: "text...3456",
        base_url: "https://api.chatfire.site",
        model: "gemini-3-pro-preview"
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
        label: "ChatFire 推荐-文本",
        providerLabel: "chatfire",
        priority: 8,
        baseUrl: "https://api.chatfire.site",
        model: "gemini-3-pro-preview",
        configured: true,
        keySource: "LOCAL_BYOK",
        keyPreview: "text...3456"
      }));
      expect(config.imageModels[0]).toEqual(expect.objectContaining({
        configured: true,
        keySource: "LOCAL_BYOK",
        keyPreview: "imag...cdef"
      }));
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
      restoreEnv("IMAGE_MODEL_API_KEY", previousImageKey);
    }
  });

  it("tests provider model configs against the real provider endpoint without saving secrets", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-provider-test-"));
    tempDirs.push(root);
    const outputsDir = testJobsDir(root);
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url);
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

    const text = await server.fetchJson("/api/provider-keys/openai-compatible-text/test", {
      method: "POST",
      body: JSON.stringify({
        apiKey: "text-test-secret",
        baseUrl: "https://api.openai.com",
        model: "gpt-5.5"
      })
    });
    const image = await server.fetchJson("/api/provider-keys/openai-compatible-image/test", {
      method: "POST",
      body: JSON.stringify({
        apiKey: "image-test-secret",
        baseUrl: "https://api.openai.com",
        model: "gpt-image-2"
      })
    });
    const video = await server.fetchJson("/api/provider-keys/volcengine-seedance/test", {
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
    await expect(readFile(join(testSettingsDir(root), "provider-keys.json"), "utf8")).rejects.toThrow();
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

  it("times out provider config tests with a clear error", async () => {
    const previousTimeout = process.env.PROVIDER_CONFIG_TEST_TIMEOUT_MS;
    process.env.PROVIDER_CONFIG_TEST_TIMEOUT_MS = "20";
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-provider-test-timeout-"));
      tempDirs.push(root);
      const fetchImpl = vi.fn(async () => new Promise<Response>(() => undefined)) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fetchImpl });

      const response = await server.fetch("/api/provider-keys/openai-compatible-text/test", {
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

  it("keeps multiple model configs per type and uses the highest priority enabled text config", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-multi-model-config-"));
      tempDirs.push(root);
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sku: "MULTI-001",
                  title_ja: "優先モデル テスト商品",
                  category: "テスト",
                  materials: ["ABS"],
                  dimensions: "10x10x10cm",
                  verified_selling_points: ["整理しやすい"],
                  usage_scenes: ["デスク"],
                  forbidden_claims: ["防水未確認"],
                  reference_images: ["multi-01.jpg"]
                })
              }
            }
          ],
          usage: {
            total_tokens: 123
          }
        })
      ) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fetchImpl });

      await server.fetchJson("/api/provider-keys/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "low-priority-text-secret-0001",
          name: "低优先级文本",
          vendor: "openai",
          priority: 1,
          baseUrl: "https://low.example.test",
          model: "low-model"
        })
      });
      await server.fetchJson("/api/provider-keys/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "high-priority-text-secret-9999",
          name: "高优先级文本",
          vendor: "chatfire",
          priority: 9,
          baseUrl: "https://high.example.test/",
          model: "high-model"
        })
      });

      const config = await server.fetchJson("/api/provider-config");
      expect(config.textModels).toHaveLength(2);
      expect(config.textModels.map((item: { label: string }) => item.label)).toEqual(["高优先级文本", "低优先级文本"]);
      expect(config.textModels.map((item: { priority: number }) => item.priority)).toEqual([9, 1]);
      expect(JSON.stringify(config)).not.toContain("high-priority-text-secret-9999");
      expect(JSON.stringify(config)).not.toContain("low-priority-text-secret-0001");

      await server.fetchJson("/api/products/import-ai-preview", {
        method: "POST",
        body: JSON.stringify({
          text: "商品名：優先モデル テスト商品"
        })
      });

      expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://high.example.test/v1/chat/completions");
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({
        authorization: "Bearer high-priority-text-secret-9999"
      }));
      const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body));
      expect(body.model).toBe("high-model");
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("uses the local BYOK provider key for read-only usage checks when env keys are absent", async () => {
    const previousSeedanceKey = process.env.SEEDANCE_API_KEY;
    const previousArkKey = process.env.ARK_API_KEY;
    delete process.env.SEEDANCE_API_KEY;
    delete process.env.ARK_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-provider-key-usage-"));
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
      await server.fetchJson("/api/provider-keys/volcengine-seedance", {
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
    expect(primaryNavSource).toContain("视频创作");
    expect(primaryNavSource).not.toContain("商品管理");
    expect(primaryNavSource).not.toContain("审核发布");
    expect(primaryNavSource).not.toContain("商品项目");
    expect(primaryNavSource).not.toContain("后台记录");

    expect(appSource).not.toContain("hiddenNavItems");
    expect(appSource).not.toContain('case "products"');
    expect(appSource).not.toContain('aria-label="商品管理"');

    const videoCase = appSource.slice(appSource.indexOf('case "video"'), appSource.indexOf('case "ledger"'));
    expect(videoCase).toContain("<ProductCreationWorkspace");
    expect(videoCase).toContain("onDeleteProduct={deleteProduct}");
    expect(videoCase).not.toContain("<VideoJobsPanel");
    expect(videoCase).not.toContain("<ReportsPanel");
    expect(videoCase).not.toContain("手动生成参数");
    expect(videoCase).not.toContain("<StorageBackupPanel");
    expect(videoCase).not.toContain("<AuditLogPanel");
    expect(videoCase).not.toContain("<VideoAssetsPanel");

    const productCreationWorkspace = appSource.slice(appSource.indexOf("function ProductCreationWorkspace"), appSource.indexOf("function ProductLibraryHome"));
    expect(productCreationWorkspace).toContain("<ProductCreationComposer");
    expect(productCreationWorkspace).not.toContain("<ProductCreationStartPanel");
    expect(productCreationWorkspace).not.toContain("选择商品开始创作");
    expect(productCreationWorkspace).toContain("selectedProductStoryboardHistory");
    expect(productCreationWorkspace).toContain("onOrganizeProductPackage");
    expect(productCreationWorkspace).toContain("onDeleteProduct");
    expect(productCreationWorkspace).not.toContain("ensureVideoProductSelection");

    const loadProductIntoDraftSource = appSource.slice(appSource.indexOf("async function loadProductIntoDraft"), appSource.indexOf("async function openProductStudio"));
    expect(loadProductIntoDraftSource).toContain('if (activeSection === "video")');
    expect(loadProductIntoDraftSource).toContain("applyProductToCreationComposerWithStoryboards(response.product)");
    expect(loadProductIntoDraftSource).toContain("persistProductStudioSku(response.product.sku)");

    expect(appSource).not.toContain("function ProductCreationStartPanel");
    expect(appSource).not.toContain("product-creation-start");
    expect(appSource).toContain("product-creation-picker");
    expect(appSource).not.toContain("选择商品开始创作");
    expect(appSource).not.toContain("开始创作");

    const productPickerSource = appSource.slice(appSource.indexOf("function ProductCreationProductPicker"), appSource.indexOf("function ReferenceImageFigure"));
    expect(appSource).not.toContain("product-studio-topbar");
    expect(appSource).not.toContain("ProductStudioProductPicker");
    expect(productPickerSource).toContain("创作商品");
    expect(productPickerSource).toContain("product-creation-product-menu");
    expect(productPickerSource).toContain("handleProductPickerSelect(NEW_PRODUCT_SELECT_VALUE)");
    expect(productPickerSource).toContain("新商品");
    expect(productPickerSource).toContain("dedupeProductSummaries(products)");
    expect(productPickerSource).toContain("onDeleteProduct");
    expect(productPickerSource).toContain("删除商品");
    expect(productPickerSource).toContain("onDeleteProduct(option.sku)");
    expect(productPickerSource).toContain("event.stopPropagation()");
    expect(productPickerSource).not.toContain("删除当前商品");
    expect(productPickerSource).toContain("setProductPickerOpen(false)");
    expect(productPickerSource).not.toContain("+ 新建商品");
    expect(productPickerSource).not.toContain("<Select");
    expect(productPickerSource).not.toContain("切换商品");
    expect(productPickerSource).not.toContain("返回视频创作");
    expect(productPickerSource).not.toContain("返回商品项目");
  });

  it("renders video creation as one composer with inline product packing, controls, storyboard, and video history", async () => {
    const appSource = await readFile(join(process.cwd(), "src", "client", "App.tsx"), "utf8");

    const videoCase = appSource.slice(appSource.indexOf('case "video"'), appSource.indexOf('case "ledger"'));
    expect(videoCase).toContain("<ProductCreationWorkspace");
    expect(videoCase).toContain("onOrganizeProductPackage");
    expect(videoCase).toContain("onStartNewProduct");
    expect(videoCase).not.toContain("<ProductLibraryDialogMount");

    const workspaceSource = appSource.slice(appSource.indexOf("function ProductCreationWorkspace"), appSource.indexOf("function ProductLibraryHome"));
    const videoModelSource = appSource.slice(appSource.indexOf("const videoModelOptions"), appSource.indexOf("const modelConfigPresets"));
    const defaultStoryboardSource = appSource.slice(appSource.indexOf("function defaultStoryboardDraft"), appSource.indexOf("function defaultStudioScriptDraft"));
    expect(workspaceSource).toContain("<ProductCreationComposer");
    expect(workspaceSource).toContain("selectedProductStoryboardHistory");
    expect(workspaceSource).not.toContain("<ProductStudio");
    expect(workspaceSource).not.toContain("<VideoCreationEmptyShell");
    expect(workspaceSource).not.toContain("ensureVideoProductSelection");
    expect(workspaceSource).not.toContain("ProductStudioPipeline");
    expect(appSource).toContain("useState<VideoModelChoice>(defaultVideoModelChoice)");
    expect(appSource).toContain("useState(defaultVideoDurationSeconds)");
    expect(appSource).toContain('const defaultVideoTemplate: TemplateName = "scene";');
    expect(appSource).toContain("useState<TemplateName>(defaultVideoTemplate)");
    expect(appSource).toContain("setTemplate(defaultVideoTemplate)");
    expect(appSource).not.toContain("setTemplate(nextSettings.enabledTemplates.includes(nextSettings.defaultTemplate)");
    expect(defaultStoryboardSource).toContain("scene");
    expect(defaultStoryboardSource).toContain("pain-point");
    expect(defaultStoryboardSource).toContain("benefit");
    expect(defaultStoryboardSource).toContain("ugc");
    expect(defaultStoryboardSource).toContain("unboxing");
    expect(defaultStoryboardSource).toContain("storyboardTimeRanges(durationSeconds)");
    expect(defaultStoryboardSource).toContain("`0-${firstEnd}s`");
    expect(appSource).toContain("storyboardDraftIsGuidance={!storyboardDraftTouched}");

    const composerSource = appSource.slice(appSource.indexOf("function ProductCreationComposer"), appSource.indexOf("function ProductLibraryHome"));
    expect(composerSource).toContain("video-creation-frame");
    expect(composerSource).toContain("product-creation-canvas");
    expect(composerSource).toContain("product-control-bar");
    expect(composerSource).toContain("video-parameter-row grid");
    expect(composerSource).toContain("min-[1280px]:grid-cols-[repeat(6,minmax(132px,1fr))]");
    expect(composerSource).toContain("video-generate-bar");
    expect(composerSource).toContain("generateVideoButtonLabel");
    expect(composerSource).toContain('versionCount > 1 ? `生成 ${versionCount} 个视频` : "生成视频"');
    expect(composerSource).toContain("videoModelOptions");
    expect(videoModelSource).toContain("seednice-2-fast");
    expect(videoModelSource).toContain("seednice-2");
    expect(videoModelSource).toContain("seednice2.0 fast");
    expect(videoModelSource).toContain("seednice2.0");
    expect(videoModelSource).toContain("const defaultVideoDurationSeconds = 10");
    expect(videoModelSource).toContain('const defaultVideoModelChoice: VideoModelChoice = "seednice-2-fast"');
    expect(composerSource).toContain("videoModelChoice");
    expect(composerSource).toContain("provider: videoModelConfig.provider");
    expect(composerSource).toContain("providerModel: videoModelConfig.model");
    expect(composerSource).toContain("confirmPaid: videoModelConfig.confirmPaid");
    expect(composerSource).not.toContain("允许使用付费模型生成当前商品视频");
    expect(composerSource).not.toContain("creation-parameter-dock");
    expect(composerSource).not.toContain("product-creation-canvas overflow-visible rounded-[22px] border");
    expect(composerSource).not.toContain("video-creation-frame grid gap-4 overflow-visible rounded-[24px] border border-[#dbe4f0] bg-[#fbfdff] p-4");
    expect(composerSource).not.toContain("product-creation-canvas overflow-visible rounded-[20px] bg-white");
    expect(composerSource).toContain("product-reference-inline");
    expect(composerSource).toContain("storyboard-side-panel");
    expect(composerSource).toContain("storyboardDraftIsGuidance");
    expect(composerSource).toContain("text-[#9aa7ba]");
    expect(composerSource).toContain("text-[#172033]");
    expect(composerSource).toContain("product-facts-editor");
    expect(composerSource).toContain("product-facts-actions");
    expect(composerSource).toContain("product-facts-body");
    expect(composerSource).toContain("productFactsBodyRef");
    expect(composerSource).toContain("productFactsBodyRef.current.scrollTop = 0");
    expect(composerSource).toContain("Math.max(8, Math.min(15");
    expect(composerSource).toContain("grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]");
    expect(composerSource).toContain("product-facts-body h-full min-h-0");
    expect(composerSource).not.toContain("submitHint");
    expect(composerSource).not.toContain("{submitHint ? (");
    expect(composerSource).not.toContain("{submitHint}");
    expect(composerSource).not.toContain('<div className="min-h-5 truncate text-xs font-bold text-[var(--accent)]">{submitHint}</div>');
    expect(composerSource).toContain('onToast("资料包已整理。", "ok")');
    expect(composerSource).toContain('onToast("已加入历史记录，生成中可删除取消，完成后可预览和下载。", "ok")');
    expect(composerSource).toContain("disabled:opacity-100");
    expect(composerSource).not.toContain("productPackageButtonLabel");
    expect(composerSource).not.toContain('"保存资料包"');
    expect(composerSource).toContain('"AI 整理资料包"');
    expect(composerSource).not.toContain("创建生成任务中");
    expect(composerSource).not.toContain("product-facts-body h-full min-h-[520px]");
    expect(composerSource).not.toContain("max-h-[312px]");
    expect(composerSource).not.toContain("min-h-[350px] resize-y border-0");
    expect(composerSource).not.toContain("max-h-[340px]");
    expect(composerSource).not.toContain("grid min-h-[430px]");
    expect(composerSource).toContain("grid items-stretch gap-0");
    expect(appSource).toContain("const [pendingImageFiles, setPendingImageFiles] = useState<File[]>([]);");
    expect(videoCase).toContain("pendingImageFiles={pendingImageFiles}");
    expect(videoCase).toContain("setPendingImageFiles={setPendingImageFiles}");
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
    expect(composerSource).toContain("商品资料");
    expect(composerSource).toContain("添加图片");
    expect(composerSource).toContain("onPreviewReferenceImage");
    expect(composerSource).toContain("onDeleteReferenceImage");
    expect(composerSource).toContain("AI 整理资料包");
    expect(composerSource).toContain('isPacking ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Package size={13} />');
    expect(composerSource).toContain('{isPacking ? "整理中" : "AI 整理资料包"}');
    expect(composerSource).toContain("productAutoSaveStatus");
    expect(composerSource).toContain("productAutoSaveStatusLabel(productAutoSaveStatus)");
    expect(appSource).toContain("onFlushProductFactsAutoSave={flushProductFactsAutoSave}");
    expect(composerSource).toContain("onFlushProductFactsAutoSave");
    expect(composerSource).toContain("await onFlushProductFactsAutoSave()");
    expect(composerSource).toContain('isGeneratingStoryboard ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Sparkles size={15} />');
    expect(composerSource).toContain('{isGeneratingStoryboard ? "生成中" : "AI 生成分镜"}');
    expect(composerSource).toContain("placeholder=\"\"");
    expect(composerSource).not.toContain("整理资料并生成视频");
    expect(composerSource).toContain("视频风格");
    expect(composerSource).toContain("视频时长");
    expect(composerSource).toContain("成片语言");
    expect(composerSource).toContain("生成模型");
    expect(composerSource).toContain("生成视频");
    expect(composerSource).toContain("CompactChoiceDropdown");
    expect(appSource).toContain("function productDraftToComposerText");
    expect(composerSource).toContain("storyboard-history-dropdown");
    expect(composerSource).not.toContain("补充要点");
    expect(composerSource).not.toContain("可补充镜头重点、禁用表达、旁白方向。");
    expect(composerSource).toContain("脚本分镜");
    expect(composerSource).toContain("AI 生成分镜");
    expect(composerSource).toContain("历史记录");
    expect(composerSource).toContain("预览视频");
    expect(composerSource).toContain("下载视频");
    expect(composerSource).toContain("DeleteCreativeVersionDialog");
    expect(composerSource).toContain("previewReferenceIndex");
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
      await server.fetchJson("/api/provider-keys/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "text-model-secret-key-123456"
        })
      });

      const sourceText = "商品名：AI整理 ミニ収納ケース\n素材：PP";
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
      await server.fetchJson("/api/provider-keys/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "text-model-secret-key-123456"
        })
      });

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
      await server.fetchJson("/api/provider-keys/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "text-model-secret-key-123456"
        })
      });

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
      await server.fetchJson("/api/provider-keys/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "text-model-secret-key-123456"
        })
      });

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

  it("uses the configured text model to draft storyboard lines for the selected product", async () => {
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
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  scriptLines: ["通勤前快速戴上袖套。", "自然覆盖到指尖附近。"],
                  storyboardLines: ["0-2s: 展示通勤前的手部和商品整体。", "2-6s: 展示指孔和面料近景。", "6-8s: 展示穿戴后的整体效果。"],
                  storyboardCnLines: ["0-2 秒：展示通勤前的手部和商品整体。", "2-6 秒：展示指孔和面料近景。", "6-8 秒：展示穿戴后的整体效果。"],
                  notes: ["未确认 UV 宣称未使用。"]
                })
              }
            }
          ],
          usage: {
            total_tokens: 321
          }
        })
      ) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fixturesDir, fetchImpl });
      await server.fetchJson("/api/provider-keys/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "text-storyboard-secret-7777"
        })
      });

      const response = await server.fetchJson("/api/products/STORY-001/storyboard-draft", {
        method: "POST",
        body: JSON.stringify({
          duration: 8,
          template: "pain-point"
        })
      });

      expect(response.scriptLines).toEqual(["通勤前快速戴上袖套。", "自然覆盖到指尖附近。"]);
      expect(response.storyboardLines).toEqual(["0-2s: 展示通勤前的手部和商品整体。", "2-6s: 展示指孔和面料近景。", "6-8s: 展示穿戴后的整体效果。"]);
      expect(response.storyboardCnLines).toEqual(["0-2 秒：展示通勤前的手部和商品整体。", "2-6 秒：展示指孔和面料近景。", "6-8 秒：展示穿戴后的整体效果。"]);
      expect(response.notes).toContain("未确认 UV 宣称未使用。");
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({
        authorization: "Bearer text-storyboard-secret-7777"
      }));
      const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body));
      expect(body.messages.at(-1).content).toContain("pain-point");
      expect(body.messages.at(-1).content).toContain("接触冷感アームカバー");
      expect(body.messages[0].content).toContain("storyboardCnLines");
      expect(body.messages[0].content).toContain("storyboardLines 必须使用简体中文");
    } finally {
      restoreEnv("TEXT_MODEL_API_KEY", previousTextKey);
      restoreEnv("OPENAI_API_KEY", previousOpenAiKey);
    }
  });

  it("rejects storyboard drafts when the text model mixes Japanese into Chinese fields", async () => {
    const previousTextKey = process.env.TEXT_MODEL_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.TEXT_MODEL_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const root = await mkdtemp(join(tmpdir(), "haitu-storyboard-lang-"));
      tempDirs.push(root);
      const fixturesDir = testProductsDir(root);
      await writeProduct(testProductPath(fixturesDir, "storyboard"), {
        sku: "STORY-LANG",
        title_ja: "接触冷感アームカバー",
        category: "スポーツ用スリーブ",
        materials: ["ポリエステル"],
        dimensions: "15x10x5cm / 0.1kg",
        verified_selling_points: ["指先までカバーしやすい", "通気性のある生地"],
        usage_scenes: ["通勤", "スポーツ"],
        forbidden_claims: ["UVカット率は未確認"],
        reference_images: ["arm-01.jpg", "arm-02.jpg", "arm-03.jpg"]
      });
      const fetchImpl = vi.fn(async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  scriptLines: ["通勤前快速戴上袖套。"],
                  storyboardLines: [
                    "0-2s: 以场景型开场，展示通勤和商品整体。",
                    "2-3s: 近景展示指先までカバーしやすい一体型デザイン。"
                  ],
                  storyboardCnLines: ["0-2 秒：展示通勤和商品整体。"],
                  notes: []
                })
              }
            }
          ],
          usage: {
            total_tokens: 99
          }
        })
      ) as unknown as typeof fetch;
      const server = createConsoleServer({ rootDir: root, fixturesDir, fetchImpl });
      await server.fetchJson("/api/provider-keys/openai-compatible-text", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "text-storyboard-secret-7777"
        })
      });

      const response = await server.fetchJson("/api/products/STORY-LANG/storyboard-draft", {
        method: "POST",
        body: JSON.stringify({
          duration: 8,
          template: "scene"
        })
      });

      expect(response.storyboardLines.join("\n")).not.toContain("まで");
      expect(response.storyboardLines.join("\n")).not.toContain("やすい");
      expect(response.storyboardCnLines).toEqual(response.storyboardLines);
      expect(response.notes).toContain("文本模型返回内容混入日文，已改用中文模板分镜。");
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
      exaggerationRules: ["未确认功效不写入视频。"]
    });
    await expect(readFile(join(testSystemDir(root), "console-settings.json"), "utf8")).resolves.toContain(
      "\"maxEstimatedCostCnyPerVideo\": 12.5"
    );
    await expect(readFile(join(testSystemDir(root), "console-settings.json"), "utf8")).resolves.toContain(
      "\"testCreditBalanceCny\": 20"
    );
    await expect(server.fetchJson("/api/settings")).resolves.toEqual({
      settings: response.settings
    });
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
          readyForPaidGeneration: false,
          blockingReasons: ["没有可用参考图", "材质未确认", "尺寸/重量未确认", "已验证卖点未确认"],
          warnings: expect.arrayContaining(["付费生成会被拦截，请先上传真实商品参考图。"])
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

  it("uses the highest priority enabled image model config to generate product reference images", async () => {
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
      await server.fetchJson("/api/provider-keys/openai-compatible-image", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "low-priority-image-secret-0001",
          name: "低优先级图片",
          vendor: "openai",
          priority: 1,
          baseUrl: "https://low-image.example.test",
          model: "low-image-model"
        })
      });
      await server.fetchJson("/api/provider-keys/openai-compatible-image", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "high-priority-image-secret-9999",
          name: "高优先级图片",
          vendor: "chatfire",
          priority: 9,
          baseUrl: "https://high-image.example.test/",
          model: "high-image-model"
        })
      });

      const response = await server.fetchJson("/api/products/IMG-001/reference-images/generate", {
        method: "POST",
        body: JSON.stringify({
          count: 1
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
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[0]).toBe("https://high-image.example.test/v1/images/generations");
      expect(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.headers).toEqual(expect.objectContaining({
        authorization: "Bearer high-priority-image-secret-9999"
      }));
      const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body));
      expect(body.model).toBe("high-image-model");
      expect(body.prompt).toContain("接触冷感アームカバー");
      expect(body.n).toBe(1);
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
    const fetchImpl = vi.fn(async () => jsonResponse({ unexpected: true })) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fixturesDir, fetchImpl });

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

    expect(vi.mocked(fetchImpl)).not.toHaveBeenCalled();
    expect(response).toEqual({
      preflight: expect.objectContaining({
        productSku: "TK-001",
        provider: "volcengine-seedance",
        durationSeconds: 8,
        aspectRatio: "9:16",
        paidProvider: true,
        requiresPaidConfirmation: true,
        estimatedTokens: {
          low: 61000,
          expected: 80770,
          high: 109000
        },
        estimatedCostCny: {
          low: 2.26,
          expected: 2.99,
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
    expect(response.preflight.prompt).toContain("Do not claim or imply");
    expect(response.preflight.referenceImages[0]).toEqual(expect.objectContaining({
      original: "main.jpg",
      status: "previewable"
    }));
  });

  it("includes paid generation readiness blockers in preflight", async () => {
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
      readyForPaidGeneration: false,
      blockingReasons: [
        "没有可用参考图",
        "材质未确认",
        "尺寸/重量未确认"
      ],
      warnings: [
        "1 张参考图缺失。",
        "付费生成会被拦截，请先上传真实商品参考图。",
        "请补充材质，避免脚本描述商品手感或面料时编造。",
        "请补充尺寸/重量，避免脚本编造大小、容量或便携性。"
      ]
    });
  });

  it("shows remaining test credit in paid preflight estimates", async () => {
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
      estimatedCostCny: 2.99,
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
    await writeFile(rawManifestPath, JSON.stringify({ type: "raw" }), "utf8");
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
      error: expect.stringContaining("outside project root")
    });
  });

  it("queries official provider usage for one task id without creating a generation", async () => {
    process.env.ARK_API_KEY = "from-env";
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
    process.env.ARK_API_KEY = "from-env";
    const root = await mkdtemp(join(tmpdir(), "haitu-console-usage-list-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
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
    expect(csv).toContain("WALLET-BLACK-001,カード収納ミニ財布,3,1,wallet-v1,本地模拟,已完成,8,可发布,5,发布候选,1000,0.04,是,补 2 个版本");
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
    await writeFile(rawManifestPath, JSON.stringify({ type: "raw" }), "utf8");
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
      "商品SKU,任务ID,生成通道,Task ID,时长秒,Token,估算成本CNY,视频地址,字幕地址,成品Manifest,发布清单,人工备注,创建时间"
    );
    expect(csv).toContain("WALLET-BLACK-001,wallet-final,火山引擎 Seedance,cgt-wallet,8,80770,2.99");
    expect(csv).toContain(`/media?path=${encodeURIComponent(join(packageDir, "wallet.final.mp4"))}`);
    expect(csv).toContain(`/media?path=${encodeURIComponent(join(packageDir, "wallet.ass"))}`);
    expect(csv).toContain(`/media?path=${encodeURIComponent(join(packageDir, "final-manifest.json"))}`);
    expect(csv).toContain(`/media?path=${encodeURIComponent(join(packageDir, "publish-package.json"))}`);
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
    await writeFile(join(settingsDir, "provider-keys.json"), JSON.stringify({ providers: {} }), "utf8");
    await writeFile(join(systemDir, "console-settings.json"), JSON.stringify({ defaultCta: "check" }), "utf8");
    await writeFile(join(jobDir, "job.json"), JSON.stringify({ id: "job-1", workspaceId: "default" }), "utf8");
    await writeFile(join(jobDir, "make-video-report.json"), JSON.stringify({ productSku: "TK-001" }), "utf8");
    await writeFile(join(jobDir, "raw", "source.mp4"), Buffer.from("raw-video"));
    await writeFile(join(jobDir, "final", "final.mp4"), Buffer.from("final-video"));
    await writeFile(join(dataDir, "backups", "old-backup.tar.gz"), Buffer.from("old"));
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
    expect(archiveList.stdout).toContain("workspaces/default/settings/provider-keys.json");
    expect(archiveList.stdout).toContain("system/console-settings.json");
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
    process.env.ARK_API_KEY = "from-env";
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
    process.env.ARK_API_KEY = "from-env";
    const root = await mkdtemp(join(tmpdir(), "haitu-console-cancel-running-"));
    tempDirs.push(root);
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        id: "cgt-running",
        status: "running"
      })
    ) as unknown as typeof fetch;
    const server = createConsoleServer({ rootDir: root, fetchImpl });

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
        template: "scene",
        cta: "今すぐチェック"
      })
    });

    expect(queued.job).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^job-/),
      status: "queued",
      provider: "mock",
      durationSeconds: 8,
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
      reportPath: join(outputsDir, queued.job.id, "make-video-report.json")
    }));
    await expect(readFile(jobFilePath(outputsDir, queued.job.id), "utf8")).resolves.toContain(
      "\"status\": \"completed\""
    );
  });

  it("passes the highest priority enabled video model config into queued video generation", async () => {
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
      await server.fetchJson("/api/provider-keys/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "low-priority-video-secret-0001",
          name: "低优先级视频",
          vendor: "volcengine",
          priority: 1,
          baseUrl: "https://low-video.example.test",
          model: "low-video-model"
        })
      });
      await server.fetchJson("/api/provider-keys/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "high-priority-video-secret-9999",
          name: "高优先级视频",
          vendor: "volcengine",
          priority: 9,
          baseUrl: "https://high-video.example.test/",
          model: "high-video-model"
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
        apiKey: "high-priority-video-secret-9999",
        providerBaseUrl: "https://high-video.example.test",
        providerModel: "high-video-model",
        finalLanguage: "ja"
      }));
    } finally {
      restoreEnv("SEEDANCE_API_KEY", previousSeedanceKey);
      restoreEnv("ARK_API_KEY", previousArkKey);
    }
  });

  it("allows product video jobs to override the selected Seednice model without a separate paid confirmation", async () => {
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
      await server.fetchJson("/api/provider-keys/volcengine-seedance", {
        method: "PUT",
        body: JSON.stringify({
          apiKey: "configured-video-secret-9999",
          name: "默认 Fast",
          vendor: "volcengine",
          priority: 9,
          baseUrl: "https://seednice.example.test",
          model: "doubao-seedance-2-0-fast-260128"
        })
      });

      const response = await server.fetchJson("/api/products/WALLET-BLACK-001/video-jobs", {
        method: "POST",
        body: JSON.stringify({
          provider: "volcengine-seedance",
          providerModel: "doubao-seedance-2-0-260128",
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
        providerModel: "doubao-seedance-2-0-260128",
        confirmPaid: true
      }));
      expect(capturedInputs[0]).toEqual(expect.objectContaining({
        apiKey: "configured-video-secret-9999",
        providerBaseUrl: "https://seednice.example.test",
        providerModel: "doubao-seedance-2-0-260128",
        confirmPaid: true
      }));
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

  it("rejects paid video jobs when estimated cost exceeds the configured budget cap", async () => {
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
        throw new Error("Provider should not be called when budget cap blocks the job.");
      }
    });
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

    expect(response.status).toBe(402);
    expect(body.error).toContain("exceeds budget cap");
    expect(calls).toEqual([]);
    await expect(server.fetchJson("/api/video-jobs")).resolves.toEqual({
      jobs: []
    });
  });

  it("rejects paid video jobs when remaining test credit is insufficient", async () => {
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
      autoStartSavedJobs: false,
      runMakeVideoPipeline: async (input) => {
        calls.push(input.outDir);
        throw new Error("Provider should not be called when test credit blocks the job.");
      }
    });
    await server.fetchJson("/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        maxEstimatedCostCnyPerVideo: 5,
        testCreditBalanceCny: 5
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

    expect(response.status).toBe(402);
    expect(body.error).toContain("exceeds remaining test credit");
    expect(body.error).toContain("available ¥1.50");
    expect(calls).toEqual([]);
    await expect(server.fetchJson("/api/video-jobs")).resolves.toEqual({
      jobs: []
    });
  });

  it("rejects paid batch video jobs when the combined version cost exceeds remaining test credit", async () => {
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
        throw new Error("Provider should not be called when combined batch credit blocks the job.");
      }
    });
    await server.fetchJson("/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        maxEstimatedCostCnyPerVideo: 5,
        testCreditBalanceCny: 6
      })
    });

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
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error).toContain("3 video versions");
    expect(body.error).toContain("combined estimated cost ¥8.97");
    expect(body.error).toContain("available ¥6.00");
    expect(calls).toEqual([]);
    await expect(server.fetchJson("/api/video-jobs")).resolves.toEqual({
      jobs: []
    });
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

  it("rejects paid video jobs before enqueue when product reference images are not usable", async () => {
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
        throw new Error("Provider should not be called when product readiness blocks the job.");
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

    expect(response.status).toBe(422);
    expect(body.error).toBe("付费生成前请先补齐商品资料: 没有可用参考图。");
    expect(calls).toEqual([]);
    await expect(server.fetchJson("/api/video-jobs")).resolves.toEqual({
      jobs: []
    });
  });

  it("rejects paid video jobs before enqueue when required product facts are unconfirmed", async () => {
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
        throw new Error("Provider should not be called when product facts block the job.");
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

    expect(response.status).toBe(422);
    expect(body.error).toBe("付费生成前请先补齐商品资料: 材质未确认、尺寸/重量未确认。");
    expect(calls).toEqual([]);
    await expect(server.fetchJson("/api/video-jobs")).resolves.toEqual({
      jobs: []
    });
  });

  it("rejects paid batch video jobs before enqueue when product reference images are not usable", async () => {
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
        throw new Error("Provider should not be called when product readiness blocks the batch.");
      }
    });

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
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe("付费生成前请先补齐商品资料: 没有可用参考图。");
    expect(calls).toEqual([]);
    await expect(server.fetchJson("/api/video-jobs")).resolves.toEqual({
      jobs: []
    });
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
      completedRetry = await server.fetchJson(`/api/video-jobs/${retried.job.id}`);
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
      id: expect.stringMatching(/^job-/),
      status: "queued",
      provider: "mock",
      durationSeconds: 8,
      template: "scene",
      confirmPaid: false
    }));
    expect(retried.job.id).not.toBe(first.job.id);
    expect(retried.job.outDir).toBe(join(outputsDir, `retry-${first.job.id}`));
    expect(completedRetry.job).toEqual(expect.objectContaining({
      id: retried.job.id,
      status: "completed",
      productSku: "TK-001"
    }));
    expect(calls).toEqual([
      join(outputsDir, "box-video"),
      join(outputsDir, `retry-${first.job.id}`)
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

type TestConsoleServerHandle = ConsoleServerHandle & {
  raw: ConsoleServerHandle;
  authCookie: string;
  workspaceId: string;
};

function createConsoleServer(options: ConsoleServerOptions = {}): TestConsoleServerHandle {
  if (!process.env.HAITU_SECRET_KEY) {
    vi.stubEnv("HAITU_SECRET_KEY", "0123456789abcdef0123456789abcdef");
  }
  const rootDir = options.rootDir ?? process.cwd();
  const dataDir = options.dataDir
    ? isAbsolute(options.dataDir)
      ? options.dataDir
      : join(rootDir, options.dataDir)
    : testDataDir(rootDir);
  const raw = createRawConsoleServer(options);
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
    pathname === "/console" ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/static/") ||
    pathname === "/api/health" ||
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

async function readStoredProviderKey(root: string, provider: string): Promise<{
  key_preview: string;
  encrypted_key: string;
  base_url: string | null;
  model: string | null;
}> {
  const handle = openDatabase({ dataDir: testDataDir(root), env: process.env });
  try {
    return handle.sqlite.prepare(`
      SELECT key_preview, encrypted_key, base_url, model
      FROM provider_keys
      WHERE provider = ?
    `).get(provider) as {
      key_preview: string;
      encrypted_key: string;
      base_url: string | null;
      model: string | null;
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
