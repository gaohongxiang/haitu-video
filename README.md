# Haitu 嗨兔

Haitu 嗨兔是面向跨境电商卖家和运营团队的 AI 商品图片优化与商品视频创作平台。项目把商品资料、参考图、图片提示词、视频提示词、模型调用、钱包计费、任务记录、发布素材和公开 SEO 官网放在同一套 Node.js 服务里。

这个仓库当前不是早期的 mock 原型，而是一套单 VPS 可运行的产品化架构：公开官网服务获客和支付审核，登录控制台承载商品创作工作流，项目方后台管理模型、计费、用户、财务和站点配置。

## 核心能力

- 商品库：保存 SKU、商品事实、卖点、禁用宣称和参考图片，后续图片/视频创作可复用同一个商品。
- 图片创作：基于商品资料和本次参考图生成或优化商品图片提示词，并调用图片模型生成参考图。
- 视频创作：基于商品资料、本次参考图和视频提示词调用视频模型生成商品短视频。
- 提示词工作流：图片/视频共用同一套创作面板；视频可点击场景型、痛点型、卖点型、UGC 型、开箱型模板注入提示词。
- 模型服务：文本、图片、视频模型按能力分开配置，支持平台模型和用户 BYOK。
- 钱包计费：平台模型模式可从钱包冻结和扣费；BYOK 模式只收取 Haitu 服务费，上游费用由用户自己的模型账号承担。
- 管理后台：支持用户、内容、钱包、充值、模型凭证、模型价格目录、服务费和站点配置管理。
- 公开官网：中文首页、英文首页、SEO/GEO 页面、信任页、`sitemap.xml`、`robots.txt` 和 `llms.txt` 由服务端渲染。

## 架构概览

Haitu 当前采用单 Node.js 服务：

```text
公开官网 / 控制台 / 后台
  -> Node HTTP server
  -> React 控制台和后台外壳
  -> SQLite 元数据
  -> HAITU_DATA_DIR 本地运行时资产
  -> 本地异步视频任务队列
  -> 文本 / 图片 / 视频模型供应商
```

主要入口：

- `/`：中文公开首页。
- `/en/`：英文公开首页。
- `/console`：登录后的创作控制台。
- `/app`：旧控制台兼容入口。
- `/admin`：项目方管理后台。
- `/api/*`：控制台、后台、支付、模型和任务 API。

长期架构文档见 [docs/README.md](docs/README.md)。

## 本地运行

安装依赖：

```bash
npm install
```

准备环境变量：

```bash
cp .env.example .env
```

本地开发至少需要设置稳定的 `HAITU_SECRET_KEY`。它用于加密平台模型 key 和用户 BYOK key，线上迁移或重启后必须保持不变。

初始化或升级 SQLite：

```bash
npm run db:migrate
```

启动控制台服务：

```bash
npm run start:console
```

默认监听：

```text
http://127.0.0.1:4173
```

如果端口被占用，可以显式指定：

```bash
npm run start:console -- --port 4180 --host 127.0.0.1
```

## 常用命令

```bash
npm test
npm run typecheck
npm run build:console
npm run deploy:check
```

SEO/GEO 生产检查：

```bash
npm run seo:check -- --base https://haitu.online
```

VPS 部署：

```bash
npm run deploy:vps
```

部署流程和故障处理见 [运维手册](docs/operations/runbook.md) 与 [VPS 无 Docker 部署](docs/operations/vps-no-docker.md)。

## 运行时数据

代码和运行时数据分开。生产环境建议：

```text
HAITU_DATA_DIR=/var/lib/haitu-video
```

重要数据包括：

- `haitu.sqlite`、`haitu.sqlite-wal`、`haitu.sqlite-shm`
- 工作区商品资料和参考图
- 图片/视频任务 manifest、report、输出文件
- 钱包流水、充值订单、模型配置、审计日志

`data/` 和 `HAITU_DATA_DIR` 下的运行时产物不应提交到 git。备份策略见 [存储和资产模块](docs/modules/storage-assets.md)。

## 模型和计费

Haitu 支持两种模型使用模式：

- 平台模型：项目方在 `/admin` 配置供应商凭证和启用模型；用户从钱包支付上游模型成本和 Haitu 服务费。
- BYOK：用户在 `/console` 的 API 管理中保存自己的 key；上游费用由用户供应商账号承担，Haitu 只从钱包收取服务费。

模型按能力分为文本、图片、视频。前端创作界面只让用户选择当前能力可用的模型，不再维护文本/图片/视频打包组合。模型目录、官方成本、服务费和钱包扣费边界见 [模型目录与使用计费](docs/modules/model-pricing-billing.md)。

平台 key 和 BYOK key 都是服务端加密存储，不能出现在前端代码或 API 响应中。

## 视频供应商

当前视频生成支持：

- `mock`：免费本地占位供应商，用于开发、测试和流程验证。
- `volcengine-seedance`：火山引擎 Ark Seedance 异步视频供应商，负责创建任务、轮询状态、下载结果、记录任务 ID、用量和成本。

核心 pipeline 依赖统一供应商接口，具体选择逻辑在 `src/providers/providerFactory.ts`。Seedance 实现在 `src/providers/volcengine/seedanceProvider.ts`。

CLI 默认使用免费 `mock`。只有显式选择真实供应商并确认付费时，才会调用远程视频模型：

```bash
npm run generate -- \
  --product examples/products/sample-storage-box.json \
  --versions 1 \
  --duration 8 \
  --provider volcengine-seedance \
  --apiKey your-volcengine-key \
  --confirmPaid true
```

查询 Seedance 任务和用量：

```bash
npm run usage -- --status succeeded --pageSize 20
npm run usage -- --taskId cgt-xxx
npm run usage -- --cancelTaskId cgt-queued
```

取消只适用于仍处于 `queued` 的远程任务。已经生成的本地 manifest、report、任务 ID、用量和计费记录应保留，便于客服和财务核对。

## 商品事实和素材规则

商品脚本、图片提示词和视频提示词只能使用已验证事实：

- `verified_selling_points` 是允许表达的卖点。
- `forbidden_claims` 是禁用或未确认宣称。
- 参考图用于约束图片/视频模型，不代表可以凭空生成未经确认的商品能力。
- 价格、疗效、认证、品牌授权等高风险信息必须来自商品事实，不应由模型自行补全。

视频供应商通常需要可访问的 HTTPS 参考图 URL。本地商品图会通过短期公开资产 URL 暴露给模型供应商，细节见 [视频生成模块](docs/modules/video-generation.md) 和 [存储和资产模块](docs/modules/storage-assets.md)。

## 文档索引

- [站点架构](docs/architecture/site-architecture.md)
- [运行架构](docs/architecture/runtime-architecture.md)
- [数据模型](docs/architecture/data-model.md)
- [资金与计费架构](docs/architecture/billing-architecture.md)
- [商品创作工作台](docs/modules/product-studio.md)
- [模型服务](docs/modules/model-service.md)
- [视频生成](docs/modules/video-generation.md)
- [营销 SEO / GEO](docs/modules/marketing-seo.md)
- [运维手册](docs/operations/runbook.md)

## 开发约定

- 改功能前先看对应模块文档，改完同步更新文档。
- 新增业务 API 必须明确认证、工作区边界和运行时数据路径。
- 不在前端暴露平台模型 key、用户 BYOK key、支付密钥或内部供应商错误原文。
- 付费模型调用必须有明确的模型选择、计费预估、钱包冻结或 BYOK 边界。
- 公开 SEO 页面只能描述真实已支持能力，不为不存在的功能抢词。
