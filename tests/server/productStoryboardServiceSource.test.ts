import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const productRoutesPath = "src/server/productRoutes.ts";
const servicePath = "src/server/productStoryboardService.ts";

describe("product storyboard service source boundaries", () => {
  it("keeps product storyboard persistence out of the HTTP server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const productRoutesSource = await readFile(productRoutesPath, "utf8");

    await expect(access(servicePath)).resolves.toBeUndefined();
    expect(productRoutesSource).toContain('from "./productStoryboardService.js"');
    expect(consoleServerSource).not.toContain('from "./productStoryboardService.js"');
    expect(consoleServerSource).not.toContain("async function listProductStoryboards(");
    expect(consoleServerSource).not.toContain("async function createProductStoryboard(");
    expect(consoleServerSource).not.toContain("async function deleteProductStoryboard(");
    expect(consoleServerSource).not.toContain("function listProductStoryboardsFromDatabase(");
    expect(consoleServerSource).not.toContain("function upsertStoryboardIndex(");
  });

  it("centralizes product storyboard list, create, delete, and normalization in the service module", async () => {
    const serviceSource = await readFile(servicePath, "utf8");

    expect(serviceSource).toContain("export async function listProductStoryboards(");
    expect(serviceSource).toContain("export async function createProductStoryboard(");
    expect(serviceSource).toContain("export async function deleteProductStoryboard(");
    expect(serviceSource).toContain("function listProductStoryboardsFromDatabase(");
    expect(serviceSource).toContain("function upsertStoryboardIndex(");
    expect(serviceSource).toContain("function normalizeStoryboardRecord(");
  });
});
