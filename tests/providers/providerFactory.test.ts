import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MockVideoProvider } from "../../src/providers/mockVideoProvider.js";
import { createVideoProvider } from "../../src/providers/providerFactory.js";
import { VolcengineSeedanceProvider } from "../../src/providers/volcengine/seedanceProvider.js";

describe("createVideoProvider", () => {
  it("creates the mock provider by name", () => {
    const provider = createVideoProvider("mock");

    expect(provider).toBeInstanceOf(MockVideoProvider);
  });

  it("creates the Volcengine Seedance provider by canonical name only", () => {
    expect(createVideoProvider("volcengine-seedance")).toBeInstanceOf(VolcengineSeedanceProvider);
  });

  it("does not keep the old seedance provider alias", () => {
    expect(() => createVideoProvider("seedance")).toThrow(/Unknown video provider/);
  });

  it("does not keep the old seedance provider module shim", () => {
    expect(existsSync(join(process.cwd(), "src/providers/seedanceProvider.ts"))).toBe(false);
  });

  it("rejects unknown provider names", () => {
    expect(() => createVideoProvider("veo")).toThrow(/Unknown video provider/);
  });
});
