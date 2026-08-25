// Local storage for tasks and in-app notifications. This is the only data
// layer in the app — there is no server and nothing to sync to, so every
// store action in `state/taskStore.ts` / `state/notificationStore.ts` reads
// and writes here directly and synchronously.
//
// `attachments` is flattened into a JSON text column: the app never queries
// into attachment sub-fields in SQL, only in JS after loading a row, so full
// relational normalization isn't worth it here.
import type { AppNotification, Task } from '../types/task';
import { getDb } from './database';

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  dueDate: string;
  reminderAt: string | null;
  reminderNotified: number;
  status: string;
  ragStatus: string;
  createdAt: string;
  updatedAt: string;
  attachmentsJson: string;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.dueDate,
    reminderAt: row.reminderAt,
    reminderNotified: !!row.reminderNotified,
    status: row.status as Task['status'],
    ragStatus: row.ragStatus as Task['ragStatus'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    attachments: JSON.parse(row.attachmentsJson) as Task['attachments'],
  };
}

/** Insert-or-replace a task. */
export function upsertTask(task: Task): void {
  getDb().runSync(
    `INSERT INTO tasks (
       id, title, description, dueDate, reminderAt, reminderNotified, status, ragStatus,
       createdAt, updatedAt, attachmentsJson
     ) VALUES ($id, $title, $description, $dueDate, $reminderAt, $reminderNotified, $status, $ragStatus,
       $createdAt, $updatedAt, $attachmentsJson)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       dueDate = excluded.dueDate,
       reminderAt = excluded.reminderAt,
       reminderNotified = excluded.reminderNotified,
       status = excluded.status,
       ragStatus = excluded.ragStatus,
       createdAt = excluded.createdAt,
       updatedAt = excluded.updatedAt,
       attachmentsJson = excluded.attachmentsJson`,
    {
      $id: task.id,
      $title: task.title,
      $description: task.description,
      $dueDate: task.dueDate,
      $reminderAt: task.reminderAt,
      $reminderNotified: task.reminderNotified ? 1 : 0,
      $status: task.status,
      $ragStatus: task.ragStatus,
      $createdAt: task.createdAt,
      $updatedAt: task.updatedAt,
      $attachmentsJson: JSON.stringify(task.attachments),
    },
  );
}

export function deleteTaskRow(id: string): void {
  getDb().runSync(`DELETE FROM tasks WHERE id = $id`, { $id: id });
}

export function listTasks(): Task[] {
  return getDb()
    .getAllSync<TaskRow>(`SELECT * FROM tasks`)
    .map(rowToTask);
}

export function getTask(id: string): Task | undefined {
  const row = getDb().getFirstSync<TaskRow>(`SELECT * FROM tasks WHERE id = $id`, { $id: id });
  return row ? rowToTask(row) : undefined;
}

// ---- notifications ----

interface NotificationRow {
  id: string;
  taskId: string | null;
  message: string;
  createdAt: string;
  read: number;
}

function rowToNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    taskId: row.taskId,
    message: row.message,
    createdAt: row.createdAt,
    read: !!row.read,
  };
}

export function insertNotification(notification: AppNotification): void {
  getDb().runSync(
    `INSERT INTO notifications (id, taskId, message, createdAt, read)
     VALUES ($id, $taskId, $message, $createdAt, $read)`,
    {
      $id: notification.id,
      $taskId: notification.taskId,
      $message: notification.message,
      $createdAt: notification.createdAt,
      $read: notification.read ? 1 : 0,
    },
  );
}

export function listNotifications(): AppNotification[] {
  return getDb()
    .getAllSync<NotificationRow>(`SELECT * FROM notifications ORDER BY createdAt DESC`)
    .map(rowToNotification);
}

export function markNotificationRead(id: string): void {
  getDb().runSync(`UPDATE notifications SET read = 1 WHERE id = $id`, { $id: id });
}

export function markAllNotificationsRead(): void {
  getDb().execSync(`UPDATE notifications SET read = 1;`);
}

/** Wipes every local task and notification — used by the "Clear all data"
 * action in Settings, since there's no account to log out of. */
export function clearAll(): void {
  getDb().execSync('DELETE FROM tasks; DELETE FROM notifications;');
}
