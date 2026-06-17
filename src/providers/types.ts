import type { FinalVideoLanguage } from "../core/videoLanguage.js";

export interface MoneyAmount {
  amount: number;
  currency: "USD" | "JPY" | "CNY";
}

export type ReferenceImageUrlResolver = (reference: string) => Promise<string>;

export interface VideoProviderRequest {
  jobId: string;
  productSku: string;
  prompt: string;
  script: string;
  durationSeconds: number;
  aspectRatio: "9:16";
  outputDir: string;
  referenceImages?: string[];
  finalLanguage?: FinalVideoLanguage;
}

export interface VideoOutput {
  path: string;
  width: number;
  height: number;
  durationSeconds: number;
  mimeType: "video/mp4" | "text/plain";
}

export interface VideoProviderResult {
  provider: string;
  model: string;
  providerTaskId?: string;
  output: VideoOutput;
  usage?: {
    completionTokens?: number;
    totalTokens?: number;
  };
  cost: MoneyAmount;
  rawResponse: Record<string, unknown>;
}

export interface VideoProvider {
  generateVideo(request: VideoProviderRequest): Promise<VideoProviderResult>;
}
