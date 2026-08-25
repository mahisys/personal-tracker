import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { Errors } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { serializeNotification } from '../lib/serializers';

const router = Router();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const userId = req.userId as string;
    const unreadOnly = req.query.unreadOnly === 'true';

    const notifications = await prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { read: false } : {}) },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ notifications: notifications.map(serializeNotification) });
  } catch (err) {
    next(err);
  }
});

router.patch('/read-all', async (req, res, next) => {
  try {
    const userId = req.userId as string;
    const result = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    res.status(200).json({ count: result.count });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    const userId = req.userId as string;
    const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!notification || notification.userId !== userId) {
      throw Errors.notFound('Notification not found');
    }

    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: { read: true },
    });

    res.status(200).json({ notification: serializeNotification(updated) });
  } catch (err) {
    next(err);
  }
});

export default router;
