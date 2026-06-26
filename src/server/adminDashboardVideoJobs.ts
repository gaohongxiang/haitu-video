import { readFileSync } from "node:fs";

import { readableVideoProviderError, type ReadableVideoProviderErrorInput } from "../core/videoProviderErrors.js";
import type { AdminUserVideoJobSummary } from "./adminDashboardTypes.js";
import type { DatabaseHandle } from "./db/client.js";

interface VideoJobDetailRow {
  id: string;
  workspace_id: string;
  product_id: string | null;
  product_sku: string | null;
  product_title: string | null;
  status: string;
  model: string | null;
  language: string | null;
  duration_seconds: number | null;
  output_count: number | null;
  job_dir: string;
  created_at: string;
  completed_at: string | null;
  expires_at: string | null;
}

export function buildUserVideoJobs(handle: DatabaseHandle, userId: string): AdminUserVideoJobSummary[] {
  const rows = handle.sqlite.prepare(`
    SELECT
      vj.id,
      vj.workspace_id,
      vj.product_id,
      p.sku AS product_sku,
      p.title AS product_title,
      vj.status,
      vj.model,
      vj.language,
      vj.duration_seconds,
      vj.output_count,
      vj.job_dir,
      vj.created_at,
      vj.completed_at,
      vj.expires_at
    FROM video_jobs vj
    INNER JOIN workspace_members wm ON wm.workspace_id = vj.workspace_id
    LEFT JOIN products p ON p.id = vj.product_id
    WHERE wm.user_id = ?
    ORDER BY vj.created_at DESC
    LIMIT 50
  `).all(userId) as VideoJobDetailRow[];
  return rows.map((row) => {
    const metadata = readVideoJobMetadata(row.job_dir);
    const error = typeof metadata.error === "string" ? metadata.error : undefined;
    const errorDetails = parseAdminVideoJobErrorDetails(metadata.errorDetails);
    const readableError = row.status === "failed"
      ? readableAdminVideoJobError(error, errorDetails)
      : undefined;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      productId: row.product_id ?? undefined,
      productSku: row.product_sku ?? undefined,
      productTitle: row.product_title ?? undefined,
      status: row.status,
      provider: providerFromModel(row.model),
      model: row.model ?? undefined,
      language: row.language ?? undefined,
      durationSeconds: row.duration_seconds ?? undefined,
      outputCount: row.output_count ?? undefined,
      jobDir: row.job_dir,
      error,
      errorDetails,
      readableError,
      createdAt: row.created_at,
      completedAt: row.completed_at ?? undefined,
      expiresAt: row.expires_at ?? undefined
    };
  });
}

function readVideoJobMetadata(jobDir: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readFileSync(`${jobDir}/job.json`, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function parseAdminVideoJobErrorDetails(value: unknown): ReadableVideoProviderErrorInput | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const input = value as Record<string, unknown>;
  if (typeof input.message !== "string" || !input.message) {
    return undefined;
  }
  return {
    message: input.message,
    rawMessage: typeof input.rawMessage === "string" ? input.rawMessage : undefined,
    causeMessage: typeof input.causeMessage === "string" ? input.causeMessage : undefined,
    causeCode: typeof input.causeCode === "string" ? input.causeCode : undefined,
    providerPhase: typeof input.providerPhase === "string" ? input.providerPhase : undefined,
    providerName: typeof input.providerName === "string" ? input.providerName : undefined,
    providerModel: typeof input.providerModel === "string" ? input.providerModel : undefined,
    referenceImageCount: typeof input.referenceImageCount === "number" ? input.referenceImageCount : undefined
  };
}

function readableAdminVideoJobError(error: string | undefined, details: ReadableVideoProviderErrorInput | undefined): string | undefined {
  const message = readableVideoProviderError(details ? {
    ...details,
    message: error ?? details.message,
    rawMessage: details.message
  } : error);
  return message || undefined;
}

function providerFromModel(model: string | null): string | undefined {
  if (!model) {
    return undefined;
  }
  return model === "mock" ? "mock" : "volcengine-seedance";
}
