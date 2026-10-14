"use client";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import type { PublicFirebaseConfig } from "@/server/firebase-admin";

export function firebaseApp(config: PublicFirebaseConfig): FirebaseApp {
  return getApps()[0] ?? initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    appId: config.appId,
    messagingSenderId: config.messagingSenderId,
  });
}

/** Asks for notification permission, registers the service worker and stores the FCM token on the server. */
export async function enablePush(config: PublicFirebaseConfig): Promise<"enabled" | "denied" | "unsupported" | "not-configured"> {
  if (!config.vapidKey || !config.apiKey) return "not-configured";
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  const { isSupported, getMessaging, getToken } = await import("firebase/messaging");
  if (!(await isSupported())) return "unsupported";
  const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (perm !== "granted") return "denied";
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const token = await getToken(getMessaging(firebaseApp(config)), { vapidKey: config.vapidKey, serviceWorkerRegistration: reg });
  if (!token) return "denied";
  await fetch("/api/push/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
  return "enabled";
}
