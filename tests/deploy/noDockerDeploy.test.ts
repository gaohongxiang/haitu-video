import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const localEnvKeys = [
  "HAITU_SECRET_KEY",
  "BETTER_AUTH_URL",
  "HAITU_DATA_DIR",
  "HAITU_RECHARGE_ORDER_EXPIRES_IN_SECONDS",
  "HAITU_ADMIN_EMAIL",
  "HAITU_AUTH_EMAIL_FROM",
  "RESEND_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_CURRENCY",
  "INFINI_ENV",
  "INFINI_PUBLIC_KEY",
  "INFINI_PRIVATE_KEY",
  "INFINI_WEBHOOK_SECRET",
  "INFINI_CURRENCY"
];

describe("no-Docker VPS deployment package", () => {
  it("documents and templates a Cloudflare Tunnel-first VPS deployment for haitu.online", async () => {
    const root = process.cwd();
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const service = await readFile(join(root, "deploy", "systemd", "haitu-video.service"), "utf8");
    const caddy = await readFile(join(root, "deploy", "caddy", "Caddyfile"), "utf8");
    const envExample = await readFile(join(root, "deploy", "env", "haitu-video.env.example"), "utf8");
    const deployScript = await readFile(join(root, "deploy", "scripts", "deploy-from-github.sh"), "utf8");
    const tunnel = await readFile(join(root, "deploy", "cloudflare", "tunnel-config.example.yml"), "utf8");
    const guide = await readFile(join(root, "docs", "operations", "vps-no-docker.md"), "utf8");

    expect(packageJson.scripts["start:console"]).toBe("tsx src/cli/console.ts");
    expect(packageJson.scripts.start).toBe("npm run start:console");
    expect(packageJson.scripts["deploy:check"]).toBe("npm run typecheck && npm test && npm run build:console");
    expect(packageJson.scripts["seo:check"]).toBe("tsx scripts/check-seo-geo-production.ts");
    expect(packageJson.scripts["deploy:vps"]).toBe("ssh openclaw-ghxServer 'cd /opt/haitu-video && sudo ./deploy/scripts/deploy-from-github.sh'");

    expect(service).toContain("Description=Haitu Video Console");
    expect(service).toContain("WorkingDirectory=/opt/haitu-video");
    expect(service).toContain("EnvironmentFile=/etc/haitu-video.env");
    expect(service).toContain("ExecStart=/usr/bin/npm run start:console");
    expect(service).toContain("Restart=always");
    expect(service).not.toMatch(/docker/i);

    expect(caddy).toContain("haitu.online");
    expect(caddy).toContain("reverse_proxy 127.0.0.1:4173");
    expect(caddy).not.toMatch(/docker/i);

    expect(envExample).toContain("HAITU_DATA_DIR=/var/lib/haitu-video");
    expect(envExample).toContain("HAITU_SECRET_KEY=replace-with-at-least-32-random-bytes");
    expect(envExample).toContain("HAITU_ADMIN_EMAIL=");
    expect(envExample).toContain("BETTER_AUTH_URL=https://haitu.online");
    expect(envExample).toContain("HAITU_AUTH_EMAIL_FROM=");
    expect(envExample).toContain("RESEND_API_KEY=");
    expect(envExample).toContain("HAITU_RECHARGE_ORDER_EXPIRES_IN_SECONDS=3600");
    expect(envExample).not.toContain("HAITU_AUTH_PASSWORD");
    expect(envExample).not.toContain("HAITU_HOST=");
    expect(envExample).not.toContain("HAITU_PORT=");
    expect(envExample).not.toContain("HAITU_DB_PATH=");
    expect(envExample).not.toContain("HAITU_PUBLIC_BASE_URL=");
    expect(envExample).not.toContain("HAITU_PLATFORM_VOLCENGINE_API_KEY=");
    expect(envExample).not.toContain("HAITU_PLATFORM_DEFAULT_VIDEO_MODEL=seedance-2.0-fast");
    expect(envExample).not.toContain("HAITU_PLATFORM_FEE_CNY_PER_TEXT");
    expect(envExample).not.toContain("HAITU_PLATFORM_FEE_CNY_PER_IMAGE");
    expect(envExample).not.toContain("HAITU_PLATFORM_FEE_CNY_PER_VIDEO");
    expect(envExample).toContain("平台模型 API Key 和服务费在 /admin 配置");
    expect(envExample).toContain("STRIPE_CURRENCY=cny");
    expect(envExample).toContain("INFINI_CURRENCY=usd");
    expect(envExample).not.toContain("SEEDANCE_RESOLUTION=");
    expect(envExample).not.toContain("ARK_API_KEY");
    expect(envExample).not.toContain("SEEDANCE_API_KEY");
    expect(envExample).not.toContain("SEEDANCE_MODEL=");
    expect(envExample).not.toContain("your-modelark-api-key");

    expect(deployScript).toContain('REMOTE="${HAITU_DEPLOY_REMOTE:-origin}"');
    expect(deployScript).toContain('BRANCH="${HAITU_DEPLOY_BRANCH:-main}"');
    expect(deployScript).toContain('run_app git fetch "$REMOTE" "$BRANCH"');
    expect(deployScript).toContain("git reset --hard");
    expect(deployScript).toContain("git clean -fd");
    expect(deployScript).toContain("run_app npm ci");
    expect(deployScript).toContain("run_app_env npm run db:migrate");
    expect(deployScript).toContain("run_app npm run deploy:check");
    expect(deployScript).toContain('SERVICE="${HAITU_DEPLOY_SERVICE:-haitu-video}"');
    expect(deployScript).toContain('APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"');
    expect(deployScript).toContain('ENV_FILE="${HAITU_DEPLOY_ENV_FILE:-/etc/haitu-video.env}"');
    expect(deployScript).toContain('source "$ENV_FILE"');
    expect(deployScript).toContain('PUBLIC_BASE_URL="${HAITU_PUBLIC_BASE_URL:-${BETTER_AUTH_URL:-https://haitu.online}}"');
    expect(deployScript).toContain('sudo -u "$APP_USER" HOME="$APP_HOME" "$@"');
    expect(deployScript).toContain("run_app_env()");
    expect(deployScript).toContain('HAITU_DB_PATH="${HAITU_DB_PATH:-}"');
    expect(deployScript).toContain('HAITU_ADMIN_EMAIL="${HAITU_ADMIN_EMAIL:-}"');
    expect(deployScript).toContain('HAITU_PUBLIC_BASE_URL="${HAITU_PUBLIC_BASE_URL:-}"');
    expect(deployScript).toContain('systemctl restart "$SERVICE"');
    expect(deployScript).toContain('HEALTH_URL="http://127.0.0.1:${HAITU_PORT:-4173}/api/health"');
    expect(deployScript).toContain('curl -fsS "$HEALTH_URL"');
    expect(deployScript).toContain('run_app_env npm run seo:check -- --base "$PUBLIC_BASE_URL"');
    expect(deployScript).not.toContain("/var/lib/haitu-video");

    expect(tunnel).toContain("tunnel: <你的隧道编号>");
    expect(tunnel).toContain("credentials-file: /etc/cloudflared/<你的隧道编号>.json");
    expect(tunnel).toContain("hostname: haitu.online");
    expect(tunnel).toContain("service: http://127.0.0.1:4173");

    expect(guide).toContain("不使用 Docker");
    expect(guide).toContain("haitu.online");
    expect(guide).toContain("Cloudflare Tunnel");
    expect(guide).toContain("HAITU_DATA_DIR=/var/lib/haitu-video");
    expect(guide).toContain("sudo mkdir -p /var/lib/haitu-video");
    expect(guide).toContain("sudo chown -R haitu:haitu /var/lib/haitu-video");
    expect(guide).toContain("代码目录可以是 `/opt/haitu-video`，数据目录必须是 `/var/lib/haitu-video`");
    expect(guide).toContain("cloudflared tunnel create haitu-video");
    expect(guide).toContain("cloudflared tunnel route dns haitu-video haitu.online");
    expect(guide).toContain("sudo cloudflared service install");
    expect(guide).toContain("Quick Tunnel 只能临时测试");
    expect(guide).toContain("Cloudflare Pages");
    expect(guide).toContain("Cloudflare Stream");
    expect(guide).toContain("Cloudflare R2");
    expect(guide).toContain("HAITU_SECRET_KEY=change-this-to-at-least-32-random-bytes");
    expect(guide).toContain("HAITU_ADMIN_EMAIL=you@haitu.online");
    expect(guide).toContain("BETTER_AUTH_URL=https://haitu.online");
    expect(guide).toContain("HAITU_AUTH_EMAIL_FROM=login@haitu.online");
    expect(guide).toContain("HAITU_RECHARGE_ORDER_EXPIRES_IN_SECONDS=3600");
    expect(guide).toContain("STRIPE_CURRENCY=cny");
    expect(guide).toContain("INFINI_CURRENCY=usd");
    expect(guide).toContain("查不到就不创建充值订单，让用户稍后重试");
    expect(guide).not.toContain("HAITU_PLATFORM_VOLCENGINE_API_KEY=");
    expect(guide).toContain("平台 API Key 在 `/admin` 的平台模型页面配置并加密写入 SQLite");
    expect(guide).toContain("RESEND_API_KEY=");
    expect(guide).toContain("账号注册和忘记密码使用邮箱验证码");
    expect(guide).toContain("`HAITU_ADMIN_EMAIL` 对应账号完成邮箱验证后，可以访问 `https://haitu.online/admin`");
    expect(guide).toContain("SQLite 用户账号体系");
    expect(guide).not.toContain("HAITU_AUTH_PASSWORD");
    expect(guide).not.toContain("单管理员登录保护");
    expect(guide).not.toContain("管理员登录");
    expect(guide).toContain("/api/health");
    expect(guide).toContain("/api/storage-backup");
    expect(guide).toContain("/api/backups");
    expect(guide).toContain("存储与备份");
    expect(guide).toContain("生成备份包");
    expect(guide).toContain("下载备份");
    expect(guide).toContain("/var/lib/haitu-video/backups");
    expect(guide).toContain("sudo tar -czf /var/backups/haitu-video-$(date +%Y%m%d).tar.gz");
    expect(guide).toContain("--exclude='haitu-video/workspaces/*/jobs/*/raw'");
    expect(guide).toContain("--exclude='haitu-video/workspaces/*/jobs/*/final'");
    expect(guide).toContain("/var/lib/haitu-video/system/audit-log.jsonl");
    expect(guide).toContain("操作审计日志");
    expect(guide).toContain("workspaces/default");
    expect(guide).toContain("systemctl");
    expect(guide).toContain("Caddy");
    expect(guide).toContain("备用");
    expect(guide).toContain("GitHub 是生产代码来源");
    expect(guide).toContain("npm run deploy:vps");
    expect(guide).toContain("deploy/scripts/deploy-from-github.sh");
    expect(guide).toContain("npm run seo:check -- --base \"$PUBLIC_BASE_URL\"");
  });

  it("keeps the checked-in .env example aligned with the current local env shape without real secrets", async () => {
    const root = process.cwd();
    const envExample = await readFile(join(root, ".env.example"), "utf8");
    const deployEnvExample = await readFile(join(root, "deploy", "env", "haitu-video.env.example"), "utf8");

    expect(envKeys(envExample)).toEqual(localEnvKeys);
    expect(envKeys(deployEnvExample)).toEqual(localEnvKeys);

    expect(envExample).toContain("HAITU_RECHARGE_ORDER_EXPIRES_IN_SECONDS=3600");
    expect(envExample).toContain("STRIPE_CURRENCY=cny");
    expect(envExample).toContain("INFINI_ENV=sandbox");
    expect(envExample).toContain("INFINI_CURRENCY=usd");
    expect(envExample).not.toContain("INFINI_ENV=sandbox/production");
    expect(envExample).not.toContain("HAITU_RECHARGE_FX_RATE_PROVIDER");
    expect(envExample).not.toContain("HAITU_RECHARGE_FX_RATE_URL");
    expect(envExample).not.toContain("HAITU_RECHARGE_HKD_PER_CNY");
    expect(envExample).not.toContain("HAITU_RECHARGE_USD_PER_CNY");
    expect(envExample).not.toMatch(/sk_(test|live)_/);
    expect(envExample).not.toMatch(/whsec_/);
  });
});

function envKeys(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => line.split("=", 1)[0] ?? "");
}
