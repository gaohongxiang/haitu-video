import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const productRoutesPath = "src/server/productRoutes.ts";
const productImportRoutesPath = "src/server/productImportRoutes.ts";
const modelProviderServicePath = "src/server/modelProviderService.ts";

describe("model provider service source boundaries", () => {
  it("keeps AI provider construction out of the HTTP server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const productRoutesSource = await readFile(productRoutesPath, "utf8");
    const productImportRoutesSource = await readFile(productImportRoutesPath, "utf8");

    await expect(access(modelProviderServicePath)).resolves.toBeUndefined();
    expect(productRoutesSource).not.toContain('from "./modelProviderService.js"');
    expect(productImportRoutesSource).toContain('from "./modelProviderService.js"');
    expect(consoleServerSource).not.toContain('from "./modelProviderService.js"');
    expect(consoleServerSource).not.toContain("async function createTextModelProvider(");
    expect(consoleServerSource).not.toContain("async function createImageModelProvider(");
  });

  it("centralizes selected text and image provider construction", async () => {
    const serviceSource = await readFile(modelProviderServicePath, "utf8");

    expect(serviceSource).toContain("export async function createTextModelProvider(");
    expect(serviceSource).toContain("export async function createImageModelProvider(");
    expect(serviceSource).toContain("selectModelConfig");
    expect(serviceSource).toContain("createTextProvider");
    expect(serviceSource).toContain("createImageProvider");
  });
});
