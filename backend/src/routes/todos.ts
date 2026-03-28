import { Router, Request, Response, NextFunction } from 'express';
import { TodoService } from '../services/todoService';
import {
  createTodoSchema,
  updateTodoSchema,
  listTodosQuerySchema,
} from '../middleware/validation';

export function createTodoRouter(todoService: TodoService): Router {
  const router = Router();

  /**
   * @swagger
   * /api/todos:
   *   get:
   *     summary: List all TODOs with filtering, sorting, and pagination
   *     tags: [Todos]
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

      const filter = {
        status: query.status,
        priority: query.priority,
        dueDateFrom: query.dueDateFrom,
        dueDateTo: query.dueDateTo,
        dependencyStatus: query.dependencyStatus,
        includeDeleted: query.includeDeleted,
        search: query.search,
      };

      const sort = query.sortField
        ? { field: query.sortField, direction: query.sortDirection || ('asc' as const) }
        : undefined;

      const pagination = { page: query.page, limit: query.limit };

      const result = todoService.list(filter, sort, pagination);
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
      const todo = todoService.getById(req.params.id);
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
      const todo = todoService.create(input);
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
      const todo = todoService.update(req.params.id, input);
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
      todoService.delete(req.params.id);
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
      const todo = todoService.restore(req.params.id);
      res.json(todo);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
