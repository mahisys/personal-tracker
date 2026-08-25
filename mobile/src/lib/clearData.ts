// A full local reset: wipes every task, notification, and attachment file,
// and cancels any scheduled reminder alarms. There's no account to log out
// of in a single-user, single-device app, so this is the closest equivalent
// — used by the "Clear all data" action in Settings.
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import * as taskRepo from '../db/taskRepository';
import { useNotificationStore } from '../state/notificationStore';
import { useTaskStore } from '../state/taskStore';

const ATTACHMENTS_DIR = `${FileSystem.documentDirectory}attachments/`;

export async function clearAllData(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  await FileSystem.deleteAsync(ATTACHMENTS_DIR, { idempotent: true }).catch(() => {});
  taskRepo.clearAll();
  useTaskStore.setState({ tasksById: {} });
  useNotificationStore.setState({ notifications: [] });
}
