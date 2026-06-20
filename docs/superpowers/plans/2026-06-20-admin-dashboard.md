# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/admin` for the project owner to see platform-wide user growth and activity.

**Architecture:** Reuse the existing console server and React app. Add admin-only server helpers and `/api/admin/overview`; have the single React entry render `AdminApp` when the URL path is `/admin`.

**Tech Stack:** Node.js HTTP server, TypeScript, SQLite via better-sqlite3, React 19, ECharts, Vitest.

---

## File Structure

- Modify `src/server/consoleAuth.ts`: add admin session contract methods.
- Modify `src/server/auth/betterAuthStore.ts`: implement admin role lookup from `users`.
- Modify `src/server/consoleServer.ts`: serve `/admin` shell and add `/api/admin/overview`.
- Create `src/server/adminDashboard.ts`: focused SQLite queries for admin overview data.
- Modify `src/client/main.tsx`: switch between `App` and `AdminApp` by pathname.
- Create `src/client/AdminApp.tsx`: admin login gate, metrics, charts, and user table.
- Modify `tests/server/auth.test.ts`: admin access and overview behavior.

## Task 1: Admin API Contract Tests

- [ ] Add a Vitest case that registers an owner and regular user, promotes the owner with `UPDATE users SET role = 'admin'`, and verifies `/api/admin/overview`.
- [ ] Assert unauthenticated `/api/admin/overview` returns 401.
- [ ] Assert non-admin authenticated `/api/admin/overview` returns 403.
- [ ] Assert admin response includes totals, 30 growth points, 30 activity points, and both users.
- [ ] Run `npm test -- tests/server/auth.test.ts -t "admin"` and watch it fail because the route does not exist yet.

## Task 2: Admin Authorization

- [ ] Extend `ConsoleAuthStore` with `requireAdmin(request)` and `resolveAdminUser(request)`.
- [ ] In `BetterAuthConsoleAuthStore`, look up the current session user in `users`; treat role `admin` as project-owner access.
- [ ] Keep ordinary console behavior unchanged for normal authenticated users.
- [ ] Run the admin test and watch it fail at the missing overview implementation rather than authentication.

## Task 3: Admin Overview Query

- [ ] Create `src/server/adminDashboard.ts` with `buildAdminOverview(handle, now)`.
- [ ] Return metrics, 30 daily registration buckets, 30 daily activity buckets, and per-user rows.
- [ ] Count activity from `audit_logs.created_at`; count last user activity from actor-linked audit logs when available, falling back to auth session update/create time.
- [ ] Add `/api/admin/overview` in `consoleServer.ts` after auth routes and before workspace-scoped request context.
- [ ] Run `npm test -- tests/server/auth.test.ts -t "admin"` and make it pass.

## Task 4: Admin Shell Route

- [ ] Update public route handling so GET/HEAD `/admin` returns the console HTML shell before auth gating.
- [ ] Add a test that `/admin` serves HTML for unauthenticated visitors so the login screen can load.
- [ ] Run the targeted auth tests.

## Task 5: Admin React Page

- [ ] Create `AdminApp.tsx` with the same auth flow endpoints as the console.
- [ ] Fetch `/api/admin/overview` only after the session is authenticated.
- [ ] Show a compact operational dashboard: metrics, growth chart, activity chart, user table.
- [ ] Render 403 as a clear "not an admin" state.
- [ ] Update `main.tsx` to render `AdminApp` on `/admin`, otherwise `App`.
- [ ] Run `npm run typecheck` and fix TypeScript errors.

## Task 6: Verification

- [ ] Run `npm test -- tests/server/auth.test.ts`.
- [ ] Run `npm test -- tests/client/consoleNavigation.test.ts tests/client/videoJobRefresh.test.ts` as a quick client regression check.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build:console`.
