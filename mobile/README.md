# Personal Tracker — Mobile

A standalone, single-user, single-device task tracker. React Native (Expo, managed
workflow, TypeScript). There is no backend, no login, and no network dependency of any
kind — everything lives in an on-device SQLite database and works fully offline.

## Stack

- **Expo SDK 57**, TypeScript, managed workflow.
- **React Navigation** (native-stack + bottom-tabs): a tab bar (Today / Calendar /
  Notifications / Settings) plus a modal Task Detail screen for create/edit. The app opens
  straight into the tabs — there's no auth stack to sign into.
- **Zustand** for global state (tasks, notifications) — a single small store per concern,
  no boilerplate reducers/providers.
- **expo-sqlite** as the on-device database — the only data layer in the app. Tasks and
  in-app notifications are both stored here.
- **expo-crypto** for client-generated task/attachment/notification ids (`Crypto.randomUUID()`).
- **expo-notifications** for local reminder alarms and for detecting when one fires (which
  feeds the in-app notification center).
- **expo-file-system** to copy picked documents into the app's own storage, and
  **expo-sharing** to open them again later.
- **react-native-gesture-handler + react-native-reanimated** for swipe-to-complete /
  swipe-to-delete task rows.

## Getting started

```bash
npm install
npx expo start
```

Then press `a` for an Android emulator, scan the QR code with Expo Go, or use `w` for web.
No configuration, accounts, or environment variables are needed — the app works the moment
it opens.

## Project layout

```
App.tsx                   # Providers (gesture handler, safe area, navigation), notification listener
src/
  components/              # RagBadge, Button, TextField, TaskRow (swipeable), DateTimeField, ...
  db/                      # expo-sqlite database + taskRepository (tasks + notifications tables)
  hooks/useNotificationListener  # Records an in-app notification whenever a reminder fires
  lib/                     # rag.ts (deriveRagStatus), dateUtils, localReminders, clearData
  navigation/              # MainTabs, RootNavigator (hydrates the local DB), types
  screens/                 # Today, Calendar, Notifications, Settings, TaskDetail
  state/                   # zustand stores: taskStore, notificationStore — both purely local
  theme/                   # Design tokens: colors, spacing, radii, typography
  types/                   # Task, Attachment, AppNotification, and related local data shapes
```

### RAG status

`src/lib/rag.ts` exports `deriveRagStatus(status, dueDate, now?)`, a pure function that
computes a task's `YTS` / `WIP` / `DONE` / `OVERDUE` status from its stored status and due
date. It's never stored itself, so it can never go stale.

### Reminders and notifications

1. **Local alarm** — `src/lib/localReminders.ts` schedules an `expo-notifications` local
   notification the moment a task with a `reminderAt` is created or edited (via the
   `taskStore` actions), and cancels/reschedules it on edit, delete, or completion. This
   works fully offline, using only on-device scheduling.
2. **In-app notification center** — `src/hooks/useNotificationListener.ts` is mounted once
   at the app root and listens for a scheduled reminder actually being delivered (in the
   foreground or while backgrounded) via `expo-notifications`' `addNotificationReceivedListener`.
   Each delivery is recorded as a row in the local `notifications` table and shows up in the
   Notifications tab.

### Attachments

Link attachments are just a URL the user types in. File attachments are copied (via
`expo-file-system`) into the app's own document directory the moment they're picked, so
they remain available regardless of where the original file came from; opening one again
later uses `expo-sharing` (falling back to `Linking` if sharing isn't available on the
device).

### Fully local, by design

Every screen reads and writes tasks and notifications through an on-device SQLite database
(`src/db/`) — there is no server, no sync, and no account. Deleting the app or using
"Clear all data" in Settings is the only way data is lost; nothing is ever transmitted
anywhere.

## Verifying the app without a device

```bash
npx tsc --noEmit      # type-check
npx expo export       # confirm the JS bundle builds
npx expo-doctor       # dependency / config sanity checks
```

## Building the APK

Two ways to get an installable `.apk`. `eas.json`'s `preview` profile is already configured
with `"android": { "buildType": "apk" }` so EAS produces an APK instead of the default AAB.

### Option A — Cloud build with EAS (no local Android SDK needed)

Requires a free Expo account.

```bash
npm install -g eas-cli
eas login
eas build:configure          # first time only — links the project, sets extra.eas.projectId
eas build -p android --profile preview
```

When the build finishes, EAS prints a download URL for the `.apk` (also visible on
https://expo.dev under your project's Builds tab). Download it and install it on a device,
or share the link.

### Option B — Fully local build (requires Android SDK + JDK)

```bash
npx expo prebuild -p android
cd android
./gradlew assembleRelease
```

The APK is written to:

```
android/app/build/outputs/apk/release/app-release.apk
```

(`assembleDebug` instead of `assembleRelease` produces a debug-signed APK at
`android/app/build/outputs/apk/debug/app-debug.apk` if you just want something installable
quickly without setting up a release signing key.)
