import { Request, Response, NextFunction } from 'express';
import { AuthService, AuthError } from '../services/authService';
import type { AuthTokenPayload } from '../types/todo';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
      authService?: AuthService;
    }
  }
}

export function createAuthMiddleware(authService: AuthService) {
  return function authenticate(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized', message: 'No token provided' });
      return;
    }

    const token = authHeader.substring(7);

    try {
      const payload = authService.verifyToken(token);
      req.user = payload;
      req.authService = authService;
      next();
    } catch (err) {
      if (err instanceof AuthError) {
        res.status(401).json({ error: 'Unauthorized', message: err.message });
        return;
      }
      next(err);
    }
  };
}
