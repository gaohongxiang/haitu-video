import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const appPath = "src/client/App.tsx";
const workflowPath = "src/client/productWorkflowViewModel.ts";

describe("product workflow view-model source boundaries", () => {
  it("keeps product status and import-row logic outside the App component file", async () => {
    const appSource = await readFile(appPath, "utf8");
    const workflowSource = await readFile(workflowPath, "utf8");

    expect(appSource).toContain('from "./productWorkflowViewModel.js"');
    expect(appSource).not.toContain("function productReferenceCount(");
    expect(appSource).not.toContain("function fileImportCanSelect(");
    expect(appSource).not.toContain("function productGenerationReadiness(");
    expect(appSource).not.toContain("function productAutoSaveStatusLabel(");
    expect(appSource).not.toContain("function dedupeProductSummaries(");
    expect(appSource).not.toContain("function productActionSummary(");

    expect(workflowSource).toContain("export function productReferenceCount");
    expect(workflowSource).toContain("export function fileImportCanSelect");
    expect(workflowSource).toContain("export function productGenerationReadiness");
    expect(workflowSource).toContain("export function productAutoSaveStatusLabel");
    expect(workflowSource).toContain("export function dedupeProductSummaries");
    expect(workflowSource).toContain("export function productActionSummary");
  });
});
