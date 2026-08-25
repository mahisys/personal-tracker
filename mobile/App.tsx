import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useRealtimeSession } from './src/hooks/useRealtimeSession';
import { requestNotificationPermissions } from './src/lib/localReminders';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuthStore } from './src/state/authStore';

function AppShell(): React.JSX.Element {
  useRealtimeSession();
  return (
    <NavigationContainer>
      <RootNavigator />
      <StatusBar style="dark" />
    </NavigationContainer>
  );
}

export default function App(): React.JSX.Element {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
    // Ask for notification permission up front so local reminder alarms and
    // push notifications both work as soon as the user is logged in.
    requestNotificationPermissions();
  }, [hydrate]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppShell />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
