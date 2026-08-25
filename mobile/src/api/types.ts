// Types mirroring the shapes defined in API_CONTRACT.md exactly. Keep these
// in lockstep with the contract — do not add fields the backend doesn't send.

export type TaskStatus = 'YTS' | 'WIP' | 'DONE';
export type RagStatus = TaskStatus | 'OVERDUE';
export type CollaboratorRole = 'OWNER' | 'EDITOR' | 'VIEWER';
export type AttachmentType = 'FILE' | 'LINK';
export type PushPlatform = 'ANDROID' | 'IOS' | 'WEB';
export type TaskScope = 'mine' | 'shared' | 'all';

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface Attachment {
  id: string;
  type: AttachmentType;
  url: string;
  filename: string | null;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
}

export interface Collaborator {
  id: string;
  userId: string | null;
  email: string;
  role: CollaboratorRole;
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
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; name: string; email: string };
  attachments: Attachment[];
  collaborators: Collaborator[];
}

export interface AppNotification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  taskId: string | null;
  createdAt: string;
}

export interface CreateTaskInput {
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

export interface ApiErrorPayload {
  error: { message: string; code: string };
}
