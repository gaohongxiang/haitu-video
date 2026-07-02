# 商品创作工作台模块

商品创作工作台是 `/console` 中面向商家的主工作流。它把商品事实和参考媒体转成图片提示词、视频提示词、视频任务、审核选择和发布素材。

## 用户流程

1. 添加或导入商品。
2. 检查结构化商品事实和卖点。
3. 管理参考图片。
4. 编辑图片提示词或视频提示词。
5. 生成多个视频版本。
6. 审核版本，选择最终版，并生成发布素材。

控制台主流程要保持商家视角，不应在主要创作路径里暴露原始模型供应商细节、内部任务 ID、manifest、成本内部结构或排错面板。

## 商品事实

商品事实是商品宣称的事实来源。脚本和 prompt 只能使用已验证卖点，并避开禁用或未确认宣称。

相关文件：

- `src/core/productFacts.ts`
- `src/core/productFileImport.ts`
- `src/core/productImportCleaner.ts`
- `src/server/productService.ts`
- `src/server/productRoutes.ts`
- `src/client/productDraftFacts.ts`
- `src/client/productComposerText.ts`
- `src/client/productWorkflowViewModel.ts`

## 参考图片

参考图片可按功能入口导入、上传、排序、删除或生成。本地参考图保存在工作区商品目录下，必要时登记到 `product_assets`。

视频模型供应商应收到可访问的 HTTPS URL，而不是本地文件路径。临时 URL 机制见 [存储和资产](storage-assets.md)。

## 提示词草稿

图片提示词和视频提示词都应受商品事实约束。视频提示词可以从场景型、痛点型、卖点型、UGC 型、开箱型等模板注入，也可以由 AI 优化后保存为商品历史草稿。商品创作工作台 UI 应把这些内容呈现为商家可编辑的创作提示词，而不是暴露模型供应商内部 prompt。

相关文件：

- `src/core/scriptGenerator.ts`
- `src/core/promptGenerator.ts`
- `src/client/storyboardDrafts.ts`
- `src/server/productStoryboardService.ts`

## API

商品创作工作台主要使用：

- `GET /api/products`
- `POST /api/products`
- `GET /api/products/:sku`
- `PUT /api/products/:sku`
- `DELETE /api/products/:sku`
- `POST /api/products/import-preview`
- `POST /api/products/import-ai-preview`
- `POST /api/products/import`
- `POST /api/products/import-batch`
- `POST /api/products/import-file-preview`
- `POST /api/products/import-file-commit`
- `POST /api/products/:sku/reference-images`
- `POST /api/products/:sku/import-assets`
- `POST /api/products/:sku/reference-images/order`
- `DELETE /api/products/:sku/reference-images/:index`
- `POST /api/products/:sku/storyboard-draft`
- `GET /api/products/:sku/storyboards`
- `POST /api/products/:sku/storyboards`
- `DELETE /api/products/:sku/storyboards/:id`
- `POST /api/products/:sku/video-jobs`

## 边界

商品创作工作台负责商家创作流程状态。模型供应商凭证、价格规则、支付方式和后台控制属于其他模块。
