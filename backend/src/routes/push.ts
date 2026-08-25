import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { deletePushTokenSchema, registerPushTokenSchema } from '../validation/schemas';

const router = Router();

router.use(requireAuth);

router.post('/register', validateBody(registerPushTokenSchema), async (req, res, next) => {
  try {
    const userId = req.userId as string;
    const { token, platform } = req.body;

    await prisma.pushToken.upsert({
      where: { token },
      update: { userId, platform },
      create: { token, platform, userId },
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/register', validateBody(deletePushTokenSchema), async (req, res, next) => {
  try {
    const { token } = req.body;
    await prisma.pushToken.deleteMany({ where: { token } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
