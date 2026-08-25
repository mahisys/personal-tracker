import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { performLogout } from '../lib/session';
import { useAuthStore } from '../state/authStore';
import { usePushStore } from '../state/pushStore';
import { colors, radii, shadow, spacing, typography } from '../theme/theme';

export function ProfileScreen(): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const isRegistered = usePushStore((s) => s.isRegistered);

  const handleLogout = () => {
    Alert.alert('Log out', 'You will need to log back in to see your tasks.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => performLogout() },
    ]);
  };

  const initials = (user?.name ?? '?')
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <View style={[styles.card, styles.identityRow]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.identity}>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.rowLabel}>Push notifications</Text>
          <View style={[styles.statusPill, isRegistered ? styles.statusOn : styles.statusOff]}>
            <Text style={[styles.statusText, isRegistered ? styles.statusOnText : styles.statusOffText]}>
              {isRegistered ? 'Registered' : 'Not registered'}
            </Text>
          </View>
        </View>
        <Text style={styles.rowHint}>
          {isRegistered
            ? 'This device will receive reminder and collaboration pushes.'
            : 'Notification permission may be denied, or this is a simulator without push support.'}
        </Text>
      </View>

      <View style={styles.footer}>
        <Button title="Log out" variant="danger" onPress={handleLogout} />
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
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.title,
    color: colors.primary,
  },
  identity: {
    gap: 2,
  },
  name: {
    ...typography.heading,
    color: colors.text,
  },
  email: {
    ...typography.body,
    color: colors.textSecondary,
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
  },
});
