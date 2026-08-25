import { Prisma } from '@prisma/client';
import { deriveRagStatus } from './ragStatus';

export const taskInclude = {
  owner: { select: { id: true, name: true, email: true } },
  attachments: true,
  collaborators: true,
} satisfies Prisma.TaskInclude;

export type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export function serializeTask(task: TaskWithRelations) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    dueDate: task.dueDate.toISOString(),
    reminderAt: task.reminderAt ? task.reminderAt.toISOString() : null,
    reminderNotified: task.reminderNotified,
    status: task.status,
    ragStatus: deriveRagStatus(task),
    ownerId: task.ownerId,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    owner: task.owner,
    attachments: task.attachments.map((a) => ({
      id: a.id,
      type: a.type,
      url: a.url,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      createdAt: a.createdAt.toISOString(),
    })),
    collaborators: task.collaborators.map((c) => ({
      id: c.id,
      userId: c.userId,
      email: c.email,
      role: c.role,
    })),
  };
}

export function serializeUser(user: { id: string; email: string; name: string; createdAt: Date }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  };
}

export function serializeNotification(n: {
  id: string;
  type: string;
  message: string;
  read: boolean;
  taskId: string | null;
  createdAt: Date;
}) {
  return {
    id: n.id,
    type: n.type,
    message: n.message,
    read: n.read,
    taskId: n.taskId,
    createdAt: n.createdAt.toISOString(),
  };
}
