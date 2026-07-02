# 运行架构

Haitu 当前是单 Node.js 服务：公开站服务端渲染，控制台由 Vite 构建的 React 应用承载，SQLite 保存元数据，本地文件系统保存资产，并在同一服务进程内执行异步视频任务。

## 进程形态

`src/cli/console.ts` 启动控制台服务。`src/server/consoleServer.ts` 创建 HTTP server，并把请求交给 `createConsoleRequestHandler`。

请求处理顺序：

1. 健康检查路由。
2. 认证和后台路由。
3. 临时公开资产路由。
4. 营销页路由。
5. 支付 webhook 路由。
6. 非公开路由认证。
7. 控制台/后台静态资源。
8. 工作区作用域业务 API。
9. 需要认证的媒体路由。

## 运行时状态

`createConsoleServerRuntime` 负责组装长期存在的服务对象：

- `dataDir`：从 `HAITU_DATA_DIR` 解析，默认是项目内 `data`。
- SQLite handle：数据库文件位于数据目录下。
- settings store：全局控制台默认值和支付方式设置。
- auth store：基于 Better Auth 的登录和会话处理。
- audit log：系统数据目录里的 JSONL 审计日志。
- public asset token store：本地资产临时公开 URL 的内存映射。
- 默认模型配置 store 和模型服务偏好 store。
- 每个工作区的本地视频任务队列。
- 视频保留期清理定时器。

## 工作区上下文

业务 API 在认证后调用 `createConsoleRequestContext`。上下文会解析当前工作区，派生工作区路径，创建工作区作用域的模型配置、模型服务偏好和钱包 store，并选择或创建该工作区的 `LocalVideoJobQueue`。

工作区隔离依靠以下边界：

- 数据库行携带 `workspace_id`；
- 文件路径位于 `workspaces/<workspaceId>/` 下；
- 模型凭证、启用模型版本和模型服务偏好按工作区隔离；
- 钱包流水按工作区隔离；
- 请求上下文把所有商品/视频 API 都绑定到解析出的工作区。

## 前端外壳

`src/client/App.tsx` 承载创作控制台。导航分区定义在 `src/client/consoleNavigation.ts`：dashboard、video、image、ledger、wallet、pricing 和 settings。

`src/client/AdminApp.tsx` 承载 `/admin`。后台分区包括 overview、users、platform models、billing 和 system。

两个外壳共享 UI 基础组件、i18n 资源、认证会话处理和部分 API client helper。

## 异步视频任务

视频创作请求会进入 `LocalVideoJobQueue`。队列负责持久化任务记录、运行 `makeVideoPipeline`、更新任务状态、记录模型供应商任务元数据、登记视频资产、处理钱包冻结金额的扣款或释放，并把可下载产物放在工作区 jobs 目录下。

当前部署在同一个 Node 进程内执行任务，以保持小 VPS 架构简单。未来拆 worker 时也应保留相同的数据库和资产契约。

## 外部集成

- 视频模型供应商通过 `src/providers/providerFactory.ts` 选择。
- 火山引擎 Seedance 是当前真实视频模型供应商。
- 模型凭证使用 `HAITU_SECRET_KEY` 加密后存入 SQLite。
- Stripe 和 Infini webhook 路由是公开入口，但由各自 service 模块校验签名。
- 统一模型目录由 `src/modelPricing/officialModelPricingCatalog.ts` 兜底，后台可发布 active catalog；钱包扣费时写入模型目录版本和价格快照。
- 邮箱验证码可以走 Resend；未配置 Resend 时写入本地 outbox 记录。
