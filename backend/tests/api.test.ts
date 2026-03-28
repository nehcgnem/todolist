import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../src/app';

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

describe('API Integration Tests', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    const db = createTestDb();
    app = createApp(db);
  });

  describe('POST /api/todos', () => {
    it('should create a todo', async () => {
      const res = await request(app)
        .post('/api/todos')
        .send({ name: 'Test Task' })
        .expect(201);

      expect(res.body.name).toBe('Test Task');
      expect(res.body.id).toBeTruthy();
      expect(res.body.status).toBe('not_started');
      expect(res.body.version).toBe(1);
    });

    it('should reject empty name', async () => {
      const res = await request(app)
        .post('/api/todos')
        .send({ name: '' })
        .expect(400);

      expect(res.body.error).toBe('Validation Error');
    });

    it('should reject missing name', async () => {
      const res = await request(app)
        .post('/api/todos')
        .send({ description: 'no name' })
        .expect(400);

      expect(res.body.error).toBe('Validation Error');
    });

    it('should create with all fields', async () => {
      const res = await request(app)
        .post('/api/todos')
        .send({
          name: 'Full Task',
          description: 'Description',
          dueDate: '2025-12-31T23:59:59.000Z',
          priority: 'high',
          recurrencePattern: 'weekly',
        })
        .expect(201);

      expect(res.body.priority).toBe('high');
      expect(res.body.recurrencePattern).toBe('weekly');
    });
  });

  describe('GET /api/todos', () => {
    it('should return paginated list', async () => {
      await request(app).post('/api/todos').send({ name: 'Task 1' });
      await request(app).post('/api/todos').send({ name: 'Task 2' });

      const res = await request(app)
        .get('/api/todos')
        .expect(200);

      expect(res.body.data.length).toBe(2);
      expect(res.body.total).toBe(2);
      expect(res.body.page).toBe(1);
    });

    it('should filter by status', async () => {
      await request(app).post('/api/todos').send({ name: 'Task 1', status: 'in_progress' });
      await request(app).post('/api/todos').send({ name: 'Task 2' });

      const res = await request(app)
        .get('/api/todos?status=in_progress')
        .expect(200);

      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Task 1');
    });

    it('should filter by priority', async () => {
      await request(app).post('/api/todos').send({ name: 'High', priority: 'high' });
      await request(app).post('/api/todos').send({ name: 'Low', priority: 'low' });

      const res = await request(app)
        .get('/api/todos?priority=high')
        .expect(200);

      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('High');
    });

    it('should sort by name', async () => {
      await request(app).post('/api/todos').send({ name: 'Bravo' });
      await request(app).post('/api/todos').send({ name: 'Alpha' });

      const res = await request(app)
        .get('/api/todos?sortField=name&sortDirection=asc')
        .expect(200);

      expect(res.body.data[0].name).toBe('Alpha');
      expect(res.body.data[1].name).toBe('Bravo');
    });

    it('should search by name', async () => {
      await request(app).post('/api/todos').send({ name: 'Buy groceries' });
      await request(app).post('/api/todos').send({ name: 'Write code' });

      const res = await request(app)
        .get('/api/todos?search=groceries')
        .expect(200);

      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Buy groceries');
    });

    it('should paginate', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app).post('/api/todos').send({ name: `Task ${i}` });
      }

      const res = await request(app)
        .get('/api/todos?page=1&limit=2')
        .expect(200);

      expect(res.body.data.length).toBe(2);
      expect(res.body.total).toBe(5);
      expect(res.body.totalPages).toBe(3);
    });
  });

  describe('GET /api/todos/:id', () => {
    it('should get a specific todo', async () => {
      const created = await request(app).post('/api/todos').send({ name: 'Find Me' });

      const res = await request(app)
        .get(`/api/todos/${created.body.id}`)
        .expect(200);

      expect(res.body.name).toBe('Find Me');
    });

    it('should return 404 for non-existent id', async () => {
      await request(app)
        .get('/api/todos/non-existent')
        .expect(404);
    });
  });

  describe('PUT /api/todos/:id', () => {
    it('should update a todo', async () => {
      const created = await request(app).post('/api/todos').send({ name: 'Original' });

      const res = await request(app)
        .put(`/api/todos/${created.body.id}`)
        .send({ name: 'Updated', version: 1 })
        .expect(200);

      expect(res.body.name).toBe('Updated');
      expect(res.body.version).toBe(2);
    });

    it('should reject update without version', async () => {
      const created = await request(app).post('/api/todos').send({ name: 'Original' });

      await request(app)
        .put(`/api/todos/${created.body.id}`)
        .send({ name: 'Updated' })
        .expect(400);
    });

    it('should return 409 on version conflict', async () => {
      const created = await request(app).post('/api/todos').send({ name: 'Conflict Test' });

      // First update
      await request(app)
        .put(`/api/todos/${created.body.id}`)
        .send({ name: 'V2', version: 1 })
        .expect(200);

      // Second update with stale version
      await request(app)
        .put(`/api/todos/${created.body.id}`)
        .send({ name: 'Stale', version: 1 })
        .expect(409);
    });

    it('should return 422 when trying to start blocked task', async () => {
      const dep = await request(app).post('/api/todos').send({ name: 'Blocker' });
      const task = await request(app)
        .post('/api/todos')
        .send({ name: 'Blocked', dependsOn: [dep.body.id] });

      await request(app)
        .put(`/api/todos/${task.body.id}`)
        .send({ status: 'in_progress', version: 1 })
        .expect(422);
    });
  });

  describe('DELETE /api/todos/:id', () => {
    it('should soft delete a todo', async () => {
      const created = await request(app).post('/api/todos').send({ name: 'Delete Me' });

      await request(app)
        .delete(`/api/todos/${created.body.id}`)
        .expect(204);

      // Should not appear in list
      const list = await request(app).get('/api/todos').expect(200);
      expect(list.body.data.find((t: any) => t.id === created.body.id)).toBeUndefined();
    });

    it('should return 404 for non-existent todo', async () => {
      await request(app)
        .delete('/api/todos/non-existent')
        .expect(404);
    });
  });

  describe('POST /api/todos/:id/restore', () => {
    it('should restore a deleted todo', async () => {
      const created = await request(app).post('/api/todos').send({ name: 'Restore Me' });
      await request(app).delete(`/api/todos/${created.body.id}`);

      const res = await request(app)
        .post(`/api/todos/${created.body.id}/restore`)
        .expect(200);

      expect(res.body.isDeleted).toBe(false);
    });
  });

  describe('Recurring Tasks via API', () => {
    it('should auto-create next occurrence when completing recurring task', async () => {
      const created = await request(app)
        .post('/api/todos')
        .send({
          name: 'Recurring Task',
          dueDate: '2025-06-15T10:00:00.000Z',
          recurrencePattern: 'daily',
        });

      await request(app)
        .put(`/api/todos/${created.body.id}`)
        .send({ status: 'completed', version: 1 });

      const list = await request(app).get('/api/todos').expect(200);
      const nextOccurrence = list.body.data.find(
        (t: any) => t.name === 'Recurring Task' && t.status === 'not_started'
      );
      expect(nextOccurrence).toBeTruthy();
    });
  });

  describe('Health Check', () => {
    it('should return ok', async () => {
      const res = await request(app).get('/api/health').expect(200);
      expect(res.body.status).toBe('ok');
    });
  });
});
