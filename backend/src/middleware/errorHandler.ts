import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ConflictError, DependencyError } from '../services/todoService';
import { AuthError } from '../services/authService';

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  console.error(`[ERROR] ${err.name}: ${err.message}`);

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation Error',
      details: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  if (err instanceof AuthError) {
    // Distinguish between 401 (bad credentials) and 409 (duplicate)
    const isDuplicate =
      err.message.includes('already registered') || err.message.includes('already taken');
    const status = isDuplicate ? 409 : 401;
    res.status(status).json({
      error: isDuplicate ? 'Conflict' : 'Authentication Error',
      message: err.message,
    });
    return;
  }

  if (err instanceof ConflictError) {
    res.status(409).json({
      error: 'Conflict',
      message: err.message,
    });
    return;
  }

  if (err instanceof DependencyError) {
    res.status(422).json({
      error: 'Dependency Error',
      message: err.message,
    });
    return;
  }

  if (err.message.includes('not found')) {
    res.status(404).json({
      error: 'Not Found',
      message: err.message,
    });
    return;
  }

  if (err.message.includes('not deleted')) {
    res.status(400).json({
      error: 'Bad Request',
      message: err.message,
    });
    return;
  }

  if (err.message.includes('permission') || err.message.includes('Forbidden')) {
    res.status(403).json({
      error: 'Forbidden',
      message: err.message,
    });
    return;
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
  });
}
