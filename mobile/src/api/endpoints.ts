// One function per route in API_CONTRACT.md — keeps call sites readable and
// keeps the contract's shapes in exactly one place per endpoint.
import { api } from './client';
import {
  AppNotification,
  Attachment,
  Collaborator,
  CollaboratorRole,
  CreateTaskInput,
  PushPlatform,
  Task,
  TaskScope,
  TaskStatus,
  UpdateTaskInput,
  User,
} from './types';

export const AuthApi = {
  register: (email: string, password: string, name: string) =>
    api.post<{ token: string; user: User }>('/auth/register', { email, password, name }),
  login: (email: string, password: string) =>
    api.post<{ token: string; user: User }>('/auth/login', { email, password }),
  me: () => api.get<{ user: User }>('/auth/me'),
};

export interface TaskQuery {
  date?: string;
  status?: TaskStatus | 'OVERDUE';
  scope?: TaskScope;
  tzOffset?: number;
}

export const TasksApi = {
  list: (query: TaskQuery = {}) => api.get<{ tasks: Task[] }>('/tasks', { ...query }),
  get: (id: string) => api.get<{ task: Task }>(`/tasks/${id}`),
  create: (input: CreateTaskInput) => api.post<{ task: Task }>('/tasks', input),
  update: (id: string, patch: UpdateTaskInput) =>
    api.patch<{ task: Task }>(`/tasks/${id}`, patch),
  remove: (id: string) => api.delete<void>(`/tasks/${id}`),

  addLinkAttachment: (taskId: string, url: string, filename?: string) =>
    api.post<{ attachment: Attachment }>(`/tasks/${taskId}/attachments`, {
      type: 'LINK',
      url,
      filename,
    }),
  addFileAttachment: (taskId: string, file: { uri: string; name: string; mimeType?: string }) => {
    const form = new FormData();
    // React Native's FormData accepts this { uri, name, type } shape for files.
    form.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType ?? 'application/octet-stream',
    } as unknown as Blob);
    return api.postForm<{ attachment: Attachment }>(`/tasks/${taskId}/attachments`, form);
  },
  removeAttachment: (taskId: string, attachmentId: string) =>
    api.delete<void>(`/tasks/${taskId}/attachments/${attachmentId}`),

  addCollaborator: (taskId: string, email: string, role?: CollaboratorRole) =>
    api.post<{ collaborator: Collaborator }>(`/tasks/${taskId}/collaborators`, { email, role }),
  removeCollaborator: (taskId: string, collaboratorId: string) =>
    api.delete<void>(`/tasks/${taskId}/collaborators/${collaboratorId}`),
};

export const PushApi = {
  register: (token: string, platform: PushPlatform) =>
    api.post<{ ok: true }>('/push/register', { token, platform }),
  unregister: (token: string) => api.delete<void>('/push/register', { token }),
};

export const NotificationsApi = {
  list: (unreadOnly?: boolean) =>
    api.get<{ notifications: AppNotification[] }>('/notifications', { unreadOnly }),
  markRead: (id: string) => api.patch<{ notification: AppNotification }>(`/notifications/${id}/read`),
  markAllRead: () => api.patch<{ count: number }>('/notifications/read-all'),
};
