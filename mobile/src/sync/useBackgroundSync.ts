// Wires up the three background sync triggers required by API_CONTRACT.md's
// "Offline-first architecture (mobile)" section: network reconnect, app
// foreground, and a periodic timer — all while a user is authenticated.
// Mounted once via `useRealtimeSession`. Every trigger just fires `runSync()`
// and forgets it; `runSync` itself swallows failures, so none of this can
// surface as a crash when the device is offline.
import NetInfo from '@react-native-community/netinfo';
import { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuthStore } from '../state/authStore';
import { runSync } from './syncEngine';

const PERIODIC_SYNC_INTERVAL_MS = 60_000;

export function useBackgroundSync(): void {
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    if (!token) return;

    // Fires immediately with the current state, then again on every change —
    // that immediate call also covers "just came back online".
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void runSync();
      }
    });

    const appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        void runSync();
      }
    });

    const interval = setInterval(() => {
      void runSync();
    }, PERIODIC_SYNC_INTERVAL_MS);

    return () => {
      unsubscribeNetInfo();
      appStateSubscription.remove();
      clearInterval(interval);
    };
  }, [token]);
}
