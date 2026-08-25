export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const Errors = {
  badRequest: (message: string, code = 'BAD_REQUEST') => new ApiError(400, code, message),
  unauthorized: (message = 'Unauthorized', code = 'UNAUTHORIZED') => new ApiError(401, code, message),
  forbidden: (message = 'Forbidden', code = 'FORBIDDEN') => new ApiError(403, code, message),
  notFound: (message = 'Not found', code = 'NOT_FOUND') => new ApiError(404, code, message),
  conflict: (message: string, code = 'CONFLICT') => new ApiError(409, code, message),
  internal: (message = 'Internal server error', code = 'INTERNAL_ERROR') => new ApiError(500, code, message),
};
