import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

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
    const guide = await readFile(join(root, "docs", "deployment", "vps-no-docker.md"), "utf8");

    expect(packageJson.scripts["start:console"]).toBe("tsx src/cli/console.ts");
    expect(packageJson.scripts.start).toBe("npm run start:console");
    expect(packageJson.scripts["deploy:check"]).toBe("npm run typecheck && npm test && npm run build:console");
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

    expect(envExample).toContain("HAITU_HOST=127.0.0.1");
    expect(envExample).toContain("HAITU_PORT=4173");
    expect(envExample).toContain("HAITU_DATA_DIR=/var/lib/haitu-video");
    expect(envExample).toContain("HAITU_SECRET_KEY=replace-with-at-least-32-random-bytes");
    expect(envExample).toContain("BETTER_AUTH_URL=https://haitu.online");
    expect(envExample).toContain("HAITU_AUTH_EMAIL_FROM=");
    expect(envExample).toContain("RESEND_API_KEY=");
    expect(envExample).not.toContain("HAITU_AUTH_PASSWORD");
    expect(envExample).toContain("SEEDANCE_RESOLUTION=480p");
    expect(envExample).not.toContain("your-modelark-api-key");

    expect(deployScript).toContain('REMOTE="${HAITU_DEPLOY_REMOTE:-origin}"');
    expect(deployScript).toContain('BRANCH="${HAITU_DEPLOY_BRANCH:-main}"');
    expect(deployScript).toContain('run_app git fetch "$REMOTE" "$BRANCH"');
    expect(deployScript).toContain("git reset --hard");
    expect(deployScript).toContain("git clean -fd");
    expect(deployScript).toContain("run_app npm ci");
    expect(deployScript).toContain("run_app npm run db:migrate");
    expect(deployScript).toContain("run_app npm run deploy:check");
    expect(deployScript).toContain('SERVICE="${HAITU_DEPLOY_SERVICE:-haitu-video}"');
    expect(deployScript).toContain('APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"');
    expect(deployScript).toContain('sudo -u "$APP_USER" HOME="$APP_HOME" "$@"');
    expect(deployScript).toContain('systemctl restart "$SERVICE"');
    expect(deployScript).toContain('HEALTH_URL="http://127.0.0.1:${HAITU_PORT:-4173}/api/health"');
    expect(deployScript).toContain('curl -fsS "$HEALTH_URL"');
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
    expect(guide).toContain("BETTER_AUTH_URL=https://haitu.online");
    expect(guide).toContain("HAITU_AUTH_EMAIL_FROM=login@haitu.online");
    expect(guide).toContain("RESEND_API_KEY=");
    expect(guide).toContain("账号注册和忘记密码使用邮箱验证码");
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
  });
});
