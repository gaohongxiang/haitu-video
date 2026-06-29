# 钱包、充值和支付模块

钱包支付模块负责工作区余额、充值订单、支付 webhook、余额冻结、扣费释放和后台人工调整。它不维护模型官方价格。

## 钱包流水

钱包状态只追加写入 `wallet_transactions`。当前余额和冻结金额由流水状态推导，不依赖可变账户字段。

流水类型：

- `recharge`：成功充值或人工加款。
- `reserve`：付费生成开始前冻结余额。
- `charge`：任务完成后从冻结金额扣费。
- `refund`：释放未使用或失败任务的冻结金额。
- `adjustment`：后台人工调整余额。
- `bonus`：赠送额度。

主要文件：

- `src/server/walletStore.ts`
- `src/server/walletRepository.ts`
- `src/server/walletLedger.ts`
- `src/server/walletModelRoutes.ts`

## 充值订单

`wallet_recharge_orders` 跟踪 hosted checkout 会话。当前支持 Stripe 和 Infini。

订单字段包括：

- 工作区；
- 支付供应商；
- 入账金额：`creditCny` / `creditCents`，固定进入人民币钱包；
- 支付金额：`paymentAmount` / `paymentAmountCents`；
- 支付币种：`paymentCurrency`，例如 Stripe 使用 HKD 时这里记录 HKD；
- 钱包币种：`walletCurrency`，当前固定 CNY；
- 汇率快照：`fxRateSnapshot`，非 CNY 支付时必须有明确换算口径；
- checkout URL；
- 支付供应商 session ID；
- 状态和时间戳。

支付成功前不能给钱包入账。

钱包余额永远按人民币 CNY 记账。支付渠道收什么币种只影响 checkout 和 webhook 校验，不改变钱包币种。非 CNY 支付不能静默按 1:1 入账，必须配置并保存汇率快照。

## 支付服务

主要文件：

- `src/server/stripePaymentService.ts`
- `src/server/infiniPaymentService.ts`
- `src/server/paymentWebhookRoutes.ts`
- `src/server/paymentMethodService.ts`

Webhook 处理必须幂等。`payment_webhook_events` 用于记录已处理事件，避免重复入账。

支付密钥只允许保存在服务端环境变量中。不要保存完整银行卡号、微信支付账号或支付宝账号。

## 用户 API

- `GET /api/wallet`
- `POST /api/wallet/recharge-orders`
- `POST /api/wallet/recharge-orders/:id/sync`
- `GET /api/payment-methods`

用户充值必须走 `POST /api/wallet/recharge-orders` 创建 hosted checkout。钱包余额不能通过用户 API 直接入账。

## 后台 API

- `GET /api/admin/payment-methods`
- `PUT /api/admin/payment-methods`
- `GET /api/admin/wallets`
- `GET /api/admin/wallet-transactions`
- `GET /api/admin/recharge-orders`
- `POST /api/admin/wallet-adjustments`

后台财务视图是全站视角，默认跨所有工作区查看余额、充值订单和消费流水，并支持按工作区、状态、支付渠道和流水类型筛选。

后台人工调整必须写审计信息，并且只能由 admin 用户调用。人工调整不能修改历史流水，只能追加新的 `adjustment` 流水。

## Webhook API

- `POST /api/payments/stripe/webhook`
- `POST /api/payments/infini/webhook`

Webhook 路由是公开入口，但必须由对应支付 service 校验签名、金额、币种和订单状态。

## 和模型计费的关系

钱包模块只负责余额变化，不判断模型官方单价。

模型任务扣费由计费模块计算后调用钱包：

- 任务开始：`reserve`
- 任务成功：`capture`
- 任务失败：`release`

完成扣费流水的 metadata 会包含计费模块写入的 `priceSnapshot`。钱包模块只保存这份快照，不解释模型价格。

## 运维规则

- 充值不到账时，先查 `wallet_recharge_orders`，再查支付供应商后台，最后查 `wallet_transactions`。
- 重放 webhook 前确认事件幂等记录。
- 退款规则要与公开 `/refund` 页面一致：已消耗的 AI 数字服务一般不可退，未使用余额可联系客服人工处理。
- 用户控制台 `/console` 只展示当前工作区自己的钱包和订单；项目方后台 `/admin` 才展示全站财务数据。
