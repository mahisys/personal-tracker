// Global task cache keyed by id. Screens derive the slice they need (e.g.
// "tasks due today") by filtering this map, so a realtime update or a fetch
// triggered from any screen keeps every other screen showing the task in
// sync without extra plumbing.
//
// Local-first: every action here writes straight to the on-device SQLite
// database (via `db/taskRepository.ts`) and updates this in-memory cache
// immediately, then enqueues a pending operation and kicks off a background
// `runSync()` — never awaiting a network response in the critical path. See
// API_CONTRACT.md's "Offline-first architecture (mobile)" section.
import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { TaskQuery } from '../api/endpoints';
import { Attachment, Collaborator, CollaboratorRole, CreateTaskInput, Task, UpdateTaskInput } from '../api/types';
import * as taskRepo from '../db/taskRepository';
import { isOnLocalDay } from '../lib/dateUtils';
import { cancelTaskReminder, syncTaskReminder } from '../lib/localReminders';
import { deriveRagStatus } from '../lib/rag';
import { resetSyncState, runSync } from '../sync/syncEngine';
import { useAuthStore } from './authStore';

const MAX_SYNC_ERRORS = 20;

interface TaskState {
  tasksById: Record<string, Task>;
  /** Ids of tasks with at least one local change not yet confirmed by the server. */
  pendingTaskIds: Set<string>;
  isLoading: boolean;
  isHydrated: boolean;
  error: string | null;
  /** Dropped-op warnings a small banner could surface; see syncEngine.ts. */
  syncErrors: string[];

  /** Loads every locally-known task from the DB into memory. Call once, right
   * after auth resolves, before the Today screen can render — see
   * RootNavigator.tsx. Kicks off a background reconciliation sync afterwards. */
  hydrate: () => Promise<void>;

  fetchTasks: (query?: TaskQuery) => Promise<Task[]>;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  updateTask: (id: string, patch: UpdateTaskInput) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  addLinkAttachment: (taskId: string, url: string, filename?: string) => Promise<void>;
  addFileAttachment: (
    taskId: string,
    file: { uri: string; name: string; mimeType?: string },
  ) => Promise<void>;
  removeAttachment: (taskId: string, attachmentId: string) => Promise<void>;
  addCollaborator: (taskId: string, email: string, role?: CollaboratorRole) => Promise<void>;
  removeCollaborator: (taskId: string, collaboratorId: string) => Promise<void>;
  // Realtime / reconciliation hooks driven by socket events.
  upsertFromSocket: (task: Task) => void;
  removeFromSocket: (taskId: string) => void;
  reset: () => void;

  // Internal — used by sync/syncEngine.ts to reflect DB changes it made.
  hydrateFromRows: (tasks: Task[], pendingTaskIds: Set<string>) => void;
  addSyncError: (message: string) => void;
  clearSyncErrors: () => void;
}

function arrayToRecord(tasks: Task[]): Record<string, Task> {
  const record: Record<string, Task> = {};
  for (const task of tasks) record[task.id] = task;
  return record;
}

function currentOwner(): Task['owner'] {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Cannot create a task while signed out.');
  return { id: user.id, name: user.name, email: user.email };
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasksById: {},
  pendingTaskIds: new Set(),
  isLoading: false,
  isHydrated: false,
  error: null,
  syncErrors: [],

  hydrate: async () => {
    const tasks = taskRepo.listTasks();
    const pending = new Set(taskRepo.allPendingTaskIds());
    set({ tasksById: arrayToRecord(tasks), pendingTaskIds: pending, isHydrated: true });
    // Reconcile with the server in the background — the UI above already has
    // everything it needs from the local mirror.
    void runSync();
  },

  fetchTasks: async (query = {}) => {
    // Local-first: this used to be a network call. Screens use it as "give me
    // tasks for this view", which the already-hydrated local cache answers
    // synchronously; a background sync keeps that cache fresh going forward.
    const currentUser = useAuthStore.getState().user;
    let tasks = Object.values(get().tasksById);

    if (query.date) {
      const date = query.date;
      tasks = tasks.filter((task) => isOnLocalDay(task.dueDate, date));
    }
    if (query.status) {
      tasks = tasks.filter((task) => task.ragStatus === query.status);
    }
    if (query.scope === 'mine' && currentUser) {
      tasks = tasks.filter((task) => task.ownerId === currentUser.id);
    } else if (query.scope === 'shared' && currentUser) {
      tasks = tasks.filter((task) => task.ownerId !== currentUser.id);
    }
    tasks = tasks.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    void runSync();
    return tasks;
  },

  createTask: async (input) => {
    const id = input.id ?? Crypto.randomUUID();
    const now = new Date().toISOString();
    const status: Task['status'] = 'YTS';
    const owner = currentOwner();
    const task: Task = {
      id,
      title: input.title,
      description: input.description ?? null,
      dueDate: input.dueDate,
      reminderAt: input.reminderAt ?? null,
      reminderNotified: false,
      status,
      ragStatus: deriveRagStatus(status, input.dueDate),
      ownerId: owner.id,
      createdAt: now,
      updatedAt: now,
      owner,
      attachments: [],
      collaborators: [],
    };

    taskRepo.upsertTask(task, true);
    taskRepo.enqueueOp('task.create', id, {});
    set((state) => ({
      tasksById: { ...state.tasksById, [id]: task },
      pendingTaskIds: new Set(state.pendingTaskIds).add(id),
    }));
    await syncTaskReminder(task);
    void runSync();
    return task;
  },

  updateTask: async (id, patch) => {
    const existing = get().tasksById[id] ?? taskRepo.getTask(id);
    if (!existing) throw new Error('Task not found locally.');

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

    taskRepo.upsertTask(updated, true);
    // Coalesce: only the latest local edit matters until it actually syncs.
    taskRepo.removeOpsForTask(id, ['task.update']);
    taskRepo.enqueueOp('task.update', id, {});
    set((state) => ({
      tasksById: { ...state.tasksById, [id]: updated },
      pendingTaskIds: new Set(state.pendingTaskIds).add(id),
    }));
    await syncTaskReminder(updated);
    void runSync();
    return updated;
  },

  deleteTask: async (id) => {
    // If this task never reached the server yet, cancel out locally instead
    // of round-tripping a create-then-delete (or a delete of a task the
    // server has never heard of, which would just 404).
    const neverSynced = taskRepo.hasPendingCreateForTask(id);
    taskRepo.removeOpsForTask(id);
    taskRepo.deleteTaskRow(id);
    if (!neverSynced) {
      taskRepo.enqueueOp('task.delete', id, {});
    }
    await cancelTaskReminder(id);
    set((state) => {
      const next = { ...state.tasksById };
      delete next[id];
      const pending = new Set(state.pendingTaskIds);
      pending.delete(id);
      return { tasksById: next, pendingTaskIds: pending };
    });
    void runSync();
  },

  addLinkAttachment: async (taskId, url, filename) => {
    const task = get().tasksById[taskId] ?? taskRepo.getTask(taskId);
    if (!task) return;
    const localId = Crypto.randomUUID();
    const placeholder: Attachment = {
      id: localId,
      type: 'LINK',
      url,
      filename: filename ?? null,
      mimeType: null,
      size: null,
      createdAt: new Date().toISOString(),
    };
    const updated: Task = { ...task, attachments: [...task.attachments, placeholder] };
    taskRepo.upsertTask(updated, true);
    taskRepo.enqueueOp('attachment.addLink', taskId, { localId, url, filename });
    set((state) => ({
      tasksById: { ...state.tasksById, [taskId]: updated },
      pendingTaskIds: new Set(state.pendingTaskIds).add(taskId),
    }));
    void runSync();
  },

  addFileAttachment: async (taskId, file) => {
    const task = get().tasksById[taskId] ?? taskRepo.getTask(taskId);
    if (!task) return;
    const localId = Crypto.randomUUID();
    const placeholder: Attachment = {
      id: localId,
      type: 'FILE',
      url: file.uri,
      filename: file.name,
      mimeType: file.mimeType ?? null,
      size: null,
      createdAt: new Date().toISOString(),
    };
    const updated: Task = { ...task, attachments: [...task.attachments, placeholder] };
    taskRepo.upsertTask(updated, true);
    // The real multipart upload happens later in the sync engine — enqueuing
    // the local uri is enough to try again whenever a connection exists.
    taskRepo.enqueueOp('attachment.addFile', taskId, {
      localId,
      uri: file.uri,
      name: file.name,
      mimeType: file.mimeType,
    });
    set((state) => ({
      tasksById: { ...state.tasksById, [taskId]: updated },
      pendingTaskIds: new Set(state.pendingTaskIds).add(taskId),
    }));
    void runSync();
  },

  removeAttachment: async (taskId, attachmentId) => {
    const task = get().tasksById[taskId] ?? taskRepo.getTask(taskId);
    if (!task) return;

    // If this attachment never made it to the server yet, just cancel its
    // pending add — no need to ever call the network for it.
    const pendingOps = taskRepo.listPendingOpsForTask(taskId);
    const addOp = pendingOps.find(
      (op) =>
        (op.type === 'attachment.addLink' || op.type === 'attachment.addFile') &&
        (op.payload as { localId?: string }).localId === attachmentId,
    );
    if (addOp) {
      taskRepo.removeOp(addOp.id);
    } else {
      taskRepo.enqueueOp('attachment.remove', taskId, { attachmentId });
    }

    const updated: Task = {
      ...task,
      attachments: task.attachments.filter((a) => a.id !== attachmentId),
    };
    const stillPending = taskRepo.hasPendingOpsForTask(taskId);
    taskRepo.upsertTask(updated, stillPending);
    set((state) => {
      const pending = new Set(state.pendingTaskIds);
      if (stillPending) pending.add(taskId);
      else pending.delete(taskId);
      return { tasksById: { ...state.tasksById, [taskId]: updated }, pendingTaskIds: pending };
    });
    void runSync();
  },

  addCollaborator: async (taskId, email, role) => {
    const task = get().tasksById[taskId] ?? taskRepo.getTask(taskId);
    if (!task) return;
    const localId = Crypto.randomUUID();
    const placeholder: Collaborator = {
      id: localId,
      userId: null,
      email,
      role: role ?? 'EDITOR',
    };
    const updated: Task = { ...task, collaborators: [...task.collaborators, placeholder] };
    taskRepo.upsertTask(updated, true);
    taskRepo.enqueueOp('collaborator.add', taskId, { localId, email, role });
    set((state) => ({
      tasksById: { ...state.tasksById, [taskId]: updated },
      pendingTaskIds: new Set(state.pendingTaskIds).add(taskId),
    }));
    void runSync();
  },

  removeCollaborator: async (taskId, collaboratorId) => {
    const task = get().tasksById[taskId] ?? taskRepo.getTask(taskId);
    if (!task) return;

    const pendingOps = taskRepo.listPendingOpsForTask(taskId);
    const addOp = pendingOps.find(
      (op) => op.type === 'collaborator.add' && (op.payload as { localId?: string }).localId === collaboratorId,
    );
    if (addOp) {
      taskRepo.removeOp(addOp.id);
    } else {
      taskRepo.enqueueOp('collaborator.remove', taskId, { collaboratorId });
    }

    const updated: Task = {
      ...task,
      collaborators: task.collaborators.filter((c) => c.id !== collaboratorId),
    };
    const stillPending = taskRepo.hasPendingOpsForTask(taskId);
    taskRepo.upsertTask(updated, stillPending);
    set((state) => {
      const pending = new Set(state.pendingTaskIds);
      if (stillPending) pending.add(taskId);
      else pending.delete(taskId);
      return { tasksById: { ...state.tasksById, [taskId]: updated }, pendingTaskIds: pending };
    });
    void runSync();
  },

  upsertFromSocket: (task) => {
    // Additive speed boost only (API_CONTRACT.md): don't let a live event
    // clobber a task with local changes still waiting to sync — the next
    // pull sync (or this task's own push) reconciles it properly.
    const taskId = task.id;
    if (taskRepo.hasPendingOpsForTask(taskId)) return;
    taskRepo.upsertTask(task, false);
    set((state) => ({ tasksById: { ...state.tasksById, [task.id]: task } }));
    void syncTaskReminder(task);
  },

  removeFromSocket: (taskId) => {
    if (taskRepo.hasPendingCreateForTask(taskId)) return; // let the next push retry it
    taskRepo.deleteTaskRow(taskId);
    set((state) => {
      const next = { ...state.tasksById };
      delete next[taskId];
      const pending = new Set(state.pendingTaskIds);
      pending.delete(taskId);
      return { tasksById: next, pendingTaskIds: pending };
    });
    void cancelTaskReminder(taskId);
  },

  hydrateFromRows: (tasks, pendingTaskIds) => {
    set({ tasksById: arrayToRecord(tasks), pendingTaskIds });
  },

  addSyncError: (message) => {
    set((state) => ({ syncErrors: [...state.syncErrors, message].slice(-MAX_SYNC_ERRORS) }));
  },

  clearSyncErrors: () => set({ syncErrors: [] }),

  reset: () => {
    taskRepo.clearAll();
    set({
      tasksById: {},
      pendingTaskIds: new Set(),
      isLoading: false,
      isHydrated: false,
      error: null,
      syncErrors: [],
    });
    // Fire-and-forget: clears the incremental-sync high-water mark so the
    // next login starts from a full mirror instead of a stale one.
    void resetSyncState();
  },
}));

export function getTaskById(taskId: string): Task | undefined {
  return useTaskStore.getState().tasksById[taskId];
}

/** Tasks due on a given local calendar day (`YYYY-MM-DD`), sorted by time. */
export function useTasksForDate(dateKey: string): Task[] {
  return useTaskStore((state) =>
    Object.values(state.tasksById)
      .filter((task) => isOnLocalDay(task.dueDate, dateKey))
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
  );
}
