import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { AuthApi } from '../api/endpoints';
import { setTokenGetter } from '../api/client';
import { User } from '../api/types';

const TOKEN_KEY = 'pt_token';
const USER_KEY = 'pt_user';

interface AuthState {
  token: string | null;
  user: User | null;
  isHydrating: boolean;
  isSubmitting: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

async function persistSession(token: string, user: User): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, token),
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
  ]);
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isHydrating: true,
  isSubmitting: false,
  error: null,

  hydrate: async () => {
    try {
      const [token, userJson] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
      ]);
      if (token && userJson) {
        set({ token, user: JSON.parse(userJson) as User });
      }
    } finally {
      set({ isHydrating: false });
    }
  },

  login: async (email, password) => {
    set({ isSubmitting: true, error: null });
    try {
      const { token, user } = await AuthApi.login(email, password);
      await persistSession(token, user);
      set({ token, user });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Login failed' });
      throw e;
    } finally {
      set({ isSubmitting: false });
    }
  },

  register: async (email, password, name) => {
    set({ isSubmitting: true, error: null });
    try {
      const { token, user } = await AuthApi.register(email, password, name);
      await persistSession(token, user);
      set({ token, user });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Registration failed' });
      throw e;
    } finally {
      set({ isSubmitting: false });
    }
  },

  logout: async () => {
    await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY), SecureStore.deleteItemAsync(USER_KEY)]);
    set({ token: null, user: null });
  },

  clearError: () => set({ error: null }),
}));

// Lets api/client.ts attach the current JWT without importing this store
// (which would create a dependency cycle with endpoints.ts).
setTokenGetter(() => useAuthStore.getState().token);
