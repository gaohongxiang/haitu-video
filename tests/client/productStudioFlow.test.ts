import { describe, expect, it } from "vitest";

import {
  recommendedProductStudioStep,
  type ProductStudioFlowState
} from "../../src/client/productStudioFlow.js";

function flowState(overrides: Partial<ProductStudioFlowState> = {}): ProductStudioFlowState {
  return {
    productLoaded: true,
    productFactsReady: true,
    referenceImageCount: 3,
    generatedVersionCount: 3,
    selectedFinalReady: true,
    ...overrides
  };
}

describe("product studio flow", () => {
  it("recommends the earliest incomplete step in the customer-facing product workflow", () => {
    expect(recommendedProductStudioStep(flowState({ productLoaded: false }))).toBe("raw");
    expect(recommendedProductStudioStep(flowState({ productFactsReady: false }))).toBe("raw");
    expect(recommendedProductStudioStep(flowState({ referenceImageCount: 1 }))).toBe("raw");
    expect(recommendedProductStudioStep(flowState({ generatedVersionCount: 0 }))).toBe("storyboard");
    expect(recommendedProductStudioStep(flowState({ generatedVersionCount: 2 }))).toBe("generate");
    expect(recommendedProductStudioStep(flowState({ selectedFinalReady: false }))).toBe("generate");
    expect(recommendedProductStudioStep(flowState())).toBe("generate");
  });
});
