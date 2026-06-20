# VPS 无 Docker 部署

这份步骤用于把 Haitu console 跑在已有 VPS 上，通过 Cloudflare Tunnel 免费入口绑定 `haitu.online`。第二阶段使用本机 SQLite 保存用户、工作区、权限、索引和 API 管理配置；图片、视频、字幕、manifest 和 report 等大文件仍保存在 `HAITU_DATA_DIR` 文件系统里。不使用 Docker/PostgreSQL/Redis，不使用 Cloudflare Pages、Cloudflare Stream，也不把 Cloudflare R2 作为本阶段默认依赖。

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
/var/lib/haitu-video/haitu.sqlite
/var/lib/haitu-video/haitu.sqlite-wal
/var/lib/haitu-video/haitu.sqlite-shm
```

更新代码前后都不能删除 `/var/lib/haitu-video`。迁移服务器时复制 `/var/lib/haitu-video` 即可，不要只复制代码仓库。

第二阶段默认 SQLite 文件是 `/var/lib/haitu-video/haitu.sqlite`，也可以用 `HAITU_DB_PATH` 覆盖。SQLite 会开启 WAL，所以同目录下的 `haitu.sqlite-wal` 和 `haitu.sqlite-shm` 也属于运行时数据库文件。操作审计日志会进入 SQLite；第一阶段保留的 `/var/lib/haitu-video/system/audit-log.jsonl` 仍可随数据目录备份。API Key 迁入 SQLite 后使用 `HAITU_SECRET_KEY` 加密保存，接口只返回 `keyPreview`。

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
HAITU_DB_PATH=/var/lib/haitu-video/haitu.sqlite
HAITU_SECRET_KEY=change-this-to-at-least-32-random-bytes
HAITU_ADMIN_EMAIL=you@haitu.online
BETTER_AUTH_URL=https://haitu.online
HAITU_AUTH_EMAIL_FROM=login@haitu.online
RESEND_API_KEY=
SEEDANCE_RESOLUTION=480p
SEEDANCE_WATERMARK=false
```

`HAITU_SECRET_KEY` 用于启用 SQLite 用户账号体系并加密数据库里的模型 API Key，生产环境必须使用至少 32 字节的随机值并长期保存；丢失后数据库中的加密 Key 无法解密。真实 API key 只放在 `/etc/haitu-video.env` 或控制台 API 管理设置里，不写进仓库。

账号注册和忘记密码使用邮箱验证码。配置 `RESEND_API_KEY` 和 `HAITU_AUTH_EMAIL_FROM` 后会发送真实邮件；未配置时验证码会写入 `/var/lib/haitu-video/system/auth-email-outbox.jsonl`，只适合本地调试。

`HAITU_ADMIN_EMAIL` 对应账号完成邮箱验证后，可以访问 `https://haitu.online/admin` 查看项目方后台。第一版后台只给项目方查看全站用户增长、活跃和用户列表，不开放普通用户访问。

初始化或升级 SQLite 表结构：

```bash
cd /opt/haitu-video
npm run db:migrate
```

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

登录保护不会拦截 `/api/health`，所以 systemd/Cloudflare Tunnel 健康检查可以直接请求它。业务 API、视频文件、导出文件、BYOK 设置和控制台数据都需要账号登录。

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
sudo -u haitu sqlite3 /var/lib/haitu-video/haitu.sqlite 'PRAGMA wal_checkpoint(TRUNCATE);'
sudo tar -czf /var/backups/haitu-video-$(date +%Y%m%d).tar.gz \
  -C /var/lib haitu-video \
  --exclude='haitu-video/backups' \
  --exclude='haitu-video/workspaces/*/jobs/*/raw' \
  --exclude='haitu-video/workspaces/*/jobs/*/final'
```

如果在线备份时不能先停服务，必须先执行 checkpoint 或使用 SQLite backup API，避免只备份 `haitu.sqlite` 而漏掉 WAL 里的新数据。恢复时把 `haitu.sqlite`、必要的 `haitu.sqlite-wal`/`haitu.sqlite-shm` 和文件数据一起恢复到 `/var/lib/haitu-video`，并确认属主仍是 `haitu:haitu`。

如果需要排查问题，可以保留任务元数据：`job.json`、`make-video-report.json`。不要把代码目录混进长期数据备份，也不要备份套备份。

## 日常更新

GitHub 是生产代码来源。推荐流程是本地开发并推送到 GitHub，然后让 VPS 从 GitHub 拉取代码部署：

```bash
npm run deploy:vps
```

这个命令会通过 SSH 执行 `/opt/haitu-video/deploy/scripts/deploy-from-github.sh`。脚本会在 VPS 上执行：

- `git fetch origin main`
- `git reset --hard origin/main`
- `git clean -fd`
- `npm ci`
- 读取 `/etc/haitu-video.env`
- `npm run db:migrate`
- `npm run deploy:check`
- `sudo systemctl restart haitu-video`
- `curl -fsS http://127.0.0.1:4173/api/health`

脚本只操作 `/opt/haitu-video` 代码目录；运行时数据继续保存在 `/var/lib/haitu-video`。

手动执行等价流程：

```bash
cd /opt/haitu-video
git fetch origin main
git reset --hard origin/main
git clean -fd
npm ci
npm run db:migrate
npm run deploy:check
sudo systemctl restart haitu-video
curl -s http://127.0.0.1:4173/api/health
```

## 运维注意

- 不要删除 `/var/lib/haitu-video`，里面包含 SQLite 数据库、商品、参考图、分镜历史、配置、审计日志和任务元数据。
- `/var/lib/haitu-video/workspaces/default` 是第一阶段默认工作区，第二阶段 SQLite 和用户系统会把它映射成数据库里的默认工作区。
- SQLite 只保存关系数据、索引、权限和文件路径；视频、图片、字幕和报告仍在文件系统。
- 视频大文件只保留 24 小时，过期后会自动删除，用户应尽快下载。
- 先保持单机本地存储；第二阶段优先迁入 SQLite；后续托管规模变大后再评估 PostgreSQL、Cloudflare R2/S3 和对象存储。
- 付费视频生成仍需要 `confirmPaid` 或 UI 里的确认动作。
