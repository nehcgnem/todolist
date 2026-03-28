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
} from '../types/todo';

export class TodoService {
  constructor(private db: Database.Database) {}

  create(input: CreateTodoInput): TodoWithDependencies {
    const id = uuidv4();
    const now = new Date().toISOString();

    const insertTodo = this.db.prepare(`
      INSERT INTO todos (id, name, description, due_date, status, priority,
        recurrence_pattern, recurrence_interval, parent_recurring_id, version, is_deleted, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
    `);

    const insertDep = this.db.prepare(`
      INSERT INTO todo_dependencies (todo_id, depends_on_id) VALUES (?, ?)
    `);

    const transaction = this.db.transaction(() => {
      insertTodo.run(
        id,
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
          // Verify dependency exists and is not deleted
          const dep = this.db.prepare('SELECT id FROM todos WHERE id = ? AND is_deleted = 0').get(depId) as any;
          if (!dep) {
            throw new Error(`Dependency todo '${depId}' not found`);
          }
          insertDep.run(id, depId);
        }
      }

      return this.getById(id)!;
    });

    return transaction();
  }

  getById(id: string, includeDeleted = false): TodoWithDependencies | null {
    const whereClause = includeDeleted ? '' : 'AND is_deleted = 0';
    const row = this.db.prepare(`SELECT * FROM todos WHERE id = ? ${whereClause}`).get(id) as any;
    if (!row) return null;

    return this.enrichTodo(row);
  }

  list(
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

    const data = rows.map((row) => this.enrichTodo(row));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  update(id: string, input: UpdateTodoInput): TodoWithDependencies {
    const existing = this.getById(id);
    if (!existing) {
      throw new Error(`Todo '${id}' not found`);
    }

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
        const updatedTodo = this.getById(id)!;
        if (updatedTodo.recurrencePattern) {
          this.createNextRecurrence(updatedTodo);
        }
      }

      return this.getById(id)!;
    });

    return transaction();
  }

  delete(id: string): void {
    const existing = this.getById(id);
    if (!existing) {
      throw new Error(`Todo '${id}' not found`);
    }

    // Soft delete
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE todos SET is_deleted = 1, updated_at = ?, status = 'archived' WHERE id = ?
    `).run(now, id);
  }

  restore(id: string): TodoWithDependencies {
    const existing = this.getById(id, true);
    if (!existing) {
      throw new Error(`Todo '${id}' not found`);
    }
    if (!existing.isDeleted) {
      throw new Error(`Todo '${id}' is not deleted`);
    }

    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE todos SET is_deleted = 0, status = 'not_started', updated_at = ? WHERE id = ?
    `).run(now, id);

    return this.getById(id)!;
  }

  private createNextRecurrence(todo: TodoWithDependencies): TodoWithDependencies {
    const nextDueDate = this.calculateNextDueDate(
      todo.dueDate,
      todo.recurrencePattern as RecurrencePattern,
      todo.recurrenceInterval
    );

    // Link to the original recurring task (or its root parent if this was already a child)
    const rootParentId = todo.parentRecurringId || todo.id;

    return this.create({
      name: todo.name,
      description: todo.description,
      dueDate: nextDueDate,
      status: TodoStatus.NOT_STARTED,
      priority: todo.priority,
      recurrencePattern: todo.recurrencePattern as RecurrencePattern,
      recurrenceInterval: todo.recurrenceInterval,
      parentRecurringId: rootParentId,
    });
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

  private enrichTodo(row: any): TodoWithDependencies {
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

    return {
      id: row.id,
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
