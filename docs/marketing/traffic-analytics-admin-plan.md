# 后台流量与 SEO/GEO 数据看板规划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/admin` 增加「流量增长」后台，把官网访问、来源渠道、SEO/GEO 页面表现、IndexNow / sitemap 提交记录和站内转化集中到一个地方查看。

**Architecture:** 一期先做 Haitu 自有低敏事件、IndexNow 提交日志、sitemap 提交状态和第三方集成状态，不依赖第三方平台即可上线；后台 API 只返回聚合数据，所有敏感配置只显示“是否已配置”。二期再接 Google Search Console、GA4、Bing Webmaster Tools 和 Cloudflare 的缓存同步，不在用户打开后台时实时拉第三方 API。

**Tech Stack:** TypeScript、React `AdminApp`、SQLite / better-sqlite3、Drizzle schema、Vitest、现有 console server 路由。

---

更新日期：2026-07-08  
状态：已按本计划实现 `/admin` 流量增长一期、一阶段增强和第三方缓存同步基础版；三期运营建议仍为后续规划。  
入口：`/admin` 左侧导航新增「流量增长」。

## 0. 讨论结论

可以在后台里加一个集中查看入口，但不要把它做成“替代 Google / Bing / GA4 / Cloudflare 的完整分析平台”。最合适的定位是：

- `/admin` 做日常运营工作台：看趋势、来源、页面、转化、IndexNow/sitemap 提交记录和集成状态。
- Google Search Console、GA4、Bing Webmaster Tools、Cloudflare 仍是官方源数据平台；后台只缓存和汇总最常看的指标。
- 一期先记录 Haitu 自己能稳定拿到的数据，先回答“有没有流量、哪里来的、哪些页带来注册/充值/生成、提交有没有失败”。
- 二期再做外部 API 同步，定时拉取后写入本地缓存表，打开后台时读缓存。
- 不做实时抓第三方后台、不展示第三方密钥、不保存原始 IP 或完整 User-Agent。

推荐分期：

1. **一期：可上线的自有看板**  
   记录公开页 `page_view`、CTA、注册、登录、充值、生成任务和 IndexNow 提交记录；后台显示 overview、sources、pages、indexing、settings。
2. **一期增强：搜索缓存与手动动作**  
   后台读取已缓存的 Search Console 指标，提供 IndexNow URL 提交按钮和“同步状态”按钮；未配置时只显示 `not_configured`。
3. **二期：第三方自动同步**  
   定时同步 GA4、Google Search Console、Bing Webmaster Tools、Cloudflare 到 `traffic_daily_metrics`。
4. **三期：运营辅助**  
   增加每周 SEO/GEO 摘要、异常提醒、页面机会列表和“哪些页面该改标题/补内容/重新提交”的建议。

## 1. 背景与边界

用户现在最关心的是：SEO/GEO 做完以后，在哪里看有没有人来、从哪里来、哪些页面有用、提交给搜索引擎的东西有没有记录。

这个能力应该放在 `/admin`，不给普通商家看，不进入 `/console`。它不是替代 Google Analytics、Google Search Console、Bing Webmaster Tools 或 Cloudflare Analytics，而是把日常运营最常看的指标聚合成一个轻量工作台。需要深挖时，后台保留跳转到官方平台的入口。

必须遵守：

- `/admin` 继续保持 `noindex,nofollow`。
- admin API 必须要求 admin 鉴权；未登录返回 401，非 admin 返回 403。
- 默认不保存明文 IP、完整 User-Agent、邮箱、支付凭证、搜索平台 token 或其他敏感信息。
- 外部 API 数据采用定时同步和缓存，不在打开后台页面时实时频繁请求。
- IndexNow 提交成功只代表“已通知 URL 更新”，不代表“已抓取”或“已索引”。

## 2. 提交部分：到哪里，提交什么

后台里应该把“人工要去哪里提交”和“系统能自动记录什么”分开看。原因是 Google/Bing 的站长平台仍然要在官方后台完成站点验证和 sitemap 提交；Haitu 后台能做的是保存操作口径、记录 IndexNow API 通知结果、展示最近状态，并在二期缓存官方平台返回的数据。

### Google Search Console

提交位置：Google Search Console 里的 `Sitemaps`。

提交内容：

- `https://haitu.online/sitemap.xml`

用途：

- 告诉 Google 公开页面清单。
- 后续在 Search Console 官方后台看点击、曝光、CTR、平均排名、索引状态和异常 URL。
- 二期把常用搜索表现缓存到 Haitu 后台，只做汇总查看。

不提交：

- `/admin`
- `/console`
- `/app`
- `/api`
- 静态资源
- 用户上传媒体
- 临时公开链接

### Bing Webmaster Tools

提交位置：Bing Webmaster Tools 里的 `Sitemaps`。

提交内容：

- `https://haitu.online/sitemap.xml`

用途：

- 告诉 Bing 公开页面清单。
- 作为 Bing、Copilot 和部分答案引擎可发现性的基础。
- 二期把 Bing 侧的 sitemap / URL 状态缓存到 Haitu 后台，只做状态提示。

### IndexNow

提交位置：Haitu 后台按钮或服务端任务调用 IndexNow API。

接口：

```text
POST https://api.indexnow.org/indexnow
```

提交内容：

```json
{
  "host": "haitu.online",
  "key": "<INDEXNOW_KEY>",
  "keyLocation": "https://haitu.online/<INDEXNOW_KEY>.txt",
  "urlList": [
    "https://haitu.online/",
    "https://haitu.online/en/",
    "https://haitu.online/features/ai-product-video-generator"
  ]
}
```

提交范围：

- sitemap 里的公开页面 URL。
- 新增、改写、下线或 canonical 变化的公开 URL。
- 首页、功能页、平台页、场景页、类目页、对比页、政策页等可索引页面。

不提交：

- 后台、控制台、API、用户媒体、临时文件、静态资源。
- noindex 页面。
- 还没有上线到生产域名的本地地址。

后台需要记录：

- 提交时间
- provider：`indexnow`
- submission type：`url` 或 `batch`
- URL
- payload hash
- HTTP status code
- response excerpt
- error message
- retry count

后台按钮建议：

- “提交当前 sitemap URL”：把 sitemap 内公开 URL 批量通知 IndexNow。
- “提交指定 URL”：运营手动粘贴刚改过的公开页面 URL。
- “查看提交记录”：按时间、URL、状态码和错误筛选。

注意：IndexNow 是“通知 URL 有更新”，不是“保证已抓取/已索引”。后台文案必须避免把提交成功写成收录成功。

## 3. 后台应该集中看什么

一期先看 Haitu 自己能稳定记录的数据，后台不是精准广告归因系统，先服务 SEO/GEO 日常运营判断。

- 访问趋势：访客、页面浏览、公开页面入口。
- 来源渠道：搜索、直接访问、外链、AI/答案引擎、UTM。
- 页面表现：每个公开页的浏览、CTA、注册、充值、生成任务。
- 索引提交：IndexNow 提交 URL、状态码、错误、重试。
- 集成状态：GA4、Search Console、Bing、IndexNow、Cloudflare 是否已配置。
- 搜索缓存：如果已经有 Search Console 缓存数据，展示点击、曝光、CTR、平均排名；没有则空状态。

后续再补外部数据：

- Search Console：点击、曝光、CTR、平均排名、查询词、落地页。
- GA4：用户、会话、设备、国家、来源媒介、事件。
- Bing Webmaster Tools：sitemap、URL 提交和站点状态。
- Cloudflare：边缘请求量、国家、爬虫、4xx/5xx。

后台不做：

- 不展示实时访客轨迹。
- 不做用户级画像。
- 不把第三方平台的完整报表搬进来。
- 不保存用户搜索词以外的敏感个人信息。
- 不把“提交成功”当成“已索引”。

## 4. 数据口径

### 自有事件

一期记录这些事件：

- `page_view`：公开页访问。
- `cta_click`：点击「开始优化商品图」「进入控制台」「联系 Haitu」等 CTA。
- `auth_signup`：注册成功。
- `auth_login`：登录成功。
- `wallet_recharge_created`：创建充值订单。
- `wallet_recharge_paid`：充值成功。
- `creative_job_created`：创建生成任务。
- `creative_job_completed`：生成任务完成。
- `seo_index_submit`：IndexNow 或 sitemap 提交动作。

### 来源分组

后台展示分组：

- `Organic Search`
- `Direct`
- `Referral`
- `Social`
- `AI Answer Engines`
- `Paid / UTM`
- `Unknown`

AI 来源先按 referrer 和 UTM 识别：

- `chatgpt.com`
- `perplexity.ai`
- `copilot.microsoft.com`
- `gemini.google.com`
- `claude.ai`

注意：AI 来源识别只能作为线索，不能保证完整准确。很多 AI 或浏览器访问不会带 referrer。

### 页面类型

按公开路径归类：

- `/`：`home`
- `/features/*`：`feature`
- `/platforms/*`：`platform`
- `/use-cases/*`：`use-case`
- `/categories/*`：`category`
- `/tools/*`：`tool`
- `/compare/*`：`compare`
- `/terms`、`/privacy`、`/refund`、`/contact`：`trust`
- 其他公开页：`other`

### 转化归因

一期采用轻量归因：

- 浏览器可带 `sessionId`，服务端只保存 hash。
- 同一 session 后续发生注册、充值、生成任务时，优先继承该 session 的首次公开页来源和页面。
- 服务端内部触发但没有 session 的事件，归到当前动作的可解释路径，例如注册归到 `/`，充值归到 `/console/wallet` 或对应服务路径。
- 后台只做运营方向判断，不承诺等同广告投放归因。

## 5. 文件结构

### 新增

- `src/server/adminTraffic.ts`  
  负责记录自有流量事件、记录 IndexNow 提交、聚合 admin 流量数据、返回集成配置状态。

- `src/server/trafficExternalSync.ts`  
  负责从 Google Search Console、GA4、Bing Webmaster Tools 和 Cloudflare 拉取最小外部指标并写入 `traffic_daily_metrics` 缓存；失败只影响对应 provider。

- `src/server/db/migrations/0015_traffic_analytics.sql`  
  新增 `traffic_events`、`traffic_daily_metrics`、`indexing_submissions` 三张表和索引。

- `tests/server/adminTraffic.test.ts`  
  覆盖事件记录、来源归类、页面聚合、IndexNow 提交记录、配置脱敏。

- `tests/server/adminTrafficRoutes.test.ts`  
  覆盖公开事件上报、公开页自动 `page_view`、admin API 鉴权。

### 修改

- `src/server/db/schema.ts`  
  导出三张新表的 Drizzle schema。

- `src/server/db/migrate.ts`  
  注册 `0015_traffic_analytics` migration。

- `src/server/authAdminRoutes.ts`  
  增加 `/api/admin/traffic/*` 管理接口。

- `src/server/consolePublicRoutes.ts`  
  增加公开 `POST /api/traffic/events`，并在营销页 GET 成功时记录 `page_view`。

- `src/server/consoleRequestHandler.ts`  
  确保 `/api/traffic/events` 在登录拦截前可访问，且营销路由能拿到 `databaseHandle`。

- `src/client/AdminApp.tsx`  
  增加「流量增长」导航和页面。

- `src/i18n/locales/zh/app.json`  
  增加中文后台导航、字段和空状态文案。

- `src/i18n/locales/en/app.json`  
  增加英文后台导航、字段和空状态文案。

- `tests/client/adminAppSource.test.ts`  
  增加后台页面/API/导航源代码断言。

- `docs/modules/admin.md`  
  保持管理后台模块说明和本计划链接。

- `docs/marketing/seo-geo-roadmap.md`  
  保持 SEO/GEO 长期规划和本计划链接。

## 6. 数据表计划

### `traffic_events`

```sql
CREATE TABLE IF NOT EXISTS traffic_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  event_name TEXT NOT NULL,
  path TEXT NOT NULL,
  canonical_path TEXT NOT NULL,
  locale TEXT,
  page_type TEXT NOT NULL,
  source_group TEXT NOT NULL,
  referrer_host TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  session_hash TEXT,
  user_id TEXT,
  workspace_id TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS traffic_events_occurred_at_idx
  ON traffic_events (occurred_at);

CREATE INDEX IF NOT EXISTS traffic_events_name_time_idx
  ON traffic_events (event_name, occurred_at);

CREATE INDEX IF NOT EXISTS traffic_events_page_time_idx
  ON traffic_events (canonical_path, occurred_at);

CREATE INDEX IF NOT EXISTS traffic_events_source_time_idx
  ON traffic_events (source_group, occurred_at);
```

`session_hash` 使用服务端盐值生成；不能保存原始 cookie、IP 或完整 User-Agent。

### `traffic_daily_metrics`

```sql
CREATE TABLE IF NOT EXISTS traffic_daily_metrics (
  id TEXT PRIMARY KEY,
  metric_date TEXT NOT NULL,
  provider TEXT NOT NULL,
  dataset TEXT NOT NULL,
  dimension_json TEXT NOT NULL,
  metric_json TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS traffic_daily_metrics_unique_idx
  ON traffic_daily_metrics (metric_date, provider, dataset, dimension_json);

CREATE INDEX IF NOT EXISTS traffic_daily_metrics_provider_date_idx
  ON traffic_daily_metrics (provider, metric_date);
```

这个表二期用于缓存 GA4、Search Console、Bing 和 Cloudflare 数据。一期可以先建表，不强制使用。

### `indexing_submissions`

```sql
CREATE TABLE IF NOT EXISTS indexing_submissions (
  id TEXT PRIMARY KEY,
  submitted_at TEXT NOT NULL,
  provider TEXT NOT NULL,
  submission_type TEXT NOT NULL,
  url TEXT NOT NULL,
  payload_hash TEXT,
  status_code INTEGER,
  response_excerpt TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS indexing_submissions_submitted_at_idx
  ON indexing_submissions (submitted_at);

CREATE INDEX IF NOT EXISTS indexing_submissions_provider_time_idx
  ON indexing_submissions (provider, submitted_at);
```

## 7. API 计划

### 公开接口

`POST /api/traffic/events`

用途：浏览器上报低敏第一方事件，例如 CTA 点击。

请求示例：

```json
{
  "eventName": "cta_click",
  "path": "/",
  "sessionId": "browser-session",
  "metadata": {
    "cta": "start"
  }
}
```

返回：

```json
{ "ok": true }
```

要求：

- 不要求登录。
- 只接受白名单事件名。
- `metadata` 只允许低敏短字段。
- 服务端从请求头读取 referrer，但只保存 host。
- 请求体过大返回 400。

### Admin 接口

所有接口都挂在 admin 鉴权下：

- `GET /api/admin/traffic/overview?from=&to=`
- `GET /api/admin/traffic/sources?from=&to=`
- `GET /api/admin/traffic/pages?from=&to=&type=&locale=`
- `GET /api/admin/traffic/indexing?from=&to=`
- `GET /api/admin/traffic/search?from=&to=&page=&query=`
- `GET /api/admin/traffic/settings`
- `POST /api/admin/traffic/sync`
- `POST /api/admin/traffic/indexnow/submit`

二期再加：

- `POST /api/admin/traffic/sitemap/submit`
- `GET /api/admin/traffic/cloudflare?from=&to=`
- `GET /api/admin/traffic/geo-summary?from=&to=`

接口返回聚合后的数据，不直接把第三方 API 原始响应暴露给前端。

`POST /api/admin/traffic/sync` 返回安全聚合状态：

- 没有配置任何第三方：`not_configured`
- 全部已配置 provider 同步成功：`synced`
- 部分 provider 失败：`partial_error`
- 全部已配置 provider 失败：`error`
- 不能因为第三方未配置导致页面报错

第三方拉取写入 `traffic_daily_metrics` 缓存；后台页面读取缓存，不在展示表格时实时拉第三方 API。

## 8. 后台页面计划

### 导航

`/admin` 左侧导航新增：

- 中文：`流量增长`
- 英文：`Traffic Growth`

建议放在「运营」分组，靠近「总览」和「网站配置」。

### 页面布局

不要做成一堆大卡片。页面应是工作台式布局：

- 顶部紧凑 KPI 行：访客、浏览、CTA、注册、充值成功、生成完成、IndexNow 提交。
- 中间两列：访问趋势、来源分布。
- 下方主表：页面表现。
- 右侧或底部：索引提交记录、集成状态。

### 筛选

一期支持：

- 最近 7 天
- 最近 28 天
- 最近 90 天

二期支持：

- 自定义日期
- 页面类型
- 语言路径
- 来源渠道
- 国家/设备

### 空状态

没有数据时显示：

- “还没有记录到公开站访问。上线后打开公开页面或点击 CTA，这里会出现数据。”
- “Search Console / GA4 未配置时，只显示 Haitu 自有事件。”

不要让页面因为第三方未配置而报错。

## 9. 任务清单

### Task 1: 数据库迁移与 schema

**Files:**

- Create: `src/server/db/migrations/0015_traffic_analytics.sql`
- Modify: `src/server/db/migrate.ts`
- Modify: `src/server/db/schema.ts`
- Test: `tests/server/adminTraffic.test.ts`

- [ ] **Step 1: 写 migration**

将第 6 节 SQL 写入 `0015_traffic_analytics.sql`。

- [ ] **Step 2: 注册 migration**

在 `src/server/db/migrate.ts` 的 `migrations` 数组末尾增加：

```ts
{
  id: "0015_traffic_analytics",
  sql: readMigrationSql("0015_traffic_analytics.sql")
}
```

- [ ] **Step 3: 增加 Drizzle schema**

在 `src/server/db/schema.ts` 增加 `trafficEvents`、`trafficDailyMetrics`、`indexingSubmissions`。

- [ ] **Step 4: 验证迁移**

Run:

```bash
npm test -- tests/server/adminTraffic.test.ts --reporter=verbose
```

Expected at this step: 测试仍可能因为 `src/server/adminTraffic.ts` 未实现而失败，但 migration 不应有 SQL 错误。

### Task 2: 流量服务模块

**Files:**

- Create: `src/server/adminTraffic.ts`
- Test: `tests/server/adminTraffic.test.ts`

- [ ] **Step 1: 实现记录函数**

导出：

```ts
recordTrafficEvent(input)
recordIndexingSubmission(input)
```

要求：

- 标准化 `canonical_path`，去掉 query/hash。
- 识别 `locale`、`page_type`、`source_group`。
- `sessionId` 进入数据库前先 hash。
- `metadata` 只保存 JSON 对象，不保存请求头原文。

- [ ] **Step 2: 实现聚合函数**

导出：

```ts
buildAdminTrafficOverview(input)
buildAdminTrafficSources(input)
buildAdminTrafficPages(input)
buildAdminTrafficIndexing(input)
buildAdminTrafficSettings(input)
```

要求：

- overview 返回 KPI 和按日趋势。
- sources 返回来源分组指标。
- pages 返回页面级浏览和转化。
- indexing 返回最近提交记录。
- settings 只返回配置状态，不返回密钥值。

- [ ] **Step 3: 跑服务测试**

Run:

```bash
npm test -- tests/server/adminTraffic.test.ts --reporter=verbose
```

Expected: PASS。

### Task 3: 公开事件接口与营销页自动记录

**Files:**

- Modify: `src/server/consolePublicRoutes.ts`
- Modify: `src/server/consoleRequestHandler.ts`
- Test: `tests/server/adminTrafficRoutes.test.ts`
- Existing related tests: `tests/server/marketingRoutes.test.ts`

- [ ] **Step 1: 增加公开事件接口**

`POST /api/traffic/events` 接收浏览器低敏事件，并调用 `recordTrafficEvent`。

- [ ] **Step 2: 放在登录拦截前**

确保 `/api/traffic/events` 不被 console 登录拦截挡住，但只返回 `{ ok: true }`，不暴露任何统计数据。

- [ ] **Step 3: 公开营销页记录 `page_view`**

当公开营销页 `GET` 成功返回 200 时，记录：

```ts
eventName: "page_view"
path: url.pathname
referrer: request.headers.get("referer")
occurredAt: now()
```

不要记录：

- `HEAD`
- `/robots.txt`
- `/sitemap.xml`
- `/llms.txt`
- `/admin`
- `/console`
- `/app`
- `/api`

- [ ] **Step 4: 跑路由测试**

Run:

```bash
npm test -- tests/server/adminTrafficRoutes.test.ts tests/server/marketingRoutes.test.ts --reporter=verbose
```

Expected: PASS。

### Task 4: Admin 流量 API

**Files:**

- Modify: `src/server/authAdminRoutes.ts`
- Test: `tests/server/adminTrafficRoutes.test.ts`

- [ ] **Step 1: 增加 admin GET routes**

新增：

```ts
GET /api/admin/traffic/overview
GET /api/admin/traffic/sources
GET /api/admin/traffic/pages
GET /api/admin/traffic/indexing
GET /api/admin/traffic/search
GET /api/admin/traffic/settings
POST /api/admin/traffic/sync
POST /api/admin/traffic/indexnow/submit
```

每个 route 都先调用 `authStore.requireAdmin(request)`。

- [ ] **Step 2: 日期参数**

`from` 和 `to` 缺省为最近 28 天。非法日期返回 400。

- [ ] **Step 3: 鉴权验证**

Run:

```bash
npm test -- tests/server/adminTrafficRoutes.test.ts --reporter=verbose
```

Expected: anonymous 访问 admin traffic API 返回 401；admin session 返回 200。

### Task 5: Admin UI

**Files:**

- Modify: `src/client/AdminApp.tsx`
- Modify: `src/i18n/locales/zh/app.json`
- Modify: `src/i18n/locales/en/app.json`
- Modify: `tests/client/adminAppSource.test.ts`

- [ ] **Step 1: 增加导航**

`AdminSection` 增加 `traffic`，左侧导航增加「流量增长 / Traffic Growth」。

- [ ] **Step 2: 增加数据加载**

调用：

```ts
fetchAdminJson("/api/admin/traffic/overview")
fetchAdminJson("/api/admin/traffic/sources")
fetchAdminJson("/api/admin/traffic/pages")
fetchAdminJson("/api/admin/traffic/indexing")
fetchAdminJson("/api/admin/traffic/search")
fetchAdminJson("/api/admin/traffic/settings")
```

- [ ] **Step 3: 增加页面组件**

实现 `AdminTrafficPanel`，包含：

- KPI 行
- 趋势摘要
- 来源列表
- 页面表现表
- Search Console 缓存指标
- IndexNow 提交记录
- 集成状态
- 同步和 IndexNow 手动提交动作

- [ ] **Step 4: 跑 UI 源码测试**

Run:

```bash
npm test -- tests/client/adminAppSource.test.ts --reporter=verbose
```

Expected: PASS。

### Task 6: 转化事件接入

**Files:**

- Modify: `src/server/auth/betterAuthStore.ts`
- Modify: `src/server/walletRechargeOrderStore.ts`
- Modify: `src/server/consoleVideoJobQueue.ts`
- Modify: `src/server/consoleServerRuntime.ts`
- Modify: `src/server/consoleWorkspaceRuntime.ts`
- Test: `tests/server/walletRechargeOrderStore.test.ts`
- Test: `tests/server/consoleVideoJobQueue.test.ts`
- Existing related tests: `tests/server/auth.test.ts`

- [ ] **Step 1: 注册成功记录 `auth_signup`**

在邮箱验证完成、用户创建成功后记录 `auth_signup`。只记录 user id，不记录邮箱。没有浏览器 session 时路径归到 `/`，避免页面表现表出现 `/api/auth/verify-email`。

- [ ] **Step 2: 登录成功记录 `auth_login`**

在登录成功后记录 `auth_login`。只记录 user id，不记录邮箱、密码或 OTP。

- [ ] **Step 3: 充值订单记录**

创建订单记录 `wallet_recharge_created`，支付成功记录 `wallet_recharge_paid`。

- [ ] **Step 4: 生成任务记录**

创建任务记录 `creative_job_created`，任务完成记录 `creative_job_completed`。

- [ ] **Step 5: 给 runtime 传入 `now`**

`consoleServerRuntime` 和 `consoleWorkspaceRuntime` 初始化 auth store、wallet store、video queue 时传入统一 `now`，让测试和聚合窗口稳定。

- [ ] **Step 6: 回归测试**

Run:

```bash
npm test -- tests/server/auth.test.ts tests/server/walletRechargeOrderStore.test.ts tests/server/consoleVideoJobQueue.test.ts --reporter=verbose
```

Expected: PASS。

### Task 7: 一期增强：搜索缓存、同步状态和 IndexNow 手动提交

**Files:**

- Modify: `src/server/adminTraffic.ts`
- Modify: `src/server/authAdminRoutes.ts`
- Modify: `src/client/AdminApp.tsx`
- Modify: `src/i18n/locales/zh/app.json`
- Modify: `src/i18n/locales/en/app.json`
- Test: `tests/server/adminTraffic.test.ts`
- Test: `tests/server/adminTrafficRoutes.test.ts`
- Test: `tests/client/adminAppSource.test.ts`

- [ ] **Step 1: 缓存 Search Console 行读取**

从 `traffic_daily_metrics` 读取：

```text
provider = search_console
dataset = query_page
```

返回 query、page、country、device、clicks、impressions、ctr、position。

- [ ] **Step 2: 页面表现合并搜索指标**

`buildAdminTrafficPages` 合并同一 canonical path 的搜索点击、曝光、CTR 和平均排名。

- [ ] **Step 3: 同步状态接口**

`POST /api/admin/traffic/sync` 返回：

```json
{
  "ok": true,
  "status": "not_configured",
  "providers": [
    { "id": "ga4", "configured": false },
    { "id": "search-console", "configured": false },
    { "id": "bing-webmaster", "configured": false },
    { "id": "cloudflare", "configured": false }
  ]
}
```

如果已配置任一第三方，同步接口会尝试拉取可用 provider 并返回每个 provider 的 `synced` / `error` / `not_configured`、`rowsSynced` 和脱敏错误信息，不虚构数据。

- [ ] **Step 4: IndexNow 手动提交**

`POST /api/admin/traffic/indexnow/submit` 接收公开 URL 列表，调用 IndexNow API 并写入 `indexing_submissions`。没有 `HAITU_INDEXNOW_KEY` 时记录错误但页面不崩。

- [ ] **Step 5: Admin UI 增加搜索与动作区**

在「流量增长」页面增加：

- Search Console 缓存表
- 同步状态按钮
- IndexNow URL 提交按钮
- 未配置空状态

- [ ] **Step 6: 回归测试**

Run:

```bash
npm test -- tests/server/adminTraffic.test.ts tests/server/adminTrafficRoutes.test.ts tests/client/adminAppSource.test.ts --reporter=verbose
```

Expected: PASS。

### Task 8: 二期第三方真实同步

**Files:**

- Create: `src/server/trafficExternalSync.ts`
- Modify: `src/server/adminTraffic.ts`
- Modify: `src/server/consoleServerRuntime.ts`
- Modify: `src/server/authAdminRoutes.ts`
- Add tests under: `tests/server/`

- [ ] **Step 1: Search Console 缓存同步**

每天同步最近 3 天数据，覆盖更新 `traffic_daily_metrics`，字段包括 query、page、country、device、clicks、impressions、ctr、position。

- [ ] **Step 2: GA4 缓存同步**

同步 date、pagePath、sessionSourceMedium、country、deviceCategory、eventName，以及 activeUsers、sessions、screenPageViews、eventCount、conversions。

- [ ] **Step 3: Bing / Cloudflare 缓存同步与状态**

未配置时返回 `not_configured`，API 错误时返回 `error`，不能影响 admin 页面其他模块加载。

- [ ] **Step 4: Google 凭证**

优先支持 `HAITU_GOOGLE_ACCESS_TOKEN` / `GOOGLE_ACCESS_TOKEN`；生产推荐用 `HAITU_GOOGLE_APPLICATION_CREDENTIALS` 指向 service account JSON，服务端临时换取 access token，不写入缓存或响应。

- [ ] **Step 5: 周报预留**

后续从 `traffic_daily_metrics` 和 `traffic_events` 生成每周 SEO/GEO 摘要。

### Task 9: 文档与运维入口

**Files:**

- Modify: `docs/modules/admin.md`
- Modify: `docs/modules/marketing-seo.md`
- Modify: `docs/marketing/seo-geo-operations.md`
- Modify: `docs/marketing/seo-geo-monitoring-log.md`
- Modify: `docs/README.md`

- [ ] **Step 1: 管理后台模块文档**

确认 `docs/modules/admin.md` 说明「流量增长」分区、admin 鉴权和敏感配置脱敏规则。

- [ ] **Step 2: SEO/GEO 运营手册**

确认 `docs/marketing/seo-geo-operations.md` 写清：

- Google Search Console 提交 `https://haitu.online/sitemap.xml`
- Bing Webmaster Tools 提交 `https://haitu.online/sitemap.xml`
- IndexNow 提交公开 URL，不提交后台、控制台、API 和 noindex 页面

- [ ] **Step 3: 监控记录**

`docs/marketing/seo-geo-monitoring-log.md` 继续记录人工检查、截图证据和异常，不把后台自动指标原样复制成流水账。

- [ ] **Step 4: README 链接**

`docs/README.md` 的策略区保留本计划链接。

## 10. 验收清单

一期完成后必须满足：

- 打开公开首页后，`/admin` 能看到 `page_view`。
- 点击公开页 CTA 后，`/admin` 能看到 `cta_click`。
- `/api/traffic/events` 不要求登录，但只接受白名单事件并只返回 `{ ok: true }`。
- 匿名访问 `/api/admin/traffic/overview` 返回 401。
- 非 admin 登录访问 admin traffic API 返回 403。
- admin 可以看到 overview、sources、pages、indexing、settings。
- IndexNow 提交失败时后台能看到错误。
- settings 不泄露 `HAITU_SECRET_KEY`、Google 凭证、Bing key、Cloudflare token、IndexNow key。
- `/admin` 仍为 `noindex,nofollow`。

验证命令：

```bash
npm test -- tests/server/adminTraffic.test.ts --reporter=verbose
npm test -- tests/server/adminTrafficRoutes.test.ts --reporter=verbose
npm test -- tests/client/adminAppSource.test.ts --reporter=verbose
npm run typecheck
npm run build:console
```

如果只改了一期后端，可以先跑：

```bash
npm test -- tests/server/adminTraffic.test.ts tests/server/adminTrafficRoutes.test.ts --reporter=verbose
```

## 11. 环境变量

```text
HAITU_TRAFFIC_ANALYTICS_ENABLED=1
HAITU_TRAFFIC_EVENT_SALT=<server-side-random-salt>
HAITU_GA4_PROPERTY_ID=
HAITU_GOOGLE_APPLICATION_CREDENTIALS=
HAITU_GOOGLE_ACCESS_TOKEN=
HAITU_SEARCH_CONSOLE_SITE_URL=https://haitu.online/
HAITU_BING_WEBMASTER_API_KEY=
HAITU_INDEXNOW_KEY=
HAITU_CLOUDFLARE_ACCOUNT_ID=
HAITU_CLOUDFLARE_ZONE_ID=
HAITU_CLOUDFLARE_API_TOKEN=
```

后台只展示是否已配置和最近同步状态，不展示环境变量原值。

## 12. 与现有 SEO/GEO 文档的关系

- SEO/GEO 内容规划继续放在 `docs/marketing/seo-geo-roadmap.md`。
- 上线提交和人工监控步骤继续放在 `docs/marketing/seo-geo-operations.md`。
- 监控证据继续追加到 `docs/marketing/seo-geo-monitoring-log.md`。
- 本文只规划 `/admin` 中的集中数据看板和后续实现路线。

## 13. 参考资料

- Google Analytics Data API: https://developers.google.com/analytics/devguides/reporting/data/v1
- GA4 `runReport`: https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport
- Google Search Console API: https://developers.google.com/webmaster-tools
- Search Analytics query: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- Search Console API usage limits: https://developers.google.com/webmaster-tools/limits
- Bing Webmaster API: https://learn.microsoft.com/en-us/bingwebmaster/
- IndexNow documentation: https://www.indexnow.org/documentation
- Bing IndexNow setup: https://www.bing.com/indexnow/getstarted
