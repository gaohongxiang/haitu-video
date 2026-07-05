const defaultRechargeOrderExpiresInSeconds = 60 * 60;
const minRechargeOrderExpiresInSeconds = 30 * 60;
const maxRechargeOrderExpiresInSeconds = 24 * 60 * 60;

export interface RechargeOrderExpirationPolicy {
  expiresInSeconds: number;
}

export function rechargeOrderExpirationPolicyFromEnv(
  env: NodeJS.ProcessEnv = process.env
): RechargeOrderExpirationPolicy {
  return {
    expiresInSeconds: normalizeIntegerEnv({
      value: env.HAITU_RECHARGE_ORDER_EXPIRES_IN_SECONDS,
      name: "HAITU_RECHARGE_ORDER_EXPIRES_IN_SECONDS",
      min: minRechargeOrderExpiresInSeconds,
      max: maxRechargeOrderExpiresInSeconds,
      defaultValue: defaultRechargeOrderExpiresInSeconds
    })
  };
}

function normalizeIntegerEnv(input: {
  value: unknown;
  name: string;
  min: number;
  max: number;
  defaultValue: number;
}): number {
  const text = typeof input.value === "string" ? input.value.trim() : "";
  if (!text) {
    return input.defaultValue;
  }
  const value = Number(text);
  if (!Number.isInteger(value) || value < input.min || value > input.max) {
    throw new Error(`${input.name} 必须是 ${input.min} 到 ${input.max} 之间的整数秒。`);
  }
  return value;
}
