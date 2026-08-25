import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDateTime } from '../lib/dateUtils';
import { colors, radii, spacing, typography } from '../theme/theme';

interface DateTimeFieldProps {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
  onClear?: () => void;
  placeholder?: string;
  minimumDate?: Date;
}

/**
 * Cross-platform date + time picker. Android has no combined "datetime"
 * mode, so it chains the native date dialog into the native time dialog;
 * iOS reveals an inline spinner in "datetime" mode.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  onClear,
  placeholder = 'Select date & time',
  minimumDate,
}: DateTimeFieldProps): React.JSX.Element {
  const [iosPickerOpen, setIosPickerOpen] = useState(false);

  const openAndroidPicker = () => {
    const base = value ?? new Date();
    DateTimePickerAndroid.open({
      value: base,
      mode: 'date',
      minimumDate,
      onValueChange: (_event, selectedDate) => {
        if (!selectedDate) return;
        DateTimePickerAndroid.open({
          value: selectedDate,
          mode: 'time',
          onValueChange: (_timeEvent, selectedTime) => {
            if (!selectedTime) return;
            const merged = new Date(selectedDate);
            merged.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
            onChange(merged);
          },
        });
      },
    });
  };

  const handlePress = () => {
    if (Platform.OS === 'android') {
      openAndroidPicker();
    } else {
      setIosPickerOpen((open) => !open);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {value && onClear ? (
          <Text style={styles.clear} onPress={onClear}>
            Clear
          </Text>
        ) : null}
      </View>
      <Pressable style={styles.field} onPress={handlePress}>
        <Text style={value ? styles.valueText : styles.placeholderText}>
          {value ? formatDateTime(value.toISOString()) : placeholder}
        </Text>
      </Pressable>
      {Platform.OS === 'ios' && iosPickerOpen ? (
        <View style={styles.iosPickerWrap}>
          <DateTimePicker
            value={value ?? new Date()}
            mode="datetime"
            display="spinner"
            minimumDate={minimumDate}
            onValueChange={(_event, date) => onChange(date)}
          />
          <Pressable style={styles.doneButton} onPress={() => setIosPickerOpen(false)}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  clear: {
    ...typography.caption,
    color: colors.danger,
  },
  field: {
    height: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  valueText: {
    ...typography.body,
    color: colors.text,
  },
  placeholderText: {
    ...typography.body,
    color: colors.textMuted,
  },
  iosPickerWrap: {
    backgroundColor: colors.surface,
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
});
