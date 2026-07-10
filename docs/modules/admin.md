# 管理后台模块

管理后台给项目方提供平台运营查看和控制界面。它位于 `/admin`，要求已登录的 admin 用户访问，并且必须保持 `noindex,nofollow`。

## 分区

`AdminApp` 定义以下分区：

- 总览：平台指标、增长、活跃、注册和任务趋势。
- 用户与工作区：所有用户、工作区、成员关系和单用户详情抽屉。
- 内容与创作：所有工作区的商品、视频任务、视频资产和分镜摘要。
- 财务：所有钱包余额、充值订单、消费流水、Haitu 服务费和人工调账。
- 流量增长：公开站访问、搜索表现、IndexNow / sitemap 提交、SEO/GEO 监控和注册/充值/生成转化。规划见 [后台流量与 SEO/GEO 数据看板规划](../marketing/traffic-analytics-admin-plan.md)。
- 模型配置：平台自有模型凭证、启用模型版本、默认服务组合和可用状态。
- 模型目录：统一模型目录里的官方成本、展示信息、草稿保存、差异校验和版本发布。
- 网站配置：公开页、SEO/GEO、支付方式、计费策略、模型配置和模型目录的配置状态入口。
- 系统与审计：面向项目方检查的部署、备份、审计日志和运行状态。

## 访问模型

后台 API 要求有效会话且 `users.role = 'admin'`。未登录请求返回 401；已登录但非 admin 用户返回 403。

`HAITU_ADMIN_EMAIL` 用于在认证/用户初始化时识别项目方账号。该账号需要完成邮箱验证后才能正常使用后台。

## API

- `GET /api/admin/overview`
- `GET /api/admin/users/:userId`
- `GET /api/admin/payment-methods`
- `PUT /api/admin/payment-methods`
- `GET /api/admin/billing-settings`
- `PUT /api/admin/billing-settings`
- `GET /api/admin/wallets`
- `GET /api/admin/wallet-transactions`
- `GET /api/admin/recharge-orders`
- `POST /api/admin/wallet-adjustments`
- `GET /api/admin/content/summary`
- `GET /api/admin/content/products`
- `GET /api/admin/content/video-jobs`
- `GET /api/admin/model-pricing-catalog`
- `PUT /api/admin/model-pricing-catalog/draft`
- `GET /api/admin/model-pricing-catalog/draft/:draftId/diff`
- `POST /api/admin/model-pricing-catalog/publish`
- `GET /api/admin/site-settings`
- `GET /api/platform/model-configs`
- `PUT /api/platform/model-configs/:id`
- `PUT /api/platform/model-configs/:id/key`

## 主要文件

- `src/client/AdminApp.tsx`
- `src/server/authAdminRoutes.ts`
- `src/server/adminDashboard.ts`
- `src/server/adminDashboardOverview.ts`
- `src/server/adminDashboardUserDetail.ts`
- `src/server/adminDashboardVideoJobs.ts`
- `src/server/adminBilling.ts`
- `src/server/adminBillingSettings.ts`
- `src/server/adminContent.ts`
- `src/server/adminModelPricingCatalog.ts`
- `src/server/adminSiteSettings.ts`

## 边界

后台是全站运营视角，可以跨用户和工作区查看财务、充值、消费流水、内容和任务，也可以维护站点级配置。商家的商品创作、模型偏好、钱包充值和视频生成仍属于 `/console`，只能看到当前用户/工作区自己的数据。

后台不展示明文模型 Key、支付私钥或 webhook secret。敏感配置只显示是否已配置、脱敏预览和最近状态；覆盖密钥必须重新提交。
