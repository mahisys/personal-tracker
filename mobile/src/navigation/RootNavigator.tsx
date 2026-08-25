import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import { LoadingView } from '../components/LoadingView';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { useNotificationStore } from '../state/notificationStore';
import { useTaskStore } from '../state/taskStore';
import { MainTabs } from './MainTabs';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator(): React.JSX.Element {
  const isTasksHydrated = useTaskStore((s) => s.isHydrated);
  const hydrateTasks = useTaskStore((s) => s.hydrate);
  const isNotificationsHydrated = useNotificationStore((s) => s.isHydrated);
  const hydrateNotifications = useNotificationStore((s) => s.hydrate);

  // Load every locally-known task and notification from the on-device DB
  // before the app can render — this is a fully local app, so there's no
  // auth or network step to wait on first.
  useEffect(() => {
    if (!isTasksHydrated) void hydrateTasks();
  }, [isTasksHydrated, hydrateTasks]);

  useEffect(() => {
    if (!isNotificationsHydrated) void hydrateNotifications();
  }, [isNotificationsHydrated, hydrateNotifications]);

  if (!isTasksHydrated || !isNotificationsHydrated) {
    return <LoadingView />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
