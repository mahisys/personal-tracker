// Local in-app notification center. Populated by `useNotificationListener`
// whenever a scheduled local reminder actually fires (foreground or
// background) — there is no server pushing anything into this.
import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import * as taskRepo from '../db/taskRepository';
import { AppNotification } from '../types/task';

interface NotificationState {
  notifications: AppNotification[];
  isHydrated: boolean;

  /** Loads every locally-known notification from the DB into memory. Call
   * once, right before the app can render — see RootNavigator.tsx. */
  hydrate: () => Promise<void>;

  addNotification: (input: { taskId: string | null; message: string }) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  isHydrated: false,

  hydrate: async () => {
    set({ notifications: taskRepo.listNotifications(), isHydrated: true });
  },

  addNotification: ({ taskId, message }) => {
    const notification: AppNotification = {
      id: Crypto.randomUUID(),
      taskId,
      message,
      read: false,
      createdAt: new Date().toISOString(),
    };
    taskRepo.insertNotification(notification);
    set((state) => ({ notifications: [notification, ...state.notifications] }));
  },

  markRead: (id) => {
    taskRepo.markNotificationRead(id);
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));
  },

  markAllRead: () => {
    taskRepo.markAllNotificationsRead();
    set((state) => ({ notifications: state.notifications.map((n) => ({ ...n, read: true })) }));
  },
}));

export function unreadCount(notifications: AppNotification[]): number {
  return notifications.filter((n) => !n.read).length;
}
