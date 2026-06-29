import type { ModelPricingEntry } from "../modelPricing/officialModelPricingCatalog.js";
import type { ModelStoredConfig } from "./modelConfigStore.js";
import type { BillingPolicyStore } from "./billingPolicyStore.js";
import {
  estimateImageUpstreamCostCny,
  estimateTextUpstreamCostCny,
  modelPricingSnapshotForUsage,
  type TextTokenUsage
} from "./modelPricing.js";
import { InsufficientWalletBalanceError, WalletStore } from "./walletStore.js";

export type AiUsageKind = "text" | "image";

export const aiInsufficientBalanceMessage = "余额不足，请先充值后再使用 AI 功能。";

export interface MeteredAiActionResult<T> {
  value: T;
  metering?: {
    textUsage?: TextTokenUsage;
    units?: number;
  };
}

export async function runMeteredAiAction<T>(input: {
  walletStore: WalletStore;
  billingPolicyStore: BillingPolicyStore;
  kind: AiUsageKind;
  modelConfig?: Partial<ModelStoredConfig>;
  units?: number;
  reserveDescription: string;
  chargeDescription: string;
  action: () => Promise<T | MeteredAiActionResult<T>>;
  actualUnits?: (result: T) => number;
  modelPricingCatalog?: readonly ModelPricingEntry[];
  modelPricingCatalogVersion?: string;
}): Promise<T> {
  const apiBillingMode = input.modelConfig?.apiOwner === "platform" ? "platform" : "byok";
  const billingRule = input.billingPolicyStore.getRule(input.kind);
  const platformFeeCny = billingRule.serviceFeeCny;
  const estimatedUnits = Math.max(1, input.units ?? 1);
  const upstreamEstimatedCostCny = apiBillingMode === "platform"
    ? estimateAiUpstreamCostCny(input.kind, input.modelConfig?.model, estimatedUnits, undefined, input.modelPricingCatalog)
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
    const actionResult = normalizeMeteredAiActionResult(await input.action());
    const result = actionResult.value;
    const actualUnits = Math.max(1, input.actualUnits?.(result) ?? estimatedUnits);
    const actualUpstreamCostCny = apiBillingMode === "platform"
      ? estimateAiUpstreamCostCny(input.kind, input.modelConfig?.model, actualUnits, actionResult.metering?.textUsage, input.modelPricingCatalog)
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
        model: input.modelConfig?.model,
        priceSnapshot: modelPricingSnapshotForUsage({
          kind: input.kind,
          model: input.modelConfig?.model,
          units: actualUnits,
          textUsage: actionResult.metering?.textUsage,
          catalog: input.modelPricingCatalog,
          catalogVersion: input.modelPricingCatalogVersion
        })
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

function estimateAiUpstreamCostCny(
  kind: AiUsageKind,
  model: string | undefined,
  units: number,
  textUsage?: TextTokenUsage,
  modelPricingCatalog?: readonly ModelPricingEntry[]
): number {
  return kind === "image"
    ? estimateImageUpstreamCostCny(model, units, modelPricingCatalog)
    : estimateTextUpstreamCostCny(model, textUsage ?? units, modelPricingCatalog);
}

function normalizeMeteredAiActionResult<T>(result: T | MeteredAiActionResult<T>): MeteredAiActionResult<T> {
  if (isMeteredAiActionResult(result)) {
    return result;
  }
  return {
    value: result
  };
}

function isMeteredAiActionResult<T>(value: T | MeteredAiActionResult<T>): value is MeteredAiActionResult<T> {
  return Boolean(
    value &&
    typeof value === "object" &&
    "value" in value &&
    "metering" in value
  );
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
