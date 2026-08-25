# Personal Tracker — Backend

Node.js + TypeScript + Express API for the personal task-tracker app. Implements the
routes, data shapes, RAG-status derivation, realtime events, and reminder pipeline
described in `../API_CONTRACT.md`.

## Stack

- Express (REST API) + Socket.IO (realtime)
- Prisma ORM with SQLite (`prisma/schema.prisma` is the canonical data model)
- `jsonwebtoken` + `bcryptjs` for auth
- `multer` for file attachment uploads (served statically from `/uploads`)
- `zod` for request body validation
- `node-cron` for the 60s reminder sweep
- `expo-server-sdk` for push notifications to Expo push tokens

## Setup

```bash
npm install
cp .env.example .env   # edit JWT_SECRET etc. if needed
npm run prisma:generate
npm run prisma:migrate -- --name init   # only needed the first time / after schema changes
```

`.env` variables (see `.env.example`):

| Variable       | Default          | Notes                                   |
|----------------|------------------|------------------------------------------|
| `DATABASE_URL` | `file:./dev.db`  | SQLite file path                        |
| `JWT_SECRET`   | *(required)*     | Set a real random secret in production  |
| `PORT`         | `4000`           | HTTP + Socket.IO port                   |
| `UPLOAD_DIR`   | `./uploads`      | Where attachment files are stored       |
| `CORS_ORIGIN`  | `*`              | Tighten in production                   |

## Run

```bash
npm run dev      # ts-node-dev/tsx watch mode
npm run build    # tsc -> dist/
npm start        # node dist/index.js (after build)
```

The server listens on `http://localhost:4000` by default; the REST API is mounted
under `/api`, uploaded files are served from `/uploads`, and the same HTTP server
also hosts the Socket.IO endpoint (connect with `auth: { token: <jwt> }`).

## Database

The Prisma schema lives at `prisma/schema.prisma`. Migrations are committed under
`prisma/migrations/` — run `npm run prisma:migrate` after changing the schema to
generate a new migration, and `npm run prisma:generate` any time you only need to
regenerate the Prisma Client (e.g. after `npm install` on a fresh checkout).

Note: SQLite's Prisma connector does not support `enum` blocks, so the value sets
that would otherwise be Prisma enums (`TaskStatus`, `CollaboratorRole`,
`AttachmentType`, `NotificationType`, `Platform`) are plain `String` columns,
validated at the application layer (see `src/lib/constants.ts` and `src/validation`).

## Push notifications

Push delivery uses the `expo-server-sdk` against Expo's push service — there is
nothing to configure on the server beyond outbound internet access. Devices
register their Expo push token (obtained on-device via `expo-notifications` in the
mobile app) via `POST /api/push/register`, and the reminder cron (and collaborator
invite flow) send pushes to those tokens automatically. No Firebase/APNs project
setup is required server-side.

## Reminder pipeline

A `node-cron` job runs every 60 seconds, finds tasks whose `reminderAt` has passed
and haven't yet been notified, marks them `reminderNotified = true`, and for the
owner + every collaborator: creates a `REMINDER` notification row, emits
`notification:new` over their socket room, and sends them an Expo push.
