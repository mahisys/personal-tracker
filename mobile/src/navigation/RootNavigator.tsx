import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { LoadingView } from '../components/LoadingView';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { useAuthStore } from '../state/authStore';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator(): React.JSX.Element {
  const isHydrating = useAuthStore((s) => s.isHydrating);
  const token = useAuthStore((s) => s.token);

  if (isHydrating) {
    return <LoadingView />;
  }

  if (!token) {
    return <AuthStack />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
