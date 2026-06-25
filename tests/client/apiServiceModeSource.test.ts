import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const appPath = "src/client/App.tsx";
const apiModelConfigPanelPath = "src/client/components/apiModelConfigPanel.tsx";
const compactChoiceDropdownPath = "src/client/components/compactChoiceDropdown.tsx";
const modelServiceBundlesPath = "src/client/modelServiceBundles.ts";
const sharedModelConfigPath = "src/client/components/modelServiceConfig.tsx";

describe("api service mode source", () => {
  it("keeps App focused on orchestration and uses dedicated API management modules", async () => {
    const source = await readFile(appPath, "utf8");
    const composerSource = source.slice(source.indexOf("function ProductCreationComposer"), source.indexOf("function ProductLibraryHome"));

    expect(source).toContain('from "./components/apiModelConfigPanel.js"');
    expect(source).toContain('from "./components/compactChoiceDropdown.js"');
    expect(source).toContain('from "./modelServiceBundles.js"');
    expect(source).toContain("<ApiModelConfigPanel");
    expect(source).toContain("selectedModelSchemeId");
    expect(source).toContain("modelSchemeOptions");
    expect(source).toContain("applyModelSchemeSelection");
    expect(source).toContain("saveModelBundle");
    expect(source).toContain("deleteModelBundle");
    expect(source).not.toContain("function ApiServiceModeCards");
    expect(source).not.toContain("function ByokBundleManager");
    expect(source).not.toContain("function CompactChoiceDropdown");
    expect(source).not.toContain("function buildModelSchemeOptions");
    expect(composerSource).toContain('label="模型方案"');
    expect(composerSource).toContain("modelSchemeOptions");
    expect(composerSource).toContain("modelSchemeChoiceLabel");
    expect(composerSource).toContain("modelSchemeSummary");
    expect(composerSource).not.toContain("showModelDetailSelectors");
    expect(composerSource).not.toContain('label="生成模型"');
  });

  it("keeps model scheme rules in a pure bundle module", async () => {
    const source = await readFile(modelServiceBundlesPath, "utf8");
    const buildModelSchemeOptionsSource = source.slice(source.indexOf("export function buildModelSchemeOptions"), source.indexOf("export function sortSelectableModelBundles"));

    expect(source).toContain('export type ModelConfigChoice = "auto" | string;');
    expect(source).toContain("export type ModelSchemeChoice");
    expect(source).toContain("export interface ModelBundleItem");
    expect(source).toContain("export interface ModelServicePreference");
    expect(buildModelSchemeOptionsSource).not.toContain('id: "auto"');
    expect(buildModelSchemeOptionsSource).not.toContain("自动推荐");
    expect(source).toContain('options[0]?.label ?? "未选择"');
    expect(source).toContain("`文本 ${modelConfigChoiceLabel(input.selectedTextModelConfigId, input.textModels)}`");
    expect(source).toContain("`图片 ${modelConfigChoiceLabel(input.selectedImageModelConfigId, input.imageModels)}`");
    expect(source).toContain("`视频 ${modelConfigChoiceLabel(input.selectedVideoModelConfigId, input.videoModels)}`");
    expect(source).not.toContain("`文 ${modelConfigChoiceLabel(input.selectedTextModelConfigId, input.textModels)}`");
    expect(source).not.toContain("`图 ${modelConfigChoiceLabel(input.selectedImageModelConfigId, input.imageModels)}`");
    expect(source).not.toContain("`视 ${modelConfigChoiceLabel(input.selectedVideoModelConfigId, input.videoModels)}`");
    expect(source).toContain("平台 · 高质量");
    expect(source).toContain("平台 · 低成本");
    expect(source).toContain('return `自带 · ${bundle.label}`');
    expect(source).toContain("platformPresetRank");
    expect(source).toContain("return \"自动推荐\";");
  });

  it("uses clear service mode titles and compact billing copy", async () => {
    const source = await readFile(apiModelConfigPanelPath, "utf8");
    const serviceModeSource = source.slice(source.indexOf("function ApiServiceModeCards"), source.indexOf("function ModelServiceOwnerPanel"));

    expect(serviceModeSource).toContain('title: "平台托管 API"');
    expect(serviceModeSource).toContain("省心不用配 Key，不用自己申请和维护各家账号");
    expect(serviceModeSource).toContain("平台已接入官方 API");
    expect(serviceModeSource).toContain("官方 API 成本 + 平台服务费");
    expect(serviceModeSource).toContain('title: "自带 API"');
    expect(serviceModeSource).toContain("需要去各模型服务商申请并配置 API Key");
    expect(serviceModeSource).toContain("调用费由你的 API 账号结算，平台仅收服务费");
    expect(serviceModeSource).toContain('badge: "平台服务费"');
    expect(serviceModeSource).not.toContain('title: "平台模型"');
    expect(serviceModeSource).not.toContain("模型官网扣费");
    expect(serviceModeSource).not.toContain("自付 API 成本");
    expect(serviceModeSource).not.toContain("不用填 Key，直接选择平台提供的文本、图片、视频模型组合。");
  });

  it("clears stale bundle ids when switching service modes", async () => {
    const source = await readFile(apiModelConfigPanelPath, "utf8");
    const panelSource = source.slice(source.indexOf("export function ApiModelConfigPanel"), source.indexOf("function ApiServiceModeCards"));

    expect(panelSource).toContain("bundleIdForPreference(platformBundles, servicePreference.platformBundleId) ?? \"\"");
    expect(panelSource).toContain("bundleIdForPreference(byokBundles, servicePreference.byokBundleId) ?? \"\"");
    expect(panelSource).toContain("? { serviceMode, platformBundleId: platformBundleIdForMode }");
    expect(panelSource).toContain(": { serviceMode, byokBundleId: byokBundleIdForMode }");
  });

  it("keeps platform bundle selection separate from BYOK service management", async () => {
    const source = await readFile(apiModelConfigPanelPath, "utf8");
    const panelSource = source.slice(source.indexOf("export function ApiModelConfigPanel"), source.indexOf("function ApiServiceModeCards"));
    const ownerPanelSource = source.slice(source.indexOf("function ModelServiceOwnerPanel"), source.indexOf("function ModelBundleSummary"));

    expect(source).not.toContain("function PlatformModelModePanel");
    expect(source).not.toContain("function ByokModelModePanel");
    expect(panelSource).toContain("apiOwner={activeMode}");
    expect(panelSource).toContain("canManageServices={activeMode === \"byok\"}");
    expect(ownerPanelSource).toContain("ownerModelsForGroup(group.models, apiOwner)");
    expect(ownerPanelSource).toContain("if (apiOwner === \"platform\")");
    expect(ownerPanelSource).not.toContain("自带 API 服务");
    expect(ownerPanelSource).not.toContain("这里配置的是你自己的模型 API Key");
    expect(ownerPanelSource).not.toContain("费用：上游 API 费用走你的账号");
    expect(ownerPanelSource).not.toContain("只扣服务费</Badge>");
    expect(ownerPanelSource).not.toContain("平台模型组合");
    expect(ownerPanelSource).not.toContain("平台密钥只在后台保存，并加密写入数据库");
    expect(ownerPanelSource).not.toContain("费用：官方成本 + 服务费");
    expect(ownerPanelSource).not.toContain("平台可用服务");
    expect(ownerPanelSource).toContain("<ModelBundleSummary");
    expect(ownerPanelSource).toContain("<SharedModelServiceGroup");
    expect(ownerPanelSource).not.toContain("模型自选组合");
    expect(ownerPanelSource).not.toContain("保存当前组合");
    expect(ownerPanelSource).not.toContain("ModelServiceSelect");
  });

  it("lets BYOK users manage named bundles and keeps creation UI bundle-only", async () => {
    const appSource = await readFile(appPath, "utf8");
    const panelSource = await readFile(apiModelConfigPanelPath, "utf8");
    const rulesSource = await readFile(modelServiceBundlesPath, "utf8");
    const composerSource = appSource.slice(appSource.indexOf("function ProductCreationComposer"), appSource.indexOf("function ProductLibraryHome"));
    const ownerPanelSource = panelSource.slice(panelSource.indexOf("function ModelServiceOwnerPanel"), panelSource.indexOf("function ModelBundleSummary"));
    const byokBundleManagerSource = panelSource.slice(panelSource.indexOf("function ByokBundleManager"), panelSource.indexOf("function EditableBundleCard"));

    expect(panelSource).toContain("function ByokBundleManager");
    expect(panelSource).toContain("byokBundleDraftLabel");
    expect(panelSource).toContain("onSaveBundle");
    expect(panelSource).toContain("onDeleteBundle");
    expect(ownerPanelSource).toContain("<ByokBundleManager");
    expect(ownerPanelSource.indexOf("<SharedModelServiceGroup")).toBeLessThan(ownerPanelSource.indexOf("<ByokBundleManager"));
    expect(panelSource).toContain("byok-bundle-card");
    expect(panelSource).toContain("Pencil");
    expect(panelSource).toContain("bundleTitleInputClass");
    expect(panelSource).toContain("function BundleTitleField");
    expect(panelSource).toContain("function bundleTitleInputWidth");
    expect(panelSource).toContain("style={{ width: bundleTitleInputWidth(value) }}");
    expect(panelSource).not.toContain('className="flex min-w-0 flex-1 items-center gap-1"');
    expect(panelSource).toContain("nextModelBundleLabel");
    expect(panelSource).toContain("compareCustomModelBundles");
    expect(rulesSource).toContain("新增组合1");
    expect(appSource).toContain("modelBundles.filter((bundle) => bundle.apiOwner === \"byok\" && bundle.enabled).sort(compareCustomModelBundles)");
    expect(appSource).toContain("sortSelectableModelBundles(normalizedBundles)");
    expect(rulesSource).toContain("[...input.byokBundles].sort(compareCustomModelBundles)");
    expect(panelSource).toContain("const bundleGridClass");
    expect(panelSource).toContain("min-[1180px]:grid-cols-3");
    expect(byokBundleManagerSource).toContain("className={bundleGridClass}");
    expect(byokBundleManagerSource).not.toContain("grid-cols-[repeat(auto-fill,minmax(260px,320px))]");
    expect(byokBundleManagerSource).toContain("setDraftLabelEdited(false)");
    expect(byokBundleManagerSource).toContain("if (!draftLabelEdited)");
    expect(panelSource).not.toContain('placeholder="低成本"');
    expect(composerSource).not.toContain("showDetailSelectors");
    expect(composerSource).not.toContain("onCustomPlatformBundleChange");
    expect(composerSource).not.toContain("onByokCustomBundleChange");
    expect(composerSource).not.toContain('label="文本模型"');
    expect(composerSource).not.toContain('label="图片模型"');
    expect(composerSource).not.toContain('label="视频模型"');
    expect(rulesSource).toContain('return `自带 · ${bundle.label}`');
    expect(appSource).not.toContain("byokCustomBundleId");
    expect(appSource).not.toContain("saveByokCustomBundleSelection");
  });

  it("lets platform users manage numbered custom bundles after built-in presets", async () => {
    const appSource = await readFile(appPath, "utf8");
    const panelSource = await readFile(apiModelConfigPanelPath, "utf8");
    const dropdownSource = await readFile(compactChoiceDropdownPath, "utf8");
    const panelHeaderSource = panelSource.slice(panelSource.indexOf("export function ApiModelConfigPanel"), panelSource.indexOf("function ApiServiceModeCards"));
    const ownerPanelSource = panelSource.slice(panelSource.indexOf("function ModelServiceOwnerPanel"), panelSource.indexOf("function ModelBundleSummary"));
    const bundleSummarySource = panelSource.slice(panelSource.indexOf("function ModelBundleSummary"), panelSource.indexOf("function ByokBundleManager"));

    expect(appSource).toContain("applyModelBundleSelection");
    expect(appSource).toContain("bundleModelConfigIds");
    expect(panelHeaderSource).toContain("title: \"文本模型\"");
    expect(panelHeaderSource).toContain("title: \"图片模型\"");
    expect(panelHeaderSource).toContain("title: \"视频模型\"");
    expect(panelHeaderSource).toContain("onSaveBundle");
    expect(panelSource).not.toContain("function ModelServiceSelect");
    expect(panelSource).not.toContain("模型自选组合");
    expect(panelSource).not.toContain("保存当前组合");
    expect(ownerPanelSource).not.toContain("保存成组合");
    expect(ownerPanelSource).not.toContain("configuredOwnerModels");
    expect(ownerPanelSource).not.toContain("ShieldCheck");
    expect(bundleSummarySource).not.toContain("平台预设组合");
    expect(bundleSummarySource).not.toContain("这些方案由后台发布");
    expect(bundleSummarySource).not.toContain("后台发布平台组合后，这里会显示可用方案。");
    expect(bundleSummarySource).toContain("暂无可用组合");
    expect(bundleSummarySource).toContain("presetBundles.map((bundle) => {");
    expect(bundleSummarySource).toContain("<PlatformBundleManager");
    expect(bundleSummarySource).toContain("bundles={customBundles}");
    expect(bundleSummarySource).toContain("platform-custom-bundle-");
    expect(bundleSummarySource).toContain("nextModelBundleLabel(bundles)");
    expect(bundleSummarySource).toContain("compareCustomModelBundles");
    expect(panelSource).toContain("className={bundleGridClass}");
    expect(panelSource).not.toContain("grid-cols-[repeat(auto-fit,minmax(260px,1fr))]");
    expect(panelSource).not.toContain("grid-cols-[repeat(auto-fill,minmax(260px,320px))]");
    expect(bundleSummarySource).not.toContain("platformCustomBundleId");
    expect(bundleSummarySource).not.toContain("onCustomBundleChange");
    expect(bundleSummarySource).not.toContain("bundle.bundleId === platformCustomBundleId");
    const draftCardSource = panelSource.slice(panelSource.indexOf("function BundleDraftCard"), panelSource.indexOf("function AddBundleCard"));
    expect(draftCardSource).toContain("CustomBundleModelSelect");
    expect(bundleSummarySource).toContain("BundleModelRow");
    expect(draftCardSource).toContain('label="文本"');
    expect(draftCardSource).toContain('label="图片"');
    expect(draftCardSource).toContain('label="视频"');
    expect(bundleSummarySource).toContain('kindLabel="文本"');
    expect(bundleSummarySource).toContain('kindLabel="图片"');
    expect(bundleSummarySource).toContain('kindLabel="视频"');
    expect(panelSource).toContain('layout="inline"');
    expect(dropdownSource).toContain('layout === "inline"');
    expect(dropdownSource).toContain('"min-h-11 grid-cols-[44px_minmax(0,1fr)] items-center gap-2 rounded-[13px] border border-[var(--border-strong)] bg-[var(--field)] px-3 text-[13px] shadow-[0_8px_18px_rgba(96,64,43,.05)] transition"');
    expect(dropdownSource).toContain('"h-full min-h-11 border-0 bg-transparent px-0 shadow-none hover:border-0 hover:bg-transparent"');
    expect(dropdownSource).toContain('layout === "inline" && open && "border-[color-mix(in_srgb,var(--accent)_65%,var(--border-strong))] shadow-[0_0_0_3px_rgba(10,163,148,.12),0_8px_18px_rgba(96,64,43,.05)]"');
    expect(dropdownSource).toContain('layout === "stacked" && (open');
    expect(dropdownSource).not.toContain('"h-full min-h-11 border-transparent bg-transparent px-0 shadow-none hover:border-transparent"');
    expect(dropdownSource).not.toContain('left-[52px]');
    expect(panelSource).toContain(': "未选择"');
    expect(panelSource).toContain("isCompleteModelBundle");
    expect(bundleSummarySource).toContain("customTextModels.length > 0");
    expect(bundleSummarySource).toContain("customImageModels.length > 0");
    expect(bundleSummarySource).toContain("customVideoModels.length > 0");
    expect(bundleSummarySource).not.toContain("当前组合");
    expect(bundleSummarySource).not.toContain("使用");
    expect(appSource).toContain("const selectablePlatformBundles = platformBundles.filter(isCompleteModelBundle)");
    expect(appSource).toContain("const selectableByokBundles = byokBundles.filter(isCompleteModelBundle)");
    expect(bundleSummarySource).not.toContain("md:grid-cols-[minmax(180px,1fr)_minmax(0,2fr)_80px_auto]");
    expect(bundleSummarySource).not.toContain("组合可以把文本、图片、视频模型放在一起，生成时按组合选择。");
    expect(bundleSummarySource).not.toContain("还没有模型组合");
    expect(bundleSummarySource).not.toContain("保存成组合");
    const editableBundleCardSource = panelSource.slice(panelSource.indexOf("function EditableBundleCard"), panelSource.indexOf("function BundleModelRow"));
    expect(editableBundleCardSource).not.toContain("<BundleModelRow");
    expect(panelSource).toContain("function BundleDraftCard");
    expect(panelSource).toContain("showDraft");
    expect(panelSource).toContain("setShowDraft(true)");
    expect(panelSource).toContain("新增组合");
    expect(appSource).not.toContain("saveCustomPlatformBundleSelection");
    expect(appSource).not.toContain("onCustomPlatformBundleChange");
    expect(appSource).not.toContain("平台 · 自定义");
  });

  it("keeps model service editing details in the shared config component", async () => {
    const panelSource = await readFile(apiModelConfigPanelPath, "utf8");
    const sharedSource = await readFile(sharedModelConfigPath, "utf8");

    expect(panelSource).toContain("<SharedModelConfigDialog");
    expect(panelSource).toContain("<SharedModelServiceGroup");
    expect(panelSource).not.toContain("function ApiModelConfigGroup");
    expect(panelSource).not.toContain("function ApiModelConfigDialog");
    expect(sharedSource).toContain("function ModelVersionFieldLabel");
    expect(sharedSource).toContain("toggleCatalogModel");
    expect(sharedSource).toContain("models: nextModels");
    expect(sharedSource).toContain("catalogEntriesForVendor(providerId, draft.vendor)");
    expect(sharedSource).toContain("const configuredServices = groupConfiguredModelServices(providerId, configuredModels);");
    expect(sharedSource).toContain("{configuredServices.map((service, index) => (");
    expect(sharedSource).toContain("{service.serviceLabel}");
  });
});
