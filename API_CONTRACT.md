# Personal Tracker — API Contract

Source of truth for the backend (`/backend`) and mobile app (`/mobile`). Both sides must
match this document exactly. The Prisma schema at `backend/prisma/schema.prisma` is the
canonical data model — read it before implementing.

## Base

- Base URL: `http://<host>:4000/api` (configurable via `EXPO_PUBLIC_API_URL` on mobile,
  `PORT` on backend).
- Auth: `Authorization: Bearer <jwt>` header on every route except `/auth/register` and
  `/auth/login`.
- All dates are ISO-8601 strings in UTC over the wire (`2026-08-25T14:30:00.000Z`).
- Errors: `{ "error": { "message": string, "code": string } }` with an appropriate HTTP
  status (400/401/403/404/409/500).

## RAG status derivation

`Task.status` is stored as `YTS | WIP | DONE`. The **effective / RAG status** returned by
every API response as `ragStatus` is derived, never stored:

```
ragStatus =
  status === 'DONE'                        -> 'DONE'
  status !== 'DONE' && dueDate < now       -> 'OVERDUE'
  status === 'WIP'                         -> 'WIP'
  else                                      -> 'YTS'
```

The backend computes this on every read. The mobile app must NOT recompute it locally for
display purposes beyond optimistic UI — always trust the server value, but it's safe to
locally re-derive using the same formula for instant UI feedback (e.g. while offline).

## Auth

### POST /auth/register
Body: `{ email, password, name }` → `201 { token, user }`
`user = { id, email, name, createdAt }`

### POST /auth/login
Body: `{ email, password }` → `200 { token, user }`

### GET /auth/me
→ `200 { user }`

## Tasks

Task shape returned by the API:
```ts
{
  id, title, description, dueDate, reminderAt, reminderNotified,
  status: 'YTS'|'WIP'|'DONE', ragStatus: 'YTS'|'WIP'|'DONE'|'OVERDUE',
  ownerId, createdAt, updatedAt,
  owner: { id, name, email },
  attachments: [{ id, type: 'FILE'|'LINK', url, filename, mimeType, size, createdAt }],
  collaborators: [{ id, userId, email, role: 'OWNER'|'EDITOR'|'VIEWER' }],
}
```

### GET /tasks?date=YYYY-MM-DD&status=&scope=
- `date` optional; omitted = no date filter. Mobile "Today" screen always passes today's
  local date explicitly. Filters on `dueDate` falling within that local day (server
  accepts an optional `tzOffset` query param, default 0: **minutes EAST of UTC**, e.g.
  `+330` for India, `-300` for US Eastern standard time — i.e. `-date.getTimezoneOffset()`
  in JS. Local midnight for `date` is the UTC instant `dateT00:00:00Z - tzOffset`).
- `status` optional: one of `YTS|WIP|DONE|OVERDUE` (filters on ragStatus).
- `scope` optional: `mine` (owned only, default) | `shared` (collaborator only) | `all`.
- → `200 { tasks: Task[] }`, sorted by `dueDate` ascending.

### GET /tasks/:id → `200 { task }`

### POST /tasks
Body: `{ id?, title, description?, dueDate, reminderAt? }` → `201 { task }` (or `200 { task }`
if `id` was already created by a previous call — see idempotency note below).
Creator becomes owner automatically (implicit `OWNER` collaborator row is NOT created —
ownership is `Task.ownerId`; collaborators are additional users).

`id` is optional: a client may generate its own UUID v4 (required for the mobile app's
offline-first flow below) so the task has a stable id from the moment it's created on-device,
online or not — no server-side id remap is ever needed. Omit it to let the server generate
one (fine for any client that always has connectivity, e.g. a future web dashboard).
**Idempotent by id**: POSTing the same `id` twice returns the existing task with `200`
instead of erroring, so a client that created a task offline and is unsure whether an
earlier sync attempt actually reached the server can safely retry.

### GET /tasks/sync?since=<ISO timestamp>
The pull side of offline-first sync — returns everything a client needs to bring its local
cache up to date in one call, no date filtering (that's a client-side concern once it has
the full local set):
```
200 { tasks: Task[], deletedTaskIds: string[], serverTime: ISO }
```
- Omit `since` for an initial/full sync: `tasks` = every task the user owns or collaborates
  on; `deletedTaskIds` = `[]` (nothing to reconcile locally yet).
- Pass `since` (the `serverTime` returned by the previous sync call) for an incremental
  sync: `tasks` = only tasks with `updatedAt > since` that the user can currently see;
  `deletedTaskIds` = ids of tasks deleted (by anyone, tombstoned) since `since` that this
  user could previously see.
- Always store the returned `serverTime` (not the client's own clock) as the new
  high-water mark for the next call, to avoid clock-skew gaps.
- This endpoint intentionally does not require a `date` — mobile keeps a full local mirror
  of every visible task so viewing "today" or any other date never depends on the network.

### PATCH /tasks/:id
Body: any subset of `{ title, description, dueDate, reminderAt, status }` → `200 { task }`
Only owner or `EDITOR`/`OWNER` collaborators may edit; `VIEWER` gets `403`.
Setting `status: 'DONE'` clears any pending reminder notification concerns (no more
reminder fires needed) but does not delete `reminderAt`.

### DELETE /tasks/:id → `204`
Only the owner may delete.

### POST /tasks/:id/attachments
- `multipart/form-data` with field `file` → uploads a document, stored under
  `backend/uploads/`, served at `/uploads/<filename>`, creates `Attachment{type:FILE}`.
- OR JSON body `{ type: 'LINK', url, filename? }` → creates `Attachment{type:LINK}`.
→ `201 { attachment }`

### DELETE /tasks/:id/attachments/:attachmentId → `204`

### POST /tasks/:id/collaborators
Body: `{ email, role? }` (`role` default `EDITOR`) → `201 { collaborator }`
Invites a user by email to collaborate on a task, whether or not they have an account yet
(if they later register with that email, `userId` back-fills automatically on login).
Only the owner may invite/remove collaborators. Creates a `SHARE_INVITE` notification for
the invited user if they already have an account, and sends them a push notification.

### DELETE /tasks/:id/collaborators/:collaboratorId → `204`

## Push tokens

### POST /push/register
Body: `{ token, platform: 'ANDROID'|'IOS'|'WEB' }` → `201 { ok: true }`
`token` is an Expo push token (`ExponentPushToken[...]`) obtained on-device via
`expo-notifications`. Upserts by token so re-registering the same device is a no-op.

### DELETE /push/register
Body: `{ token }` → `204` (call on logout so the device stops receiving pushes)

## Notifications (in-app)

### GET /notifications?unreadOnly=true → `200 { notifications: Notification[] }`
`Notification = { id, type, message, read, taskId, createdAt }`, newest first.

### PATCH /notifications/:id/read → `200 { notification }`

### PATCH /notifications/read-all → `200 { count }`

## Realtime (Socket.IO)

Connect to the same host/port with `auth: { token: <jwt> }`. Server joins the socket to
room `user:<userId>`. Events emitted to the relevant user room(s) — owner + all
collaborators of the affected task:

- `task:created` `{ task }`
- `task:updated` `{ task }`
- `task:deleted` `{ taskId }`
- `notification:new` `{ notification }`

Mobile keeps a single socket connection while authenticated and merges these events into
local state so multi-device / multi-user sync is instant without polling. On reconnect
(app foreground, network regained) mobile re-fetches `/tasks` for the currently viewed
date as a reconciliation safety net.

## Reminders → push + in-app + local alarm

Three independent layers, all driven off `Task.reminderAt`:

1. **Local alarm (works offline, most reliable on-device):** the moment a task is
   created/edited with a `reminderAt`, the mobile app schedules a local notification via
   `expo-notifications` for that exact instant on that device. Rescheduled on edit,
   cancelled on delete/complete.
2. **Push (cross-device / other collaborators):** a backend cron job (every 60s) selects
   `Task`s where `reminderAt <= now AND reminderNotified = false`, marks them
   `reminderNotified = true`, creates a `REMINDER` `Notification` for the owner + every
   collaborator, and sends an Expo push to each of their registered tokens.
3. **In-app notification center:** the `Notification` rows created above populate
   `GET /notifications` and arrive live via the `notification:new` socket event, so a
   user with the app open sees an in-app banner even without OS-level push.

## Offline-first architecture (mobile)

The phone app must be fully usable with zero network connectivity — viewing today's tasks,
creating/editing/deleting tasks, marking them done, and getting reminders must never depend
on the backend being reachable. The backend is only needed to sync across devices/users.

Required design on the mobile side:

1. **Local database is the source of truth for the UI.** All screens read from and write to
   an on-device SQLite database (`expo-sqlite`), never directly from the network. Every task
   CRUD action applies to the local DB immediately (instant UI, works offline) and is also
   recorded in a local **pending-operations queue**.
2. **Background sync engine** drains the pending-operations queue against the REST API
   whenever a connection is available (on network-reconnect, app foreground, and a periodic
   timer), using `id`-bearing, idempotent POSTs so retries after a dropped connection never
   duplicate a task (see the idempotency note on `POST /tasks` above). Failed items (real
   validation/permission errors, not network errors) are dropped with a logged reason rather
   than retried forever; network errors leave the item queued for the next attempt.
3. **Pull sync** calls `GET /tasks/sync` (first with no `since` for the initial full mirror,
   then incrementally using the stored `serverTime`) to merge remote changes — including
   ones made by collaborators — into the local DB, and to remove locally any task present in
   `deletedTaskIds`. A task that's simultaneously pending-local-edit and remotely updated
   resolves by `updatedAt` (later wins) — acceptable for a personal/small-team tracker.
4. **Live updates via Socket.IO remain additive, not required**: when connected, `task:*`
   socket events update the local DB immediately for a snappy multi-device feel; when not
   connected, the next pull sync catches up regardless. The app must never block or error
   out because the socket isn't connected.
5. **Reminders stay device-local regardless of sync state**: the local alarm scheduled via
   `expo-notifications` is driven off the local DB's `reminderAt`, not off any network call —
   this already doesn't depend on connectivity and must keep working exactly as today.
6. Attachments/collaborator invites that require the server (file upload bytes, inviting a
   brand-new email) are queued the same way as task edits when created offline, and clearly
   marked "pending sync" in the UI until they actually reach the server — the user should
   never see them silently fail or silently succeed while actually stuck offline.

## Environment variables (backend)

- `DATABASE_URL` (default `file:./dev.db`)
- `JWT_SECRET` (required)
- `PORT` (default `4000`)
- `UPLOAD_DIR` (default `./uploads`)
- `CORS_ORIGIN` (default `*`, tighten in production)
