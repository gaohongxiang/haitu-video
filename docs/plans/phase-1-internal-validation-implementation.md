# Phase 1 Internal Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for production code changes and superpowers:verification-before-completion before claiming completion. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a low-cost local CLI pipeline that validates 20 products / 60 videos without Docker, databases, Redis, or paid SaaS beyond the future video model API.

**Architecture:** A TypeScript workspace exposes small core modules for product facts, script generation, prompt generation, provider abstraction, basic QC, and cost reporting. The CLI reads product JSON fixtures, uses a mock provider by default, writes outputs under `outputs/`, and keeps the Seedance integration behind a provider interface for later API wiring.

**Tech Stack:** Node.js, TypeScript, Vitest, tsx, Zod, local filesystem outputs.

---

## File Structure

- `package.json`: npm scripts and dev dependencies.
- `tsconfig.json`: TypeScript compiler configuration.
- `vitest.config.ts`: Vitest configuration.
- `src/core/productFacts.ts`: product fact schema and validation.
- `src/core/scriptGenerator.ts`: deterministic Japanese ad script generation from verified facts.
- `src/core/promptGenerator.ts`: Seedance-style prompt generation with configurable short-video storyboard.
- `src/providers/types.ts`: provider request/response contracts.
- `src/providers/mockVideoProvider.ts`: free mock provider that writes a placeholder output file.
- `src/qc/basicQc.ts`: local rule-based QC for duration, aspect ratio metadata, forbidden claims, and subtitle presence.
- `src/pipeline/runProductJob.ts`: orchestrates one product and one version.
- `src/cli/generate.ts`: CLI entrypoint for batch generation.
- `fixtures/products/sample-storage-box.json`: sample product fact package.
- `outputs/.gitkeep`: local output directory placeholder.

## Tasks

### Task 1: Project Tooling

- [x] Create `package.json`, `tsconfig.json`, and `vitest.config.ts`.
- [x] Add scripts: `test`, `typecheck`, `generate`.
- [x] Install and use `typescript`, `tsx`, `vitest`, `zod`, `@types/node`.
- [x] Verify `npm test` runs before production code exists.

### Task 2: Product Facts

- [x] Write tests for valid and invalid product fact packages.
- [x] Implement Zod schema and `parseProductFacts`.
- [x] Verify missing verified selling points and forbidden claims are rejected.

### Task 3: Script And Prompt Generation

- [x] Write tests proving scripts use verified selling points and avoid forbidden claims.
- [x] Implement deterministic Japanese script generation.
- [x] Write tests proving prompt includes 9:16, duration, reference image guidance, and soft storyboard.
- [x] Implement prompt generation.

### Task 4: Provider And Pipeline

- [x] Write tests for mock provider output metadata and cost.
- [x] Implement provider contracts and mock provider.
- [x] Write tests for one product job output manifest.
- [x] Implement `runProductJob`.

### Task 5: CLI, Fixtures, And Verification

- [x] Add sample product fixture.
- [x] Implement CLI batch generation with `--product`, `--versions`, and `--outDir`.
- [x] Add README usage section.
- [x] Run `npm test`, `npm run typecheck`, and one sample `npm run generate`.

### Task 6: Seedance Provider Adapter

- [x] Add a `VolcengineSeedanceProvider` behind the existing `VideoProvider` interface.
- [x] Keep `mock` as the default provider to avoid accidental paid calls.
- [x] Add `--provider volcengine-seedance` CLI support, with `seedance` retained as a legacy alias.
- [x] Require `ARK_API_KEY` or `SEEDANCE_API_KEY` before any paid request.
- [x] Document Seedance environment variables and first paid smoke-test command.
- [x] Align request body with Volcengine Chinese docs: `ratio`, `duration`, `resolution`, `watermark`, and `image_url` with `role: reference_image`.
- [x] Add provider factory/registry so future Veo, Runway, and Kling providers do not change the core pipeline.

### Task 7: Low-Cost TikTok Traffic Defaults

- [x] Change the default job duration from 15 seconds to 8 seconds for low-cost traffic-video tests.
- [x] Keep `--duration` configurable from 4 to 15 seconds for explicit longer runs.
- [x] Change the default Seedance resolution from 720p to 480p.
- [x] Estimate Seedance cost per second, defaulting to `0.8 CNY/s` based on the first real 15s smoke test costing about 12 CNY.
- [x] Require `--confirmPaid true` before any paid provider request.
- [x] Update QC so short videos are checked against the requested duration instead of a fixed 12-16 second window.

### Task 8: Usage And Support Billing Display

- [x] Store provider task id and `usage.total_tokens` in each completed manifest when the provider returns usage.
- [x] Add a read-only Volcengine usage client for `GET /api/v3/contents/generations/tasks`.
- [x] Add single-task query support for `GET /api/v3/contents/generations/tasks/{task_id}`.
- [x] Add safe queued-task cancellation via `DELETE /api/v3/contents/generations/tasks/{task_id}` after checking the current task status.
- [x] Add confirmed task deletion for completed or failed provider records with `--confirm true`.
- [x] Add `npm run usage` for customer support billing checks, with task id, status, model, duration, resolution, tokens, and estimated CNY cost.
- [x] Use `37 CNY / 1,000,000 tokens` as the default Seedance 2.0 Fast token price, configurable via CLI or environment.
- [x] Keep the usage query separate from generation; it never requires `--confirmPaid true` because it only performs read-only GET requests.
