import { create } from 'zustand';
import { NotificationsApi } from '../api/endpoints';
import { AppNotification } from '../api/types';

interface NotificationState {
  notifications: AppNotification[];
  isLoading: boolean;
  error: string | null;
  fetchAll: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  addFromSocket: (notification: AppNotification) => void;
  reset: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  isLoading: false,
  error: null,

  fetchAll: async () => {
    set({ isLoading: true, error: null });
    try {
      const { notifications } = await NotificationsApi.list();
      set({ notifications });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load notifications' });
      throw e;
    } finally {
      set({ isLoading: false });
    }
  },

  markRead: async (id) => {
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));
    await NotificationsApi.markRead(id);
  },

  markAllRead: async () => {
    set((state) => ({ notifications: state.notifications.map((n) => ({ ...n, read: true })) }));
    await NotificationsApi.markAllRead();
  },

  addFromSocket: (notification) => {
    set((state) => ({ notifications: [notification, ...state.notifications] }));
  },

  reset: () => set({ notifications: [], isLoading: false, error: null }),
}));

export function unreadCount(notifications: AppNotification[]): number {
  return notifications.filter((n) => !n.read).length;
}
