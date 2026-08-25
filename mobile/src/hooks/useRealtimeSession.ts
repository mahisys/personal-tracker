// Mounted once near the app root. While a JWT is present it keeps a single
// Socket.IO connection open (merging realtime task/notification events into
// the stores, as an additive speed boost only — never required for
// correctness) and registers this device's Expo push token. It also drives
// `useBackgroundSync` (network-reconnect / foreground / periodic triggers for
// the offline-first sync engine) and, on app foreground, re-fetches
// notifications as a reconciliation safety net, per API_CONTRACT.md.
import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { PushApi } from '../api/endpoints';
import { requestNotificationPermissions } from '../lib/localReminders';
import { currentPlatform, getExpoPushToken } from '../lib/pushToken';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { useAuthStore } from '../state/authStore';
import { useNotificationStore } from '../state/notificationStore';
import { usePushStore } from '../state/pushStore';
import { useTaskStore } from '../state/taskStore';
import { useBackgroundSync } from '../sync/useBackgroundSync';

// Local task data always comes from the on-device DB and is kept in sync by
// `useBackgroundSync` (network-reconnect / foreground / periodic triggers), so
// this reconciliation only needs to cover notifications, which still live
// purely server-side.
function reconcile(): void {
  useNotificationStore.getState().fetchAll().catch(() => {});
}

export function useRealtimeSession(): void {
  const token = useAuthStore((state) => state.token);
  useBackgroundSync();

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      return;
    }

    connectSocket(token, {
      onTaskCreated: (task) => useTaskStore.getState().upsertFromSocket(task),
      onTaskUpdated: (task) => useTaskStore.getState().upsertFromSocket(task),
      onTaskDeleted: (taskId) => useTaskStore.getState().removeFromSocket(taskId),
      onNotificationNew: (notification) => useNotificationStore.getState().addFromSocket(notification),
    });

    let cancelled = false;
    (async () => {
      const granted = await requestNotificationPermissions();
      if (!granted || cancelled) return;
      const pushToken = await getExpoPushToken();
      if (!pushToken || cancelled) return;
      try {
        await PushApi.register(pushToken, currentPlatform());
        usePushStore.getState().setToken(pushToken);
        usePushStore.getState().setRegistered(true);
      } catch {
        usePushStore.getState().setRegistered(false);
      }
    })();

    return () => {
      cancelled = true;
      disconnectSocket();
    };
  }, [token]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && useAuthStore.getState().token) {
        reconcile();
      }
    });
    return () => subscription.remove();
  }, []);
}
