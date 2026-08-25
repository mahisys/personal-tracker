import { TaskStatus } from './constants';

export type RagStatus = 'YTS' | 'WIP' | 'DONE' | 'OVERDUE';

/**
 * Derives the effective / RAG status for a task. Never stored — always computed at read time.
 *
 * ragStatus =
 *   status === 'DONE'                   -> 'DONE'
 *   status !== 'DONE' && dueDate < now  -> 'OVERDUE'
 *   status === 'WIP'                    -> 'WIP'
 *   else                                 -> 'YTS'
 */
export function deriveRagStatus(task: { status: string; dueDate: Date }, now: Date = new Date()): RagStatus {
  if (task.status === TaskStatus.DONE) return 'DONE';
  if (task.dueDate < now) return 'OVERDUE';
  if (task.status === TaskStatus.WIP) return 'WIP';
  return 'YTS';
}
