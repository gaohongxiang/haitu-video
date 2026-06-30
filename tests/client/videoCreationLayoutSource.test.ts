import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const appPath = "src/client/App.tsx";

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThan(-1);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("video creation layout source", () => {
  it("uses one product creative workspace for both image and video creation", async () => {
    const source = await readFile(appPath, "utf8");
    const appSource = source.slice(source.indexOf("export function App()"), source.indexOf("function AppLanguageSwitcher"));
    const videoCase = appSource.slice(appSource.indexOf('case "video"'), appSource.indexOf('case "image"'));
    const imageCase = appSource.slice(appSource.indexOf('case "image"'), appSource.indexOf('case "ledger"'));
    const workspaceSource = source.slice(source.indexOf("function ProductCreationWorkspace"), source.indexOf("function ProductCreationProductLibrary"));
    const composerSource = source.slice(source.indexOf("function ProductCreationComposer"), source.indexOf("function ProductCreationProductLibrary"));

    expect(videoCase).toContain('mode="video"');
    expect(imageCase).toContain('mode="image"');
    expect(imageCase).toContain("<ProductCreationWorkspace");
    expect(imageCase).not.toContain('tApp("image.empty")');
    expect(workspaceSource).toContain("mode: ProductCreativeWorkspaceMode;");
    expect(composerSource).toContain("buildProductCreativeWorkspace");
    expect(composerSource).toContain("ProductCreativeContextBar");
    expect(composerSource).not.toContain("ProductCreativeCommandCenter");
    expect(composerSource).toContain("ProductImageAssetPanel");
    expect(composerSource).toContain("handleGenerateProductImages");
    expect(composerSource).toContain("workspace.modeSwitch.map");
    expect(composerSource).toContain("onModeChange={onModeChange}");
    expect(composerSource).toContain("workspace.modeSummary");
    expect(composerSource).toContain("ProductModeOutputPanel");
    expect(composerSource).toContain("mode === \"video\"");
    expect(composerSource).toContain("mode === \"image\"");
  });

  it("renders the creative mode switch as navigation buttons that keep the product context", async () => {
    const source = await readFile(appPath, "utf8");
    const workspaceSource = source.slice(source.indexOf("function ProductCreationWorkspace"), source.indexOf("function ProductCreationProductLibrary"));
    const composerSource = source.slice(source.indexOf("function ProductCreationComposer"), source.indexOf("function ProductCreationProductLibrary"));
    const contextBarSource = sourceBetween(source, "function ProductCreativeContextBar", "function ProductModeActionBar");

    expect(workspaceSource).toContain("onModeChange: (mode: ProductCreativeWorkspaceMode) => void;");
    expect(composerSource).toContain("onModeChange={onModeChange}");
    expect(contextBarSource).toContain("workspace.modeSwitch.map");
    expect(contextBarSource).toContain("onModeChange");
    expect(contextBarSource).toContain('type="button"');
    expect(contextBarSource).toContain("onClick={() => onModeChange(item.mode)}");
    expect(contextBarSource).toContain("disabled={item.active}");
  });

  it("keeps internal prompt architecture out of the user-facing creative workspace", async () => {
    const source = await readFile(appPath, "utf8");
    const workbenchSource = sourceBetween(source, "function ProductCreativeWorkbench", "function ProductCreativeContextBar");
    const contextBarSource = sourceBetween(source, "function ProductCreativeContextBar", "function ProductModeActionBar");
    const uiWorkspaceSource = sourceBetween(source, "function ProductCreationComposer", "function ProductCreationProductLibrary");
    const workspaceModelSource = await readFile("src/client/productCreativeWorkspace.ts", "utf8");

    expect(workbenchSource).toContain("<ProductCreativeContextBar");
    expect(workbenchSource).not.toContain("<ProductCreativeCommandCenter");
    expect(workbenchSource).not.toContain("<ProductCreativeWorkspacePanel");
    expect(workbenchSource).not.toContain("<ProductAssetLedgerPanel");
    expect(workbenchSource).not.toContain("<ProductPromptPipelinePanel");
    expect(source).not.toContain("function ProductCreativeCommandCenter");
    expect(source).not.toContain("product-creative-command-center");
    expect(source).not.toContain("product-creative-compiler-column");
    expect(uiWorkspaceSource).not.toContain("视频提示词编译契约");
    expect(uiWorkspaceSource).not.toContain("图片提示词编译契约");
    expect(uiWorkspaceSource).not.toContain("商品资产账本");
    expect(uiWorkspaceSource).not.toContain("Payload");
    expect(contextBarSource).toContain("product-creative-context-bar");
    expect(contextBarSource).toContain("workspace.modeSwitch.map");
    expect(contextBarSource).toContain("workspace.memoryChips.map");
    expect(contextBarSource).toContain("workspace.modeSummary");
    expect(contextBarSource).not.toContain("workspace.promptPipeline");
    expect(contextBarSource).not.toContain("workspace.promptCompilerSteps.map");
    expect(contextBarSource).not.toContain("workspace.assetLedger.map");
    expect(contextBarSource).toContain("onClick={() => onModeChange(item.mode)}");
    expect(workspaceModelSource).toContain('"visual-asset-pool"');
    expect(workspaceModelSource).toContain('"image-output-records"');
    expect(workspaceModelSource).not.toContain('"reference-images"');
    expect(workspaceModelSource).not.toContain('"image-assets"');
  });

  it("uses an operational workbench for source data, creative intent, and reusable outputs", async () => {
    const source = await readFile(appPath, "utf8");
    const composerSource = sourceBetween(source, "function ProductCreationComposer", "function ProductCreativeWorkbench");
    const workbenchSource = sourceBetween(source, "function ProductCreativeWorkbench", "function ProductModeActionBar");

    expect(composerSource).toContain("<ProductCreativeWorkbench");
    expect(composerSource).not.toContain("video-generation-controls compact-generation-controls");
    expect(composerSource).not.toContain("min-[1180px]:grid-cols-[250px_minmax(360px,1fr)_350px]");
    expect(composerSource).not.toContain("<ProductModeActionBar");
    expect(composerSource).not.toContain("<ProductModeAssetPanel");
    expect(workbenchSource).toContain("product-creative-workbench");
    expect(workbenchSource).toContain("product-creative-studio");
    expect(workbenchSource).toContain("product-creative-media-rail");
    expect(workbenchSource).toContain("product-creative-compose-panel");
    expect(workbenchSource).toContain("product-creative-result-rail");
    expect(workbenchSource).not.toContain("product-creative-column-heading");
    expect(workbenchSource).not.toContain("源数据");
    expect(workbenchSource).not.toContain("创作意图");
    expect(workbenchSource).not.toContain("输出资产");
    expect(workbenchSource).toContain("ProductComposerReferenceTray");
    expect(workbenchSource).toContain("ProductModeOutputPanel");
    expect(workbenchSource).toContain("ProductModeActionBar");
    expect(workbenchSource).toContain("ProductModeAssetPanel");
    expect(workbenchSource.indexOf("ProductComposerReferenceTray")).toBeLessThan(workbenchSource.indexOf("ProductModeOutputPanel"));
    expect(workbenchSource.indexOf("ProductModeActionBar")).toBeLessThan(workbenchSource.indexOf("ProductModeAssetPanel"));
    expect(workbenchSource.indexOf("product-creative-compose-panel")).toBeLessThan(workbenchSource.indexOf("<ProductModeActionBar"));
    expect(workbenchSource.indexOf("<ProductModeActionBar")).toBeLessThan(workbenchSource.indexOf("product-creative-controls"));
    expect(workbenchSource.indexOf("product-creative-output-column")).toBeGreaterThan(workbenchSource.indexOf("<ProductModeActionBar"));
  });

  it("keeps mode-specific generation actions and asset ledgers behind mode components", async () => {
    const source = await readFile(appPath, "utf8");
    const composerBodySource = sourceBetween(source, "function ProductCreationComposer", "function ProductCreativeWorkbench");
    const workbenchSource = sourceBetween(source, "function ProductCreativeWorkbench", "function ProductModeActionBar");
    const actionBarSource = sourceBetween(source, "function ProductModeActionBar", "function ProductModeAssetPanel");
    const assetPanelSource = sourceBetween(source, "function ProductModeAssetPanel", "function ProductModeOutputPanel");

    expect(composerBodySource).toContain("<ProductCreativeWorkbench");
    expect(workbenchSource).toContain("<ProductModeActionBar");
    expect(workbenchSource).toContain("<ProductModeAssetPanel");
    expect(composerBodySource).not.toContain("<VideoHistoryPanel");
    expect(composerBodySource).not.toContain("<ProductImageAssetPanel");

    expect(actionBarSource).toContain('mode === "video"');
    expect(actionBarSource).toContain("generateVideoSummary");
    expect(actionBarSource).toContain("imageGenerateSummary");
    expect(actionBarSource).toContain("onGenerateVideo");
    expect(actionBarSource).toContain("onGenerateProductImages");
    expect(actionBarSource).toContain("product-creative-action-panel");
    expect(actionBarSource).toContain("product-creative-action-summary");
    expect(actionBarSource).not.toContain("min-[900px]:grid-cols-[minmax(0,1fr)_minmax(220px,auto)_minmax(220px,320px)]");

    expect(assetPanelSource).toContain('mode === "video"');
    expect(assetPanelSource).toContain("<VideoHistoryPanel");
    expect(assetPanelSource).toContain("<ProductImageAssetPanel");
  });

  it("fits mode asset history inside the output column instead of reusing a full-width page section", async () => {
    const source = await readFile(appPath, "utf8");
    const workbenchSource = sourceBetween(source, "function ProductCreativeWorkbench", "function ProductModeActionBar");
    const assetPanelSource = sourceBetween(source, "function ProductModeAssetPanel", "function ProductModeOutputPanel");
    const imageAssetSource = sourceBetween(source, "function ProductImageAssetPanel", "function ProductCreationProductLibrary");
    const videoHistorySource = sourceBetween(source, "function VideoHistoryPanel", "function ProductLibraryHome");

    expect(workbenchSource).toContain('surface="workbench"');
    expect(assetPanelSource).toContain('surface?: ProductCreativeAssetPanelSurface;');
    expect(assetPanelSource).toContain('surface={surface}');
    expect(imageAssetSource).toContain("ProductCreativeAssetPanelSurface");
    expect(videoHistorySource).toContain("ProductCreativeAssetPanelSurface");
    expect(imageAssetSource).toContain("product-creative-asset-panel");
    expect(videoHistorySource).toContain("product-creative-asset-panel");
    expect(imageAssetSource).not.toContain('className="grid gap-3 border-t border-[var(--border)] bg-[var(--card)] p-5"');
    expect(videoHistorySource).not.toContain('className="grid gap-3 border-t border-[var(--border)] bg-[var(--card)] p-5"');
  });

  it("does not double count reference images as image output assets in the creative workspace", async () => {
    const source = await readFile(appPath, "utf8");
    const composerSource = sourceBetween(source, "function ProductCreationComposer", "function ProductCreativeWorkbench");
    const imageAssetSource = sourceBetween(source, "function ProductImageAssetPanel", "function ProductCreationProductLibrary");

    expect(composerSource).toContain("const productImageAssetCount = 0");
    expect(composerSource).toContain("imageAssetCount: productImageAssetCount");
    expect(composerSource).not.toContain("imageAssetCount: previewableReferenceImages.length");
    expect(imageAssetSource).toContain("商品图片");
    expect(imageAssetSource).toContain("保存在当前商品下，图片优化和视频生成都会复用这些参考图");
    expect(imageAssetSource).not.toContain("商品图片资产");
    expect(imageAssetSource).not.toContain("图片模块产物会继续沉淀到同一个商品，供视频模块复用");
  });

  it("renders video creation as product library plus operation workspace instead of a top control bar", async () => {
    const source = await readFile(appPath, "utf8");
    const composerSource = source.slice(source.indexOf("function ProductCreationComposer"), source.indexOf("function ProductComposerReferenceTray"));

    expect(composerSource).toContain("video-workspace-shell");
    expect(composerSource).toContain("h-[100dvh] max-h-[100dvh] min-h-0 grid-rows-[minmax(0,1fr)]");
    expect(composerSource).toContain("transition-[grid-template-columns] duration-200");
    expect(composerSource).toContain("min-[900px]:grid-cols-[var(--product-library-column-width)_minmax(0,1fr)]");
    expect(composerSource).toContain('style={{ "--product-library-column-width": `${productLibraryColumnWidth}px` } as CSSProperties}');
    expect(composerSource).toContain("PRODUCT_LIBRARY_DEFAULT_WIDTH");
    expect(composerSource).toContain("PRODUCT_LIBRARY_COLLAPSED_WIDTH");
    expect(composerSource).not.toContain("PRODUCT_LIBRARY_COLLAPSE_SNAP_WIDTH");
    expect(composerSource).not.toContain("PRODUCT_LIBRARY_MIN_WIDTH");
    expect(composerSource).not.toContain("PRODUCT_LIBRARY_MAX_WIDTH");
    expect(composerSource).not.toContain("min-[900px]:grid-cols-[292px_minmax(0,1fr)]");
    expect(composerSource).toContain("productLibraryCollapsed");
    expect(composerSource).toContain("productLibraryColumnWidth");
    expect(composerSource).not.toContain("const [productLibraryWidth");
    expect(composerSource).not.toContain("handleProductLibraryResizeStart");
    expect(composerSource).not.toContain("handleProductLibraryResizeKeyDown");
    expect(composerSource).not.toContain('role="separator"');
    expect(composerSource).not.toContain('aria-orientation="vertical"');
    expect(composerSource).not.toContain("aria-valuenow={productLibraryColumnWidth}");
    expect(composerSource).toContain("video-product-library-collapse-rail");
    expect(composerSource).toContain("video-product-library-collapse-button");
    expect(composerSource).toContain("transition-[left,color]");
    expect(composerSource).not.toContain("video-product-library-resizer");
    expect(composerSource).not.toContain("productLibraryResizing");
    expect(composerSource).not.toContain("setProductLibraryResizing");
    expect(composerSource).not.toContain("MoveHorizontal");
    expect(composerSource).toContain("cursor-pointer");
    expect(composerSource).toContain("opacity-0");
    expect(composerSource).toContain("group-hover:opacity-100");
    expect(composerSource).toContain('aria-label={productLibraryCollapsed ? tVideo("productLibrary.expand") : tVideo("productLibrary.collapse")}');
    expect(composerSource).toContain('title={productLibraryCollapsed ? tVideo("productLibrary.expand") : tVideo("productLibrary.collapse")}');
    expect(composerSource).toContain("onClick={() => setProductLibraryCollapsed((collapsed) => !collapsed)}");
    expect(composerSource).not.toContain("拖动调整商品库宽度");
    expect(composerSource).toContain("video-product-library-column");
    expect(composerSource).toContain("video-operation-column");
    expect(composerSource).toContain("grid content-start gap-3");
    expect(composerSource).not.toContain("grid min-h-full content-start gap-3");
    expect(composerSource).toContain("ProductCreativeWorkbench");
    expect(composerSource).toContain("product-creative-workbench");
    expect(composerSource).toContain("product-creative-studio");
    expect(composerSource).toContain("product-creative-controls");
    expect(composerSource).toContain("py-2");
    expect(composerSource).toContain("model-scheme-control");
    expect(composerSource).toContain("model-scheme-chip-row");
    expect(composerSource).toContain("overflow-visible");
    expect(composerSource).toContain("ModelSchemeChip");
    expect(composerSource).toContain("{schemeSummary}");
    expect(composerSource).toContain('label={tVideo("controls.resolution")}');
    expect(composerSource).toContain("videoResolutionOptions");
    expect(composerSource).toContain("videoResolutionLabel");
    expect(composerSource).toContain("selectedVideoResolution");
    expect(composerSource).toContain("onVideoResolutionChange");
    expect(composerSource).toContain('label={tVideo("controls.aspectRatio")}');
    expect(composerSource).toContain("videoAspectRatioOptions");
    expect(composerSource).toContain("videoAspectRatioLabel");
    expect(composerSource).toContain("selectedVideoAspectRatio");
    expect(composerSource).toContain("onVideoAspectRatioChange");
    expect(composerSource).toContain('const languageOptions: FinalVideoLanguage[] = ["ja", "zh", "en"]');
    expect(source).toContain('finalLanguageLabel(finalLanguage, tVideo)');
    expect(composerSource).toContain('density="compact"');
    expect(composerSource).toContain("generation-status-message");
    expect(composerSource).toContain("video-generate-summary");
    expect(composerSource).toContain("{generateVideoSummary}");
    expect(composerSource).toContain("tracking-0");
    expect(composerSource).toContain("whitespace-normal");
    expect(composerSource).toContain("break-words");
    expect(composerSource).not.toContain("video-generate-summary min-w-0 truncate");
    expect(composerSource).not.toContain("generateVideoSummaryItems.map");
    expect(composerSource).not.toContain("video-generate-summary-item");
    expect(composerSource).not.toContain("video-generate-summary-separator");
    expect(composerSource).not.toContain("gap-x-2 gap-y-1");
    expect(composerSource).toContain("video-generate-status-center");
    expect(composerSource).toContain("justify-center text-center");
    expect(composerSource).not.toContain("subtitle={generateVideoSummary}");
    expect(composerSource).not.toContain("model-scheme-summary min-w-0 whitespace-normal break-words");
    expect(composerSource).not.toContain("model-scheme-summary min-w-0 truncate");
    expect(composerSource).not.toContain("<div className=\"min-w-0 truncate text-xs font-bold text-[var(--muted)]\">{schemeSummary}</div>");
    expect(composerSource).toContain("resolution: selectedVideoResolution");
    expect(composerSource).toContain("aspectRatio: selectedVideoAspectRatio");
    expect(composerSource).toContain("ProductCreationProductLibrary");
    expect(composerSource).toContain("ProductCreationOperationWorkspace");
    expect(composerSource).toContain("collapsed={productLibraryCollapsed}");
    expect(composerSource).toContain("productLibrarySearchQuery");
    expect(composerSource).toContain("filterProductLibraryProducts(productOptions, productLibrarySearchQuery");
    expect(composerSource).toContain("product-library-search");
    expect(composerSource).toContain('aria-label={tVideo("productLibrary.search")}');
    expect(composerSource).toContain('placeholder={tVideo("productLibrary.search")}');
    expect(composerSource).not.toContain("搜索商品 / SKU");
    expect(composerSource).toContain("product-library-scroll min-h-0 overflow-y-auto");
    expect(composerSource).toContain('{tVideo("productLibrary.noMatches")}');
    expect(composerSource).toContain('{tVideo("productLibrary.clearSearch")}');
    expect(composerSource).not.toContain("手动填写或粘贴商品资料");
    expect(composerSource).not.toContain("footer={");
    expect(composerSource).not.toContain("product-control-bar");
    expect(composerSource).not.toContain("video-parameter-row grid");
    expect(composerSource).not.toContain("<ProductCreationProductPicker");

    const generateBarIndex = composerSource.indexOf("video-generate-bar");
    const historyPanelIndex = composerSource.indexOf("<VideoHistoryPanel");
    expect(generateBarIndex).toBeGreaterThan(-1);
    expect(historyPanelIndex).toBeGreaterThan(-1);
    expect(generateBarIndex).toBeLessThan(historyPanelIndex);
  });

  it("localizes video workspace UI without translating product data fields", async () => {
    const source = await readFile(appPath, "utf8");
    const appSource = source.slice(source.indexOf("export function App()"), source.indexOf("function AppLanguageSwitcher"));
    const workspaceSource = source.slice(source.indexOf("function ProductCreationWorkspace"), source.indexOf("function ProductLibraryHome"));
    const composerSource = source.slice(source.indexOf("function ProductCreationComposer"), source.indexOf("function ProductCreationProductLibrary"));
    const librarySource = source.slice(source.indexOf("function ProductCreationProductLibrary"), source.indexOf("function ProductCreationOperationWorkspace"));
    const operationSource = source.slice(source.indexOf("function ProductCreationOperationWorkspace"), source.indexOf("function ProductComposerReferenceTray"));
    const referenceTraySource = source.slice(source.indexOf("function ProductComposerReferenceTray"), source.indexOf("function StoryboardComposerPanel"));
    const storyboardPanelSource = source.slice(source.indexOf("function StoryboardComposerPanel"), source.indexOf("function VideoHistoryPanel"));
    const historyPanelSource = source.slice(source.indexOf("function VideoHistoryPanel"), source.indexOf("function ProductLibraryHome"));
    const referenceFigureSource = source.slice(source.indexOf("function ReferenceImageFigure"), source.indexOf("function ReferenceImagePreviewDialog"));
    const referencePreviewSource = source.slice(source.indexOf("function ReferenceImagePreviewDialog"), source.indexOf("function ProductEntryModeButton"));
    const helperSource = source.slice(source.indexOf("function localizedVideoLabel"), source.indexOf("function jobStatusTone"));

    expect(appSource).toContain("localizedDefaultStoryboardDraft(defaultVideoTemplate, defaultVideoDurationSeconds, appLocale)");
    expect(appSource).toContain("localizedDefaultStoryboardDraft(template, duration, appLocale)");
    expect(appSource).toContain("if (storyboardDraftTouched) return;");
    expect(appSource).toContain("[template, duration, appLocale, storyboardDraftTouched]");
    expect(workspaceSource).toContain("appLocale={appLocale}");
    expect(composerSource).toContain('const tVideo = (key: string, options?: Record<string, unknown>) => i18n.t(`app:videoStudio.${key}`, { lng: appLocale, ...options });');
    expect(composerSource).toContain('title={draft.title_ja.trim() || selectedProduct?.title_ja || tVideo("newProduct.title")}');
    expect(composerSource).toContain('value={importText}');
    expect(composerSource).toContain('storyboardDraft={storyboardDraft}');
    expect(composerSource).toContain('draftTitle={draft.title_ja}');
    expect(composerSource).toContain('onToast(tVideo("generate.packageReadyToast"), "ok")');
    expect(composerSource).toContain('onToast(tVideo("generate.queuedToast"), "ok")');
    expect(composerSource).toContain('onToast(tVideo("generate.imageOnlyToast"))');
    expect(composerSource).toContain('{isSubmittingVideo ? tVideo("generate.submitting") : generateVideoButtonLabel}');
    expect(librarySource).toContain("product.title_ja");
    expect(librarySource).toContain('const title = active && draftProductTitle ? draftProductTitle : product.title_ja;');
    expect(librarySource).toContain('title={title}');
    expect(librarySource).toContain('aria-label={`${tVideo("productLibrary.deleteProduct")} ${product.title_ja}`}');
    expect(librarySource).toContain('const tProductStatus = makeAppTranslator("productStatus")');
    expect(librarySource).toContain('const status = productLibraryStatus(product, tProductStatus)');
    expect(operationSource).toContain('{badge ? <Badge className="shrink-0" tone="neutral">{badge}</Badge> : null}');
    expect(referenceTraySource).toContain('tVideo("reference.title")');
    expect(referenceTraySource).toContain('image.original');
    expect(referenceTraySource).toContain('fileName');
    expect(referenceFigureSource).toContain('tVideo("reference.item", { index: index + 1 })');
    expect(referenceFigureSource).toContain('image.original');
    expect(referencePreviewSource).toContain('aria-label={tVideo("reference.previewDialogTitle")}');
    expect(referencePreviewSource).toContain('{image.original}');
    expect(storyboardPanelSource).toContain('tVideo("storyboard.title")');
    expect(storyboardPanelSource).toContain("historyPreview(record.script, appLocale)");
    expect(historyPanelSource).toContain('tVideo("history.title")');
    expect(historyPanelSource).toContain("<VideoHashtagChips tVideo={tVideo}");
    expect(historyPanelSource).toContain("videoDownloadProductContext(product, draft, importText)");
    expect(helperSource).toContain('return tVideo("labels.video", { index: index + 1 });');
    expect(helperSource).toContain('onToast(tVideo("history.tagsCopiedToast"), "ok")');
    expect(helperSource).toContain('function localizedDefaultStoryboardDraft(template: TemplateName, durationSeconds: number, locale: AppLocale): string');
    expect(helperSource).toContain('i18n.t(`app:videoStudio.storyboard.defaultDrafts.${templateKey}`, { lng: locale, returnObjects: true })');
    expect(helperSource).toContain('function storyboardTemplateResourceKey(template: TemplateName): string');

    expect(composerSource).not.toContain('label="模型方案"');
    expect(composerSource).not.toContain('label="视频风格"');
    expect(composerSource).not.toContain('label="视频时长"');
    expect(composerSource).not.toContain('label="成片语言"');
    expect(composerSource).not.toContain('label="生成视频"');
    expect(referenceTraySource).not.toContain(">参考图<");
    expect(referenceFigureSource).not.toContain(">参考图 {index + 1}<");
    expect(referencePreviewSource).not.toContain('aria-label="参考图预览"');
    expect(storyboardPanelSource).not.toContain(">脚本分镜<");
    expect(historyPanelSource).not.toContain(">历史记录<");
  });

  it("keeps concrete model names in the model scheme summary instead of inline panels", async () => {
    const source = await readFile(appPath, "utf8");
    const composerSource = source.slice(source.indexOf("function ProductCreationComposer"), source.indexOf("function ProductComposerReferenceTray"));
    const referenceTraySource = source.slice(source.indexOf("function ProductComposerReferenceTray"), source.indexOf("function StoryboardComposerPanel"));
    const storyboardPanelSource = source.slice(source.indexOf("function StoryboardComposerPanel"), source.indexOf("function VideoHistoryPanel"));

    expect(composerSource).toContain("model-scheme-chip-row");
    expect(composerSource).toContain('{ label: tVideo("modelChips.text"), value: localizedModelConfigChoiceLabel(selectedTextModelConfigId, textModelOptions, tVideo) }');
    expect(composerSource).toContain('{ label: tVideo("modelChips.image"), value: localizedModelConfigChoiceLabel(selectedImageModelConfigId, imageModelOptions, tVideo) }');
    expect(composerSource).toContain('{ label: tVideo("modelChips.video"), value: localizedModelConfigChoiceLabel(selectedVideoModelConfigId, videoModelOptions, tVideo) }');
    expect(composerSource).not.toContain('{ label: "文", value: modelConfigChoiceLabel');
    expect(composerSource).not.toContain('{ label: "图", value: modelConfigChoiceLabel');
    expect(composerSource).not.toContain('{ label: "视", value: modelConfigChoiceLabel');
    expect(composerSource).not.toContain("textModelLabel={modelConfigChoiceLabel");
    expect(referenceTraySource).not.toContain("图片模型");
    expect(referenceTraySource).not.toContain("modelConfigChoiceLabel(selectedImageModelConfigId");
    expect(referenceTraySource).not.toContain("selectedImageModelConfigId");
    expect(referenceTraySource).not.toContain("imageModelOptions");
    expect(storyboardPanelSource).not.toContain("文本模型:");
    expect(storyboardPanelSource).not.toContain("textModelLabel");
  });

  it("surfaces concise per-action estimates inside stable video creation action buttons", async () => {
    const source = await readFile(appPath, "utf8");
    const appSource = source.slice(source.indexOf("export function App()"), source.indexOf("function AppLanguageSwitcher"));
    const workspaceSource = source.slice(source.indexOf("function ProductCreationWorkspace"), source.indexOf("function ProductLibraryHome"));
    const composerSource = source.slice(source.indexOf("function ProductCreationComposer"), source.indexOf("function ProductCreationProductLibrary"));
    const referenceTraySource = source.slice(source.indexOf("function ProductComposerReferenceTray"), source.indexOf("function StoryboardComposerPanel"));
    const storyboardPanelSource = source.slice(source.indexOf("function StoryboardComposerPanel"), source.indexOf("function VideoHistoryPanel"));
    const actionButtonCostSource = source.slice(source.indexOf("function ActionButtonCost"), source.indexOf("function versionLabel"));

    expect(appSource).toContain('postJson<BillingEstimatesResponse>("/api/billing-estimates"');
    expect(appSource).toContain("videoResolution: selectedVideoResolution");
    expect(appSource).toContain("videoAspectRatio: selectedVideoAspectRatio");
    expect(workspaceSource).toContain("billingEstimates={billingEstimates}");
    expect(composerSource).toContain("billingEstimates?: BillingEstimatesResponse");
    expect(composerSource).toContain('organizeProductEstimate={billingEstimates?.estimates.organizeProduct}');
    expect(composerSource).toContain('referenceImagesEstimate={billingEstimates?.estimates.referenceImages}');
    expect(composerSource).toContain('storyboardEstimate={billingEstimates?.estimates.storyboard}');
    expect(composerSource).toContain("estimate={storyboardEstimate}");
    expect(composerSource).toContain('videoEstimate={billingEstimates?.estimates.video}');
    expect(composerSource).toContain('imageEstimate={billingEstimates?.estimates.referenceImages}');
    expect(referenceTraySource).toContain("estimate?: BillingActionEstimate");
    expect(referenceTraySource).toContain('<ActionButtonCost tVideo={tVideo} estimate={estimate} />');
    expect(storyboardPanelSource).toContain("estimate?: BillingActionEstimate");
    expect(storyboardPanelSource).toContain('<ActionButtonCost tVideo={tVideo} estimate={estimate} />');
    expect(source).toContain("function ActionButtonCost");
    expect(source).toContain('amountCny={videoEstimate?.upstreamEstimatedCostCny}');
    expect(actionButtonCostSource).toContain('tVideo("costHints.estimated", {');
    expect(actionButtonCostSource).toContain("amountCny?: number");
    expect(actionButtonCostSource).not.toContain('kind === "video"');
    expect(source).not.toContain("costHints.videoEstimated");
    expect(source).not.toContain("costHints.videoDetail");
    expect(source).not.toContain("本次视频预估");
    expect(source).not.toContain("function ActionCostHint");
    expect(source).not.toContain('tVideo("costHints.estimatedCharge"');
    expect(source).not.toContain("预计扣余额");
    expect(source).not.toContain("生成预检");
  });

  it("moves account controls into the left navigation shell and keeps video content full bleed", async () => {
    const source = await readFile(appPath, "utf8");
    const appShellSource = source.slice(source.indexOf("<main"), source.indexOf("function AccountMenu"));
    const brandSource = appShellSource.slice(appShellSource.indexOf("<BrandLogo"), appShellSource.indexOf("<nav"));
    const accountDockSource = appShellSource.slice(appShellSource.indexOf("app-sidebar-account"), appShellSource.indexOf("</aside>"));

    expect(appShellSource).toContain("app-sidebar-account");
    expect(appShellSource).toContain("<AppLanguageSwitcher");
    expect(appShellSource).toContain("collapsed={sidebarCollapsed}");
    expect(brandSource).not.toContain("<AppLanguageSwitcher");
    expect(accountDockSource).toContain("<AccountMenu");
    expect(accountDockSource).toContain("<AppLanguageSwitcher");
    expect(accountDockSource.indexOf("<AccountMenu")).toBeLessThan(accountDockSource.indexOf("<AppLanguageSwitcher"));
    expect(accountDockSource).toContain("{authSession.authEnabled ? (");
    expect(accountDockSource).toContain(") : null}");
    expect(accountDockSource).toContain('sidebarCollapsed ? "grid gap-1.5 px-1.5" : "grid gap-1.5 px-2.5"');
    expect(accountDockSource).not.toContain("grid-cols-[minmax(0,1fr)_36px]");
    expect(appShellSource).toContain("relative flex h-[72px] items-center");
    expect(appShellSource).not.toContain("relative flex h-[72px] items-center border-b");
    expect(appShellSource).toContain("min-[900px]:grid-cols-[232px_minmax(0,1fr)]");
    expect(appShellSource).toContain("relative z-40 hidden h-dvh min-h-0 border-r");
    expect(appShellSource).toContain('sidebarCollapsed ? "w-[56px] overflow-visible" : "w-[232px] overflow-visible"');
    expect(appShellSource).not.toContain('sidebarCollapsed ? "w-[56px] overflow-visible" : "w-[232px] overflow-hidden"');
    expect(appShellSource).not.toContain("min-[900px]:grid-cols-[184px_minmax(0,1fr)]");
    expect(appShellSource).not.toContain("relative hidden h-dvh min-h-0 overflow-visible");
    expect(appShellSource).toContain("app-sidebar-collapse-rail");
    expect(appShellSource).toContain("app-sidebar-collapse-button");
    expect(appShellSource).toContain("absolute inset-y-0 right-[-10px]");
    expect(appShellSource).toContain("cursor-pointer");
    expect(appShellSource).toContain("app-sidebar-collapse-button pointer-events-none grid h-8 w-8");
    expect(appShellSource).toContain('aria-label={sidebarCollapsed ? tApp("shell.sidebarExpand") : tApp("shell.sidebarCollapse")}');
    expect(appShellSource).toContain("group-hover:opacity-100");
    expect(appShellSource).not.toContain("app-sidebar-collapse-hitbox");
    expect(appShellSource).not.toContain("app-sidebar-resizer");
    expect(appShellSource).not.toContain("MoveHorizontal");
    expect(appShellSource).toContain("group/sidebar-nav-item relative grid min-h-9 w-full min-w-0 overflow-hidden");
    expect(appShellSource).toContain('<span className={cn("min-w-0 truncate", sidebarCollapsed && "sr-only")}>{label}</span>');
    expect(appShellSource).toContain("contentScrollerRef");
    expect(appShellSource).toContain("activeSectionIsCreativeWorkspace");
    expect(appShellSource).toContain("overflow-hidden p-0");
    expect(appShellSource).not.toContain("sticky top-0");
    expect(appShellSource).not.toContain("activeSectionSubtitle");
  });

  it("adds a compact app language switcher to the console sidebar", async () => {
    const source = await readFile(appPath, "utf8");
    const switcherSource = source.slice(source.indexOf("function AppLanguageSwitcher"), source.indexOf("function AccountMenu"));

    expect(source).toContain("Globe2");
    expect(switcherSource).toContain("app-language-switcher");
    expect(switcherSource).toContain("app-language-menu");
    expect(switcherSource).toContain('collapsed ? "mx-auto" : "min-w-0"');
    expect(switcherSource).toContain("grid-cols-[26px_minmax(0,1fr)]");
    expect(switcherSource).toContain('{!collapsed ? <span className="min-w-0 truncate">{getLocaleMeta(currentLocale).label}</span> : null}');
    expect(switcherSource).toContain("bottom-[calc(100%+8px)] left-0 top-auto");
    expect(switcherSource).toContain("supportedLocales.map");
    expect(switcherSource).toContain("getLocaleMeta(locale).label");
    expect(switcherSource).toContain("clientLocaleStorageKey");
    expect(switcherSource).toContain("i18n.changeLanguage(locale)");
    expect(switcherSource).toContain("window.localStorage.setItem");
    expect(switcherSource).toContain("closeOnOutsideClick");
    expect(switcherSource).toContain("closeOnEscape");
    expect(switcherSource).toContain('const languageChangeLabel = i18n.t("common:language.change", { lng: currentLocale });');
    expect(switcherSource).toContain("aria-label={languageChangeLabel}");
    expect(switcherSource).toContain("title={languageChangeLabel}");
    expect(switcherSource).toContain("aria-current={locale === currentLocale ? \"true\" : undefined}");
    expect(source).toContain('{tApp("shell.tagline")}');
    expect(source).toContain("const label = tApp(`navigation.${labelKey}`);");
  });
});
