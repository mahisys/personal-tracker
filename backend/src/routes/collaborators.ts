import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { NotificationType } from '../lib/constants';
import { prisma } from '../lib/prisma';
import { Errors } from '../lib/errors';
import { validateBody } from '../middleware/validate';
import { createCollaboratorSchema } from '../validation/schemas';
import { serializeTask, taskInclude } from '../lib/serializers';
import { getTaskParticipantIds } from '../lib/taskAccess';
import { emitToUsers } from '../sockets';
import { notifyUser } from '../lib/notify';

const router = Router({ mergeParams: true });

async function loadOwnedTask(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw Errors.notFound('Task not found');
  if (task.ownerId !== userId) {
    throw Errors.forbidden('Only the owner may manage collaborators');
  }
  return task;
}

async function emitTaskUpdated(taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: taskInclude });
  if (!task) return;
  emitToUsers(getTaskParticipantIds(task), 'task:updated', { task: serializeTask(task) });
}

router.post('/', validateBody(createCollaboratorSchema), async (req, res, next) => {
  try {
    const userId = req.userId as string;
    const taskId = req.params.id;
    await loadOwnedTask(taskId, userId);

    const { email, role } = req.body;

    const invitedUser = await prisma.user.findUnique({ where: { email } });

    let collaborator;
    try {
      collaborator = await prisma.taskCollaborator.create({
        data: {
          taskId,
          email,
          role: role ?? 'EDITOR',
          userId: invitedUser?.id ?? null,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw Errors.conflict('This user is already a collaborator on this task', 'COLLABORATOR_EXISTS');
      }
      throw err;
    }

    if (invitedUser) {
      await notifyUser(
        invitedUser.id,
        NotificationType.SHARE_INVITE,
        `You've been invited to collaborate on a task`,
        taskId,
        'New task shared with you'
      );
    }

    await emitTaskUpdated(taskId);

    res.status(201).json({
      collaborator: {
        id: collaborator.id,
        userId: collaborator.userId,
        email: collaborator.email,
        role: collaborator.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:collaboratorId', async (req, res, next) => {
  try {
    const userId = req.userId as string;
    const params = req.params as { id: string; collaboratorId: string };
    const taskId = params.id;
    await loadOwnedTask(taskId, userId);

    const collaborator = await prisma.taskCollaborator.findUnique({ where: { id: params.collaboratorId } });
    if (!collaborator || collaborator.taskId !== taskId) {
      throw Errors.notFound('Collaborator not found');
    }

    await prisma.taskCollaborator.delete({ where: { id: collaborator.id } });
    await emitTaskUpdated(taskId);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
