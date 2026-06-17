import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createConsoleServer } from "../../src/server/consoleServer.js";
import { closeDatabase, openDatabase } from "../../src/server/db/client.js";
import { runMigrations } from "../../src/server/db/migrate.js";
import type { MakeVideoReport } from "../../src/pipeline/makeVideoPipeline.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  restoreEnv("HAITU_SECRET_KEY", undefined);
});

describe("SQLite-backed user auth and workspace resolution", () => {
  it("registers users, stores password hashes, and exposes session workspace context", async () => {
    const root = await makeTempDir();
    process.env.HAITU_SECRET_KEY = "0123456789abcdef0123456789abcdef";
    const server = createConsoleServer({
      rootDir: root,
      autoStartSavedJobs: false
    });

    const registerResponse = await server.fetch("/api/auth/enter", {
      method: "POST",
      body: JSON.stringify({
        email: "alice@example.com",
        password: "correct horse battery staple"
      })
    });
    const cookie = registerResponse.headers.get("set-cookie") ?? "";
    const registerBody = await registerResponse.json();
    const session = await server.fetchJson("/api/auth/session", {
      headers: { cookie }
    });

    expect(registerResponse.status).toBe(200);
    expect(cookie).toContain("haitu_session=");
    expect(registerBody).toMatchObject({
      authEnabled: true,
      authenticated: true,
      user: {
        email: "alice@example.com",
        displayName: "alice@example.com"
      },
      workspace: {
        id: "default",
        name: "alice@example.com 的工作区"
      }
    });
    expect(session).toMatchObject({
      authEnabled: true,
      authenticated: true,
      user: {
        email: "alice@example.com"
      },
      workspace: {
        id: registerBody.workspace.id
      }
    });

    const handle = openDatabase({ dataDir: testDataDir(root), env: process.env });
    try {
      runMigrations(handle);
      const row = handle.sqlite
        .prepare("SELECT email, password_hash FROM users WHERE email = ?")
        .get("alice@example.com") as { email: string; password_hash: string };
      expect(row.password_hash).toBeTruthy();
      expect(row.password_hash).not.toContain("correct horse battery staple");
    } finally {
      closeDatabase(handle);
    }
  });

  it("requires a logged-in SQLite user before product APIs are accessible", async () => {
    const root = await makeTempDir();
    process.env.HAITU_SECRET_KEY = "0123456789abcdef0123456789abcdef";
    const server = createConsoleServer({
      rootDir: root,
      autoStartSavedJobs: false
    });

    const beforeLogin = await server.fetch("/api/products");
    const registerResponse = await server.fetch("/api/auth/enter", {
      method: "POST",
      body: JSON.stringify({
        email: "alice@example.com",
        password: "correct horse battery staple"
      })
    });
    const cookie = registerResponse.headers.get("set-cookie") ?? "";
    const afterLogin = await server.fetch("/api/products", {
      headers: { cookie }
    });
    const afterLogout = await server.fetch("/api/products", {
      headers: {
        cookie: (await server.fetch("/api/auth/logout", {
          method: "POST",
          headers: { cookie }
        })).headers.get("set-cookie") ?? ""
      }
    });

    expect(beforeLogin.status).toBe(401);
    expect(afterLogin.status).toBe(200);
    expect(afterLogout.status).toBe(401);
  });

  it("serves the console shell before SQLite login so users can sign in", async () => {
    const root = await makeTempDir();
    process.env.HAITU_SECRET_KEY = "0123456789abcdef0123456789abcdef";
    const server = createConsoleServer({
      rootDir: root,
      autoStartSavedJobs: false
    });

    const response = await server.fetch("/");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("Haitu");
  });

  it("resolves API storage from the logged-in user's workspace", async () => {
    const root = await makeTempDir();
    process.env.HAITU_SECRET_KEY = "0123456789abcdef0123456789abcdef";
    const server = createConsoleServer({
      rootDir: root,
      autoStartSavedJobs: false
    });

    const aliceCookie = await registerUser(server, "alice@example.com");
    const bobCookie = await registerUser(server, "bob@example.com");

    await server.fetchJson("/api/products", {
      method: "POST",
      headers: { cookie: aliceCookie },
      body: JSON.stringify(productFacts("ALICE-001", "アリス商品"))
    });
    await server.fetchJson("/api/products", {
      method: "POST",
      headers: { cookie: bobCookie },
      body: JSON.stringify(productFacts("BOB-001", "ボブ商品"))
    });

    const aliceProducts = await server.fetchJson("/api/products", {
      headers: { cookie: aliceCookie }
    }) as { products: Array<{ sku: string; path: string }> };
    const bobProducts = await server.fetchJson("/api/products", {
      headers: { cookie: bobCookie }
    }) as { products: Array<{ sku: string; path: string }> };

    expect(aliceProducts.products.map((product) => product.sku)).toEqual(["ALICE-001"]);
    expect(bobProducts.products.map((product) => product.sku)).toEqual(["BOB-001"]);
    expect(aliceProducts.products[0]?.path).toContain("/workspaces/");
    expect(aliceProducts.products[0]?.path).toContain("/workspaces/default/");
    expect(bobProducts.products[0]?.path).not.toContain("/workspaces/default/");
    await expect(readFile(aliceProducts.products[0]?.path ?? "", "utf8")).resolves.toContain("\"workspaceId\"");
  });

  it("uses SQLite product indexes for workspace-scoped product lists and deletes", async () => {
    const root = await makeTempDir();
    process.env.HAITU_SECRET_KEY = "0123456789abcdef0123456789abcdef";
    const server = createConsoleServer({
      rootDir: root,
      autoStartSavedJobs: false
    });
    const aliceCookie = await registerUser(server, "alice@example.com");

    const saved = await server.fetchJson("/api/products", {
      method: "POST",
      headers: { cookie: aliceCookie },
      body: JSON.stringify(productFacts("INDEX-001", "索引商品"))
    }) as { product: { path: string } };
    await rm(saved.product.path, { force: true });

    const listed = await server.fetchJson("/api/products", {
      headers: { cookie: aliceCookie }
    }) as { products: Array<{ sku: string; title_ja: string }> };
    const deleted = await server.fetchJson("/api/products/INDEX-001", {
      method: "DELETE",
      headers: { cookie: aliceCookie }
    });
    const afterDelete = await server.fetchJson("/api/products", {
      headers: { cookie: aliceCookie }
    }) as { products: Array<{ sku: string }> };

    expect(listed.products).toEqual([
      expect.objectContaining({
        sku: "INDEX-001",
        title_ja: "索引商品"
      })
    ]);
    expect(deleted).toEqual(expect.objectContaining({
      deleted: true,
      sku: "INDEX-001"
    }));
    expect(afterDelete.products).toEqual([]);
  });

  it("indexes pasted imports in SQLite so workspace-scoped product lists stay complete", async () => {
    const root = await makeTempDir();
    process.env.HAITU_SECRET_KEY = "0123456789abcdef0123456789abcdef";
    const server = createConsoleServer({
      rootDir: root,
      autoStartSavedJobs: false
    });
    const aliceCookie = await registerUser(server, "alice@example.com");
    const bobCookie = await registerUser(server, "bob@example.com");

    const imported = await server.fetchJson("/api/products/import", {
      method: "POST",
      headers: { cookie: aliceCookie },
      body: JSON.stringify({
        text: [
          "SKU: IMPORT-001",
          "商品名：インポート商品",
          "カテゴリ：雑貨",
          "素材：ABS",
          "サイズ：約10x8x3cm",
          "卖点：軽量",
          "使用シーン：日常"
        ].join("\n")
      })
    }) as { product: { sku: string; path: string } };

    const aliceProducts = await server.fetchJson("/api/products", {
      headers: { cookie: aliceCookie }
    }) as { products: Array<{ sku: string; path: string }> };
    const bobProducts = await server.fetchJson("/api/products", {
      headers: { cookie: bobCookie }
    }) as { products: Array<{ sku: string }> };

    expect(imported.product.sku).toBe("IMPORT-001");
    expect(aliceProducts.products).toEqual([
      expect.objectContaining({
        sku: "IMPORT-001",
        path: imported.product.path
      })
    ]);
    expect(bobProducts.products).toEqual([]);
  });

  it("uses SQLite storyboard indexes for workspace-scoped storyboard history", async () => {
    const root = await makeTempDir();
    process.env.HAITU_SECRET_KEY = "0123456789abcdef0123456789abcdef";
    const server = createConsoleServer({
      rootDir: root,
      autoStartSavedJobs: false
    });
    const aliceCookie = await registerUser(server, "alice@example.com");
    const bobCookie = await registerUser(server, "bob@example.com");

    const saved = await server.fetchJson("/api/products", {
      method: "POST",
      headers: { cookie: aliceCookie },
      body: JSON.stringify(productFacts("STORY-001", "分镜商品"))
    }) as { product: { path: string } };
    const created = await server.fetchJson("/api/products/STORY-001/storyboards", {
      method: "POST",
      headers: { cookie: aliceCookie },
      body: JSON.stringify({
        style: "scene",
        duration: 10,
        script: "0-3s 商品を見せる"
      })
    }) as { storyboard: { id: string } };
    await rm(saved.product.path, { force: true });

    const aliceStoryboards = await server.fetchJson("/api/products/STORY-001/storyboards", {
      headers: { cookie: aliceCookie }
    }) as { storyboards: Array<{ id: string; script: string }> };
    const bobStoryboards = await server.fetch("/api/products/STORY-001/storyboards", {
      headers: { cookie: bobCookie }
    });
    const deleted = await server.fetchJson(`/api/products/STORY-001/storyboards/${created.storyboard.id}`, {
      method: "DELETE",
      headers: { cookie: aliceCookie }
    });
    const afterDelete = await server.fetchJson("/api/products/STORY-001/storyboards", {
      headers: { cookie: aliceCookie }
    }) as { storyboards: Array<{ id: string }> };

    expect(aliceStoryboards.storyboards).toEqual([
      expect.objectContaining({
        id: created.storyboard.id,
        script: "0-3s 商品を見せる"
      })
    ]);
    expect(bobStoryboards.status).toBe(404);
    expect(deleted).toEqual({
      deleted: true,
      id: created.storyboard.id
    });
    expect(afterDelete.storyboards).toEqual([]);
  });

  it("uses SQLite video job indexes for workspace-scoped history and deletion", async () => {
    const root = await makeTempDir();
    process.env.HAITU_SECRET_KEY = "0123456789abcdef0123456789abcdef";
    const server = createConsoleServer({
      rootDir: root,
      autoStartSavedJobs: false,
      runMakeVideoPipeline: async (input) => {
        const report: MakeVideoReport = {
          productSku: "VIDEO-001",
          provider: input.providerName,
          status: "completed",
          durationSeconds: input.durationSeconds,
          reportPath: `${input.outDir}/make-video-report.json`,
          raw: {
            outputPath: `${input.outDir}/raw/source.mp4`
          },
          final: {
            outputPath: `${input.outDir}/final/final.mp4`
          },
          billing: {
            totalTokens: 0,
            estimatedCostCny: 0
          }
        } as MakeVideoReport;
        await mkdir(`${input.outDir}/raw`, { recursive: true });
        await mkdir(`${input.outDir}/final`, { recursive: true });
        await writeFile(report.raw.outputPath, "raw video");
        await writeFile(report.final?.outputPath ?? "", "final video");
        await writeFile(report.reportPath, JSON.stringify(report, null, 2), "utf8");
        return report;
      }
    });
    const aliceCookie = await registerUser(server, "alice@example.com");
    const bobCookie = await registerUser(server, "bob@example.com");
    await server.fetchJson("/api/products", {
      method: "POST",
      headers: { cookie: aliceCookie },
      body: JSON.stringify(productFacts("VIDEO-001", "動画商品"))
    });

    const queued = await server.fetchJson("/api/products/VIDEO-001/video-jobs", {
      method: "POST",
      headers: { cookie: aliceCookie },
      body: JSON.stringify({
        provider: "mock",
        versions: 1,
        duration: 8
      })
    }) as { jobs: Array<{ id: string }> };
    const jobId = queued.jobs[0]?.id ?? "";
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const latest = await server.fetchJson(`/api/video-jobs/${jobId}`, {
        headers: { cookie: aliceCookie }
      }) as { job: { status: string } };
      if (latest.job.status === "completed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const ledger = await server.fetchJson("/api/job-ledger", {
      headers: { cookie: aliceCookie }
    }) as { jobs: Array<{ id: string; productSku?: string }> };
    const bobLedger = await server.fetchJson("/api/job-ledger", {
      headers: { cookie: bobCookie }
    }) as { jobs: Array<{ id: string }> };

    expect(ledger.jobs).toEqual([
      expect.objectContaining({
        id: jobId,
        productSku: "VIDEO-001"
      })
    ]);
    expect(bobLedger.jobs).toEqual([]);
    const handle = openDatabase({ dataDir: testDataDir(root), env: process.env });
    try {
      const indexedJob = handle.sqlite
        .prepare("SELECT id, workspace_id, status FROM video_jobs WHERE id = ?")
        .get(jobId) as { id: string; workspace_id: string; status: string } | undefined;
      const indexedAssets = handle.sqlite
        .prepare("SELECT COUNT(*) AS count FROM video_assets WHERE job_id = ?")
        .get(jobId) as { count: number };
      expect(indexedJob).toEqual(expect.objectContaining({
        id: jobId,
        status: "completed"
      }));
      expect(indexedAssets.count).toBe(2);
    } finally {
      closeDatabase(handle);
    }
    const deleted = await server.fetchJson(`/api/job-ledger/${jobId}`, {
      method: "DELETE",
      headers: { cookie: aliceCookie }
    });
    const afterDelete = await server.fetchJson("/api/job-ledger", {
      headers: { cookie: aliceCookie }
    }) as { jobs: Array<{ id: string }> };
    expect(deleted).toEqual(expect.objectContaining({
      deleted: true,
      jobId
    }));
    const afterDeleteHandle = openDatabase({ dataDir: testDataDir(root), env: process.env });
    try {
      const remainingJob = afterDeleteHandle.sqlite
        .prepare("SELECT id FROM video_jobs WHERE id = ?")
        .get(jobId);
      const remainingAssets = afterDeleteHandle.sqlite
        .prepare("SELECT COUNT(*) AS count FROM video_assets WHERE job_id = ?")
        .get(jobId) as { count: number };
      expect(remainingJob).toBeUndefined();
      expect(remainingAssets.count).toBe(0);
    } finally {
      closeDatabase(afterDeleteHandle);
    }
    expect(afterDelete.jobs).toEqual([]);
  });

  it("uses the logged-in workspace provider key when running queued paid video jobs", async () => {
    const root = await makeTempDir();
    process.env.HAITU_SECRET_KEY = "0123456789abcdef0123456789abcdef";
    delete process.env.SEEDANCE_API_KEY;
    delete process.env.ARK_API_KEY;
    const seenApiKeys: Array<string | undefined> = [];
    const server = createConsoleServer({
      rootDir: root,
      autoStartSavedJobs: false,
      runMakeVideoPipeline: async (input) => {
        seenApiKeys.push(input.apiKey);
        const report: MakeVideoReport = {
          productSku: "PAID-001",
          provider: input.providerName,
          status: "completed",
          durationSeconds: input.durationSeconds,
          reportPath: `${input.outDir}/make-video-report.json`,
          raw: {
            outputPath: `${input.outDir}/raw/source.mp4`
          },
          final: {
            outputPath: `${input.outDir}/final/final.mp4`
          },
          billing: {
            totalTokens: 0,
            estimatedCostCny: 0
          }
        } as MakeVideoReport;
        await mkdir(`${input.outDir}/raw`, { recursive: true });
        await mkdir(`${input.outDir}/final`, { recursive: true });
        await writeFile(report.raw.outputPath, "raw video");
        await writeFile(report.final?.outputPath ?? "", "final video");
        await writeFile(report.reportPath, JSON.stringify(report, null, 2), "utf8");
        return report;
      }
    });
    const aliceCookie = await registerUser(server, "alice@example.com");

    await server.fetchJson("/api/provider-keys/volcengine-seedance", {
      method: "PUT",
      headers: { cookie: aliceCookie },
      body: JSON.stringify({
        apiKey: "alice-workspace-seedance-key-1234"
      })
    });
    await server.fetchJson("/api/products", {
      method: "POST",
      headers: { cookie: aliceCookie },
      body: JSON.stringify({
        ...productFacts("PAID-001", "付费動画商品"),
        reference_images: ["https://cdn.example.com/paid.jpg"]
      })
    });

    const queued = await server.fetchJson("/api/products/PAID-001/video-jobs", {
      method: "POST",
      headers: { cookie: aliceCookie },
      body: JSON.stringify({
        provider: "volcengine-seedance",
        versions: 1,
        duration: 8,
        confirmPaid: true
      })
    }) as { jobs: Array<{ id: string }> };
    const jobId = queued.jobs[0]?.id ?? "";
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const latest = await server.fetchJson(`/api/video-jobs/${jobId}`, {
        headers: { cookie: aliceCookie }
      }) as { job: { status: string } };
      if (latest.job.status === "completed") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    expect(seenApiKeys).toEqual(["alice-workspace-seedance-key-1234"]);
  });

  it("expires videos in every SQLite workspace during server retention cleanup", async () => {
    const root = await makeTempDir();
    process.env.HAITU_SECRET_KEY = "0123456789abcdef0123456789abcdef";
    const dataDir = testDataDir(root);
    const aliceJobDir = join(dataDir, "workspaces", "alice-ws", "jobs", "job-alice-old");
    const bobJobDir = join(dataDir, "workspaces", "bob-ws", "jobs", "job-bob-old");
    await seedExpiredVideoJob(dataDir, "alice-ws", "job-alice-old", aliceJobDir);
    await seedExpiredVideoJob(dataDir, "bob-ws", "job-bob-old", bobJobDir);

    createConsoleServer({
      rootDir: root,
      autoStartSavedJobs: false
    });

    const handle = openDatabase({ dataDir, env: process.env });
    try {
      const rows = await waitForRows(() =>
        handle.sqlite
          .prepare("SELECT workspace_id, status, deleted_at FROM video_assets ORDER BY workspace_id")
          .all() as Array<{ workspace_id: string; status: string; deleted_at: string | null }>
      );
      expect(rows.length).toBe(4);
      expect(rows.every((row) => row.status === "deleted")).toBe(true);
      expect(rows.every((row) => typeof row.deleted_at === "string")).toBe(true);
    } finally {
      closeDatabase(handle);
    }
  });

  it("logs in existing users and rejects invalid passwords", async () => {
    const root = await makeTempDir();
    process.env.HAITU_SECRET_KEY = "0123456789abcdef0123456789abcdef";
    const server = createConsoleServer({
      rootDir: root,
      autoStartSavedJobs: false
    });

    await registerUser(server, "alice@example.com", "correct horse battery staple");
    const rejected = await server.fetch("/api/auth/enter", {
      method: "POST",
      body: JSON.stringify({
        email: "alice@example.com",
        password: "wrong password"
      })
    });
    const accepted = await server.fetch("/api/auth/enter", {
      method: "POST",
      body: JSON.stringify({
        email: "alice@example.com",
        password: "correct horse battery staple"
      })
    });
    const session = await server.fetchJson("/api/auth/session", {
      headers: { cookie: accepted.headers.get("set-cookie") ?? "" }
    });

    expect(rejected.status).toBe(401);
    expect(accepted.status).toBe(200);
    expect(session).toMatchObject({
      authenticated: true,
      user: {
        email: "alice@example.com"
      }
    });
  });
});

async function registerUser(
  server: ReturnType<typeof createConsoleServer>,
  email: string,
  password = "correct horse battery staple"
): Promise<string> {
  const response = await server.fetch("/api/auth/enter", {
    method: "POST",
    body: JSON.stringify({
      email,
      password
    })
  });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie") ?? "";
}

async function queueCompletedMockJob(
  server: ReturnType<typeof createConsoleServer>,
  cookie: string,
  sku: string
): Promise<void> {
  await server.fetchJson("/api/products", {
    method: "POST",
    headers: { cookie },
    body: JSON.stringify(productFacts(sku, `${sku} 商品`))
  });
  const queued = await server.fetchJson(`/api/products/${sku}/video-jobs`, {
    method: "POST",
    headers: { cookie },
    body: JSON.stringify({
      provider: "mock",
      versions: 1,
      duration: 8
    })
  }) as { jobs: Array<{ id: string }> };
  const jobId = queued.jobs[0]?.id ?? "";
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const latest = await server.fetchJson(`/api/video-jobs/${jobId}`, {
      headers: { cookie }
    }) as { job: { status: string } };
    if (latest.job.status === "completed") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Video job did not complete: ${jobId}`);
}

async function seedExpiredVideoJob(
  dataDir: string,
  workspaceId: string,
  jobId: string,
  jobDir: string
): Promise<void> {
  const finalVideo = join(jobDir, "final", "final.mp4");
  const rawVideo = join(jobDir, "raw", "source.mp4");
  await mkdir(join(jobDir, "final"), { recursive: true });
  await mkdir(join(jobDir, "raw"), { recursive: true });
  await writeFile(finalVideo, "final video", "utf8");
  await writeFile(rawVideo, "raw video", "utf8");
  await writeFile(join(jobDir, "job.json"), JSON.stringify({
    id: jobId,
    workspaceId,
    status: "completed",
    createdAt: "2000-01-01T00:00:00.000Z",
    updatedAt: "2000-01-01T00:00:00.000Z",
    expiresAt: "2000-01-02T00:00:00.000Z"
  }, null, 2), "utf8");
  const handle = openDatabase({ dataDir, env: process.env });
  try {
    runMigrations(handle);
    handle.sqlite.prepare(`
      INSERT INTO workspaces (id, name, created_at, updated_at)
      VALUES (@workspaceId, @workspaceId, '2000-01-01T00:00:00.000Z', '2000-01-01T00:00:00.000Z')
      ON CONFLICT(id) DO NOTHING
    `).run({ workspaceId });
    handle.sqlite.prepare(`
      INSERT INTO video_jobs (id, workspace_id, status, job_dir, created_at, expires_at)
      VALUES (@jobId, @workspaceId, 'completed', @jobDir, '2000-01-01T00:00:00.000Z', '2000-01-02T00:00:00.000Z')
    `).run({ jobId, workspaceId, jobDir });
    for (const [kind, storagePath] of Object.entries({ raw: rawVideo, final: finalVideo })) {
      handle.sqlite.prepare(`
        INSERT INTO video_assets (id, workspace_id, job_id, status, storage_path, expires_at)
        VALUES (@id, @workspaceId, @jobId, 'available', @storagePath, '2000-01-02T00:00:00.000Z')
      `).run({
        id: `${jobId}:${kind}`,
        workspaceId,
        jobId,
        storagePath
      });
    }
  } finally {
    closeDatabase(handle);
  }
}

async function waitForRows<T>(readRows: () => T[]): Promise<T[]> {
  let rows: T[] = [];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    rows = readRows();
    if (rows.length > 0 && rows.every((row) => (row as { status?: string }).status === "deleted")) {
      return rows;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return rows;
}

function productFacts(sku: string, title: string) {
  return {
    sku,
    title_ja: title,
    category: "雑貨",
    materials: ["ABS"],
    dimensions: "10 x 8 x 3 cm",
    verified_selling_points: ["軽量"],
    usage_scenes: ["日常"],
    forbidden_claims: ["医療効果なし"],
    reference_images: []
  };
}

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "haitu-auth-"));
  tempDirs.push(dir);
  return dir;
}

function testDataDir(root: string): string {
  return join(root, "data");
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
