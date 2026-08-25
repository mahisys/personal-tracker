import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../components/EmptyState';
import { TaskRow } from '../components/TaskRow';
import { formatDateKeyDisplay, shiftDateKey, todayKey, toLocalDateKey } from '../lib/dateUtils';
import { MainTabScreenProps } from '../navigation/types';
import { useTaskStore, useTasksForDate } from '../state/taskStore';
import { colors, radii, spacing, typography } from '../theme/theme';

type Props = MainTabScreenProps<'Calendar'>;

export function CalendarScreen({ navigation }: Props): React.JSX.Element {
  const [dateKey, setDateKey] = useState(todayKey());
  const [iosPickerOpen, setIosPickerOpen] = useState(false);
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

  const openPicker = () => {
    const [y, m, d] = dateKey.split('-').map(Number);
    const current = new Date(y, m - 1, d);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        onValueChange: (_event, selected) => {
          if (selected) setDateKey(toLocalDateKey(selected));
        },
      });
    } else {
      setIosPickerOpen(true);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Calendar</Text>
        <Pressable
          style={styles.addButton}
          onPress={() => navigation.navigate('TaskDetail', { initialDateKey: dateKey })}
        >
          <Ionicons name="add" size={26} color={colors.white} />
        </Pressable>
      </View>

      <View style={styles.dateNav}>
        <Pressable style={styles.navButton} onPress={() => setDateKey((k) => shiftDateKey(k, -1))}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Pressable style={styles.dateLabel} onPress={openPicker}>
          <Text style={styles.dateLabelText}>{formatDateKeyDisplay(dateKey)}</Text>
          <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
        </Pressable>
        <Pressable style={styles.navButton} onPress={() => setDateKey((k) => shiftDateKey(k, 1))}>
          <Ionicons name="chevron-forward" size={22} color={colors.text} />
        </Pressable>
      </View>

      {dateKey !== todayKey() ? (
        <Pressable onPress={() => setDateKey(todayKey())} style={styles.todayChip}>
          <Text style={styles.todayChipText}>Jump to today</Text>
        </Pressable>
      ) : null}

      {Platform.OS === 'ios' && iosPickerOpen ? (
        <View style={styles.iosPickerWrap}>
          <DateTimePicker
            value={(() => {
              const [y, m, d] = dateKey.split('-').map(Number);
              return new Date(y, m - 1, d);
            })()}
            mode="date"
            display="spinner"
            onValueChange={(_event, selected) => selected && setDateKey(toLocalDateKey(selected))}
          />
          <Pressable style={styles.doneButton} onPress={() => setIosPickerOpen(false)}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      ) : null}

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
          <EmptyState icon="🗓️" title="No tasks this day" subtitle="Tap + to schedule something." />
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
    paddingBottom: spacing.sm,
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
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  dateLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  dateLabelText: {
    ...typography.heading,
    color: colors.text,
  },
  todayChip: {
    alignSelf: 'center',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    marginBottom: spacing.sm,
  },
  todayChipText: {
    ...typography.small,
    color: colors.primary,
  },
  iosPickerWrap: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  doneButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  doneText: {
    ...typography.bodyMedium,
    color: colors.primary,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  emptyContainer: {
    flexGrow: 1,
  },
});
