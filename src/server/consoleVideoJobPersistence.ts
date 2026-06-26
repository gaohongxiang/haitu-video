import type { DatabaseHandle } from "./db/client.js";
import type { VideoJobRecord } from "./consoleVideoJobTypes.js";
import { WalletStore } from "./walletStore.js";

export function persistVideoJobRecord(input: {
  databaseHandle?: DatabaseHandle;
  record: VideoJobRecord;
  workspaceId?: string;
}): void {
  const handle = input.databaseHandle;
  if (!handle) {
    return;
  }
  const workspaceId = workspaceIdForVideoJob(input.record, input.workspaceId);
  handle.sqlite.prepare(`
    INSERT INTO video_jobs (
      id,
      workspace_id,
      product_id,
      status,
      model,
      language,
      duration_seconds,
      output_count,
      job_dir,
      created_at,
      completed_at,
      expires_at
    ) VALUES (
      @id,
      @workspaceId,
      (SELECT id FROM products WHERE workspace_id = @workspaceId AND product_json_path = @productPath),
      @status,
      @model,
      @language,
      @durationSeconds,
      @outputCount,
      @jobDir,
      @createdAt,
      @completedAt,
      @expiresAt
    )
    ON CONFLICT(id) DO UPDATE SET
      workspace_id = excluded.workspace_id,
      product_id = excluded.product_id,
      status = excluded.status,
      model = excluded.model,
      language = excluded.language,
      duration_seconds = excluded.duration_seconds,
      output_count = excluded.output_count,
      job_dir = excluded.job_dir,
      completed_at = excluded.completed_at,
      expires_at = excluded.expires_at
  `).run({
    id: input.record.id,
    workspaceId,
    status: input.record.status,
    model: input.record.providerModel ?? input.record.provider ?? null,
    language: input.record.finalLanguage ?? null,
    durationSeconds: input.record.durationSeconds ?? null,
    outputCount: input.record.finalOutputPath ? 1 : 0,
    jobDir: input.record.outDir,
    productPath: input.record.productPath,
    createdAt: input.record.createdAt,
    completedAt: input.record.completedAt ?? null,
    expiresAt: input.record.expiresAt ?? null
  });
  persistVideoJobAsset({
    databaseHandle: handle,
    record: input.record,
    storagePath: input.record.rawOutputPath,
    kind: "raw",
    workspaceId
  });
  persistVideoJobAsset({
    databaseHandle: handle,
    record: input.record,
    storagePath: input.record.finalOutputPath,
    kind: "final",
    workspaceId
  });
}

export function captureVideoJobWalletCharge(input: {
  databaseHandle?: DatabaseHandle;
  record: VideoJobRecord;
  workspaceId?: string;
  now?: () => Date;
}): void {
  if (!input.record.walletReservationId) {
    return;
  }
  const handle = input.databaseHandle;
  if (!handle) {
    return;
  }
  const platformFeeCny = input.record.platformFeeCny ?? 0;
  const upstreamCostCny = input.record.apiBillingMode === "platform"
    ? input.record.estimatedCostCny ?? input.record.upstreamEstimatedCostCny ?? 0
    : 0;
  new WalletStore({
    handle,
    workspaceId: workspaceIdForVideoJob(input.record, input.workspaceId),
    now: input.now
  }).capture({
    reservationId: input.record.walletReservationId,
    jobId: input.record.id,
    amountCny: roundMoney(platformFeeCny + upstreamCostCny),
    description: "视频生成扣费",
    metadata: {
      apiBillingMode: input.record.apiBillingMode,
      platformFeeCny,
      upstreamCostCny
    }
  });
}

export function releaseVideoJobWalletReservation(input: {
  databaseHandle?: DatabaseHandle;
  record: VideoJobRecord;
  workspaceId?: string;
  now?: () => Date;
}): void {
  if (!input.record.walletReservationId) {
    return;
  }
  const handle = input.databaseHandle;
  if (!handle) {
    return;
  }
  new WalletStore({
    handle,
    workspaceId: workspaceIdForVideoJob(input.record, input.workspaceId),
    now: input.now
  }).release({
    reservationId: input.record.walletReservationId,
    jobId: input.record.id,
    description: "视频生成失败，释放冻结金额",
    metadata: {
      apiBillingMode: input.record.apiBillingMode
    }
  });
}

function persistVideoJobAsset(input: {
  databaseHandle: DatabaseHandle;
  record: VideoJobRecord;
  storagePath: string | undefined;
  kind: "raw" | "final";
  workspaceId: string;
}): void {
  if (!input.storagePath) {
    return;
  }
  input.databaseHandle.sqlite.prepare(`
    INSERT INTO video_assets (
      id,
      workspace_id,
      job_id,
      status,
      storage_provider,
      storage_path,
      expires_at
    ) VALUES (
      @id,
      @workspaceId,
      @jobId,
      @status,
      'file',
      @storagePath,
      @expiresAt
    )
    ON CONFLICT(id) DO UPDATE SET
      workspace_id = excluded.workspace_id,
      job_id = excluded.job_id,
      status = excluded.status,
      storage_path = excluded.storage_path,
      expires_at = excluded.expires_at,
      deleted_at = NULL
  `).run({
    id: `${input.record.id}:${input.kind}`,
    workspaceId: input.workspaceId,
    jobId: input.record.id,
    status: input.record.status === "completed" ? "available" : input.record.status,
    storagePath: input.storagePath,
    expiresAt: input.record.expiresAt ?? null
  });
}

function workspaceIdForVideoJob(record: VideoJobRecord, fallback?: string): string {
  return record.workspaceId ?? fallback ?? "default";
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
