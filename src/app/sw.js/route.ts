import { publicFirebaseConfig } from "@/server/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * Service worker: makes the app installable, shows push notifications from Firebase Cloud Messaging
 * and opens the right page when one is tapped. Served from a route so the Firebase config is injected at runtime.
 */
export function GET() {
  const c = publicFirebaseConfig();
  const fb = c.apiKey && c.messagingSenderId
    ? `
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");
firebase.initializeApp(${JSON.stringify({ apiKey: c.apiKey, authDomain: c.authDomain, projectId: c.projectId, appId: c.appId, messagingSenderId: c.messagingSenderId })});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  self.registration.showNotification(d.title || "Command Center", {
    body: d.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: d.tag || undefined,
    data: { link: d.link || "/" },
  });
});`
    : "";
  const js = `
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { await c.navigate(link); return c.focus(); } }
    return self.clients.openWindow(link);
  })());
});
${fb}
`;
  return new Response(js, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-cache", "service-worker-allowed": "/" } });
}
