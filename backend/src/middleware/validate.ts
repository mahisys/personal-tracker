import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { Errors } from '../lib/errors';

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
      return next(Errors.badRequest(message, 'VALIDATION_ERROR'));
    }
    req.body = result.data;
    next();
  };
}
