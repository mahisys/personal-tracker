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
Body: `{ title, description?, dueDate, reminderAt? }` → `201 { task }`
Creator becomes owner automatically (implicit `OWNER` collaborator row is NOT created —
ownership is `Task.ownerId`; collaborators are additional users).

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

## Environment variables (backend)

- `DATABASE_URL` (default `file:./dev.db`)
- `JWT_SECRET` (required)
- `PORT` (default `4000`)
- `UPLOAD_DIR` (default `./uploads`)
- `CORS_ORIGIN` (default `*`, tighten in production)
