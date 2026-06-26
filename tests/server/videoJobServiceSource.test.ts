import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const productRoutesPath = "src/server/productRoutes.ts";
const videoRoutesPath = "src/server/videoRoutes.ts";
const videoJobServicePath = "src/server/videoJobService.ts";
const productReadinessPath = "src/server/productReadiness.ts";

describe("video job service source boundaries", () => {
  it("keeps video job enqueue orchestration out of the HTTP server module", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const productRoutesSource = await readFile(productRoutesPath, "utf8");
    const videoRoutesSource = await readFile(videoRoutesPath, "utf8");

    await expect(access(videoJobServicePath)).resolves.toBeUndefined();
    expect(consoleServerSource).not.toContain('from "./videoJobService.js"');
    expect(productRoutesSource).toContain('from "./videoJobService.js"');
    expect(videoRoutesSource).toContain('from "./videoJobService.js"');
    expect(consoleServerSource).not.toContain("async function enqueueVideoJob(");
    expect(consoleServerSource).not.toContain("async function enqueueBatchVideoJobs(");
    expect(consoleServerSource).not.toContain("async function enqueueProductVideoJobsBySku(");
  });

  it("centralizes video job enqueue variants in the service module", async () => {
    const serviceSource = await readFile(videoJobServicePath, "utf8");

    expect(serviceSource).toContain("export async function enqueueVideoJob(");
    expect(serviceSource).toContain("export async function enqueueBatchVideoJobs(");
    expect(serviceSource).toContain("export async function enqueueProductVideoJobsBySku(");
    expect(serviceSource).toContain("reserveVideoJobBilling");
    expect(serviceSource).toContain("resolveVideoRequestModel");
  });

  it("reuses shared product readiness checks instead of duplicating paid generation rules", async () => {
    const serviceSource = await readFile(videoJobServicePath, "utf8");
    const productReadinessSource = await readFile(productReadinessPath, "utf8");

    expect(serviceSource).toContain('from "./productReadiness.js"');
    expect(serviceSource).not.toContain("function buildPaidGenerationReadiness(");
    expect(serviceSource).not.toContain("function summarizeReferenceImages(");
    expect(serviceSource).not.toContain("function describeReferenceImages(");
    expect(productReadinessSource).toContain("export async function assertPaidProductReady(");
    expect(productReadinessSource).toContain("export function buildPaidGenerationReadiness(");
    expect(productReadinessSource).toContain("export function summarizeReferenceImages(");
    expect(productReadinessSource).toContain("export async function describeReferenceImages(");
  });
});
