import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RagStatus } from '../types/task';
import { RAG_LABELS } from '../lib/rag';
import { colors, radii, spacing, typography } from '../theme/theme';

interface RagBadgeProps {
  status: RagStatus;
  compact?: boolean;
}

/** Small colored chip used everywhere a task's RAG status is shown. */
export function RagBadge({ status, compact = false }: RagBadgeProps): React.JSX.Element {
  const palette = colors.rag[status];
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: palette.bg },
        compact && styles.badgeCompact,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: palette.dot }]} />
      <Text style={[styles.label, { color: palette.fg }, compact && styles.labelCompact]}>
        {compact ? status : RAG_LABELS[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.pill,
    gap: spacing.xs,
  },
  badgeCompact: {
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    ...typography.small,
  },
  labelCompact: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
