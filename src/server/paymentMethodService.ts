import type {
  FileConsoleSettingsStore,
  PaymentMethodId,
  PaymentMethodSettings
} from "./consoleSettings.js";
import { defaultPaymentMethods } from "./consoleSettings.js";

export interface PaymentMethodView extends PaymentMethodSettings {
  configured: boolean;
  available: boolean;
  unavailableReason?: string;
}

export interface PaymentMethodUpdateRequest {
  methods?: Array<{
    id?: string;
    enabled?: boolean;
  }>;
}

export async function listUserPaymentMethods(input: {
  settingsStore: FileConsoleSettingsStore;
  env?: NodeJS.ProcessEnv;
}): Promise<{ methods: PaymentMethodView[] }> {
  const methods = await listPaymentMethods(input);
  return {
    methods: methods.filter((method) => method.enabled)
  };
}

export async function listAdminPaymentMethods(input: {
  settingsStore: FileConsoleSettingsStore;
  env?: NodeJS.ProcessEnv;
}): Promise<{ methods: PaymentMethodView[] }> {
  return {
    methods: await listPaymentMethods(input)
  };
}

export async function saveAdminPaymentMethods(input: {
  settingsStore: FileConsoleSettingsStore;
  request: PaymentMethodUpdateRequest;
  env?: NodeJS.ProcessEnv;
}): Promise<{ methods: PaymentMethodView[] }> {
  const current = await input.settingsStore.read();
  const updates = new Map(
    (input.request.methods ?? [])
      .filter((method): method is { id: PaymentMethodId; enabled: boolean } => (
        isPaymentMethodId(method.id) && typeof method.enabled === "boolean"
      ))
      .map((method) => [method.id, method.enabled])
  );
  const paymentMethods = current.paymentMethods.map((method) => ({
    ...method,
    enabled: updates.get(method.id) ?? method.enabled
  }));
  await input.settingsStore.write({
    paymentMethods
  });
  return listAdminPaymentMethods(input);
}

export async function assertPaymentMethodCanCreateRechargeOrder(input: {
  settingsStore: FileConsoleSettingsStore;
  paymentMethodId?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<PaymentMethodView> {
  const paymentMethodId = normalizePaymentMethodId(input.paymentMethodId);
  const methods = await listPaymentMethods(input);
  const method = methods.find((item) => item.id === paymentMethodId);
  if (!method) {
    throw new Error("暂不支持该支付方式。");
  }
  if (!method.enabled) {
    throw new Error("该支付方式已停用，请在后台启用后再充值。");
  }
  if (!method.configured) {
    throw new Error("该支付方式尚未配置完成，请先在服务器环境变量中配置。");
  }
  if (!method.available) {
    throw new Error(method.unavailableReason ?? "该支付方式暂不可用。");
  }
  return method;
}

async function listPaymentMethods(input: {
  settingsStore: FileConsoleSettingsStore;
  env?: NodeJS.ProcessEnv;
}): Promise<PaymentMethodView[]> {
  const settings = await input.settingsStore.read();
  const byId = new Map(settings.paymentMethods.map((method) => [method.id, method]));
  return defaultPaymentMethods.map((fallback) => paymentMethodView(byId.get(fallback.id) ?? fallback, input.env ?? process.env));
}

function paymentMethodView(method: PaymentMethodSettings, env: NodeJS.ProcessEnv): PaymentMethodView {
  const configured = paymentMethodConfigured(method.id, env);
  return {
    ...method,
    configured,
    available: method.enabled && configured,
    unavailableReason: unavailableReason(method, configured)
  };
}

function unavailableReason(method: PaymentMethodSettings, configured: boolean): string | undefined {
  if (!method.enabled) {
    return "后台已停用";
  }
  if (!configured) {
    return method.id === "stripe"
      ? "缺少 STRIPE_SECRET_KEY 或 STRIPE_WEBHOOK_SECRET"
      : "缺少 INFINI_PUBLIC_KEY、INFINI_PRIVATE_KEY 或 INFINI_WEBHOOK_SECRET";
  }
  return undefined;
}

function paymentMethodConfigured(id: PaymentMethodId, env: NodeJS.ProcessEnv): boolean {
  if (id === "stripe") {
    return Boolean(env.STRIPE_SECRET_KEY?.trim() && env.STRIPE_WEBHOOK_SECRET?.trim());
  }
  const publicKey = env.INFINI_PUBLIC_KEY?.trim() || env.INFINI_KEY_ID?.trim();
  const privateKey = env.INFINI_PRIVATE_KEY?.trim() || env.INFINI_SECRET_KEY?.trim();
  return Boolean(publicKey && privateKey && env.INFINI_WEBHOOK_SECRET?.trim());
}

function normalizePaymentMethodId(value: unknown): PaymentMethodId {
  if (value === undefined || value === null || value === "") {
    return "stripe";
  }
  if (isPaymentMethodId(value)) {
    return value;
  }
  throw new Error("暂不支持该支付方式。");
}

function isPaymentMethodId(value: unknown): value is PaymentMethodId {
  return value === "stripe" || value === "infini";
}
