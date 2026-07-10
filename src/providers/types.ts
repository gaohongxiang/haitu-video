import type { FinalVideoLanguage } from "../core/videoLanguage.js";

export interface MoneyAmount {
  amount: number;
  currency: "USD" | "JPY" | "CNY";
}

export type ReferenceImageUrlResolver = (reference: string) => Promise<string>;
export type VideoResolution = "480p" | "720p" | "1080p" | "4k";
export type VideoAspectRatio = "9:16" | "16:9";

export interface VideoProviderRequest {
  jobId: string;
  productSku: string;
  prompt: string;
  script: string;
  durationSeconds: number;
  aspectRatio: VideoAspectRatio;
  resolution?: VideoResolution;
  outputDir: string;
  referenceImages?: string[];
  finalLanguage?: FinalVideoLanguage;
  onTaskCreated?: (taskId: string) => Promise<void> | void;
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
