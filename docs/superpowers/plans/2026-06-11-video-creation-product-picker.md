# Video Creation Product Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the duplicated product-library list from `视频创作` and replace it with a lightweight product picker that hands off to the current-product studio.

**Architecture:** `商品管理` remains the only full product library with add, edit, delete, and row-level creation entry. `视频创作` shows either the selected product studio or a compact start panel with a single product selector, readiness summary, and start action. The studio topbar uses “切换商品” to return to that picker instead of sounding like a second product-list page.

**Tech Stack:** React, TypeScript, Vite, Vitest.

---

### Task 1: Lock The Product Picker Boundary

**Files:**
- Modify: `tests/server/consoleApi.test.ts`

- [x] **Step 1: Write failing assertions**

Update the source-based module separation test so `ProductCreationStartPanel` must contain `product-creation-picker`, `productPickerSku`, `选择商品开始创作`, and `开始创作`, and must not contain the repeated product grid/card/list actions `products.map((product)`, `用此商品创作视频`, `编辑`, or `删除`.

- [x] **Step 2: Verify red**

Run: `npx vitest run tests/server/consoleApi.test.ts -t "separates product management"`

Expected: FAIL because the current start panel maps every product into cards and shows `用此商品创作视频`.

### Task 2: Replace The Repeated List With A Lightweight Picker

**Files:**
- Modify: `src/client/App.tsx`

- [x] **Step 1: Implement local picker state**

Inside `ProductCreationStartPanel`, add `const [productPickerSku, setProductPickerSku] = useState(products[0]?.sku ?? "");`, derive `pickedProduct`, and keep the selected SKU valid when `products` changes.

- [x] **Step 2: Render compact selection UI**

Replace the product card grid with one selection card: a `Select` listing `title_ja / sku`, a readiness summary for the selected product, a primary `开始创作` button, and an `添加商品` button for the empty state or when users need a new product.

- [x] **Step 3: Preserve entry behavior**

The primary button calls `onSelectProduct(pickedProduct)` only when a product is selected. The add button keeps opening the existing add-product dialog.

### Task 3: Rename Studio Return Action

**Files:**
- Modify: `src/client/App.tsx`
- Modify: `tests/server/consoleApi.test.ts`

- [x] **Step 1: Update topbar copy**

Change the selected-product topbar button from `返回视频创作` to `切换商品`, keeping the same `onClearSelection` behavior.

- [x] **Step 2: Verify**

Run:
- `npx vitest run tests/server/consoleApi.test.ts -t "separates product management"`
- `npm run typecheck`
- `npm test`
- `npm run build:console`

Expected: all pass; Vite may keep the existing large chunk warning.
