import type { ModelPricingEntry } from "../modelPricing/officialModelPricingCatalog.js";
import type {
  ModelPricingCatalogDiff,
  ModelPricingCatalogStore
} from "./modelPricingCatalogStore.js";

export interface AdminModelPricingCatalogEntry extends ModelPricingEntry {
  editable: boolean;
}

export interface AdminModelPricingCatalogResponse {
  active: {
    id?: string;
    version: string;
    source: "built_in" | "database";
    publishedAt?: string;
    entries: AdminModelPricingCatalogEntry[];
  };
}

export interface AdminModelPricingDraftRequest {
  version: string;
  entries: ModelPricingEntry[];
}

export interface AdminModelPricingDraftResponse {
  draft: {
    id: string;
    version: string;
  };
}

export interface AdminModelPricingPublishRequest {
  draftId: string;
}

export interface AdminModelPricingDraftDiffResponse extends ModelPricingCatalogDiff {}

export function buildAdminModelPricingCatalog(input: {
  store: ModelPricingCatalogStore;
}): AdminModelPricingCatalogResponse {
  const active = input.store.getActiveCatalog();
  return {
    active: {
      id: active.id,
      version: active.version,
      source: active.source,
      publishedAt: active.publishedAt,
      entries: active.catalog.map((entry) => ({
        ...entry,
        editable: true
      }))
    }
  };
}

export function saveAdminModelPricingDraft(input: {
  store: ModelPricingCatalogStore;
  adminEmail: string;
  request: AdminModelPricingDraftRequest;
}): AdminModelPricingDraftResponse {
  const draft = input.store.saveDraft({
    version: input.request.version,
    catalog: input.request.entries.map(adminEntryToCatalogEntry),
    createdBy: input.adminEmail
  });
  return {
    draft: {
      id: draft.id,
      version: draft.version
    }
  };
}

function adminEntryToCatalogEntry(entry: ModelPricingEntry & { editable?: boolean }): ModelPricingEntry {
  const { editable: _editable, ...catalogEntry } = entry;
  if (catalogEntry.kind === "image" && catalogEntry.settlement?.kind === "image" && catalogEntry.imagePriceCnyPerImage !== undefined) {
    return {
      ...catalogEntry,
      settlement: {
        ...catalogEntry.settlement,
        imagePriceCnyPerImage: catalogEntry.imagePriceCnyPerImage
      }
    };
  }
  if (catalogEntry.kind === "video" && catalogEntry.settlement?.kind === "video") {
    return {
      ...catalogEntry,
      settlement: {
        ...catalogEntry.settlement,
        videoTokenPriceCnyPerMillion: catalogEntry.videoTokenPriceCnyPerMillion ?? catalogEntry.settlement.videoTokenPriceCnyPerMillion,
        videoTokenPriceCnyPerMillionByResolution: catalogEntry.videoTokenPriceCnyPerMillionByResolution ?? catalogEntry.settlement.videoTokenPriceCnyPerMillionByResolution
      }
    };
  }
  if (catalogEntry.kind === "text" && catalogEntry.settlement?.kind === "text") {
    return {
      ...catalogEntry,
      settlement: {
        ...catalogEntry.settlement,
        inputPriceCnyPerMillion: catalogEntry.inputPriceCnyPerMillion ?? catalogEntry.settlement.inputPriceCnyPerMillion,
        outputPriceCnyPerMillion: catalogEntry.outputPriceCnyPerMillion ?? catalogEntry.settlement.outputPriceCnyPerMillion,
        cachedInputPriceCnyPerMillion: catalogEntry.cachedInputPriceCnyPerMillion ?? catalogEntry.settlement.cachedInputPriceCnyPerMillion,
        fallbackPriceCnyPerCall: catalogEntry.fallbackPriceCnyPerCall ?? catalogEntry.settlement.fallbackPriceCnyPerCall
      }
    };
  }
  return catalogEntry;
}

export function buildAdminModelPricingDraftDiff(input: {
  store: ModelPricingCatalogStore;
  draftId: string;
}): AdminModelPricingDraftDiffResponse {
  return input.store.diffDraft(input.draftId);
}

export function publishAdminModelPricingDraft(input: {
  store: ModelPricingCatalogStore;
  adminEmail: string;
  request: AdminModelPricingPublishRequest;
}): AdminModelPricingCatalogResponse {
  input.store.publishDraft({
    draftId: input.request.draftId,
    publishedBy: input.adminEmail
  });
  return buildAdminModelPricingCatalog({ store: input.store });
}
