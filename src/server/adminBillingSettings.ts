import { BillingPolicyStore, type BillingPriceRuleUpdate } from "./billingPolicyStore.js";
import type { DatabaseHandle } from "./db/client.js";

export interface BillingSettingsUpdateRequest {
  rules?: BillingPriceRuleUpdate[];
}

export function getAdminBillingSettings(input: {
  handle: DatabaseHandle;
  now?: () => Date;
}) {
  return {
    settings: new BillingPolicyStore({
      handle: input.handle,
      now: input.now
    }).getSettings()
  };
}

export function saveAdminBillingSettings(input: {
  handle: DatabaseHandle;
  request: BillingSettingsUpdateRequest;
  now?: () => Date;
}) {
  return {
    settings: new BillingPolicyStore({
      handle: input.handle,
      now: input.now
    }).updateSettings({
      rules: input.request.rules
    })
  };
}
