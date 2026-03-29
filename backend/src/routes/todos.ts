import { Router, Request, Response, NextFunction } from 'express';
import { TodoService } from '../services/todoService';
import {
  createTodoSchema,
  updateTodoSchema,
  listTodosQuerySchema,
  shareTodoSchema,
  updateShareSchema,
} from '../middleware/validation';
import { AuthService } from '../services/authService';
import { broadcastTodoEvent } from '../socket';
import type { Server as SocketServer } from 'socket.io';

function getIO(req: Request): SocketServer | null {
  return (req.app as any).io || null;
}

function broadcast(req: Request, type: string, todoId: string, userId: string, username: string, affectedUserIds: string[], data?: any): void {
  const io = getIO(req);
  if (!io) return;
  broadcastTodoEvent(io, { type: type as any, todoId, userId, username, data }, affectedUserIds);
}

export function createTodoRouter(todoService: TodoService, authService: AuthService): Router {
  const router = Router();

  /**
   * @swagger
   * /api/todos:
   *   get:
   *     summary: List all TODOs with filtering, sorting, and pagination
   *     tags: [Todos]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [not_started, in_progress, completed, archived]
   *         description: Filter by status
   *       - in: query
   *         name: priority
   *         schema:
   *           type: string
   *           enum: [low, medium, high]
   *         description: Filter by priority
   *       - in: query
   *         name: dueDateFrom
   *         schema:
   *           type: string
   *           format: date-time
   *         description: Filter by due date (from)
   *       - in: query
   *         name: dueDateTo
   *         schema:
   *           type: string
   *           format: date-time
   *         description: Filter by due date (to)
   *       - in: query
   *         name: dependencyStatus
   *         schema:
   *           type: string
   *           enum: [blocked, unblocked]
   *         description: Filter by dependency status
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *         description: Search in name and description
   *       - in: query
   *         name: includeShared
   *         schema:
   *           type: boolean
   *           default: true
   *         description: Include todos shared with you
   *       - in: query
   *         name: sortField
   *         schema:
   *           type: string
   *           enum: [dueDate, priority, status, name, createdAt]
   *         description: Sort field
   *       - in: query
   *         name: sortDirection
   *         schema:
   *           type: string
   *           enum: [asc, desc]
   *         description: Sort direction
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *           maximum: 100
   *       - in: query
   *         name: includeDeleted
   *         schema:
   *           type: boolean
   *           default: false
   *     responses:
   *       200:
   *         description: Paginated list of TODOs
   */
  router.get('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = listTodosQuerySchema.parse(req.query);
      const userId = req.user!.userId;

      const filter = {
        status: query.status,
        priority: query.priority,
        dueDateFrom: query.dueDateFrom,
        dueDateTo: query.dueDateTo,
        dependencyStatus: query.dependencyStatus,
        includeDeleted: query.includeDeleted,
        includeShared: query.includeShared,
        search: query.search,
      };

      const sort = query.sortField
        ? { field: query.sortField, direction: query.sortDirection || ('asc' as const) }
        : undefined;

      const pagination = { page: query.page, limit: query.limit };

      const result = todoService.list(userId, filter, sort, pagination);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * @swagger
   * /api/todos/{id}:
   *   get:
   *     summary: Get a TODO by ID
   *     tags: [Todos]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: TODO found
   *       404:
   *         description: TODO not found
   */
  router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const todo = todoService.getById(req.params.id, userId);
      if (!todo) {
        res.status(404).json({ error: 'Not Found', message: `Todo '${req.params.id}' not found` });
        return;
      }
      res.json(todo);
    } catch (err) {
      next(err);
    }
  });

  /**
   * @swagger
   * /api/todos:
   *   post:
   *     summary: Create a new TODO
   *     tags: [Todos]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name]
   *             properties:
   *               name:
   *                 type: string
   *               description:
   *                 type: string
   *               dueDate:
   *                 type: string
   *                 format: date-time
   *                 nullable: true
   *               status:
   *                 type: string
   *                 enum: [not_started, in_progress, completed, archived]
   *               priority:
   *                 type: string
   *                 enum: [low, medium, high]
   *               recurrencePattern:
   *                 type: string
   *                 enum: [daily, weekly, monthly, custom]
   *                 nullable: true
   *               recurrenceInterval:
   *                 type: integer
   *                 nullable: true
   *               dependsOn:
   *                 type: array
   *                 items:
   *                   type: string
   *                   format: uuid
   *     responses:
   *       201:
   *         description: TODO created
   *       400:
   *         description: Validation error
   */
  router.post('/', (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = createTodoSchema.parse(req.body);
      const userId = req.user!.userId;
      const todo = todoService.create(input, userId);
      broadcast(req, 'todo:created', todo.id, userId, req.user!.username, [userId], todo);
      res.status(201).json(todo);
    } catch (err) {
      next(err);
    }
  });

  /**
   * @swagger
   * /api/todos/{id}:
   *   put:
   *     summary: Update a TODO
   *     tags: [Todos]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [version]
   *             properties:
   *               name:
   *                 type: string
   *               description:
   *                 type: string
   *               dueDate:
   *                 type: string
   *                 format: date-time
   *                 nullable: true
   *               status:
   *                 type: string
   *                 enum: [not_started, in_progress, completed, archived]
   *               priority:
   *                 type: string
   *                 enum: [low, medium, high]
   *               recurrencePattern:
   *                 type: string
   *                 enum: [daily, weekly, monthly, custom]
   *                 nullable: true
   *               recurrenceInterval:
   *                 type: integer
   *                 nullable: true
   *               dependsOn:
   *                 type: array
   *                 items:
   *                   type: string
   *                   format: uuid
   *               version:
   *                 type: integer
   *                 description: Required for optimistic locking
   *     responses:
   *       200:
   *         description: TODO updated
   *       404:
   *         description: TODO not found
   *       409:
   *         description: Conflict (version mismatch)
   *       422:
   *         description: Dependency error
   */
  router.put('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = updateTodoSchema.parse(req.body);
      const userId = req.user!.userId;
      const todo = todoService.update(req.params.id, input, userId);
      const affectedUserIds = todoService.getAffectedUserIds(req.params.id);
      broadcast(req, 'todo:updated', req.params.id, userId, req.user!.username, affectedUserIds, todo);
      res.json(todo);
    } catch (err) {
      next(err);
    }
  });

  /**
   * @swagger
   * /api/todos/{id}:
   *   delete:
   *     summary: Soft-delete a TODO
   *     tags: [Todos]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       204:
   *         description: TODO deleted (soft)
   *       404:
   *         description: TODO not found
   */
  router.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const affectedUserIds = todoService.getAffectedUserIds(req.params.id);
      todoService.delete(req.params.id, userId);
      broadcast(req, 'todo:deleted', req.params.id, userId, req.user!.username, affectedUserIds);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  /**
   * @swagger
   * /api/todos/{id}/restore:
   *   post:
   *     summary: Restore a soft-deleted TODO
   *     tags: [Todos]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: TODO restored
   *       404:
   *         description: TODO not found
   */
  router.post('/:id/restore', (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const todo = todoService.restore(req.params.id, userId);
      const affectedUserIds = todoService.getAffectedUserIds(req.params.id);
      broadcast(req, 'todo:restored', req.params.id, userId, req.user!.username, affectedUserIds, todo);
      res.json(todo);
    } catch (err) {
      next(err);
    }
  });

  // --- Sharing endpoints ---

  /**
   * @swagger
   * /api/todos/{id}/shares:
   *   post:
   *     summary: Share a TODO with another user
   *     tags: [Sharing]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [sharedWithEmail]
   *             properties:
   *               sharedWithEmail:
   *                 type: string
   *                 format: email
   *               role:
   *                 type: string
   *                 enum: [viewer, editor]
   *     responses:
   *       201:
   *         description: Share created
   */
  router.post('/:id/shares', (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const input = shareTodoSchema.parse(req.body);
      
      // Lookup the target user by email
      const targetUser = authService.getUserByEmail(input.sharedWithEmail);
      if (!targetUser) {
        res.status(404).json({ error: 'Not Found', message: 'User not found with that email' });
        return;
      }

      const share = todoService.shareTodo(req.params.id, userId, targetUser.id, input.role);
      const affectedUserIds = todoService.getAffectedUserIds(req.params.id);
      broadcast(req, 'todo:shared', req.params.id, userId, req.user!.username, affectedUserIds, share);
      res.status(201).json(share);
    } catch (err) {
      next(err);
    }
  });

  /**
   * @swagger
   * /api/todos/{id}/shares:
   *   get:
   *     summary: Get all shares for a TODO
   *     tags: [Sharing]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: List of shares
   */
  router.get('/:id/shares', (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const shares = todoService.getSharesForTodo(req.params.id, userId);
      res.json(shares);
    } catch (err) {
      next(err);
    }
  });

  /**
   * @swagger
   * /api/todos/{id}/shares/{shareId}:
   *   put:
   *     summary: Update a share's role
   *     tags: [Sharing]
   *     security:
   *       - bearerAuth: []
   */
  router.put('/:id/shares/:shareId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const input = updateShareSchema.parse(req.body);
      // Re-share to update role
      const share = todoService.getSharesForTodo(req.params.id, userId)
        .find(s => s.id === req.params.shareId);
      if (!share) {
        res.status(404).json({ error: 'Not Found', message: 'Share not found' });
        return;
      }
      const updated = todoService.shareTodo(req.params.id, userId, share.sharedWithId, input.role);
      const affectedUserIds = todoService.getAffectedUserIds(req.params.id);
      broadcast(req, 'todo:shared', req.params.id, userId, req.user!.username, affectedUserIds, updated);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  /**
   * @swagger
   * /api/todos/{id}/shares/{shareId}:
   *   delete:
   *     summary: Remove a share
   *     tags: [Sharing]
   *     security:
   *       - bearerAuth: []
   */
  router.delete('/:id/shares/:shareId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const affectedUserIds = todoService.getAffectedUserIds(req.params.id);
      todoService.removeTodoShare(req.params.shareId, userId);
      broadcast(req, 'todo:unshared', req.params.id, userId, req.user!.username, affectedUserIds);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
