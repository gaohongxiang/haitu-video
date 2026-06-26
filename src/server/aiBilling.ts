import type { ModelStoredConfig } from "./modelConfigStore.js";
import { InsufficientWalletBalanceError, WalletStore } from "./walletStore.js";

export type AiUsageKind = "text" | "image";

export const aiInsufficientBalanceMessage = "余额不足，请先充值后再使用 AI 功能。";

export async function runMeteredAiAction<T>(input: {
  walletStore: WalletStore;
  kind: AiUsageKind;
  modelConfig?: Partial<ModelStoredConfig>;
  units?: number;
  reserveDescription: string;
  chargeDescription: string;
  action: () => Promise<T>;
  actualUnits?: (result: T) => number;
}): Promise<T> {
  const apiBillingMode = input.modelConfig?.apiOwner === "platform" ? "platform" : "byok";
  const platformFeeCny = platformFeeCnyForAi(input.kind);
  const estimatedUnits = Math.max(1, input.units ?? 1);
  const upstreamEstimatedCostCny = apiBillingMode === "platform"
    ? estimatedAiUpstreamCostCny(input.kind, estimatedUnits)
    : 0;
  const reserveAmountCny = roundMoney(platformFeeCny * estimatedUnits + upstreamEstimatedCostCny);
  let reservation: ReturnType<WalletStore["reserve"]>;
  try {
    reservation = input.walletStore.reserve({
      amountCny: reserveAmountCny,
      description: input.reserveDescription,
      metadata: {
        usageKind: input.kind,
        apiBillingMode,
        platformFeeCny,
        upstreamEstimatedCostCny,
        estimatedUnits,
        providerId: input.modelConfig?.providerId,
        configId: input.modelConfig?.configId,
        model: input.modelConfig?.model
      }
    });
  } catch (error) {
    if (error instanceof InsufficientWalletBalanceError) {
      throw new Error(aiInsufficientBalanceMessage);
    }
    throw error;
  }
  try {
    const result = await input.action();
    const actualUnits = Math.max(1, input.actualUnits?.(result) ?? estimatedUnits);
    const actualUpstreamCostCny = apiBillingMode === "platform"
      ? estimatedAiUpstreamCostCny(input.kind, actualUnits)
      : 0;
    input.walletStore.capture({
      reservationId: reservation.reservationId,
      amountCny: roundMoney(platformFeeCny * actualUnits + actualUpstreamCostCny),
      description: input.chargeDescription,
      metadata: {
        usageKind: input.kind,
        apiBillingMode,
        platformFeeCny,
        upstreamEstimatedCostCny,
        upstreamActualCostCny: actualUpstreamCostCny,
        estimatedUnits,
        actualUnits,
        providerId: input.modelConfig?.providerId,
        configId: input.modelConfig?.configId,
        model: input.modelConfig?.model
      }
    });
    return result;
  } catch (error) {
    input.walletStore.release({
      reservationId: reservation.reservationId,
      description: "释放 AI 功能预扣",
      metadata: {
        usageKind: input.kind,
        apiBillingMode,
        providerId: input.modelConfig?.providerId,
        configId: input.modelConfig?.configId,
        model: input.modelConfig?.model
      }
    });
    throw error;
  }
}

function platformFeeCnyForAi(kind: AiUsageKind): number {
  if (kind === "image") {
    return roundMoney(numberFromEnv(process.env.HAITU_PLATFORM_FEE_CNY_PER_IMAGE, 0.3));
  }
  return roundMoney(numberFromEnv(process.env.HAITU_PLATFORM_FEE_CNY_PER_TEXT, 0.2));
}

function estimatedAiUpstreamCostCny(kind: AiUsageKind, units: number): number {
  if (kind === "image") {
    return roundMoney(numberFromEnv(process.env.HAITU_PLATFORM_IMAGE_UPSTREAM_CNY_PER_IMAGE, 0.7) * units);
  }
  return roundMoney(numberFromEnv(process.env.HAITU_PLATFORM_TEXT_UPSTREAM_CNY_PER_CALL, 0.2) * units);
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
