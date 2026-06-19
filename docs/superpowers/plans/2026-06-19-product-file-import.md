# Product File Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CSV/Excel product file import for the video creation workspace, with single-row fill and batch save paths.

**Architecture:** File import is a product entry source that normalizes rows into the existing product facts pipeline. CSV/XLSX parsing creates preview rows, shared image URL extraction feeds existing reference image preview/save behavior, and batch commit reuses `saveProductFactPackage`.

**Tech Stack:** TypeScript, React, Vitest, Node fetch `Request`/`Response`, existing product import cleaner, SheetJS `xlsx` for workbook parsing.

---

### Task 1: Core File Parser

**Files:**
- Create: `src/core/productFileImport.ts`
- Test: `tests/core/productFileImport.test.ts`

- [ ] Add failing tests for CSV rows, image URL extraction, duplicate SKU detection, and multi-row summary.
- [ ] Implement CSV/XLSX parsing into `ProductFileImportPreview`.
- [ ] Reuse `cleanImportedProductText` for product quality and risk filtering.

### Task 2: Server APIs

**Files:**
- Modify: `src/server/consoleServer.ts`
- Test: `tests/server/consoleApi.test.ts`

- [ ] Add failing API tests for `/api/products/import-file-preview` and `/api/products/import-file-commit`.
- [ ] Implement JSON base64 file payload parsing.
- [ ] Save selected rows through `saveProductFactPackage`.

### Task 3: Frontend Entry Points

**Files:**
- Modify: `src/client/App.tsx`
- Test: existing source assertions in `tests/server/consoleApi.test.ts`

- [ ] Add file import state, file reader, preview dialog, single-row fill action, and batch commit action.
- [ ] Place `导入文件` in the 商品资料 panel.
- [ ] Place `批量导入 CSV/Excel` in the 创作商品 dropdown.

### Task 4: Verification

**Files:**
- Existing test suite

- [ ] Run targeted core and server tests.
- [ ] Run typecheck.
