# Personal Tracker

A personal task tracker, standalone on a single device: tasks are scheduled per date/time,
"Today" is always the default focus, tasks support RAG status (YTS / WIP / DONE / OVERDUE),
attachments (links or locally-stored documents), and reminders that fire as real on-device
alarms and show up in an in-app notification center.

This is a single React Native (Expo, TypeScript) app — there is no backend, no login, and
no network dependency of any kind. Everything lives in an on-device SQLite database.

```
mobile/    React Native (Expo, TypeScript) app — the installable Android APK
```

## Quickstart

```bash
cd mobile
npm install
npx expo start             # scan the QR code with Expo Go, or run on an emulator
```

No accounts, environment variables, or servers to set up — the app works the moment it
opens.

See [`mobile/README.md`](./mobile/README.md) for full details, including **how to build
the installable `.apk`** (cloud build via EAS, or a fully local Gradle build).

## Feature summary

- **Today-first**: the app opens straight to today's tasks; a calendar view lets you
  browse any other date.
- **Full CRUD**: create, view, edit, delete tasks (title, description, due date/time,
  reminder date/time).
- **Attachments**: attach a link (URL), or a document copied into the app's own local
  storage, to any task.
- **Reminders**: a local on-device alarm fires at the scheduled time (works fully offline),
  and every delivered reminder is also recorded in an in-app notification center.
- **RAG status**: every task shows as `YTS` (Yet To Start), `WIP` (Work In Progress),
  `DONE`, or `OVERDUE` — the last is always derived from the due date, never stored, so it
  can never go stale.
- **Settings**: check/request notification permission, and clear all local data.

## Architecture notes

- Single-user, single-device, fully local — there is no server, sync, or shared state of
  any kind, and nothing the app does ever requires a network connection.
- SQLite (via `expo-sqlite`) is the only data layer; it isn't a cache in front of anything.
