# Product Video Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the console into 商品管理, 视频创作, and 审核发布 modules with clear responsibilities.

**Architecture:** Reuse existing React components and server APIs where possible. Move the existing ProductStudio wizard behind the video creation section, simplify the product management page, and add a small product-delete API for management completeness.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, local Node HTTP server.

---

### Task 1: Lock New Navigation And Page Responsibilities

**Files:**
- Modify: `tests/server/consoleApi.test.ts`
- Modify: `tests/client/consoleNavigation.test.ts`

- [ ] Add source-level assertions that primary navigation contains 商品管理, 视频创作, 审核发布.
- [ ] Add assertions that 商品管理 does not contain the ProductStudio wizard.
- [ ] Add assertions that 视频创作 contains ProductStudio, product selection, and add-product affordances.
- [ ] Run `npx vitest run tests/server/consoleApi.test.ts tests/client/consoleNavigation.test.ts`.

### Task 2: Product Management UI

**Files:**
- Modify: `src/client/App.tsx`

- [ ] Rename product section labels and subtitles.
- [ ] Replace product management rendering with ProductLibraryHome plus dialog mount.
- [ ] Add row actions for 编辑, 删除, 创作视频.
- [ ] Wire 创作视频 to select the product and navigate to `video`.
- [ ] Wire 编辑 to existing edit dialog.

### Task 3: Video Creation UI

**Files:**
- Modify: `src/client/App.tsx`

- [ ] Make `video` a primary section labelled 视频创作.
- [ ] Render ProductStudio in the video section.
- [ ] Keep backend task records and reports in an advanced details area below the creation workspace.
- [ ] Ensure direct video navigation starts with a product selection/add panel.
- [ ] Ensure ProductStudio copy refers back to 商品管理, not 商品项目.

### Task 4: Product Delete API

**Files:**
- Modify: `src/server/consoleServer.ts`
- Modify: `tests/server/consoleApi.test.ts`

- [ ] Add failing API test for `DELETE /api/products/:sku`.
- [ ] Implement `deleteProductBySku` using `findProductFileBySku` and `unlink`.
- [ ] Return `{ deleted: true, sku, path }`.
- [ ] Wire frontend delete action to the API.

### Task 5: Verification

**Commands:**
- `npm run typecheck`
- `npm test`
- `npm run build:console`

- [ ] Start/reuse the console server.
- [ ] Browser-check 商品管理, 视频创作 direct entry, product-row 创作视频, edit dialog, delete button presence, and 审核发布.
