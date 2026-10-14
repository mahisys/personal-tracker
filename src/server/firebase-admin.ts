import "server-only";
import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";

let app: App | undefined;

/** Uses Application Default Credentials (the Cloud Run service account) in production. */
function adminApp(): App {
  if (app) return app;
  app = getApps()[0] ?? initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT });
  return app;
}

export function getAdminAuth() {
  return getAuth(adminApp());
}

export function getAdminMessaging() {
  return getMessaging(adminApp());
}

/** Public Firebase web config, read at runtime so one container image works in any project. */
export function publicFirebaseConfig() {
  return {
    apiKey: process.env.FIREBASE_API_KEY ?? "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.FIREBASE_PROJECT_ID ?? "",
    appId: process.env.FIREBASE_APP_ID ?? "",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID ?? "",
    vapidKey: process.env.FIREBASE_VAPID_KEY ?? "",
  };
}
export type PublicFirebaseConfig = ReturnType<typeof publicFirebaseConfig>;
