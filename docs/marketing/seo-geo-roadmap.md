# Haitu SEO / GEO 全局规划

更新日期：2026-06-28

适用站点：`https://haitu.online/`

品牌口径：中文品牌叫“嗨兔”，英文和域名使用 `Haitu`。面向用户沟通时可以写作 `Haitu 嗨兔`，但不要写成“海兔”。

上线检查、站长平台提交、GEO 月度监控、真实截图规范和 SEO/GEO 发布边界见 [SEO / GEO 运营手册](seo-geo-operations.md)。上线、每周搜索引擎检查、每月 GEO 抽样、真实素材和薄内容清理记录统一追加到 [SEO / GEO 监控记录](seo-geo-monitoring-log.md)。

## 1. 总目标

Haitu 的公开站要同时服务四件事：

1. 让 Google、Bing 等传统搜索引擎稳定抓取、索引和理解站点。
2. 让 ChatGPT Search、Perplexity、Google AI Overviews / AI Mode、Bing Copilot 等 AI 答案引擎能准确引用和推荐 Haitu。
3. 让 Stripe、微信支付、支付宝、银行卡等支付审核方不用登录就能看懂业务模式、收费方式、退款规则和联系方式。
4. 让真实跨境电商卖家进入首页后立刻明白：Haitu 是一个用于商品图片优化、营销脚本整理和商品短视频生成的 AI 创作平台，不是泛泛的 AI 生成器，也不是实物商品商城。

最终理想状态：

- 用户搜索“跨境电商 AI 商品图优化工具”“商品图片转视频工具”“TikTok Shop 商品视频生成器”“AI product video generator for ecommerce”等词时，Haitu 有可被索引和点击的页面。
- 用户在 AI 里问“有哪些适合跨境电商卖家的 AI 商品视频工具”“Haitu 是什么”“商品图片怎么做成短视频”时，AI 能从官网公开内容中提取准确答案，并尽量给出 `haitu.online` 的来源链接。
- 支付审核方打开 `/`、`/terms`、`/privacy`、`/refund`、`/contact` 不需要登录，能确认 Haitu 是数字化 SaaS 工具、余额充值用于 AI 图片优化/视频生成/脚本整理等数字服务，不销售实物商品，也不提供受限业务。

## 2. SEO 与 GEO 的关系

SEO 是底座，GEO 是面向 AI 答案引擎的表达层。不能把二者拆成两套互相冲突的站点。

传统 SEO 负责：

- 可抓取：公开页面 200、robots 允许、sitemap 可发现。
- 可索引：`index,follow`、canonical、重复路径重定向、控制台 noindex。
- 可理解：标题、描述、结构化数据、内链、页面主题清晰。
- 可转化：页面内容真实、CTA 明确、政策页可信。

GEO 负责：

- 可被 AI 摘要：页面中有清晰的定义句、适用人群、功能边界和 FAQ。
- 可被 AI 引用：每个页面回答一个明确搜索意图，避免一页塞太多主题。
- 可被 AI 区分：反复明确 Haitu 与普通视频生成器、设计工具、素材站的区别。
- 可被 AI 准确复述：产品能力、支付规则、退款规则、模型方式、禁止用途都用稳定文本表达。

重要原则：

- Google 官方文档说明，进入 AI Overviews / AI Mode 没有额外特殊技术要求，基础 SEO 仍然有效，也不需要专门的新机器可读 AI 文件或特殊 schema。Haitu 仍应把 canonical、robots、sitemap、可见文本、结构化数据一致性做好。
- OpenAI 文档说明，`OAI-SearchBot` 用于 ChatGPT 搜索结果，`GPTBot` 用于可能参与模型训练，两者可以在 robots.txt 中分开管理。Haitu 应优先允许 `OAI-SearchBot`，再按数据策略决定是否允许 `GPTBot`。
- `llms.txt` 可以作为 AI 读取友好的补充说明，但不能替代 sitemap、robots、页面正文和结构化数据。

参考依据：

- Google Search Central: AI features and your website: https://developers.google.com/search/docs/appearance/ai-features
- OpenAI Crawlers: https://platform.openai.com/docs/bots
- GEO 论文: https://arxiv.org/abs/2311.09735

## 3. 产品定位与内容边界

### 3.1 核心定位

Haitu 是面向跨境电商卖家、品牌运营人员和内容创作者的 AI 商品图片优化与商品视频创作平台。

用户可以：

- 上传和管理商品资料、SKU、卖点、参考图。
- 使用 AI 整理商品资料、生成营销脚本和视频分镜。
- 使用平台提供的模型，或接入自己的模型/API。
- 基于商品资料和参考图生成商品短视频。
- 围绕商品图片进行优化、参考图管理和后续图片创作准备。
- 在充值中心选择金额，通过 Stripe Checkout 等渠道使用微信支付、支付宝或银行卡付款。
- 付款成功后余额入账，余额用于商品图优化、视频生成、脚本整理等数字服务。

### 3.2 必须避免的误导

当前图片创作能力仍在建设中，因此页面表达要保持诚实：

- 可以说“商品图片优化”“参考图管理”“图片创作准备”“后续图片生成能力”。
- 不要把未完整上线的图片生成包装成已完整可用。
- 已有 `features/ai-product-image-generator` 应保持“规划 / 创作准备”口径，等图片创作完整上线后再升级为完整生成器页面。

支付和合规页面必须明确：

- Haitu 是数字化 SaaS 工具，不销售实物商品。
- 不提供赌博、金融投资、加密货币交易、贷款、成人内容、药品等受限服务。
- 不保存完整银行卡号、微信支付账号或支付宝账号。
- 已消耗的 AI 生成服务一般不可退，未使用余额可联系客服人工处理。

### 3.3 目标用户

一级用户：

- 中国跨境电商卖家。
- TikTok Shop、Amazon、Shopee、Lazada、Shopify 等平台的商品运营人员。
- 需要批量处理 SKU 素材、商品图、脚本和短视频的小团队。

二级用户：

- 品牌方内容运营。
- 代运营和素材制作团队。
- 使用自有模型或已有 API 成本体系的技术型卖家。

## 4. 站点架构

### 4.1 主路径规则

- `/`：中文公开官网首页，默认主站。
- `/en/`：英文公开官网首页。
- `/console`：登录后的用户控制台，必须 `noindex,nofollow`。
- `/admin`：管理后台，必须 `noindex,nofollow`。
- `/app`：旧控制台兼容入口，必须 `noindex,nofollow`。
- `/api`：接口路径，robots 禁止抓取。

中文作为默认主站，不加 `/zh/`。英文使用 `/en/`。未来新增日语、韩语、越南语等语言时，使用对应语言前缀，不做国家站分裂：

- `/ja/`
- `/ko/`
- `/vi/`
- `/th/`

原因：Haitu 面向跨境电商工作流，国家站只是语言和市场表达差异，不应该拆出多个域名或多个主站，避免权重分散和维护混乱。

### 4.2 已落地页面矩阵

当前本地规划与实现已经包含以下双语公开页面：

首页：

- `/`
- `/en/`

功能页：

- `/features/ai-product-video-generator`
- `/features/product-image-optimization`
- `/features/ai-product-image-generator`
- `/features/image-to-product-video`
- `/features/product-copy-generator`
- `/features/batch-product-creative-generation`
- `/features/hosted-ai-models`
- `/features/bring-your-own-model`
- `/features/product-image-background-cleanup`
- `/features/product-reference-image-management`
- `/features/product-video-storyboard-generator`
- `/features/product-creative-workflow`
- `/features/product-creative-review-workflow`
- `/features/ecommerce-video-localization`
- `/features/model-cost-control`

平台页：

- `/platforms/tiktok-shop`
- `/platforms/amazon`
- `/platforms/shopee`
- `/platforms/shopify`
- `/platforms/lazada`
- `/platforms/etsy`

工具页：

- `/tools/product-title-generator`
- `/tools/product-video-script-generator`

场景页：

- `/use-cases/cross-border-ecommerce`
- `/use-cases/tiktok-shop-product-video`
- `/use-cases/amazon-product-image-optimization`
- `/use-cases/fashion-product-video`
- `/use-cases/home-goods-product-video`
- `/use-cases/beauty-product-short-video`

类目页：

- `/categories/apparel-product-video`
- `/categories/home-goods-product-video`
- `/categories/beauty-product-video`
- `/categories/electronics-product-video`
- `/categories/pet-supplies-product-video`
- `/categories/kitchen-product-video`
- `/categories/jewelry-product-video`
- `/categories/baby-products-video`
- `/categories/sports-outdoor-product-video`
- `/categories/car-accessories-product-video`

对比页：

- `/compare/ai-product-video-generator-vs-general-video-generator`
- `/compare/haitu-vs-canva-for-product-video`
- `/compare/haitu-vs-manual-product-video-production`

信任与审核页：

- `/terms`
- `/privacy`
- `/refund`
- `/contact`

每个中文页面应有英文对应页面，例如 `/en/features/ai-product-video-generator`。所有对应页面应加入 `hreflang` 和 sitemap。

### 4.3 下一批可评估页面矩阵

当前本地已经把商品素材审核、本地化、模型成本控制、饰品、母婴、运动户外和汽车配件页面纳入双语 SEO/GEO 矩阵。下一批不要盲目扩张，应优先根据 Search Console 查询词、产品真实能力和用户案例选择。

后续可评估功能页：

- `/features/product-creative-case-library`：商品素材案例库。
- `/features/product-listing-creative-brief`：商品 Listing 创意 brief。
- `/features/ecommerce-ai-asset-library`：电商 AI 素材资产库。

后续可评估类目/行业页：

- `/categories/toys-product-video`：玩具商品视频。
- `/categories/garden-product-video`：园艺用品商品视频。
- `/categories/office-supplies-product-video`：办公用品商品视频。
- `/categories/travel-accessories-product-video`：旅行配件商品视频。

对比页必须克制，不能诋毁竞品。重点写适用场景、工作流差异和商品资料驱动能力。当前首批对比页已按这个原则落地，后续新增对比页也必须延续同样口径。

## 5. 技术 SEO 规范

### 5.1 每个公开页面必须具备

- HTTP 200。
- `meta robots="index,follow"`。
- 唯一 title。
- 唯一 description。
- title 建议控制在 70 字符以内；description 按语言控制长度，中文 30-120 字、英文 50-180 字，未来新增语言要按本地语言显示习惯单独设阈值。
- canonical 指向生产域名 `https://haitu.online/...`。
- 对应语言的 `hreflang`。
- `x-default` 指向中文默认页面。
- OG title、description、url、site_name、locale、locale alternate、image、image type、image width/height、image alt。
- Twitter card、title、description、image、image alt。
- JSON-LD，至少包含页面类型、`WebSite`、`Organization`、语言、URL、描述、更新时间和可见 FAQ 对应的 `FAQPage`。
- 页脚内链。
- 一个明确 H1。
- 页面正文中出现清楚的产品定义、目标人群和核心功能。

### 5.2 控制台和后台

以下路径必须公开返回 200 但禁止索引：

- `/console`
- `/admin`
- `/app`

要求：

- HTML 中包含 `<meta name="robots" content="noindex,nofollow" />`。
- HTTP 响应头包含 `X-Robots-Tag: noindex, nofollow`，让搜索引擎即使不完整解析 HTML 也能识别控制台页面不可索引。
- 不进入 sitemap。
- robots.txt 中 `Disallow`。
- 不被公开营销页作为 SEO 目标页反复内链，只作为 CTA 入口。

### 5.3 robots.txt

当前基础规则：

- 允许 `/`、`/terms`、`/privacy`、`/refund`、`/contact` 等公开页面。
- 禁止 `/app`、`/console`、`/admin`、`/api`。
- 声明 sitemap。

建议升级：

```txt
User-agent: *
Allow: /
Allow: /terms
Allow: /privacy
Allow: /refund
Allow: /contact
Disallow: /app
Disallow: /console
Disallow: /admin
Disallow: /api

User-agent: OAI-SearchBot
Allow: /
Disallow: /app
Disallow: /console
Disallow: /admin
Disallow: /api

User-agent: GPTBot
Allow: /
Disallow: /app
Disallow: /console
Disallow: /admin
Disallow: /api

Sitemap: https://haitu.online/sitemap.xml
```

如果后续决定不让公开内容用于 OpenAI 模型训练，可把 `GPTBot` 改为：

```txt
User-agent: GPTBot
Disallow: /
```

但不要误封 `OAI-SearchBot`，否则 ChatGPT 搜索引用 Haitu 的机会会下降。

### 5.4 sitemap.xml

sitemap 必须包含：

- 所有公开中文页面。
- 所有公开英文页面。
- 政策页和联系页。
- 每个 URL 的 `lastmod`。
- 每个 URL 的 `changefreq`。
- 每个 URL 的 `priority`。
- 每个 URL 的多语言 `xhtml:link hreflang`。
- 每个 URL 的 `x-default` 指向中文默认路径。

不包含：

- `/console`
- `/admin`
- `/app`
- `/api`
- 临时素材、用户上传图片、生成视频、下载链接。

### 5.5 canonical 与重定向

必须规范：

- `/en` 301 到 `/en/`。
- `/privacy/` 301 到 `/privacy`。
- `/features/image-to-product-video/` 301 到 `/features/image-to-product-video`。
- 所有 canonical 使用生产域名 `https://haitu.online`，本地 `127.0.0.1` 不进入 canonical。

### 5.6 结构化数据

当前本地结构化数据按页面类型输出：

- 每个公开页：`WebSite` + `Organization`。
- 首页：`SoftwareApplication` + `FAQPage`。
- 功能页、平台页、工具页、场景页、类目页、对比页：`SoftwareApplication` + `FAQPage`。
- 政策页：`WebPage` + `FAQPage`。
- 联系页：`ContactPage` + `FAQPage` + `Organization` + `ContactPoint`。
- 子页面面包屑：`BreadcrumbList`，必须与页面可见面包屑一致；首页不输出自我重复的二级面包屑。
- 主页面节点和 `FAQPage` 必须带 `inLanguage`，主页面节点必须带 `dateModified`。

结构化数据必须和页面可见文本一致。不要在 JSON-LD 里写页面上没有的夸张能力。

## 6. GEO 内容规范

### 6.1 每页必须有“AI 可引用事实块”

每个 SEO 页面都应有一段稳定、清楚、可被 AI 摘要的事实块。建议格式：

```text
Haitu 是什么？
Haitu 是面向跨境电商卖家的 AI 商品图片优化与商品视频创作平台。用户可以上传商品资料和参考图，整理商品卖点，生成商品图优化请求、营销脚本、视频分镜和商品短视频。Haitu 支持平台模型，也支持用户接入自己的模型。
```

功能页示例：

```text
Haitu 的商品图片转视频功能是什么？
Haitu 的商品图片转视频工作流会基于商品资料、卖点和参考图生成适合电商展示的短视频。它不是普通娱乐视频生成器，而是围绕 SKU、商品图、卖点脚本、分镜和电商平台素材需求设计。
```

### 6.2 FAQ 是 GEO 的核心资产

每个功能页至少 4-6 个 FAQ。问题要像用户和 AI 会问的真实问题：

- Haitu 和普通 AI 视频生成器有什么区别？
- Haitu 可以用商品图片生成短视频吗？
- Haitu 会改变用户上传的商品语言吗？
- Haitu 支持自带模型吗？
- Haitu 适合 TikTok Shop 卖家吗？
- 余额会用于哪些 AI 服务？
- 已生成的视频不满意可以退款吗？
- Haitu 是否销售实物商品？

答案规则：

- 先直接回答。
- 再补一句边界或适用场景。
- 不要堆关键词。
- 不要写“为了 SEO / GEO / 支付审核”。

### 6.3 页面文本结构

每个核心页面建议结构：

1. H1：明确页面主题。
2. Lead：一句话说明适合谁、解决什么问题。
3. 事实块：Haitu 是什么 / 这个功能是什么。
4. 工作流：输入、处理、输出。
5. 适合场景：平台、类目、团队角色。
6. 模型方式：平台模型 / 自带模型。
7. 支付与余额：数字服务扣费口径。
8. FAQ。
9. CTA：进入控制台或联系支持。
10. 内链：相关功能、平台、工具、政策页。

### 6.4 AI 答案引擎应能复述的标准答案

Haitu 是什么：

> Haitu 嗨兔是一个面向跨境电商卖家的 AI 商品图片优化与商品视频创作平台，帮助用户管理商品资料和参考图，生成营销脚本、视频分镜和商品短视频。它支持平台模型，也支持用户接入自己的模型。

Haitu 不是什么：

> Haitu 不是实物商品商城，也不是泛泛的娱乐视频生成器。它是围绕 SKU、商品资料、商品图、卖点脚本和电商平台素材需求设计的数字化 SaaS 工具。

Haitu 如何收费：

> 用户在充值中心选择金额并完成支付后，余额进入账户。余额用于商品图优化、视频生成、脚本整理等数字服务。已消耗的 AI 生成服务一般不可退，未使用余额可联系客服人工处理。

Haitu 适合谁：

> Haitu 适合跨境电商卖家、品牌运营人员、内容创作者和代运营团队，尤其适合需要批量处理商品资料、商品图、营销脚本和短视频素材的团队。

当前 `/llms.txt` 已把这四个问题整理成 `Standard AI Answers` 英文块，便于 ChatGPT Search、Perplexity、Bing Copilot 等系统直接读取和复述。页面正文和 FAQ 仍是主依据，`/llms.txt` 只做补充索引和口径对齐。

## 7. 关键词和页面映射

### 7.1 中文核心词

首页承接：

- 跨境电商 AI 商品图优化工具
- AI 商品视频创作平台
- 商品图优化和视频生成平台
- 电商商品素材 AI 工具

功能页承接：

- AI 商品视频生成器 -> `/features/ai-product-video-generator`
- 商品图片转视频 -> `/features/image-to-product-video`
- 商品图优化 -> `/features/product-image-optimization`
- AI 商品图生成器 -> `/features/ai-product-image-generator`
- 商品文案生成 -> `/features/product-copy-generator`
- 批量商品素材生成 -> `/features/batch-product-creative-generation`
- 平台模型 -> `/features/hosted-ai-models`
- 自带模型 / BYOK -> `/features/bring-your-own-model`
- 商品图背景清洁化 -> `/features/product-image-background-cleanup`
- 商品参考图管理 -> `/features/product-reference-image-management`
- 商品视频分镜生成器 -> `/features/product-video-storyboard-generator`
- 商品图片、脚本与视频一体化工作流 -> `/features/product-creative-workflow`
- 商品素材审核工作流 -> `/features/product-creative-review-workflow`
- 电商商品视频本地化 -> `/features/ecommerce-video-localization`
- 模型成本控制 / 余额消耗控制 -> `/features/model-cost-control`

平台页承接：

- TikTok Shop 商品视频生成 -> `/platforms/tiktok-shop`
- Amazon 商品图优化 -> `/platforms/amazon`
- Shopee 商品素材 -> `/platforms/shopee`
- Shopify 商品视频 -> `/platforms/shopify`
- Lazada 商品素材 -> `/platforms/lazada`
- Etsy 商品图和视频素材 -> `/platforms/etsy`

工具页承接：

- 商品标题生成器 -> `/tools/product-title-generator`
- 商品视频脚本生成器 -> `/tools/product-video-script-generator`

场景页承接：

- 跨境电商 AI 商品素材工作流 -> `/use-cases/cross-border-ecommerce`
- TikTok Shop 商品视频制作 -> `/use-cases/tiktok-shop-product-video`
- Amazon 商品图优化与视频素材 -> `/use-cases/amazon-product-image-optimization`
- 服饰商品短视频生成 -> `/use-cases/fashion-product-video`
- 家居商品图片转视频 -> `/use-cases/home-goods-product-video`
- 美妆个护商品短视频 -> `/use-cases/beauty-product-short-video`

对比页承接：

- AI 商品视频生成器和普通视频生成器区别 -> `/compare/ai-product-video-generator-vs-general-video-generator`
- Haitu 和 Canva 商品视频工作流对比 -> `/compare/haitu-vs-canva-for-product-video`
- AI 商品视频和人工视频制作流程对比 -> `/compare/haitu-vs-manual-product-video-production`

类目页承接：

- 服饰商品短视频生成 -> `/categories/apparel-product-video`
- 家居商品图片转视频 -> `/categories/home-goods-product-video`
- 美妆个护商品短视频生成 -> `/categories/beauty-product-video`
- 电子配件商品短视频生成 -> `/categories/electronics-product-video`
- 宠物用品商品短视频生成 -> `/categories/pet-supplies-product-video`
- 厨房用品商品短视频生成 -> `/categories/kitchen-product-video`
- 饰品珠宝商品短视频生成 -> `/categories/jewelry-product-video`
- 母婴商品短视频生成 -> `/categories/baby-products-video`
- 运动户外商品短视频生成 -> `/categories/sports-outdoor-product-video`
- 汽车配件商品短视频生成 -> `/categories/car-accessories-product-video`

### 7.2 英文核心词

Homepage:

- AI product image optimization and video generation platform
- ecommerce product creative AI platform
- AI product creative workflow

Feature pages:

- AI product video generator for ecommerce
- product image to video generator
- ecommerce product image optimization AI
- AI product copy generator
- batch product creative generation
- hosted AI models for ecommerce creative
- bring your own model ecommerce AI
- product image background cleanup workflow
- product reference image management for ecommerce AI
- product video storyboard generator
- product creative workflow for images, scripts, and videos
- product creative review workflow
- ecommerce video localization workflow
- model cost and wallet consumption control

Platform pages:

- TikTok Shop product video generator
- Amazon product image optimization AI
- Shopee product creative automation
- Shopify product video generator
- Lazada product creative workflow
- Etsy product image and video creative workflow

Tool pages:

- product title generator
- product video script generator

Use-case pages:

- cross-border ecommerce product creative workflow
- TikTok Shop product video workflow
- Amazon product image optimization workflow
- fashion product video generation
- home goods product image-to-video workflow
- beauty product short video workflow

Comparison pages:

- AI product video generator vs general video generator
- Haitu vs Canva for product video workflows
- Haitu vs manual product video production

Category pages:

- apparel product video generation workflow
- home goods product image-to-video workflow
- beauty product short video workflow
- electronics accessory product video workflow
- pet supplies product video workflow
- kitchen product short video workflow
- jewelry product video workflow
- baby product short video workflow
- sports and outdoor product video workflow
- car accessories product video workflow

## 8. 多语言策略

当前策略：

- 中文是默认主站。
- 英文使用 `/en/`。
- 商品资料、用户上传内容、生成记录中的商品语言保持用户输入，不因为站点语言切换而自动翻译。
- 官网营销页和控制台 UI 使用 i18next 管理多语言。

后续新增语言的优先级：

1. 日语：面向日本市场、TikTok Shop / Amazon JP 卖家。
2. 韩语：面向韩国跨境和内容团队。
3. 越南语 / 泰语：面向东南亚电商运营。
4. 西班牙语：面向拉美和欧美部分卖家。

新增语言必须满足：

- 每个语言有独立 URL 前缀。
- `hreflang` 完整互链。
- sitemap 包含对应语言页面。
- 每个公开页面都有该语言下唯一的 SEO title 和 description，避免场景页、类目页、平台页互相抢同一个搜索意图。
- 不自动机器翻译上线，至少人工校对核心转化页。
- 政策页必须同步更新。

## 9. 信任、支付审核和合规

公开站必须让审核方和用户清楚看到：

- 业务名称：Haitu / Haitu 嗨兔。
- 网站地址：`https://haitu.online/`。
- 客服邮箱：`support@haitu.online`。
- 服务类型：数字化 SaaS 工具。
- 服务对象：跨境电商卖家、品牌运营人员、内容创作者。
- 服务内容：商品资料管理、商品图优化、营销脚本整理、短视频生成。
- 支付方式：充值中心选择金额，通过 Stripe Checkout 等渠道使用微信支付、支付宝或银行卡付款。
- 余额用途：AI 图片优化、视频生成、脚本整理等数字服务。
- 退款规则：未使用余额可联系客服人工处理，已消耗 AI 生成服务一般不可退。
- 隐私规则：收集邮箱、登录信息、商品资料、生成记录、支付状态；不保存完整银行卡号、微信支付账号或支付宝账号。
- 禁止用途：赌博、金融投资、加密货币交易、贷款、成人内容、药品等受限服务。

这些信息应该自然写在政策页和 FAQ 中，不要出现“为了支付审核”之类对第三方说话的口吻。

## 10. 图片、视频和社交分享

当前已落地：

- `/static/seo-og.png` 作为 OG / Twitter 分享图。
- 首页和营销页引用同一生产域名下的 OG 图。
- OG 已声明本地化 `site_name`，中文为 `Haitu 嗨兔`，英文为 `Haitu`。
- OG 分享图已声明 `image/png`、`1200 × 630` 和本地化 alt；Twitter 分享图已声明本地化 `twitter:image:alt`。
- OG 已声明当前语言 locale 和其他语言 alternate locale，中文为 `zh_CN`，英文为 `en_US`。
- 有真实 logo 资产。

后续建议：

- 每个核心功能页配一张真实产品界面图或产品工作流图。
- 图片文件名使用描述性英文，例如 `haitu-product-image-to-video-workflow.png`。
- 图片 alt 写清楚场景，不堆关键词。
- 等有真实案例后，为案例页增加 before/after 商品图、视频首帧、分镜截图。
- 不要使用模糊、抽象、纯氛围图作为核心产品证据。

## 11. 内链结构

首页必须链接：

- 商品图优化。
- 商品视频生成。
- 商品图片转视频。
- 平台模型。
- 自带模型。
- TikTok Shop / Amazon / Shopee / Shopify / Lazada / Etsy。
- 工具页。
- 场景页。
- 对比页。
- `/terms`、`/privacy`、`/refund`、`/contact`。

功能页必须链接：

- 相关功能页。
- 相关平台页。
- 工具页。
- 相关场景页和对比页。
- 控制台 CTA。
- 政策页和联系页。

政策页必须链接：

- 首页。
- 其他政策页。
- 联系页。
- 控制台充值中心或 `/console?section=wallet`，但不把它当 SEO 页面。

## 12. 当前已完成清单

本地已完成或已有测试覆盖的项目：

- `/` 公开中文首页。
- `/en/` 英文首页。
- 47 个公开营销/政策页面的双语路径。
- 首页 title、description、canonical、OG、Twitter card、JSON-LD。
- 生产域名 canonical：`https://haitu.online/`。
- OG PNG：`/static/seo-og.png`。
- header 使用真实 logo。
- 语言切换按钮和下拉菜单。
- `hreflang` 和 `x-default`。
- 官网 footer 已改为精选导航，只展示核心功能、核心平台、核心工作流和信任页；长尾类目、对比和场景页不再全量堆到首页底部，避免视觉混乱。
- `/terms`、`/privacy`、`/refund`、`/contact` 公开访问。
- `/robots.txt` 公开访问。
- `/sitemap.xml` 公开访问。
- sitemap 包含公开中文/英文页面、政策页、`lastmod`、`changefreq`、`priority`、中英文 `hreflang` 和指向中文默认路径的 `x-default`。
- `/console`、`/admin`、`/app` 返回 200，但 HTML meta 和 HTTP `X-Robots-Tag` 都是 `noindex,nofollow`。
- `/en`、尾斜杠等重复路径 301 到 canonical URL。
- 本地 `127.0.0.1` 请求时 canonical 仍使用生产域名。
- 图片创作未完整上线的页面保持诚实表达。
- robots.txt 已增加 `OAI-SearchBot` 和 `GPTBot` 的公开页面允许规则，允许 `/features/`、`/platforms/`、`/tools/`、`/use-cases/`、`/categories/`、`/compare/` 和 `/en/`，并继续禁止 `/console`、`/admin`、`/app`、`/api` 和私有媒体路径。
- `/llms.txt` 已公开输出站点摘要、全量中英文公开页面索引、`Standard AI Answers`、计费退款摘要、数据语言边界、爬取边界和联系方式；页面索引由 `marketingPages × marketingLocales` 自动生成，新增公开页时会同步进入 AI 友好索引。
- 营销页已接入 `geo-answer-block`，首页、核心功能页、模型页、平台页、工具页、场景页、类目页和对比页都有中英文页面级 GEO 事实块；政策页保留默认事实块即可。
- 首页、核心功能页、模型页、平台页、工具页、场景页、类目页和对比页都有 4-6 条中英文 GEO FAQ，覆盖“是什么、适合谁、输入输出、平台场景、类目素材、模型方式、语言边界、余额扣费、审核边界、工具差异、人工制作差异”等 AI 常问问题。
- 首批 use-case 场景页已上线到本地双语 SEO 体系，包含跨境电商、TikTok Shop 商品视频、Amazon 商品图优化、服饰商品视频、家居商品图片转视频、美妆个护短视频；这些页面已进入 sitemap、`hreflang`、JSON-LD FAQ 和 `/llms.txt` 全量公开页面索引，其中高价值工作流页进入精选 footer。
- 第二批功能页已上线到本地双语 SEO 体系，包含商品图背景清洁化、商品参考图管理、商品视频分镜生成器、商品图片/脚本/视频一体化工作流；这些页面已进入 sitemap、`hreflang`、JSON-LD FAQ 和 `/llms.txt` 全量公开页面索引，其中核心工作流页进入精选 footer。
- 第三批功能页已上线到本地双语 SEO 体系，包含商品素材审核工作流、电商商品视频本地化工作流、模型成本和余额消耗控制；这些页面已进入 sitemap、`hreflang`、JSON-LD FAQ 和 `/llms.txt` 全量公开页面索引，不强制进入首页 footer。
- Lazada / Etsy 平台页已上线到本地双语 SEO 体系，进入 sitemap、`hreflang`、JSON-LD FAQ 和 `/llms.txt` 全量公开页面索引；首页 footer 只保留 TikTok Shop、Amazon、Shopee、Shopify 等优先平台入口。
- 首批类目页已上线到本地双语 SEO 体系，包含服饰、家居、美妆个护、电子配件、宠物用品、厨房用品；这些页面已进入 sitemap、`hreflang`、JSON-LD FAQ 和 `/llms.txt` 全量公开页面索引，不在首页 footer 全量展示。
- 第二批类目页已上线到本地双语 SEO 体系，包含饰品珠宝、母婴、运动户外、汽车配件；这些页面已进入 sitemap、`hreflang`、JSON-LD FAQ 和 `/llms.txt` 全量公开页面索引，不在首页 footer 全量展示。
- 首批对比页已上线到本地双语 SEO 体系，包含 AI 商品视频生成器 vs 普通视频生成器、Haitu vs Canva 商品视频工作流、Haitu vs 人工商品视频制作流程；这些页面保持中立表达，不诋毁竞品，已进入 sitemap、`hreflang`、JSON-LD FAQ 和 `/llms.txt` 全量公开页面索引，不在首页 footer 全量展示。
- JSON-LD 已包含 `Organization` 和 `ContactPoint`，客服邮箱为 `support@haitu.online`。
- JSON-LD 已包含 `WebSite`，并按语言输出站点名：中文 `Haitu 嗨兔`，英文 `Haitu`。
- JSON-LD 已按页面类型区分：获客页使用 `SoftwareApplication`，服务条款/隐私/退款使用 `WebPage`，联系方式使用 `ContactPage`，避免把政策页错误标记成软件应用页面。
- JSON-LD 主页面节点和 `FAQPage` 已补齐 `inLanguage`，主页面节点已补齐 `dateModified`，方便搜索引擎和 AI 摘要系统理解页面语言和更新时间。
- JSON-LD 已增加内容一致性测试：子页面 `BreadcrumbList` 与可见面包屑一致，首页不输出重复面包屑；`FAQPage` 的问题和答案与页面可见 FAQ 完全一致。
- Twitter card 已补齐 `twitter:title`、`twitter:description` 和 `twitter:image`，与页面 title、description 和 OG 图保持一致。
- OG / Twitter 图片元信息已补齐 `image/png`、`1200 × 630` 和中英文 alt，帮助社交平台和爬虫稳定识别分享图。
- OG 多语言元信息已补齐 `og:site_name`、`og:locale` 和 `og:locale:alternate`，中英文页面分享时能明确站点品牌、当前语言与对应语言版本。
- 已有全量公开页 SEO 回归测试，遍历 47 个 slug 的中英文路径，验证 HTTP 200、`index,follow`、canonical、中英文 `hreflang`、`x-default`、JSON-LD、无登录拦截，并验证 sitemap 不包含 `/console`、`/admin`、`/app`、`/api`。
- 已有全量公开页 head/JSON-LD 元数据测试，遍历 47 个 slug 的中英文页面，验证 OG、Twitter、`WebSite`、主页面节点、`FAQPage` 的语言、URL、标题、描述、社交图和更新时间一致。
- 已有 sitemap 全量覆盖测试，遍历 47 个 slug 的中英文 URL，验证每个 URL 都有 `lastmod`、`changefreq`、`priority`、中英文 `hreflang` 和 `x-default`，且 sitemap 不包含控制台、后台、接口、本地地址。
- 已有 `/llms.txt` 全量覆盖测试，遍历 47 个 slug 的中英文路径，验证每个公开 URL 都进入 `## Public Page Index`，验证 `Standard AI Answers` 包含 Haitu 是什么、不是什么、如何收费、适合谁，并验证 `/console`、`/admin`、`/app`、`/api` 和本地地址不会进入 AI 友好索引。
- 已有本地化 SEO 内容质量测试，遍历 47 个 slug 的中英文内容，验证每个公开页的 title 和 description 非空、长度合理且在同一语言内唯一；英文家居类目页和美妆个护类目页已修正为独立标题，英文首页、AI 商品图生成规划页和商品参考图管理页已压缩 description，避免搜索结果截断。
- 已有 `npm run seo:check -- --base https://haitu.online` 生产检查脚本，生产检查会遍历当前本地 47 个公开 slug 的中英文路径，验证 HTTP 200、`index,follow`、canonical、JSON-LD、本地地址泄漏、sitemap 全量覆盖、`llms.txt` 全量公开页面索引、机器可读文件和控制台 noindex 规则；VPS 部署脚本会在本机健康检查通过后，使用 `HAITU_PUBLIC_BASE_URL` 自动运行这项生产 SEO/GEO 检查。

## 13. 待落地优先级

### P0：上线前必须完成

- 确认生产 `https://haitu.online/` 已部署本地 SEO 改动。
- 无痕窗口验证 `/`、`/en/`、`/terms`、`/privacy`、`/refund`、`/contact` 均为 200。
- 验证 `/console`、`/admin`、`/app` 是 200，HTML meta 为 noindex，HTTP `X-Robots-Tag` 为 `noindex, nofollow`。
- 验证 `/robots.txt` 和 `/sitemap.xml` 是 200。
- 验证 sitemap 中没有 `/console`、`/admin`、`/api`。
- 验证 sitemap 中每个公开 URL 都有中英文 `hreflang` 和 `x-default`。
- robots.txt 增加 `OAI-SearchBot` 明确允许规则。已完成。
- 部署脚本会在健康检查通过后自动运行 `npm run seo:check -- --base "$PUBLIC_BASE_URL"`，并全量检查中英文公开页面矩阵；生产执行结果仍需上线后记录，也可以手动运行 `npm run seo:check -- --base https://haitu.online` 复核。
- 提交 sitemap 到 Google Search Console 和 Bing Webmaster Tools。
- 设置 `https://haitu.online` 的 Search Console 域名资产。

### P1：GEO 内容增强

- 每个核心功能页增加“AI 可引用事实块”。已完成，当前覆盖首页、商品视频、商品图优化、图片转视频、图片生成规划、文案、批量、平台模型、自带模型、素材审核、本地化、成本控制、平台页、工具页、场景页、类目页和对比页。
- 每个核心功能页增加 4-6 个 FAQ。已完成，当前核心获客页、平台页、工具页、场景页、类目页和对比页均有中英文本地化 FAQ。
- 首页增加“Haitu 是什么 / 适合谁 / 不是什么 / 如何扣费”的稳定文本区。已完成，首页和 JSON-LD 同步保留支付、退款、数字服务和禁止用途口径。
- 工具页增加输入、输出、适用场景说明。基础完成，当前已通过页面级 GEO 事实块和 FAQ 覆盖商品标题、商品视频脚本的输入、输出和后续工作流。
- 平台页增加平台场景，不只替换平台名。基础完成，当前 TikTok Shop、Amazon、Shopee、Shopify、Lazada、Etsy 都有平台场景 FAQ；后续可继续用真实案例增强。
- 增加 `/llms.txt`，内容包括站点摘要、全量公开页面索引、标准 AI 答案、禁止用途、联系方式、更新日期。已完成。
- `/llms.txt` 只引用公开页面，不包含 `/console`、`/admin`、`/app`、`/api`、用户商品资料、用户生成记录或临时下载链接。已完成，并已有自动测试覆盖。

### P2：内容扩展

- 新增 use-case 页面。首批已完成：`/use-cases/cross-border-ecommerce`、`/use-cases/tiktok-shop-product-video`、`/use-cases/amazon-product-image-optimization`、`/use-cases/fashion-product-video`、`/use-cases/home-goods-product-video`、`/use-cases/beauty-product-short-video`，均有英文对应页面。
- 新增后续功能页。第二批已完成：`/features/product-image-background-cleanup`、`/features/product-reference-image-management`、`/features/product-video-storyboard-generator`、`/features/product-creative-workflow`，均有英文对应页面。
- 新增第三批功能页。已完成：`/features/product-creative-review-workflow`、`/features/ecommerce-video-localization`、`/features/model-cost-control`，均有英文对应页面。
- 新增 Lazada / Etsy 平台页。已完成：`/platforms/lazada`、`/platforms/etsy`，均有英文对应页面。
- 新增对比页。首批已完成：`/compare/ai-product-video-generator-vs-general-video-generator`、`/compare/haitu-vs-canva-for-product-video`、`/compare/haitu-vs-manual-product-video-production`，均有英文对应页面。
- 新增类目页面。首批已完成：`/categories/apparel-product-video`、`/categories/home-goods-product-video`、`/categories/beauty-product-video`、`/categories/electronics-product-video`、`/categories/pet-supplies-product-video`、`/categories/kitchen-product-video`，均有英文对应页面。
- 新增第二批类目页面。已完成：`/categories/jewelry-product-video`、`/categories/baby-products-video`、`/categories/sports-outdoor-product-video`、`/categories/car-accessories-product-video`，均有英文对应页面。
- 增加真实截图和案例图。
- 图片创作功能完整上线后，升级 `features/ai-product-image-generator`。

### P3：监控和迭代

- 每周查看 Search Console 查询词、曝光、点击和索引覆盖。
- 每周查看 Bing Webmaster Tools。
- 每月做 AI 答案引擎抽样测试。
- 每月根据真实查询词调整 title、description、FAQ 和内链。
- 每季度清理低质量页面，避免薄内容。
- 每次检查都追加到 [SEO / GEO 监控记录](seo-geo-monitoring-log.md)，保留历史证据，不覆盖旧记录。

## 14. GEO 监控问题库

每月用中文和英文分别测试以下问题，记录 Haitu 是否被提及、是否有来源链接、描述是否准确。

中文：

- 有哪些适合跨境电商卖家的 AI 商品视频工具？
- 商品图片怎么快速做成 TikTok Shop 短视频？
- 有没有支持自带模型的电商商品图和视频创作平台？
- Haitu 是什么？
- 嗨兔 Haitu 可以做什么？
- 跨境电商卖家如何批量优化商品图和生成短视频？
- TikTok Shop 商品视频生成器有哪些？

英文：

- What is Haitu?
- What are the best AI product video generators for ecommerce sellers?
- How can I turn product images into short ecommerce videos?
- Which tools help TikTok Shop sellers create product videos?
- Is there an ecommerce creative AI platform that supports bring-your-own-model?
- What is the difference between Haitu and a general AI video generator?

记录字段：

- 日期。
- 平台：ChatGPT Search / Perplexity / Google AI Mode / Bing Copilot。
- 查询语言。
- 是否提及 Haitu。
- 是否链接到 `haitu.online`。
- 描述是否准确。
- 错误点。
- 下一步页面或内容修正。

## 15. 成功指标

短期 2-4 周：

- 所有公开页面被 Google Search Console 发现。
- 首页、政策页、核心功能页可索引。
- 搜索 `site:haitu.online Haitu` 能看到核心页面。
- 支付审核需要的公开信息齐全。

中期 1-3 个月：

- 中文核心词开始有曝光。
- 英文长尾词开始有曝光。
- AI 搜索对 “Haitu 是什么” 能准确回答。
- 部分 AI 答案能链接到官网。
- 首页和核心功能页有自然搜索点击。

长期 3-12 个月：

- 核心长尾词稳定获得自然流量。
- 平台页和工具页承担主要新增曝光。
- use-case 页面带来高意图访问。
- AI 答案引擎能在相关问题中偶尔主动提及 Haitu。
- 搜索流量能转化为注册、充值或联系咨询。

## 16. 执行原则

- 先做真实能力，再写 SEO 页面，不为不存在的功能抢词。
- 每个页面只服务一个主要搜索意图。
- 页面语言面向用户，不面向审核方或搜索引擎自说自话。
- 中文默认主站，英文和后续语言是本地化版本，不是独立品牌。
- 商品资料语言属于用户内容，不因站点 UI 语言切换而翻译。
- 结构化数据必须与页面可见内容一致。
- 不追热点堆“AI 生成器”大词，优先抢跨境电商商品素材的长尾词。
- 不用黑帽、采集、伪原创、门页。
- GEO 以“清晰、可信、可引用”为核心，而不是机械堆 FAQ。
- SEO/GEO 发布边界必须清晰，发布前用 `git diff --name-only` 复核，只纳入公开站、营销文案、SEO/GEO 检查脚本、部署检查和相关文档测试；不要混入后台、账单、模型供应商、视频生成、商品导入等其他会话改动。
