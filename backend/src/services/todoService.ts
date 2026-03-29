import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import {
  Todo,
  TodoWithDependencies,
  CreateTodoInput,
  UpdateTodoInput,
  TodoFilter,
  TodoSort,
  PaginationParams,
  PaginatedResult,
  TodoStatus,
  TodoPriority,
  RecurrencePattern,
  ShareRole,
  TodoShare,
  TodoShareWithUser,
} from '../types/todo';

export class TodoService {
  constructor(private db: Database.Database) {}

  create(input: CreateTodoInput, userId: string): TodoWithDependencies {
    const id = uuidv4();
    const now = new Date().toISOString();

    const insertTodo = this.db.prepare(`
      INSERT INTO todos (id, user_id, name, description, due_date, status, priority,
        recurrence_pattern, recurrence_interval, parent_recurring_id, version, is_deleted, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
    `);

    const insertDep = this.db.prepare(`
      INSERT INTO todo_dependencies (todo_id, depends_on_id) VALUES (?, ?)
    `);

    const transaction = this.db.transaction(() => {
      insertTodo.run(
        id,
        userId,
        input.name,
        input.description || '',
        input.dueDate || null,
        input.status || TodoStatus.NOT_STARTED,
        input.priority || TodoPriority.MEDIUM,
        input.recurrencePattern || null,
        input.recurrenceInterval || null,
        input.parentRecurringId || null,
        now,
        now
      );

      if (input.dependsOn && input.dependsOn.length > 0) {
        for (const depId of input.dependsOn) {
          // Verify dependency exists, is not deleted, and is accessible by this user
          const dep = this.db.prepare(
            `SELECT id FROM todos WHERE id = ? AND is_deleted = 0 AND (
              user_id = ? OR id IN (SELECT todo_id FROM todo_shares WHERE shared_with_id = ?)
            )`
          ).get(depId, userId, userId) as any;
          if (!dep) {
            throw new Error(`Dependency todo '${depId}' not found`);
          }
          insertDep.run(id, depId);
        }
      }

      return this.getById(id, userId)!;
    });

    return transaction();
  }

  getById(id: string, userId: string, includeDeleted = false): TodoWithDependencies | null {
    const whereClause = includeDeleted ? '' : 'AND is_deleted = 0';
    const row = this.db.prepare(
      `SELECT t.*, 
        CASE 
          WHEN t.user_id = ? THEN 'owner'
          ELSE (SELECT role FROM todo_shares WHERE todo_id = t.id AND shared_with_id = ?)
        END as share_role
       FROM todos t 
       WHERE t.id = ? ${whereClause}
         AND (t.user_id = ? OR t.id IN (SELECT todo_id FROM todo_shares WHERE shared_with_id = ?))`
    ).get(userId, userId, id, userId, userId) as any;
    if (!row) return null;

    return this.enrichTodo(row, userId);
  }

  list(
    userId: string,
    filter?: TodoFilter,
    sort?: TodoSort,
    pagination?: PaginationParams
  ): PaginatedResult<TodoWithDependencies> {
    const conditions: string[] = [];
    const params: any[] = [];

    // By default, don't include deleted
    if (!filter?.includeDeleted) {
      conditions.push('t.is_deleted = 0');
    }

    // User access: own todos + shared todos
    if (filter?.includeShared !== false) {
      conditions.push('(t.user_id = ? OR t.id IN (SELECT todo_id FROM todo_shares WHERE shared_with_id = ?))');
      params.push(userId, userId);
    } else {
      conditions.push('t.user_id = ?');
      params.push(userId);
    }

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      conditions.push(`t.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }

    if (filter?.priority) {
      const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
      conditions.push(`t.priority IN (${priorities.map(() => '?').join(',')})`);
      params.push(...priorities);
    }

    if (filter?.dueDateFrom) {
      conditions.push('t.due_date >= ?');
      params.push(filter.dueDateFrom);
    }

    if (filter?.dueDateTo) {
      conditions.push('t.due_date <= ?');
      params.push(filter.dueDateTo);
    }

    if (filter?.search) {
      conditions.push('(t.name LIKE ? OR t.description LIKE ?)');
      const searchTerm = `%${filter.search}%`;
      params.push(searchTerm, searchTerm);
    }

    if (filter?.dependencyStatus) {
      if (filter.dependencyStatus === 'blocked') {
        conditions.push(`EXISTS (
          SELECT 1 FROM todo_dependencies td
          JOIN todos dep ON dep.id = td.depends_on_id
          WHERE td.todo_id = t.id AND dep.status != 'completed' AND dep.is_deleted = 0
        )`);
      } else if (filter.dependencyStatus === 'unblocked') {
        conditions.push(`NOT EXISTS (
          SELECT 1 FROM todo_dependencies td
          JOIN todos dep ON dep.id = td.depends_on_id
          WHERE td.todo_id = t.id AND dep.status != 'completed' AND dep.is_deleted = 0
        )`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Sort
    let orderClause = 'ORDER BY t.created_at DESC';
    if (sort) {
      const columnMap: Record<string, string> = {
        dueDate: 't.due_date',
        priority: `CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END`,
        status: `CASE t.status WHEN 'in_progress' THEN 1 WHEN 'not_started' THEN 2 WHEN 'completed' THEN 3 WHEN 'archived' THEN 4 END`,
        name: 't.name',
        createdAt: 't.created_at',
      };
      const col = columnMap[sort.field] || 't.created_at';
      const dir = sort.direction === 'asc' ? 'ASC' : 'DESC';
      // Put NULLs last for due_date
      if (sort.field === 'dueDate') {
        orderClause = `ORDER BY CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, ${col} ${dir}`;
      } else {
        orderClause = `ORDER BY ${col} ${dir}`;
      }
    }

    // Count total
    const countQuery = `SELECT COUNT(*) as total FROM todos t ${whereClause}`;
    const { total } = this.db.prepare(countQuery).get(...params) as any;

    // Pagination
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 50;
    const offset = (page - 1) * limit;

    const query = `SELECT t.* FROM todos t ${whereClause} ${orderClause} LIMIT ? OFFSET ?`;
    const rows = this.db.prepare(query).all(...params, limit, offset) as any[];

    const data = rows.map((row) => this.enrichTodo(row, userId));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  update(id: string, input: UpdateTodoInput, userId: string): TodoWithDependencies {
    const existing = this.getById(id, userId);
    if (!existing) {
      throw new Error(`Todo '${id}' not found`);
    }

    // Check write permission
    this.checkWritePermission(id, userId);

    // Optimistic locking check
    if (existing.version !== input.version) {
      throw new ConflictError(
        `Todo has been modified by another user. Expected version ${input.version}, but current version is ${existing.version}. Please refresh and try again.`
      );
    }

    // Check dependency constraint: cannot move to IN_PROGRESS if blocked
    if (input.status === TodoStatus.IN_PROGRESS && existing.isBlocked) {
      throw new DependencyError(
        'Cannot move to "In Progress" - this task has uncompleted dependencies'
      );
    }

    const now = new Date().toISOString();
    const newVersion = existing.version + 1;

    const updateTodo = this.db.prepare(`
      UPDATE todos SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        due_date = ?,
        status = COALESCE(?, status),
        priority = COALESCE(?, priority),
        recurrence_pattern = ?,
        recurrence_interval = ?,
        version = ?,
        updated_at = ?
      WHERE id = ? AND version = ? AND is_deleted = 0
    `);

    const transaction = this.db.transaction(() => {
      const result = updateTodo.run(
        input.name ?? null,
        input.description ?? null,
        input.dueDate !== undefined ? input.dueDate : existing.dueDate,
        input.status ?? null,
        input.priority ?? null,
        input.recurrencePattern !== undefined ? input.recurrencePattern : existing.recurrencePattern,
        input.recurrenceInterval !== undefined ? input.recurrenceInterval : existing.recurrenceInterval,
        newVersion,
        now,
        id,
        input.version
      );

      if (result.changes === 0) {
        throw new ConflictError('Todo was modified concurrently. Please refresh and try again.');
      }

      // Update dependencies if provided
      if (input.dependsOn !== undefined) {
        this.db.prepare('DELETE FROM todo_dependencies WHERE todo_id = ?').run(id);
        const insertDep = this.db.prepare('INSERT INTO todo_dependencies (todo_id, depends_on_id) VALUES (?, ?)');
        for (const depId of input.dependsOn) {
          // Check for cycles
          if (this.wouldCreateCycle(id, depId)) {
            throw new DependencyError(`Adding dependency on '${depId}' would create a circular dependency`);
          }
          const dep = this.db.prepare('SELECT id FROM todos WHERE id = ? AND is_deleted = 0').get(depId) as any;
          if (!dep) {
            throw new Error(`Dependency todo '${depId}' not found`);
          }
          insertDep.run(id, depId);
        }
      }

      // Handle recurring task completion
      if (input.status === TodoStatus.COMPLETED && existing.status !== TodoStatus.COMPLETED) {
        const updatedTodo = this.getById(id, userId)!;
        if (updatedTodo.recurrencePattern) {
          this.createNextRecurrence(updatedTodo, userId);
        }
      }

      return this.getById(id, userId)!;
    });

    return transaction();
  }

  delete(id: string, userId: string): void {
    const existing = this.getById(id, userId);
    if (!existing) {
      throw new Error(`Todo '${id}' not found`);
    }

    // Check write permission (owner or editor)
    this.checkWritePermission(id, userId);

    // Soft delete
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE todos SET is_deleted = 1, updated_at = ?, status = 'archived' WHERE id = ?
    `).run(now, id);
  }

  restore(id: string, userId: string): TodoWithDependencies {
    const existing = this.getById(id, userId, true);
    if (!existing) {
      throw new Error(`Todo '${id}' not found`);
    }
    if (!existing.isDeleted) {
      throw new Error(`Todo '${id}' is not deleted`);
    }

    // Only owner can restore
    if (existing.userId !== userId) {
      throw new Error('Forbidden: only the owner can restore a todo');
    }

    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE todos SET is_deleted = 0, status = 'not_started', updated_at = ? WHERE id = ?
    `).run(now, id);

    return this.getById(id, userId)!;
  }

  // --- Sharing methods ---

  shareTodo(todoId: string, ownerId: string, sharedWithId: string, role: ShareRole): TodoShareWithUser {
    // Verify the owner actually owns this todo
    const todo = this.db.prepare('SELECT * FROM todos WHERE id = ? AND user_id = ?').get(todoId, ownerId) as any;
    if (!todo) {
      throw new Error(`Todo '${todoId}' not found or you are not the owner`);
    }

    // Cannot share with self
    if (ownerId === sharedWithId) {
      throw new Error('Cannot share a todo with yourself');
    }

    // Check if already shared
    const existing = this.db.prepare(
      'SELECT id FROM todo_shares WHERE todo_id = ? AND shared_with_id = ?'
    ).get(todoId, sharedWithId) as any;
    if (existing) {
      // Update the role
      this.db.prepare('UPDATE todo_shares SET role = ? WHERE id = ?').run(role, existing.id);
      return this.getShareById(existing.id)!;
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO todo_shares (id, todo_id, owner_id, shared_with_id, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, todoId, ownerId, sharedWithId, role, now);

    return this.getShareById(id)!;
  }

  removeTodoShare(shareId: string, userId: string): void {
    const share = this.getShareById(shareId);
    if (!share) {
      throw new Error(`Share '${shareId}' not found`);
    }
    // Only the owner can remove shares
    if (share.ownerId !== userId) {
      throw new Error('Forbidden: only the owner can remove shares');
    }
    this.db.prepare('DELETE FROM todo_shares WHERE id = ?').run(shareId);
  }

  getSharesForTodo(todoId: string, userId: string): TodoShareWithUser[] {
    // Verify user has access
    const todo = this.getById(todoId, userId);
    if (!todo) {
      throw new Error(`Todo '${todoId}' not found`);
    }
    const rows = this.db.prepare(`
      SELECT ts.*, u.username as shared_with_username, u.email as shared_with_email
      FROM todo_shares ts
      JOIN users u ON u.id = ts.shared_with_id
      WHERE ts.todo_id = ?
    `).all(todoId) as any[];

    return rows.map((row) => ({
      id: row.id,
      todoId: row.todo_id,
      ownerId: row.owner_id,
      sharedWithId: row.shared_with_id,
      sharedWithUsername: row.shared_with_username,
      sharedWithEmail: row.shared_with_email,
      role: row.role as ShareRole,
      createdAt: row.created_at,
    }));
  }

  /** Get the owner + all shared-with user IDs for a given todo (used for broadcasting) */
  getAffectedUserIds(todoId: string): string[] {
    const todo = this.db.prepare('SELECT user_id FROM todos WHERE id = ?').get(todoId) as any;
    if (!todo) return [];
    const shares = this.db.prepare(
      'SELECT shared_with_id FROM todo_shares WHERE todo_id = ?'
    ).all(todoId) as any[];
    return [todo.user_id, ...shares.map((s: any) => s.shared_with_id)];
  }

  private getShareById(id: string): TodoShareWithUser | null {
    const row = this.db.prepare(`
      SELECT ts.*, u.username as shared_with_username, u.email as shared_with_email
      FROM todo_shares ts
      JOIN users u ON u.id = ts.shared_with_id
      WHERE ts.id = ?
    `).get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      todoId: row.todo_id,
      ownerId: row.owner_id,
      sharedWithId: row.shared_with_id,
      sharedWithUsername: row.shared_with_username,
      sharedWithEmail: row.shared_with_email,
      role: row.role as ShareRole,
      createdAt: row.created_at,
    };
  }

  private checkWritePermission(todoId: string, userId: string): void {
    // Owner always has write access
    const isOwner = this.db.prepare(
      'SELECT id FROM todos WHERE id = ? AND user_id = ?'
    ).get(todoId, userId);
    if (isOwner) return;

    // Check if shared with editor role
    const share = this.db.prepare(
      'SELECT role FROM todo_shares WHERE todo_id = ? AND shared_with_id = ?'
    ).get(todoId, userId) as any;
    if (!share || share.role !== ShareRole.EDITOR) {
      throw new Error('Forbidden: you do not have permission to edit this todo');
    }
  }

  private createNextRecurrence(todo: TodoWithDependencies, userId: string): TodoWithDependencies {
    const nextDueDate = this.calculateNextDueDate(
      todo.dueDate,
      todo.recurrencePattern as RecurrencePattern,
      todo.recurrenceInterval
    );

    // Link to the original recurring task (or its root parent if this was already a child)
    const rootParentId = todo.parentRecurringId || todo.id;

    return this.create(
      {
        name: todo.name,
        description: todo.description,
        dueDate: nextDueDate,
        status: TodoStatus.NOT_STARTED,
        priority: todo.priority,
        recurrencePattern: todo.recurrencePattern as RecurrencePattern,
        recurrenceInterval: todo.recurrenceInterval,
        parentRecurringId: rootParentId,
      },
      userId
    );
  }

  private calculateNextDueDate(
    currentDueDate: string | null,
    pattern: RecurrencePattern,
    interval: number | null
  ): string | null {
    if (!currentDueDate) return null;

    const date = new Date(currentDueDate);

    switch (pattern) {
      case RecurrencePattern.DAILY:
        date.setDate(date.getDate() + 1);
        break;
      case RecurrencePattern.WEEKLY:
        date.setDate(date.getDate() + 7);
        break;
      case RecurrencePattern.MONTHLY:
        date.setMonth(date.getMonth() + 1);
        break;
      case RecurrencePattern.CUSTOM:
        date.setDate(date.getDate() + (interval || 1));
        break;
    }

    return date.toISOString();
  }

  private wouldCreateCycle(todoId: string, newDepId: string): boolean {
    // BFS from newDepId to see if we can reach todoId
    const visited = new Set<string>();
    const queue = [newDepId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === todoId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const deps = this.db
        .prepare('SELECT depends_on_id FROM todo_dependencies WHERE todo_id = ?')
        .all(current) as any[];
      for (const dep of deps) {
        queue.push(dep.depends_on_id);
      }
    }

    return false;
  }

  private enrichTodo(row: any, userId: string): TodoWithDependencies {
    const deps = this.db
      .prepare('SELECT depends_on_id FROM todo_dependencies WHERE todo_id = ?')
      .all(row.id) as any[];

    const dependsOn = deps.map((d: any) => d.depends_on_id);

    // Check if blocked: has any dependency that is not completed
    let isBlocked = false;
    if (dependsOn.length > 0) {
      const blockedCheck = this.db
        .prepare(
          `SELECT COUNT(*) as cnt FROM todo_dependencies td
           JOIN todos dep ON dep.id = td.depends_on_id
           WHERE td.todo_id = ? AND dep.status != 'completed' AND dep.is_deleted = 0`
        )
        .get(row.id) as any;
      isBlocked = blockedCheck.cnt > 0;
    }

    // Get shares for this todo
    const shares = this.db.prepare(`
      SELECT ts.*, u.username as shared_with_username, u.email as shared_with_email
      FROM todo_shares ts
      JOIN users u ON u.id = ts.shared_with_id
      WHERE ts.todo_id = ?
    `).all(row.id) as any[];

    const shareRole: ShareRole | 'owner' =
      row.share_role || (row.user_id === userId ? 'owner' : 'viewer');

    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      dueDate: row.due_date,
      status: row.status as TodoStatus,
      priority: row.priority as TodoPriority,
      recurrencePattern: row.recurrence_pattern as RecurrencePattern | null,
      recurrenceInterval: row.recurrence_interval,
      parentRecurringId: row.parent_recurring_id,
      version: row.version,
      isDeleted: Boolean(row.is_deleted),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      dependsOn,
      isBlocked,
      shares: shares.map((s: any) => ({
        id: s.id,
        todoId: s.todo_id,
        ownerId: s.owner_id,
        sharedWithId: s.shared_with_id,
        sharedWithUsername: s.shared_with_username,
        sharedWithEmail: s.shared_with_email,
        role: s.role as ShareRole,
        createdAt: s.created_at,
      })),
      shareRole,
    };
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class DependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DependencyError';
  }
}
