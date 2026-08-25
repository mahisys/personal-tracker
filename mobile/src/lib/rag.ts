// Pure derivation of a task's RAG status from its stored status + due date.
// Never stored itself — always recomputed so it can never go stale.
import { RagStatus, TaskStatus } from '../types/task';

export function deriveRagStatus(
  status: TaskStatus,
  dueDate: string,
  now: Date = new Date(),
): RagStatus {
  if (status === 'DONE') return 'DONE';
  if (new Date(dueDate).getTime() < now.getTime()) return 'OVERDUE';
  if (status === 'WIP') return 'WIP';
  return 'YTS';
}

export const RAG_LABELS: Record<RagStatus, string> = {
  YTS: 'Yet to start',
  WIP: 'In progress',
  DONE: 'Done',
  OVERDUE: 'Overdue',
};
