// Local-first storage for tasks and the pending-operations queue described in
// API_CONTRACT.md's "Offline-first architecture (mobile)" section. Nothing in
// here talks to the network — `taskStore.ts` applies changes here first
// (instant, offline-safe) and `sync/syncEngine.ts` is the only thing that
// later drains `pending_ops` against the REST API.
//
// `owner` / `attachments` / `collaborators` are flattened into JSON text
// columns: the app never queries into those sub-fields in SQL, only in JS
// after loading a row, so full relational normalization isn't worth it here.
import * as Crypto from 'expo-crypto';
import type { SQLiteBindValue } from 'expo-sqlite';
import { Task } from '../api/types';
import { getDb } from './database';

export type PendingOpType =
  | 'task.create'
  | 'task.update'
  | 'task.delete'
  | 'attachment.addLink'
  | 'attachment.addFile'
  | 'attachment.remove'
  | 'collaborator.add'
  | 'collaborator.remove';

export interface PendingOp {
  id: string;
  type: PendingOpType;
  taskId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  dueDate: string;
  reminderAt: string | null;
  reminderNotified: number;
  status: string;
  ragStatus: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  ownerJson: string;
  attachmentsJson: string;
  collaboratorsJson: string;
  pendingSync: number;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.dueDate,
    reminderAt: row.reminderAt,
    reminderNotified: !!row.reminderNotified,
    status: row.status as Task['status'],
    ragStatus: row.ragStatus as Task['ragStatus'],
    ownerId: row.ownerId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    owner: JSON.parse(row.ownerJson) as Task['owner'],
    attachments: JSON.parse(row.attachmentsJson) as Task['attachments'],
    collaborators: JSON.parse(row.collaboratorsJson) as Task['collaborators'],
  };
}

/** Insert-or-replace a task. `pendingSync` marks it as having local changes not
 * yet confirmed by the server — purely a local UI/bookkeeping decoration, never
 * sent to or read from the API. */
export function upsertTask(task: Task, pendingSync: boolean): void {
  getDb().runSync(
    `INSERT INTO tasks (
       id, title, description, dueDate, reminderAt, reminderNotified, status, ragStatus,
       ownerId, createdAt, updatedAt, ownerJson, attachmentsJson, collaboratorsJson, pendingSync
     ) VALUES ($id, $title, $description, $dueDate, $reminderAt, $reminderNotified, $status, $ragStatus,
       $ownerId, $createdAt, $updatedAt, $ownerJson, $attachmentsJson, $collaboratorsJson, $pendingSync)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       dueDate = excluded.dueDate,
       reminderAt = excluded.reminderAt,
       reminderNotified = excluded.reminderNotified,
       status = excluded.status,
       ragStatus = excluded.ragStatus,
       ownerId = excluded.ownerId,
       createdAt = excluded.createdAt,
       updatedAt = excluded.updatedAt,
       ownerJson = excluded.ownerJson,
       attachmentsJson = excluded.attachmentsJson,
       collaboratorsJson = excluded.collaboratorsJson,
       pendingSync = excluded.pendingSync`,
    {
      $id: task.id,
      $title: task.title,
      $description: task.description,
      $dueDate: task.dueDate,
      $reminderAt: task.reminderAt,
      $reminderNotified: task.reminderNotified ? 1 : 0,
      $status: task.status,
      $ragStatus: task.ragStatus,
      $ownerId: task.ownerId,
      $createdAt: task.createdAt,
      $updatedAt: task.updatedAt,
      $ownerJson: JSON.stringify(task.owner),
      $attachmentsJson: JSON.stringify(task.attachments),
      $collaboratorsJson: JSON.stringify(task.collaborators),
      $pendingSync: pendingSync ? 1 : 0,
    },
  );
}

export function setTaskPendingSync(taskId: string, pendingSync: boolean): void {
  getDb().runSync(`UPDATE tasks SET pendingSync = $pendingSync WHERE id = $id`, {
    $pendingSync: pendingSync ? 1 : 0,
    $id: taskId,
  });
}

export function deleteTaskRow(id: string): void {
  getDb().runSync(`DELETE FROM tasks WHERE id = $id`, { $id: id });
}

export function listTasks(): Task[] {
  return getDb()
    .getAllSync<TaskRow>(`SELECT * FROM tasks`)
    .map(rowToTask);
}

export function getTask(id: string): Task | undefined {
  const row = getDb().getFirstSync<TaskRow>(`SELECT * FROM tasks WHERE id = $id`, { $id: id });
  return row ? rowToTask(row) : undefined;
}

/** Ids of every task the sync engine currently considers "not yet synced". */
export function pendingTaskIds(): string[] {
  return getDb()
    .getAllSync<{ id: string }>(`SELECT id FROM tasks WHERE pendingSync = 1`)
    .map((r) => r.id);
}

// ---- pending operations queue ----

interface PendingOpRow {
  id: string;
  type: string;
  taskId: string;
  payload: string;
  createdAt: string;
  attempts: number;
}

function rowToOp(row: PendingOpRow): PendingOp {
  return {
    id: row.id,
    type: row.type as PendingOpType,
    taskId: row.taskId,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    createdAt: row.createdAt,
    attempts: row.attempts,
  };
}

export function enqueueOp(
  type: PendingOpType,
  taskId: string,
  payload: Record<string, unknown> = {},
): PendingOp {
  const op: PendingOp = {
    id: Crypto.randomUUID(),
    type,
    taskId,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  getDb().runSync(
    `INSERT INTO pending_ops (id, type, taskId, payload, createdAt, attempts)
     VALUES ($id, $type, $taskId, $payload, $createdAt, 0)`,
    {
      $id: op.id,
      $type: op.type,
      $taskId: op.taskId,
      $payload: JSON.stringify(payload),
      $createdAt: op.createdAt,
    },
  );
  setTaskPendingSync(taskId, true);
  return op;
}

/** FIFO order — oldest first, ties broken by insertion order. */
export function listPendingOps(): PendingOp[] {
  return getDb()
    .getAllSync<PendingOpRow>(`SELECT * FROM pending_ops ORDER BY createdAt ASC, rowid ASC`)
    .map(rowToOp);
}

export function listPendingOpsForTask(taskId: string): PendingOp[] {
  return getDb()
    .getAllSync<PendingOpRow>(
      `SELECT * FROM pending_ops WHERE taskId = $taskId ORDER BY createdAt ASC, rowid ASC`,
      { $taskId: taskId },
    )
    .map(rowToOp);
}

export function removeOp(id: string): void {
  getDb().runSync(`DELETE FROM pending_ops WHERE id = $id`, { $id: id });
}

/** Drops every queued op for a task, optionally narrowed to specific types.
 * Used to coalesce/cancel superseded work (e.g. a delete makes any queued
 * update pointless; an unsynced create makes a queued delete pointless). */
export function removeOpsForTask(taskId: string, types?: PendingOpType[]): void {
  if (types && types.length > 0) {
    const placeholders = types.map((_, i) => `$t${i}`).join(', ');
    const params: Record<string, SQLiteBindValue> = { $taskId: taskId };
    types.forEach((t, i) => {
      params[`$t${i}`] = t;
    });
    getDb().runSync(`DELETE FROM pending_ops WHERE taskId = $taskId AND type IN (${placeholders})`, params);
  } else {
    getDb().runSync(`DELETE FROM pending_ops WHERE taskId = $taskId`, { $taskId: taskId });
  }
}

export function incrementOpAttempts(id: string): void {
  getDb().runSync(`UPDATE pending_ops SET attempts = attempts + 1 WHERE id = $id`, { $id: id });
}

export function hasPendingOpsForTask(taskId: string): boolean {
  const row = getDb().getFirstSync<{ c: number }>(
    `SELECT COUNT(*) as c FROM pending_ops WHERE taskId = $taskId`,
    { $taskId: taskId },
  );
  return !!row && row.c > 0;
}

export function hasPendingCreateForTask(taskId: string): boolean {
  const row = getDb().getFirstSync<{ c: number }>(
    `SELECT COUNT(*) as c FROM pending_ops WHERE taskId = $taskId AND type = 'task.create'`,
    { $taskId: taskId },
  );
  return !!row && row.c > 0;
}

export function allPendingTaskIds(): string[] {
  return getDb()
    .getAllSync<{ taskId: string }>(`SELECT DISTINCT taskId FROM pending_ops`)
    .map((r) => r.taskId);
}

/** Wipes every local task and queued operation — call on logout so one user's
 * cached tasks never leak into the next login on a shared device. */
export function clearAll(): void {
  getDb().execSync('DELETE FROM tasks; DELETE FROM pending_ops;');
}
