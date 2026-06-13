# Haitu AI 商品视频生成平台正式计划

## 1. 项目定位

Haitu 是一个独立的 AI 商品视频生成平台，主域名为 `haitu.online`。平台面向跨境电商卖家，第一批目标用户聚焦 TikTok Shop 日本站卖家，核心能力是基于商品事实、商品图片和商品视频，生成可发布到 TikTok 的日语商品引流短视频。MVP 默认走 8 秒低成本引流版，后续支持 10-15 秒精修版本。

平台不是传统素材库混剪工具，也不以 MoneyPrinterTurbo 作为核心路线。真实电商视频的关键在于商品一致性、卖点合规、日语表达自然、字幕与价格信息可控，因此第一版应围绕商品 reference、视频生成模型、后处理和质检构建。

## 2. 已确认的关键判断

### 2.1 MoneyPrinterTurbo 不作为主路线

MoneyPrinterTurbo 的主要流程是 LLM 写稿、Pexels/Pixabay 免费素材混剪、TTS、字幕、BGM 和 FFmpeg 合成。这个方案适合泛内容视频，但不适合真实商品广告，因为素材库视频不一定是目标商品，容易产生商品不一致、素材不可信和广告转化弱的问题。

可借鉴部分：

- 批量任务管理
- 字幕生成与压制
- BGM、封面、缩略图等后处理思路
- FFmpeg 合成与导出流程

不采用部分：

- 免费素材库混剪作为商品视频主体
- 用泛素材替代真实商品图或商品视频
- 直接接入 MoneyPrinterTurbo 作为平台核心

### 2.2 主路线使用 reference-based 视频模型

核心路线应以 Seedance 2.0 这类视频模型为主，后续保留 Veo、Runway、Kling 等 provider 接入空间。

基础流程：

1. 用户上传商品参考图或商品视频。
2. 用户填写或导入商品事实包。
3. LLM 基于商品事实包生成日语广告脚本。
4. LLM 生成面向视频模型的结构化 prompt。
5. 视频模型一次生成 4-15 秒竖屏视频，MVP 默认 8 秒低成本引流版。
6. Worker 下载结果并做 FFmpeg 后处理。
7. 后处理压制字幕、价格、CTA、Logo 或水印。
8. 系统进行基础质检和高级质检。
9. 用户审核后导出或回填商品素材。

### 2.3 第一版不做传统分段生成

第一版不采用 2-3 秒一段的传统拆段生成。拆段生成会增加镜头衔接、风格一致性、音画同步和成本控制复杂度。

第一版采用一次生成，但在 prompt 中写入软分镜。为了控制成本，MVP 默认 8 秒；15 秒只作为高价精修选项。

- 4-6 秒版：最低成本测试用，适合只验证商品是否跑偏，不作为默认。
- 8 秒版：开场、商品细节、使用场景、CTA，作为默认引流视频长度。
- 10 秒版：比 8 秒多一个使用场景或卖点停留。
- 15 秒版：0-3s 痛点，3-8s 商品展示，8-12s 场景卖点，12-15s 定格 CTA。

这些分镜是 prompt 内的节奏约束，不是多次模型调用。

### 2.4 字幕与 CTA 自己后压

第一版可以允许模型生成画面、环境声、旁白和 BGM，但字幕、价格、CTA、Logo、水印建议由平台后处理压制。

原因：

- 字幕内容需要可控、可审、可修改。
- 价格、折扣、CTA 往往需要按店铺或活动调整。
- TikTok Shop 日本站广告表达需要规避夸大和未确认信息。
- 模型内生字幕容易错字、乱码、遮挡主体或无法二次编辑。

如果模型旁白质量不稳定，第二阶段可改为平台生成日语 TTS，并将 TTS 音频作为参考音频或后期音轨。

### 2.5 参考项目的取舍

已调研的相近开源项目分为三类：

- [Huobao Drama](https://github.com/chatfire-AI/huobao-drama)：短剧工作台路线，核心价值是把原始内容、剧本、角色、场景、分镜、图片、单镜头视频、TTS、合成和导出拆成可检查的中间资产。Haitu 可借鉴“中间资产可见、可编辑、可重跑”的思想，也可以借鉴其顶部项目状态、左侧流程轨、中央空状态 / 执行区、底部动作条的工作台布局；但不照搬短剧的角色/场景/多镜头完整复杂度。
- [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo)：一键泛内容短视频路线，适合参考批量生成、任务参数、TTS、字幕、BGM、FFmpeg 合成和导出，但不作为 Haitu 主路线，因为它以素材库混剪为核心，不能保证商品一致性。
- [NarratoAI](https://github.com/linyqh/NarratoAI) 和 [ShortGPT](https://github.com/RayVentura/ShortGPT)：适合参考自动剪辑、解说文案、TTS、字幕和素材处理。后续如果做“竞品视频 / 长素材视频 -> 商品短视频再创作”，可以再深入借鉴。
- [Video Wizard](https://github.com/el-frontend/video-wizard)：适合参考任务历史、状态进度、字幕编辑、模板预览、Remotion 渲染和长任务队列。Haitu 后处理和审核工作台可以吸收这类设计。
- [OpenAI ImageGen Photobooth Demo](https://github.com/openai/openai-imagegen-demo) 和 [GPT Image Playground](https://github.com/Alasano/gpt-image-1-playground)：适合参考图片编辑模式、风格预设、流式 partial image、历史记录、成本记录、Send to Edit、mask 和多候选图对比。
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI)：适合作为高级本地 / 私有图像工作流后端，不应进入第一版主流程。

结论：Haitu 主线不是“一键黑盒生成到底”，也不是完整短剧制作平台，而是商品事实包、参考图、可替换 provider、后处理、质检和人工审核组成的电商视频工作台。开源项目的借鉴重点是流程节点、工程边界和工作台信息架构，不是直接接入它们作为平台核心。

### 2.6 生图作为视频前置资产优化

未来需要增加生图能力，但它应服务于商品视频生成，而不是变成独立泛用绘图工具。目标是基于现有商品图和补充描述，生成更适合短视频 reference、首帧、场景图或主图候选的优化图片。

默认图像模型建议使用 OpenAI `gpt-image-2`，用户口头称“image2”时，系统配置名统一写作 `gpt-image-2`。同时保留其他 provider 选择，例如火山图像模型、Gemini 图像模型、ComfyUI 或本地 mock。

第一批生图模式：

- 主图清洁化：去除杂乱背景，保留商品真实颜色、形状、结构和 logo。
- 生活场景图：把商品放进合理使用场景，但不得新增商品事实外功能。
- 细节特写图：突出材质、结构、开合、收纳、接口等已验证卖点。
- 视频首帧图：生成适合 Seedance / 视频模型使用的稳定首帧。
- 广告海报底图：预留 CTA、价格和字幕空间，但不让图像模型直接生成文字。

关键原则：

- 保真优先，审美第二。
- 不新增商品功能、认证、材质、尺寸、销量、排名或功效。
- 所有生图结果必须保存输入图、prompt、provider、model、参数、成本、输出图和人工选择记录。
- 生图候选不能自动进入视频任务；用户或规则需要显式选择“设为视频参考图”或“设为首帧候选”。

## 3. 目标用户与核心场景

### 3.1 目标用户

第一批用户：

- 跨境电商卖家
- TikTok Shop 日本站卖家
- 需要批量制作商品广告短视频的小团队
- 已经有商品图、商品详情、采购信息，但缺少日语视频制作能力的运营人员

暂不优先服务：

- 品牌大片制作团队
- 追求复杂影视分镜和精修广告的客户
- 无商品事实、只想自动编造卖点的用户
- 需要全自动发布 TikTok 的用户

### 3.2 核心场景

第一版必须服务的场景：

- 上传商品图片后生成 8 秒低成本竖屏商品引流视频
- 必要时生成 8-15 秒精修商品广告
- 根据商品事实自动生成自然日语脚本
- 同一商品生成 3-5 个视频版本
- 视频完成后查看任务状态、视频结果和质检报告
- 用户审核后下载可发布视频

后续场景：

- 批量导入商品
- 复用品牌字幕样式和 CTA
- 用户自带模型 API key
- 按积分或套餐扣费
- 对接 TikTok、店小秘、Shopify 等外部平台

## 4. 产品原则

### 4.1 商品事实优先

脚本和画面 prompt 只能使用商品事实包中的已验证信息。系统不得编造功效、排名、销量、耐重、防水、医美效果、安全认证等未确认内容。

### 4.2 参考图优先

视频生成必须围绕用户上传的商品 reference，而不是泛素材库。商品颜色、形状、结构、主要部件应尽量保持一致。

### 4.3 可审核，不全自动发布

平台第一阶段不做全自动无审核发布。AI 负责生成候选视频，用户负责最终审核与发布决策。

### 4.4 后处理可控

字幕、价格、CTA、Logo、品牌水印、封面、导出格式应尽量由平台控制，而不是完全交给模型生成。

### 4.5 Provider 可替换

不要把业务逻辑写死到 Seedance。任务系统需要记录 provider、model、duration、aspectRatio、cost 和 input assets，为后续接入 Veo、Runway、Kling 留接口。

## 5. 推荐技术架构

```text
Web 管理台
  ↓
API 后端
  ↓
任务队列
  ↓
Image Worker / Video Worker
  ↓
Image Provider / Video Provider
  ↓
对象存储
  ↓
质检与审核
  ↓
导出 / 发布 / 回填商品素材
```

当前视频主线：

```text
商品事实包 + 参考图
  ↓
脚本和 Seedance-style prompt
  ↓
Video Worker
  ↓
Seedance / Veo / Runway / Kling provider
  ↓
对象存储
  ↓
质检与审核
  ↓
导出 / 发布 / 回填商品素材
```

未来生图前置主线：

```text
原始商品图 + 商品事实包 + 优化描述
  ↓
Image Worker
  ↓
gpt-image-2 / 其他 Image Provider
  ↓
生成候选图
  ↓
人工选择 / 标记用途
  ↓
进入视频 reference 或首帧候选
```

### 5.1 Frontend

推荐：

- React
- Vite
- TypeScript

前端可以复用现有 TK 工具站的经验，但建议作为独立站点建设。Haitu 的界面应该更接近 SaaS 工作台，而不是内容站或营销页。

第一版重点页面：

- 登录页
- Dashboard
- 商品项目
- 商品详情
- 生成记录 / 排错
- 视频审核页
- API 管理
- 额度 / 账单
- API Key 管理

第一版 UI 风格建议：

- 工作台优先，信息密度适中。
- 视频结果、任务状态、成本和质检结论要可扫描。
- 避免过度营销化 hero 页面。
- 默认进入商品项目，主流程只突出“商品项目 → 审核发布”；生成记录和运营概览作为隐藏后台能力，费用、API Key、API 通道和视频风格配置归入费用记录 / API 管理，避免后台信息污染创作入口。
- 商品项目和生成记录要分层：商品项目第一屏只保留紧凑商品库列表和一个“添加商品”入口；选中商品后进入 Huobao 式 Product Studio，而不是把商品列表、入库表单、操作反馈、日志和创作流程长期挤在同一屏。
- Product Studio 采用“顶部商品标题 / 左侧流程轨 / 中央单阶段执行区 / 底部上一步下一步”的工作台骨架。左侧流程轨只负责阶段跳转和完成状态，中间不再重复子导航、进度条、阶段胶囊或独立阶段工具栏，让用户一次只处理一个商品和一个阶段；顶部不直接触发生成，阶段说明只放在对应阶段面板内，生成、审核和发布也只放在对应阶段面板内。
- 视频风格就是用户创作时选择的模板，应放在 Product Studio 的“生成视频”步骤里；点击“生成 3 个视频版本”后仍留在当前商品 Studio，只刷新该商品的生成结果，不跳到后台记录或任务队列。
- Product Studio 前台流程只呈现用户能直接理解和操作的 6 步：“商品资料 → 参考图片 → 脚本分镜 → 生成视频 → 审核发布 → 发布素材”。数据清洗、后处理、任务队列、provider、prompt、manifest 和运行状态都属于后台记录或审核排错能力，不作为商品创作主 UI 节点；内部接口仍可叫 publish package，但前台不使用“发布包”。

### 5.2 Backend

推荐：

- Node.js
- Fastify 或 NestJS
- TypeScript

职责：

- 用户、登录、租户
- 商品事实包
- 文件上传签名
- 视频任务创建和状态查询
- 脚本生成
- prompt 生成
- 额度与成本记录
- provider 配置和 BYOK
- 质检报告读取

Fastify 更轻，更适合快速 MVP。NestJS 结构更强，更适合团队长期维护。如果第一阶段只有单人快速验证，建议 Fastify；如果一开始就准备多人协作和模块化边界，建议 NestJS。

### 5.3 Database

推荐：

- Postgres
- Supabase/Postgres 可作为托管选择

相比 Firestore，Postgres 更适合 SaaS、多租户、账单、任务查询、权限、成本统计和后续报表。

### 5.4 Queue

推荐：

- Redis
- BullMQ

视频生成是长任务，必须异步队列化。API 创建任务后立即返回 job id，Worker 从队列消费任务并推进状态。

### 5.5 Worker

Worker 独立于 API 后端部署。第一阶段可以只有 Video Worker；引入生图能力后，建议拆出 Image Worker，或者在同一 worker 进程中按任务类型分流。

职责：

- 消费 `video_jobs`
- 调用 Seedance 或其他 provider
- 轮询远端生成任务
- 下载原始视频
- FFmpeg 后处理
- 生成缩略图
- 上传对象存储
- 触发基础质检和高级质检
- 写回状态、成本、输出和质检报告

Image Worker 职责：

- 消费 `image_jobs`
- 读取原始商品图和商品事实包
- 按优化目标生成图像 prompt
- 调用 `gpt-image-2` 或其他 image provider
- 保存候选图、usage、成本和 provider 响应
- 生成缩略图
- 写回人工审核状态和可选用途

### 5.6 Storage

推荐：

- Cloudflare R2
- S3
- Google Cloud Storage

第一版优先 Cloudflare R2，原因是成本可控、适合视频对象存储、和 `haitu.online` 结合方便。

原则：

- 视频、商品图片、缩略图不放数据库。
- 数据库只保存 URL、object key、mime、大小、时长、宽高等元信息。
- 用户访问视频使用 signed URL。
- 生图输入图、候选图和被选中的视频 reference 图都应走同一对象存储策略，避免本地路径泄漏到正式 SaaS。

视频保存策略：

- 成品视频必须保存，否则用户无法预览、审核、下载、复用或追溯历史任务。
- 火山引擎任务查询只能作为近期对账和排查补充，不能替代平台自己的长期保存。
- 原始模型输出视频建议短期保存，用于排查 provider 效果、重新后处理和质检复盘。
- 后处理成品视频按用户套餐或内部规则保存，是用户真正可下载和可发布的资产。
- 缩略图、封面、脚本、prompt、成本记录和质检报告建议长期保存，成本低且有复盘价值。
- 用户必须可以手动删除视频文件；删除后可保留任务元数据、成本记录和质检摘要。
- 正式 SaaS 阶段应有自动过期清理任务，避免对象存储成本失控。

推荐生命周期：

- 内部验证阶段：输入素材、原始视频、成品视频、prompt、脚本、质检报告全部保存，方便复盘 60 条样本。
- 试用用户：成品视频保存 7 天。
- 基础套餐：成品视频保存 30 天。
- 高级套餐：成品视频保存 180 天或 1 年。
- 原始模型输出视频：默认保存 7-30 天，除非用户或管理员标记为保留样本。
- 缩略图和封面：随成品视频保存；如果成品视频删除，可按需保留低成本缩略图用于历史列表。

### 5.7 Deployment

第一阶段部署建议：

- `haitu.online` 作为主域名。
- Web 前端部署到 Nginx/Caddy 或 Cloudflare Pages。
- API 可以先直接在已有服务器运行；进入稳定 Web 版后再容器化。
- Worker 可以先用 CLI 或后台进程运行；进入稳定 Web 版后再容器化。
- Redis/Postgres 在第一阶段不是必须；需要任务队列和数据库后，可先同机 Docker 或直接安装。
- 对象存储使用 Cloudflare R2。

Docker 策略：

- 第一阶段内部验证不用 Docker。
- 跑 20 个商品、60 条视频的 CLI 验证时，直接在本机或已有服务器运行。
- 当 API、Worker、Postgres、Redis 需要长期稳定运行时，再引入 Docker Compose 管理服务。
- Docker 的价值是统一环境、方便重启和迁移，不是视频生成平台的核心能力。

后续扩展：

- Worker 水平扩展。
- Redis/Postgres 迁移到托管服务。
- API 与 Worker 分离到不同机器。
- 对象存储绑定 CDN。

### 5.8 成本策略

第一阶段采用免费优先策略：除 Seedance 这类视频生成 API 成本外，尽量不引入新的付费 SaaS。

免费或低成本优先选择：

- 服务器：使用已有服务器，不新增云主机。
- Web：先部署到已有服务器的 Nginx/Caddy，或使用 Cloudflare Pages 免费额度。
- API：Node.js + Fastify/NestJS 自托管。
- Worker：第一阶段可用 CLI 或后台进程，后续再用 Docker 容器运行。
- Database：第一阶段可先不用数据库，或使用 SQLite / 本地 JSON；进入 Web 版后再用 Postgres。
- Queue：第一阶段可先不用 Redis；进入 Web 版后再用 Redis + BullMQ。
- Storage：内部验证阶段可以先用服务器本地 `outputs/` 目录；进入 Web 版后再用 Cloudflare R2 免费额度或低成本对象存储。
- FFmpeg：本地开源工具。
- 基础质检：先用规则和 FFprobe/FFmpeg，不急着使用付费视觉模型。
- 监控：先用结构化日志、Docker logs 和简单错误表，不急着上付费监控。
- 认证：内部验证阶段可以先用单管理员账号或简单登录，不接 Auth0 等付费服务。
- 支付：第一阶段和第二阶段不接 Stripe / Lemon Squeezy。

不可避免或可能产生的成本：

- Seedance / 同类视频生成 API：核心成本，必须记录到每个任务和每个版本。
- LLM 脚本与 prompt 生成：如果使用付费模型，需要单独记录成本；第一阶段也可以用人工脚本、已有额度或本地模型降低验证成本。
- 对象存储流量和容量：内部验证阶段可先本地保存，外部用户阶段再正式引入 signed URL 和生命周期策略。
- 高级视觉质检：可能需要视觉模型 API，建议第二阶段后再启用。

成本控制规则：

- 每个任务必须保存 provider、model、生成次数、重试次数、输入资产、输出版本和估算成本。
- 同一商品第一阶段默认生成 3 条，不做无限重试。
- provider 调用失败后最多自动重试 1 次，继续失败则进入人工检查。
- 生成前显示预计成本；正式 SaaS 阶段先预扣额度，失败后按规则退款。
- 内部验证阶段重点计算“可用视频成本”，不是只看单次生成价格。
- 只有当 60 条样本达到可用率目标后，才投入付费托管数据库、复杂监控、支付和高级质检。

## 6. Provider 抽象

第一版主力 provider 为 Seedance 2.0，但业务层不直接依赖 Seedance。

建议目录结构：

```text
providers/
  video/
    mock/
    seedance/
    veo/
    runway/
    kling/
  image/
    mock/
    openai-gpt-image/
    volcengine/
    gemini/
    comfyui/
```

VideoProvider 统一接口应覆盖：

- 创建视频生成任务
- 查询远端任务状态
- 下载生成结果
- 估算或记录成本
- 处理 provider-specific 错误

ImageProvider 统一接口应覆盖：

- 创建图像生成或图像编辑任务
- 支持文本生成图、图像编辑、可选 mask、可选多参考图
- 返回候选图、partial / final 状态、usage 和成本
- 处理 provider-specific 尺寸、质量、输出格式和安全限制
- 支持 mock provider，避免本地开发误触发付费调用

视频任务记录必须保存：

- provider
- model
- duration
- aspectRatio
- cost
- input assets
- raw provider request
- raw provider response
- error code
- error message

图片任务记录必须保存：

- provider
- model
- mode: generate | edit | image-to-image
- source asset ids
- prompt
- negative prompt 或约束说明
- size
- quality
- output format
- usage
- cost
- selected purpose: product_reference | first_frame | lifestyle | detail | poster_background
- raw provider request
- raw provider response
- error code
- error message

## 7. 商品事实包

商品事实包是脚本、prompt 和质检的唯一事实来源。

示例：

```json
{
  "sku": "TK-001",
  "title_ja": "折りたたみ収納ボックス",
  "category": "収納用品",
  "materials": ["PP"],
  "dimensions": "36x25x19cm",
  "verified_selling_points": [
    "折りたたみ可能",
    "積み重ね可能",
    "省スペース"
  ],
  "usage_scenes": ["キッチン", "洗面所", "クローゼット"],
  "forbidden_claims": [
    "防水未確認",
    "耐荷重未確認",
    "日本で大人気は未確認"
  ],
  "reference_images": ["main.jpg", "detail1.jpg", "detail2.jpg"]
}
```

核心规则：

- 脚本只能使用 `verified_selling_points`、商品属性和使用场景。
- 不得编造功效、销量、排名、认证、耐重、防水、材质或尺寸。
- 日语表达要像日本电商 / TikTok 商品广告，不要像中文直译。
- `forbidden_claims` 要进入脚本检查、prompt 检查和字幕检查。

## 8. 核心数据模型

第一版建议至少包含以下表。

### 8.1 tenants

租户表。MVP 可以单用户单租户，但数据结构应提前保留 tenant 维度。

关键字段：

- id
- name
- default_language
- default_duration
- default_template
- created_at
- updated_at

### 8.2 users

用户表。

关键字段：

- id
- tenant_id
- email
- password_hash 或 auth_provider_id
- role
- created_at
- updated_at

### 8.3 products

商品表。

关键字段：

- id
- tenant_id
- sku
- title_ja
- category
- materials
- dimensions
- verified_selling_points
- usage_scenes
- forbidden_claims
- raw_source
- created_at
- updated_at

### 8.4 product_assets

商品素材表。

关键字段：

- id
- tenant_id
- product_id
- type: image | video
- storage_key
- url
- mime_type
- width
- height
- duration
- source: upload | import | generated
- source_job_id
- selected_for_video_reference
- selected_for_first_frame
- sort_order
- created_at

### 8.5 image_jobs

图片任务表。用于保存商品图优化、首帧图、生活场景图和海报底图生成任务。

状态：

- queued
- generating
- completed
- failed
- canceled

关键字段：

- id
- tenant_id
- product_id
- status
- mode: generate | edit | image-to-image
- purpose: product_reference | first_frame | lifestyle | detail | poster_background
- provider
- model
- prompt
- source_asset_ids
- size
- quality
- output_format
- candidate_count
- selected_asset_id
- cost
- usage
- raw_provider_request
- raw_provider_response
- error_code
- error_message
- created_at
- updated_at

### 8.6 image_outputs

图片结果表。一个 image job 可以生成多张候选图。

关键字段：

- id
- tenant_id
- image_job_id
- product_id
- asset_id
- version
- score
- review_decision: selected | rejected | needs_edit | unreviewed
- review_note
- created_at

### 8.7 video_jobs

视频任务表。

状态：

- queued
- scripting
- generating
- postprocessing
- qc
- completed
- failed

关键字段：

- id
- tenant_id
- product_id
- status
- template
- duration
- aspect_ratio
- provider
- model
- script_ja
- video_prompt
- subtitle_text
- cost
- input_asset_ids
- output_video_asset_id
- thumbnail_asset_id
- qc_report_id
- error_code
- error_message
- created_at
- updated_at

### 8.8 video_outputs

视频结果表。用于支持同一任务多版本或后续重新后处理。

关键字段：

- id
- tenant_id
- job_id
- version
- output_type: raw_provider_output | postprocessed_final | thumbnail | cover
- storage_key
- url
- width
- height
- duration
- file_size
- has_subtitles
- has_logo
- retention_expires_at
- deleted_at
- created_at

### 8.9 qc_reports

质检报告表。

关键字段：

- id
- tenant_id
- job_id
- basic_checks
- visual_checks
- language_checks
- compliance_checks
- score
- result: pass | warning | fail
- created_at

### 8.10 credit_ledger

额度流水表。

关键字段：

- id
- tenant_id
- user_id
- job_id
- type: reserve | consume | refund | grant | purchase
- amount
- provider_cost
- note
- created_at

### 8.11 provider_keys

BYOK 和平台 provider key 配置。

关键字段：

- id
- tenant_id
- provider
- encrypted_api_key
- mode: platform | byok
- enabled
- created_at
- updated_at

## 9. 任务状态流

```text
queued
  ↓
scripting
  ↓
generating
  ↓
postprocessing
  ↓
qc
  ↓
completed
```

失败状态：

```text
failed
```

失败应保存：

- 失败阶段
- provider 错误码
- 可读错误信息
- 是否可重试
- 已产生的 provider 成本
- 是否需要退回额度

## 10. 脚本与 Prompt 生成

### 10.1 脚本生成

输入：

- 商品事实包
- 视频模板
- 目标时长
- 目标语言
- 品牌 CTA
- 禁词库

输出：

- 4-15 秒日语口播脚本，MVP 默认 8 秒短句版
- 字幕文本
- 镜头节奏说明
- CTA 文案
- 禁用卖点检查结果

要求：

- 使用自然日语。
- 避免中文直译腔。
- 不使用事实包外卖点。
- 不夸大销量、排名、效果。
- 短句优先，适合字幕展示。

### 10.2 Prompt 生成

Seedance prompt 应包含：

- 商品 reference 的使用说明
- 9:16 竖屏
- 4-15 秒，MVP 默认 8 秒
- 日语 TikTok Shop 商品广告风格
- 软分镜节奏
- 商品外观一致性要求
- 禁止生成错误文字或夸大字幕
- 建议字幕后期压制，不强求模型内生成字幕

15 秒精修软分镜模板：

```text
0-3s: show the daily pain point or opening hook.
3-8s: show the product clearly, with close-up details and basic usage.
8-12s: show the product in realistic usage scenes.
12-15s: hold on the product, leave clean space for CTA and price overlay.
```

## 11. 后处理

第一版后处理能力：

- 压制日语字幕
- 添加 CTA
- 添加价格或优惠信息
- 添加 Logo 或水印
- 生成封面图
- 生成缩略图
- 转码为 TikTok 友好的 MP4
- 校验分辨率、时长、码率

建议使用 FFmpeg。

字幕样式第一版不宜过多，先支持 3-5 个模板：

- 清爽白底描边
- 黑底半透明条
- 日系电商强调款
- 价格 CTA 强调款
- UGC 轻量款

## 12. 质检

### 12.1 基础质检

必须做：

- 视频是否生成成功
- 是否 9:16
- 是否接近本次任务的目标时长，例如 8 秒任务允许约 7-9 秒
- 是否存在明显 provider 水印
- 文案是否包含禁词
- 文案是否出现未验证卖点
- 字幕是否为空
- 输出文件是否可播放

### 12.2 高级质检

第二阶段或第一阶段后半段引入：

- 用视觉模型比对商品参考图和视频截图。
- 检查颜色、形状、结构是否严重跑偏。
- 检查字幕是否遮挡商品主体。
- 检查日语是否自然。
- 检查是否出现与商品事实冲突的画面。

质检结果分为：

- pass：可直接审核使用
- warning：建议人工确认
- fail：不建议使用，需要重试或修改 prompt

## 13. SaaS 能力规划

### 13.1 用户系统

第一版：

- 登录
- 注册
- 单用户或单租户

后续：

- 多租户 tenant
- 团队成员
- 角色权限
- 操作审计

### 13.2 额度与计费

第一版：

- 每次生成记录 provider task id、token 用量和成本
- 每个视频版本都计成本
- 手动发放测试额度
- 后台可查看额度流水和单条视频用量明细
- 客服可按任务、用户、商品查看 `usage.total_tokens`、时长、分辨率和估算金额
- 使用火山引擎“查询视频生成任务列表”接口作为最近 7 天的只读对账补充
- 使用“查询视频生成任务 API”按 provider task id 查看单个任务，适合任务详情页刷新、轮询恢复和客服排查
- 支持“取消或删除视频生成任务”接口，但只允许取消 `queued` 任务；`running` 任务按官方语义不承诺可取消
- 删除已完成或失败的 provider 任务记录前，必须先保存本地 manifest、下载后的视频、token 用量、估算成本和质检摘要

后续：

- 套餐积分
- Stripe
- Lemon Squeezy
- 发票或订单记录
- 自动失败退款规则

### 13.3 BYOK

后续支持用户自带 Seedance、Veo、Runway 或 Kling API key。

模式：

- 平台统一额度
- 用户 BYOK

注意：

- API key 必须加密存储。
- Worker 调用时按租户选择 key。
- 需要记录 provider 成本和平台计费成本。

## 14. 产品页面规划

### 14.1 Dashboard

展示：

- 今日生成数量
- 成功率
- 失败任务
- 剩余额度
- 最近视频
- 需要审核的视频

### 14.2 商品库

展示：

- 顶部紧凑标题、商品数量、一个“添加商品”按钮；弹窗内再切换“粘贴导入 / 手动填写”，导入页只保留整理并保存、批量保存、预览整理结果三类商家动作，整理预览只使用“整理后的商品资料、资料是否够用、不可用卖点”等商家可理解文案
- 商品列表
- SKU
- 商品标题
- 商品资料准备度：可创作 / 待补图、资料完整 / 待补资料、参考图数量
- 行级进入创作按钮

不展示：

- 操作反馈、日志或商品事实包调试面板
- 最近生成任务、质检通过率、成本或 provider 参数
- 跨阶段生成 / 审核 / 发布按钮
- 大段解释文案或项目级状态徽标

### 14.3 商品详情

展示：

- 商品事实包
- 商品图片和视频
- Image Lab 入口
- 已生成视频版本
- 生成历史
- 可编辑卖点和禁用声明
- 当前审核状态
- 发布素材入口

### 14.4 Image Lab

展示：

- 原始商品图
- 已生成候选图
- 当前选择的视频 reference 图
- 当前选择的首帧候选图
- 生图任务历史
- prompt、provider、model、成本和输出参数

操作：

- 选择优化目标：主图清洁化、生活场景图、细节特写图、视频首帧图、广告海报底图。
- 输入补充描述。
- 选择模型，默认 `gpt-image-2`。
- 生成 2-4 张候选图。
- 选择一张设为视频 reference。
- 选择一张设为首帧候选。
- 标记不合格并记录原因。

### 14.5 新建视频任务

表单：

- 选择商品
- 选择模板
- 选择时长
- 选择参考图
- 选择 CTA
- 选择字幕样式
- 选择生成数量
- 显示预计成本

### 14.6 视频审核页

展示：

- 视频播放器
- 字幕预览
- 脚本
- prompt
- 质检报告
- 成本
- 重新生成
- 修改字幕后重新导出
- 下载

### 14.7 视频风格

第一版创作风格：

- 痛点型
- 场景型
- 开箱型
- 卖点型
- UGC 型

使用方式：

- 用户在 Product Studio 的“生成视频”步骤直接选择视频风格
- 风格会影响脚本结构、镜头节奏和画面表达
- 启用 / 默认风格配置放入 API 管理，不作为单独导航入口

### 14.8 API 管理

配置：

- API Key 和 API 通道配置状态
- 默认语言：日语
- 默认视频时长：8s
- 默认视频风格
- 默认 CTA
- 禁词库
- 不允许夸大的卖点规则

API 管理作为管理员配置入口，只常驻展示通道是否可用、模型、分辨率和水印等必要信息；Key 来源、Key 预览、接口地址和单价明细不作为前台常驻字段，避免把技术明细表带回主界面。

## 15. MVP 阶段路线

### 15.0 当前实现状态

截至 2026-06-08，本地原型已经完成以下能力：

- Haitu 路线已明确为独立 AI 商品视频平台，不走 MoneyPrinterTurbo 主线。
- MVP 默认生成 8 秒低成本引流视频，不再默认 15 秒，避免内部验证成本爆炸。
- 已接入火山引擎 Seedance 官方文档路线，provider 模块化，未来可接 Veo / Runway / Kling。
- 已加付费安全：默认 mock 免费、本地模拟；付费请求必须通过预检、确认、预算检查和测试额度检查。
- 商品项目已支持粘贴导入和手动填写，导入会自动清洗商品资料；入口已收敛为紧凑商品库列表，顶部只保留商品数量和一个“添加商品”按钮，点击后在弹窗内选择“粘贴导入 / 手动填写”，整理预览不展示“拦截/禁用/完整度”这类后台审查词。
- 控制台全局外壳不再常驻展示 mock/付费模式、语言胶囊或总金额胶囊；这些后台和费用信息分别收进 API 管理、费用记录和隐藏后台记录。
- 控制台默认进入商品项目；侧边栏已分为主流程和管理，主流程只保留商品项目、审核发布，管理区只保留费用记录和 API 管理，生成记录和运营概览不再作为常驻导航项。
- 费用记录页只保留官方用量、费用汇总和按商品费用；生成报告明细、发布素材、备份、审计和视频资产不再混在费用页。
- 后台记录页已支持生成任务查看、取消、重试、查看任务结果、查看报告、打开和下载成片，并承接生成报告明细、存储备份、操作审计和视频资产维护；它保留为旧链接可访问的后台查看与排错页，不是创作主入口。
- 已支持火山引擎官方用量查询接口，用于客服展示用户实际用量；查询接口不产生生成费用。
- 已支持长期保存思路：视频资产、发布素材、备份、删除文件和操作审计。
- 审核发布已具备人工评分、选择最终版、生成发布素材、导出审核表和导出素材表。
- 后端已新增 `POST /api/products/:sku/video-jobs`，可以按商品 SKU 创建视频任务，不要求前端或业务层传本地商品 JSON 路径。该接口已有针对性测试并通过。
- 前端商品项目已接入一键“生成 3 个视频版本”，调用 `POST /api/products/:sku/video-jobs`，默认 `mock` provider、8 秒、3 个版本。
- 商品项目 UI 已按 Huobao 的信息架构重做为“商品库列表 + 单商品 Product Studio”：未选商品时只展示商品库、添加商品弹窗和行级“进入创作”按钮，不展示操作反馈、解释卡片或全局生成入口；选中商品后进入顶部商品标题、左侧流程轨、中央单阶段执行区和底部上一步 / 下一步动作条。
- Product Studio 已移除中间重复子导航、中央阶段工具栏、顶部“当前阶段 / 创作进度”胶囊、左侧重复进度条和底部重复进度圆点；左侧流程轨只承载阶段跳转与完成状态，中央只展示当前阶段面板。
- Product Studio 前台流程节点已收敛为商品资料、参考图片、脚本分镜、生成视频、审核发布和发布素材；不再把商品列表、入库表单、流程轨和工作台长期挤在同一个后台面板里。
- 商品详情接口已与商品库列表共用商品事实质量和付费预检摘要，避免从“进入创作”打开 Studio 后出现 0/100 或待补充状态回退。
- Studio 内集中展示商品资料、参考图片、脚本分镜、最近版本、最终版预览、人工评分和发布素材；从商品库点击“进入创作”默认落到“生成视频”步骤，让用户先选择视频风格并生成 3 个视频版本。Studio 内图片和脚本步骤使用“参考图、脚本草稿、分镜草稿”这类创作语言，不展示模型名、provider、prompt 或暗色代码块；版本展示使用“版本 1 / 素材 1”和“制作中 / 可预览 / 需重试”这类用户语言，不展示任务 ID、原始任务状态、生成通道、成本、manifest 或内部清单；审核发布页也只保留看视频、评分、选最终版、生成发布素材和素材下载，结论使用“可发布 / 需修改 / 不采用”这类商家能直接理解的动作语言。手动生成参数只保留在隐藏后台记录页，不作为商品创作主入口。
- 工作台点击“进入审核发布”已支持按 SKU 聚焦对应商品版本组，并可一键恢复查看全部商品版本。
- “生成发布素材”动作已回流到 Product Studio 的发布素材阶段：单商品可在 Studio 内直接生成当前 SKU 发布素材，审核发布页继续作为批量审核与批量生成工作台。
- 生成记录轮询已支持识别视频任务从 queued / running 进入 completed / failed / canceled 的终态变化，并自动同步当前 Product Studio 的商品详情、最近版本、审核发布和发布素材相关状态。
- 前端 shell 测试已补齐对应断言，SKU 入队、内部补齐验证、控制台 shell、类型检查和前端构建已通过。

当前明确断点：

- 商品项目到生成视频、审核发布和发布素材的前端主线已成形。
- Product Studio 目前仍挂在商品项目模块内，由商品库行级“进入创作”打开，还不是独立路由；后续可根据导航复杂度再拆出商品详情 / Studio 路由。
- 工作台已能展示最近版本、最终版预览、人工评分、成片检查、脚本与字幕和该商品发布素材，并可在 Studio 内直接生成当前 SKU 发布素材或跳转到 SKU 聚焦的审核发布区。
- 生图 Image Lab 尚未进入实现，应等视频验证和审核发布闭环继续稳定后再做。

### 15.1 第一阶段：内部验证

目标：

- 不做完整 SaaS。
- 做本地 / 服务器 CLI 或简单后台。
- 除视频生成 API 外尽量使用免费、自托管或已有资源。
- 输入 20 个真实商品。
- 每个商品 3 张参考图。
- 每个商品先生成 3 条 8 秒低成本引流视频。
- 对评分最高的少量商品再生成 8-15 秒精修视频。
- 共生成 60 条默认 8 秒低成本样本，先验证商品一致性和脚本可用率。
- 人工评分。

成功指标：

- 60 条视频里至少 20 条可直接发布或轻微修改后发布。
- 商品外观严重跑偏比例可接受。
- 日语脚本不出现明显中文直译或夸大卖点。
- 成本和生成耗时可被商业化接受。
- 统计单次生成成本、单条可用视频成本、失败重试成本。

第一阶段产物：

- 商品事实包 JSON 格式
- Seedance provider 原型
- 脚本和 prompt 生成原型
- Worker 原型
- FFmpeg 字幕后处理
- 基础质检脚本
- 人工评分表
- 成本统计表

当前第一阶段应优先收敛的闭环：

```text
商品项目入口 / Product Studio
  ↓
添加商品（粘贴导入或手动填写）
  ↓
商品资料
  ↓
参考图片
  ↓
脚本分镜
  ↓
生成视频：默认 mock / 8 秒 / 3 个版本
  ↓
审核发布：评分 / 选最终版
  ↓
发布素材：生成当前商品视频、字幕和素材表
```

### 15.2 第二阶段：内部 Web 版

目标：

- `haitu.online` 上线登录和商品库。
- 支持上传商品图片。
- 支持填写商品事实。
- 支持创建视频任务。
- 支持查看视频结果和质检报告。
- 支持商品详情页 / 商品工作台，集中展示商品事实、参考图、已有视频版本、审核状态和发布素材入口。

成功指标：

- 内部运营可以不碰命令行完成生成。
- 任务状态稳定可追踪。
- 失败任务有可读错误信息。
- 视频可下载。
- 商品项目到生成视频、审核发布和发布素材能够自然流转；生成记录只作为运行记录和排错入口。

### 15.3 第三阶段：小范围给别人用

新增：

- 多用户
- 多租户
- 额度 / 积分
- 对象存储 signed URL
- 队列失败重试
- BYOK
- 人工审核 / 导出
- SaaS 基础能力：用户 / 租户、额度台账、对象存储 signed URL

成功指标：

- 外部测试用户能完成完整流程。
- 成本、额度和任务记录可追溯。
- 常见失败可重试或可解释。

### 15.4 第四阶段：正式 SaaS

新增：

- 套餐 / 支付
- 团队权限
- 模板市场
- 批量生成
- API
- TikTok / 店小秘 / Shopify 等平台对接

### 15.5 生图能力阶段

生图不是当前前端断点的阻塞项，应在商品项目创作流、生成视频、审核发布闭环稳定后再引入。

建议顺序：

1. 增加 `ImageProvider` 抽象和 `mock-image` provider。
2. 增加 `openai-gpt-image` provider，默认模型 `gpt-image-2`。
3. 增加 Image Lab 页面，支持原图 + 描述生成 2-4 张候选图。
4. 支持把候选图设为视频 reference 或首帧候选。
5. 把被选中的图片接入视频任务 preflight 和 prompt 生成。
6. 增加图片生成成本、用量、审核和删除记录。

## 16. 第一版明确不做

第一版不做：

- 自动发布 TikTok
- 复杂多模型并行
- 完整 CRM / 订单系统
- 接入 MoneyPrinterTurbo
- 传统素材库混剪
- 全自动无审核发布
- 过多模板
- 复杂团队权限
- 多租户深度权限系统
- 复杂视频编辑器
- 多段视频精细拼接
- 大规模模板市场
- 完整通用生图平台
- 生图候选自动绕过人工审核进入视频任务
- 把 ComfyUI 节点工作流作为第一版必需能力

## 17. 主要风险与应对

### 17.1 商品外观跑偏

风险：

- 视频模型可能改变商品颜色、结构、尺寸比例或关键部件。

应对：

- 强化 reference prompt。
- 用多张参考图。
- 生成后抽帧质检。
- 保留人工审核。
- 先用 60 条内部样本验证可用率。

### 17.2 日语不自然或违规夸大

风险：

- 脚本可能像中文直译。
- 可能出现未确认卖点或夸大表达。

应对：

- 商品事实包约束。
- 禁词库和 forbidden claims 检查。
- 日语脚本单独质检。
- 内部沉淀优质模板和表达库。

### 17.3 生成成本不可控

风险：

- 多版本生成、失败重试和 provider 价格可能导致成本过高。

应对：

- 每个 job 记录成本。
- 额度预扣和失败退款。
- 限制第一版生成数量。
- 第一阶段重点测算单条可用视频成本。

### 17.4 长任务稳定性

风险：

- 视频生成耗时长，API 超时或任务状态丢失会影响体验。

应对：

- API 和 Worker 分离。
- BullMQ 队列。
- 状态机持久化。
- provider 轮询可恢复。
- 失败任务可重试。

### 17.5 Provider 锁定

风险：

- Seedance API 价格、效果或可用性变化会影响产品。

应对：

- 从第一版就抽象 provider。
- 保存 raw request / response。
- 任务记录 provider 和 model。
- 后续可接 Veo、Runway、Kling。

### 17.6 生图导致商品不一致

风险：

- 图像模型可能把商品变漂亮，但改变颜色、材质、结构、logo、尺寸比例或功能暗示。
- 生活场景图可能引入事实包外的使用方式或夸大卖点。
- 如果直接把生图结果喂给视频模型，后续视频跑偏会更难排查。

应对：

- 生图 prompt 必须强调保真优先。
- 生图输入必须包含商品事实包和 forbidden claims。
- 生图输出必须经过人工选择或规则审核后才能进入视频任务。
- 保存 image job lineage，记录原图、prompt、模型、参数、输出和人工决策。
- 第一版只允许“设为参考图 / 设为首帧候选”，不自动替换原始商品图。

## 18. 第一阶段实施建议

第一阶段建议先不搭完整 Web SaaS，而是做一个最小可验证流水线：

```text
products/*.json
  ↓
script-generator
  ↓
prompt-generator
  ↓
seedance-provider
  ↓
worker-runner
  ↓
ffmpeg-postprocess
  ↓
qc-report
  ↓
outputs/
```

最小目录建议：

```text
apps/
  api/
  web/
  worker/
packages/
  core/
  providers/
  video-processing/
  qc/
docs/
  plans/
  specs/
fixtures/
  products/
  assets/
outputs/
```

如果先做 CLI，可以暂时只创建：

```text
packages/
  core/
  providers/
  video-processing/
  qc/
scripts/
fixtures/
outputs/
```

后续 Web 化时再补 `apps/api`、`apps/web`、`apps/worker`。如果需要常驻服务和稳定部署，再评估是否增加 `docker-compose.yml` 管理 API、Worker、Postgres 和 Redis。

## 19. 推荐下一步

商品项目到生成视频的前端主线已完成重命名和流程收敛，控制台默认进入商品项目，主流程导航只保留商品项目和审核发布。商品项目 UI 已改为“紧凑商品库列表 + 添加商品弹窗 + Huobao 式单商品 Product Studio”；商品库只做入库和进入创作，顶部只有一个“添加商品”入口，弹窗内切换粘贴导入或手动填写，资料整理结果使用“整理后的商品资料、资料是否够用、不可用卖点”等商家语言，不展示操作反馈、日志面板、后台审查词或跨阶段动作。从商品库点击“进入创作”默认进入“生成视频”，视频风格就在该步骤内选择，主按钮生成 3 个视频版本并留在当前 Studio 刷新最近版本；生成反馈只提示已开始制作，不展示 job id 或输出目录。费用记录只看官方用量、费用汇总和按商品费用；生成报告、备份、审计、视频资产和生成任务定位为隐藏后台记录与排错页，只从旧链接或后台访问，不再作为创作主入口、常驻导航项或商品创作里的高级参数入口。启用 / 默认风格配置已并入 API 管理，API 管理只展示配置状态和必要默认项，不常驻展示 Key 来源、接口地址或单价明细。建议下一步继续收紧“Product Studio → 审核发布 → 发布素材”的自然流转，不继续扩张后端范围。

当前最近任务：

1. 在 Product Studio 内补最终版成片播放器、发布素材文件存在性校验和缺失文件提示。
2. 让 Studio 内生成发布素材后自动刷新到最新素材并突出刚生成的文件。
3. 商品库弹窗保存后补轻量 toast / 高亮新入库商品，替代旧状态面板反馈。
4. 给生成记录终态同步补一个更明显的轻量 toast / 阶段提示。
5. 继续保持默认 mock、8 秒、3 个版本作为内部验证路径；付费生成仍必须走预检、确认、预算和测试额度检查。

再之后进入正式 SaaS 基础：

- 用户 / 租户。
- 额度台账。
- 对象存储 signed URL。
- BYOK 和 provider key 安全存储。

支付、团队权限、批量导入、外部平台对接和 Image Lab 都应排在上述闭环之后。

中期仍建议拆出第一阶段内部验证的实施计划，目标是跑通 20 个商品、60 条视频的闭环。

第一阶段计划应回答：

- 使用哪一个 Seedance API 接入方式。
- 商品事实包 JSON schema 如何定义。
- 脚本生成和 prompt 生成用哪个 LLM。
- 哪些环节必须付费，哪些环节坚持免费或自托管。
- 输出目录和评分表格式。
- FFmpeg 字幕样式第一版怎么定。
- 基础质检脚本检查哪些项目。
- 单条视频成本如何记录。

完成第一阶段后，再决定是否进入内部 Web 版。只有当 60 条样本里达到至少 20 条可用或轻微修改可用，才值得继续投入完整 SaaS。
