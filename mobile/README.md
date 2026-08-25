# Personal Tracker — Mobile

React Native (Expo, managed workflow, TypeScript) client for the Personal Tracker task
app. Consumes the REST + Socket.IO API described in `../API_CONTRACT.md` — that document
is the source of truth for every request/response shape and event this app relies on.

## Stack

- **Expo SDK 57**, TypeScript, managed workflow.
- **React Navigation** (native-stack + bottom-tabs) for navigation: an auth stack (Login /
  Register) and, once signed in, a root stack containing the main tab bar (Today / Calendar
  / Notifications / Profile) plus a modal Task Detail screen for create/edit.
- **Zustand** for global state (auth, tasks, notifications, push-registration status) — a
  single small store per concern, no boilerplate reducers/providers.
- **expo-notifications** for both local reminder alarms and Expo push tokens.
- **expo-secure-store** for the JWT.
- **socket.io-client** for realtime task/notification sync.
- **react-native-gesture-handler + react-native-reanimated** for swipe-to-complete /
  swipe-to-delete task rows.

## Getting started

```bash
npm install
npx expo start
```

Then press `a` for an Android emulator, scan the QR code with Expo Go, or use `w` for web.

### Pointing the app at your backend

The API base URL comes from `EXPO_PUBLIC_API_URL`. Copy `.env.example` to `.env` and adjust
it, then restart `expo start`:

```bash
cp .env.example .env
```

| Situation | Value |
| --- | --- |
| Android emulator, backend running on your host machine (default if unset) | `http://10.0.2.2:4000/api` |
| iOS simulator | `http://localhost:4000/api` |
| Physical device on the same Wi-Fi | `http://<your-machine-lan-ip>:4000/api` |
| Production / staging | `https://api.yourdomain.com/api` |

## Project layout

```
App.tsx                   # Providers (gesture handler, safe area, navigation), auth hydration
src/
  api/                     # Typed fetch client + one function per API_CONTRACT.md route
  components/              # RagBadge, Button, TextField, TaskRow (swipeable), DateTimeField, ...
  hooks/useRealtimeSession  # Socket connection + push registration + foreground reconciliation
  lib/                     # rag.ts (deriveRagStatus), dateUtils, localReminders, pushToken, socket, session
  navigation/              # AuthStack, MainTabs, RootNavigator, shared param types
  screens/                 # Login, Register, Today, Calendar, Notifications, Profile, TaskDetail
  state/                   # zustand stores: authStore, taskStore, notificationStore, pushStore
  theme/                   # Design tokens: colors, spacing, radii, typography
```

### RAG status

`src/lib/rag.ts` exports `deriveRagStatus(status, dueDate, now?)`, a pure re-implementation
of the formula in `API_CONTRACT.md`. It's only used for instant optimistic UI (e.g. the
badge shown while creating a task, before the server responds) — everywhere a task is
already loaded from the API, the server's `ragStatus` field is what's rendered.

### Reminder pipeline

Matches the three layers in `API_CONTRACT.md`:

1. **Local alarm** — `src/lib/localReminders.ts` schedules an `expo-notifications` local
   notification the moment a task with a `reminderAt` is created or edited (via the
   `taskStore` actions), and cancels/reschedules it on edit, delete, or completion.
2. **Push** — `src/lib/pushToken.ts` + `useRealtimeSession` fetch this device's Expo push
   token on login and register it with `POST /push/register`; `performLogout()` (in
   `src/lib/session.ts`) unregisters it with `DELETE /push/register`.
3. **In-app** — the Notifications tab reads `GET /notifications`, and new ones arrive live
   over the socket's `notification:new` event via `notificationStore`.

### Realtime sync

`useRealtimeSession` (mounted once in `App.tsx`) opens a single Socket.IO connection while
a JWT is present, merges `task:created` / `task:updated` / `task:deleted` /
`notification:new` events into the stores, and re-fetches the current day's tasks plus
notifications whenever the app returns to the foreground, as a reconciliation safety net.

## Verifying the app without a backend or device

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

## Notes / deviations from the contract

- `tzOffset` is sent as minutes **east** of UTC (e.g. `+330` for India, `-300` for US
  Eastern standard time) — the negation of JavaScript's own `Date.getTimezoneOffset()`.
  `API_CONTRACT.md` doesn't pin down the sign convention explicitly; this is the more
  common convention for a "timezone offset" query parameter. Confirm this matches the
  backend's interpretation.
- The Today and Calendar screens fetch with `scope=all` (owned + shared tasks) rather than
  the contract's default `mine`, since collaborators need to see tasks shared with them in
  the day-to-day views, not just via a separate "shared" filter.
