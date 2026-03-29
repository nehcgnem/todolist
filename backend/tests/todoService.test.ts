import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { TodoService, ConflictError, DependencyError } from '../src/services/todoService';
import { TodoStatus, TodoPriority, RecurrencePattern } from '../src/types/todo';
import { v4 as uuidv4 } from 'uuid';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
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
      FOREIGN KEY (user_id) REFERENCES users(id),
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

    CREATE TABLE IF NOT EXISTS todo_shares (
      id TEXT PRIMARY KEY,
      todo_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      shared_with_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer'
        CHECK(role IN ('viewer', 'editor')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
      FOREIGN KEY (owner_id) REFERENCES users(id),
      FOREIGN KEY (shared_with_id) REFERENCES users(id),
      UNIQUE(todo_id, shared_with_id)
    );

    CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status) WHERE is_deleted = 0;
    CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority) WHERE is_deleted = 0;
    CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date) WHERE is_deleted = 0;
    CREATE INDEX IF NOT EXISTS idx_todos_is_deleted ON todos(is_deleted);
  `);
  return db;
}

function createTestUser(db: Database.Database, username: string = 'testuser'): string {
  const userId = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, email, username, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(userId, `${username}@test.com`, username, 'fakehash', now, now);
  return userId;
}

describe('TodoService', () => {
  let db: Database.Database;
  let service: TodoService;
  let userId: string;

  beforeEach(() => {
    db = createTestDb();
    service = new TodoService(db);
    userId = createTestUser(db);
  });

  describe('CRUD Operations', () => {
    it('should create a todo with defaults', () => {
      const todo = service.create({ name: 'Test Task' }, userId);
      expect(todo.name).toBe('Test Task');
      expect(todo.status).toBe(TodoStatus.NOT_STARTED);
      expect(todo.priority).toBe(TodoPriority.MEDIUM);
      expect(todo.version).toBe(1);
      expect(todo.isDeleted).toBe(false);
      expect(todo.dependsOn).toEqual([]);
      expect(todo.isBlocked).toBe(false);
      expect(todo.userId).toBe(userId);
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
      }, userId);

      expect(todo.name).toBe('Full Task');
      expect(todo.description).toBe('A complete task');
      expect(todo.dueDate).toBe(dueDate);
      expect(todo.status).toBe(TodoStatus.IN_PROGRESS);
      expect(todo.priority).toBe(TodoPriority.HIGH);
      expect(todo.recurrencePattern).toBe(RecurrencePattern.WEEKLY);
    });

    it('should get a todo by id', () => {
      const created = service.create({ name: 'Get Me' }, userId);
      const found = service.getById(created.id, userId);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Get Me');
    });

    it('should return null for non-existent id', () => {
      const found = service.getById('non-existent', userId);
      expect(found).toBeNull();
    });

    it('should update a todo', () => {
      const created = service.create({ name: 'Original' }, userId);
      const updated = service.update(created.id, {
        name: 'Updated',
        priority: TodoPriority.HIGH,
        version: created.version,
      }, userId);

      expect(updated.name).toBe('Updated');
      expect(updated.priority).toBe(TodoPriority.HIGH);
      expect(updated.version).toBe(2);
    });

    it('should soft delete a todo', () => {
      const created = service.create({ name: 'Delete Me' }, userId);
      service.delete(created.id, userId);

      // Should not find when not including deleted
      const notFound = service.getById(created.id, userId);
      expect(notFound).toBeNull();

      // Should find when including deleted
      const found = service.getById(created.id, userId, true);
      expect(found).not.toBeNull();
      expect(found!.isDeleted).toBe(true);
    });

    it('should restore a soft-deleted todo', () => {
      const created = service.create({ name: 'Restore Me' }, userId);
      service.delete(created.id, userId);
      const restored = service.restore(created.id, userId);

      expect(restored.isDeleted).toBe(false);
      expect(restored.status).toBe(TodoStatus.NOT_STARTED);
    });

    it('should throw when deleting non-existent todo', () => {
      expect(() => service.delete('non-existent', userId)).toThrow('not found');
    });

    it('should throw when restoring non-deleted todo', () => {
      const created = service.create({ name: 'Not Deleted' }, userId);
      expect(() => service.restore(created.id, userId)).toThrow('not deleted');
    });
  });

  describe('User Isolation', () => {
    it('should not allow user to see other user\'s todos', () => {
      const otherUserId = createTestUser(db, 'other');
      service.create({ name: 'My Task' }, userId);
      service.create({ name: 'Other Task' }, otherUserId);

      const myList = service.list(userId);
      expect(myList.data.length).toBe(1);
      expect(myList.data[0].name).toBe('My Task');

      const otherList = service.list(otherUserId);
      expect(otherList.data.length).toBe(1);
      expect(otherList.data[0].name).toBe('Other Task');
    });

    it('should not allow user to access other user\'s todo by id', () => {
      const otherUserId = createTestUser(db, 'other');
      const otherTodo = service.create({ name: 'Private Task' }, otherUserId);

      const found = service.getById(otherTodo.id, userId);
      expect(found).toBeNull();
    });
  });

  describe('Sharing', () => {
    it('should share a todo with another user', () => {
      const otherUserId = createTestUser(db, 'other');
      const todo = service.create({ name: 'Shared Task' }, userId);

      const share = service.shareTodo(todo.id, userId, otherUserId, 'viewer' as any);
      expect(share.sharedWithId).toBe(otherUserId);
      expect(share.role).toBe('viewer');
    });

    it('should allow shared user to see the todo', () => {
      const otherUserId = createTestUser(db, 'other');
      const todo = service.create({ name: 'Shared Task' }, userId);
      service.shareTodo(todo.id, userId, otherUserId, 'viewer' as any);

      const found = service.getById(todo.id, otherUserId);
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Shared Task');
    });

    it('should include shared todos in list', () => {
      const otherUserId = createTestUser(db, 'other');
      const todo = service.create({ name: 'Shared Task' }, userId);
      service.shareTodo(todo.id, userId, otherUserId, 'viewer' as any);

      const list = service.list(otherUserId);
      expect(list.data.length).toBe(1);
      expect(list.data[0].name).toBe('Shared Task');
    });

    it('should not allow viewer to edit todo', () => {
      const otherUserId = createTestUser(db, 'viewer');
      const todo = service.create({ name: 'View Only' }, userId);
      service.shareTodo(todo.id, userId, otherUserId, 'viewer' as any);

      expect(() =>
        service.update(todo.id, { name: 'Hacked', version: todo.version }, otherUserId)
      ).toThrow(/permission|Forbidden/);
    });

    it('should allow editor to edit todo', () => {
      const otherUserId = createTestUser(db, 'editor');
      const todo = service.create({ name: 'Editable' }, userId);
      service.shareTodo(todo.id, userId, otherUserId, 'editor' as any);

      const updated = service.update(todo.id, { name: 'Edited', version: todo.version }, otherUserId);
      expect(updated.name).toBe('Edited');
    });

    it('should remove a share', () => {
      const otherUserId = createTestUser(db, 'other');
      const todo = service.create({ name: 'Unshare Me' }, userId);
      const share = service.shareTodo(todo.id, userId, otherUserId, 'viewer' as any);

      service.removeTodoShare(share.id, userId);

      const found = service.getById(todo.id, otherUserId);
      expect(found).toBeNull();
    });
  });

  describe('Optimistic Locking', () => {
    it('should reject updates with stale version', () => {
      const created = service.create({ name: 'Locking Test' }, userId);

      // First update succeeds
      service.update(created.id, { name: 'Updated Once', version: 1 }, userId);

      // Second update with old version fails
      expect(() =>
        service.update(created.id, { name: 'Stale Update', version: 1 }, userId)
      ).toThrow(ConflictError);
    });

    it('should succeed with correct version', () => {
      const created = service.create({ name: 'Version Test' }, userId);
      const updated1 = service.update(created.id, { name: 'V2', version: 1 }, userId);
      const updated2 = service.update(created.id, { name: 'V3', version: updated1.version }, userId);
      expect(updated2.version).toBe(3);
    });
  });

  describe('Task Dependencies', () => {
    it('should create a todo with dependencies', () => {
      const dep = service.create({ name: 'Dependency' }, userId);
      const todo = service.create({ name: 'Dependent', dependsOn: [dep.id] }, userId);

      expect(todo.dependsOn).toContain(dep.id);
      expect(todo.isBlocked).toBe(true);
    });

    it('should unblock when dependency is completed', () => {
      const dep = service.create({ name: 'Dependency' }, userId);
      const todo = service.create({ name: 'Dependent', dependsOn: [dep.id] }, userId);

      // Complete the dependency
      service.update(dep.id, { status: TodoStatus.COMPLETED, version: dep.version }, userId);

      // Refetch dependent
      const refreshed = service.getById(todo.id, userId)!;
      expect(refreshed.isBlocked).toBe(false);
    });

    it('should prevent moving blocked task to in_progress', () => {
      const dep = service.create({ name: 'Blocker' }, userId);
      const todo = service.create({ name: 'Blocked', dependsOn: [dep.id] }, userId);

      expect(() =>
        service.update(todo.id, { status: TodoStatus.IN_PROGRESS, version: todo.version }, userId)
      ).toThrow(DependencyError);
    });

    it('should allow moving unblocked task to in_progress', () => {
      const dep = service.create({ name: 'Dependency' }, userId);
      const todo = service.create({ name: 'Dependent', dependsOn: [dep.id] }, userId);

      // Complete dependency first
      service.update(dep.id, { status: TodoStatus.COMPLETED, version: dep.version }, userId);

      // Now can start the dependent task
      const updated = service.update(todo.id, {
        status: TodoStatus.IN_PROGRESS,
        version: todo.version,
      }, userId);
      expect(updated.status).toBe(TodoStatus.IN_PROGRESS);
    });

    it('should detect circular dependencies', () => {
      const a = service.create({ name: 'A' }, userId);
      const b = service.create({ name: 'B', dependsOn: [a.id] }, userId);

      // Trying to make A depend on B should fail (cycle: A -> B -> A)
      expect(() =>
        service.update(a.id, { dependsOn: [b.id], version: a.version }, userId)
      ).toThrow('circular dependency');
    });

    it('should throw when dependency does not exist', () => {
      expect(() =>
        service.create({ name: 'Bad Dep', dependsOn: ['non-existent-id'] }, userId)
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
      }, userId);

      // Complete it
      service.update(todo.id, { status: TodoStatus.COMPLETED, version: todo.version }, userId);

      // A new todo should have been created
      const list = service.list(userId);
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
      }, userId);

      service.update(todo.id, { status: TodoStatus.COMPLETED, version: todo.version }, userId);

      const list = service.list(userId);
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
      }, userId);

      service.update(todo.id, { status: TodoStatus.COMPLETED, version: todo.version }, userId);

      const list = service.list(userId);
      const next = list.data.find(
        (t) => t.name === 'Every 3 Days' && t.status === TodoStatus.NOT_STARTED
      );
      expect(next).toBeTruthy();

      const diffDays =
        (new Date(next!.dueDate!).getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBe(3);
    });

    it('should not create recurrence for non-recurring tasks', () => {
      const todo = service.create({ name: 'One-time Task' }, userId);
      service.update(todo.id, { status: TodoStatus.COMPLETED, version: todo.version }, userId);

      const list = service.list(userId);
      expect(list.data.length).toBe(1);
    });
  });

  describe('Filtering and Sorting', () => {
    beforeEach(() => {
      service.create({ name: 'High Priority', priority: TodoPriority.HIGH, status: TodoStatus.IN_PROGRESS }, userId);
      service.create({ name: 'Low Priority', priority: TodoPriority.LOW }, userId);
      service.create({
        name: 'Due Soon',
        dueDate: new Date('2025-06-01T00:00:00.000Z').toISOString(),
        priority: TodoPriority.MEDIUM,
      }, userId);
      service.create({
        name: 'Due Later',
        dueDate: new Date('2025-12-01T00:00:00.000Z').toISOString(),
      }, userId);
    });

    it('should filter by status', () => {
      const result = service.list(userId, { status: TodoStatus.IN_PROGRESS });
      expect(result.data.length).toBe(1);
      expect(result.data[0].name).toBe('High Priority');
    });

    it('should filter by priority', () => {
      const result = service.list(userId, { priority: TodoPriority.LOW });
      expect(result.data.length).toBe(1);
      expect(result.data[0].name).toBe('Low Priority');
    });

    it('should filter by due date range', () => {
      const result = service.list(userId, {
        dueDateFrom: '2025-05-01',
        dueDateTo: '2025-07-01',
      });
      expect(result.data.length).toBe(1);
      expect(result.data[0].name).toBe('Due Soon');
    });

    it('should filter by search term', () => {
      const result = service.list(userId, { search: 'High' });
      expect(result.data.length).toBe(1);
      expect(result.data[0].name).toBe('High Priority');
    });

    it('should sort by priority', () => {
      const result = service.list(
        userId,
        {},
        { field: 'priority', direction: 'asc' }
      );
      expect(result.data[0].priority).toBe(TodoPriority.HIGH);
      expect(result.data[result.data.length - 1].priority).toBe(TodoPriority.LOW);
    });

    it('should sort by name', () => {
      const result = service.list(
        userId,
        {},
        { field: 'name', direction: 'asc' }
      );
      const names = result.data.map((t) => t.name);
      const sorted = [...names].sort();
      expect(names).toEqual(sorted);
    });

    it('should filter by dependency status (blocked/unblocked)', () => {
      const blocker = service.create({ name: 'Blocker Task' }, userId);
      service.create({ name: 'Blocked Task', dependsOn: [blocker.id] }, userId);

      const blocked = service.list(userId, { dependencyStatus: 'blocked' });
      expect(blocked.data.length).toBe(1);
      expect(blocked.data[0].name).toBe('Blocked Task');

      // All others should be unblocked
      const unblocked = service.list(userId, { dependencyStatus: 'unblocked' });
      expect(unblocked.data.every((t) => !t.isBlocked)).toBe(true);
    });

    it('should paginate results', () => {
      const result = service.list(userId, {}, undefined, { page: 1, limit: 2 });
      expect(result.data.length).toBe(2);
      expect(result.total).toBe(4);
      expect(result.totalPages).toBe(2);

      const page2 = service.list(userId, {}, undefined, { page: 2, limit: 2 });
      expect(page2.data.length).toBe(2);
      expect(page2.page).toBe(2);
    });

    it('should not include deleted items by default', () => {
      const todo = service.create({ name: 'Will Delete' }, userId);
      service.delete(todo.id, userId);

      const result = service.list(userId);
      expect(result.data.find((t) => t.name === 'Will Delete')).toBeUndefined();
    });

    it('should include deleted items when requested', () => {
      const todo = service.create({ name: 'Was Deleted' }, userId);
      service.delete(todo.id, userId);

      const result = service.list(userId, { includeDeleted: true });
      expect(result.data.find((t) => t.name === 'Was Deleted')).toBeTruthy();
    });
  });
});
