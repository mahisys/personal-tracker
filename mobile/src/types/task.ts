// Local data shapes for the standalone, single-device task tracker. Nothing
// here is a wire contract — this is just the shape of what's stored in the
// on-device SQLite database (see `src/db/`) and held in memory by the
// zustand stores.

export type TaskStatus = 'YTS' | 'WIP' | 'DONE';
export type RagStatus = TaskStatus | 'OVERDUE';
export type AttachmentType = 'FILE' | 'LINK';

export interface Attachment {
  id: string;
  type: AttachmentType;
  /** A user-typed URL for a LINK attachment, or a local `file://` URI (under
   * the app's own document directory) for a FILE attachment. */
  url: string;
  filename: string | null;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  dueDate: string;
  reminderAt: string | null;
  reminderNotified: boolean;
  status: TaskStatus;
  ragStatus: RagStatus;
  createdAt: string;
  updatedAt: string;
  attachments: Attachment[];
}

/** A row in the local `notifications` table — populated when a scheduled
 * reminder actually fires (see `src/hooks/useNotificationListener.ts`). */
export interface AppNotification {
  id: string;
  taskId: string | null;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface CreateTaskInput {
  id?: string;
  title: string;
  description?: string;
  dueDate: string;
  reminderAt?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  dueDate?: string;
  reminderAt?: string | null;
  status?: TaskStatus;
}
