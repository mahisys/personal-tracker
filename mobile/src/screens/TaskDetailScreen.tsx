import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { DateTimeField } from '../components/DateTimeField';
import { RagBadge } from '../components/RagBadge';
import { TextField } from '../components/TextField';
import { deriveRagStatus } from '../lib/rag';
import { RootStackScreenProps } from '../navigation/types';
import { useTaskStore } from '../state/taskStore';
import { colors, radii, shadow, spacing, typography } from '../theme/theme';
import { Attachment, TaskStatus } from '../types/task';

type Props = RootStackScreenProps<'TaskDetail'>;

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'YTS', label: 'Yet to start' },
  { value: 'WIP', label: 'In progress' },
  { value: 'DONE', label: 'Done' },
];

function defaultDueDate(initialDateKey?: string): Date {
  if (!initialDateKey) {
    const inOneHour = new Date();
    inOneHour.setHours(inOneHour.getHours() + 1, 0, 0, 0);
    return inOneHour;
  }
  const [year, month, day] = initialDateKey.split('-').map(Number);
  return new Date(year, month - 1, day, 9, 0, 0, 0);
}

async function openAttachment(attachment: Attachment): Promise<void> {
  try {
    if (attachment.type === 'LINK') {
      await Linking.openURL(attachment.url);
      return;
    }
    // FILE attachments live at a local file:// URI — sharing handles the
    // platform-specific bits (e.g. Android's FileProvider) of letting the
    // user open it in another app; fall back to Linking if unavailable.
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(attachment.url, {
        mimeType: attachment.mimeType ?? undefined,
        dialogTitle: attachment.filename ?? undefined,
      });
    } else {
      await Linking.openURL(attachment.url);
    }
  } catch {
    Alert.alert('Could not open attachment', 'This file may have been moved or deleted.');
  }
}

export function TaskDetailScreen({ route, navigation }: Props): React.JSX.Element {
  const params = route.params;
  const taskId = params && 'taskId' in params ? params.taskId : undefined;
  const initialDateKey = params && 'initialDateKey' in params ? params.initialDateKey : undefined;
  const isCreate = !taskId;

  const task = useTaskStore((s) => (taskId ? s.tasksById[taskId] : undefined));
  const createTask = useTaskStore((s) => s.createTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const addLinkAttachment = useTaskStore((s) => s.addLinkAttachment);
  const addFileAttachment = useTaskStore((s) => s.addFileAttachment);
  const removeAttachment = useTaskStore((s) => s.removeAttachment);

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [dueDate, setDueDate] = useState<Date>(
    task ? new Date(task.dueDate) : defaultDueDate(initialDateKey),
  );
  const [reminderAt, setReminderAt] = useState<Date | null>(
    task?.reminderAt ? new Date(task.reminderAt) : null,
  );
  const [linkUrl, setLinkUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const previewRag = useMemo(
    () => deriveRagStatus(task?.status ?? 'YTS', dueDate.toISOString()),
    [task?.status, dueDate],
  );

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Title required', 'Give this task a title.');
      return;
    }
    setIsSaving(true);
    try {
      if (isCreate) {
        await createTask({
          title: title.trim(),
          description: description.trim() || undefined,
          dueDate: dueDate.toISOString(),
          reminderAt: reminderAt ? reminderAt.toISOString() : undefined,
        });
      } else if (task) {
        await updateTask(task.id, {
          title: title.trim(),
          description: description.trim() || null,
          dueDate: dueDate.toISOString(),
          reminderAt: reminderAt ? reminderAt.toISOString() : null,
        });
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!task) return;
    Alert.alert('Delete task', `Delete "${task.title}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTask(task.id);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Could not delete', e instanceof Error ? e.message : 'Something went wrong.');
          }
        },
      },
    ]);
  };

  const handleStatusChange = async (status: TaskStatus) => {
    if (!task) return;
    try {
      await updateTask(task.id, { status });
    } catch (e) {
      Alert.alert('Could not update status', e instanceof Error ? e.message : 'Something went wrong.');
    }
  };

  const handleAddLink = async () => {
    if (!task || !linkUrl.trim()) return;
    try {
      await addLinkAttachment(task.id, linkUrl.trim());
      setLinkUrl('');
    } catch (e) {
      Alert.alert('Could not add link', e instanceof Error ? e.message : 'Something went wrong.');
    }
  };

  const handlePickFile = async () => {
    if (!task) return;
    const result = await DocumentPicker.getDocumentAsync({ multiple: false });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    try {
      await addFileAttachment(task.id, { uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
    } catch (e) {
      Alert.alert('Could not attach file', e instanceof Error ? e.message : 'Something went wrong.');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{isCreate ? 'New task' : 'Task'}</Text>
          {!isCreate ? (
            <Pressable onPress={handleDelete} hitSlop={12}>
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.statusRow}>
            <RagBadge status={task?.ragStatus ?? previewRag} />
          </View>

          <TextField
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="What needs to happen?"
          />
          <TextField
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Add more detail (optional)"
            multiline
            numberOfLines={4}
            style={styles.multiline}
          />

          <DateTimeField label="Due" value={dueDate} onChange={setDueDate} />
          <DateTimeField
            label="Reminder (optional)"
            value={reminderAt}
            onChange={setReminderAt}
            onClear={() => setReminderAt(null)}
            placeholder="No reminder set"
            minimumDate={new Date()}
          />

          {!isCreate ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Status</Text>
              <View style={styles.segmented}>
                {STATUS_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[styles.segment, task?.status === option.value && styles.segmentActive]}
                    onPress={() => handleStatusChange(option.value)}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        task?.status === option.value && styles.segmentTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {!isCreate && task ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Attachments</Text>
              {task.attachments.length === 0 ? (
                <Text style={styles.emptyHint}>No attachments yet.</Text>
              ) : (
                task.attachments.map((attachment) => (
                  <Pressable
                    key={attachment.id}
                    style={styles.attachmentRow}
                    onPress={() => openAttachment(attachment)}
                  >
                    <Ionicons
                      name={attachment.type === 'LINK' ? 'link-outline' : 'document-text-outline'}
                      size={18}
                      color={colors.primary}
                    />
                    <Text style={styles.attachmentText} numberOfLines={1}>
                      {attachment.filename ?? attachment.url}
                    </Text>
                    <Pressable
                      hitSlop={8}
                      onPress={() => removeAttachment(task.id, attachment.id).catch(() => {})}
                    >
                      <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                    </Pressable>
                  </Pressable>
                ))
              )}
              <View style={styles.inlineRow}>
                <TextField
                  value={linkUrl}
                  onChangeText={setLinkUrl}
                  placeholder="https://…"
                  autoCapitalize="none"
                  containerStyle={styles.inlineInput}
                />
                <Button title="Add link" variant="secondary" onPress={handleAddLink} />
              </View>
              <Button title="Attach a file" variant="ghost" onPress={handlePickFile} />
            </View>
          ) : null}

          <Button
            title={isCreate ? 'Create task' : 'Save changes'}
            onPress={handleSave}
            loading={isSaving}
            style={styles.saveButton}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.heading,
    color: colors.text,
  },
  headerSpacer: {
    width: 22,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  multiline: {
    height: 100,
    paddingTop: spacing.sm,
    textAlignVertical: 'top',
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  segmentText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  emptyHint: {
    ...typography.body,
    color: colors.textMuted,
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.sm,
    ...shadow.card,
  },
  attachmentText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  inlineRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  inlineInput: {
    flex: 1,
  },
  saveButton: {
    marginTop: spacing.md,
  },
});
