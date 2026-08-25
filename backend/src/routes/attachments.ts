import { Router } from 'express';
import { AttachmentType } from '../lib/constants';
import { prisma } from '../lib/prisma';
import { Errors } from '../lib/errors';
import { upload } from '../lib/upload';
import { validateBody } from '../middleware/validate';
import { createAttachmentSchema } from '../validation/schemas';
import { canEdit, getTaskParticipantIds, getUserTaskRole } from '../lib/taskAccess';
import { serializeTask, taskInclude } from '../lib/serializers';
import { emitToUsers } from '../sockets';

const router = Router({ mergeParams: true });

async function loadTaskAndAssertEditable(taskId: string, userId: string) {
  const roleInfo = await getUserTaskRole(taskId, userId);
  if (roleInfo.role === null) {
    throw Errors.notFound('Task not found');
  }
  if (!canEdit(roleInfo)) {
    throw Errors.forbidden('You do not have permission to edit this task');
  }
}

async function emitTaskUpdated(taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: taskInclude });
  if (!task) return;
  emitToUsers(getTaskParticipantIds(task), 'task:updated', { task: serializeTask(task) });
}

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const userId = req.userId as string;
    const taskId = req.params.id;
    await loadTaskAndAssertEditable(taskId, userId);

    let attachment;
    if (req.file) {
      attachment = await prisma.attachment.create({
        data: {
          taskId,
          type: AttachmentType.FILE,
          url: `/uploads/${req.file.filename}`,
          filename: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
        },
      });
    } else {
      const parsed = createAttachmentSchema.safeParse(req.body);
      if (!parsed.success) {
        const message = parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
        throw Errors.badRequest(message, 'VALIDATION_ERROR');
      }
      attachment = await prisma.attachment.create({
        data: {
          taskId,
          type: AttachmentType.LINK,
          url: parsed.data.url,
          filename: parsed.data.filename ?? null,
        },
      });
    }

    await emitTaskUpdated(taskId);

    res.status(201).json({
      attachment: {
        id: attachment.id,
        type: attachment.type,
        url: attachment.url,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        createdAt: attachment.createdAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:attachmentId', async (req, res, next) => {
  try {
    const userId = req.userId as string;
    const params = req.params as { id: string; attachmentId: string };
    const taskId = params.id;
    await loadTaskAndAssertEditable(taskId, userId);

    const attachment = await prisma.attachment.findUnique({ where: { id: params.attachmentId } });
    if (!attachment || attachment.taskId !== taskId) {
      throw Errors.notFound('Attachment not found');
    }

    await prisma.attachment.delete({ where: { id: attachment.id } });
    await emitTaskUpdated(taskId);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
