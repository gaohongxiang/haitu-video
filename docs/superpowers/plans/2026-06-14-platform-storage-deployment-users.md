# 海兔视频平台存储、部署和用户系统实施计划

> **给执行新会话的要求：** 实施本计划时必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，逐项执行并在任务完成后打勾。本项目还在创建阶段，不需要兼容旧目录、旧数据结构或旧浏览器缓存。

**目标：** 分阶段把海兔视频从本地原型升级成可部署、可备份、可接用户系统的平台：第一阶段完成 VPS 单实例文件存储和免费部署，第二阶段接入 SQLite 和用户系统，第三阶段按需要迁移图片/视频到对象存储，未来托管规模变大时再迁 PostgreSQL。

**架构：** 代码目录和数据目录必须分离。第一阶段服务端通过 `HAITU_DATA_DIR` 找到运行时数据根目录；本地开发默认使用项目内 `./data`，生产服务器推荐使用 `/var/lib/haitu-video`。第二阶段引入 SQLite 保存用户、工作区、权限、商品索引、任务索引、模型配置和状态；图片、视频等大文件仍留在文件系统或后续对象存储里，数据库只保存元数据和归属关系。

**技术栈：** 现有 Node.js / TypeScript 服务端、React 控制台、Vitest 测试、VPS 单实例部署、Cloudflare 免费入口、第一阶段文件系统存储、第二阶段 SQLite。

---

## 一、分阶段路线

不要一次性把所有平台能力都堆进去。按下面三阶段推进：

### 第一阶段：VPS 单实例上线

目标：尽快部署给真实用户试用。

- 使用文件系统作为主存储。
- 使用 `HAITU_DATA_DIR` 管理运行时数据目录。
- 生产数据放 `/var/lib/haitu-video`。
- 预留 `workspaces/default` 目录结构。
- 暂不开放注册和多用户隔离。
- 视频只保留 24 小时，提醒用户尽快下载。
- 使用 Cloudflare Tunnel 免费入口。

第一阶段完成后，系统应该可以：

- 在 VPS 上稳定运行。
- 通过域名访问。
- 保存商品资料、参考图、分镜历史。
- 生成视频并让用户下载。
- 自动清理过期视频。
- 可备份和恢复。

### 第二阶段：SQLite + 用户系统

目标：让多个用户或团队安全使用同一个平台。

- 引入 SQLite，数据库文件放在 `HAITU_DATA_DIR` 下。
- 增加用户注册、登录、退出、密码重置或第三方登录。
- 增加 `workspaces` 表。
- 增加用户和工作区成员关系。
- 把当前 `workspaces/default` 映射成数据库里的默认工作区。
- 商品、分镜、视频任务仍可保留文件产物，但数据库保存索引、归属、状态和权限。
- API 不能再默认访问 `default`，必须从登录会话解析当前 `workspaceId`。

第二阶段完成后，系统应该可以：

- 每个用户只能看到自己的商品、分镜和视频任务。
- 管理员可以查看必要的系统状态。
- 用户删除账号或工作区时，可以清理对应数据。
- 后续可以自然扩展团队、店铺、套餐和计费。

### 第三阶段：对象存储和扩展能力

目标：当 VPS 磁盘或访问量成为瓶颈时再做。

- 图片和视频迁到 Cloudflare R2 或 S3 兼容对象存储。
- SQLite 继续保存文件元数据和对象 key。
- 如果后续变成多人托管、高并发、计费和多实例部署，再把 SQLite 迁移到 PostgreSQL。
- 视频仍默认 24 小时过期。
- 可以增加队列、后台 worker、限额、计费和更多安全审计。

第三阶段不是现在的执行范围，只是避免前两阶段把路堵死。

## 二、数据库和用户系统规划

第二阶段数据库选 SQLite。

当前第一阶段和 Huobao Drama 的定位一致：`API 管理`配置的是平台服务端使用的模型服务 Key，不是普通用户浏览器里的个人 Key。区别是 Huobao Drama 把 Key 存在 SQLite 的 `ai_service_configs.api_key`；海兔第一阶段把 Key 存在 `<HAITU_DATA_DIR>/workspaces/default/settings/provider-keys.json`。第二阶段迁到 SQLite 后，Key 进入数据库，但必须加密存储，API 返回时只返回 `keyPreview`，不能把完整 Key 返回浏览器、写进任务记录或审计日志。

为什么选 SQLite：

- 部署最简单，不需要安装数据库服务、建库、建用户或开放端口。
- 对开源自部署用户友好，复制一个 `HAITU_DATA_DIR` 就能备份和迁移。
- 适合当前单 VPS、单 Node 进程、小规模用户试用的阶段。
- 比纯文件 JSON 更适合用户、权限、任务、配置、审计这类关系数据。
- 可以用 WAL 模式提升读写体验；后续如果托管规模变大，再迁移 PostgreSQL。

SQLite 数据文件放在：

```text
<HAITU_DATA_DIR>/haitu.sqlite
<HAITU_DATA_DIR>/haitu.sqlite-wal
<HAITU_DATA_DIR>/haitu.sqlite-shm
```

数据库不存大文件：

- 图片不直接进数据库。
- 视频不直接进数据库。
- 数据库只保存文件路径、对象 key、状态、归属关系、过期时间、大小、哈希和审计信息。

第二阶段建议表：

```text
users
  id
  email
  password_hash
  display_name
  role
  created_at
  updated_at

workspaces
  id
  name
  owner_user_id
  created_at
  updated_at

workspace_members
  workspace_id
  user_id
  role
  created_at

products
  id
  workspace_id
  sku
  title
  product_json_path
  created_at
  updated_at

product_assets
  id
  workspace_id
  product_id
  kind
  storage_provider
  storage_path
  created_at

storyboards
  id
  workspace_id
  product_id
  style
  duration_seconds
  script
  created_at

video_jobs
  id
  workspace_id
  product_id
  status
  model
  language
  duration_seconds
  output_count
  job_dir
  created_at
  completed_at
  expires_at

video_assets
  id
  workspace_id
  job_id
  status
  storage_provider
  storage_path
  size_bytes
  expires_at
  deleted_at

provider_keys
  id
  workspace_id
  service_type
  provider
  name
  base_url
  model
  encrypted_key
  key_preview
  priority
  enabled
  created_at
  updated_at

audit_logs
  id
  actor_user_id
  workspace_id
  action
  target_type
  target_id
  created_at
```

第一阶段要为第二阶段做的预留：

- 所有商品和任务文件写入 `workspaceId: "default"`。
- 所有服务端 helper 都接受 `workspaceId`，只是当前传 `default`。
- API 层不要把 `default` 写死到深层函数里，集中在一个“当前工作区解析”函数里。
- 文件路径统一放在 `workspaces/<workspaceId>/...`，以后迁移数据库时不用重排文件。
- 清理过期视频时以 `workspaceId + jobId` 为边界。

第二阶段迁移策略：

- 启动迁移脚本扫描 `<HAITU_DATA_DIR>/workspaces/default`。
- 为现有数据创建一个管理员用户和默认工作区。
- 把 `<HAITU_DATA_DIR>/workspaces/default/settings/provider-keys.json` 里的模型配置迁入 `provider_keys` 表。
- 迁入 `provider_keys` 时，使用服务端环境变量 `HAITU_SECRET_KEY` 或同等级密钥派生出的加密 key 生成 `encrypted_key`，数据库不能保存明文 API Key。
- 迁移后 API 仍只返回 `configured`、`keySource` 和 `keyPreview`，不能返回完整 API Key。
- 把已有商品写入 `products` 表。
- 把已有参考图写入 `product_assets` 表。
- 把已有分镜历史写入 `storyboards` 表。
- 把已有视频任务写入 `video_jobs` 和 `video_assets` 表。
- 文件本身先不移动，只把路径登记进数据库。

## 三、部署存储原则

这次不要设计“本地存储”和“服务器存储”两套逻辑，也不需要它们自动共存或同步。

正确设计是：

```text
同一套存储结构，不同环境使用不同 HAITU_DATA_DIR。
```

本地开发：

```text
HAITU_DATA_DIR=./data
```

生产服务器：

```text
HAITU_DATA_DIR=/var/lib/haitu-video
```

原则：

- 代码仓库只放代码，不放正式用户数据。
- 服务器更新代码时不能影响 `/var/lib/haitu-video` 里的用户数据。
- 备份、迁移、恢复只围绕 `HAITU_DATA_DIR` 做。
- 当前按单台 VPS 单实例设计，不做多服务器共享存储。
- 为后续接用户系统，从现在起数据目录预留 `workspaces/default` 这一层。当前不做多用户登录和权限隔离，只使用默认工作区；以后接用户系统时，把登录用户映射到对应工作区即可。
- 以后如果要多实例、多人高并发、独立租户隔离，再升级到“数据库 + 对象存储”。现在不要过度设计。

## 四、免费部署方案

目标是“尽量免费”，但要把免费边界说清楚：

- Cloudflare 免费方案可以做域名接入、HTTPS、基础 CDN、防护和 Tunnel 入口。
- 应用本身仍然需要一台能长期运行 Node 服务和视频生成进程的服务器。已有 VPS 就用已有 VPS；如果以后要找永久免费算力，可以另行评估 Oracle Cloud Always Free 这类方案，但不要把本阶段绑定到不稳定的免费服务器资源上。
- 视频、商品图片、任务记录默认存服务器本地 `/var/lib/haitu-video`，不先接付费数据库或对象存储。
- 生成视频是临时文件，只保留 24 小时，页面必须提醒用户尽快下载；过期后自动删除视频文件。
- Cloudflare R2 可以作为后续可选项：免费额度适合小规模备份或冷启动试用，但超过免费额度会计费，所以不要作为本阶段默认依赖。
- Cloudflare Stream 不作为本阶段方案；当前只需要用户下载视频，不需要公开视频托管和在线播放分发。
- Cloudflare Pages 不作为本阶段默认方案；当前控制台依赖 Node API、文件存储和视频生成队列，先用一个服务端应用整体部署更简单。

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

首选入口方案：Cloudflare Tunnel。

- Node 服务只监听 `127.0.0.1:4173`。
- 服务器不需要暴露 80/443 给公网。
- Cloudflare 负责公网域名和 HTTPS。
- `cloudflared` 作为系统服务常驻。

备用入口方案：Cloudflare DNS 代理 + Caddy。

- 如果不用 Tunnel，可以开放 80/443。
- Cloudflare DNS 指向服务器公网 IP。
- Caddy 反代到 `127.0.0.1:4173`。
- 这条路线也可以免费，但服务器公网端口会暴露，维护面更大。

本阶段推荐写文档和配置时以 Cloudflare Tunnel 为主，Caddy 只保留为备用方案。

## 五、第一阶段目标存储结构

统一使用下面的运行时目录结构，目录根由 `HAITU_DATA_DIR` 决定：

```text
<HAITU_DATA_DIR>/
  system/
    console-settings.json
    console-sessions.json
    audit-log.jsonl
  workspaces/
    default/
      products/
        <商品编号>/
          product.json
          refs/
            reference-01.jpeg
            reference-02.jpeg
          storyboards.json
      jobs/
        <任务编号>/
          job.json
          make-video-report.json
          raw/
            manifest.json
            source.mp4
          final/
            final.mp4
            final.ass
            final-manifest.json
      settings/
        provider-keys.json
  settings/
  backups/
```

核心规则：

- 商品是工作区内的根实体：商品资料、参考图、AI 分镜历史都挂在 `<HAITU_DATA_DIR>/workspaces/default/products/<商品编号>/` 下。
- 视频任务是工作区内的执行实体：每次生成视频都挂在 `<HAITU_DATA_DIR>/workspaces/default/jobs/<任务编号>/` 下。
- 当前只有 `default` 工作区，前端暂时不展示工作区概念。
- `job.json` 和 `product.json` 都写入 `workspaceId: "default"`，为后续用户系统预留关联字段。
- 视频文件只保留 24 小时；任务元数据可以保留更久用于排查，但过期视频不能再预览和下载。
- `system/` 存服务级数据，例如会话、全局设置、审计日志。
- `workspaces/default/settings/` 存默认工作区的模型/API 配置。以后多用户时可以按工作区拆分。
- 浏览器不再保存业务数据；分镜历史必须进服务端文件。
- 不再使用 `fixtures/products`、`assets/products`、`outputs/video-jobs` 作为运行时存储。
- 备份只打包 `HAITU_DATA_DIR` 里的长期数据，不能把代码目录混进去；视频临时产物默认不进入长期备份。

## 六、需要替换的当前存储

- `fixtures/products/*.json`：当前商品资料。
- `assets/products/<商品编号>/reference-*`：当前参考图。
- `outputs/video-jobs/*.json`：当前任务状态。
- `outputs/<任务编号>/...`：当前视频产物。
- `outputs/provider-keys.json`：当前模型密钥配置。
- `outputs/console-settings.json`：当前控制台设置。
- `outputs/console-sessions.json`：当前登录会话。
- `outputs/audit-log.jsonl`：当前审计日志。
- 浏览器本地缓存：
  - `haitu.storyboardHistory.v1`
  - `haitu.productStudio.productSku.v1`

## 七、第一阶段文件职责

- 新增 `src/server/storagePaths.ts`：读取和解析 `HAITU_DATA_DIR`，统一生成所有运行时存储路径，保证路径不能逃出数据根目录。
- 修改 `src/server/consoleServer.ts`：商品、参考图、分镜历史、设置、日志、媒体访问、备份接口都改用数据根目录。
- 修改 `src/server/videoJobQueue.ts`：任务状态写入 `<HAITU_DATA_DIR>/workspaces/default/jobs/<任务编号>/job.json`。
- 修改 `src/server/jobLedger.ts`：历史记录从 `<HAITU_DATA_DIR>/workspaces/default/jobs/*/make-video-report.json` 扫描。
- 新增 `src/server/videoRetention.ts`：清理超过 24 小时的视频文件，保留必要任务元数据。
- 修改 `src/pipeline/makeVideoPipeline.ts`：队列任务的输出目录使用 `<HAITU_DATA_DIR>/workspaces/default/jobs/<任务编号>/`。
- 修改 `src/client/App.tsx`：前端分镜历史改为服务端读写，去掉业务本地缓存。
- 修改 `deploy/env/haitu-video.env.example`：增加生产数据目录配置。
- 修改 `deploy/systemd/haitu-video.service`：确保服务读取环境文件。
- 新增 `deploy/cloudflare/tunnel-config.example.yml`：Cloudflare Tunnel 示例配置。
- 修改 `docs/deployment/vps-no-docker.md`：部署文档改成 `/var/lib/haitu-video` 数据目录。
- 修改 `.gitignore`：忽略本地开发的 `data/`。
- 修改相关测试：更新所有仍断言旧目录的测试。

## 八、第一阶段实施任务

### 任务 1：新增统一路径模块

**文件：**

- 新增：`src/server/storagePaths.ts`
- 新增：`tests/server/storagePaths.test.ts`

**步骤：**

- [x] 新增 `src/server/storagePaths.ts`，提供这些能力：
  - 从 `HAITU_DATA_DIR` 读取数据根目录。
  - 没有设置 `HAITU_DATA_DIR` 时，本地默认使用项目根目录下的 `data/`。
  - 允许测试通过参数传入临时数据目录。
  - 返回 `system/`、`workspaces/`、`workspaces/default/`、`products/`、`jobs/`、`settings/`、`backups/` 路径。
  - 当前写死默认工作区 `default`，但路径函数接受 `workspaceId` 参数，方便以后接用户系统。
  - 根据商品编号返回商品目录、商品文件、参考图目录、分镜历史文件。
  - 根据任务编号返回任务目录、任务文件、报告文件、原始视频目录、最终视频目录。
  - 清洗商品编号和任务编号，禁止 `../` 这类路径穿越。

建议接口：

```ts
export function resolveDataDir(input: {
  rootDir: string;
  dataDir?: string;
  env?: NodeJS.ProcessEnv;
}): string;

export function getStorageRoots(dataDir: string): {
  dataDir: string;
  systemDir: string;
  workspacesDir: string;
  backupsDir: string;
};

export function getWorkspacePaths(dataDir: string, workspaceId?: string): {
  workspaceId: string;
  dir: string;
  productsDir: string;
  jobsDir: string;
  settingsDir: string;
  providerKeysFile: string;
};

export function getProductPaths(dataDir: string, workspaceId: string, sku: string): {
  dir: string;
  productFile: string;
  refsDir: string;
  storyboardsFile: string;
};

export function getJobPaths(dataDir: string, workspaceId: string, jobId: string): {
  dir: string;
  jobFile: string;
  reportFile: string;
  rawDir: string;
  finalDir: string;
};
```

- [x] 新增测试，覆盖：
  - 未设置环境变量时返回 `<项目根>/data`。
  - 设置 `HAITU_DATA_DIR=/var/lib/haitu-video` 时返回该目录。
  - 测试传入临时目录时优先使用临时目录。
  - 默认工作区路径为 `<数据目录>/workspaces/default`。
  - 商品编号和任务编号不能逃出数据目录。
  - 服务级目录、工作区目录和备份目录都在数据目录内。

运行：

```bash
npm test -- tests/server/storagePaths.test.ts
```

预期：新增测试通过。

### 任务 2：让服务端统一接入数据根目录

**文件：**

- 修改：`src/server/consoleServer.ts`
- 修改：`tests/server/consoleApi.test.ts`

**步骤：**

- [x] 给控制台服务增加 `dataDir?: string` 配置项，测试可以传临时目录。
- [x] 服务启动时调用 `resolveDataDir`，后续所有运行时文件都从这个目录派生。
- [x] 当前请求统一使用默认工作区 `default`。
- [x] 给商品、分镜、任务相关 helper 传入 `workspaceId: "default"`。
- [x] 删除 `fixturesDir` 和 `outputsDir` 作为主要运行时配置的职责。
- [x] 所有路径判断统一用“不能逃出数据根目录”。

运行：

```bash
npm test -- tests/server/consoleApi.test.ts
```

预期：测试服务可以使用临时数据目录启动，不依赖项目里的旧目录。

### 任务 3：重构商品存储

**文件：**

- 修改：`src/server/consoleServer.ts`
- 修改：`tests/server/consoleApi.test.ts`

**步骤：**

- [x] 商品列表改为扫描 `<HAITU_DATA_DIR>/workspaces/default/products/*/product.json`。
- [x] 商品详情改为读取 `<HAITU_DATA_DIR>/workspaces/default/products/<商品编号>/product.json`。
- [x] 新增和编辑商品时写入 `<HAITU_DATA_DIR>/workspaces/default/products/<商品编号>/product.json`。
- [x] 删除商品时递归删除 `<HAITU_DATA_DIR>/workspaces/default/products/<商品编号>/`。
- [x] 参考图上传、导入、AI 生成都写入 `<HAITU_DATA_DIR>/workspaces/default/products/<商品编号>/refs/`。
- [x] 商品文件里的参考图路径改成商品相对路径。
- [x] 商品文件写入 `workspaceId: "default"`。

商品文件示例：

```json
{
  "sku": "arm-cover-cool",
  "title": "接触冷感アームカバー",
  "reference_images": [
    "refs/reference-01.jpeg",
    "refs/reference-02.jpeg"
  ]
}
```

- [x] 删除所有旧路径兼容逻辑，不再读取 `fixtures/products` 或 `assets/products`。

运行：

```bash
npm test -- tests/server/consoleApi.test.ts
```

预期：商品增删改查、参考图上传和读取全部通过。

### 任务 4：把分镜历史移到商品目录

**文件：**

- 修改：`src/server/consoleServer.ts`
- 修改：`src/client/App.tsx`
- 修改：`tests/server/consoleApi.test.ts`

**新增接口：**

```text
GET    /api/products/:sku/storyboards
POST   /api/products/:sku/storyboards
DELETE /api/products/:sku/storyboards/:id
```

**存储位置：**

```text
<HAITU_DATA_DIR>/workspaces/default/products/<商品编号>/storyboards.json
```

**记录结构：**

```ts
type StoryboardRecord = {
  id: string;
  createdAt: string;
  style: VideoStyle;
  duration: number;
  script: string;
};
```

**步骤：**

- [x] 服务端新增读取、写入、删除分镜历史的接口。
- [x] 前端删除 `haitu.storyboardHistory.v1` 的使用。
- [x] AI 生成分镜成功后自动写入服务端历史。
- [x] 分镜历史下拉框从服务端读取。
- [x] 点击历史主体即可回填脚本。
- [x] 历史记录增加删除按钮。
- [x] 删除独立“回填”按钮。

运行：

```bash
npm test -- tests/server/consoleApi.test.ts
```

预期：分镜历史新增、读取、删除都通过；刷新页面后历史仍存在。

### 任务 5：重构视频任务和视频历史

**文件：**

- 修改：`src/server/videoJobQueue.ts`
- 修改：`src/server/jobLedger.ts`
- 新增：`src/server/videoRetention.ts`
- 修改：`src/server/consoleServer.ts`
- 修改：`src/pipeline/makeVideoPipeline.ts`
- 修改：`tests/server/consoleVideoJobQueue.test.ts`
- 新增：`tests/server/videoRetention.test.ts`
- 修改：`tests/server/consoleApi.test.ts`

**规则：**

- 任务状态写入 `<HAITU_DATA_DIR>/workspaces/default/jobs/<任务编号>/job.json`。
- 队列传给视频流水线的输出目录就是 `<HAITU_DATA_DIR>/workspaces/default/jobs/<任务编号>/`。
- `job.json` 写入 `workspaceId: "default"`。
- 每个已完成视频记录写入 `createdAt` 和 `expiresAt`。
- `expiresAt = createdAt + 24 小时`。
- 视频流水线在任务目录下写：
  - `raw/`
  - `final/`
  - `make-video-report.json`
- 历史记录扫描 `<HAITU_DATA_DIR>/workspaces/default/jobs/*/make-video-report.json`。

**前端文案统一：**

- `生成版本` 改为 `生成视频`。
- `版本 1` 改为 `视频 1`。
- `最近版本` 改为 `历史记录`。

**视频历史行为：**

- 历史记录区域用固定高度滚动框展示全部视频。
- 生成中视频要立刻出现在历史记录里。
- 生成中视频显示转圈状态。
- 生成中视频可删除，删除即取消或移除任务。
- 已完成真实视频可预览、下载、设为最终、删除。
- 本地模拟但没有真实视频文件的记录不显示预览按钮。
- 删除视频需要二次确认，避免误删。
- 视频历史里显示过期时间提示，例如“24 小时内可下载”或“剩余 23 小时”。
- 已过期视频显示“已过期”，不显示预览和下载按钮。

**24 小时自动清理：**

- [x] 新增 `src/server/videoRetention.ts`。
- [x] 服务启动时执行一次过期视频清理。
- [x] 服务运行中定时清理，建议每 30 分钟执行一次。
- [x] 清理时删除 `raw/` 和 `final/` 里的视频大文件。
- [x] 清理时保留 `job.json` 和 `make-video-report.json` 里的基础信息，方便历史记录显示“已过期”。
- [x] 清理后历史记录仍保留标题、模型、时长、生成时间、过期状态。
- [x] 删除失败时写入审计日志，不让清理任务拖垮主服务。

运行：

```bash
npm test -- tests/server/videoRetention.test.ts
npm test -- tests/server/consoleVideoJobQueue.test.ts
npm test -- tests/server/consoleApi.test.ts
```

预期：任务创建、状态刷新、历史记录、预览条件、删除行为、24 小时过期清理都通过。

### 任务 6：迁移设置、会话和日志

**文件：**

- 修改：`src/server/consoleServer.ts`

**新位置：**

- `<HAITU_DATA_DIR>/workspaces/default/settings/provider-keys.json`
- `<HAITU_DATA_DIR>/system/console-settings.json`
- `<HAITU_DATA_DIR>/system/console-sessions.json`
- `<HAITU_DATA_DIR>/system/audit-log.jsonl`

**步骤：**

- [x] API 管理里的密钥配置读写 `<HAITU_DATA_DIR>/workspaces/default/settings/provider-keys.json`。
- [x] 控制台全局设置读写 `<HAITU_DATA_DIR>/system/console-settings.json`。
- [x] 登录会话读写 `<HAITU_DATA_DIR>/system/console-sessions.json`。
- [x] 审计日志写入 `<HAITU_DATA_DIR>/system/audit-log.jsonl`。
- [x] 删除从 `outputs/` 读取这些文件的逻辑。

运行：

```bash
npm test -- tests/server/consoleApi.test.ts
```

预期：配置保存、测试配置、会话和日志不再依赖 `outputs/`。

### 任务 7：限制媒体文件访问范围

**文件：**

- 修改：`src/server/consoleServer.ts`
- 修改：`tests/server/consoleApi.test.ts`

**步骤：**

- [x] 新增媒体路径解析 helper，只允许访问 `HAITU_DATA_DIR` 下的文件。
- [x] 商品参考图预览从 `<HAITU_DATA_DIR>/workspaces/default/products/<商品编号>/refs/` 读取。
- [x] 视频预览从 `<HAITU_DATA_DIR>/workspaces/default/jobs/<任务编号>/final/` 或 `raw/` 读取。
- [x] 拒绝路径穿越请求。

建议 helper：

```ts
function resolveDataMediaPath(dataDir: string, requestedPath: string): string
```

运行：

```bash
npm test -- tests/server/consoleApi.test.ts
```

预期：参考图预览、视频预览可用；路径穿越请求被拒绝。

### 任务 8：免费部署配置和 Cloudflare Tunnel

**文件：**

- 修改：`deploy/env/haitu-video.env.example`
- 修改：`deploy/systemd/haitu-video.service`
- 新增：`deploy/cloudflare/tunnel-config.example.yml`
- 修改：`docs/deployment/vps-no-docker.md`
- 修改：部署相关测试文件，如存在 `tests/deploy/noDockerDeploy.test.ts`

**步骤：**

- [x] 环境文件示例增加：

```bash
HAITU_DATA_DIR=/var/lib/haitu-video
```

- [x] 环境文件示例明确生产服务只监听本机：

```bash
HAITU_HOST=127.0.0.1
HAITU_PORT=4173
```

- [x] systemd 服务继续读取 `/etc/haitu-video.env`。
- [x] 部署文档要求服务器创建数据目录：

```bash
sudo mkdir -p /var/lib/haitu-video
sudo chown -R haitu:haitu /var/lib/haitu-video
```

- [x] 部署文档说明：代码目录可以是 `/opt/haitu-video`，数据目录必须是 `/var/lib/haitu-video`，两者不要混在一起。
- [x] 部署文档说明：迁移服务器时复制 `/var/lib/haitu-video` 即可，不要只复制代码仓库。
- [x] 部署文档说明：更新代码前后都不能删除 `/var/lib/haitu-video`。
- [x] 新增 Cloudflare Tunnel 示例配置：

```yaml
tunnel: <你的隧道编号>
credentials-file: /etc/cloudflared/<你的隧道编号>.json

ingress:
  - hostname: haitu.online
    service: http://127.0.0.1:4173
  - service: http_status:404
```

- [x] 部署文档增加 Cloudflare 免费入口步骤：
  - 把域名接入 Cloudflare 免费方案。
  - 创建 Cloudflare Tunnel。
  - 把 `haitu.online` 路由到 Tunnel。
  - 服务器安装并启动 `cloudflared` 服务。
  - 浏览器访问 `https://haitu.online` 验证控制台。

建议命令写入部署文档：

```bash
cloudflared tunnel login
cloudflared tunnel create haitu-video
cloudflared tunnel route dns haitu-video haitu.online
sudo mkdir -p /etc/cloudflared
sudo cp deploy/cloudflare/tunnel-config.example.yml /etc/cloudflared/config.yml
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

- [x] 部署文档说明 Cloudflare Quick Tunnel 只能临时测试，不能作为生产入口。
- [x] 部署文档保留 Caddy 直连作为备用方案，但默认推荐 Cloudflare Tunnel。
- [x] 部署文档明确本阶段不使用 Cloudflare Pages、Cloudflare Stream。
- [x] 部署文档明确 Cloudflare R2 只是后续可选备份/对象存储，不作为本阶段默认依赖。

运行：

```bash
npm test -- tests/deploy/noDockerDeploy.test.ts
```

预期：部署配置和部署文档都包含 `HAITU_DATA_DIR=/var/lib/haitu-video`，并包含 Cloudflare Tunnel 免费入口说明。

### 任务 9：备份只处理数据根目录

**文件：**

- 修改：`src/server/consoleServer.ts`
- 修改：`docs/deployment/vps-no-docker.md`
- 修改：相关测试。

**步骤：**

- [x] 备份只包含：
  - `<HAITU_DATA_DIR>/workspaces/default/products`
  - `<HAITU_DATA_DIR>/workspaces/default/settings`
  - `<HAITU_DATA_DIR>/system`
- [x] 默认不备份 `<HAITU_DATA_DIR>/workspaces/default/jobs` 里的视频大文件，因为视频只保留 24 小时，用户应下载后自行保存。
- [x] 如需排查，可以只备份任务元数据：`job.json`、`make-video-report.json`。
- [x] 备份写入 `<HAITU_DATA_DIR>/backups`。
- [x] 备份时排除 `<HAITU_DATA_DIR>/backups`，避免备份套备份。
- [x] 备份时排除 `<HAITU_DATA_DIR>/workspaces/*/jobs/*/raw` 和 `<HAITU_DATA_DIR>/workspaces/*/jobs/*/final`。
- [x] 旧的 `fixtures/`、`assets/products/`、`outputs/` 不再进入备份。
- [x] 部署文档给出服务器备份命令：

```bash
sudo tar -czf /var/backups/haitu-video-$(date +%Y%m%d).tar.gz \
  -C /var/lib haitu-video \
  --exclude='haitu-video/backups' \
  --exclude='haitu-video/workspaces/*/jobs/*/raw' \
  --exclude='haitu-video/workspaces/*/jobs/*/final'
```

运行：

```bash
npm test
```

预期：备份相关测试通过，完整测试通过。

### 任务 10：清理旧运行时目录和忽略规则

**文件：**

- 修改：`.gitignore`
- 视情况新增：`data/.gitkeep`

**步骤：**

- [x] `.gitignore` 忽略本地开发数据。

建议内容：

```gitignore
/data/
!/data/.gitkeep
```

- [x] 如果仍需要演示商品，不要放在运行时数据目录，改放：

```text
examples/products/
```

- [x] 完成代码修改后，本地可以重置旧运行时目录：

```bash
rm -rf fixtures/products assets/products outputs
mkdir -p data/products data/jobs data/settings data/backups
```

注意：执行删除前先确认没有需要保留的真实数据。

## 九、第一阶段验收状态

状态：已完成，可以开始第二阶段 SQLite + 用户系统。

已完成的第一阶段范围：

- [x] 运行时数据由 `HAITU_DATA_DIR` 控制，本地默认 `./data`，生产推荐 `/var/lib/haitu-video`。
- [x] 不兼容旧 `fixtures/products`、`assets/products`、`outputs` 和旧浏览器分镜缓存。
- [x] 预留 `workspaces/default`，`product.json` 和 `job.json` 写入 `workspaceId: "default"`。
- [x] 商品、参考图、分镜历史、任务记录、系统设置、API 管理配置和审计日志都写入数据目录。
- [x] 视频只保留 24 小时，过期自动删除视频大文件，页面显示过期/下载提醒。
- [x] 备份只处理数据根目录里的长期数据和任务元数据，默认不包含视频大文件。
- [x] 部署文档以 Cloudflare Tunnel 为首选入口，Caddy 只作为备用。
- [x] SQLite 和用户系统没有阻塞第一阶段上线，已作为第二阶段规划。

2026-06-15 已运行第一阶段完整验证命令：

```bash
npm test -- tests/server/storagePaths.test.ts
npm test -- tests/server/consoleApi.test.ts tests/server/consoleVideoJobQueue.test.ts tests/server/videoRetention.test.ts
npm run typecheck
npm test
npm run build:console
npm test -- tests/deploy/noDockerDeploy.test.ts
```

验证结果：

- `tests/server/storagePaths.test.ts`：6 tests passed。
- `tests/server/consoleApi.test.ts`、`tests/server/consoleVideoJobQueue.test.ts`、`tests/server/videoRetention.test.ts`：101 tests passed。
- `npm run typecheck`：passed。
- `npm test`：32 files / 205 tests passed。
- `npm run build:console`：passed；仅有 Vite chunk size warning，不影响第一阶段验收。
- `tests/deploy/noDockerDeploy.test.ts`：1 test passed。

## 十、第二阶段：SQLite 和用户系统

第二阶段不要和第一阶段混在同一个 PR 里。第一阶段先把 VPS 单实例文件存储跑稳；第二阶段再按下面任务执行。

### 任务 11：接入 SQLite 基础设施

**文件：**

- 新增：`src/server/db/client.ts`
- 新增：`src/server/db/migrations/`
- 新增：`src/server/db/schema.ts`
- 新增：`src/server/db/migrate.ts`
- 修改：`package.json`
- 修改：`deploy/env/haitu-video.env.example`
- 修改：`docs/deployment/vps-no-docker.md`
- 新增：`tests/server/db.test.ts`

**步骤：**

- [x] 增加 SQLite 依赖和迁移工具，优先使用 `better-sqlite3` + Drizzle ORM。
- [x] 环境变量增加：

```bash
HAITU_DB_PATH=/var/lib/haitu-video/haitu.sqlite
HAITU_SECRET_KEY=<至少32字节随机密钥，用于加密数据库中的模型 API Key>
```

- [x] 如果未设置 `HAITU_DB_PATH`，默认使用 `<HAITU_DATA_DIR>/haitu.sqlite`。
- [x] 新增数据库连接模块，启动时开启 WAL：

```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 30000;
PRAGMA foreign_keys = ON;
```

- [x] 新增迁移执行命令，例如：

```bash
npm run db:migrate
```

- [x] 新增首批表：
  - `users`
  - `workspaces`
  - `workspace_members`
  - `products`
  - `product_assets`
  - `storyboards`
  - `video_jobs`
  - `video_assets`
  - `provider_keys`
  - `audit_logs`
- [x] `provider_keys` 表禁止保存明文 API Key，只保存 `encrypted_key`、`key_preview` 和配置元数据。
- [x] 新增服务端 Key 加密/解密 helper，并覆盖测试：
  - 同一个明文 Key 加密后数据库不包含原文。
  - 解密后可以供模型调用。
  - API 响应只包含 `keyPreview`，不包含完整 Key。
- [x] 保留第一阶段 `provider-keys.json` 读取能力用于迁移；迁移成功后运行时优先读 SQLite。
- [x] 部署文档增加 SQLite 文件位置、权限、WAL 文件、备份和恢复命令。
- [x] 备份时包含 `haitu.sqlite`，并说明在线备份前先执行 checkpoint 或使用 SQLite backup API，避免漏掉 WAL 里的新数据。

运行：

```bash
npm test -- tests/server/db.test.ts
```

预期：测试库可连接，迁移可执行，基础表存在，WAL/外键配置生效。

### 任务 12：用户登录和工作区解析

**文件：**

- 新增：`src/server/auth/`
- 修改：`src/server/consoleServer.ts`
- 修改：`src/client/App.tsx`
- 新增：`tests/server/auth.test.ts`

**步骤：**

- [x] 增加用户注册、登录、退出接口。
- [x] 密码只保存哈希，不保存明文。
- [x] 登录后服务端会话关联 `userId`。
- [x] 新增当前工作区解析函数：

```ts
async function resolveCurrentWorkspace(request: Request): Promise<{
  userId: string;
  workspaceId: string;
}>;
```

- [x] 第一版每个用户默认创建一个个人工作区。
- [x] API 层不再默认写死 `default`，而是从登录会话解析 `workspaceId`。
- [x] 未登录请求不能访问商品、分镜、视频任务接口。

运行：

```bash
npm test -- tests/server/auth.test.ts
npm test -- tests/server/consoleApi.test.ts
```

预期：登录用户只能访问自己的工作区数据。

### 任务 13：把文件数据登记进数据库

**文件：**

- 新增：`src/server/db/importFileWorkspace.ts`
- 新增：`tests/server/importFileWorkspace.test.ts`

**步骤：**

- [x] 扫描 `<HAITU_DATA_DIR>/workspaces/default`。
- [x] 创建一个管理员用户。
- [x] 创建默认工作区。
- [x] 把商品登记到 `products` 表。
- [x] 把参考图登记到 `product_assets` 表。
- [x] 把分镜历史登记到 `storyboards` 表。
- [x] 把视频任务登记到 `video_jobs` 表。
- [x] 把视频文件登记到 `video_assets` 表。
- [x] 文件本身先不移动，只登记路径。

运行：

```bash
npm test -- tests/server/importFileWorkspace.test.ts
```

预期：第一阶段的文件数据可以无损登记进 SQLite。

### 任务 14：用数据库索引驱动列表和权限

**文件：**

- 修改：`src/server/consoleServer.ts`
- 修改：`src/server/jobLedger.ts`
- 修改：`src/client/App.tsx`
- 修改：`tests/server/consoleApi.test.ts`

**步骤：**

- [x] 商品列表从数据库查，不再全量扫描文件目录。
- [x] 视频历史从数据库查，不再全量扫描任务目录。
- [x] 分镜历史从数据库查。
- [x] 文件路径仍指向文件系统。
- [x] 删除商品时先校验 `workspaceId` 权限，再删除数据库记录和文件目录。
- [x] 删除视频时先校验 `workspaceId` 权限，再删除数据库记录和文件。
- [x] 24 小时视频过期清理同时更新 `video_assets.deleted_at` 和状态。

运行：

```bash
npm test -- tests/server/consoleApi.test.ts tests/server/videoRetention.test.ts
```

预期：所有列表和删除操作都受工作区权限约束。

验证结果：

- `tests/server/auth.test.ts`：11 tests passed，覆盖注册/登录/退出、未登录控制台 shell、会话解析、用户工作区隔离、商品/导入/分镜/视频历史权限边界、SQLite 索引同步、当前工作区 provider key 使用、全工作区视频过期清理。
- `tests/server/importFileWorkspace.test.ts`：1 test passed，覆盖第一阶段 `workspaces/default` 文件数据导入 SQLite。
- `tests/server/consoleApi.test.ts`：92 tests passed，覆盖原控制台 API、SQLite provider key 加密、legacy key 迁移和前端邮箱密码统一入口。
- `tests/server/videoRetention.test.ts`：3 tests passed，覆盖过期文件清理和 `video_assets.deleted_at`/状态更新。
- `npm run typecheck`：passed。
- `npm test`：35 files / 228 tests passed。
- `npm run build:console`：passed；Vite 仍提示单个 chunk 超过 500 kB，是既有体积警告，不影响构建产物。

## 十一、最终验证

第一阶段完成后运行：

```bash
npm test -- tests/server/storagePaths.test.ts
npm test -- tests/server/consoleApi.test.ts tests/server/consoleVideoJobQueue.test.ts tests/server/videoRetention.test.ts
npm run typecheck
npm test
npm run build:console
```

第一阶段部署相关验证：

```bash
npm test -- tests/deploy/noDockerDeploy.test.ts
```

第一阶段手动验证：

1. 本地不设置 `HAITU_DATA_DIR`，启动后数据写入项目内 `data/`。
2. 本地临时设置 `HAITU_DATA_DIR=/tmp/haitu-video-test-data`，启动后数据写入该目录。
3. 数据实际落在 `<HAITU_DATA_DIR>/workspaces/default/` 下。
4. 新建商品，填写商品资料并上传图片。
5. 商品文件包含 `workspaceId: "default"`。
6. 点击 AI 整理资料包，刷新后商品和图片仍存在。
7. 生成分镜，分镜历史自动出现。
8. 刷新页面，分镜历史仍存在。
9. 点击分镜历史主体，脚本能回填。
10. 删除分镜历史，刷新后不再出现。
11. 生成视频，新视频立刻出现在历史记录里。
12. 视频任务文件包含 `workspaceId: "default"`。
13. 生成中视频可删除。
14. 已完成视频可预览、下载、设为最终、删除。
15. 已完成视频显示 24 小时过期提醒。
16. 模拟超过 24 小时后，视频文件被自动清理，历史记录显示已过期。
17. 已过期视频不能预览或下载。
18. 删除商品后，商品资料、参考图、分镜历史一起删除。
19. 备份包只包含长期数据和任务元数据，不包含代码目录和视频大文件。

第二阶段完成后运行：

```bash
npm test -- tests/server/db.test.ts
npm test -- tests/server/auth.test.ts
npm test -- tests/server/importFileWorkspace.test.ts
npm test -- tests/server/consoleApi.test.ts tests/server/videoRetention.test.ts
npm run typecheck
npm test
npm run build:console
```

第二阶段手动验证：

1. 创建用户 A 和用户 B。
2. 用户 A 创建商品和视频，用户 B 看不到。
3. 用户 B 创建商品和视频，用户 A 看不到。
4. 退出登录后不能访问商品、分镜、视频接口。
5. 第一阶段 `workspaces/default` 数据可以导入到管理员默认工作区。
6. 数据库删除记录和文件删除保持一致。
7. `provider_keys` 中的模型 Key 只能加密保存，API 只能看到预览值。
8. 视频过期后，文件删除，数据库状态也更新。
9. 自部署只需要复制 `HAITU_DATA_DIR` 即可带走 SQLite 数据库和文件产物。

## 十二、推荐执行顺序

1. 统一路径模块和测试。
2. 控制台服务接入数据根目录。
3. 商品存储和参考图存储。
4. 分镜历史服务端存储。
5. 视频任务、视频历史和 24 小时过期清理。
6. 设置、日志、媒体访问。
7. 免费部署配置、Cloudflare Tunnel 示例和部署文档。
8. 备份逻辑。
9. 删除旧目录逻辑和旧测试断言。
10. 第一阶段全量验证并推送。
11. 另开第二阶段分支接入 SQLite。
12. 实现用户系统和工作区权限。
13. 导入第一阶段文件数据到数据库。
14. 用数据库索引驱动列表和权限。
15. 第二阶段全量验证并推送。

## 十三、新会话接力提示词

```text
请执行 /Users/gaohongxiang/projects/haitu-video/docs/superpowers/plans/2026-06-14-platform-storage-deployment-users.md

注意：
1. 这是新项目，不需要兼容 fixtures、assets/products、outputs/video-jobs 或旧浏览器 localStorage。
2. 不要把正式用户数据放在代码目录里。
3. 运行时数据根目录必须由 HAITU_DATA_DIR 控制。
4. 本地默认使用 ./data。
5. 生产服务器推荐使用 /var/lib/haitu-video。
6. 为后续用户系统预留 workspaces/default 层，现在只使用 default 工作区，不做完整用户系统。
7. product.json 和 job.json 都写入 workspaceId: "default"。
8. 部署方案优先使用 Cloudflare Tunnel 免费入口，Caddy 直连只作为备用。
9. 不要把 Cloudflare Pages、Stream、R2 做成本阶段必需依赖。
10. 生成视频只保留 24 小时，过期自动删除视频文件，页面提醒用户尽快下载。
11. 备份默认不包含视频大文件，只保留长期数据和必要任务元数据。
12. SQLite 和用户系统是第二阶段，不要阻塞第一阶段上线。
13. 第二阶段数据库选 SQLite，图片和视频大文件仍不进数据库；未来托管规模变大时再评估迁移 PostgreSQL。
14. API 管理第一阶段保存平台服务端模型 Key 到 provider-keys.json；第二阶段迁入 SQLite 的 provider_keys 表并加密保存，不做浏览器 BYOK 作为默认方案。
15. 每个任务先补测试，再改实现。
16. UI 行为保持当前视频创作流程，但本次重点是分阶段完成平台存储、免费部署、用户系统规划和视频过期清理。
17. 完成对应阶段后运行计划里的验证命令。
```
