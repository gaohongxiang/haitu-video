# Clean Video Creation Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the video creation module a focused creation workspace and move operational records out of the creation path.

**Architecture:** `视频创作` renders only `ProductCreationWorkspace`. Operational panels (`VideoJobsPanel`, `ReportsPanel`, backup, audit, video assets) move to the management module now labeled `任务记录`. Product Studio's generate step owns user-facing generation parameters: provider/model, duration, version count, template, and CTA.

**Tech Stack:** React, TypeScript, Vite, Vitest.

---

### Task 1: Lock The Navigation Boundary

**Files:**
- Modify: `tests/server/consoleApi.test.ts`

- [x] **Step 1: Write failing assertions**

Update the source-based shell tests so `case "video"` contains only `<ProductCreationWorkspace` and does not contain backend panels or manual parameter details. Update the management nav expectation from `费用记录` to `任务记录`.

- [x] **Step 2: Verify red**

Run: `npx vitest run tests/server/consoleApi.test.ts -t "separates product management|serves the React"`

Expected: FAIL because the current video case still contains `<VideoJobsPanel`, `<ReportsPanel`, `手动生成参数`, `<StorageBackupPanel`, `<AuditLogPanel`, and `<VideoAssetsPanel`.

### Task 2: Move Operational Panels To Task Records

**Files:**
- Modify: `src/client/App.tsx`
- Modify: `tests/server/consoleApi.test.ts`

- [x] **Step 1: Implement minimal UI move**

Change the `ledger` nav label/subtitle to `任务记录`. In `renderActiveSection`, remove operational panels from the `video` case and render them in the `ledger` case after provider usage and fee summary.

- [x] **Step 2: Preserve actions**

Keep existing callbacks wired: cancel/retry jobs, reuse raw manifest, official usage, provider cancel, backup creation, audit log, and delete video asset.

- [x] **Step 3: Verify green**

Run: `npx vitest run tests/server/consoleApi.test.ts -t "separates product management|serves the React"`

Expected: PASS.

### Task 3: Put Creation Parameters Inside Studio

**Files:**
- Modify: `src/client/App.tsx`
- Modify: `tests/server/consoleApi.test.ts`

- [x] **Step 1: Add Studio props**

Pass `provider`, `duration`, `versionCount`, their setters, and available provider options into `ProductCreationWorkspace`, `ProductStudio`, and `ProductStudioStepPanel`.

- [x] **Step 2: Render parameters in generate step**

In `activeStep === "generate"`, show controls for generation channel/model, duration, version count, video style, and CTA. The generate button label should reflect the selected version count.

- [x] **Step 3: Use selected parameters**

Update `queueProductVideoJobs` to use current `provider`, `duration`, and `versionCount` instead of forcing mock, 8 seconds, and 3 versions.

- [x] **Step 4: Verify full suite**

Run:
- `npm run typecheck`
- `npm test`
- `npm run build:console`

Expected: all pass; build may retain the existing bundle-size warning.
