# VPS 无 Docker 部署

这份步骤用于第一阶段把 Haitu console 跑在已有 VPS 上，通过 Cloudflare Tunnel 免费入口绑定 `haitu.online`。这一版不使用 Docker，不安装 PostgreSQL/Redis，不使用 Cloudflare Pages、Cloudflare Stream，也不把 Cloudflare R2 作为本阶段默认依赖。

## 适用范围

- 适合内部 Web 版和小范围真实用户试用。
- Node 进程由 systemd 保活。
- 首选公网入口是 Cloudflare Tunnel，服务器只监听 `127.0.0.1:4173`。
- Caddy 直连只作为备用方案。
- Seedance/火山引擎仍是付费调用，部署本身不会触发生成请求。

## 服务器目录

代码目录可以是 `/opt/haitu-video`，数据目录必须是 `/var/lib/haitu-video`，两者不要混在一起。

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin haitu
sudo mkdir -p /opt/haitu-video
sudo mkdir -p /var/lib/haitu-video
sudo chown -R haitu:haitu /opt/haitu-video
sudo chown -R haitu:haitu /var/lib/haitu-video
```

运行时数据由 `HAITU_DATA_DIR=/var/lib/haitu-video` 控制，实际数据会落在：

```text
/var/lib/haitu-video/system/
/var/lib/haitu-video/workspaces/default/
/var/lib/haitu-video/workspaces/default/products/
/var/lib/haitu-video/workspaces/default/jobs/
/var/lib/haitu-video/workspaces/default/settings/
/var/lib/haitu-video/backups/
```

更新代码前后都不能删除 `/var/lib/haitu-video`。迁移服务器时复制 `/var/lib/haitu-video` 即可，不要只复制代码仓库。

操作审计日志会写入 `/var/lib/haitu-video/system/audit-log.jsonl`。这个文件包含操作轨迹，不包含 API key 或密码明文，也应随数据目录一起备份。

## 首次部署

把项目代码放到 `/opt/haitu-video` 后执行：

```bash
cd /opt/haitu-video
npm ci
npm run deploy:check
```

## 环境变量

创建 `/etc/haitu-video.env`：

```bash
sudo cp deploy/env/haitu-video.env.example /etc/haitu-video.env
sudo chmod 600 /etc/haitu-video.env
sudo nano /etc/haitu-video.env
```

最低成本默认值：

```env
HAITU_HOST=127.0.0.1
HAITU_PORT=4173
HAITU_DATA_DIR=/var/lib/haitu-video
HAITU_AUTH_PASSWORD=change-this-to-a-long-random-password
SEEDANCE_RESOLUTION=480p
SEEDANCE_WATERMARK=false
```

`HAITU_AUTH_PASSWORD` 会开启单管理员登录保护。VPS 挂到 `haitu.online` 前必须设置；只有本地开发时才可以留空。真实 API key 只放在 `/etc/haitu-video.env` 或控制台 BYOK 设置里，不写进仓库。

## systemd 服务

`deploy/systemd/haitu-video.service` 会读取 `/etc/haitu-video.env`。

```bash
sudo cp deploy/systemd/haitu-video.service /etc/systemd/system/haitu-video.service
sudo systemctl daemon-reload
sudo systemctl enable haitu-video
sudo systemctl restart haitu-video
sudo systemctl status haitu-video
```

检查本机健康状态：

```bash
curl -s http://127.0.0.1:4173/api/health
```

期望看到：

```json
{"ok":true,"service":"haitu-video-console","storage":"local"}
```

登录保护不会拦截 `/api/health`，所以 systemd/Cloudflare Tunnel 健康检查可以直接请求它。业务 API、视频文件、导出文件、BYOK 设置和控制台数据都需要管理员登录。

## Cloudflare Tunnel 免费入口

推荐生产拓扑：

```text
用户浏览器
  ↓
Cloudflare DNS / HTTPS / Tunnel
  ↓
服务器本机 127.0.0.1:4173
  ↓
Haitu Node 控制台服务
  ↓
/var/lib/haitu-video
```

步骤：

```bash
cloudflared tunnel login
cloudflared tunnel create haitu-video
cloudflared tunnel route dns haitu-video haitu.online
sudo mkdir -p /etc/cloudflared
sudo cp deploy/cloudflare/tunnel-config.example.yml /etc/cloudflared/config.yml
sudo nano /etc/cloudflared/config.yml
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

把 `deploy/cloudflare/tunnel-config.example.yml` 里的 `<你的隧道编号>` 替换为实际 tunnel id。浏览器访问 `https://haitu.online` 验证控制台。

Cloudflare Quick Tunnel 只能临时测试，不能作为生产入口。Cloudflare Pages 不适合本阶段默认方案，因为控制台依赖 Node API、文件存储和视频生成队列。Cloudflare Stream 不作为本阶段方案，当前只需要用户下载视频。Cloudflare R2 只是后续可选备份/对象存储，不作为本阶段默认依赖。

## Caddy 备用方案

如果不用 Tunnel，可以开放 80/443，并用 Cloudflare DNS 代理 + Caddy 反代到本机服务。这个方案也可以免费，但服务器公网端口会暴露，维护面更大。

```caddy
haitu.online {
  encode zstd gzip
  reverse_proxy 127.0.0.1:4173
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -s https://haitu.online/api/health
```

## 存储与备份

控制台有“存储与备份”面板，会读取 `/api/storage-backup` 展示必须备份的数据范围。也可以在面板里点“生成备份包”，系统会调用 `/api/backups`，在 `/var/lib/haitu-video/backups` 生成 `.tar.gz`，然后通过“下载备份”入口取回。

视频只保留 24 小时，页面会提醒用户尽快下载。备份默认不包含视频大文件，只包含长期数据和必要任务元数据。

服务器备份命令：

```bash
sudo tar -czf /var/backups/haitu-video-$(date +%Y%m%d).tar.gz \
  -C /var/lib haitu-video \
  --exclude='haitu-video/backups' \
  --exclude='haitu-video/workspaces/*/jobs/*/raw' \
  --exclude='haitu-video/workspaces/*/jobs/*/final'
```

如果需要排查问题，可以保留任务元数据：`job.json`、`make-video-report.json`。不要把代码目录混进长期数据备份，也不要备份套备份。

## 日常更新

```bash
cd /opt/haitu-video
npm ci
npm run deploy:check
sudo systemctl restart haitu-video
curl -s http://127.0.0.1:4173/api/health
```

## 运维注意

- 不要删除 `/var/lib/haitu-video`，里面包含商品、参考图、分镜历史、配置、审计日志和任务元数据。
- `/var/lib/haitu-video/workspaces/default` 是第一阶段默认工作区，第二阶段 PostgreSQL 和用户系统会把它映射成数据库里的默认工作区。
- 视频大文件只保留 24 小时，过期后会自动删除，用户应尽快下载。
- 先保持单机本地存储；后续用户变多后再迁移 PostgreSQL、Cloudflare R2/S3 和对象存储。
- 付费视频生成仍需要 `confirmPaid` 或 UI 里的确认动作。
