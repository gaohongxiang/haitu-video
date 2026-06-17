# Seedance Reference Asset URL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make production Seedance jobs use short-lived HTTPS reference image URLs and preserve provider error details.

**Architecture:** Add a local signed asset URL registry owned by the console server. Thread an optional reference-image URL resolver from the console queue into the Seedance provider so product-local files become provider-readable URLs instead of data URIs. Keep object storage out of this implementation, but document a future storage migration plan.

**Tech Stack:** TypeScript, Node HTTP server, Vitest, local filesystem storage, SQLite-backed job metadata.

---

## File Structure

- Create `src/server/publicAssetTokenStore.ts`: in-memory token registry for local file paths, TTL, mime type, and safe lookup.
- Modify `src/server/consoleServer.ts`: instantiate the registry, expose `GET/HEAD /api/public-assets/:token`, build public asset URLs from `BETTER_AUTH_URL`, and pass a resolver into video job queues.
- Modify `src/server/consoleVideoJobQueue.ts`: accept and forward a reference-image URL resolver to `runMakeVideoPipeline`; store richer failure details in job JSON.
- Modify `src/pipeline/makeVideoPipeline.ts`: accept optional provider reference-image resolver and pass it to `createVideoProvider`.
- Modify `src/providers/providerFactory.ts`: accept and pass provider-specific resolver options.
- Modify `src/providers/volcengine/seedanceProvider.ts`: use resolver for local reference images, record provider phase metadata on failures, keep remote URLs unchanged.
- Modify `src/providers/types.ts`: add provider option types if needed.
- Add or modify tests in `tests/server/consoleApi.test.ts`, `tests/server/consoleVideoJobQueue.test.ts`, and `tests/providers/seedanceProvider.test.ts`.
- Create `docs/superpowers/plans/2026-06-17-object-storage-future.md`: future implementation outline for R2/S3/TOS/OSS asset storage.

## Task 1: Public Asset Token Store

**Files:**
- Create: `src/server/publicAssetTokenStore.ts`
- Test: `tests/server/publicAssetTokenStore.test.ts`

- [ ] **Step 1: Write failing tests for token create, lookup, expiry, and path safety**

Create `tests/server/publicAssetTokenStore.test.ts`:

```ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { PublicAssetTokenStore } from "../../src/server/publicAssetTokenStore.js";

describe("PublicAssetTokenStore", () => {
  it("creates and resolves an unexpired token for a file inside the root", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-public-assets-"));
    const filePath = join(root, "image.png");
    await writeFile(filePath, "png");
    const store = new PublicAssetTokenStore({
      rootDir: root,
      now: () => new Date("2026-06-17T00:00:00.000Z")
    });

    const asset = store.create({
      filePath,
      mimeType: "image/png",
      workspaceId: "workspace-1",
      ttlMs: 60_000
    });

    expect(asset.urlPath).toMatch(/^\/api\/public-assets\/[A-Za-z0-9_-]+$/);
    expect(store.resolve(asset.token)).toEqual({
      token: asset.token,
      filePath: resolve(filePath),
      mimeType: "image/png",
      workspaceId: "workspace-1",
      expiresAt: "2026-06-17T00:01:00.000Z"
    });
  });

  it("rejects expired and unknown tokens", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-public-assets-"));
    const filePath = join(root, "image.png");
    await writeFile(filePath, "png");
    let now = new Date("2026-06-17T00:00:00.000Z");
    const store = new PublicAssetTokenStore({ rootDir: root, now: () => now });
    const asset = store.create({
      filePath,
      mimeType: "image/png",
      workspaceId: "workspace-1",
      ttlMs: 1_000
    });

    expect(store.resolve("missing")).toBeUndefined();
    now = new Date("2026-06-17T00:00:02.000Z");
    expect(store.resolve(asset.token)).toBeUndefined();
  });

  it("rejects paths outside the configured root", async () => {
    const root = await mkdtemp(join(tmpdir(), "haitu-public-assets-"));
    const outside = await mkdtemp(join(tmpdir(), "haitu-outside-"));
    const store = new PublicAssetTokenStore({ rootDir: root });

    expect(() =>
      store.create({
        filePath: join(outside, "image.png"),
        mimeType: "image/png",
        workspaceId: "workspace-1",
        ttlMs: 60_000
      })
    ).toThrow("Public asset path must stay inside data root.");
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
npm test -- tests/server/publicAssetTokenStore.test.ts
```

Expected: FAIL because `src/server/publicAssetTokenStore.ts` does not exist.

- [ ] **Step 3: Implement the token store**

Create `src/server/publicAssetTokenStore.ts`:

```ts
import { randomBytes } from "node:crypto";
import { relative, resolve } from "node:path";

export interface PublicAssetTokenRecord {
  token: string;
  filePath: string;
  mimeType: string;
  workspaceId: string;
  expiresAt: string;
}

export interface PublicAssetTokenStoreOptions {
  rootDir: string;
  now?: () => Date;
}

export interface CreatePublicAssetTokenInput {
  filePath: string;
  mimeType: string;
  workspaceId: string;
  ttlMs: number;
}

export interface CreatedPublicAssetToken extends PublicAssetTokenRecord {
  urlPath: string;
}

export class PublicAssetTokenStore {
  private readonly rootDir: string;
  private readonly records = new Map<string, PublicAssetTokenRecord>();

  constructor(private readonly options: PublicAssetTokenStoreOptions) {
    this.rootDir = resolve(options.rootDir);
  }

  create(input: CreatePublicAssetTokenInput): CreatedPublicAssetToken {
    this.cleanupExpired();
    const filePath = resolve(input.filePath);
    if (!isInside(this.rootDir, filePath)) {
      throw new Error("Public asset path must stay inside data root.");
    }
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(this.now().getTime() + input.ttlMs).toISOString();
    const record: PublicAssetTokenRecord = {
      token,
      filePath,
      mimeType: input.mimeType,
      workspaceId: input.workspaceId,
      expiresAt
    };
    this.records.set(token, record);
    return {
      ...record,
      urlPath: `/api/public-assets/${token}`
    };
  }

  resolve(token: string): PublicAssetTokenRecord | undefined {
    this.cleanupExpired();
    const record = this.records.get(token);
    if (!record) {
      return undefined;
    }
    if (Date.parse(record.expiresAt) <= this.now().getTime()) {
      this.records.delete(token);
      return undefined;
    }
    if (!isInside(this.rootDir, record.filePath)) {
      this.records.delete(token);
      return undefined;
    }
    return record;
  }

  private cleanupExpired(): void {
    const nowMs = this.now().getTime();
    for (const [token, record] of this.records) {
      if (Date.parse(record.expiresAt) <= nowMs) {
        this.records.delete(token);
      }
    }
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

function isInside(rootDir: string, filePath: string): boolean {
  const rel = relative(rootDir, filePath);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/") && !rel.startsWith("\\"));
}
```

- [ ] **Step 4: Run the token store test and verify it passes**

Run:

```bash
npm test -- tests/server/publicAssetTokenStore.test.ts
```

Expected: PASS.

## Task 2: Public Asset HTTP Route

**Files:**
- Modify: `src/server/consoleServer.ts`
- Test: `tests/server/consoleApi.test.ts`

- [ ] **Step 1: Add failing route tests**

Add tests to `tests/server/consoleApi.test.ts` near other media/static route tests:

```ts
it("serves public asset tokens without auth and rejects expired tokens", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "haitu-console-public-assets-"));
  const dataDir = join(rootDir, "data");
  const assetPath = join(dataDir, "workspaces", "default", "products", "sku", "refs", "image.png");
  await mkdir(dirname(assetPath), { recursive: true });
  await writeFile(assetPath, "image-bytes");
  const server = createConsoleServer({
    rootDir,
    dataDir,
    autoStartSavedJobs: false,
    now: () => new Date("2026-06-17T00:00:00.000Z")
  });
  const tokenStore = server.publicAssetTokenStoreForTests;
  const token = tokenStore.create({
    filePath: assetPath,
    mimeType: "image/png",
    workspaceId: "default",
    ttlMs: 60_000
  });

  const response = await server.fetch(token.urlPath);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(await response.text()).toBe("image-bytes");

  const missing = await server.fetch("/api/public-assets/missing");
  expect(missing.status).toBe(404);
});
```

If `createConsoleServer` does not expose a test-only token store today, add that to `ConsoleServerHandle` in the implementation step.

- [ ] **Step 2: Run the route test and verify it fails**

Run:

```bash
npm test -- tests/server/consoleApi.test.ts
```

Expected: FAIL because `/api/public-assets/:token` is not implemented.

- [ ] **Step 3: Implement route and test-only handle access**

Modify `src/server/consoleServer.ts`:

```ts
import { PublicAssetTokenStore } from "./publicAssetTokenStore.js";
```

Add to `ConsoleServerOptions`:

```ts
  now?: () => Date;
```

Add to `ConsoleServerHandle`:

```ts
  publicAssetTokenStoreForTests: PublicAssetTokenStore;
```

Instantiate after `dataDir` is known:

```ts
  const publicAssetTokenStore = new PublicAssetTokenStore({
    rootDir: dataDir,
    now: options.now
  });
```

Add this route before the auth guard:

```ts
      const publicAssetMatch = url.pathname.match(/^\/api\/public-assets\/([A-Za-z0-9_-]+)$/);
      if (publicAssetMatch && (request.method === "GET" || request.method === "HEAD")) {
        return publicAssetResponse(publicAssetTokenStore, publicAssetMatch[1] ?? "", {
          head: request.method === "HEAD"
        });
      }
```

Add helper near `mediaResponse`:

```ts
async function publicAssetResponse(
  store: PublicAssetTokenStore,
  token: string,
  options: { head: boolean }
): Promise<Response> {
  const record = store.resolve(token);
  if (!record) {
    return jsonResponse({ error: "Public asset not found or expired." }, 404);
  }
  try {
    await stat(record.filePath);
    return new Response(options.head ? undefined : await readFile(record.filePath), {
      headers: {
        "content-type": record.mimeType,
        "cache-control": "private, max-age=300"
      }
    });
  } catch {
    return jsonResponse({ error: "Public asset not found or expired." }, 404);
  }
}
```

Include `publicAssetTokenStoreForTests: publicAssetTokenStore` in the returned handle.

- [ ] **Step 4: Run the route test and verify it passes**

Run:

```bash
npm test -- tests/server/consoleApi.test.ts
```

Expected: PASS.

## Task 3: Reference Image URL Resolver Through Pipeline

**Files:**
- Modify: `src/providers/types.ts`
- Modify: `src/providers/providerFactory.ts`
- Modify: `src/pipeline/makeVideoPipeline.ts`
- Modify: `src/server/consoleVideoJobQueue.ts`
- Modify: `src/server/consoleServer.ts`
- Test: `tests/providers/seedanceProvider.test.ts`

- [ ] **Step 1: Add failing provider test for local image resolver**

In `tests/providers/seedanceProvider.test.ts`, add:

```ts
it("uses the configured reference image URL resolver for local files", async () => {
  const calls: Array<{ input: string }> = [];
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  const provider = new VolcengineSeedanceProvider({
    apiKey: "seedance-key",
    baseUrl: "https://ark.example.test",
    model: "doubao-seedance-2-0-fast-260128",
    referenceImageUrlResolver: async (reference) => {
      calls.push({ input: reference });
      return `https://haitu.online/api/public-assets/token-${calls.length}`;
    },
    fetchImpl: (async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      if (String(url).endsWith("/api/v3/contents/generations/tasks") && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "task-1", status: "queued" }), { status: 200 });
      }
      if (String(url).endsWith("/api/v3/contents/generations/tasks/task-1")) {
        return new Response(JSON.stringify({
          id: "task-1",
          status: "succeeded",
          output: { video_url: "https://video.example.test/out.mp4" }
        }), { status: 200 });
      }
      return new Response("video", { status: 200 });
    }) as typeof fetch
  });

  await provider.generateVideo({
    jobId: "job-1",
    productSku: "sku-1",
    prompt: "prompt",
    script: "script",
    durationSeconds: 10,
    aspectRatio: "9:16",
    outputDir: await mkdtemp(join(tmpdir(), "seedance-provider-")),
    referenceImages: ["/local/reference.png"],
    finalLanguage: "ja"
  });

  const createCall = fetchCalls.find((call) => call.url.endsWith("/api/v3/contents/generations/tasks"));
  const body = JSON.parse(String(createCall?.init?.body));
  expect(calls).toEqual([{ input: "/local/reference.png" }]);
  expect(body.content[1].image_url.url).toBe("https://haitu.online/api/public-assets/token-1");
});
```

- [ ] **Step 2: Add failing provider test for remote pass-through**

In the same test file, add:

```ts
it("does not call the resolver for remote HTTPS reference images", async () => {
  let resolverCalls = 0;
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  const provider = new VolcengineSeedanceProvider({
    apiKey: "seedance-key",
    baseUrl: "https://ark.example.test",
    referenceImageUrlResolver: async () => {
      resolverCalls += 1;
      return "https://haitu.online/api/public-assets/unused";
    },
    fetchImpl: (async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      if (String(url).endsWith("/api/v3/contents/generations/tasks") && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "task-1", status: "queued" }), { status: 200 });
      }
      if (String(url).endsWith("/api/v3/contents/generations/tasks/task-1")) {
        return new Response(JSON.stringify({
          id: "task-1",
          status: "succeeded",
          output: { video_url: "https://video.example.test/out.mp4" }
        }), { status: 200 });
      }
      return new Response("video", { status: 200 });
    }) as typeof fetch
  });

  await provider.generateVideo({
    jobId: "job-1",
    productSku: "sku-1",
    prompt: "prompt",
    script: "script",
    durationSeconds: 10,
    aspectRatio: "9:16",
    outputDir: await mkdtemp(join(tmpdir(), "seedance-provider-")),
    referenceImages: ["https://cdn.example.test/reference.png"],
    finalLanguage: "ja"
  });

  const createCall = fetchCalls.find((call) => call.url.endsWith("/api/v3/contents/generations/tasks"));
  const body = JSON.parse(String(createCall?.init?.body));
  expect(resolverCalls).toBe(0);
  expect(body.content[1].image_url.url).toBe("https://cdn.example.test/reference.png");
});
```

- [ ] **Step 3: Run provider tests and verify they fail**

Run:

```bash
npm test -- tests/providers/seedanceProvider.test.ts
```

Expected: FAIL because `referenceImageUrlResolver` is not supported.

- [ ] **Step 4: Add resolver types and provider factory wiring**

Modify `src/providers/types.ts`:

```ts
export type ReferenceImageUrlResolver = (reference: string) => Promise<string>;
```

Modify `src/providers/providerFactory.ts`:

```ts
import type { ReferenceImageUrlResolver } from "./types.js";

export interface CreateVideoProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  referenceImageUrlResolver?: ReferenceImageUrlResolver;
}
```

Pass `referenceImageUrlResolver: options.referenceImageUrlResolver` when creating `VolcengineSeedanceProvider`.

- [ ] **Step 5: Implement resolver support in Seedance provider**

Modify `src/providers/volcengine/seedanceProvider.ts`:

```ts
import type { ReferenceImageUrlResolver, VideoProvider, VideoProviderRequest, VideoProviderResult } from "../types.js";
```

Add to options and class:

```ts
  referenceImageUrlResolver?: ReferenceImageUrlResolver;
```

```ts
  private readonly referenceImageUrlResolver?: ReferenceImageUrlResolver;
```

In constructor:

```ts
    this.referenceImageUrlResolver = options.referenceImageUrlResolver;
```

Replace the image URL call:

```ts
          url: await this.normalizeReferenceImage(referenceImage)
```

Add method:

```ts
  private async normalizeReferenceImage(reference: string): Promise<string> {
    if (reference.startsWith("http://") || reference.startsWith("https://")) {
      return reference;
    }
    if (reference.startsWith("data:image/") || reference.startsWith("asset://")) {
      return reference;
    }
    if (this.referenceImageUrlResolver) {
      return this.referenceImageUrlResolver(reference);
    }
    return normalizeImageReference(reference);
  }
```

- [ ] **Step 6: Thread resolver through pipeline and queue**

Modify `src/pipeline/makeVideoPipeline.ts`:

```ts
import type { MoneyAmount, ReferenceImageUrlResolver } from "../providers/types.js";
```

Add to `MakeVideoPipelineInput`:

```ts
  referenceImageUrlResolver?: ReferenceImageUrlResolver;
```

Pass into `createVideoProvider`:

```ts
        referenceImageUrlResolver: input.referenceImageUrlResolver
```

Modify `src/server/consoleVideoJobQueue.ts`:

```ts
import type { ReferenceImageUrlResolver } from "../providers/types.js";
```

Add to `LocalVideoJobQueueOptions`:

```ts
  referenceImageUrlResolver?: ReferenceImageUrlResolver;
```

Pass to pipeline:

```ts
        referenceImageUrlResolver: this.options.referenceImageUrlResolver
```

- [ ] **Step 7: Build console resolver using public URL base**

Modify `src/server/consoleServer.ts`:

Add helpers:

```ts
const PUBLIC_ASSET_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

function publicBaseUrlFromEnv(): string | undefined {
  return process.env.HAITU_PUBLIC_BASE_URL ?? process.env.BETTER_AUTH_URL;
}

function joinPublicUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function mimeTypeForAssetPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".webp") {
    return "image/webp";
  }
  return "image/png";
}

function localReferencePathForPublicAsset(dataDir: string, reference: string): string {
  const filePath = isAbsolute(reference) ? reference : resolve(dataDir, reference);
  if (!isPathInsideRoot(dataDir, filePath)) {
    throw new Error(`Path is outside data root: ${reference}`);
  }
  return filePath;
}

function createReferenceImageUrlResolver(input: {
  dataDir: string;
  workspaceId: string;
  publicBaseUrl: string | undefined;
  publicAssetTokenStore: PublicAssetTokenStore;
}): ReferenceImageUrlResolver | undefined {
  if (!input.publicBaseUrl) {
    return undefined;
  }
  return async (reference) => {
    const filePath = localReferencePathForPublicAsset(input.dataDir, reference);
    const token = input.publicAssetTokenStore.create({
      filePath,
      mimeType: mimeTypeForAssetPath(filePath),
      workspaceId: input.workspaceId,
      ttlMs: PUBLIC_ASSET_TOKEN_TTL_MS
    });
    return joinPublicUrl(input.publicBaseUrl, token.urlPath);
  };
}
```

Create a default-workspace resolver after the token store:

```ts
  const defaultReferenceImageUrlResolver = createReferenceImageUrlResolver({
    dataDir,
    workspaceId: DEFAULT_WORKSPACE_ID,
    publicBaseUrl: publicBaseUrlFromEnv(),
    publicAssetTokenStore
  });
```

Pass `defaultReferenceImageUrlResolver` into the default `LocalVideoJobQueue`. When constructing workspace-specific queues, call `createReferenceImageUrlResolver` with that workspace id and pass the resulting resolver into the queue.

- [ ] **Step 8: Run provider and relevant server tests**

Run:

```bash
npm test -- tests/providers/seedanceProvider.test.ts tests/server/consoleVideoJobQueue.test.ts tests/server/consoleApi.test.ts
```

Expected: PASS.

## Task 4: Rich Provider Failure Details

**Files:**
- Modify: `src/server/consoleVideoJobQueue.ts`
- Modify: `src/providers/volcengine/seedanceProvider.ts`
- Test: `tests/server/consoleVideoJobQueue.test.ts`

- [ ] **Step 1: Add failing queue test for error details**

Add to `tests/server/consoleVideoJobQueue.test.ts`:

```ts
it("stores provider error details when a video job fails", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "haitu-video-job-error-"));
  const productPath = join(rootDir, "product.json");
  await writeFile(productPath, JSON.stringify(validProductFacts({ sku: "SKU-ERR" })));
  const settingsStore = new FileConsoleSettingsStore(join(rootDir, "settings.json"));
  const queue = new LocalVideoJobQueue({
    rootDir,
    outputsDir: join(rootDir, "jobs"),
    settingsStore,
    runMakeVideoPipeline: async () => {
      const cause = Object.assign(new Error("Headers Timeout Error"), {
        code: "UND_ERR_HEADERS_TIMEOUT"
      });
      throw Object.assign(new Error("fetch failed"), {
        name: "TypeError",
        cause,
        providerPhase: "create-task",
        providerName: "volcengine-seedance",
        providerModel: "doubao-seedance-2-0-fast-260128",
        referenceImageCount: 1,
        usedTemporaryAssetUrls: true
      });
    }
  });

  const job = await queue.enqueue({
    productPath,
    provider: "volcengine-seedance",
    providerModel: "doubao-seedance-2-0-fast-260128",
    confirmPaid: true
  });
  const completed = await queue.waitForIdle(job.id);

  expect(completed.status).toBe("failed");
  expect(completed.error).toBe("fetch failed");
  expect(completed.errorDetails).toMatchObject({
    message: "fetch failed",
    name: "TypeError",
    causeMessage: "Headers Timeout Error",
    causeCode: "UND_ERR_HEADERS_TIMEOUT",
    providerPhase: "create-task",
    providerName: "volcengine-seedance",
    providerModel: "doubao-seedance-2-0-fast-260128",
    referenceImageCount: 1,
    usedTemporaryAssetUrls: true
  });
});
```

- [ ] **Step 2: Run queue test and verify it fails**

Run:

```bash
npm test -- tests/server/consoleVideoJobQueue.test.ts
```

Expected: FAIL because `errorDetails` is not defined.

- [ ] **Step 3: Add `errorDetails` shape and serializer**

Modify `VideoJobRecord` in `src/server/consoleVideoJobQueue.ts`:

```ts
  errorDetails?: VideoJobErrorDetails;
```

Add interface:

```ts
export interface VideoJobErrorDetails {
  message: string;
  name?: string;
  causeMessage?: string;
  causeCode?: string;
  providerPhase?: string;
  providerName?: string;
  providerModel?: string;
  referenceImageCount?: number;
  usedTemporaryAssetUrls?: boolean;
}
```

Add helper:

```ts
function serializeJobError(error: unknown): VideoJobErrorDetails {
  const err = error as {
    message?: unknown;
    name?: unknown;
    cause?: { message?: unknown; code?: unknown };
    providerPhase?: unknown;
    providerName?: unknown;
    providerModel?: unknown;
    referenceImageCount?: unknown;
    usedTemporaryAssetUrls?: unknown;
  };
  return {
    message: typeof err.message === "string" ? err.message : String(error),
    name: typeof err.name === "string" ? err.name : undefined,
    causeMessage: typeof err.cause?.message === "string" ? err.cause.message : undefined,
    causeCode: typeof err.cause?.code === "string" ? err.cause.code : undefined,
    providerPhase: typeof err.providerPhase === "string" ? err.providerPhase : undefined,
    providerName: typeof err.providerName === "string" ? err.providerName : undefined,
    providerModel: typeof err.providerModel === "string" ? err.providerModel : undefined,
    referenceImageCount: typeof err.referenceImageCount === "number" ? err.referenceImageCount : undefined,
    usedTemporaryAssetUrls: typeof err.usedTemporaryAssetUrls === "boolean" ? err.usedTemporaryAssetUrls : undefined
  };
}
```

In catch block:

```ts
      const errorDetails = serializeJobError(error);
      await this.update(record, {
        status: "failed",
        error: errorDetails.message,
        errorDetails,
        completedAt: this.nowIso()
      });
```

- [ ] **Step 4: Annotate provider errors with phase and metadata**

Modify `src/providers/volcengine/seedanceProvider.ts`.

Wrap each phase:

```ts
    let content: Array<Record<string, unknown>>;
    try {
      content = await this.buildContent(request);
      const createResponse = await this.postJson<VolcengineSeedanceTaskResponse>(
        "/api/v3/contents/generations/tasks",
        {
          model: this.model,
          content,
          resolution: this.resolution,
          ratio: request.aspectRatio,
          duration: request.durationSeconds,
          watermark: this.watermark
        }
      );
      ...
    } catch (error) {
      throw annotateProviderError(error, {
        providerPhase: "create-task",
        providerName: "volcengine-seedance",
        providerModel: this.model,
        referenceImageCount: request.referenceImages?.length ?? 0,
        usedTemporaryAssetUrls: Boolean(this.referenceImageUrlResolver)
      });
    }
```

Add helper:

```ts
function annotateProviderError(error: unknown, metadata: Record<string, unknown>): Error {
  const err = error instanceof Error ? error : new Error(String(error));
  return Object.assign(err, metadata);
}
```

Use `providerPhase: "poll-task"` around `waitForTask` and `providerPhase: "download-output"` around `download`.

- [ ] **Step 5: Run queue and provider tests**

Run:

```bash
npm test -- tests/server/consoleVideoJobQueue.test.ts tests/providers/seedanceProvider.test.ts
```

Expected: PASS.

## Task 5: Future Object Storage Plan

**Files:**
- Create: `docs/superpowers/plans/2026-06-17-object-storage-future.md`

- [ ] **Step 1: Write object storage future plan document**

Create `docs/superpowers/plans/2026-06-17-object-storage-future.md`:

```md
# Future Object Storage Implementation Outline

## Goal

Move product images, provider raw outputs, final videos, subtitles, manifests, and publish packages from single-node filesystem storage to object storage while keeping SQLite as the metadata index.

## Candidate Backends

- Cloudflare R2
- Any S3-compatible service
- Volcengine TOS
- Aliyun OSS

The first implementation should prefer an S3-compatible interface if possible so R2 and many providers share the same adapter.

## Target Shape

- SQLite stores workspace id, product id, asset id, kind, mime type, size, storage provider, bucket, object key, status, created time, expiry, and deletion time.
- Product reference images are uploaded to object storage when imported, uploaded, or generated.
- Generated raw videos, final videos, subtitles, manifests, and publish packages are written to object storage after creation.
- Providers receive short-lived signed HTTPS URLs.
- Users receive signed download URLs or proxied downloads depending on auth requirements.
- Local filesystem storage remains available as a development and single-node fallback adapter.

## Phased Migration

1. Introduce an `AssetStorage` interface with local and S3-compatible adapters.
2. Write new product reference images through the storage interface.
3. Write new generated video artifacts through the storage interface.
4. Backfill or lazily migrate existing local assets.
5. Add lifecycle rules for generated videos and temporary provider assets.
6. Remove direct filesystem assumptions from UI download and provider URL code.

## Non-Goals For Current Seedance Fix

The current Seedance reference URL fix should not add object storage credentials, buckets, migration scripts, or a new deployment dependency. It should only define the resolver contract so this future migration is small.
```

- [ ] **Step 2: Verify the document exists**

Run:

```bash
test -f docs/superpowers/plans/2026-06-17-object-storage-future.md
```

Expected: command exits 0.

## Task 6: Final Verification

**Files:**
- All changed implementation and test files.

- [ ] **Step 1: Run focused test suite**

Run:

```bash
npm test -- tests/server/publicAssetTokenStore.test.ts tests/server/consoleApi.test.ts tests/server/consoleVideoJobQueue.test.ts tests/providers/seedanceProvider.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Review git diff**

Run:

```bash
git diff --stat
git diff -- docs/superpowers/specs/2026-06-17-seedance-reference-asset-url-design.md docs/superpowers/plans/2026-06-17-seedance-reference-asset-url.md docs/superpowers/plans/2026-06-17-object-storage-future.md
```

Expected: changes match the approved scope: temporary public asset URLs, richer provider errors, tests, and future object-storage outline.

## Self-Review

- Spec coverage: Tasks 1-3 cover short-lived HTTPS URLs; Task 4 covers richer provider error details; Task 5 covers future object storage planning; Task 6 covers verification.
- Placeholder scan: every task has concrete files, commands, and code snippets.
- Type consistency: resolver type is `ReferenceImageUrlResolver`, queue option is `referenceImageUrlResolver`, job details field is `errorDetails`.
