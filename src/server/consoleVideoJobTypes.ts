import type { ScriptTemplate } from "../core/scriptGenerator.js";
import type { FinalVideoLanguage } from "../core/videoLanguage.js";
import type { VideoProviderName } from "../providers/providerFactory.js";
import type { VideoResolution } from "../providers/types.js";

export interface VideoJobRequest {
  productPath: string;
  outDirName?: string;
  provider?: VideoProviderName;
  providerModelConfigId?: string;
  providerModel?: string;
  duration?: number;
  resolution?: VideoResolution;
  template?: ScriptTemplate;
  finalLanguage?: FinalVideoLanguage;
  cta?: string;
  scriptLines?: string[];
  storyboardLines?: string[];
  confirmPaid?: boolean;
  apiBillingMode?: "platform" | "byok";
  platformFeeCny?: number;
  upstreamEstimatedCostCny?: number;
  walletReservationId?: string;
  reuseManifest?: string;
}

export interface VideoJobRecord {
  id: string;
  workspaceId?: string;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  productPath: string;
  productSku?: string;
  provider?: VideoProviderName;
  providerModelConfigId?: string;
  providerModel?: string;
  durationSeconds?: number;
  resolution?: VideoResolution;
  template?: ScriptTemplate;
  finalLanguage?: FinalVideoLanguage;
  cta?: string;
  scriptLines?: string[];
  storyboardLines?: string[];
  confirmPaid: boolean;
  apiBillingMode?: "platform" | "byok";
  platformFeeCny?: number;
  upstreamEstimatedCostCny?: number;
  walletReservationId?: string;
  reuseManifest?: string;
  outDir: string;
  reportPath?: string;
  reportUrl?: string;
  rawOutputPath?: string;
  rawOutputUrl?: string;
  finalOutputPath?: string;
  finalVideoUrl?: string;
  finalManifestPath?: string;
  finalManifestUrl?: string;
  subtitlePath?: string;
  subtitleUrl?: string;
  hashtags?: string[];
  providerTaskId?: string;
  recoverableRawManifestPath?: string;
  providerVideoUrl?: string;
  canRecoverDownload?: boolean;
  totalTokens?: number;
  estimatedCostCny?: number;
  error?: string;
  errorDetails?: VideoJobErrorDetails;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface VideoJobErrorDetails {
  message: string;
  name?: string;
  causeMessage?: string;
  causeCode?: string;
  providerPhase?: string;
  providerName?: string;
  providerModel?: string;
  referenceImageCount?: number;
  usedTemporaryAssetUrls?: boolean;
  providerTaskId?: string;
  providerVideoUrl?: string;
  recoverableRawManifestPath?: string;
}
