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
    const tunnel = await readFile(join(root, "deploy", "cloudflare", "tunnel-config.example.yml"), "utf8");
    const guide = await readFile(join(root, "docs", "deployment", "vps-no-docker.md"), "utf8");

    expect(packageJson.scripts["start:console"]).toBe("tsx src/cli/console.ts");
    expect(packageJson.scripts.start).toBe("npm run start:console");
    expect(packageJson.scripts["deploy:check"]).toBe("npm run typecheck && npm test && npm run build:console");

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
    expect(envExample).toContain("HAITU_AUTH_PASSWORD=");
    expect(envExample).toContain("SEEDANCE_RESOLUTION=480p");
    expect(envExample).not.toContain("your-modelark-api-key");

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
    expect(guide).toContain("HAITU_AUTH_PASSWORD=change-this-to-a-long-random-password");
    expect(guide).toContain("单管理员登录保护");
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
  });
});
