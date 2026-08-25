# Personal Tracker

A personal task tracker: tasks are scheduled per date/time, "Today" is always the default
focus, tasks support RAG status (YTS / WIP / DONE / OVERDUE), attachments (links or
uploaded documents), reminders that sync to the device as real alarms plus push and
in-app notifications, and collaboration — you can add other users to a task by email.

The project is split into two independently-runnable pieces that talk to each other over
the REST + Socket.IO contract in [`API_CONTRACT.md`](./API_CONTRACT.md):

```
backend/   Node.js + TypeScript + Express + Prisma (SQLite) API + Socket.IO + reminder cron
mobile/    React Native (Expo, TypeScript) app — the installable Android APK
```

## Quickstart

### 1. Backend

```bash
cd backend
cp .env.example .env      # set JWT_SECRET
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev                # http://localhost:4000 (REST under /api, sockets same port)
```

See [`backend/README.md`](./backend/README.md) for full details.

### 2. Mobile app

```bash
cd mobile
cp .env.example .env       # point EXPO_PUBLIC_API_URL at your backend
npm install
npx expo start             # scan the QR code with Expo Go, or run on an emulator
```

Android emulators reach a backend running on your host machine at
`http://10.0.2.2:4000/api` (the default in `.env.example`) — a physical device needs your
machine's LAN IP instead.

See [`mobile/README.md`](./mobile/README.md) for full details, including **how to build
the installable `.apk`** (cloud build via EAS, or a fully local Gradle build).

## Feature summary

- **Today-first**: the app opens straight to today's tasks; a calendar view lets you
  browse any other date.
- **Full CRUD**: create, view, edit, delete tasks (title, description, due date/time,
  reminder date/time).
- **Attachments**: attach a link (URL) or upload a document to any task.
- **Reminders, three layers deep**: a local on-device alarm scheduled the moment a
  reminder is set (works offline), a server-side push notification at the same instant
  (reaches other devices/collaborators), and an in-app notification center — see
  "Reminders → push + in-app + local alarm" in `API_CONTRACT.md` for the full pipeline.
- **RAG status**: every task shows as `YTS` (Yet To Start), `WIP` (Work In Progress),
  `DONE`, or `OVERDUE` — the last is always derived from the due date, never stored, so it
  can never go stale.
- **Collaboration**: invite any other user to a task by email, with `OWNER` / `EDITOR` /
  `VIEWER` roles; shared tasks sync live to every collaborator via Socket.IO.

## Architecture notes

- The two apps only agree on the wire contract (`API_CONTRACT.md`) — they were built as
  independent codebases against that shared spec, so either side can be replaced or
  redeployed without touching the other as long as the contract holds.
- SQLite is the default datastore for zero-config local/dev use; the Prisma schema is
  written to be portable to Postgres for a real deployment (see comments in
  `backend/prisma/schema.prisma`).
- Push notifications use Expo's push service (`expo-server-sdk` on the backend,
  `expo-notifications` on the client) rather than raw FCM/APNs — no separate Firebase/Apple
  push project setup is required for this to work on a standard Expo/EAS-built app.
