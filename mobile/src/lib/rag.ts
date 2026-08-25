// Pure re-implementation of the RAG derivation formula from API_CONTRACT.md.
// Only used for instant optimistic UI (e.g. right after creating/editing a
// task, or while offline) — the server's `ragStatus` is always the value
// trusted for display once a response comes back.
import { RagStatus, TaskStatus } from '../api/types';

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
