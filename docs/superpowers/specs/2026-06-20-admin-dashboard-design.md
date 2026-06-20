# Haitu Admin Dashboard Design

## Goal

Build a project-owner admin dashboard at `/admin` so the Haitu project owner can see user growth and activity across the whole platform.

## Scope

The first version is for one project owner account. It focuses on visibility, not account operations. Admin-only APIs expose aggregate user metrics and a user table; ordinary users keep using `/console`.

## Access Model

- `/admin` serves the same React shell as `/console`, but the React app renders an admin dashboard when `window.location.pathname` is `/admin`.
- Admin API routes live under `/api/admin/*`.
- Every admin API request must have a valid login session and `users.role = 'admin'`.
- Non-admin authenticated users receive HTTP 403 from admin APIs.
- Unauthenticated users receive HTTP 401.
- The first version does not include role-editing UI. The project owner can be promoted directly in SQLite or by a later maintenance command.

## First-Version Page

The `/admin` page shows:

- Overview metrics: total users, verified users, new users today, new users in the last 7 days, active users in the last 7 days, total workspaces, total products, total video jobs.
- Growth chart: daily registrations for the last 30 days.
- Active chart: daily platform activity for the last 30 days, based on audit-log events.
- User table: email, role, email verification state, workspace count, product count, video job count, registration time, last activity time.

## Data Sources

- `auth_users`: canonical registered account and email verification state.
- `users`: platform profile and project role.
- `workspace_members`: user-to-workspace membership.
- `workspaces`: workspace count and owner relationship.
- `products`: product count per user's workspaces.
- `video_jobs`: video job count per user's workspaces.
- `audit_logs`: last activity and activity chart. Existing login audit logs do not store actor ids, so early activity may be incomplete. Product and task actions can be attributed where actor ids are available.

## UI Direction

Use a quiet operational dashboard style: dense, scannable, and project-owner focused. Avoid a marketing hero. Reuse the existing console design tokens and component primitives so `/admin` feels like part of Haitu.

## Testing

- Server tests prove `/admin` serves the shell.
- Server tests prove `/api/admin/overview` rejects unauthenticated users, rejects non-admin users, and returns global user metrics for admins.
- Build/typecheck prove the React route compiles.
