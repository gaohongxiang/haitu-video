# 数据模型

SQLite 保存元数据、归属关系、配置、钱包状态和计费规则。大图片、生成视频、字幕、manifest 和备份包继续保存在 `HAITU_DATA_DIR` 下的文件系统中。

Schema 定义在 `src/server/db/schema.ts`，迁移文件在 `src/server/db/migrations/`。

## 用户和工作区

- `users`：平台用户，包含邮箱、角色、显示名和时间戳。
- `workspaces`：租户/工作区记录，由用户拥有。
- `workspace_members`：用户与工作区的成员关系和角色。
- `user_sessions`：保留的旧会话表，用于工作区感知的会话数据。
- Better Auth 表：`auth_users`、`auth_sessions`、`auth_accounts`、`auth_verifications` 支撑当前认证流程。

## 商品和创作资产

- `products`：工作区作用域的商品索引。长期商品事实仍保存在 `product_json_path` 指向的 JSON 文件中。
- `product_assets`：参考图或其他商品资产，包含存储供应商和路径。
- `storyboards`：商品的视频提示词历史草稿。

## 视频任务和输出

- `video_jobs`：生成任务索引，包含工作区、商品、状态、模型、语言、时长、输出数量、任务目录、完成时间和过期时间。
- `video_assets`：生成视频文件和相关资产，包含状态、存储供应商、路径、大小、过期时间和删除状态。

任务 JSON、manifest、report、字幕和最终媒体仍保存在工作区 jobs 目录。SQLite 是查询和权限索引，不是二进制文件仓库。

## 模型服务

- `model_credentials`：加密后的模型供应商 key 和供应商元数据，通过 `api_owner` 支持平台模型和 BYOK。
- `model_variants`：某个凭证下已启用的具体模型版本，模型版本必须来自统一模型目录。
- `model_service_preferences`：工作区的平台模型或 BYOK 偏好，以及文本、图片、视频能力各自默认使用的模型配置。

## 钱包、支付和计费

- `wallet_transactions`：只追加的钱包流水。余额和冻结金额由最新流水状态推导。
- `wallet_recharge_orders`：Stripe 或 Infini hosted checkout 订单，包含状态、checkout URL 和支付供应商 session ID。
- `payment_webhook_events`：已处理 webhook 事件记录，用于幂等和审计。
- `billing_policies`：有效的计费模式。
- `billing_price_rules`：按 usage kind 配置的平台服务费规则。
- `model_pricing_catalog_versions`：后台已发布的统一模型目录版本，包含模型展示信息、真实 `modelId` 和官方成本规则。
- `model_pricing_catalog_drafts`：后台编辑中的统一模型目录草稿。

内置兜底目录在 `src/modelPricing/officialModelPricingCatalog.ts`。线上优先读取已发布目录版本；没有发布版本时使用内置目录。Haitu 服务费仍只在 `billing_price_rules` 维护，不能写入模型目录。

## 设置和审计

- `console_settings`：语言、时长、模板、CTA、模型供应商、成本上限、测试额度、审核词表和支付方式的全局默认设置。
- `audit_logs`：结构化事件的数据库审计表。
- `system/audit-log.jsonl` 文件审计日志仍被控制台部分功能使用，备份时应包含。

## 存储边界

不要把媒体二进制内容放进 SQLite。新的资产型功能只应在数据库中保存元数据、归属关系、object key 或文件路径、状态、大小、过期时间和删除标记。
