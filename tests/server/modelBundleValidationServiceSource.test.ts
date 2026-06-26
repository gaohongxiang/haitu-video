import { access, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const consoleServerPath = "src/server/consoleServer.ts";
const routesPath = "src/server/walletModelRoutes.ts";
const servicePath = "src/server/modelBundleValidationService.ts";

describe("model bundle validation service source boundaries", () => {
  it("keeps model bundle and preference validation rules behind the route layer", async () => {
    const consoleServerSource = await readFile(consoleServerPath, "utf8");
    const routesSource = await readFile(routesPath, "utf8");

    await expect(access(servicePath)).resolves.toBeUndefined();
    expect(consoleServerSource).not.toContain('from "./modelBundleValidationService.js"');
    expect(routesSource).toContain('from "./modelBundleValidationService.js"');
    expect(consoleServerSource).not.toContain("async function assertModelBundleConfigsExist(");
    expect(consoleServerSource).not.toContain("async function assertBundleConfigExists(");
    expect(consoleServerSource).not.toContain("async function assertModelServicePreferenceBundlesExist(");
    expect(consoleServerSource).not.toContain("组合引用的模型配置不存在或已被删除。");
    expect(consoleServerSource).not.toContain("选择的平台模型组合不存在或已被删除。");
    expect(consoleServerSource).not.toContain("选择的自带 API 组合不存在或已被删除。");
  });

  it("centralizes model config ownership and service preference bundle validation", async () => {
    const serviceSource = await readFile(servicePath, "utf8");

    expect(serviceSource).toContain("export async function assertModelBundleConfigsExist(");
    expect(serviceSource).toContain("async function assertBundleConfigExists(");
    expect(serviceSource).toContain("export async function assertModelServicePreferenceBundlesExist(");
    expect(serviceSource).toContain("selectModelConfig");
    expect(serviceSource).toContain("组合引用的模型配置不存在或已被删除。");
    expect(serviceSource).toContain("平台模型模式只能选择平台组合。");
    expect(serviceSource).toContain("自带 API 模式只能选择自带 API 组合。");
  });
});
