import { KeyRound } from "lucide-react";
import { FormEvent, ReactNode, useState } from "react";

import { i18n } from "../../i18n/client.js";
import {
  ownerModelsForGroup,
  type ModelServicePreference
} from "../modelServiceSelection.js";
import { cn } from "../lib/utils.js";
import { Badge } from "./ui/badge.js";
import { Card, CardHeader } from "./ui/card.js";
import {
  draftFromProviderConfig,
  modelConfigPresets,
  resetModelConfigDraft,
  SharedModelConfigDialog,
  SharedModelServiceGroup,
  type ModelConfigDraft,
  type ModelConfigProviderId,
  type ModelConfigTestStatus,
  type ModelServiceGroup,
  type ProviderConfigServiceItem,
  type ProviderConfigItem,
  type ProviderConfigLedger
} from "./modelServiceConfig.js";

const tSettings = (key: string, options?: Record<string, unknown>) => i18n.t(`app:settings.${key}`, options);

function PanelTitle({ children, icon, right }: { children: ReactNode; icon?: ReactNode; right?: ReactNode }) {
  return <CardHeader heading={children} icon={icon} right={right} />;
}

export function ApiModelConfigPanel({
  config,
  servicePreference,
  drafts,
  testStatuses,
  onDraftChange,
  onApplyPreset,
  onSave,
  onTest,
  onRefreshModels,
  onRevealApiKey,
  onClear,
  onToggleEnabled,
  onServicePreferenceChange,
  isBusy
}: {
  config: ProviderConfigLedger;
  servicePreference: ModelServicePreference;
  drafts: Record<ModelConfigProviderId, ModelConfigDraft>;
  testStatuses: Partial<Record<ModelConfigProviderId, ModelConfigTestStatus>>;
  onDraftChange: (providerId: ModelConfigProviderId, patch: Partial<ModelConfigDraft>) => void;
  onApplyPreset: (providerId: ModelConfigProviderId, preset: ModelConfigDraft) => void;
  onSave: (providerId: ModelConfigProviderId, event: FormEvent<HTMLFormElement>) => Promise<void>;
  onTest: (providerId: ModelConfigProviderId) => Promise<void>;
  onRefreshModels: (providerId: ModelConfigProviderId) => Promise<void>;
  onRevealApiKey: (providerId: ModelConfigProviderId, configId: string) => Promise<string>;
  onClear: (providerId: ModelConfigProviderId, configIds?: string[]) => Promise<void>;
  onToggleEnabled: (providerId: ModelConfigProviderId, service: ProviderConfigServiceItem, enabled: boolean) => Promise<void>;
  onServicePreferenceChange: (patch: Partial<ModelServicePreference>) => Promise<void>;
  isBusy: boolean;
}) {
  const [editingProviderId, setEditingProviderId] = useState<ModelConfigProviderId | undefined>();
  const groups: ModelServiceGroup[] = [
    {
      kind: "text" as const,
      title: tSettings("groups.text.title"),
      description: tSettings("groups.text.description"),
      models: config.textModels,
      providerId: "openai-compatible-text" as const,
      badge: tSettings("groups.text.badge")
    },
    {
      kind: "image" as const,
      title: tSettings("groups.image.title"),
      description: tSettings("groups.image.description"),
      models: config.imageModels,
      providerId: "openai-compatible-image" as const,
      badge: tSettings("groups.image.badge")
    },
    {
      kind: "video" as const,
      title: tSettings("groups.video.title"),
      description: tSettings("groups.video.description"),
      models: config.videoModels,
      providerId: "volcengine-seedance" as const,
      badge: tSettings("groups.video.badge")
    }
  ];
  const editingGroup = groups.find((group) => group.providerId === editingProviderId);
  const allModels = [...config.textModels, ...config.imageModels, ...config.videoModels];
  const configuredCount = allModels.filter((model) => model.configured).length;
  const activeMode = servicePreference.serviceMode;
  return (
    <Card id="API Key" className="grid gap-4 bg-[var(--card)]">
      <PanelTitle icon={<KeyRound size={16} />} right={<Badge>{tSettings("configuredCount", { count: configuredCount })}</Badge>}>
        {tSettings("title")}
      </PanelTitle>
      <ApiServiceModeCards
        serviceMode={activeMode}
        platformReady={allModels.some((model) => model.apiOwner === "platform" && model.configured)}
        byokReady={allModels.some((model) => model.apiOwner !== "platform" && model.configured)}
        onServiceModeChange={(serviceMode) => void onServicePreferenceChange({ serviceMode })}
        isBusy={isBusy}
      />
      <ModelServiceOwnerPanel
        apiOwner={activeMode}
        groups={groups}
        canManageServices={activeMode === "byok"}
        drafts={drafts}
        onDraftChange={onDraftChange}
        onApplyPreset={onApplyPreset}
        onClear={onClear}
        onToggleEnabled={onToggleEnabled}
        onAdd={(providerId) => {
          onDraftChange(providerId, resetModelConfigDraft(providerId));
          setEditingProviderId(providerId);
        }}
        onEdit={(providerId, model, models) => {
          onDraftChange(providerId, draftFromProviderConfig(providerId, model, models));
          setEditingProviderId(providerId);
        }}
        isBusy={isBusy}
      />
      {editingGroup ? (
        <SharedModelConfigDialog
          title={tSettings("serviceDialog.addTitle", { badge: editingGroup.badge })}
          editTitle={tSettings("serviceDialog.editTitle", { badge: editingGroup.badge })}
          badge={editingGroup.badge}
          providerId={editingGroup.providerId}
          draft={drafts[editingGroup.providerId]}
          testStatus={testStatuses[editingGroup.providerId]}
          presets={modelConfigPresets[editingGroup.providerId]}
          onDraftChange={onDraftChange}
          onApplyPreset={onApplyPreset}
          onClose={() => setEditingProviderId(undefined)}
          onTest={onTest}
          onRefreshModels={onRefreshModels}
          onRevealApiKey={onRevealApiKey}
          onSave={async (providerId, event) => {
            await onSave(providerId, event);
            setEditingProviderId(undefined);
          }}
          isBusy={isBusy}
        />
      ) : null}
    </Card>
  );
}

function ApiServiceModeCards({
  serviceMode,
  platformReady,
  byokReady,
  onServiceModeChange,
  isBusy
}: {
  serviceMode: ModelServicePreference["serviceMode"];
  platformReady: boolean;
  byokReady: boolean;
  onServiceModeChange: (serviceMode: ModelServicePreference["serviceMode"]) => void;
  isBusy: boolean;
}) {
  const modes = [
    {
      id: "platform" as const,
      title: tSettings("serviceMode.platform.title"),
      subtitle: tSettings("serviceMode.platform.subtitle"),
      badge: tSettings("serviceMode.platform.badge"),
      ready: platformReady
    },
    {
      id: "byok" as const,
      title: tSettings("serviceMode.byok.title"),
      subtitle: tSettings("serviceMode.byok.subtitle"),
      badge: tSettings("serviceMode.byok.badge"),
      ready: byokReady
    }
  ];
  return (
    <section className="grid gap-2" aria-label={tSettings("serviceMode.label")}>
      <div className="text-[12px] font-black text-[var(--muted)]">{tSettings("serviceMode.label")}</div>
      <div className="grid gap-2 md:grid-cols-2">
        {modes.map((mode) => {
          const active = serviceMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              aria-disabled={isBusy ? "true" : undefined}
              className={cn(
                "grid min-h-[118px] gap-2 rounded-lg border p-4 text-left transition",
                active
                  ? "border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--card))] shadow-[0_12px_26px_rgba(96,64,43,.10)]"
                  : "border-[var(--border)] bg-[var(--card2)] hover:border-[var(--border-strong)]",
                isBusy && "opacity-80"
              )}
              onClick={() => onServiceModeChange(mode.id)}
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[16px] font-black text-[var(--text)]">{mode.title}</span>
                <Badge tone={active ? "ok" : "neutral"}>{active ? tSettings("serviceMode.current") : mode.ready ? tSettings("serviceMode.ready") : tSettings("serviceMode.pending")}</Badge>
              </span>
              <span className="text-[12px] font-semibold leading-5 text-[var(--muted)]">{mode.subtitle}</span>
              <span className="text-[11px] font-black text-[var(--accent)]">{mode.badge}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ModelServiceOwnerPanel({
  apiOwner,
  groups,
  canManageServices,
  onClear,
  onToggleEnabled,
  onAdd,
  onEdit,
  isBusy
}: {
  apiOwner: ModelServicePreference["serviceMode"];
  groups: ModelServiceGroup[];
  canManageServices: boolean;
  drafts: Record<ModelConfigProviderId, ModelConfigDraft>;
  onDraftChange: (providerId: ModelConfigProviderId, patch: Partial<ModelConfigDraft>) => void;
  onApplyPreset: (providerId: ModelConfigProviderId, preset: ModelConfigDraft) => void;
  onClear: (providerId: ModelConfigProviderId, configIds?: string[]) => Promise<void>;
  onToggleEnabled: (providerId: ModelConfigProviderId, service: ProviderConfigServiceItem, enabled: boolean) => Promise<void>;
  onAdd: (providerId: ModelConfigProviderId) => void;
  onEdit: (providerId: ModelConfigProviderId, model: ProviderConfigItem, models: ProviderConfigItem[]) => void;
  isBusy: boolean;
}) {
  const ownerGroups = groups.map((group) => ({
    ...group,
    models: ownerModelsForGroup(group.models, apiOwner)
  }));
  return (
    <section className="grid gap-3">
      {ownerGroups.map((group) => (
        <SharedModelServiceGroup
          key={group.providerId}
          title={group.title}
          badge={group.badge}
          description={group.description}
          providerId={group.providerId}
          models={group.models}
          apiOwner={apiOwner}
          keyBadgeLabel={apiOwner === "platform" ? tSettings("serviceMode.platform.badge") : tSettings("byokKey")}
          onClear={canManageServices ? onClear : undefined}
          onAdd={canManageServices ? () => onAdd(group.providerId) : undefined}
          onEdit={canManageServices ? (model) => onEdit(group.providerId, model, group.models) : undefined}
          onToggleEnabled={canManageServices ? onToggleEnabled : undefined}
          canManageServices={canManageServices}
          isBusy={isBusy}
        />
      ))}
    </section>
  );
}
