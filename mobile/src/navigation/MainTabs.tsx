import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarScreen } from '../screens/CalendarScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TodayScreen } from '../screens/TodayScreen';
import { unreadCount, useNotificationStore } from '../state/notificationStore';
import { colors } from '../theme/theme';
import { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICONS: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
  Today: 'today',
  Calendar: 'calendar',
  Notifications: 'notifications',
  Settings: 'settings',
};

function NotificationsIcon({ color, size }: { color: string; size: number }): React.JSX.Element {
  const unread = useNotificationStore((s) => unreadCount(s.notifications));
  return (
    <View>
      <Ionicons name={ICONS.Notifications} color={color} size={size} />
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function MainTabs(): React.JSX.Element {
  // The tab bar must reserve space for the device's own gesture/nav bar
  // (Android's edge-to-edge display draws app content behind it by default)
  // or the system bar overlaps our tab labels/icons — a fixed height ignored
  // this entirely.
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: [styles.tabBar, { height: 60 + insets.bottom, paddingBottom: 8 + insets.bottom }],
        tabBarIcon: ({ color, size }) =>
          route.name === 'Notifications' ? (
            <NotificationsIcon color={color} size={size} />
          ) : (
            <Ionicons name={ICONS[route.name as keyof MainTabParamList]} color={color} size={size} />
          ),
      })}
    >
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen name="Calendar" component={CalendarScreen} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: colors.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
});
