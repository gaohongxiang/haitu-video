import { describe, expect, it } from "vitest";

import { MockVideoProvider } from "../../src/providers/mockVideoProvider.js";
import { createVideoProvider } from "../../src/providers/providerFactory.js";
import { VolcengineSeedanceProvider } from "../../src/providers/volcengine/seedanceProvider.js";

describe("createVideoProvider", () => {
  it("creates the mock provider by name", () => {
    const provider = createVideoProvider("mock");

    expect(provider).toBeInstanceOf(MockVideoProvider);
  });

  it("creates the Volcengine Seedance provider by canonical name and legacy alias", () => {
    expect(createVideoProvider("volcengine-seedance")).toBeInstanceOf(VolcengineSeedanceProvider);
    expect(createVideoProvider("seedance")).toBeInstanceOf(VolcengineSeedanceProvider);
  });

  it("rejects unknown provider names", () => {
    expect(() => createVideoProvider("veo")).toThrow(/Unknown video provider/);
  });
});
