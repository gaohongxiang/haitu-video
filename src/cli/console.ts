import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";

import { createConsoleServer } from "../server/consoleServer.js";

interface ConsoleArgs {
  port: number;
  host: string;
}

const activeConsoleListeners: Array<{ close(): Promise<void> }> = [];

export async function runConsoleCli(argv: string[]): Promise<{ url: string }> {
  loadDotenv({ quiet: true });
  const args = parseArgs(argv);
  const server = createConsoleServer();
  const running = await server.listen(args.port, args.host);
  activeConsoleListeners.push(running);
  process.stdout.write(`Haitu console: ${running.url}\n`);
  return { url: running.url };
}

function parseArgs(argv: string[]): ConsoleArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near "${key ?? ""}"`);
    }
    values.set(key.slice(2), value);
  }

  return {
    port: parsePort(values.get("port") ?? process.env.PORT ?? "4173"),
    host: values.get("host") ?? process.env.HOST ?? "127.0.0.1"
  };
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("--port must be an integer between 1 and 65535");
  }
  return port;
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? fileURLToPath(new URL(`file://${process.argv[1]}`)) : "";

if (currentFile === invokedFile) {
  runConsoleCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
