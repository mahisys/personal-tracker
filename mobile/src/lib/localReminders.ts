// Layer 1 of the reminder pipeline described in API_CONTRACT.md: a local,
// on-device alarm scheduled the moment a task with a `reminderAt` is
// created or edited, rescheduled on edit, cancelled on delete/complete.
// This works fully offline and is independent of the push/in-app layers.
import * as Notifications from 'expo-notifications';
import { Task } from '../api/types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function alarmId(taskId: string): string {
  return `task-reminder-${taskId}`;
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

/** Schedules (or reschedules) the local alarm for a task's reminder, if any. */
export async function syncTaskReminder(task: Task): Promise<void> {
  await cancelTaskReminder(task.id);
  if (!task.reminderAt || task.status === 'DONE') return;
  const fireDate = new Date(task.reminderAt);
  if (fireDate.getTime() <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    identifier: alarmId(task.id),
    content: {
      title: 'Task reminder',
      body: task.title,
      data: { taskId: task.id },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireDate,
    },
  });
}

export async function cancelTaskReminder(taskId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(alarmId(taskId));
  } catch {
    // No scheduled alarm for this task — nothing to cancel.
  }
}
