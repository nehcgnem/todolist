import { Router, Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';
import { registerSchema, loginSchema } from '../middleware/validation';

export function createAuthRouter(authService: AuthService): Router {
  const router = Router();

  /**
   * @swagger
   * /api/auth/register:
   *   post:
   *     summary: Register a new user
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email, username, password]
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *               username:
   *                 type: string
   *               password:
   *                 type: string
   *                 minLength: 6
   *     responses:
   *       201:
   *         description: User registered successfully
   *       400:
   *         description: Validation error or duplicate email/username
   */
  router.post('/register', (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = registerSchema.parse(req.body);
      const result = authService.register(input);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * @swagger
   * /api/auth/login:
   *   post:
   *     summary: Login with email and password
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email, password]
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *               password:
   *                 type: string
   *     responses:
   *       200:
   *         description: Login successful
   *       401:
   *         description: Invalid credentials
   */
  router.post('/login', (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = loginSchema.parse(req.body);
      const result = authService.login(input);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * @swagger
   * /api/auth/me:
   *   get:
   *     summary: Get current authenticated user
   *     tags: [Auth]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Current user info
   *       401:
   *         description: Unauthorized
   */
  router.get('/me', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const user = authService.getUserById(req.user.userId);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json(user);
    } catch (err) {
      next(err);
    }
  });

  /**
   * @swagger
   * /api/auth/users/search:
   *   get:
   *     summary: Search for users (for sharing)
   *     tags: [Auth]
   *     parameters:
   *       - in: query
   *         name: q
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: List of matching users
   */
  router.get('/users/search', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const query = req.query.q as string;
      if (!query || query.length < 1) {
        res.json([]);
        return;
      }
      const users = authService.searchUsers(query, req.user.userId);
      res.json(users);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
