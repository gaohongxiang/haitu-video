import { KeyRound, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useState } from "react";

import {
  bundleIdForPreference,
  bundleModelLabel,
  byokConfiguredModels,
  isCompleteModelBundle,
  isPlatformPresetBundle,
  nextModelBundleLabel,
  ownerModelsForGroup,
  platformConfiguredModels,
  sortByokModelBundlesForDisplay,
  sortPlatformModelBundlesForDisplay,
  type ModelBundleItem,
  type ModelBundleSaveInput,
  type ModelServicePreference
} from "../modelServiceBundles.js";
import { cn } from "../lib/utils.js";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";
import { Card, CardHeader } from "./ui/card.js";
import { Input } from "./ui/field.js";
import { CompactChoiceDropdown } from "./compactChoiceDropdown.js";
import {
  draftFromProviderConfig,
  modelConfigPresets,
  resetModelConfigDraft,
  EnabledSwitchButton,
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

const bundleTitleInputClass = "h-7 min-h-0 min-w-0 border-0 bg-transparent p-0 text-[14px] font-black text-[var(--text)] shadow-none outline-none focus-visible:ring-0";
const bundleGridClass = "grid gap-2 min-[760px]:grid-cols-2 min-[1180px]:grid-cols-3";
const bundleCardClass = "byok-bundle-card flex min-h-[190px] flex-col gap-3 rounded-lg border bg-[var(--card2)] p-3";
const bundleHeaderClass = "flex h-8 min-w-0 items-center justify-between gap-2";
const bundleModelRowsClass = "grid min-w-0 content-start gap-2";
const bundleModelRowClass = "grid min-h-11 min-w-0 grid-cols-[44px_minmax(0,1fr)] items-center gap-2 rounded-[13px] border border-[var(--border-strong)] bg-[var(--field)] px-3 text-[13px] shadow-[0_8px_18px_rgba(96,64,43,.05)]";
type BundleModelSelectionDraft = Partial<Pick<ModelBundleItem, "textModelConfigId" | "imageModelConfigId" | "videoModelConfigId">>;

function bundleTitleInputWidth(value: string) {
  const visualWidth = Array.from(value || "组合").reduce((total, char) => total + (char.charCodeAt(0) > 127 ? 2 : 1), 0);
  return `${Math.min(Math.max(visualWidth + 1, 6), 20)}ch`;
}

function isCompleteBundleDraft(draft: BundleModelSelectionDraft): boolean {
  return Boolean(draft.textModelConfigId && draft.imageModelConfigId && draft.videoModelConfigId);
}

function hasAnyBundleDraftModel(draft: BundleModelSelectionDraft): boolean {
  return Boolean(draft.textModelConfigId || draft.imageModelConfigId || draft.videoModelConfigId);
}

function PanelTitle({ children, icon, right }: { children: ReactNode; icon?: ReactNode; right?: ReactNode }) {
  return <CardHeader heading={children} icon={icon} right={right} />;
}

export function ApiModelConfigPanel({
  config,
  modelBundles,
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
  onApplyBundleSelection,
  onSaveBundle,
  onDeleteBundle,
  isBusy
}: {
  config: ProviderConfigLedger;
  modelBundles: ModelBundleItem[];
  servicePreference: ModelServicePreference;
  drafts: Record<ModelConfigProviderId, ModelConfigDraft>;
  testStatuses: Partial<Record<ModelConfigProviderId, ModelConfigTestStatus>>;
  onDraftChange: (providerId: ModelConfigProviderId, patch: Partial<ModelConfigDraft>) => void;
  onApplyPreset: (providerId: ModelConfigProviderId, preset: ModelConfigDraft) => void;
  onSave: (providerId: ModelConfigProviderId, event: FormEvent<HTMLFormElement>) => Promise<void>;
  onTest: (providerId: ModelConfigProviderId) => Promise<void>;
  onRefreshModels: (providerId: ModelConfigProviderId) => Promise<void>;
  onRevealApiKey: (providerId: ModelConfigProviderId, configId: string) => Promise<string>;
  onClear: (providerId: ModelConfigProviderId, configId?: string) => Promise<void>;
  onToggleEnabled: (providerId: ModelConfigProviderId, service: ProviderConfigServiceItem, enabled: boolean) => Promise<void>;
  onServicePreferenceChange: (patch: Partial<ModelServicePreference>) => Promise<void>;
  onApplyBundleSelection: (bundle: ModelBundleItem) => void;
  onSaveBundle: (bundle: ModelBundleSaveInput) => Promise<ModelBundleItem | undefined>;
  onDeleteBundle: (bundleId: string) => Promise<void>;
  isBusy: boolean;
}) {
  const [editingProviderId, setEditingProviderId] = useState<ModelConfigProviderId | undefined>();
  const groups: ModelServiceGroup[] = [
    {
      kind: "text" as const,
      title: "文本模型",
      description: "商品整理、脚本分镜等文字推理能力。",
      models: config.textModels,
      providerId: "openai-compatible-text" as const,
      badge: "文本"
    },
    {
      kind: "image" as const,
      title: "图片模型",
      description: "商品图和参考图能力。",
      models: config.imageModels,
      providerId: "openai-compatible-image" as const,
      badge: "图片"
    },
    {
      kind: "video" as const,
      title: "视频模型",
      description: "最终成片生成能力。",
      models: config.videoModels,
      providerId: "volcengine-seedance" as const,
      badge: "视频"
    }
  ];
  const editingGroup = groups.find((group) => group.providerId === editingProviderId);
  const allModels = [...config.textModels, ...config.imageModels, ...config.videoModels];
  const configuredCount = allModels.filter((model) => model.configured).length;
  const platformBundles = modelBundles.filter((bundle) => bundle.apiOwner === "platform");
  const byokBundles = modelBundles.filter((bundle) => bundle.apiOwner === "byok");
  const platformBundleIdForMode = bundleIdForPreference(platformBundles, servicePreference.platformBundleId) ?? "";
  const byokBundleIdForMode = bundleIdForPreference(byokBundles, servicePreference.byokBundleId) ?? "";
  const activeMode = servicePreference.serviceMode;
  return (
    <Card id="API Key" className="grid gap-4 bg-[var(--card)]">
      <PanelTitle icon={<KeyRound size={16} />} right={<Badge>{configuredCount} 条模型服务</Badge>}>
        模型服务设置
      </PanelTitle>
      <ApiServiceModeCards
        serviceMode={activeMode}
        platformReady={platformBundles.length > 0 || allModels.some((model) => model.apiOwner === "platform" && model.configured)}
        byokReady={byokBundles.length > 0 || allModels.some((model) => model.apiOwner !== "platform" && model.configured)}
        onServiceModeChange={(serviceMode) => void onServicePreferenceChange(
          serviceMode === "platform"
            ? { serviceMode, platformBundleId: platformBundleIdForMode }
            : { serviceMode, byokBundleId: byokBundleIdForMode }
        )}
        isBusy={isBusy}
      />
      <ModelServiceOwnerPanel
        apiOwner={activeMode}
        bundles={activeMode === "platform" ? platformBundles : byokBundles}
        config={config}
        groups={groups}
        preference={servicePreference}
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
        onSaveBundle={onSaveBundle}
        onDeleteBundle={onDeleteBundle}
        isBusy={isBusy}
      />
      {editingGroup ? (
        <SharedModelConfigDialog
          title={`添加${editingGroup.badge}服务`}
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
      title: "平台托管 API",
      subtitle: "省心不用配 Key，不用自己申请和维护各家账号；平台已接入官方 API，直接选择文本、图片、视频模型组合。",
      badge: "官方 API 成本 + 平台服务费",
      ready: platformReady
    },
    {
      id: "byok" as const,
      title: "自带 API",
      subtitle: "需要去各模型服务商申请并配置 API Key，调用费由你的 API 账号结算，平台仅收服务费。",
      badge: "平台服务费",
      ready: byokReady
    }
  ];
  return (
    <section className="grid gap-2" aria-label="服务模式">
      <div className="text-[12px] font-black text-[var(--muted)]">服务模式</div>
      <div className="grid gap-2 md:grid-cols-2">
        {modes.map((mode) => {
          const active = serviceMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              disabled={isBusy}
              className={cn(
                "grid min-h-[118px] gap-2 rounded-lg border p-4 text-left transition",
                active
                  ? "border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--card))] shadow-[0_12px_26px_rgba(96,64,43,.10)]"
                  : "border-[var(--border)] bg-[var(--card2)] hover:border-[var(--border-strong)]"
              )}
              onClick={() => onServiceModeChange(mode.id)}
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[16px] font-black text-[var(--text)]">{mode.title}</span>
                <Badge tone={active ? "ok" : "neutral"}>{active ? "当前" : mode.ready ? "可用" : "待配置"}</Badge>
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
  bundles,
  config,
  groups,
  preference,
  canManageServices,
  drafts,
  onDraftChange,
  onApplyPreset,
  onClear,
  onToggleEnabled,
  onAdd,
  onEdit,
  onSaveBundle,
  onDeleteBundle,
  isBusy
}: {
  apiOwner: ModelServicePreference["serviceMode"];
  bundles: ModelBundleItem[];
  config: ProviderConfigLedger;
  groups: ModelServiceGroup[];
  preference: ModelServicePreference;
  canManageServices: boolean;
  drafts: Record<ModelConfigProviderId, ModelConfigDraft>;
  onDraftChange: (providerId: ModelConfigProviderId, patch: Partial<ModelConfigDraft>) => void;
  onApplyPreset: (providerId: ModelConfigProviderId, preset: ModelConfigDraft) => void;
  onClear: (providerId: ModelConfigProviderId, configId?: string) => Promise<void>;
  onToggleEnabled: (providerId: ModelConfigProviderId, service: ProviderConfigServiceItem, enabled: boolean) => Promise<void>;
  onAdd: (providerId: ModelConfigProviderId) => void;
  onEdit: (providerId: ModelConfigProviderId, model: ProviderConfigItem, models: ProviderConfigItem[]) => void;
  onSaveBundle: (bundle: ModelBundleSaveInput) => Promise<ModelBundleItem | undefined>;
  onDeleteBundle: (bundleId: string) => Promise<void>;
  isBusy: boolean;
}) {
  const ownerGroups = groups.map((group) => ({
    ...group,
    models: ownerModelsForGroup(group.models, apiOwner)
  }));
  if (apiOwner === "platform") {
    return (
      <ModelBundleSummary
        bundles={bundles}
        config={config}
        preference={preference}
        onSaveBundle={onSaveBundle}
        onDeleteBundle={onDeleteBundle}
        isBusy={isBusy}
      />
    );
  }

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
          apiOwner="byok"
          keyBadgeLabel="自带 Key"
          onClear={canManageServices ? onClear : undefined}
          onAdd={canManageServices ? () => onAdd(group.providerId) : undefined}
          onEdit={canManageServices ? (model) => onEdit(group.providerId, model, group.models) : undefined}
          onToggleEnabled={canManageServices ? onToggleEnabled : undefined}
          canManageServices={canManageServices}
          isBusy={isBusy}
        />
      ))}
      <ByokBundleManager
        bundles={bundles}
        config={config}
        preference={preference}
        onSaveBundle={onSaveBundle}
        onDeleteBundle={onDeleteBundle}
        isBusy={isBusy}
      />
    </section>
  );
}

function ModelBundleSummary({
  bundles,
  config,
  preference,
  onSaveBundle,
  onDeleteBundle,
  isBusy = false
}: {
  bundles: ModelBundleItem[];
  config: ProviderConfigLedger;
  preference: ModelServicePreference;
  onSaveBundle: (bundle: ModelBundleSaveInput) => Promise<ModelBundleItem | undefined>;
  onDeleteBundle: (bundleId: string) => Promise<void>;
  isBusy?: boolean;
}) {
  const allModels = [...config.textModels, ...config.imageModels, ...config.videoModels];
  const presetBundles = sortPlatformModelBundlesForDisplay(bundles.filter(isPlatformPresetBundle));
  const customBundles = sortByokModelBundlesForDisplay(bundles.filter((bundle) => !isPlatformPresetBundle(bundle)));
  return (
    <section className="grid gap-3">
      <div className={bundleGridClass}>
        {presetBundles.length === 0 ? (
          <div className={cn(bundleCardClass, "justify-center border-dashed text-center text-[12px] font-semibold leading-5 text-[var(--muted)]")}>
            暂无可用组合
          </div>
        ) : null}
        {presetBundles.map((bundle) => {
          return (
            <div key={bundle.bundleId} className={cn(bundleCardClass, "border-[var(--border)]")}>
              <BundleCardHeader bundle={bundle} />
              <div className={bundleModelRowsClass}>
                <BundleModelRow kindLabel="文本" modelLabel={bundleModelLabel(allModels, bundle.textModelConfigId)} />
                <BundleModelRow kindLabel="图片" modelLabel={bundleModelLabel(allModels, bundle.imageModelConfigId)} />
                <BundleModelRow kindLabel="视频" modelLabel={bundleModelLabel(allModels, bundle.videoModelConfigId)} />
              </div>
            </div>
          );
        })}
        <PlatformBundleManager
          bundles={customBundles}
          config={config}
          preference={preference}
          onSaveBundle={onSaveBundle}
          onDeleteBundle={onDeleteBundle}
          isBusy={isBusy}
        />
      </div>
    </section>
  );
}

function PlatformBundleManager({
  bundles,
  config,
  preference,
  onSaveBundle,
  onDeleteBundle,
  isBusy = false
}: {
  bundles: ModelBundleItem[];
  config: ProviderConfigLedger;
  preference: ModelServicePreference;
  onSaveBundle: (bundle: ModelBundleSaveInput) => Promise<ModelBundleItem | undefined>;
  onDeleteBundle: (bundleId: string) => Promise<void>;
  isBusy?: boolean;
}) {
  const customTextModels = platformConfiguredModels(config.textModels);
  const customImageModels = platformConfiguredModels(config.imageModels);
  const customVideoModels = platformConfiguredModels(config.videoModels);
  const sortedBundles = sortByokModelBundlesForDisplay(bundles);
  const defaultDraftLabel = nextModelBundleLabel(bundles);
  const [platformBundleDraftLabel, setPlatformBundleDraftLabel] = useState(defaultDraftLabel);
  const [draftLabelEdited, setDraftLabelEdited] = useState(false);
  const [draft, setDraft] = useState<BundleModelSelectionDraft>({});
  const [showDraft, setShowDraft] = useState(false);
  const draftComplete = isCompleteBundleDraft(draft);
  const canCreateBundle = Boolean(platformBundleDraftLabel.trim() && hasAnyBundleDraftModel(draft));
  const canAddBundle = customTextModels.length > 0 || customImageModels.length > 0 || customVideoModels.length > 0;

  useEffect(() => {
    if (!draftLabelEdited) {
      setPlatformBundleDraftLabel(defaultDraftLabel);
    }
  }, [defaultDraftLabel, draftLabelEdited]);

  async function saveNewBundle() {
    if (!canCreateBundle) return;
    const saved = await onSaveBundle({
      bundleId: `platform-custom-bundle-${Date.now()}`,
      apiOwner: "platform",
      label: platformBundleDraftLabel.trim(),
      textModelConfigId: draft.textModelConfigId,
      imageModelConfigId: draft.imageModelConfigId,
      videoModelConfigId: draft.videoModelConfigId,
      enabled: true,
      statusText: "平台自定义组合已保存。"
    });
    if (saved) {
      setPlatformBundleDraftLabel(nextModelBundleLabel([...bundles, saved]));
      setDraftLabelEdited(false);
      setDraft({});
      setShowDraft(false);
    }
  }

  return (
    <>
      {sortedBundles.map((bundle) => (
        <EditableBundleCard
          key={bundle.bundleId}
          bundle={bundle}
          textModels={customTextModels}
          imageModels={customImageModels}
          videoModels={customVideoModels}
          selected={preference.platformBundleId === bundle.bundleId}
          isBusy={isBusy}
          saveStatusText="平台自定义组合已保存。"
          enabledStatusText="平台自定义组合已启用。"
          disabledStatusText="平台自定义组合已停用。"
          onSaveBundle={onSaveBundle}
          onDeleteBundle={onDeleteBundle}
        />
      ))}
      {showDraft ? (
        <BundleDraftCard
          label={platformBundleDraftLabel}
          draft={draft}
          textModels={customTextModels}
          imageModels={customImageModels}
          videoModels={customVideoModels}
          canCreateBundle={canCreateBundle}
          complete={draftComplete}
          isBusy={isBusy}
          onLabelChange={(label) => {
            setPlatformBundleDraftLabel(label);
            setDraftLabelEdited(true);
          }}
          onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          onCancel={() => {
            setShowDraft(false);
            setDraft({});
            setDraftLabelEdited(false);
            setPlatformBundleDraftLabel(defaultDraftLabel);
          }}
          onSave={() => void saveNewBundle()}
        />
      ) : canAddBundle ? (
        <AddBundleCard isBusy={isBusy} onAdd={() => setShowDraft(true)} />
      ) : null}
    </>
  );
}

function ByokBundleManager({
  bundles,
  config,
  preference,
  onSaveBundle,
  onDeleteBundle,
  isBusy = false
}: {
  bundles: ModelBundleItem[];
  config: ProviderConfigLedger;
  preference: ModelServicePreference;
  onSaveBundle: (bundle: ModelBundleSaveInput) => Promise<ModelBundleItem | undefined>;
  onDeleteBundle: (bundleId: string) => Promise<void>;
  isBusy?: boolean;
}) {
  const textModels = byokConfiguredModels(config.textModels);
  const imageModels = byokConfiguredModels(config.imageModels);
  const videoModels = byokConfiguredModels(config.videoModels);
  const sortedBundles = sortByokModelBundlesForDisplay(bundles);
  const defaultDraftLabel = nextModelBundleLabel(bundles);
  const [byokBundleDraftLabel, setByokBundleDraftLabel] = useState(defaultDraftLabel);
  const [draftLabelEdited, setDraftLabelEdited] = useState(false);
  const [draft, setDraft] = useState<BundleModelSelectionDraft>({});
  const [showDraft, setShowDraft] = useState(false);
  const draftComplete = isCompleteBundleDraft(draft);
  const canCreateBundle = Boolean(byokBundleDraftLabel.trim() && hasAnyBundleDraftModel(draft));

  useEffect(() => {
    if (!draftLabelEdited) {
      setByokBundleDraftLabel(defaultDraftLabel);
    }
  }, [defaultDraftLabel, draftLabelEdited]);

  async function saveNewBundle() {
    if (!canCreateBundle) return;
    const saved = await onSaveBundle({
      apiOwner: "byok",
      label: byokBundleDraftLabel.trim(),
      textModelConfigId: draft.textModelConfigId,
      imageModelConfigId: draft.imageModelConfigId,
      videoModelConfigId: draft.videoModelConfigId,
      enabled: true,
      statusText: "自带 API 组合已保存。"
    });
    if (saved) {
      setByokBundleDraftLabel(nextModelBundleLabel([...bundles, saved]));
      setDraftLabelEdited(false);
      setDraft({});
      setShowDraft(false);
    }
  }

  return (
    <section className="grid gap-2">
      <div className={bundleGridClass}>
        {sortedBundles.map((bundle) => (
          <EditableBundleCard
            key={bundle.bundleId}
            bundle={bundle}
            textModels={textModels}
            imageModels={imageModels}
            videoModels={videoModels}
            selected={preference.byokBundleId === bundle.bundleId}
            isBusy={isBusy}
            saveStatusText="自带 API 组合已保存。"
            enabledStatusText="自带 API 组合已启用。"
            disabledStatusText="自带 API 组合已停用。"
            onSaveBundle={onSaveBundle}
            onDeleteBundle={onDeleteBundle}
          />
        ))}
        {showDraft ? (
          <BundleDraftCard
            label={byokBundleDraftLabel}
            draft={draft}
            textModels={textModels}
            imageModels={imageModels}
            videoModels={videoModels}
            canCreateBundle={canCreateBundle}
            complete={draftComplete}
            isBusy={isBusy}
            onLabelChange={(label) => {
              setByokBundleDraftLabel(label);
              setDraftLabelEdited(true);
            }}
            onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
            onCancel={() => {
              setShowDraft(false);
              setDraft({});
              setDraftLabelEdited(false);
              setByokBundleDraftLabel(defaultDraftLabel);
            }}
            onSave={() => void saveNewBundle()}
          />
        ) : (
          <AddBundleCard isBusy={isBusy} onAdd={() => setShowDraft(true)} />
        )}
      </div>
    </section>
  );
}

function EditableBundleCard({
  bundle,
  textModels,
  imageModels,
  videoModels,
  selected,
  isBusy,
  saveStatusText,
  enabledStatusText,
  disabledStatusText,
  onSaveBundle,
  onDeleteBundle
}: {
  bundle: ModelBundleItem;
  textModels: ProviderConfigItem[];
  imageModels: ProviderConfigItem[];
  videoModels: ProviderConfigItem[];
  selected: boolean;
  isBusy?: boolean;
  saveStatusText: string;
  enabledStatusText: string;
  disabledStatusText: string;
  onSaveBundle: (bundle: ModelBundleSaveInput) => Promise<ModelBundleItem | undefined>;
  onDeleteBundle: (bundleId: string) => Promise<void>;
}) {
  const [label, setLabel] = useState(bundle.label);
  const [textModelConfigId, setTextModelConfigId] = useState(bundle.textModelConfigId);
  const [imageModelConfigId, setImageModelConfigId] = useState(bundle.imageModelConfigId);
  const [videoModelConfigId, setVideoModelConfigId] = useState(bundle.videoModelConfigId);
  const complete = Boolean(textModelConfigId && imageModelConfigId && videoModelConfigId);
  const saveCurrentBundle = (enabled = bundle.enabled, statusText = saveStatusText) => onSaveBundle({
    ...bundle,
    label: label.trim(),
    textModelConfigId,
    imageModelConfigId,
    videoModelConfigId,
    enabled,
    statusText,
    activate: false
  });
  const toggleBundleEnabled = () => {
    const nextEnabled = !bundle.enabled;
    return saveCurrentBundle(nextEnabled, nextEnabled ? enabledStatusText : disabledStatusText);
  };

  useEffect(() => {
    setLabel(bundle.label);
    setTextModelConfigId(bundle.textModelConfigId);
    setImageModelConfigId(bundle.imageModelConfigId);
    setVideoModelConfigId(bundle.videoModelConfigId);
  }, [bundle.bundleId, bundle.label, bundle.textModelConfigId, bundle.imageModelConfigId, bundle.videoModelConfigId]);

  return (
    <div className={cn(
      bundleCardClass,
      selected ? "border-[color-mix(in_srgb,var(--accent)_45%,var(--border))]" : "border-[var(--border)]"
    )}>
      <div className={bundleHeaderClass}>
        <BundleTitleActions
          label={label}
          originalLabel={bundle.label}
          isBusy={isBusy}
          canSave={Boolean(label.trim())}
          onLabelChange={setLabel}
          onSave={() => void saveCurrentBundle()}
          onDelete={() => void onDeleteBundle(bundle.bundleId)}
        />
        <BundleStatusToggle
          enabled={bundle.enabled}
          isBusy={isBusy}
          onToggle={() => void toggleBundleEnabled()}
        />
      </div>
      <div className={bundleModelRowsClass}>
        <CustomBundleModelSelect
          label="文本"
          value={textModelConfigId}
          models={textModels}
          disabled={isBusy}
          onChange={setTextModelConfigId}
        />
        <CustomBundleModelSelect
          label="图片"
          value={imageModelConfigId}
          models={imageModels}
          disabled={isBusy}
          onChange={setImageModelConfigId}
        />
        <CustomBundleModelSelect
          label="视频"
          value={videoModelConfigId}
          models={videoModels}
          disabled={isBusy}
          onChange={setVideoModelConfigId}
        />
      </div>
    </div>
  );
}

function BundleTitleActions({
  label,
  originalLabel,
  isBusy,
  canSave,
  onLabelChange,
  onSave,
  onDelete
}: {
  label: string;
  originalLabel: string;
  isBusy?: boolean;
  canSave: boolean;
  onLabelChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <BundleTitleField value={label} onChange={onLabelChange} disabled={isBusy} />
      <Button
        className="h-7 w-7 text-[var(--muted)] hover:bg-[var(--panel2)] hover:text-[var(--text)]"
        size="icon"
        variant="ghost"
        type="button"
        aria-label="保存"
        title="保存"
        disabled={isBusy || !canSave}
        onClick={onSave}
      >
        <Save size={14} />
      </Button>
      <Button
        className="h-7 w-7 text-[var(--muted)] hover:bg-[var(--panel2)] hover:text-[var(--text)]"
        size="icon"
        variant="ghost"
        type="button"
        aria-label={`删除${originalLabel}`}
        title="删除"
        disabled={isBusy}
        onClick={onDelete}
      >
        <Trash2 size={14} />
      </Button>
    </div>
  );
}

function BundleStatusToggle({
  enabled,
  isBusy,
  onToggle
}: {
  enabled: boolean;
  isBusy?: boolean;
  onToggle: () => void;
}) {
  const label = enabled ? "启用" : "停用";
  return (
    <EnabledSwitchButton
      enabled={enabled}
      label={label}
      disabled={isBusy}
      onClick={onToggle}
    />
  );
}

function BundleDraftCard({
  label,
  draft,
  textModels,
  imageModels,
  videoModels,
  canCreateBundle,
  complete,
  isBusy,
  onLabelChange,
  onDraftChange,
  onCancel,
  onSave
}: {
  label: string;
  draft: BundleModelSelectionDraft;
  textModels: ProviderConfigItem[];
  imageModels: ProviderConfigItem[];
  videoModels: ProviderConfigItem[];
  canCreateBundle: boolean;
  complete: boolean;
  isBusy?: boolean;
  onLabelChange: (label: string) => void;
  onDraftChange: (patch: BundleModelSelectionDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className={cn(bundleCardClass, "border-dashed border-[var(--border)]")}>
      <div className={bundleHeaderClass}>
        <BundleTitleField value={label} onChange={onLabelChange} disabled={isBusy} />
        <Badge tone={complete ? "ok" : canCreateBundle ? "warn" : "neutral"}>{complete ? "可启用" : canCreateBundle ? "草稿" : "未完成"}</Badge>
      </div>
      <div className={bundleModelRowsClass}>
        <CustomBundleModelSelect
          label="文本"
          value={draft.textModelConfigId}
          models={textModels}
          disabled={isBusy}
          onChange={(textModelConfigId) => onDraftChange({ textModelConfigId })}
        />
        <CustomBundleModelSelect
          label="图片"
          value={draft.imageModelConfigId}
          models={imageModels}
          disabled={isBusy}
          onChange={(imageModelConfigId) => onDraftChange({ imageModelConfigId })}
        />
        <CustomBundleModelSelect
          label="视频"
          value={draft.videoModelConfigId}
          models={videoModels}
          disabled={isBusy}
          onChange={(videoModelConfigId) => onDraftChange({ videoModelConfigId })}
        />
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-end gap-2">
        <Button className="w-fit" size="sm" variant="ghost" type="button" disabled={isBusy} onClick={onCancel}>
          取消
        </Button>
        <Button className="w-fit" size="sm" type="button" disabled={isBusy || !canCreateBundle} onClick={onSave}>
          <Plus size={13} />
          保存组合
        </Button>
      </div>
    </div>
  );
}

function AddBundleCard({ isBusy, onAdd }: { isBusy?: boolean; onAdd: () => void }) {
  return (
    <button
      className={cn(
        bundleCardClass,
        "items-center justify-center border-dashed border-[var(--border)] text-[13px] font-black text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--panel2)] hover:text-[var(--text)]"
      )}
      type="button"
      disabled={isBusy}
      onClick={onAdd}
    >
      <span className="flex items-center gap-2">
        <Plus size={15} />
        新增组合
      </span>
    </button>
  );
}

function BundleTitleField({
  value,
  onChange,
  disabled
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-w-0 items-center gap-1">
      <Input
        className={bundleTitleInputClass}
        style={{ width: bundleTitleInputWidth(value) }}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
      <span className="grid h-7 w-7 shrink-0 place-items-center text-[var(--muted)]">
        <Pencil size={13} />
      </span>
    </label>
  );
}

function BundleModelRow({ kindLabel, modelLabel }: { kindLabel: string; modelLabel: string }) {
  return (
    <div className={bundleModelRowClass}>
      <span className="font-black text-[var(--muted)]">{kindLabel}</span>
      <span className="min-w-0 truncate font-black text-[var(--text)]">{modelLabel}</span>
    </div>
  );
}

function BundleCardHeader({ bundle }: { bundle: ModelBundleItem }) {
  const complete = isCompleteModelBundle(bundle);
  return (
    <div className={bundleHeaderClass}>
      <div className="min-w-0 truncate text-[14px] font-black text-[var(--text)]">{bundle.label}</div>
      <Badge className="shrink-0" tone={bundle.enabled ? complete ? "ok" : "warn" : "neutral"}>
        {bundle.enabled ? complete ? "启用" : "未完成" : "停用"}
      </Badge>
    </div>
  );
}

function CustomBundleModelSelect({
  label,
  value,
  models,
  disabled,
  onChange
}: {
  label: string;
  value?: string;
  models: ProviderConfigItem[];
  disabled?: boolean;
  onChange: (configId: string) => void;
}) {
  const selectedValue = value && models.some((model) => model.configId === value)
    ? value
    : "";
  const options = ["", ...models.map((model) => model.configId).filter((configId): configId is string => Boolean(configId))];
  return (
    <CompactChoiceDropdown
      label={label}
      value={selectedValue}
      options={options}
      formatOption={(configId) => configId ? bundleModelLabel(models, configId) : "未选择"}
      onChange={onChange}
      disabled={disabled || models.length === 0}
      layout="inline"
    />
  );
}
