# Admin User Detail Design

## Goal

Add a read-only user detail view to `/admin` so the project owner can inspect one user's workspace, product, and video task situation without using SSH or SQLite.

## Scope

The first version adds user-level drilldown only. It does not add disabling, deleting, role editing, retrying jobs, or cleanup actions.

## Behavior

- In the admin user table, each row becomes clickable.
- Clicking a row opens a right-side detail drawer.
- The drawer fetches `GET /api/admin/users/:userId`.
- Only project admins can call the endpoint.
- The drawer shows:
  - User email, role, verification state, registration time, last activity.
  - Summary metrics: workspaces, products, video jobs, completed, expired, failed, queued.
  - Workspace list with owner, member count, product count, job count, last job time.
  - Recent video jobs with status, model, language, duration, output count, created/completed/expires timestamps.
  - Recent products with SKU, title, created/updated timestamps.

## Data Model

Use existing SQLite tables only:

- `auth_users`, `users`, `auth_sessions`
- `workspaces`, `workspace_members`
- `products`
- `video_jobs`

## UI

Keep the existing quiet operational dashboard style. Use a drawer because it lets the project owner inspect details while preserving the user table context.

## Testing

- Add a server test proving admins can fetch one user's detail and non-admins cannot.
- Verify the endpoint returns workspace, product, video status, and recent job data.
- Run admin/auth tests, typecheck, and console build.
