"use client";
import { useEffect } from "react";
import type { PublicFirebaseConfig } from "@/server/firebase-admin";
import { enablePush } from "@/lib/client/firebase";

/** Registers the service worker (installable app) and refreshes the push token when permission was already granted. */
export function PushRegistrar({ config }: { config: PublicFirebaseConfig }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    if ("Notification" in window && Notification.permission === "granted") enablePush(config).catch(() => {});
  }, [config]);
  return null;
}
