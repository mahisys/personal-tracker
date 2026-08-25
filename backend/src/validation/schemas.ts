import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: 'must be a valid ISO-8601 date string' });

export const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  dueDate: isoDate,
  reminderAt: isoDate.nullable().optional(),
});

export const updateTaskSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    dueDate: isoDate.optional(),
    reminderAt: isoDate.nullable().optional(),
    status: z.enum(['YTS', 'WIP', 'DONE']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'at least one field is required' });

export const createAttachmentSchema = z.object({
  type: z.literal('LINK'),
  url: z.string().url(),
  filename: z.string().nullable().optional(),
});

export const createCollaboratorSchema = z.object({
  email: z.string().email(),
  role: z.enum(['OWNER', 'EDITOR', 'VIEWER']).optional(),
});

export const registerPushTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ANDROID', 'IOS', 'WEB']),
});

export const deletePushTokenSchema = z.object({
  token: z.string().min(1),
});
