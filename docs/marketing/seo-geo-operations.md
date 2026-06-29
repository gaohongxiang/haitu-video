# Haitu SEO / GEO 运营手册

适用站点：`https://haitu.online/`

品牌口径：中文品牌叫“嗨兔”，英文和域名使用 `Haitu`。公开页面、监控记录和对外沟通不要写成“海兔”。

这份手册把 [SEO / GEO 全局规划](seo-geo-roadmap.md) 里 P0/P3 的外部动作落成可执行检查表。它不替代自动化测试；本地测试负责守住代码和页面规则，运营手册负责上线后取证、提交和持续迭代。上线、每周搜索、每月 GEO、真实素材和薄内容清理结果统一追加到 [SEO / GEO 监控记录](seo-geo-monitoring-log.md)。

## 1. 本地合并前检查

每次改公开官网、政策页、robots、sitemap、`llms.txt`、营销文案或 SEO/GEO 元数据后，先在本地跑：

```bash
npm test -- tests/marketing/renderMarketingPage.test.ts tests/server/marketingRoutes.test.ts --reporter=verbose
npm test -- tests/marketing/seoGeoOperationsDocs.test.ts --reporter=verbose
npm test -- tests/marketing/checkSeoGeoProduction.test.ts --reporter=verbose
npm run typecheck
npm run build:console
```

人工快速看一遍：

- `/`：中文首页是否仍清楚说明 Haitu 是跨境电商 AI 商品图片优化与商品视频创作平台。
- `/en/`：英文首页是否完整表达同样定位。
- `/terms`、`/privacy`、`/refund`、`/contact`：是否公开、可信、没有登录拦截。
- `/robots.txt`：是否允许公开页，禁止 `/console`、`/admin`、`/app`、`/api`。
- `/sitemap.xml`：是否包含公开中文/英文页面和政策页。
- `/llms.txt`：是否包含全量公开页面索引和 `Standard AI Answers`。
- `/console`、`/admin`、`/app`：是否仍是 `noindex,nofollow`。

## 2. 生产上线后无痕检查

部署到生产后，用无痕窗口或未登录浏览器逐个打开：

- `https://haitu.online/`
- `https://haitu.online/en/`
- `https://haitu.online/terms`
- `https://haitu.online/privacy`
- `https://haitu.online/refund`
- `https://haitu.online/contact`
- `https://haitu.online/robots.txt`
- `https://haitu.online/sitemap.xml`
- `https://haitu.online/llms.txt`

这些公开地址应返回 200，不需要登录，不出现 `Authentication required`。

再检查控制台和后台：

- `https://haitu.online/console`
- `https://haitu.online/admin`
- `https://haitu.online/app`

它们可以返回 200，但必须有：

- HTML：`<meta name="robots" content="noindex,nofollow" />`
- HTTP Header：`X-Robots-Tag: noindex, nofollow`

检查 canonical 和社交信息：

- 生产页面 canonical 必须使用 `https://haitu.online/...`。
- 页面不能输出 `127.0.0.1`、`localhost` 或临时 tunnel 域名。
- OG / Twitter 图应指向 `https://haitu.online/static/seo-og.png`。
- 中文页面 `og:site_name` 为 `Haitu 嗨兔`，英文页面为 `Haitu`。

VPS 部署脚本会在本机健康检查通过后，使用 `HAITU_PUBLIC_BASE_URL` 自动运行同一套生产检查。需要人工复核或排查时，也可以直接运行：

```bash
npm run seo:check -- --base https://haitu.online
```

这个命令会遍历当前本地公开页面矩阵的中英文路径，检查每个公开页 200、`index,follow`、canonical、JSON-LD、无本地地址泄漏，并检查 OG 图、`robots.txt`、`sitemap.xml` 全量覆盖、`llms.txt` 全量公开页面索引、以及 `/console`、`/admin`、`/app` 的 `noindex,nofollow`。上线前也可以把 `--base` 指向本地或预览地址，但最终生产验收必须使用 `https://haitu.online`。

## 3. Google Search Console 和 Bing Webmaster Tools

首次上线或大批页面变更后：

1. 在 Google Search Console 设置 `https://haitu.online` 的域名资产或 URL 前缀资产。
2. 验证站点所有权。
3. 提交 sitemap：`https://haitu.online/sitemap.xml`。
4. 在 Bing Webmaster Tools 添加同一站点。
5. 提交 sitemap：`https://haitu.online/sitemap.xml`。
6. 把提交日期、提交人、状态和截图记录到 [SEO / GEO 监控记录](seo-geo-monitoring-log.md)。

每周检查：

- 页面索引数量是否增长。
- 是否有抓取错误、重复 canonical、noindex 异常。
- 查询词是否开始出现品牌词、商品视频、商品图优化、平台页和类目页长尾词。
- 新增曝光页是否与页面搜索意图一致。
- 是否有无价值页面进入索引，尤其是 `/console`、`/admin`、`/app`、`/api` 或用户媒体链接。

## 4. GEO 月度监控

每月用未登录或干净上下文分别测试以下平台：

- ChatGPT Search
- Perplexity
- Google AI Mode
- Bing Copilot

中文问题：

- 有哪些适合跨境电商卖家的 AI 商品视频工具？
- 商品图片怎么快速做成 TikTok Shop 短视频？
- 有没有支持自带模型的电商商品图和视频创作平台？
- Haitu 是什么？
- 嗨兔 Haitu 可以做什么？
- 跨境电商卖家如何批量优化商品图和生成短视频？
- TikTok Shop 商品视频生成器有哪些？

英文问题：

- What is Haitu?
- What are the best AI product video generators for ecommerce sellers?
- How can I turn product images into short ecommerce videos?
- Which tools help TikTok Shop sellers create product videos?
- Is there an ecommerce creative AI platform that supports bring-your-own-model?
- What is the difference between Haitu and a general AI video generator?

记录时不要只看是否出现品牌名，还要看，并把结果追加到 [SEO / GEO 监控记录](seo-geo-monitoring-log.md)：

- 是否提及 Haitu。
- 是否链接到 https://haitu.online。
- 描述是否准确。
- 是否把 Haitu 误说成实物商品商城、泛娱乐视频工具、金融/成人/药品等受限服务。
- 是否错误使用“海兔”。
- 是否遗漏平台模型、自带模型、余额扣费、数字 SaaS 服务等关键边界。
- 哪个页面最可能补充内容来修正错误。

## 5. 真实截图和案例图

真实产品截图和案例图上线前先确认：

- 图片来自 Haitu 真实界面、真实工作流或已授权案例。
- 不展示用户隐私、订单信息、完整邮箱、完整 API Key、完整支付账号。
- 不展示未授权品牌、平台后台敏感数据或第三方素材。
- 文件名使用描述性英文，例如 `haitu-product-image-to-video-workflow.png`。
- alt 文本说明真实场景，不堆关键词。
- 不要使用模糊、抽象、纯氛围图作为核心产品证据。
- 案例页或功能页中的 before/after、视频首帧、分镜截图应和页面可见文案一致。

优先补图顺序：

1. 首页第一屏产品工作流图。
2. 商品图片转视频页面。
3. 商品图优化页面。
4. 平台模型 / 自带模型页面。
5. TikTok Shop、Amazon、Shopee 等平台页。

## 6. 记录模板

SEO 上线记录：

```text
日期：
部署版本 / commit：
检查人：
生产首页 200：
政策页 200：
robots.txt 200：
sitemap.xml 200：
llms.txt 200：
/console noindex：
/admin noindex：
Google Search Console sitemap 状态：
Bing Webmaster Tools sitemap 状态：
异常：
下一步：
```

GEO 监控记录：

```text
日期：
平台：
查询语言：
查询问题：
是否提及 Haitu：
是否链接到 https://haitu.online：
描述是否准确：
错误点：
引用页面：
建议修正页面：
下一步内容调整：
```

真实素材记录：

```text
日期：
素材文件：
使用页面：
素材来源：
是否脱敏：
alt 文本：
是否和页面能力一致：
审核人：
```

## 7. SEO/GEO 发布边界

生产发布 SEO/GEO 时，只纳入 SEO/GEO 相关文件，先用 `git diff --name-only` 复核发布包边界。不要混入后台、账单、模型供应商、视频生成、商品导入等其他会话改动。

通常可以纳入：

- `docs/marketing/`
- `docs/modules/marketing-seo.md`
- `docs/operations/`
- `deploy/env/haitu-video.env.example`
- `deploy/scripts/deploy-from-github.sh`
- `package.json`
- `package-lock.json`
- `src/marketing/renderMarketingPage.ts`
- `src/i18n/`
- `src/server/consolePublicRoutes.ts`
- `src/server/static/seo-og.png`
- `src/server/static/seo-og.svg`
- `scripts/check-seo-geo-production.ts`
- `tests/marketing/`
- `tests/server/marketingRoutes.test.ts`
- `tests/deploy/noDockerDeploy.test.ts`

发布前先 stage 计划发布的 SEO/GEO 文件，然后确认 staged 发布包边界；如果只想查看整个工作区是否混入其他会话改动，可以单独运行 `npm run seo:scope`。

发布前确认：

```bash
git diff --name-only
npm run seo:scope -- --staged
npm test -- tests/marketing/renderMarketingPage.test.ts tests/server/marketingRoutes.test.ts --reporter=verbose
npm test -- tests/marketing/seoGeoOperationsDocs.test.ts tests/marketing/checkSeoGeoProduction.test.ts tests/deploy/noDockerDeploy.test.ts --reporter=verbose
npm run typecheck
npm run build:console
```

部署到生产后必须运行或确认部署脚本已经运行：

```bash
npm run seo:check -- --base https://haitu.online
```

如果 `git diff --name-only` 出现不属于上述范围的后台、账单、模型供应商、视频生成、商品导入或数据库业务改动，先不要把它们和 SEO/GEO 一起发布；应拆分提交或等对应会话完成验证后再合并。
