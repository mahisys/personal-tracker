// Local, on-device alarm scheduled the moment a task with a `reminderAt` is
// created or edited, rescheduled on edit, cancelled on delete/complete.
// Fully local — no server involved. `useNotificationListener` records an
// in-app notification whenever one of these alarms actually fires.
import * as Notifications from 'expo-notifications';
import { Task } from '../types/task';

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
