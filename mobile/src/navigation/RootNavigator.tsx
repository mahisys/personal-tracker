import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import { LoadingView } from '../components/LoadingView';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { useAuthStore } from '../state/authStore';
import { useTaskStore } from '../state/taskStore';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator(): React.JSX.Element {
  const isAuthHydrating = useAuthStore((s) => s.isHydrating);
  const token = useAuthStore((s) => s.token);
  const isTasksHydrated = useTaskStore((s) => s.isHydrated);
  const hydrateTasks = useTaskStore((s) => s.hydrate);

  // Load every locally-known task from the on-device DB before the Today
  // screen can ever render, so viewing tasks never depends on the network
  // being reachable — see API_CONTRACT.md's "Offline-first architecture".
  useEffect(() => {
    if (token && !isTasksHydrated) {
      void hydrateTasks();
    }
  }, [token, isTasksHydrated, hydrateTasks]);

  if (isAuthHydrating) {
    return <LoadingView />;
  }

  if (!token) {
    return <AuthStack />;
  }

  if (!isTasksHydrated) {
    return <LoadingView />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
