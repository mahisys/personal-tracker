// Mounted once near the app root (see App.tsx). Listens for local reminder
// notifications actually being delivered — foreground or backgrounded — and
// records each one in the local notification center. This is the only
// source that feeds `notificationStore`; nothing here talks to a server.
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useNotificationStore } from '../state/notificationStore';

export function useNotificationListener(): void {
  const addNotification = useNotificationStore((s) => s.addNotification);

  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((event) => {
      const content = event.request.content;
      const data = content.data as { taskId?: string } | undefined;
      const message = content.body ?? content.title ?? 'Reminder';
      addNotification({ taskId: data?.taskId ?? null, message });
    });
    return () => subscription.remove();
  }, [addNotification]);
}
