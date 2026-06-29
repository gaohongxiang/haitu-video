# 模型服务模块

模型服务模块管理文本、图片和视频模型配置，同时支持平台提供模型和用户 BYOK 模型。

## 概念

- 模型供应商凭证：加密 API key 和供应商元数据。
- 模型版本：统一模型目录里的具体模型版本，包含真实请求 `modelId`、运行时 provider、展示信息和计费规则。
- 启用版本集合：某个模型供应商凭证下，项目方或用户明确勾选启用的模型版本。
- Model bundle：面向用户的文本、图片、视频模型组合。
- Service preference：工作区在平台模型模式和 BYOK 模式之间的选择。

## 模式

平台模型模式使用项目方配置的模型供应商 key。用户从钱包中支付上游模型成本和 Haitu 服务费。

BYOK 模式使用用户自己的模型供应商 key。上游模型供应商直接向用户收费；Haitu 只按配置收取平台服务费。

某个供应商有哪些模型版本由 `src/modelPricing/officialModelPricingCatalog.ts` 决定。模型凭证配置页只保存启用版本集合，不维护模型清单，也不维护模型价格。计费链路详见 `docs/modules/model-pricing-billing.md`。

API key 使用 `HAITU_SECRET_KEY` 加密后存入 SQLite。API 响应只能返回配置状态和 key preview，不能返回完整 key。

## 后台和用户归属

项目方在 `/admin` 配置平台模型凭证。工作区用户在 `/console` 的设置/API 管理里配置 BYOK 凭证。

平台模型组合由 lifecycle helper 为工作区初始化。BYOK 模型组合按工作区隔离，并由用户管理。

## 主要文件

- `src/server/modelConfigRoutes.ts`
- `src/server/modelConfigStore.ts`
- `src/server/db/sqliteModelConfigStore.ts`
- `src/server/modelBundleStore.ts`
- `src/server/modelServicePreferenceStore.ts`
- `src/server/modelConfigSelection.ts`
- `src/server/platformModelProvisioning.ts`
- `src/client/components/modelServiceConfig.tsx`
- `src/client/modelServiceBundles.ts`
- `src/providers/modelCatalog.ts`

## API

- `GET /api/provider-config`
- `GET /api/model-configs/:id/models`
- `POST /api/model-configs/:id/test`
- `PUT /api/model-configs/:id`
- `PUT /api/model-configs/:id/key`
- `DELETE /api/model-configs/:id`
- `GET /api/model-bundles`
- `PUT /api/model-bundles`
- `DELETE /api/model-bundles/:id`
- `GET /api/model-service-preference`
- `PUT /api/model-service-preference`
- `GET /api/platform/model-configs`
- `PUT /api/platform/model-configs/:id`
- `PUT /api/platform/model-configs/:id/key`

## 选择规则

模型保存时必须校验启用版本存在于统一模型目录，并保存目录里的真实 `modelId`。创作 UI 只能展示该凭证已启用、且模型组合允许使用的版本。

视频生成应调用 `selectedVideoModelConfig`，不要直接读取凭证。这样平台/BYOK 选择、模型组合偏好、供应商覆盖和 token 定价都走同一条路径。
