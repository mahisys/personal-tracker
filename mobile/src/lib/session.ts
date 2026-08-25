// Orchestrates the pieces that must happen together around logout: the
// server needs to stop pushing to this device, the socket needs to close,
// and every store needs to forget this user's data before the auth screens
// show again.
import { PushApi } from '../api/endpoints';
import { useAuthStore } from '../state/authStore';
import { useNotificationStore } from '../state/notificationStore';
import { usePushStore } from '../state/pushStore';
import { useTaskStore } from '../state/taskStore';
import { disconnectSocket } from './socket';

export async function performLogout(): Promise<void> {
  const pushToken = usePushStore.getState().expoPushToken;
  if (pushToken) {
    try {
      await PushApi.unregister(pushToken);
    } catch {
      // Best-effort — the device will simply stop being reachable once the
      // JWT is cleared regardless.
    }
  }
  disconnectSocket();
  useTaskStore.getState().reset();
  useNotificationStore.getState().reset();
  usePushStore.getState().reset();
  await useAuthStore.getState().logout();
}
