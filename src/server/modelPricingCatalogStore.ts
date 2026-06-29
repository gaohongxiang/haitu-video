import { randomUUID } from "node:crypto";

import {
  modelPricingEntryForModel,
  officialModelPricingCatalog,
  officialModelPricingUpdatedAt,
  type ModelPricingEntry
} from "../modelPricing/officialModelPricingCatalog.js";
import type { DatabaseHandle } from "./db/client.js";

export interface ActiveModelPricingCatalog {
  id?: string;
  version: string;
  source: "built_in" | "database";
  catalog: ModelPricingEntry[];
  publishedAt?: string;
}

export interface ModelPricingCatalogDraft {
  id: string;
  baseVersionId?: string;
  version: string;
  catalog: ModelPricingEntry[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelPricingCatalogDiff {
  added: ModelPricingEntry[];
  removed: ModelPricingEntry[];
  changed: Array<{
    model: string;
    before: ModelPricingEntry;
    after: ModelPricingEntry;
    changedFields: string[];
  }>;
}

export interface SaveDraftInput {
  version: string;
  catalog: readonly ModelPricingEntry[];
  createdBy?: string;
}

export interface PublishDraftInput {
  draftId: string;
  publishedBy?: string;
}

interface CatalogVersionRow {
  id: string;
  version: string;
  catalog_json: string;
  published_at: string;
}

interface CatalogDraftRow {
  id: string;
  base_version_id: string | null;
  version: string;
  catalog_json: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export class ModelPricingCatalogStore {
  private readonly handle: DatabaseHandle;
  private readonly now: () => Date;

  constructor(input: { handle: DatabaseHandle; now?: () => Date }) {
    this.handle = input.handle;
    this.now = input.now ?? (() => new Date());
  }

  getActiveCatalog(): ActiveModelPricingCatalog {
    const row = this.handle.sqlite.prepare(`
      SELECT id, version, catalog_json, published_at
      FROM model_pricing_catalog_versions
      WHERE status = 'published'
      ORDER BY published_at DESC, rowid DESC
      LIMIT 1
    `).get() as CatalogVersionRow | undefined;
    if (!row) {
      return {
        version: officialModelPricingUpdatedAt,
        source: "built_in",
        catalog: cloneCatalog(officialModelPricingCatalog)
      };
    }
    return {
      id: row.id,
      version: row.version,
      source: "database",
      catalog: parseCatalog(row.catalog_json),
      publishedAt: row.published_at
    };
  }

  getEntryForModel(model: string | undefined): ModelPricingEntry | undefined {
    const normalized = normalizeModel(model);
    if (!normalized) {
      return undefined;
    }
    return this.getActiveCatalog().catalog.find((entry) => modelMatches(entry, normalized))
      ?? modelPricingEntryForModel(model);
  }

  getDraft(draftId: string): ModelPricingCatalogDraft | undefined {
    const row = this.findDraftRow(draftId);
    return row ? draftFromRow(row) : undefined;
  }

  saveDraft(input: SaveDraftInput): ModelPricingCatalogDraft {
    const catalog = cloneCatalog(input.catalog);
    validateCatalog(catalog);
    const now = this.now().toISOString();
    const active = this.getActiveCatalog();
    const existingDraft = this.handle.sqlite.prepare(`
      SELECT id, created_at
      FROM model_pricing_catalog_drafts
      WHERE version = ?
      ORDER BY updated_at DESC, rowid DESC
      LIMIT 1
    `).get(input.version.trim()) as { id: string; created_at: string } | undefined;

    if (existingDraft) {
      this.handle.sqlite.prepare(`
        UPDATE model_pricing_catalog_drafts
        SET base_version_id = @baseVersionId,
          catalog_json = @catalogJson,
          created_by = @createdBy,
          updated_at = @updatedAt
        WHERE id = @id
      `).run({
        id: existingDraft.id,
        baseVersionId: active.id ?? null,
        catalogJson: JSON.stringify(catalog),
        createdBy: input.createdBy ?? null,
        updatedAt: now
      });
      return {
        id: existingDraft.id,
        baseVersionId: active.id,
        version: input.version.trim(),
        catalog,
        createdBy: input.createdBy,
        createdAt: existingDraft.created_at,
        updatedAt: now
      };
    }

    const id = `model-pricing-draft-${randomUUID()}`;
    this.handle.sqlite.prepare(`
      INSERT INTO model_pricing_catalog_drafts (
        id, base_version_id, version, catalog_json, created_by, created_at, updated_at
      ) VALUES (
        @id, @baseVersionId, @version, @catalogJson, @createdBy, @createdAt, @updatedAt
      )
    `).run({
      id,
      baseVersionId: active.id ?? null,
      version: input.version.trim(),
      catalogJson: JSON.stringify(catalog),
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now
    });
    return {
      id,
      baseVersionId: active.id,
      version: input.version.trim(),
      catalog,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now
    };
  }

  diffDraft(draftId: string): ModelPricingCatalogDiff {
    const draft = this.getDraft(draftId);
    if (!draft) {
      throw new Error("模型价格草稿不存在。");
    }
    return diffCatalogs(this.getActiveCatalog().catalog, draft.catalog);
  }

  publishDraft(input: PublishDraftInput): ActiveModelPricingCatalog {
    const draft = this.getDraft(input.draftId);
    if (!draft) {
      throw new Error("模型价格草稿不存在。");
    }
    validateCatalog(draft.catalog);
    const now = this.now().toISOString();
    const versionId = `model-pricing-version-${randomUUID()}`;
    const publish = this.handle.sqlite.transaction(() => {
      this.handle.sqlite.prepare(`
        UPDATE model_pricing_catalog_versions
        SET status = 'archived'
        WHERE status = 'published'
      `).run();
      this.handle.sqlite.prepare(`
        INSERT INTO model_pricing_catalog_versions (
          id, version, status, catalog_json, source, created_by, created_at, published_at
        ) VALUES (
          @id, @version, 'published', @catalogJson, 'admin', @createdBy, @createdAt, @publishedAt
        )
      `).run({
        id: versionId,
        version: draft.version,
        catalogJson: JSON.stringify(draft.catalog),
        createdBy: input.publishedBy ?? draft.createdBy ?? null,
        createdAt: now,
        publishedAt: now
      });
      this.handle.sqlite.prepare("DELETE FROM model_pricing_catalog_drafts WHERE id = ?").run(draft.id);
    });
    publish();
    return {
      id: versionId,
      version: draft.version,
      source: "database",
      catalog: draft.catalog,
      publishedAt: now
    };
  }

  private findDraftRow(draftId: string): CatalogDraftRow | undefined {
    return this.handle.sqlite.prepare(`
      SELECT id, base_version_id, version, catalog_json, created_by, created_at, updated_at
      FROM model_pricing_catalog_drafts
      WHERE id = ?
    `).get(draftId) as CatalogDraftRow | undefined;
  }
}

export function validateCatalog(catalog: readonly ModelPricingEntry[]): void {
  if (catalog.length === 0) {
    throw new Error("模型价格目录不能为空。");
  }
  const models = new Set<string>();
  for (const entry of catalog) {
    if (!entry.providerId || !entry.model || !entry.kind || !entry.resourceKey || !entry.sourceUrl) {
      throw new Error("模型价格目录缺少必要字段。");
    }
    const normalized = normalizeModel(entry.model);
    if (!normalized) {
      throw new Error("模型价格目录缺少必要字段。");
    }
    if (models.has(normalized)) {
      throw new Error("模型价格目录包含重复模型。");
    }
    models.add(normalized);
    const numericPrices = collectEntryPrices(entry);
    if (numericPrices.some((value) => !Number.isFinite(value) || value < 0)) {
      throw new Error("模型价格目录包含无效价格。");
    }
  }
}

function diffCatalogs(before: readonly ModelPricingEntry[], after: readonly ModelPricingEntry[]): ModelPricingCatalogDiff {
  const beforeByModel = new Map(before.map((entry) => [entry.model, entry]));
  const afterByModel = new Map(after.map((entry) => [entry.model, entry]));
  const added = after.filter((entry) => !beforeByModel.has(entry.model));
  const removed = before.filter((entry) => !afterByModel.has(entry.model));
  const changed = after.flatMap((entry) => {
    const previous = beforeByModel.get(entry.model);
    if (!previous) {
      return [];
    }
    const changedFields = changedEntryFields(previous, entry);
    return changedFields.length > 0
      ? [{
          model: entry.model,
          before: previous,
          after: entry,
          changedFields
        }]
      : [];
  });
  return { added, removed, changed };
}

function changedEntryFields(before: ModelPricingEntry, after: ModelPricingEntry): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => {
    const beforeValue = before[key as keyof ModelPricingEntry];
    const afterValue = after[key as keyof ModelPricingEntry];
    return JSON.stringify(beforeValue) !== JSON.stringify(afterValue);
  }).sort();
}

function draftFromRow(row: CatalogDraftRow): ModelPricingCatalogDraft {
  return {
    id: row.id,
    baseVersionId: row.base_version_id ?? undefined,
    version: row.version,
    catalog: parseCatalog(row.catalog_json),
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseCatalog(raw: string): ModelPricingEntry[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("模型价格目录格式无效。");
  }
  return cloneCatalog(parsed as readonly ModelPricingEntry[]);
}

function cloneCatalog(catalog: readonly ModelPricingEntry[]): ModelPricingEntry[] {
  return JSON.parse(JSON.stringify(catalog)) as ModelPricingEntry[];
}

function collectEntryPrices(entry: ModelPricingEntry): number[] {
  return [
    entry.inputPriceCnyPerMillion,
    entry.outputPriceCnyPerMillion,
    entry.cachedInputPriceCnyPerMillion,
    entry.fallbackPriceCnyPerCall,
    entry.imagePriceCnyPerImage,
    entry.videoTokenPriceCnyPerMillion,
    ...Object.values(entry.videoTokenPriceCnyPerMillionByResolution ?? {}),
    ...settlementPrices(entry)
  ].filter((value): value is number => value !== undefined);
}

function settlementPrices(entry: ModelPricingEntry): number[] {
  const settlement = entry.settlement;
  if (!settlement) {
    return [];
  }
  if (settlement.kind === "text") {
    return [
      settlement.inputPriceCnyPerMillion,
      settlement.outputPriceCnyPerMillion,
      settlement.cachedInputPriceCnyPerMillion,
      settlement.fallbackPriceCnyPerCall
    ].filter((value): value is number => value !== undefined);
  }
  if (settlement.kind === "image") {
    return [
      settlement.imagePriceCnyPerImage,
      settlement.inputPriceCnyPerMillion,
      settlement.outputPriceCnyPerMillion,
      settlement.cachedInputPriceCnyPerMillion
    ].filter((value): value is number => value !== undefined);
  }
  return [
    settlement.videoTokenPriceCnyPerMillion,
    ...Object.values(settlement.videoTokenPriceCnyPerMillionByResolution ?? {})
  ].filter((value): value is number => value !== undefined);
}

function modelMatches(entry: ModelPricingEntry, normalized: string): boolean {
  return normalizeModel(entry.model) === normalized
    || Boolean(entry.aliases?.some((alias) => normalizeModel(alias) === normalized));
}

function normalizeModel(model: string | undefined): string | undefined {
  const normalized = model?.trim().toLowerCase();
  return normalized || undefined;
}
