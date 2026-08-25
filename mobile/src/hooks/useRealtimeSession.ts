// Mounted once near the app root. While a JWT is present it keeps a single
// Socket.IO connection open (merging realtime task/notification events into
// the stores) and registers this device's Expo push token. On app
// foreground it also re-fetches as a reconciliation safety net, per
// API_CONTRACT.md's Realtime section.
import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { PushApi } from '../api/endpoints';
import { requestNotificationPermissions } from '../lib/localReminders';
import { currentPlatform, getExpoPushToken } from '../lib/pushToken';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { todayKey, tzOffsetMinutes } from '../lib/dateUtils';
import { useAuthStore } from '../state/authStore';
import { useNotificationStore } from '../state/notificationStore';
import { usePushStore } from '../state/pushStore';
import { useTaskStore } from '../state/taskStore';

function reconcile(): void {
  useTaskStore
    .getState()
    .fetchTasks({ date: todayKey(), tzOffset: tzOffsetMinutes(), scope: 'all' })
    .catch(() => {});
  useNotificationStore.getState().fetchAll().catch(() => {});
}

export function useRealtimeSession(): void {
  const token = useAuthStore((state) => state.token);

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
