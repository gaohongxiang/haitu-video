# 营销 SEO / GEO 模块

营销模块的目标是让搜索引擎、AI 答案引擎、支付审核方和真实跨境电商卖家都能准确理解 Haitu。

长期规划见 [SEO / GEO 全局规划](../marketing/seo-geo-roadmap.md)，上线和监控动作见 [SEO / GEO 运营手册](../marketing/seo-geo-operations.md)，上线后证据和周期性复盘追加到 [SEO / GEO 监控记录](../marketing/seo-geo-monitoring-log.md)。

## 职责

- 渲染中英文公开页面。
- 维护可抓取页面元数据、canonical URL、`hreflang`、JSON-LD、sitemap、robots 和 `llms.txt`。
- 保持产品定位诚实：Haitu 是面向电商商品事实、商品图片、营销脚本和商品视频的 AI 商品创作平台。
- 让支付审核页说清楚：Haitu 提供数字化 SaaS 服务，不销售实物商品。
- 控制台、后台、API、生成记录和用户媒体不能被搜索索引。

## 主要文件

- `src/marketing/renderMarketingPage.ts`：路由匹配、HTML 渲染、robots、sitemap 和 `llms.txt`。
- `src/server/consolePublicRoutes.ts`：公开路由分发。
- `src/i18n/locales/zh/marketing.json`：中文公开站文案。
- `src/i18n/locales/en/marketing.json`：英文公开站文案。
- `src/server/static/seo-og.png` 和 `seo-og.svg`：社交分享图。

## 内容规则

每个可索引页面都应对应一个明确搜索意图，包含一个 H1、稳定 title 和 description、可见定义文本、FAQ、内链和 JSON-LD。GEO 文本要便于 AI 答案引擎直接摘要，不依赖猜测。

不要把尚未完整上线的图片生成能力写成已完整可用。功能完成前，应使用“商品图片优化”“参考图管理”“图片创作准备”“规划中的图片生成能力”等表述。

## 操作检查

修改公开页后检查：

- `npm run seo:check -- --base https://haitu.online`
- `/robots.txt`
- `/sitemap.xml`
- `/llms.txt`
- `/`
- `/en/`
- 任意一个功能页的中英文版本
- `/console` 和 `/admin` 是否仍为 `noindex,nofollow`
