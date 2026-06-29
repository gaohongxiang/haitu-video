# 站点架构

Haitu 由同一个 Node 服务提供三类用户界面：公开营销页、登录后的创作控制台，以及项目方管理后台。当前生产域名是 `https://haitu.online`。

## 路由界面

公开营销页由 `src/marketing/renderMarketingPage.ts` 服务端渲染，并由 `src/server/consolePublicRoutes.ts` 里的 `handleMarketingRoutes` 分发。

- `/`：中文获客首页。
- `/en/`：英文获客首页。
- `/features/*`、`/platforms/*`、`/tools/*`、`/use-cases/*`、`/categories/*`、`/compare/*`：中英文公开 SEO/GEO 页面。
- `/terms`、`/privacy`、`/refund`、`/contact`：公开信任页和支付审核页。
- `/robots.txt`、`/sitemap.xml`、`/llms.txt`：搜索爬虫和 AI 答案引擎发现文件。

登录后应用外壳由 Vite 构建的 React HTML 提供，并通过 `handleConsoleAssetRoutes` 返回。

- `/console`：主要登录创作控制台。
- `/app`：旧控制台兼容入口。
- `/admin`：项目方管理后台。

API 路由都在 `/api/*` 下。健康检查、认证、支付 webhook、营销静态资产和临时公开资产 URL 有单独的公开路由处理；业务 API 必须先解析登录用户和工作区上下文。

## 渲染模型

公开站是服务端渲染 HTML，包含内联 CSS、canonical URL、`hreflang`、Open Graph 元数据、Twitter card、JSON-LD、页脚内链和 AI 可读内容块。多语言内容来自 `src/i18n/locales/*/marketing.json`。

控制台和后台使用同一个前端构建产物。`src/client/main.tsx` 在 `/admin` 渲染 `AdminApp`，其他控制台路径渲染 `App`。

## 索引规则

公开营销页应为 `index,follow`，并进入 `sitemap.xml`。

私有应用外壳要能被用户打开，但不能被搜索索引：

- `/console`、`/app`、`/admin` 返回的 HTML 必须包含 `noindex,nofollow`。
- `/api/*` 在 `robots.txt` 中禁止抓取。
- 临时媒体、私有下载、生成记录、用户商品数据和后台页面不能进入 sitemap，也不能作为营销页 SEO 内链目标。

## 多语言策略

中文是默认主站，不使用 `/zh/`。英文使用 `/en/`。未来新增语言时使用 `/ja/`、`/ko/`、`/vi/`、`/th/` 这类语言前缀，不拆独立域名。

每个公开页都应有对应语言路径、canonical URL、语言 alternates，以及指向中文默认页的 `x-default`。

## 兼容规则

`/app` 保留为兼容入口，但产品和营销文案应优先使用 `/console` 表示登录控制台。不要把 `/app`、`/console` 或 `/admin` 当成可索引落地页来写 SEO 文案。
