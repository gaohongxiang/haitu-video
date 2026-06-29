# 存储和资产模块

Haitu 把代码和运行时数据分开。运行时数据以 `HAITU_DATA_DIR` 为根目录；仓库代码和构建产物可以在部署时替换。

## 运行时目录

生产环境建议使用：

```text
HAITU_DATA_DIR=/var/lib/haitu-video
```

重要路径：

```text
<HAITU_DATA_DIR>/haitu.sqlite
<HAITU_DATA_DIR>/haitu.sqlite-wal
<HAITU_DATA_DIR>/haitu.sqlite-shm
<HAITU_DATA_DIR>/system/
<HAITU_DATA_DIR>/workspaces/<workspaceId>/products/
<HAITU_DATA_DIR>/workspaces/<workspaceId>/jobs/
<HAITU_DATA_DIR>/workspaces/<workspaceId>/settings/
<HAITU_DATA_DIR>/backups/
```

`src/server/storagePaths.ts` 是标准路径 helper。新代码不要手写工作区数据路径。

## 本地资产访问

需要认证的媒体路由只暴露允许的数据根目录下的文件。临时公开资产 URL 只用于让模型供应商访问本地参考图。

`PublicAssetTokenStore` 把短期 token 映射到一个已解析的本地文件路径、mime type、工作区和过期时间。`/api/public-assets/:token` 不要求登录，因为外部模型供应商无法携带用户浏览器会话。

Token 应短期有效、只读，并且只能指向运行时数据目录内已有文件。

## 备份

备份必须包含 SQLite 和长期工作区数据。在线备份时，应先 checkpoint SQLite WAL，或使用 SQLite backup API。

如果视频 raw/final 文件本来就是短期资产，可以从日常备份中排除；但任务元数据、report、manifest、审计日志、商品事实和设置应可恢复。

## 未来对象存储

只有当本地磁盘、模型供应商访问或多实例部署需要时，才引入对象存储。

目标形态：

- 引入 `AssetStorage` 接口；
- 保留本地存储作为开发和单节点 adapter；
- 增加兼容 S3 的 adapter，覆盖 R2/S3/TOS/OSS；
- 在 SQLite 中保存 object key 和元数据；
- 给模型供应商提供签名 HTTPS URL；
- 给用户提供认证下载或签名下载 URL；
- 通过懒迁移或 backfill job 迁移已有资产。

面向模型供应商的契约应保持稳定：输入商品本地资产，输出短期 HTTPS URL。
