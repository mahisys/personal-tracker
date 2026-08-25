import { create } from 'zustand';

interface PushState {
  expoPushToken: string | null;
  isRegistered: boolean;
  setToken: (token: string | null) => void;
  setRegistered: (registered: boolean) => void;
  reset: () => void;
}

export const usePushStore = create<PushState>((set) => ({
  expoPushToken: null,
  isRegistered: false,
  setToken: (expoPushToken) => set({ expoPushToken }),
  setRegistered: (isRegistered) => set({ isRegistered }),
  reset: () => set({ expoPushToken: null, isRegistered: false }),
}));
