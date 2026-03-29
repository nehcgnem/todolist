import Database from 'better-sqlite3';
import path from 'path';

let db: Database.Database;

export function getDb(dbPath?: string): Database.Database {
  if (!db) {
    const resolvedPath = dbPath || path.join(process.cwd(), 'data', 'todos.db');
    db = new Database(resolvedPath);
    db.pragma('journal_mode = WAL'); // better concurrent read performance
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
  }
  return db;
}

export function createTestDb(): Database.Database {
  const testDb = new Database(':memory:');
  testDb.pragma('foreign_keys = ON');
  initializeSchema(testDb);
  return testDb;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = undefined as any;
  }
}

function initializeSchema(database: Database.Database): void {
  database.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

    -- Todos table (with user_id owner)
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

    -- Sharing: share individual todos with other users
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

    CREATE INDEX IF NOT EXISTS idx_todo_shares_todo ON todo_shares(todo_id);
    CREATE INDEX IF NOT EXISTS idx_todo_shares_shared_with ON todo_shares(shared_with_id);
    CREATE INDEX IF NOT EXISTS idx_todo_shares_owner ON todo_shares(owner_id);

    CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id) WHERE is_deleted = 0;
    CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status) WHERE is_deleted = 0;
    CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority) WHERE is_deleted = 0;
    CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date) WHERE is_deleted = 0;
    CREATE INDEX IF NOT EXISTS idx_todos_is_deleted ON todos(is_deleted);
    CREATE INDEX IF NOT EXISTS idx_todos_parent_recurring ON todos(parent_recurring_id);
  `);
}
