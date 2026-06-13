# No Docker VPS Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a no-Docker deployment package so the Haitu console can run on a VPS behind `haitu.online` with health checks, systemd supervision, and Caddy reverse proxy.

**Architecture:** Keep the app as the existing TypeScript console process. Add a lightweight `/api/health` endpoint for process checks, npm scripts for production startup and deployment verification, and static deploy templates under `deploy/`. Document a direct VPS path without Docker, Postgres, Redis, or paid provider calls.

**Tech Stack:** Node.js, npm, TypeScript, Vitest, Vite, systemd, Caddy.

---

### Task 1: Health Endpoint

**Files:**
- Modify: `src/server/consoleServer.ts`
- Test: `tests/server/consoleApi.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test that calls `GET /api/health` and expects JSON with `ok: true`, `service: "haitu-video-console"`, `storage: "local"`, and no API keys.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/server/consoleApi.test.ts -t health`
Expected: FAIL because `/api/health` is not implemented.

- [ ] **Step 3: Write minimal implementation**

Add the route before product routes:

```ts
if (request.method === "GET" && url.pathname === "/api/health") {
  return jsonResponse({
    ok: true,
    service: "haitu-video-console",
    storage: "local",
    uptimeSeconds: Math.floor(process.uptime()),
    checkedAt: new Date().toISOString()
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/server/consoleApi.test.ts -t health`
Expected: PASS.

### Task 2: No-Docker Deploy Artifacts

**Files:**
- Modify: `package.json`
- Create: `deploy/systemd/haitu-video.service`
- Create: `deploy/caddy/Caddyfile`
- Create: `deploy/env/haitu-video.env.example`
- Create: `docs/deployment/vps-no-docker.md`
- Test: `tests/deploy/noDockerDeploy.test.ts`

- [ ] **Step 1: Write the failing test**

Add a deployment artifact test that checks npm scripts, systemd template, Caddy reverse proxy, environment example, and no-Docker deployment docs.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/deploy/noDockerDeploy.test.ts`
Expected: FAIL because deploy artifacts are missing.

- [ ] **Step 3: Write minimal implementation**

Add `start:console`, `start`, and `deploy:check` scripts. Add systemd, Caddy, env example, and deployment docs using `127.0.0.1:4173`, `/etc/haitu-video.env`, and `/api/health`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/deploy/noDockerDeploy.test.ts`
Expected: PASS.

### Task 3: Console Environment Defaults

**Files:**
- Modify: `src/cli/console.ts`
- Test: `tests/cli/console.test.ts`

- [ ] **Step 1: Write the failing test**

Add CLI tests for default `PORT` and `HOST` from environment while preserving explicit `--port` and `--host` overrides.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/cli/console.test.ts`
Expected: FAIL because env defaults are not read yet.

- [ ] **Step 3: Write minimal implementation**

Read `PORT` and `HOST` in `parseArgs`, then let CLI args override them.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/cli/console.test.ts`
Expected: PASS.

### Task 4: Verification

**Files:**
- No file changes.

- [ ] **Step 1: Run focused tests**

Run: `npm test -- tests/server/consoleApi.test.ts tests/cli/console.test.ts tests/deploy/noDockerDeploy.test.ts`
Expected: all focused tests pass.

- [ ] **Step 2: Run full checks**

Run:

```bash
npm test
npm run typecheck
npm run build:console
```

Expected: all commands exit 0.

- [ ] **Step 3: Run local health smoke test**

Start the console on an unused local port and run:

```bash
curl -s http://127.0.0.1:4180/api/health
```

Expected: JSON contains `"ok":true` and `"service":"haitu-video-console"`.
