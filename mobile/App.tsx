import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useNotificationListener } from './src/hooks/useNotificationListener';
import { requestNotificationPermissions } from './src/lib/localReminders';
import { RootNavigator } from './src/navigation/RootNavigator';

function AppShell(): React.JSX.Element {
  // Records an in-app notification whenever a scheduled local reminder fires.
  useNotificationListener();
  return (
    <NavigationContainer>
      <RootNavigator />
      <StatusBar style="dark" />
    </NavigationContainer>
  );
}

export default function App(): React.JSX.Element {
  useEffect(() => {
    // Ask for notification permission up front so local reminder alarms work
    // as soon as a task with a reminder is created.
    requestNotificationPermissions();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppShell />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
