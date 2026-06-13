export type ProductStudioStepKey = "raw" | "storyboard" | "generate";

export interface ProductStudioFlowState {
  productLoaded: boolean;
  productFactsReady: boolean;
  referenceImageCount: number;
  generatedVersionCount: number;
  selectedFinalReady: boolean;
}

const minimumReferenceImages = 3;
const targetGeneratedVersions = 3;

export function recommendedProductStudioStep(state: ProductStudioFlowState): ProductStudioStepKey {
  if (!state.productLoaded || !state.productFactsReady || state.referenceImageCount < minimumReferenceImages) return "raw";
  if (state.generatedVersionCount === 0) return "storyboard";
  if (state.generatedVersionCount < targetGeneratedVersions) return "generate";
  return "generate";
}
