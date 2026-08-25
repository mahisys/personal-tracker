import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../components/EmptyState';
import { TaskRow } from '../components/TaskRow';
import { formatDateKeyDisplay, todayKey } from '../lib/dateUtils';
import { MainTabScreenProps } from '../navigation/types';
import { useTaskStore, useTasksForDate } from '../state/taskStore';
import { colors, spacing, typography } from '../theme/theme';

type Props = MainTabScreenProps<'Today'>;

export function TodayScreen({ navigation }: Props): React.JSX.Element {
  const dateKey = todayKey();
  const tasks = useTasksForDate(dateKey);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);

  const handleDelete = (taskId: string, title: string) => {
    Alert.alert('Delete task', `Delete "${title}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteTask(taskId).catch((e) => Alert.alert('Could not delete', e.message)),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>{formatDateKeyDisplay(dateKey)}</Text>
          <Text style={styles.title}>Today</Text>
        </View>
        <Pressable
          style={styles.addButton}
          onPress={() => navigation.navigate('TaskDetail', { initialDateKey: dateKey })}
        >
          <Ionicons name="add" size={26} color={colors.white} />
        </Pressable>
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={tasks.length === 0 ? styles.emptyContainer : styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => (
          <TaskRow
            task={item}
            onPress={() => navigation.navigate('TaskDetail', { taskId: item.id })}
            onComplete={() => updateTask(item.id, { status: 'DONE' }).catch(() => {})}
            onDelete={() => handleDelete(item.id, item.title)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="✨"
            title="Nothing due today"
            subtitle="Tap the + button to plan something for today."
          />
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
  eyebrow: {
    ...typography.caption,
    color: colors.primary,
  },
  title: {
    ...typography.display,
    color: colors.text,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  emptyContainer: {
    flexGrow: 1,
  },
});
