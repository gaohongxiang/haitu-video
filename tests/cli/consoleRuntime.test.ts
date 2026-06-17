import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

let child: ChildProcess | undefined;

afterEach(async () => {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      child?.once("exit", () => resolve());
    });
  }
  child = undefined;
});

describe("console CLI runtime", () => {
  it("keeps the HTTP server alive after printing the console URL", async () => {
    const port = await getFreePort();
    const stdout: string[] = [];
    const stderr: string[] = [];
    child = spawn(join(process.cwd(), "node_modules/.bin/tsx"), [
      "src/cli/console.ts",
      "--host",
      "127.0.0.1",
      "--port",
      String(port)
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HAITU_SECRET_KEY: "0123456789abcdef0123456789abcdef"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout?.on("data", (chunk) => stdout.push(String(chunk)));
    child.stderr?.on("data", (chunk) => stderr.push(String(chunk)));

    await waitFor(() => stdout.join("").includes(`Haitu console: http://127.0.0.1:${port}`), 15_000);
    await sleep(300);

    expect(child.exitCode, stderr.join("")).toBeNull();
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(response.status).toBe(200);
  });
});

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await sleep(50);
  }
  throw new Error("Timed out waiting for console CLI output.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
