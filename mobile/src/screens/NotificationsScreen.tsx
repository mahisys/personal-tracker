import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../components/EmptyState';
import { formatDateTime } from '../lib/dateUtils';
import { MainTabScreenProps } from '../navigation/types';
import { AppNotification } from '../api/types';
import { unreadCount, useNotificationStore } from '../state/notificationStore';
import { colors, radii, shadow, spacing, typography } from '../theme/theme';

type Props = MainTabScreenProps<'Notifications'>;

const TYPE_ICON: Record<string, string> = {
  REMINDER: '⏰',
  SHARE_INVITE: '🤝',
};

export function NotificationsScreen({ navigation }: Props): React.JSX.Element {
  const notifications = useNotificationStore((s) => s.notifications);
  const fetchAll = useNotificationStore((s) => s.fetchAll);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    fetchAll().catch(() => {});
  }, [fetchAll]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAll().catch(() => {});
    setRefreshing(false);
  };

  const handlePress = (item: AppNotification) => {
    if (!item.read) markRead(item.id).catch(() => {});
    if (item.taskId) navigation.navigate('TaskDetail', { taskId: item.taskId });
  };

  const unread = unreadCount(notifications);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        {unread > 0 ? (
          <Pressable onPress={() => markAllRead().catch(() => {})}>
            <Text style={styles.markAll}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={notifications.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.row, !item.read && styles.rowUnread]}
            onPress={() => handlePress(item)}
          >
            <Text style={styles.icon}>{TYPE_ICON[item.type] ?? '🔔'}</Text>
            <View style={styles.textColumn}>
              <Text style={styles.message}>{item.message}</Text>
              <Text style={styles.time}>{formatDateTime(item.createdAt)}</Text>
            </View>
            {!item.read ? <View style={styles.unreadDot} /> : null}
          </Pressable>
        )}
        ListEmptyComponent={
          <EmptyState icon="🔔" title="No notifications yet" subtitle="Reminders and shared-task updates show up here." />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  title: {
    ...typography.display,
    color: colors.text,
  },
  markAll: {
    ...typography.caption,
    color: colors.primary,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    ...shadow.card,
  },
  rowUnread: {
    backgroundColor: colors.primarySoft,
  },
  icon: {
    fontSize: 20,
  },
  textColumn: {
    flex: 1,
    gap: 4,
  },
  message: {
    ...typography.body,
    color: colors.text,
  },
  time: {
    ...typography.small,
    color: colors.textMuted,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
});
