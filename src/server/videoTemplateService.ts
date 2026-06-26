import type { ScriptTemplate } from "../core/scriptGenerator.js";
import {
  buildTemplateCatalogState,
  isScriptTemplate,
  normalizeEnabledTemplates
} from "../core/templateCatalog.js";
import type { FileConsoleSettingsStore } from "./consoleSettings.js";

export interface TemplateManagementRequest {
  defaultTemplate?: unknown;
  enabledTemplates?: unknown;
}

export async function listVideoTemplates(settingsStore: FileConsoleSettingsStore) {
  const settings = await settingsStore.read();
  return buildTemplateCatalogState({
    enabledTemplates: settings.enabledTemplates,
    defaultTemplate: settings.defaultTemplate
  });
}

export async function saveVideoTemplates(
  settingsStore: FileConsoleSettingsStore,
  input: TemplateManagementRequest
) {
  const enabledTemplates = normalizeEnabledTemplates(input.enabledTemplates);
  const requestedDefault = isScriptTemplate(input.defaultTemplate) ? input.defaultTemplate : undefined;
  const defaultTemplate = requestedDefault && enabledTemplates.includes(requestedDefault)
    ? requestedDefault
    : enabledTemplates[0];
  const settings = await settingsStore.write({
    enabledTemplates,
    defaultTemplate
  });
  return buildTemplateCatalogState({
    enabledTemplates: settings.enabledTemplates,
    defaultTemplate: settings.defaultTemplate
  });
}

export async function assertTemplateEnabled(
  body: Pick<{ template?: ScriptTemplate }, "template">,
  settingsStore: FileConsoleSettingsStore
): Promise<void> {
  const settings = await settingsStore.read();
  const template = body.template ?? settings.defaultTemplate;
  if (!settings.enabledTemplates.includes(template)) {
    throw new Error(`Template ${template} is disabled. Enable it in template management before using it.`);
  }
}
