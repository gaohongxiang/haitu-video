import { describe, expect, it } from "vitest";

import {
  defaultModelConfigPreset,
  draftFromProviderConfig,
  groupConfiguredModelServices,
  resetModelConfigDraft,
  selectedModelIdsForModelConfigDialog,
  syncModelConfigDraftsFromLedger,
  type ProviderConfigItem
} from "../../src/client/components/modelServiceConfig.js";
import { catalogEntriesForProvider } from "../../src/providers/modelCatalog.js";

describe("model service config drafts", () => {
  it("starts new service drafts with all built-in vendor models selected", () => {
    const draft = resetModelConfigDraft("volcengine-seedance");

    expect(draft.models).toEqual(
      catalogEntriesForProvider("volcengine-seedance").map((entry) => entry.modelId)
    );
  });

  it("keeps existing multi-model services selected while editing", () => {
    const fast = providerConfig({
      configId: "video-fast",
      credentialId: "credential-1",
      model: "doubao-seedance-2-0-fast-260128"
    });
    const quality = providerConfig({
      configId: "video-quality",
      credentialId: "credential-1",
      model: "doubao-seedance-2-0-260128"
    });

    expect(draftFromProviderConfig("volcengine-seedance", fast, [fast, quality]).models).toEqual([
      "doubao-seedance-2-0-fast-260128",
      "doubao-seedance-2-0-260128"
    ]);
    expect(defaultModelConfigPreset("volcengine-seedance").models).toEqual(
      catalogEntriesForProvider("volcengine-seedance").map((entry) => entry.modelId)
    );
  });

  it("groups multiple model versions from one credential into one service row", () => {
    const fast = providerConfig({
      configId: "video-fast",
      credentialId: "credential-1",
      model: "doubao-seedance-2-0-fast-260128"
    });
    const quality = providerConfig({
      configId: "video-quality",
      credentialId: "credential-1",
      model: "doubao-seedance-2-0-260128"
    });

    const services = groupConfiguredModelServices("volcengine-seedance", [fast, quality]);

    expect(services).toHaveLength(1);
    expect(services[0]?.models.map((model) => model.model)).toEqual([
      "doubao-seedance-2-0-fast-260128",
      "doubao-seedance-2-0-260128"
    ]);
  });

  it("groups legacy split credentials from the same provider and base url into one service row", () => {
    const fast = providerConfig({
      configId: "video-fast",
      credentialId: "legacy-credential-fast",
      model: "doubao-seedance-2-0-fast-260128",
      providerLabel: "volcengine",
      baseUrl: "https://ark.cn-beijing.volces.com"
    });
    const quality = providerConfig({
      configId: "video-quality",
      credentialId: "legacy-credential-quality",
      model: "doubao-seedance-2-0-260128",
      providerLabel: "volcengine",
      baseUrl: "https://ark.cn-beijing.volces.com"
    });

    const services = groupConfiguredModelServices("volcengine-seedance", [fast, quality]);

    expect(services).toHaveLength(1);
    expect(services[0]?.models.map((model) => model.model)).toEqual([
      "doubao-seedance-2-0-fast-260128",
      "doubao-seedance-2-0-260128"
    ]);
  });

  it("groups admin platform variants by vendor and base url even when labels differ", () => {
    const fast: ProviderConfigItem & { vendor?: string } = {
      ...providerConfig({
        configId: "video-fast",
        credentialId: "legacy-credential-fast",
        label: "Seedance Fast",
        providerLabel: undefined,
        model: "doubao-seedance-2-0-fast-260128",
        baseUrl: "https://ark.cn-beijing.volces.com"
      }),
      vendor: "volcengine"
    };
    const quality: ProviderConfigItem & { vendor?: string } = {
      ...providerConfig({
        configId: "video-quality",
        credentialId: "legacy-credential-quality",
        label: "Seedance Quality",
        providerLabel: undefined,
        model: "doubao-seedance-2-0-260128",
        baseUrl: "https://ark.cn-beijing.volces.com"
      }),
      vendor: "volcengine"
    };

    const services = groupConfiguredModelServices("volcengine-seedance", [fast, quality]);

    expect(services).toHaveLength(1);
    expect(services[0]?.serviceLabel).toBe("volcengine");
    expect(services[0]?.models.map((model) => model.model)).toEqual([
      "doubao-seedance-2-0-fast-260128",
      "doubao-seedance-2-0-260128"
    ]);
  });

  it("keeps every model selected when editing a legacy split service group", () => {
    const fast = providerConfig({
      configId: "video-fast",
      credentialId: "legacy-credential-fast",
      model: "doubao-seedance-2-0-fast-260128"
    });
    const quality = providerConfig({
      configId: "video-quality",
      credentialId: "legacy-credential-quality",
      model: "doubao-seedance-2-0-260128"
    });
    const service = groupConfiguredModelServices("volcengine-seedance", [fast, quality])[0]!;

    expect(draftFromProviderConfig("volcengine-seedance", service, [fast, quality]).models).toEqual([
      "doubao-seedance-2-0-fast-260128",
      "doubao-seedance-2-0-260128"
    ]);
  });

  it("does not shrink new service drafts to the first configured model when syncing the ledger", () => {
    const current = {
      "openai-compatible-text": resetModelConfigDraft("openai-compatible-text"),
      "openai-compatible-image": resetModelConfigDraft("openai-compatible-image"),
      "volcengine-seedance": resetModelConfigDraft("volcengine-seedance")
    };
    const next = syncModelConfigDraftsFromLedger({
      textModels: [],
      imageModels: [],
      videoModels: [
        providerConfig({
          configId: "video-fast",
          credentialId: "credential-1",
          model: "doubao-seedance-2-0-fast-260128"
        })
      ],
      providers: []
    }, current);

    expect(next["volcengine-seedance"].models).toEqual(
      catalogEntriesForProvider("volcengine-seedance").map((entry) => entry.modelId)
    );
  });

  it("shows every catalog model as selected for a new service even when the draft is stale", () => {
    const staleDraft = {
      ...resetModelConfigDraft("volcengine-seedance"),
      models: ["doubao-seedance-2-0-fast-260128"]
    };

    expect(selectedModelIdsForModelConfigDialog("volcengine-seedance", staleDraft, false)).toEqual(
      catalogEntriesForProvider("volcengine-seedance").map((entry) => entry.modelId)
    );
    expect(selectedModelIdsForModelConfigDialog("volcengine-seedance", staleDraft, true)).toEqual([
      "doubao-seedance-2-0-fast-260128"
    ]);
  });
});

function providerConfig(input: Partial<ProviderConfigItem> & Pick<ProviderConfigItem, "configId" | "credentialId" | "model">): ProviderConfigItem {
  return {
    id: "volcengine-seedance",
    label: "Seedance",
    providerLabel: "volcengine",
    configured: true,
    baseUrl: "https://ark.cn-beijing.volces.com",
    capabilities: ["视频生成"],
    modelKind: "video",
    enabled: true,
    ...input
  };
}
