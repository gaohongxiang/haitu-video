import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const routesPath = "src/server/settingsTemplateRoutes.ts";
const videoJobServicePath = "src/server/videoJobService.ts";
const servicePath = "src/server/videoTemplateService.ts";

describe("video template service source boundaries", () => {
  it("keeps template catalog management behind the route layer", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const routesSource = await readFile(routesPath, "utf8");

    await expect(access(servicePath)).resolves.toBeUndefined();
    expect(consoleServerSource).not.toContain('from "./videoTemplateService.js"');
    expect(routesSource).toContain('from "./videoTemplateService.js"');
    expect(consoleServerSource).not.toContain("interface TemplateManagementRequest");
    expect(consoleServerSource).not.toContain("async function listVideoTemplates(");
    expect(consoleServerSource).not.toContain("async function saveVideoTemplates(");
    expect(consoleServerSource).not.toContain("async function assertTemplateEnabled(");
    expect(consoleServerSource).not.toContain("assertTemplateEnabled: (input)");
    expect(consoleServerSource).not.toContain("buildTemplateCatalogState");
    expect(consoleServerSource).not.toContain("normalizeEnabledTemplates");
    expect(consoleServerSource).not.toContain("isScriptTemplate");
  });

  it("centralizes template enablement checks for direct and queued video creation", async () => {
    const videoJobServiceSource = await readFile(videoJobServicePath, "utf8");
    const serviceSource = await readFile(servicePath, "utf8");

    expect(videoJobServiceSource).toContain('from "./videoTemplateService.js"');
    expect(videoJobServiceSource).not.toContain("async function assertTemplateEnabled(");
    expect(serviceSource).toContain("export interface TemplateManagementRequest");
    expect(serviceSource).toContain("export async function listVideoTemplates(");
    expect(serviceSource).toContain("export async function saveVideoTemplates(");
    expect(serviceSource).toContain("export async function assertTemplateEnabled(");
    expect(serviceSource).toContain("buildTemplateCatalogState");
    expect(serviceSource).toContain("normalizeEnabledTemplates");
    expect(serviceSource).toContain("isScriptTemplate");
  });
});
