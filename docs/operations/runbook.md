# 运维手册

这份手册覆盖当前单 VPS 部署的日常运维。

## 健康检查

本机服务健康检查：

```bash
curl -s http://127.0.0.1:4173/api/health
```

期望响应：

```json
{"ok":true,"service":"haitu-video-console","storage":"local"}
```

生产公开检查：

```bash
curl -s https://haitu.online/api/health
curl -s https://haitu.online/robots.txt
curl -s https://haitu.online/sitemap.xml
npm run seo:check -- --base https://haitu.online
```

## 部署

在开发机上，常规部署命令是：

```bash
npm run deploy:vps
```

VPS 部署脚本会更新 `/opt/haitu-video`，安装依赖，执行迁移，跑部署检查，重启 systemd，检查本机健康状态，然后用 `HAITU_PUBLIC_BASE_URL` 运行 `npm run seo:check -- --base "$PUBLIC_BASE_URL"`。运行时数据继续保存在 `/var/lib/haitu-video`。

## 数据库迁移

在服务器上：

```bash
cd /opt/haitu-video
npm run db:migrate
```

必须长期保持 `HAITU_SECRET_KEY` 稳定。丢失它会导致数据库中加密的平台模型 key 和 BYOK key 无法解密。

## 备份

在线备份复制 SQLite 文件前，先 checkpoint WAL：

```bash
sudo -u haitu sqlite3 /var/lib/haitu-video/haitu.sqlite 'PRAGMA wal_checkpoint(TRUNCATE);'
```

然后打包运行时数据，可按需要排除嵌套备份和短期视频二进制文件：

```bash
sudo tar -czf /var/backups/haitu-video-$(date +%Y%m%d).tar.gz \
  -C /var/lib haitu-video \
  --exclude='haitu-video/backups' \
  --exclude='haitu-video/workspaces/*/jobs/*/raw' \
  --exclude='haitu-video/workspaces/*/jobs/*/final'
```

## 恢复

1. 停止 `haitu-video`。
2. 恢复 `/var/lib/haitu-video`。
3. 确认属主是 `haitu:haitu`。
4. 确认 `HAITU_SECRET_KEY` 与原环境一致。
5. 启动 `haitu-video`。
6. 跑健康检查并打开 `/admin`。

## 常见问题

登录邮件没收到：

- 检查 `RESEND_API_KEY` 和 `HAITU_AUTH_EMAIL_FROM`。
- 如果未配置 Resend，查看 `/var/lib/haitu-video/system/auth-email-outbox.jsonl`。

后台无法登录：

- 确认账号邮箱与 `HAITU_ADMIN_EMAIL` 一致。
- 确认用户已完成邮箱验证。
- 确认 `users.role` 是 `admin`。

视频在模型供应商 task 创建前失败：

- 检查商品参考图是否存在于工作区数据目录。
- 使用本地参考图时，检查公开域名是否能访问 `/api/public-assets/:token`。
- 检查 `/admin` 或 `/console` 设置里的模型供应商 key 状态。

钱包余额异常：

- 检查该工作区的 `wallet_transactions`。
- 余额由流水推导，不要修改不存在的账户余额字段。
- 失败任务应通过 refund 流水释放冻结金额。

生成视频消失：

- 检查视频保留策略和 `expires_at`。
- 先检查任务元数据、manifest 和 report；raw/final 视频二进制文件可能本来就是短期资产。
