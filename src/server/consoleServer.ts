import { createServer } from "node:http";

import type { LocalVideoJobQueueOptions } from "./consoleVideoJobQueue.js";
import {
  nodeRequestToFetch,
  RequestBodyTooLargeError,
  writeNodeResponse
} from "./consoleHttpService.js";
import {
  createConsoleServerRuntime,
  type ConsoleServerRuntime
} from "./consoleServerRuntime.js";
import {
  createConsoleRequestHandler
} from "./consoleRequestHandler.js";

export interface ConsoleServerOptions {
  rootDir?: string;
  dataDir?: string;
  fixturesDir?: string;
  outputsDir?: string;
  consoleDistDir?: string;
  fetchImpl?: typeof fetch;
  runMakeVideoPipeline?: LocalVideoJobQueueOptions["runMakeVideoPipeline"];
  autoStartSavedJobs?: boolean;
  now?: () => Date;
}

export interface ConsoleServerHandle {
  fetch(path: string, init?: RequestInit): Promise<Response>;
  fetchJson(path: string, init?: RequestInit): Promise<any>;
  listen(port: number, hostname?: string): Promise<{
    url: string;
    close(): Promise<void>;
  }>;
  publicAssetTokenStoreForTests?: ConsoleServerRuntime["publicAssetTokenStore"];
}

export function createConsoleServer(options: ConsoleServerOptions = {}): ConsoleServerHandle {
  const runtime = createConsoleServerRuntime(options);
  const handle = createConsoleRequestHandler({
    runtime,
    consoleDistDir: options.consoleDistDir,
    fetchImpl: options.fetchImpl,
    runMakeVideoPipeline: options.runMakeVideoPipeline,
    now: options.now
  });

  return {
    async fetch(path: string, init?: RequestInit): Promise<Response> {
      return handle(new Request(`http://localhost${path}`, init));
    },
    async fetchJson(path: string, init?: RequestInit): Promise<any> {
      const response = await handle(new Request(`http://localhost${path}`, init));
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      return body;
    },
    async listen(port: number, hostname = "127.0.0.1") {
      const server = createServer((request, response) => {
        void nodeRequestToFetch(request)
          .then(handle)
          .then((fetchResponse) => writeNodeResponse(response, fetchResponse))
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            response.writeHead(error instanceof RequestBodyTooLargeError ? 413 : 500, { "content-type": "application/json; charset=utf-8" });
            response.end(JSON.stringify({ error: message }));
          });
      });
      await new Promise<void>((resolveListen) => server.listen(port, hostname, resolveListen));
      return {
        url: `http://${hostname}:${port}`,
        close: () =>
          new Promise<void>((resolveClose, reject) =>
            server.close((error) => (error ? reject(error) : resolveClose()))
          ).finally(() => {
            runtime.close();
          })
      };
    },
    publicAssetTokenStoreForTests: runtime.publicAssetTokenStore
  };
}
