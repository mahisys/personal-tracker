import { prisma } from './prisma';
import { CollaboratorRole } from './constants';

/** Returns the owner + every collaborator's user id (nulls filtered out) for a task's relations. */
export function getTaskParticipantIds(task: { ownerId: string; collaborators: { userId: string | null }[] }): string[] {
  const ids = [task.ownerId, ...task.collaborators.map((c) => c.userId).filter((id): id is string => Boolean(id))];
  return Array.from(new Set(ids));
}

/** Backfills any pending TaskCollaborator rows (invited by email, no account yet) with the new user's id. */
export async function backfillCollaboratorsForUser(userId: string, email: string) {
  await prisma.taskCollaborator.updateMany({
    where: { email, userId: null },
    data: { userId },
  });
}

export interface TaskRoleInfo {
  isOwner: boolean;
  role: CollaboratorRole | null;
}

/** Determines a user's relationship to a task: owner, or their collaborator role, or none. */
export async function getUserTaskRole(taskId: string, userId: string): Promise<TaskRoleInfo> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { ownerId: true } });
  if (!task) return { isOwner: false, role: null };
  if (task.ownerId === userId) return { isOwner: true, role: CollaboratorRole.OWNER };

  const collaborator = await prisma.taskCollaborator.findFirst({ where: { taskId, userId } });
  if (!collaborator) return { isOwner: false, role: null };
  return { isOwner: false, role: collaborator.role as CollaboratorRole };
}

export function canEdit(roleInfo: TaskRoleInfo): boolean {
  return roleInfo.isOwner || roleInfo.role === CollaboratorRole.EDITOR || roleInfo.role === CollaboratorRole.OWNER;
}

export function canView(roleInfo: TaskRoleInfo): boolean {
  return roleInfo.isOwner || roleInfo.role !== null;
}
