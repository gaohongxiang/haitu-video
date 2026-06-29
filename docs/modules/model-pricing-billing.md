# 模型目录与使用计费模块

模型计费模块负责统一模型目录、AI 文本/图片/视频任务的费用估算、预冻结、完成扣费和失败释放。它不处理支付渠道，也不负责余额入账。

## 统一模型目录

`src/modelPricing/officialModelPricingCatalog.ts` 是唯一模型版本事实源。它同时承载模型目录和官方成本规则，不能再拆成“模型目录”和“模型价格目录”两份。

每个可配置、可计费模型版本都必须在同一条目录记录里包含：

- `catalog`：运行时 provider、vendor、真实 `modelId`、base URL、API mode、能力、任务范围、标签和默认启用建议。
- 展示字段：供应商、模型、单位、官方说明、公式、示例和来源。
- `settlement`：后端扣费所需的币种、计费单位、人民币单价、美元换算口径、图片按张价格或视频分辨率价格。

统一目录同时服务三类消费者：

- 模型配置页：展示某个供应商有哪些可启用版本，并保存用户/平台明确启用的版本集合。
- 模型价格页：展示和发布模型版本上的官方成本字段。
- 后端扣费：读取结算字段，按模型 usage 计算上游成本，并在钱包流水写入价格快照。

`src/client/modelPricingCatalog.ts` 只做本地化包装。不要在这个文件新增模型或价格。

`src/server/modelPricing.ts` 只做计算。不要在这个文件新增模型单价，也不要在这里读数据库。调用层必须把 active catalog 传给估算、冻结和结算入口。

后台 `/admin` 的模型价格模块可以保存统一模型目录草稿、预览差异并发布新版本。发布后只影响新的估算、新的模型配置可选项和新的任务扣费，历史 `wallet_transactions.metadata.priceSnapshot` 不回改。

所有可配置、可计费的模型版本都必须同时有 `catalog` 和 `settlement`。不允许保留隐藏结算模型，也不允许在 UI 另写一份模型清单。

## 官方价是不是直接扣费价

模型价格页列的是官方上游价格快照，不是用户钱包最终扣费。

平台托管 key 时：

```text
钱包扣费 = 官方上游模型成本 + Haitu 服务费
```

用户 BYOK 时：

```text
钱包扣费 = Haitu 服务费
```

BYOK 的官方上游成本仍可展示为参考，但 Haitu 不代扣，因为模型供应商会向用户自己的 key 或账号计费。

## 计费策略

平台服务费由 `billing_policies` 和 `billing_price_rules` 管理，按 usage kind 区分：

- `text`
- `image`
- `video`

后台 `/admin` 的财务区域可以调整服务费。服务费是 Haitu 的平台收入规则，不是上游模型价格。

后台 `/admin` 的模型价格区域维护统一模型目录里的上游官方成本字段。它和 Haitu 服务费是两个模块，不能混在一个表单里。

主要文件：

- `src/server/billingPolicyStore.ts`
- `src/server/billingEstimateService.ts`
- `src/server/billingEstimateRoutes.ts`
- `src/server/videoJobBilling.ts`
- `src/server/aiBilling.ts`
- `src/server/adminBillingSettings.ts`
- `src/server/modelPricingCatalogStore.ts`
- `src/server/adminModelPricingCatalog.ts`

## 估算链路

生成前调用 `POST /api/billing-estimates`，返回每个动作的预估：

- API owner：`platform` 或 `byok`；
- Haitu 服务费；
- 官方上游参考成本；
- 钱包预计扣费；
- 模型配置来源。

视频估算会按时长、分辨率、宽高比和帧率估算 token。完成后如果供应商返回实际 `totalTokens`，以实际 token 结算；否则回退到任务记录中的估算成本。

## 结算链路

任务开始前：

- `WalletStore.reserve` 冻结预计扣费。
- reserve metadata 写入 usage kind、API owner、模型配置、预计服务费和预计上游成本。

任务成功后：

- `WalletStore.capture` 从冻结金额扣实际费用。
- 文本/图片由 `src/server/aiBilling.ts` 处理。
- 视频由 `src/server/consoleVideoJobPersistence.ts` 处理。
- capture metadata 写入 `priceSnapshot`。

任务失败后：

- `WalletStore.release` 释放冻结金额。

## 价格快照

每笔完成扣费必须写入 `priceSnapshot`。快照用于账单解释和审计。

视频快照示例字段：

```json
{
  "catalogVersion": "2026-06-24",
  "kind": "video",
  "model": "doubao-seedance-2.0",
  "requestedModel": "doubao-seedance-2-0-260128",
  "providerId": "volcengine",
  "currency": "CNY",
  "unit": "video_tokens_1m",
  "unitPriceCny": 51,
  "resolution": "1080p",
  "source": "official_snapshot",
  "sourceUrl": "https://www.volcengine.com/docs/82379/1544106"
}
```

## API

- `POST /api/billing-estimates`
- `GET /api/admin/billing-settings`
- `PUT /api/admin/billing-settings`
- `GET /api/admin/model-pricing-catalog`
- `PUT /api/admin/model-pricing-catalog/draft`
- `GET /api/admin/model-pricing-catalog/draft/:draftId/diff`
- `POST /api/admin/model-pricing-catalog/publish`

## 维护规则

- 新增模型版本时，只改统一目录：补齐 `catalog`、展示字段和 `settlement`，不要再新建一份模型清单。
- 官方模型价格变动时，优先在后台创建草稿、检查差异并发布新版本。
- `src/modelPricing/officialModelPricingCatalog.ts` 仍要定期更新，作为新环境和数据库不可用时的兜底目录。
- 模型目录版本日期要随价格核验或后台发布更新。
- 前端价格页和后端扣费测试必须一起跑。
- 新 usage kind 需要同时补估算、冻结、结算、钱包 metadata 和文档。
