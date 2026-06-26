import { Eye, EyeOff, Plus, RefreshCcw } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import {
  catalogEntriesForProvider,
  catalogEntriesForVendor,
  catalogVendorsForProvider,
  defaultCatalogEntryForVendor,
  modelLabelForId,
  type ModelCatalogEntry,
  type ModelProviderId
} from "../../providers/modelCatalog.js";
import { cn } from "../lib/utils.js";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";
import { Field, Input, Select } from "./ui/field.js";

export type ModelConfigProviderId = ModelProviderId;
export type ApiOwner = "platform" | "byok";

export interface ModelConfigDraft {
  configId?: string;
  name: string;
  vendor: string;
  apiKey: string;
  keyPreview?: string;
  baseUrl: string;
  models: string[];
  apiMode?: string;
  enabled: boolean;
}

export interface ProviderConfigItem {
  id: ModelConfigProviderId;
  configId?: string;
  credentialId?: string;
  label: string;
  providerLabel?: string;
  apiOwner?: ApiOwner;
  configured: boolean;
  keySource?: string;
  keyPreview?: string;
  apiKey?: string;
  baseUrl: string;
  model: string;
  apiMode?: string;
  capabilities: string[];
  modelKind: "text" | "image" | "video";
  enabled?: boolean;
  taskScopes?: string[];
  tags?: string[];
}

export type ProviderConfigServiceItem = ProviderConfigItem & {
  serviceLabel: string;
  models: ProviderConfigItem[];
};

export interface ModelServiceGroup {
  kind: "text" | "image" | "video";
  title: string;
  description: string;
  models: ProviderConfigItem[];
  providerId: ModelConfigProviderId;
  badge: string;
}

export interface ModelConfigTestStatus {
  tone: "neutral" | "ok" | "danger";
  message: string;
}

export interface ProviderConfigLedger {
  textModels: ProviderConfigItem[];
  imageModels: ProviderConfigItem[];
  videoModels: ProviderConfigItem[];
  providers: ProviderConfigItem[];
  runtime?: {
    textConfigured: boolean;
    imageConfigured: boolean;
    videoConfigured: boolean;
  };
}

export const modelConfigPresets: Record<ModelConfigProviderId, ModelConfigDraft[]> = {
  "openai-compatible-text": modelConfigPresetsForProvider("openai-compatible-text"),
  "openai-compatible-image": modelConfigPresetsForProvider("openai-compatible-image"),
  "volcengine-seedance": modelConfigPresetsForProvider("volcengine-seedance")
};

export function modelConfigDraftFromCatalogEntry(entry: ModelCatalogEntry, name = entry.vendor): ModelConfigDraft {
  return {
    name,
    vendor: entry.vendor,
    apiKey: "",
    baseUrl: entry.baseUrl,
    models: [entry.modelId],
    apiMode: entry.apiMode,
    enabled: true
  };
}

export function modelConfigDraftFromVendor(providerId: ModelConfigProviderId, vendor: string): ModelConfigDraft {
  return modelConfigDraftFromCatalogEntry(defaultCatalogEntryForVendor(providerId, vendor), vendor);
}

function modelConfigPresetsForProvider(providerId: ModelConfigProviderId): ModelConfigDraft[] {
  return catalogVendorsForProvider(providerId).map((vendor) => modelConfigDraftFromVendor(providerId, vendor.value));
}

export function defaultModelConfigPreset(providerId: ModelConfigProviderId): ModelConfigDraft {
  const preset = modelConfigPresets[providerId][0];
  if (!preset) {
    throw new Error(`No model config preset for provider: ${providerId}`);
  }
  return preset;
}

export function resetModelConfigDraft(providerId: ModelConfigProviderId): ModelConfigDraft {
  return {
    ...defaultModelConfigPreset(providerId),
    configId: undefined,
    apiKey: "",
    enabled: true
  };
}

export function draftFromProviderConfig(providerId: ModelConfigProviderId, model: ProviderConfigItem, models: ProviderConfigItem[] = [model]): ModelConfigDraft {
  const vendor = model.providerLabel || defaultModelConfigPreset(providerId).vendor;
  const vendorPreset = modelConfigPresets[providerId].find((preset) => preset.vendor === vendor) ?? defaultModelConfigPreset(providerId);
  const relatedModels = model.credentialId
    ? models.filter((item) => item.credentialId && item.credentialId === model.credentialId)
    : [model];
  return {
    ...vendorPreset,
    configId: model.configId,
    name: model.label,
    vendor,
    apiKey: "",
    keyPreview: model.keyPreview,
    baseUrl: model.baseUrl,
    models: relatedModels.map((item) => item.model).filter(Boolean),
    apiMode: model.apiMode ?? vendorPreset.apiMode,
    enabled: model.enabled ?? true
  };
}

export function apiModeForProviderDraft(providerId: ModelConfigProviderId, draft: ModelConfigDraft): string | undefined {
  return providerId === "openai-compatible-text" ? undefined : draft.apiMode;
}

export function syncModelConfigDraftsFromLedger(
  ledger: ProviderConfigLedger,
  current: Record<ModelConfigProviderId, ModelConfigDraft>
): Record<ModelConfigProviderId, ModelConfigDraft> {
  const next = { ...current };
  for (const model of [ledger.textModels[0], ledger.imageModels[0], ledger.videoModels[0]].filter(Boolean)) {
    next[model.id] = {
      ...next[model.id],
      configId: undefined,
      name: model.label || next[model.id].name,
      vendor: model.providerLabel || next[model.id].vendor,
      baseUrl: model.baseUrl || next[model.id].baseUrl,
      models: model.model ? [model.model] : next[model.id].models,
      apiMode: model.apiMode ?? next[model.id].apiMode,
      enabled: model.enabled ?? next[model.id].enabled ?? true
    };
  }
  return next;
}

export function updateProviderConfigStatus<T extends ProviderConfigLedger>(
  ledger: T,
  status: Pick<ProviderConfigItem, "id" | "configId" | "configured" | "keySource" | "keyPreview">
): T {
  const update = <Item extends ProviderConfigItem>(items: Item[]): Item[] =>
    items.map((model) => {
      const sameConfig = status.configId ? model.configId === status.configId : model.id === status.id;
      return sameConfig ? { ...model, ...status } : model;
    });
  return {
    ...ledger,
    textModels: update(ledger.textModels),
    imageModels: update(ledger.imageModels),
    videoModels: update(ledger.videoModels),
    providers: update(ledger.videoModels)
  };
}

export function groupConfiguredModelServices(providerId: ModelConfigProviderId, models: ProviderConfigItem[]): ProviderConfigServiceItem[] {
  const groups = new Map<string, ProviderConfigItem[]>();
  for (const model of models) {
    const groupId = model.credentialId || model.configId || `${model.id}-${model.providerLabel || model.baseUrl}`;
    groups.set(groupId, [...(groups.get(groupId) ?? []), model]);
  }
  return Array.from(groups.values()).map((group) => {
    const lead = group[0]!;
    return {
      ...lead,
      label: serviceLabelForModelConfig(providerId, lead),
      serviceLabel: serviceLabelForModelConfig(providerId, lead),
      models: group
    };
  });
}

function serviceLabelForModelConfig(providerId: ModelConfigProviderId, model: ProviderConfigItem): string {
  const vendor = model.providerLabel?.trim();
  if (vendor) {
    return vendor;
  }
  const draft = defaultModelConfigPreset(providerId);
  return draft.vendor || model.label || "-";
}

export function endpointPrefixPreview(baseUrl: string, providerId: ModelConfigProviderId, model?: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "-";
  }
  if (providerId === "volcengine-seedance") {
    return `${trimmed}/api/v3`;
  }
  const prefix = trimmed.endsWith("/v1") || trimmed.endsWith("/api/v3") || trimmed.endsWith("/v1beta/openai")
    ? trimmed
    : `${trimmed}/v1`;
  if (providerId !== "openai-compatible-text") {
    return prefix;
  }
  return `${prefix}/${shouldPreviewResponsesEndpoint(prefix, model) ? "responses" : "chat/completions"}`;
}

function shouldPreviewResponsesEndpoint(prefix: string, model?: string): boolean {
  const normalizedPrefix = prefix.toLowerCase().replace(/\/+$/, "");
  const normalizedModel = (model ?? "").trim().toLowerCase();
  const isOpenAiBaseUrl = normalizedPrefix === "https://api.openai.com/v1";
  return isOpenAiBaseUrl && (normalizedModel.startsWith("gpt-") || normalizedModel.startsWith("o"));
}

function catalogModelsForDraft(providerId: ModelConfigProviderId, draft: ModelConfigDraft): ModelCatalogEntry[] {
  const entries = catalogEntriesForProvider(providerId);
  const vendorEntries = catalogEntriesForVendor(providerId, draft.vendor);
  if (vendorEntries.length > 0) {
    return vendorEntries;
  }
  if (draft.models.length === 0 || draft.models.every((model) => entries.some((entry) => entry.modelId === model))) {
    return entries;
  }
  return entries;
}

function normalizeCatalogModelSelection(value: string): string {
  return value.trim().toLowerCase();
}

function firstDraftModel(draft: ModelConfigDraft): string {
  return draft.models[0] ?? "";
}

function vendorOptions(providerId: ModelConfigProviderId): Array<{ value: string; label: string }> {
  return catalogVendorsForProvider(providerId).map((vendor) => ({ value: vendor.value, label: vendor.label }));
}

export function SharedModelServiceGroup({
  title,
  badge,
  description,
  providerId,
  models,
  canManageServices,
  isBusy,
  apiOwner,
  keyBadgeLabel,
  addButtonLabel,
  emptyText,
  onAdd,
  onEdit,
  onClear,
  onToggleEnabled
}: {
  title: string;
  badge: string;
  description: string;
  providerId: ModelConfigProviderId;
  models: ProviderConfigItem[];
  canManageServices: boolean;
  isBusy: boolean;
  apiOwner: ApiOwner;
  keyBadgeLabel: string;
  addButtonLabel?: (badge: string) => string;
  emptyText?: string;
  onAdd?: () => void;
  onEdit?: (model: ProviderConfigItem) => void;
  onClear?: (providerId: ModelConfigProviderId, configId?: string) => Promise<void>;
  onToggleEnabled?: (providerId: ModelConfigProviderId, service: ProviderConfigServiceItem, enabled: boolean) => Promise<void>;
}) {
  const configuredModels = models.filter((model) => model.configured);
  const configuredServices = groupConfiguredModelServices(providerId, configuredModels);
  const configuredCount = configuredServices.length;
  return (
    <section className="grid gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--card2)] p-3 text-[12px]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="m-0 text-[15px] font-black leading-5 text-[var(--text)]">{title}</h3>
            <Badge className="min-h-5 px-1.5 text-[10px]">{badge}</Badge>
            <Badge className="min-h-5 px-1.5 text-[10px]" tone={configuredCount > 0 ? "ok" : "danger"}>{configuredCount > 0 ? `${configuredCount} 条可用` : "未配置"}</Badge>
          </div>
          <div className="mt-0.5 text-[12px] font-medium leading-5 text-[var(--muted)]">{description}</div>
        </div>
        {canManageServices && onAdd ? (
          <div className="flex flex-wrap gap-1.5">
            <Button className="min-h-7 px-2 text-[12px]" size="sm" variant="primary" type="button" disabled={isBusy} onClick={onAdd}>
              <Plus size={12} />
              {addButtonLabel ? addButtonLabel(badge) : `添加${badge}服务`}
            </Button>
          </div>
        ) : null}
      </div>
      <div className="grid gap-1.5">
        {configuredServices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--card)] px-3 py-3 text-[12px] font-semibold leading-5 text-[var(--muted)]">
            {emptyText ?? "还没有配置可用服务，添加 API Key 后这里会显示已启用的模型服务。"}
          </div>
        ) : null}
        {configuredServices.map((service, index) => (
          <div key={service.configId ?? `${service.id}-${index}`} className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 min-[980px]:grid-cols-[minmax(220px,1.1fr)_minmax(220px,1fr)_auto] min-[980px]:items-center">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                {index === 0 && service.configured ? <Badge className="min-h-5 px-1.5 text-[10px]" tone="ok">默认</Badge> : null}
                <Badge className="min-h-5 px-1.5 text-[10px]" tone={apiOwner === "platform" ? "ok" : "neutral"}>{keyBadgeLabel}</Badge>
                <strong className="truncate text-[13px] font-black text-[var(--text)]">{service.serviceLabel}</strong>
              </div>
              <div className="mt-0.5 truncate text-[11px] font-semibold text-[var(--muted)]">{service.baseUrl}</div>
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {service.models.map((model) => (
                  <Badge key={model.configId ?? model.model} className="min-h-5 max-w-full px-1.5 text-[10px]">
                    {modelLabelForId(providerId, model.model)}
                  </Badge>
                ))}
              </div>
            </div>
            {canManageServices && (onEdit || onClear || onToggleEnabled) ? (
              <div className="flex flex-wrap justify-end gap-1.5">
                {onToggleEnabled ? (
                  <EnabledSwitchButton
                    enabled={service.enabled !== false}
                    label={service.enabled === false ? "停用" : "启用"}
                    disabled={isBusy || !service.configured}
                    onClick={() => void onToggleEnabled(providerId, service, service.enabled === false)}
                  />
                ) : null}
                {onEdit ? (
                  <Button className="min-h-7 px-2 text-[12px]" size="sm" type="button" disabled={isBusy} onClick={() => onEdit(service)}>
                    编辑
                  </Button>
                ) : null}
                {onClear ? (
                  <Button className="min-h-7 px-2 text-[12px]" size="sm" variant="danger" type="button" disabled={isBusy || !service.configured} onClick={() => void onClear(providerId, service.configId)}>
                    删除
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function EnabledSwitchButton({
  enabled,
  label,
  disabled,
  onClick
}: {
  enabled: boolean;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-1 pr-2 text-[12px] font-black transition focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(10,163,148,.18)]",
        enabled
          ? "border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_9%,var(--field))] text-[var(--accent)] hover:border-[var(--accent)]"
          : "border-[var(--border)] bg-[var(--field)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
        disabled && "cursor-not-allowed opacity-55"
      )}
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={onClick}
    >
      <span className={cn(
        "relative h-3.5 w-7 rounded-full border transition",
        enabled ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border-strong)] bg-[var(--panel2)]"
      )}>
        <span className={cn(
          "absolute left-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow-[0_1px_4px_rgba(96,64,43,.24)] transition-transform",
          enabled && "translate-x-3.5"
        )} />
      </span>
      <span>{label}</span>
    </button>
  );
}

export function SharedModelConfigDialog({
  title,
  badge,
  providerId,
  draft,
  testStatus,
  presets,
  apiKeyLabel = "API Key",
  onDraftChange,
  onApplyPreset,
  onClose,
  onTest,
  onRefreshModels,
  onRevealApiKey,
  onSave,
  isBusy
}: {
  title: string;
  badge: string;
  providerId: ModelConfigProviderId;
  draft: ModelConfigDraft;
  testStatus?: ModelConfigTestStatus;
  presets: ModelConfigDraft[];
  apiKeyLabel?: string;
  onDraftChange: (providerId: ModelConfigProviderId, patch: Partial<ModelConfigDraft>) => void;
  onApplyPreset: (providerId: ModelConfigProviderId, preset: ModelConfigDraft) => void;
  onClose: () => void;
  onTest?: (providerId: ModelConfigProviderId) => Promise<void>;
  onRefreshModels?: (providerId: ModelConfigProviderId) => Promise<void>;
  onRevealApiKey: (providerId: ModelConfigProviderId, configId: string) => Promise<string>;
  onSave: (providerId: ModelConfigProviderId, event: FormEvent<HTMLFormElement>) => Promise<void>;
  isBusy: boolean;
}) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [isEditingApiKey, setIsEditingApiKey] = useState(false);
  const [isRevealingApiKey, setIsRevealingApiKey] = useState(false);
  const [revealedApiKey, setRevealedApiKey] = useState("");
  const endpointPrefix = endpointPrefixPreview(draft.baseUrl, providerId, firstDraftModel(draft));
  const isEditingExisting = Boolean(draft.configId);
  const hasStoredApiKey = isEditingExisting && Boolean(draft.keyPreview);
  const storedApiKeyMask = "••••••••••••••••";
  const apiKeyInputPlaceholder = isEditingExisting ? "输入新 Key 可替换，留空则保留原 Key" : "sk-...";
  const isShowingStoredApiKey = hasStoredApiKey && !isEditingApiKey && !draft.apiKey;
  const apiKeyFieldValue = isShowingStoredApiKey
    ? showApiKey && revealedApiKey ? revealedApiKey : storedApiKeyMask
    : draft.apiKey;
  const isTesting = testStatus?.message === "测试配置中...";
  const catalogModels = catalogModelsForDraft(providerId, draft);
  const selectedModelIds = draft.models;
  const selectedModelSet = new Set(selectedModelIds.map(normalizeCatalogModelSelection));
  const applyVendor = (vendor: string) => {
    const preset = modelConfigDraftFromVendor(providerId, vendor);
    onApplyPreset(providerId, preset);
  };
  const toggleCatalogModel = (entry: ModelCatalogEntry, selected: boolean) => {
    const nextModels = selected
      ? Array.from(new Set([...selectedModelIds, entry.modelId]))
      : selectedModelIds.filter((model) =>
        normalizeCatalogModelSelection(model) !== normalizeCatalogModelSelection(entry.modelId) &&
        normalizeCatalogModelSelection(model) !== normalizeCatalogModelSelection(entry.label)
      );
    onDraftChange(providerId, {
      vendor: entry.vendor,
      baseUrl: entry.baseUrl,
      models: nextModels,
      apiMode: entry.apiMode ?? draft.apiMode
    });
  };
  useEffect(() => {
    setShowApiKey(false);
    setIsEditingApiKey(false);
    setRevealedApiKey("");
  }, [providerId, draft.configId, draft.keyPreview]);
  const toggleApiKeyVisibility = async () => {
    if (showApiKey) {
      setShowApiKey(false);
      return;
    }
    if (isShowingStoredApiKey && draft.configId && !revealedApiKey) {
      setIsRevealingApiKey(true);
      try {
        const response = await onRevealApiKey(providerId, draft.configId);
        setRevealedApiKey(response);
        setShowApiKey(true);
      } finally {
        setIsRevealingApiKey(false);
      }
      return;
    }
    setShowApiKey(true);
  };
  const updateApiKeyInput = (value: string) => {
    if (!isEditingApiKey) {
      setIsEditingApiKey(true);
    }
    onDraftChange(providerId, { apiKey: value });
  };
  const startEditingApiKey = () => {
    if (isShowingStoredApiKey) {
      setIsEditingApiKey(true);
      setShowApiKey(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(42,33,27,.35)] p-4">
      <section className="max-h-[min(860px,calc(100vh-32px))] w-full max-w-[860px] overflow-auto rounded-[18px] border border-[var(--border-strong)] bg-[var(--panel)] p-6 shadow-[0_24px_72px_rgba(96,64,43,.20)]">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[.16em] text-[var(--muted)]">{isEditingExisting ? "EDIT CONFIG" : "NEW CONFIG"}</div>
            <h3 className="m-0 mt-1.5 text-[24px] font-black leading-tight text-[var(--text)]">{isEditingExisting ? title.replace("添加", "编辑") : title}</h3>
            <div className="mt-2 text-[13px] font-semibold leading-5 text-[var(--muted)]">
              {isEditingExisting ? "不填写 API Key 时会保留原 Key。" : "推荐先选择模板，系统会自动填入更合理的 Base URL 与默认模型。"}
            </div>
          </div>
          <Badge>{badge}</Badge>
        </div>
        <form className="grid gap-3" onSubmit={(event) => void onSave(providerId, event)}>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <Button
                key={`${providerId}-${preset.vendor}`}
                type="button"
                variant={draft.vendor === preset.vendor ? "soft" : "default"}
                onClick={() => onApplyPreset(providerId, preset)}
              >
                {preset.name}
              </Button>
            ))}
          </div>
          <Field label="配置名称">
            <Input value={draft.name} onChange={(event) => onDraftChange(providerId, { name: event.target.value })} />
          </Field>
          <Field label="模型商">
            <Select value={draft.vendor} onChange={(event) => applyVendor(event.target.value)}>
              {vendorOptions(providerId).map((vendor) => (
                <option key={vendor.value} value={vendor.value}>{vendor.label}</option>
              ))}
            </Select>
          </Field>
          <Field label={apiKeyLabel}>
            <div className="relative">
              <Input
                className={cn("pr-11", isShowingStoredApiKey ? "font-mono" : "")}
                type={showApiKey ? "text" : "password"}
                autoComplete="off"
                readOnly={isShowingStoredApiKey}
                value={apiKeyFieldValue}
                onFocus={startEditingApiKey}
                onClick={startEditingApiKey}
                onChange={(event) => updateApiKeyInput(event.target.value)}
                placeholder={apiKeyInputPlaceholder}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute right-1.5 top-1/2 -translate-y-1/2"
                disabled={isBusy || isRevealingApiKey}
                aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                onClick={() => void toggleApiKeyVisibility()}
              >
                {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </Button>
            </div>
          </Field>
          <Field label="Base URL">
            <Input value={draft.baseUrl} onChange={(event) => onDraftChange(providerId, { baseUrl: event.target.value })} />
          </Field>
          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12px] font-semibold text-[var(--muted)]">
            实际端点前缀: <span className="font-mono text-[var(--text)]">{endpointPrefix}</span>
          </div>
          <Field label={<ModelVersionFieldLabel testStatus={testStatus} isTesting={isTesting} />}>
            <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2">
              {catalogModels.map((entry) => {
                const checked = selectedModelSet.has(normalizeCatalogModelSelection(entry.modelId)) || selectedModelSet.has(normalizeCatalogModelSelection(entry.label));
                return (
                  <label
                    key={entry.catalogId}
                    className={cn(
                      "grid cursor-pointer gap-1 rounded-lg border px-3 py-2 text-[12px] transition",
                      checked
                        ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_9%,var(--field))]"
                        : "border-[var(--border)] bg-[var(--field)] hover:border-[var(--border-strong)]"
                    )}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => toggleCatalogModel(entry, event.target.checked)}
                      />
                      <span className="font-black text-[var(--text)]">{entry.label}</span>
                      {entry.tags.map((tag) => (
                        <Badge key={tag} className="min-h-5 px-1.5 text-[10px]">{tag}</Badge>
                      ))}
                    </span>
                    <span className="text-[11px] font-semibold text-[var(--muted)]" title={entry.modelId}>官方模型 ID 已内置</span>
                  </label>
                );
              })}
            </div>
          </Field>
          <div className="flex flex-wrap justify-end gap-2 pt-3">
            {onRefreshModels ? (
              <Button type="button" variant="ghost" disabled={isBusy} onClick={() => void onRefreshModels(providerId)}>
                <RefreshCcw size={14} />
                刷新可用模型
              </Button>
            ) : null}
            {onTest ? (
              <Button type="button" variant="ghost" disabled={isBusy} onClick={() => void onTest(providerId)}>
                {isTesting ? <RefreshCcw className="h-4 w-4 animate-spin" /> : null}
                {isTesting ? "测试中" : "测试配置"}
              </Button>
            ) : null}
            <Button type="button" disabled={isBusy} onClick={onClose}>
              取消
            </Button>
            <Button variant="primary" type="submit" disabled={isBusy}>
              保存
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ModelVersionFieldLabel({
  testStatus,
  isTesting
}: {
  testStatus?: ModelConfigTestStatus;
  isTesting: boolean;
}) {
  const inlineStatus = isTesting
    ? { message: "测试配置中...", tone: "neutral" as const }
    : testStatus;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>模型版本</span>
      {inlineStatus ? (
        <span
          className={cn(
            "max-w-full truncate rounded-full border px-2 py-0.5 text-[11px] font-black leading-5",
            inlineStatus.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : inlineStatus.tone === "danger"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)]"
          )}
          title={inlineStatus.message}
        >
          {inlineStatus.message}
        </span>
      ) : null}
    </span>
  );
}
