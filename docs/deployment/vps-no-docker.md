# VPS 无 Docker 部署

这份步骤用于第一阶段把 Haitu console 跑在已有 VPS 上，通过 Caddy 绑定 `haitu.online`。这一版不使用 Docker，不安装 Postgres/Redis，视频、商品、任务记录和配置仍保存在项目目录的 `outputs/` 和 `fixtures/products/`。

## 适用范围

- 适合内部 Web 版和小范围试用。
- Node 进程由 systemd 保活。
- Caddy 负责 HTTPS 和反向代理。
- Seedance/火山引擎仍是付费调用，部署本身不会触发生成请求。

## 服务器目录

建议放在：

```bash
/opt/haitu-video
```

长期保存目录：

```bash
/opt/haitu-video/outputs/
/opt/haitu-video/fixtures/products/
/opt/haitu-video/assets/products/
```

这些目录后续要纳入服务器备份。用户生成视频长期保存时，`outputs/` 不能随便清空；迁移服务器时也要一起迁移。

控制台的“成本台账”里有“存储与备份”面板，会读取 `/api/storage-backup` 展示当前必须备份的目录、容量、文件数和推荐 `tar` 命令。也可以在面板里点“生成备份包”，系统会在 `outputs/backups/` 生成 `.tar.gz`，并提供“下载备份”入口。新备份会排除 `outputs/backups/`，避免把旧备份包一层层打进新备份。

关键操作会写入 `outputs/audit-log.jsonl`，包括登录、BYOK 保存/清除、视频文件删除、任务取消/重试、发布素材创建和人工审核操作。这个文件包含操作轨迹，不包含 API key 或密码明文，也应随 `outputs/` 一起备份。

## 首次部署

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin haitu
sudo mkdir -p /opt/haitu-video
sudo chown -R haitu:haitu /opt/haitu-video
```

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
```

编辑真实配置：

```bash
sudo nano /etc/haitu-video.env
```

最低成本默认值：

```env
HOST=127.0.0.1
PORT=4173
HAITU_AUTH_PASSWORD=change-this-to-a-long-random-password
SEEDANCE_RESOLUTION=480p
SEEDANCE_WATERMARK=false
```

`HAITU_AUTH_PASSWORD` 会开启单管理员登录保护。VPS 挂到 `haitu.online` 前必须设置；只有本地开发时才可以留空。真实 API key 只放在 `/etc/haitu-video.env` 或后续 BYOK 设置里，不写进仓库。

## systemd 服务

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

登录保护不会拦截 `/api/health`，所以 systemd/Caddy 健康检查可以直接请求它。业务 API、视频文件、导出文件、BYOK 设置和控制台数据都需要管理员登录。

登录控制台后检查备份范围：

```bash
curl -s --cookie "haitu_session=..." http://127.0.0.1:4173/api/storage-backup
```

列出已生成的本地备份包：

```bash
curl -s --cookie "haitu_session=..." http://127.0.0.1:4173/api/backups
```

创建新的本地备份包：

```bash
curl -X POST --cookie "haitu_session=..." http://127.0.0.1:4173/api/backups
```

也可以直接在“成本台账”查看“存储与备份”。推荐备份命令形如：

```bash
cd /opt/haitu-video && tar -czf haitu-backup-$(date +%Y%m%d).tar.gz outputs fixtures/products assets/products
```

本地备份包默认保存在 `outputs/backups/`。这只能防误删和方便迁移，不等于异地备份；长期保存时要定期下载或同步到 R2/S3/另一台服务器。

## Caddy 反向代理

安装 Caddy 后，把 `deploy/caddy/Caddyfile` 的内容合并到服务器 Caddy 配置：

```caddy
haitu.online {
  encode zstd gzip
  reverse_proxy 127.0.0.1:4173
}
```

重载：

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

外部检查：

```bash
curl -s https://haitu.online/api/health
```

## 日常更新

```bash
cd /opt/haitu-video
npm ci
npm run deploy:check
sudo systemctl restart haitu-video
curl -s http://127.0.0.1:4173/api/health
```

## 运维注意

- 不要删除 `outputs/`，里面包含长期保存的视频、manifest、prompt、脚本、用量和成本记录。
- `outputs/audit-log.jsonl` 是本地操作审计日志，也属于客服排查和成本纠纷时需要保留的数据。
- `fixtures/products/` 和 `assets/products/` 也要备份，否则视频可以保留但商品事实包和参考图会丢。
- 先保持单机本地存储；后续用户变多后再迁移 Cloudflare R2/S3 和数据库。
- 付费视频生成仍需要 `confirmPaid` 或 UI 里的确认动作。
- 服务器只监听 `127.0.0.1:4173`，公网入口交给 Caddy。
