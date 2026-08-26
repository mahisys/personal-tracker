// Global task cache keyed by id. Screens derive the slice they need (e.g.
// "tasks due today") by filtering this map, so a change made from any screen
// keeps every other screen showing the task in sync without extra plumbing.
//
// Fully local: every action here writes straight to the on-device SQLite
// database (via `db/taskRepository.ts`) and updates this in-memory cache
// synchronously in the same call — there is no server, so nothing here is
// ever "pending" anything.
import * as Crypto from 'expo-crypto';
// SDK 57 moved the promise-based file API (documentDirectory, copyAsync, ...)
// behind this subpath in favor of a new File/Directory class API — the
// legacy API is still fully supported and simpler for our one-off copy/delete needs.
import * as FileSystem from 'expo-file-system/legacy';
import { useMemo } from 'react';
import { create } from 'zustand';
import * as taskRepo from '../db/taskRepository';
import { isOnLocalDay } from '../lib/dateUtils';
import { cancelTaskReminder, syncTaskReminder } from '../lib/localReminders';
import { deriveRagStatus } from '../lib/rag';
import { Attachment, CreateTaskInput, Task, UpdateTaskInput } from '../types/task';

const ATTACHMENTS_DIR = `${FileSystem.documentDirectory}attachments/`;

interface TaskState {
  tasksById: Record<string, Task>;
  isHydrated: boolean;

  /** Loads every locally-known task from the DB into memory. Call once, right
   * before the app can render — see RootNavigator.tsx. */
  hydrate: () => Promise<void>;

  createTask: (input: CreateTaskInput) => Promise<Task>;
  updateTask: (id: string, patch: UpdateTaskInput) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  addLinkAttachment: (taskId: string, url: string, filename?: string) => Promise<void>;
  addFileAttachment: (
    taskId: string,
    file: { uri: string; name: string; mimeType?: string },
  ) => Promise<void>;
  removeAttachment: (taskId: string, attachmentId: string) => Promise<void>;
}

function arrayToRecord(tasks: Task[]): Record<string, Task> {
  const record: Record<string, Task> = {};
  for (const task of tasks) record[task.id] = task;
  return record;
}

async function deleteAttachmentFile(attachment: Attachment): Promise<void> {
  if (attachment.type !== 'FILE') return;
  await FileSystem.deleteAsync(attachment.url, { idempotent: true }).catch(() => {});
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasksById: {},
  isHydrated: false,

  hydrate: async () => {
    const tasks = taskRepo.listTasks();
    set({ tasksById: arrayToRecord(tasks), isHydrated: true });
  },

  createTask: async (input) => {
    const id = input.id ?? Crypto.randomUUID();
    const now = new Date().toISOString();
    const status: Task['status'] = 'YTS';
    const task: Task = {
      id,
      title: input.title,
      description: input.description ?? null,
      dueDate: input.dueDate,
      reminderAt: input.reminderAt ?? null,
      reminderNotified: false,
      status,
      ragStatus: deriveRagStatus(status, input.dueDate),
      createdAt: now,
      updatedAt: now,
      attachments: [],
    };

    taskRepo.upsertTask(task);
    set((state) => ({ tasksById: { ...state.tasksById, [id]: task } }));
    await syncTaskReminder(task);
    return task;
  },

  updateTask: async (id, patch) => {
    const existing = get().tasksById[id] ?? taskRepo.getTask(id);
    if (!existing) throw new Error('Task not found.');

    const status = patch.status ?? existing.status;
    const dueDate = patch.dueDate ?? existing.dueDate;
    const updated: Task = {
      ...existing,
      title: patch.title ?? existing.title,
      description: patch.description !== undefined ? patch.description : existing.description,
      dueDate,
      reminderAt: patch.reminderAt !== undefined ? patch.reminderAt : existing.reminderAt,
      status,
      ragStatus: deriveRagStatus(status, dueDate),
      updatedAt: new Date().toISOString(),
    };

    taskRepo.upsertTask(updated);
    set((state) => ({ tasksById: { ...state.tasksById, [id]: updated } }));
    await syncTaskReminder(updated);
    return updated;
  },

  deleteTask: async (id) => {
    const existing = get().tasksById[id] ?? taskRepo.getTask(id);
    taskRepo.deleteTaskRow(id);
    await cancelTaskReminder(id);
    if (existing) {
      await Promise.all(existing.attachments.map(deleteAttachmentFile));
    }
    set((state) => {
      const next = { ...state.tasksById };
      delete next[id];
      return { tasksById: next };
    });
  },

  addLinkAttachment: async (taskId, url, filename) => {
    const task = get().tasksById[taskId] ?? taskRepo.getTask(taskId);
    if (!task) return;
    const attachment: Attachment = {
      id: Crypto.randomUUID(),
      type: 'LINK',
      url,
      filename: filename ?? null,
      mimeType: null,
      size: null,
      createdAt: new Date().toISOString(),
    };
    const updated: Task = { ...task, attachments: [...task.attachments, attachment] };
    taskRepo.upsertTask(updated);
    set((state) => ({ tasksById: { ...state.tasksById, [taskId]: updated } }));
  },

  addFileAttachment: async (taskId, file) => {
    const task = get().tasksById[taskId] ?? taskRepo.getTask(taskId);
    if (!task) return;

    // Copy the picked document into the app's own document directory so it
    // stays available (and openable) independent of wherever the user
    // originally picked it from.
    await FileSystem.makeDirectoryAsync(ATTACHMENTS_DIR, { intermediates: true }).catch(() => {});
    const id = Crypto.randomUUID();
    const extMatch = /\.[^./\\]+$/.exec(file.name);
    const destination = `${ATTACHMENTS_DIR}${id}${extMatch ? extMatch[0] : ''}`;
    await FileSystem.copyAsync({ from: file.uri, to: destination });
    const info = await FileSystem.getInfoAsync(destination);

    const attachment: Attachment = {
      id,
      type: 'FILE',
      url: destination,
      filename: file.name,
      mimeType: file.mimeType ?? null,
      size: info.exists && !info.isDirectory ? info.size ?? null : null,
      createdAt: new Date().toISOString(),
    };
    const updated: Task = { ...task, attachments: [...task.attachments, attachment] };
    taskRepo.upsertTask(updated);
    set((state) => ({ tasksById: { ...state.tasksById, [taskId]: updated } }));
  },

  removeAttachment: async (taskId, attachmentId) => {
    const task = get().tasksById[taskId] ?? taskRepo.getTask(taskId);
    if (!task) return;
    const attachment = task.attachments.find((a) => a.id === attachmentId);
    if (attachment) await deleteAttachmentFile(attachment);

    const updated: Task = {
      ...task,
      attachments: task.attachments.filter((a) => a.id !== attachmentId),
    };
    taskRepo.upsertTask(updated);
    set((state) => ({ tasksById: { ...state.tasksById, [taskId]: updated } }));
  },
}));

export function getTaskById(taskId: string): Task | undefined {
  return useTaskStore.getState().tasksById[taskId];
}

/** Tasks due on a given local calendar day (`YYYY-MM-DD`), sorted by time.
 *
 * Selects the stable `tasksById` reference (unchanged unless the store
 * actually mutates) and derives the filtered/sorted array via `useMemo`.
 * Returning a freshly-built array straight from a zustand selector — as this
 * used to — hands React a new reference on every render, which trips
 * `useSyncExternalStore`'s snapshot-consistency check into an infinite
 * render loop ("Maximum update depth exceeded"). */
export function useTasksForDate(dateKey: string): Task[] {
  const tasksById = useTaskStore((state) => state.tasksById);
  return useMemo(
    () =>
      Object.values(tasksById)
        .filter((task) => isOnLocalDay(task.dueDate, dateKey))
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    [tasksById, dateKey],
  );
}
