import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ScrollView, Text, View } from 'react-native';
import { useNotificationListener } from './src/hooks/useNotificationListener';
import { requestNotificationPermissions } from './src/lib/localReminders';
import { RootNavigator } from './src/navigation/RootNavigator';

// A crash-safety net: traps uncaught JS exceptions and React render errors
// and shows the message on screen instead of letting the app silently close.
// There's no crash reporting service wired up for this app, so this screen —
// plus asking the user for a screenshot — is the only way to ever learn what
// went wrong.
declare const ErrorUtils: {
  getGlobalHandler(): (error: Error, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: Error, isFatal?: boolean) => void): void;
} | undefined;

interface CaughtError {
  message: string;
  stack?: string;
  source: 'global' | 'boundary';
}

let reportCaughtError: ((error: CaughtError) => void) | null = null;

if (typeof ErrorUtils !== 'undefined' && ErrorUtils) {
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    reportCaughtError?.({
      message: `${isFatal ? '[FATAL] ' : ''}${error?.message ?? String(error)}`,
      stack: error?.stack,
      source: 'global',
    });
  });
}

class CrashScreen extends React.Component<
  { children: React.ReactNode },
  { error: CaughtError | null }
> {
  state: { error: CaughtError | null } = { error: null };

  componentDidMount() {
    reportCaughtError = (error) => this.setState({ error });
  }

  static getDerivedStateFromError(error: Error): { error: CaughtError } {
    return { error: { message: error.message, stack: error.stack, source: 'boundary' } };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#1a0000', paddingTop: 60, paddingHorizontal: 16 }}>
          <Text style={{ color: '#ff6b6b', fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>
            Something went wrong
          </Text>
          <ScrollView>
            <Text style={{ color: 'white', fontSize: 14, marginBottom: 12 }}>
              source: {this.state.error.source}
              {'\n\n'}
              {this.state.error.message}
            </Text>
            <Text style={{ color: '#aaa', fontSize: 11 }}>{this.state.error.stack}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

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
    <CrashScreen>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppShell />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </CrashScreen>
  );
}
