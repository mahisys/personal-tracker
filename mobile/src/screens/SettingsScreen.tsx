import * as Notifications from 'expo-notifications';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { clearAllData } from '../lib/clearData';
import { requestNotificationPermissions } from '../lib/localReminders';
import { colors, radii, shadow, spacing, typography } from '../theme/theme';

export function SettingsScreen(): React.JSX.Element {
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  const checkPermission = useCallback(async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setPermissionGranted(status === 'granted');
  }, []);

  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  const handleRequestPermission = async () => {
    const granted = await requestNotificationPermissions();
    setPermissionGranted(granted);
    if (!granted) {
      Alert.alert(
        'Notifications disabled',
        'Enable notifications for this app in your device settings to get reminder alerts.',
      );
    }
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear all data',
      "This permanently deletes every task, attachment, and notification on this device. This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear everything',
          style: 'destructive',
          onPress: async () => {
            setIsClearing(true);
            try {
              await clearAllData();
            } finally {
              setIsClearing(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.rowLabel}>Notifications</Text>
          <View style={[styles.statusPill, permissionGranted ? styles.statusOn : styles.statusOff]}>
            <Text style={[styles.statusText, permissionGranted ? styles.statusOnText : styles.statusOffText]}>
              {permissionGranted ? 'Enabled' : 'Disabled'}
            </Text>
          </View>
        </View>
        <Text style={styles.rowHint}>
          {permissionGranted
            ? 'Reminders you set on a task will alert you on this device, even when the app is closed.'
            : 'Notification permission is off, so reminder alarms won’t alert you. Enable it below.'}
        </Text>
        {!permissionGranted ? (
          <Button title="Enable notifications" variant="secondary" onPress={handleRequestPermission} />
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.rowLabel}>Data</Text>
        <Text style={styles.rowHint}>
          Everything in this app — tasks, attachments, and notifications — lives only on this
          device. There is no account and nothing is uploaded anywhere.
        </Text>
        <Button title="Clear all data" variant="danger" onPress={handleClearData} loading={isClearing} />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Personal Tracker · fully local, no internet required</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  title: {
    ...typography.display,
    color: colors.text,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: {
    ...typography.bodyMedium,
    color: colors.text,
  },
  rowHint: {
    ...typography.small,
    color: colors.textMuted,
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  statusOn: {
    backgroundColor: colors.rag.DONE.bg,
  },
  statusOff: {
    backgroundColor: colors.surfaceAlt,
  },
  statusText: {
    ...typography.small,
  },
  statusOnText: {
    color: colors.rag.DONE.fg,
  },
  statusOffText: {
    color: colors.textSecondary,
  },
  footer: {
    marginTop: 'auto',
    padding: spacing.xl,
    alignItems: 'center',
  },
  footerText: {
    ...typography.small,
    color: colors.textMuted,
  },
});
