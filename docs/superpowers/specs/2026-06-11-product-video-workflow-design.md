# Product Video Workflow Design

## Goal

Split the console workflow into three clear product-facing modules: 商品管理, 视频创作, and 审核发布.

## Module Boundaries

商品管理 owns product facts and reference assets only. It supports add, import, edit, delete, reference-image management, status display, and a "创作视频" handoff.

视频创作 owns one video creation session for one product. It supports selecting or adding a product, setting duration/template/CTA/version/model parameters, editing script and storyboard drafts, preflight, and video job creation.

审核发布 owns final review and publish assets. It supports rating versions, selecting a final version, creating publish material, and downloading video/subtitle/CSV assets.

## First Implementation Slice

Keep existing generation, review, queue, and publish APIs. Rework the visible navigation and React page composition so the responsibilities are clear:

- Main navigation shows 商品管理, 视频创作, 审核发布.
- 商品管理 no longer renders the full ProductStudio creation wizard.
- 商品管理 rows expose edit/delete/create-video actions.
- 视频创作 renders the ProductStudio creation wizard and, when no product is selected, shows a product selection/start panel with add-product support.
- Editing an existing product keeps the "编辑当前商品" dialog semantics.
- Add DELETE `/api/products/:sku` so 商品管理 can remove products.

## Deferred

Creation batch/session persistence, richer template-specific script prompting, and creation history grouping remain follow-up work after the first module split is stable.
