import { describe, expect, it, vi } from "vitest";

import { runConsoleCli } from "../../src/cli/console.js";
import { createConsoleServer } from "../../src/server/consoleServer.js";

vi.mock("../../src/server/consoleServer.js", () => ({
  createConsoleServer: vi.fn()
}));

describe("console CLI", () => {
  it("uses PORT and HOST environment defaults for VPS service startup", async () => {
    vi.stubEnv("PORT", "4188");
    vi.stubEnv("HOST", "0.0.0.0");
    const listen = vi.fn(async (port: number, host: string) => ({
      url: `http://${host}:${port}`,
      close: async () => undefined
    }));
    vi.mocked(createConsoleServer).mockReturnValue({
      fetch: vi.fn(),
      fetchJson: vi.fn(),
      listen
    });

    await runConsoleCli([]);

    expect(listen).toHaveBeenCalledWith(4188, "0.0.0.0");
    vi.unstubAllEnvs();
  });

  it("lets explicit --port and --host override environment defaults", async () => {
    vi.stubEnv("PORT", "4188");
    vi.stubEnv("HOST", "0.0.0.0");
    const listen = vi.fn(async (port: number, host: string) => ({
      url: `http://${host}:${port}`,
      close: async () => undefined
    }));
    vi.mocked(createConsoleServer).mockReturnValue({
      fetch: vi.fn(),
      fetchJson: vi.fn(),
      listen
    });

    await runConsoleCli(["--port", "4199", "--host", "127.0.0.1"]);

    expect(listen).toHaveBeenCalledWith(4199, "127.0.0.1");
    vi.unstubAllEnvs();
  });
});
