# Admin User Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `/admin` user detail drawer with workspace, product, and video task details.

**Architecture:** Extend `src/server/adminDashboard.ts` with a focused `buildAdminUserDetail` query and expose it through `GET /api/admin/users/:userId`. Extend `src/client/AdminApp.tsx` to open a drawer from the user table and render the detail response.

**Tech Stack:** Node.js HTTP server, TypeScript, SQLite via better-sqlite3, React 19, Vitest.

---

## Files

- Modify `tests/server/auth.test.ts`: add admin detail API test.
- Modify `src/server/adminDashboard.ts`: add detail response types and query.
- Modify `src/server/consoleServer.ts`: add admin detail route.
- Modify `src/client/AdminApp.tsx`: add detail state, row click, drawer UI.

## Task 1: API Test

- [ ] Add a failing test named `shows project admins one user's workspace products and video jobs`.
- [ ] Register an admin and a customer, promote the admin, create one customer product, enqueue one mock customer job, and call `GET /api/admin/users/:customerId`.
- [ ] Assert unauthenticated requests return 401 and non-admin requests return 403.
- [ ] Assert the admin response includes the customer email, workspace count, product count, video job count, status counts, workspace list, recent products, and recent jobs.
- [ ] Run `npm test -- tests/server/auth.test.ts -t "one user's workspace"` and confirm it fails because the route is missing.

## Task 2: Server Query And Route

- [ ] Add `AdminUserDetail` types and `buildAdminUserDetail(handle, userId)` in `src/server/adminDashboard.ts`.
- [ ] Query one `auth_users` row; throw `User not found` when missing.
- [ ] Query workspaces through `workspace_members`.
- [ ] Query product and video job aggregates scoped to the user's workspaces.
- [ ] Add `GET /api/admin/users/:userId` in `src/server/consoleServer.ts`, protected by `requireAdmin`.
- [ ] Run the targeted test and make it pass.

## Task 3: Admin Drawer UI

- [ ] Add `AdminUserDetail` frontend types in `src/client/AdminApp.tsx`.
- [ ] Add selected user and detail loading state.
- [ ] Make user table rows clickable and keyboard accessible.
- [ ] Fetch `/api/admin/users/:userId` on row click.
- [ ] Render a right-side drawer with summary metrics, workspaces, recent products, and recent video jobs.
- [ ] Keep all UI read-only.

## Task 4: Verification

- [ ] Run `npm test -- tests/server/auth.test.ts tests/client/consoleNavigation.test.ts tests/client/videoJobRefresh.test.ts`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build:console`.
