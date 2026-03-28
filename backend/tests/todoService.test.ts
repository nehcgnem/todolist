import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { TodoService, ConflictError, DependencyError } from '../src/services/todoService';
import { TodoStatus, TodoPriority, RecurrencePattern } from '../src/types/todo';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'not_started'
        CHECK(status IN ('not_started', 'in_progress', 'completed', 'archived')),
      priority TEXT NOT NULL DEFAULT 'medium'
        CHECK(priority IN ('low', 'medium', 'high')),
      recurrence_pattern TEXT
        CHECK(recurrence_pattern IN ('daily', 'weekly', 'monthly', 'custom') OR recurrence_pattern IS NULL),
      recurrence_interval INTEGER,
      parent_recurring_id TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (parent_recurring_id) REFERENCES todos(id)
    );

    CREATE TABLE IF NOT EXISTS todo_dependencies (
      todo_id TEXT NOT NULL,
      depends_on_id TEXT NOT NULL,
      PRIMARY KEY (todo_id, depends_on_id),
      FOREIGN KEY (todo_id) REFERENCES todos(id),
      FOREIGN KEY (depends_on_id) REFERENCES todos(id),
      CHECK(todo_id != depends_on_id)
    );

    CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status) WHERE is_deleted = 0;
    CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority) WHERE is_deleted = 0;
    CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date) WHERE is_deleted = 0;
    CREATE INDEX IF NOT EXISTS idx_todos_is_deleted ON todos(is_deleted);
  `);
  return db;
}

describe('TodoService', () => {
  let db: Database.Database;
  let service: TodoService;

  beforeEach(() => {
    db = createTestDb();
    service = new TodoService(db);
  });

  describe('CRUD Operations', () => {
    it('should create a todo with defaults', () => {
      const todo = service.create({ name: 'Test Task' });
      expect(todo.name).toBe('Test Task');
      expect(todo.status).toBe(TodoStatus.NOT_STARTED);
      expect(todo.priority).toBe(TodoPriority.MEDIUM);
      expect(todo.version).toBe(1);
      expect(todo.isDeleted).toBe(false);
      expect(todo.dependsOn).toEqual([]);
      expect(todo.isBlocked).toBe(false);
    });

    it('should create a todo with all fields', () => {
      const dueDate = new Date('2025-12-31T23:59:59.000Z').toISOString();
      const todo = service.create({
        name: 'Full Task',
        description: 'A complete task',
        dueDate,
        status: TodoStatus.IN_PROGRESS,
        priority: TodoPriority.HIGH,
        recurrencePattern: RecurrencePattern.WEEKLY,
      });

      expect(todo.name).toBe('Full Task');
      expect(todo.description).toBe('A complete task');
      expect(todo.dueDate).toBe(dueDate);
      expect(todo.status).toBe(TodoStatus.IN_PROGRESS);
      expect(todo.priority).toBe(TodoPriority.HIGH);
      expect(todo.recurrencePattern).toBe(RecurrencePattern.WEEKLY);
    });

    it('should get a todo by id', () => {
      const created = service.create({ name: 'Get Me' });
      const found = service.getById(created.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Get Me');
    });

    it('should return null for non-existent id', () => {
      const found = service.getById('non-existent');
      expect(found).toBeNull();
    });

    it('should update a todo', () => {
      const created = service.create({ name: 'Original' });
      const updated = service.update(created.id, {
        name: 'Updated',
        priority: TodoPriority.HIGH,
        version: created.version,
      });

      expect(updated.name).toBe('Updated');
      expect(updated.priority).toBe(TodoPriority.HIGH);
      expect(updated.version).toBe(2);
    });

    it('should soft delete a todo', () => {
      const created = service.create({ name: 'Delete Me' });
      service.delete(created.id);

      // Should not find when not including deleted
      const notFound = service.getById(created.id);
      expect(notFound).toBeNull();

      // Should find when including deleted
      const found = service.getById(created.id, true);
      expect(found).not.toBeNull();
      expect(found!.isDeleted).toBe(true);
    });

    it('should restore a soft-deleted todo', () => {
      const created = service.create({ name: 'Restore Me' });
      service.delete(created.id);
      const restored = service.restore(created.id);

      expect(restored.isDeleted).toBe(false);
      expect(restored.status).toBe(TodoStatus.NOT_STARTED);
    });

    it('should throw when deleting non-existent todo', () => {
      expect(() => service.delete('non-existent')).toThrow('not found');
    });

    it('should throw when restoring non-deleted todo', () => {
      const created = service.create({ name: 'Not Deleted' });
      expect(() => service.restore(created.id)).toThrow('not deleted');
    });
  });

  describe('Optimistic Locking', () => {
    it('should reject updates with stale version', () => {
      const created = service.create({ name: 'Locking Test' });

      // First update succeeds
      service.update(created.id, { name: 'Updated Once', version: 1 });

      // Second update with old version fails
      expect(() =>
        service.update(created.id, { name: 'Stale Update', version: 1 })
      ).toThrow(ConflictError);
    });

    it('should succeed with correct version', () => {
      const created = service.create({ name: 'Version Test' });
      const updated1 = service.update(created.id, { name: 'V2', version: 1 });
      const updated2 = service.update(created.id, { name: 'V3', version: updated1.version });
      expect(updated2.version).toBe(3);
    });
  });

  describe('Task Dependencies', () => {
    it('should create a todo with dependencies', () => {
      const dep = service.create({ name: 'Dependency' });
      const todo = service.create({ name: 'Dependent', dependsOn: [dep.id] });

      expect(todo.dependsOn).toContain(dep.id);
      expect(todo.isBlocked).toBe(true);
    });

    it('should unblock when dependency is completed', () => {
      const dep = service.create({ name: 'Dependency' });
      const todo = service.create({ name: 'Dependent', dependsOn: [dep.id] });

      // Complete the dependency
      service.update(dep.id, { status: TodoStatus.COMPLETED, version: dep.version });

      // Refetch dependent
      const refreshed = service.getById(todo.id)!;
      expect(refreshed.isBlocked).toBe(false);
    });

    it('should prevent moving blocked task to in_progress', () => {
      const dep = service.create({ name: 'Blocker' });
      const todo = service.create({ name: 'Blocked', dependsOn: [dep.id] });

      expect(() =>
        service.update(todo.id, { status: TodoStatus.IN_PROGRESS, version: todo.version })
      ).toThrow(DependencyError);
    });

    it('should allow moving unblocked task to in_progress', () => {
      const dep = service.create({ name: 'Dependency' });
      const todo = service.create({ name: 'Dependent', dependsOn: [dep.id] });

      // Complete dependency first
      service.update(dep.id, { status: TodoStatus.COMPLETED, version: dep.version });

      // Now can start the dependent task
      const updated = service.update(todo.id, {
        status: TodoStatus.IN_PROGRESS,
        version: todo.version,
      });
      expect(updated.status).toBe(TodoStatus.IN_PROGRESS);
    });

    it('should detect circular dependencies', () => {
      const a = service.create({ name: 'A' });
      const b = service.create({ name: 'B', dependsOn: [a.id] });

      // Trying to make A depend on B should fail (cycle: A -> B -> A)
      expect(() =>
        service.update(a.id, { dependsOn: [b.id], version: a.version })
      ).toThrow('circular dependency');
    });

    it('should throw when dependency does not exist', () => {
      expect(() =>
        service.create({ name: 'Bad Dep', dependsOn: ['non-existent-id'] })
      ).toThrow('not found');
    });
  });

  describe('Recurring Tasks', () => {
    it('should create next occurrence when completing a recurring task', () => {
      const dueDate = new Date('2025-06-15T10:00:00.000Z').toISOString();
      const todo = service.create({
        name: 'Daily Standup',
        dueDate,
        recurrencePattern: RecurrencePattern.DAILY,
      });

      // Complete it
      service.update(todo.id, { status: TodoStatus.COMPLETED, version: todo.version });

      // A new todo should have been created
      const list = service.list();
      const notStarted = list.data.filter(
        (t) => t.name === 'Daily Standup' && t.status === TodoStatus.NOT_STARTED
      );
      expect(notStarted.length).toBe(1);

      // Next due date should be 1 day later
      const nextDue = new Date(notStarted[0].dueDate!);
      const originalDue = new Date(dueDate);
      const diffDays = (nextDue.getTime() - originalDue.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(1);
    });

    it('should handle weekly recurrence', () => {
      const dueDate = new Date('2025-06-15T10:00:00.000Z').toISOString();
      const todo = service.create({
        name: 'Weekly Review',
        dueDate,
        recurrencePattern: RecurrencePattern.WEEKLY,
      });

      service.update(todo.id, { status: TodoStatus.COMPLETED, version: todo.version });

      const list = service.list();
      const next = list.data.find(
        (t) => t.name === 'Weekly Review' && t.status === TodoStatus.NOT_STARTED
      );
      expect(next).toBeTruthy();

      const diffDays =
        (new Date(next!.dueDate!).getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(7);
    });

    it('should handle custom recurrence interval', () => {
      const dueDate = new Date('2025-06-15T10:00:00.000Z').toISOString();
      const todo = service.create({
        name: 'Every 3 Days',
        dueDate,
        recurrencePattern: RecurrencePattern.CUSTOM,
        recurrenceInterval: 3,
      });

      service.update(todo.id, { status: TodoStatus.COMPLETED, version: todo.version });

      const list = service.list();
      const next = list.data.find(
        (t) => t.name === 'Every 3 Days' && t.status === TodoStatus.NOT_STARTED
      );
      expect(next).toBeTruthy();

      const diffDays =
        (new Date(next!.dueDate!).getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(3);
    });

    it('should not create recurrence for non-recurring tasks', () => {
      const todo = service.create({ name: 'One-time Task' });
      service.update(todo.id, { status: TodoStatus.COMPLETED, version: todo.version });

      const list = service.list();
      expect(list.data.length).toBe(1);
    });
  });

  describe('Filtering and Sorting', () => {
    beforeEach(() => {
      service.create({ name: 'High Priority', priority: TodoPriority.HIGH, status: TodoStatus.IN_PROGRESS });
      service.create({ name: 'Low Priority', priority: TodoPriority.LOW });
      service.create({
        name: 'Due Soon',
        dueDate: new Date('2025-06-01T00:00:00.000Z').toISOString(),
        priority: TodoPriority.MEDIUM,
      });
      service.create({
        name: 'Due Later',
        dueDate: new Date('2025-12-01T00:00:00.000Z').toISOString(),
      });
    });

    it('should filter by status', () => {
      const result = service.list({ status: TodoStatus.IN_PROGRESS });
      expect(result.data.length).toBe(1);
      expect(result.data[0].name).toBe('High Priority');
    });

    it('should filter by priority', () => {
      const result = service.list({ priority: TodoPriority.LOW });
      expect(result.data.length).toBe(1);
      expect(result.data[0].name).toBe('Low Priority');
    });

    it('should filter by due date range', () => {
      const result = service.list({
        dueDateFrom: '2025-05-01',
        dueDateTo: '2025-07-01',
      });
      expect(result.data.length).toBe(1);
      expect(result.data[0].name).toBe('Due Soon');
    });

    it('should filter by search term', () => {
      const result = service.list({ search: 'High' });
      expect(result.data.length).toBe(1);
      expect(result.data[0].name).toBe('High Priority');
    });

    it('should sort by priority', () => {
      const result = service.list(
        {},
        { field: 'priority', direction: 'asc' }
      );
      expect(result.data[0].priority).toBe(TodoPriority.HIGH);
      expect(result.data[result.data.length - 1].priority).toBe(TodoPriority.LOW);
    });

    it('should sort by name', () => {
      const result = service.list(
        {},
        { field: 'name', direction: 'asc' }
      );
      const names = result.data.map((t) => t.name);
      const sorted = [...names].sort();
      expect(names).toEqual(sorted);
    });

    it('should filter by dependency status (blocked/unblocked)', () => {
      const blocker = service.create({ name: 'Blocker Task' });
      service.create({ name: 'Blocked Task', dependsOn: [blocker.id] });

      const blocked = service.list({ dependencyStatus: 'blocked' });
      expect(blocked.data.length).toBe(1);
      expect(blocked.data[0].name).toBe('Blocked Task');

      // All others should be unblocked
      const unblocked = service.list({ dependencyStatus: 'unblocked' });
      expect(unblocked.data.every((t) => !t.isBlocked)).toBe(true);
    });

    it('should paginate results', () => {
      const result = service.list({}, undefined, { page: 1, limit: 2 });
      expect(result.data.length).toBe(2);
      expect(result.total).toBe(4);
      expect(result.totalPages).toBe(2);

      const page2 = service.list({}, undefined, { page: 2, limit: 2 });
      expect(page2.data.length).toBe(2);
      expect(page2.page).toBe(2);
    });

    it('should not include deleted items by default', () => {
      const todo = service.create({ name: 'Will Delete' });
      service.delete(todo.id);

      const result = service.list();
      expect(result.data.find((t) => t.name === 'Will Delete')).toBeUndefined();
    });

    it('should include deleted items when requested', () => {
      const todo = service.create({ name: 'Was Deleted' });
      service.delete(todo.id);

      const result = service.list({ includeDeleted: true });
      expect(result.data.find((t) => t.name === 'Was Deleted')).toBeTruthy();
    });
  });
});
