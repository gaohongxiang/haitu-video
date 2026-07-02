import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const appPath = "src/client/App.tsx";
const apiModelConfigPanelPath = "src/client/components/apiModelConfigPanel.tsx";
const consoleApiClientPath = "src/client/consoleApiClient.ts";
const modelServiceSelectionPath = "src/client/modelServiceSelection.ts";
const sharedModelConfigPath = "src/client/components/modelServiceConfig.tsx";

describe("api service mode source", () => {
  it("loads model service preferences without model bundles", async () => {
    const source = await readFile(appPath, "utf8");
    const apiClientSource = await readFile(consoleApiClientPath, "utf8");
    const composerSource = source.slice(source.indexOf("function ProductCreationComposer"), source.indexOf("function ProductLibraryHome"));

    expect(source).toContain('from "./components/apiModelConfigPanel.js"');
    expect(source).toContain('from "./modelServiceSelection.js"');
    expect(source).not.toContain('from "./modelServiceBundles.js"');
    expect(source).toContain("<ApiModelConfigPanel");
    expect(source).toContain("modelServicePreferenceResponse");
    expect(source).toContain("selectedTextModelConfigId");
    expect(source).toContain("selectedImageModelConfigId");
    expect(source).toContain("selectedVideoModelConfigId");
    expect(source).not.toContain("selectedModelSchemeId");
    expect(source).not.toContain("modelSchemeOptions");
    expect(source).not.toContain("applyModelSchemeSelection");
    expect(source).not.toContain("saveModelBundle");
    expect(source).not.toContain("deleteModelBundle");
    expect(apiClientSource).not.toContain("modelBundlesResponse");
    expect(apiClientSource).not.toContain('"/api/model-bundles"');
    expect(composerSource).not.toContain('label={tVideo("controls.modelScheme")}');
    expect(composerSource).not.toContain("localizedModelSchemeChoiceLabel");
    expect(composerSource).not.toContain("localizedModelSchemeSummary");
  });

  it("keeps model selection rules in a pure capability module", async () => {
    const source = await readFile(modelServiceSelectionPath, "utf8");

    expect(source).toContain('export type ModelConfigChoice = "auto" | string;');
    expect(source).toContain('export type ModelCapability = "text" | "image" | "video";');
    expect(source).toContain("export interface ModelServicePreference");
    expect(source).toContain("textModelConfigId?: ModelConfigChoice");
    expect(source).toContain("imageModelConfigId?: ModelConfigChoice");
    expect(source).toContain("videoModelConfigId?: ModelConfigChoice");
    expect(source).toContain("modelConfigChoiceLabel");
    expect(source).toContain("effectiveModelConfigChoice");
    expect(source).toContain("configuredModelOptions");
    expect(source).toContain("return models.map((model) => model.configId)");
    expect(source).not.toContain('return ["auto", ...models.map((model) => model.configId)');
    expect(source).not.toContain('appText("videoStudio.models.auto"');
    expect(source).toContain('value !== "auto" && options.includes(value)');
    expect(source).toContain('return options[0] ?? "auto";');
    expect(source).toContain("ownerModelsForGroup");
    expect(source).toContain("modelsForOwnerAndCapability");
    expect(source).not.toContain("Bundle");
    expect(source).not.toContain("bundle");
    expect(source).not.toContain("modelScheme");
  });

  it("shows service mode and type-based model configuration without bundle management", async () => {
    const source = await readFile(apiModelConfigPanelPath, "utf8");
    const sharedSource = await readFile(sharedModelConfigPath, "utf8");

    expect(source).toContain("export function ApiModelConfigPanel");
    expect(source).toContain("function ApiServiceModeCards");
    expect(source).toContain("function ModelServiceOwnerPanel");
    expect(source).toContain("<SharedModelServiceGroup");
    expect(source).toContain("ownerModelsForGroup(group.models, apiOwner)");
    expect(source).toContain('title: tSettings("groups.text.title")');
    expect(source).toContain('title: tSettings("groups.image.title")');
    expect(source).toContain('title: tSettings("groups.video.title")');
    expect(source).not.toContain("ModelBundle");
    expect(source).not.toContain("Bundle");
    expect(source).not.toContain("bundle");
    expect(source).not.toContain("组合");
    expect(source).not.toContain("bundles.");
    expect(sharedSource).toContain("export function EnabledSwitchButton");
    expect(sharedSource).toContain("<EnabledSwitchButton");
  });

  it("keeps platform-hosted model names on the same line without availability copy", async () => {
    const sharedSource = await readFile(sharedModelConfigPath, "utf8");
    const platformBranchStart = sharedSource.indexOf('if (!canManageServices && apiOwner === "platform")');
    const platformBranch = sharedSource.slice(
      platformBranchStart,
      sharedSource.indexOf('    <section className="grid gap-2.5', platformBranchStart)
    );

    expect(platformBranch).not.toContain('tSettings("available"');
    expect(platformBranch).not.toContain("<Badge");
    expect(platformBranch).not.toContain("pl-4");
    expect(platformBranch).toContain("flex min-w-0 flex-wrap items-center");
    expect(platformBranch).toContain("platformModelNames.map");
  });

  it("routes the creative toolbar to the active capability model only", async () => {
    const source = await readFile(appPath, "utf8");
    const settingsTraySource = source.slice(source.indexOf("function ProductCreativeSettingsTray"), source.indexOf("function ProductCreativeModeSwitch"));
    const storyboardPanelSource = source.slice(source.indexOf("function StoryboardComposerPanel"), source.indexOf("function VideoHistoryPanel"));

    expect(settingsTraySource).not.toContain("activeModelSchemeId");
    expect(settingsTraySource).not.toContain("modelSchemeOptions");
    expect(settingsTraySource).not.toContain("onModelSchemeChange");
    expect(settingsTraySource).not.toContain('label={tVideo("controls.modelScheme")}');
    expect(storyboardPanelSource).toContain("selectedImageModelConfigId");
    expect(storyboardPanelSource).toContain("selectedVideoModelConfigId");
    expect(storyboardPanelSource).toContain('mode === "image" ? selectedImageModelConfigId : selectedVideoModelConfigId');
    expect(storyboardPanelSource).toContain('mode === "image" ? onImageModelConfigChange : onVideoModelConfigChange');
    expect(storyboardPanelSource).toContain('mode === "image" ? imageModelOptions : videoModelOptions');
  });
});
