import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { Errors } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { createTaskSchema, updateTaskSchema } from '../validation/schemas';
import { serializeTask, taskInclude } from '../lib/serializers';
import { RagStatus } from '../lib/ragStatus';
import { canEdit, canView, getTaskParticipantIds, getUserTaskRole } from '../lib/taskAccess';
import { emitToUsers } from '../sockets';
import attachmentsRouter from './attachments';
import collaboratorsRouter from './collaborators';

const router = Router();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const userId = req.userId as string;
    const { date, status, scope = 'mine', tzOffset = '0' } = req.query as Record<string, string>;

    let where: Prisma.TaskWhereInput;
    if (scope === 'shared') {
      where = { collaborators: { some: { userId } } };
    } else if (scope === 'all') {
      where = { OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }] };
    } else {
      where = { ownerId: userId };
    }

    if (date) {
      // tzOffset is minutes EAST of UTC (e.g. +330 for India, -300 for US Eastern
      // standard time) per API_CONTRACT.md. Local midnight for `date` occurs at the
      // UTC instant `dateT00:00:00Z - offsetMinutes`, since local time = UTC + offset.
      const offsetMinutes = Number.parseInt(tzOffset, 10) || 0;
      const startUtc = new Date(`${date}T00:00:00.000Z`);
      startUtc.setUTCMinutes(startUtc.getUTCMinutes() - offsetMinutes);
      const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
      where = { AND: [where, { dueDate: { gte: startUtc, lt: endUtc } }] };
    }

    const tasks = await prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: { dueDate: 'asc' },
    });

    let serialized = tasks.map(serializeTask);

    if (status) {
      serialized = serialized.filter((t) => t.ragStatus === (status as RagStatus));
    }

    res.status(200).json({ tasks: serialized });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.userId as string;
    const roleInfo = await getUserTaskRole(req.params.id, userId);
    if (!canView(roleInfo)) {
      throw Errors.notFound('Task not found');
    }

    const task = await prisma.task.findUnique({ where: { id: req.params.id }, include: taskInclude });
    if (!task) throw Errors.notFound('Task not found');

    res.status(200).json({ task: serializeTask(task) });
  } catch (err) {
    next(err);
  }
});

router.post('/', validateBody(createTaskSchema), async (req, res, next) => {
  try {
    const userId = req.userId as string;
    const { title, description, dueDate, reminderAt } = req.body;

    const task = await prisma.task.create({
      data: {
        title,
        description: description ?? null,
        dueDate: new Date(dueDate),
        reminderAt: reminderAt ? new Date(reminderAt) : null,
        ownerId: userId,
      },
      include: taskInclude,
    });

    const serialized = serializeTask(task);
    emitToUsers(getTaskParticipantIds(task), 'task:created', { task: serialized });

    res.status(201).json({ task: serialized });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validateBody(updateTaskSchema), async (req, res, next) => {
  try {
    const userId = req.userId as string;
    const roleInfo = await getUserTaskRole(req.params.id, userId);
    if (roleInfo.role === null) {
      throw Errors.notFound('Task not found');
    }
    if (!canEdit(roleInfo)) {
      throw Errors.forbidden('You do not have permission to edit this task');
    }

    const { title, description, dueDate, reminderAt, status } = req.body;
    const data: Prisma.TaskUpdateInput = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (dueDate !== undefined) data.dueDate = new Date(dueDate);
    if (reminderAt !== undefined) {
      data.reminderAt = reminderAt ? new Date(reminderAt) : null;
      data.reminderNotified = false;
    }
    if (status !== undefined) {
      data.status = status;
      if (status === 'DONE') {
        data.reminderNotified = true;
      }
    }

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data,
      include: taskInclude,
    });

    const serialized = serializeTask(task);
    emitToUsers(getTaskParticipantIds(task), 'task:updated', { task: serialized });

    res.status(200).json({ task: serialized });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.userId as string;
    const task = await prisma.task.findUnique({ where: { id: req.params.id }, include: taskInclude });
    if (!task) throw Errors.notFound('Task not found');
    if (task.ownerId !== userId) {
      throw Errors.forbidden('Only the owner may delete this task');
    }

    const participantIds = getTaskParticipantIds(task);
    await prisma.task.delete({ where: { id: req.params.id } });

    emitToUsers(participantIds, 'task:deleted', { taskId: task.id });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.use('/:id/attachments', attachmentsRouter);
router.use('/:id/collaborators', collaboratorsRouter);

export default router;
