import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { Errors } from '../lib/errors';
import { serializeUser } from '../lib/serializers';
import { validateBody } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { loginSchema, registerSchema } from '../validation/schemas';
import { backfillCollaboratorsForUser } from '../lib/taskAccess';

const router = Router();

router.post('/register', validateBody(registerSchema), async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw Errors.conflict('An account with this email already exists', 'EMAIL_TAKEN');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, passwordHash, name } });

    await backfillCollaboratorsForUser(user.id, user.email);

    const token = signToken({ userId: user.id });
    res.status(201).json({ token, user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw Errors.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw Errors.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    await backfillCollaboratorsForUser(user.id, user.email);

    const token = signToken({ userId: user.id });
    res.status(200).json({ token, user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      throw Errors.notFound('User not found');
    }
    res.status(200).json({ user: serializeUser(user) });
  } catch (err) {
    next(err);
  }
});

export default router;
