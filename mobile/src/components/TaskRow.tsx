import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Swipeable, {
  SwipeDirection,
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { Task } from '../types/task';
import { formatDateTime, formatTime } from '../lib/dateUtils';
import { colors, radii, shadow, spacing, typography } from '../theme/theme';
import { RagBadge } from './RagBadge';

interface TaskRowProps {
  task: Task;
  onPress: () => void;
  onComplete: () => void;
  onDelete: () => void;
  showDate?: boolean;
}

function LeftAction({ progress }: { progress: SharedValue<number> }): React.JSX.Element {
  const style = useAnimatedStyle(() => ({ opacity: Math.min(progress.value, 1) }));
  return (
    <View style={[styles.action, styles.completeAction]}>
      <Animated.Text style={[styles.actionText, style]}>✓ Done</Animated.Text>
    </View>
  );
}

function RightAction({ progress }: { progress: SharedValue<number> }): React.JSX.Element {
  const style = useAnimatedStyle(() => ({ opacity: Math.min(progress.value, 1) }));
  return (
    <View style={[styles.action, styles.deleteAction]}>
      <Animated.Text style={[styles.actionText, style]}>🗑 Delete</Animated.Text>
    </View>
  );
}

export function TaskRow({
  task,
  onPress,
  onComplete,
  onDelete,
  showDate = false,
}: TaskRowProps): React.JSX.Element {
  const ref = useRef<SwipeableMethods>(null);

  return (
    <Swipeable
      ref={ref}
      renderLeftActions={(progress) => <LeftAction progress={progress} />}
      renderRightActions={(progress) => <RightAction progress={progress} />}
      leftThreshold={80}
      rightThreshold={80}
      onSwipeableOpen={(direction) => {
        ref.current?.close();
        if (direction === SwipeDirection.LEFT) onComplete();
        else onDelete();
      }}
      overshootLeft={false}
      overshootRight={false}
    >
      <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
        <View style={styles.textColumn}>
          <Text style={styles.title} numberOfLines={1}>
            {task.title}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{showDate ? formatDateTime(task.dueDate) : formatTime(task.dueDate)}</Text>
            {task.attachments.length > 0 ? <Text style={styles.meta}> · 📎 {task.attachments.length}</Text> : null}
          </View>
        </View>
        <RagBadge status={task.ragStatus} compact />
      </Pressable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  rowPressed: {
    opacity: 0.8,
  },
  textColumn: {
    flex: 1,
    gap: 4,
  },
  title: {
    ...typography.bodyMedium,
    color: colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  meta: {
    ...typography.small,
    color: colors.textMuted,
  },
  action: {
    flex: 1,
    justifyContent: 'center',
    borderRadius: radii.lg,
    marginVertical: 2,
    paddingHorizontal: spacing.lg,
  },
  completeAction: {
    backgroundColor: colors.success,
    alignItems: 'flex-start',
  },
  deleteAction: {
    backgroundColor: colors.danger,
    alignItems: 'flex-end',
  },
  actionText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
});
