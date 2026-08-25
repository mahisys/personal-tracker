// Background sync engine described in API_CONTRACT.md's "Offline-first
// architecture (mobile)" section. Nothing here ever blocks the UI: every
// export is meant to be called fire-and-forget from `taskStore.ts` after a
// local write, or from the periodic/foreground/reconnect triggers wired up
// in `useBackgroundSync.ts`. Any failure is swallowed (logged, not thrown) —
// a flaky or absent connection must never surface as a crash.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiRequestError } from '../api/client';
import { TasksApi } from '../api/endpoints';
import { Attachment, Collaborator } from '../api/types';
import * as taskRepo from '../db/taskRepository';
import { PendingOp } from '../db/taskRepository';
import { cancelTaskReminder, syncTaskReminder } from '../lib/localReminders';
import { useTaskStore } from '../state/taskStore';

const SERVER_TIME_KEY = 'pt_sync_server_time';

/** Could not reach the server at all (see api/client.ts) — leave the op queued. */
function isNetworkError(e: unknown): boolean {
  return e instanceof ApiRequestError && e.code === 'NETWORK_ERROR';
}

/** Treated the same as a network error for queueing purposes: transient
 * server-side/auth trouble that deserves a retry next time, not a permanent
 * rejection of the operation's content. Only a genuine 4xx content rejection
 * (400/403/404/409/422/...) is dropped. */
function isTransientError(e: unknown): boolean {
  if (isNetworkError(e)) return true;
  if (e instanceof ApiRequestError) {
    return e.status === 0 || e.status >= 500 || e.status === 401 || e.status === 429;
  }
  return true; // an unexpected non-API error (e.g. a thrown TypeError) — don't drop, retry.
}

function warn(message: string): void {
  console.warn(`[syncEngine] ${message}`);
  useTaskStore.getState().addSyncError(message);
}

/** Local DB is the source of truth — reload the zustand cache from it after
 * any batch of DB mutations. The task count for a personal tracker is small
 * enough that a full reload is simpler (and just as fast) as diffing. */
function refreshStoreFromDb(): void {
  const tasks = taskRepo.listTasks();
  const pending = new Set(taskRepo.allPendingTaskIds());
  useTaskStore.getState().hydrateFromRows(tasks, pending);
}

function replaceAttachmentPlaceholder(taskId: string, localId: string, real: Attachment): void {
  const task = taskRepo.getTask(taskId);
  if (!task) return;
  const attachments = task.attachments.map((a) => (a.id === localId ? real : a));
  taskRepo.upsertTask({ ...task, attachments }, taskRepo.hasPendingOpsForTask(taskId));
}

function dropAttachmentPlaceholder(taskId: string, localId: string): void {
  const task = taskRepo.getTask(taskId);
  if (!task) return;
  const attachments = task.attachments.filter((a) => a.id !== localId);
  taskRepo.upsertTask({ ...task, attachments }, taskRepo.hasPendingOpsForTask(taskId));
}

function replaceCollaboratorPlaceholder(taskId: string, localId: string, real: Collaborator): void {
  const task = taskRepo.getTask(taskId);
  if (!task) return;
  const collaborators = task.collaborators.map((c) => (c.id === localId ? real : c));
  taskRepo.upsertTask({ ...task, collaborators }, taskRepo.hasPendingOpsForTask(taskId));
}

function dropCollaboratorPlaceholder(taskId: string, localId: string): void {
  const task = taskRepo.getTask(taskId);
  if (!task) return;
  const collaborators = task.collaborators.filter((c) => c.id !== localId);
  taskRepo.upsertTask({ ...task, collaborators }, taskRepo.hasPendingOpsForTask(taskId));
}

/** Undoes the local optimistic effect of an op the server permanently rejected,
 * so the UI never shows something as "pending" forever when it will never sync. */
function rollBackRejectedOp(op: PendingOp): void {
  switch (op.type) {
    case 'attachment.addLink':
    case 'attachment.addFile': {
      const { localId } = op.payload as { localId: string };
      dropAttachmentPlaceholder(op.taskId, localId);
      return;
    }
    case 'collaborator.add': {
      const { localId } = op.payload as { localId: string };
      dropCollaboratorPlaceholder(op.taskId, localId);
      return;
    }
    default:
      return;
  }
}

async function processOp(op: PendingOp): Promise<void> {
  switch (op.type) {
    case 'task.create': {
      const task = taskRepo.getTask(op.taskId);
      if (!task) return; // task was deleted locally before this ever pushed
      const { task: serverTask } = await TasksApi.create({
        id: task.id,
        title: task.title,
        description: task.description ?? undefined,
        dueDate: task.dueDate,
        reminderAt: task.reminderAt ?? undefined,
      });
      taskRepo.upsertTask(serverTask, taskRepo.hasPendingOpsForTask(op.taskId));
      void syncTaskReminder(serverTask);
      return;
    }
    case 'task.update': {
      const task = taskRepo.getTask(op.taskId);
      if (!task) return;
      const { task: serverTask } = await TasksApi.update(op.taskId, {
        title: task.title,
        description: task.description,
        dueDate: task.dueDate,
        reminderAt: task.reminderAt,
        status: task.status,
      });
      taskRepo.upsertTask(serverTask, taskRepo.hasPendingOpsForTask(op.taskId));
      void syncTaskReminder(serverTask);
      return;
    }
    case 'task.delete': {
      await TasksApi.remove(op.taskId);
      return;
    }
    case 'attachment.addLink': {
      const { localId, url, filename } = op.payload as {
        localId: string;
        url: string;
        filename?: string;
      };
      const { attachment } = await TasksApi.addLinkAttachment(op.taskId, url, filename);
      replaceAttachmentPlaceholder(op.taskId, localId, attachment);
      return;
    }
    case 'attachment.addFile': {
      const { localId, uri, name, mimeType } = op.payload as {
        localId: string;
        uri: string;
        name: string;
        mimeType?: string;
      };
      const { attachment } = await TasksApi.addFileAttachment(op.taskId, { uri, name, mimeType });
      replaceAttachmentPlaceholder(op.taskId, localId, attachment);
      return;
    }
    case 'attachment.remove': {
      const { attachmentId } = op.payload as { attachmentId: string };
      await TasksApi.removeAttachment(op.taskId, attachmentId);
      return;
    }
    case 'collaborator.add': {
      const { localId, email, role } = op.payload as {
        localId: string;
        email: string;
        role?: Collaborator['role'];
      };
      const { collaborator } = await TasksApi.addCollaborator(op.taskId, email, role);
      replaceCollaboratorPlaceholder(op.taskId, localId, collaborator);
      return;
    }
    case 'collaborator.remove': {
      const { collaboratorId } = op.payload as { collaboratorId: string };
      await TasksApi.removeCollaborator(op.taskId, collaboratorId);
      return;
    }
    default:
      return;
  }
}

/** Drains the pending-ops queue in FIFO order against the REST API.
 *
 * - Network-level failure (can't reach the server / timeout / 5xx / auth
 *   hiccup): stop immediately and leave the remaining queue for next time.
 * - Genuine server rejection (4xx the idempotent-create case doesn't cover):
 *   drop just that op — with a logged warning surfaced via `syncErrors` — and
 *   keep draining the rest, so one bad op can never wedge the whole queue.
 */
export async function pushQueue(): Promise<void> {
  const ops = taskRepo.listPendingOps();
  let mutated = false;

  for (const op of ops) {
    try {
      await processOp(op);
      taskRepo.removeOp(op.id);
      mutated = true;
    } catch (e) {
      if (isTransientError(e)) {
        taskRepo.incrementOpAttempts(op.id);
        break; // preserve FIFO order — don't skip ahead to later ops
      }
      const message = e instanceof Error ? e.message : String(e);
      warn(`Dropped ${op.type} for task ${op.taskId}: ${message}`);
      rollBackRejectedOp(op);
      taskRepo.removeOp(op.id);
      mutated = true;
    }
    if (!taskRepo.hasPendingOpsForTask(op.taskId)) {
      taskRepo.setTaskPendingSync(op.taskId, false);
    }
  }

  if (mutated) refreshStoreFromDb();
}

/** Pulls remote changes (including ones made by collaborators) into the local
 * DB via GET /tasks/sync, per API_CONTRACT.md. */
export async function pullSync(): Promise<void> {
  const since = (await AsyncStorage.getItem(SERVER_TIME_KEY)) ?? undefined;
  const { tasks, deletedTaskIds, serverTime } = await TasksApi.sync(since);

  let mutated = false;

  for (const remote of tasks) {
    const local = taskRepo.getTask(remote.id);
    if (!local) {
      taskRepo.upsertTask(remote, false);
      mutated = true;
      continue;
    }
    const hasPending = taskRepo.hasPendingOpsForTask(remote.id);
    if (!hasPending) {
      taskRepo.upsertTask(remote, false);
      mutated = true;
    } else if (new Date(remote.updatedAt).getTime() > new Date(local.updatedAt).getTime()) {
      // Remote is strictly newer than our pending local edit — remote wins.
      // The still-queued op reads the task's *current* fields at push time
      // (see processOp above), so once we overwrite the row here it will
      // simply re-send this same state next push instead of clobbering it.
      taskRepo.upsertTask(remote, true);
      mutated = true;
    }
    // else: local pending edit is newer or equal — keep it, remote is stale.
  }

  for (const deletedId of deletedTaskIds) {
    if (taskRepo.hasPendingCreateForTask(deletedId)) {
      continue; // never reached the server yet — let the next push retry it
    }
    if (taskRepo.getTask(deletedId)) {
      taskRepo.deleteTaskRow(deletedId);
      void cancelTaskReminder(deletedId);
      mutated = true;
    }
  }

  // Always store the server's clock, never the client's, to avoid clock-skew gaps.
  await AsyncStorage.setItem(SERVER_TIME_KEY, serverTime);
  if (mutated) refreshStoreFromDb();
}

let inFlight: Promise<void> | null = null;

/** `pushQueue()` then `pullSync()`, deduplicated against concurrent callers and
 * fully swallowing errors — this is the one function every trigger (network
 * reconnect, app foreground, periodic timer, manual pull-to-refresh) should
 * call. It must never throw. */
export function runSync(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      await pushQueue();
    } catch (e) {
      console.warn('[syncEngine] pushQueue failed', e);
    }
    try {
      await pullSync();
    } catch (e) {
      console.warn('[syncEngine] pullSync failed', e);
    }
  })();
  const settled = inFlight.finally(() => {
    inFlight = null;
  });
  return settled;
}

/** Clears the pull-sync high-water mark. Call alongside wiping the local DB on
 * logout so the next login starts from a full initial mirror rather than an
 * incremental one anchored to a different account's last sync time. */
export async function resetSyncState(): Promise<void> {
  await AsyncStorage.removeItem(SERVER_TIME_KEY);
}
