# Haitu 文档

这个目录只放 Haitu 官网和控制台的长期文档，用来说明当前架构、产品模块、运行方式和长期策略。已经完成的实施计划、一次性设计稿和过程记录不应该继续放在这里。

## 先看这里

- [站点架构](architecture/site-architecture.md)：公开官网、控制台、后台、API、SEO 路由和索引规则。
- [运行架构](architecture/runtime-architecture.md)：服务端运行时、React 外壳、SQLite、本地存储、队列、支付和模型调用。
- [数据模型](architecture/data-model.md)：长期数据库表和运行时文件边界。
- [资金与计费架构](architecture/billing-architecture.md)：官方模型价格、平台服务费、钱包冻结扣费和支付入账的总链路。

## 产品模块

- [营销 SEO / GEO](modules/marketing-seo.md)：公开站内容模型、搜索引擎和 AI 答案引擎规则。
- [商品创作工作台](modules/product-studio.md)：商品库、商品事实、参考图、图片提示词、视频提示词和创作流程。
- [视频生成](modules/video-generation.md)：视频任务、模型供应商抽象、Seedance、质检和发布素材。
- [模型服务](modules/model-service.md)：平台模型、BYOK、凭证、启用模型版本和按能力选择逻辑。
- [模型目录与使用计费](modules/model-pricing-billing.md)：统一模型目录、官方成本、服务费、费用预估、冻结扣费和价格快照。
- [钱包、充值和支付](modules/wallet-payments.md)：钱包流水、充值订单、支付渠道、webhook 和人工调整。
- [管理后台](modules/admin.md)：项目方后台、用户、计费控制、平台模型和系统状态。
- [存储和资产](modules/storage-assets.md)：`HAITU_DATA_DIR`、本地存储、临时公开资产 URL、备份和未来对象存储。

## 运维

- [VPS 无 Docker 部署](operations/vps-no-docker.md)：单 VPS + Cloudflare Tunnel 的生产部署方式。
- [运维手册](operations/runbook.md)：日常更新、备份、恢复、健康检查和故障处理。

## 策略

- [SEO / GEO 全局规划](marketing/seo-geo-roadmap.md)：当前公开站获客、AI 答案、合规和页面矩阵规划。

## 文档规则

- 优先写当前事实，不保留历史任务流水账。
- 路由、数据表、环境变量和模块边界要写具体。
- 已完成的实施计划只保留长期结论；结论抽取完成后，原计划应归档或删除。
- 模块发生变化时，同步更新对应模块文档。
