import { estimateBillingActions, type BillingEstimatesRequest } from "./billingEstimateService.js";
import { jsonResponse } from "./consoleHttpService.js";
import type { ConsoleRequestContext } from "./consoleWorkspaceRuntime.js";

export async function handleBillingEstimateRoutes(input: {
  request: Request;
  url: URL;
  requestContext: ConsoleRequestContext;
}): Promise<Response | undefined> {
  if (input.request.method === "POST" && input.url.pathname === "/api/billing-estimates") {
    return jsonResponse(await estimateBillingActions({
      billingPolicyStore: input.requestContext.billingPolicyStore,
      modelConfigStore: input.requestContext.modelConfigStore,
      platformModelConfigStore: input.requestContext.platformModelConfigStore,
          modelServicePreferenceStore: input.requestContext.modelServicePreferenceStore,
      modelPricingCatalog: input.requestContext.modelPricingCatalog,
      input: (await input.request.json()) as BillingEstimatesRequest
    }));
  }
  return undefined;
}
