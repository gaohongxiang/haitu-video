# 视频生成模块

视频生成模块负责创建、跟踪、后处理、计费和展示商品视频生成结果。

## 任务生命周期

`VideoJobRecord.status` 可以是 `queued`、`running`、`completed`、`failed` 或 `canceled`。

队列负责：

- 创建持久化任务记录；
- 必要时冻结钱包余额；
- 根据商品和模型服务选择构造 pipeline input；
- 调用模型供应商支撑的 pipeline；
- 保存原始输出和最终输出；
- 记录模型供应商 task ID、用量、成本和错误；
- 扣除或释放钱包冻结金额；
- 索引任务和资产元数据；
- 提供下载和恢复下载路由。

主要文件：

- `src/server/consoleVideoJobQueue.ts`
- `src/server/consoleVideoJobTypes.ts`
- `src/server/consoleVideoJobRecordFactory.ts`
- `src/server/consoleVideoJobCompletion.ts`
- `src/server/consoleVideoJobFailure.ts`
- `src/server/videoRoutes.ts`
- `src/pipeline/makeVideoPipeline.ts`
- `src/pipeline/runProductJob.ts`

## 模型供应商

核心 pipeline 代码依赖共享模型供应商契约，而不是直接依赖具体 API。

- `mock`：免费本地占位模型供应商，用于开发和测试。
- `volcengine-seedance`：当前真实视频模型供应商。它创建远程任务、轮询完成状态、下载结果，并在可用时记录用量/成本元数据。

模型供应商选择逻辑在 `src/providers/providerFactory.ts`。Seedance 具体实现位于 `src/providers/volcengine/seedanceProvider.ts`。

## 参考资产 URL

Seedance 和类似模型供应商需要可访问的 HTTPS 参考图 URL。本地商品图由 `createReferenceImageUrlResolver` 转换为短期公开资产 URL。resolver 会在 `PublicAssetTokenStore` 中注册 token，并返回 `/api/public-assets/:token` URL。

这是单节点桥接方案，不是对象存储。未来接对象存储时也应保持同样的模型供应商契约：输入本地商品资产，输出短期 HTTPS URL。

## 输出和保留期

生成文件保存在工作区 jobs 目录下。视频资产按策略过期，目前偏短保留期，鼓励用户尽快下载。任务元数据和报告仍对客服支持和计费核对有长期价值。

没有支持或合规原因时，不要删除 manifest、report、模型供应商 task ID、用量或计费元数据。

## API

- `POST /api/preflight`
- `POST /api/make-video`
- `POST /api/video-jobs`
- `POST /api/video-jobs/batch`
- `GET /api/video-jobs`
- `GET /api/video-jobs/groups`
- `GET /api/video-jobs/:id`
- `POST /api/video-jobs/:id/cancel`
- `POST /api/video-jobs/:id/retry`
- `POST /api/video-jobs/:id/recover-download`
- `GET /api/provider-tasks`
- `GET /api/provider-tasks/:id`
- `POST /api/provider-tasks/:id/cancel`

## 审核和发布

审核和发布 API 支持选择最终版、给版本评分、生成发布素材包和导出 CSV。

- `POST /api/reviews/select-final`
- `POST /api/reviews/rate-version`
- `GET /api/publish-packages`
- `POST /api/publish-packages`
- `POST /api/publish-packages/batch`
- `GET /api/publish-packages/export.csv`
