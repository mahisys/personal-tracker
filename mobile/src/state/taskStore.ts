// Global task cache keyed by id. Screens derive the slice they need (e.g.
// "tasks due today") by filtering this map, so a realtime update or a fetch
// triggered from any screen keeps every other screen showing the task in
// sync without extra plumbing.
import { create } from 'zustand';
import { TaskQuery, TasksApi } from '../api/endpoints';
import { CollaboratorRole, CreateTaskInput, Task, UpdateTaskInput } from '../api/types';
import { isOnLocalDay } from '../lib/dateUtils';
import { cancelTaskReminder, syncTaskReminder } from '../lib/localReminders';

interface TaskState {
  tasksById: Record<string, Task>;
  isLoading: boolean;
  error: string | null;
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
}

export const useTaskStore = create<TaskState>((set) => ({
  tasksById: {},
  isLoading: false,
  error: null,

  fetchTasks: async (query) => {
    set({ isLoading: true, error: null });
    try {
      const { tasks } = await TasksApi.list(query);
      set((state) => {
        const next = { ...state.tasksById };
        for (const task of tasks) next[task.id] = task;
        return { tasksById: next };
      });
      return tasks;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load tasks' });
      throw e;
    } finally {
      set({ isLoading: false });
    }
  },

  createTask: async (input) => {
    const { task } = await TasksApi.create(input);
    set((state) => ({ tasksById: { ...state.tasksById, [task.id]: task } }));
    await syncTaskReminder(task);
    return task;
  },

  updateTask: async (id, patch) => {
    const { task } = await TasksApi.update(id, patch);
    set((state) => ({ tasksById: { ...state.tasksById, [task.id]: task } }));
    await syncTaskReminder(task);
    return task;
  },

  deleteTask: async (id) => {
    await TasksApi.remove(id);
    await cancelTaskReminder(id);
    set((state) => {
      const next = { ...state.tasksById };
      delete next[id];
      return { tasksById: next };
    });
  },

  addLinkAttachment: async (taskId, url, filename) => {
    await TasksApi.addLinkAttachment(taskId, url, filename);
    const { task } = await TasksApi.get(taskId);
    set((state) => ({ tasksById: { ...state.tasksById, [task.id]: task } }));
  },

  addFileAttachment: async (taskId, file) => {
    await TasksApi.addFileAttachment(taskId, file);
    const { task } = await TasksApi.get(taskId);
    set((state) => ({ tasksById: { ...state.tasksById, [task.id]: task } }));
  },

  removeAttachment: async (taskId, attachmentId) => {
    await TasksApi.removeAttachment(taskId, attachmentId);
    set((state) => {
      const existing = state.tasksById[taskId];
      if (!existing) return state;
      return {
        tasksById: {
          ...state.tasksById,
          [taskId]: {
            ...existing,
            attachments: existing.attachments.filter((a) => a.id !== attachmentId),
          },
        },
      };
    });
  },

  addCollaborator: async (taskId, email, role) => {
    await TasksApi.addCollaborator(taskId, email, role);
    const { task } = await TasksApi.get(taskId);
    set((state) => ({ tasksById: { ...state.tasksById, [task.id]: task } }));
  },

  removeCollaborator: async (taskId, collaboratorId) => {
    await TasksApi.removeCollaborator(taskId, collaboratorId);
    set((state) => {
      const existing = state.tasksById[taskId];
      if (!existing) return state;
      return {
        tasksById: {
          ...state.tasksById,
          [taskId]: {
            ...existing,
            collaborators: existing.collaborators.filter((c) => c.id !== collaboratorId),
          },
        },
      };
    });
  },

  upsertFromSocket: (task) => {
    set((state) => ({ tasksById: { ...state.tasksById, [task.id]: task } }));
    void syncTaskReminder(task);
  },

  removeFromSocket: (taskId) => {
    set((state) => {
      const next = { ...state.tasksById };
      delete next[taskId];
      return { tasksById: next };
    });
    void cancelTaskReminder(taskId);
  },

  reset: () => set({ tasksById: {}, isLoading: false, error: null }),
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
