import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { User, UserPublic, RegisterInput, LoginInput, AuthTokenPayload } from '../types/todo';

const JWT_SECRET = process.env.JWT_SECRET || 'todo-app-secret-change-in-production';
const JWT_EXPIRES_IN = '24h';

export class AuthService {
  constructor(private db: Database.Database) {}

  register(input: RegisterInput): { user: UserPublic; token: string } {
    // Check if email already exists
    const existingEmail = this.db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(input.email) as any;
    if (existingEmail) {
      throw new AuthError('Email already registered');
    }

    // Check if username already exists
    const existingUsername = this.db
      .prepare('SELECT id FROM users WHERE username = ?')
      .get(input.username) as any;
    if (existingUsername) {
      throw new AuthError('Username already taken');
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const passwordHash = this.hashPassword(input.password);

    this.db.prepare(`
      INSERT INTO users (id, email, username, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.email.toLowerCase(), input.username, passwordHash, now, now);

    const user: UserPublic = {
      id,
      email: input.email.toLowerCase(),
      username: input.username,
      createdAt: now,
    };

    const token = this.generateToken(user);
    return { user, token };
  }

  login(input: LoginInput): { user: UserPublic; token: string } {
    const row = this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(input.email.toLowerCase()) as any;

    if (!row) {
      throw new AuthError('Invalid email or password');
    }

    const isValid = this.verifyPassword(input.password, row.password_hash);
    if (!isValid) {
      throw new AuthError('Invalid email or password');
    }

    const user: UserPublic = {
      id: row.id,
      email: row.email,
      username: row.username,
      createdAt: row.created_at,
    };

    const token = this.generateToken(user);
    return { user, token };
  }

  verifyToken(token: string): AuthTokenPayload {
    try {
      return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    } catch {
      throw new AuthError('Invalid or expired token');
    }
  }

  getUserById(id: string): UserPublic | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      createdAt: row.created_at,
    };
  }

  getUserByEmail(email: string): UserPublic | null {
    const row = this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(email.toLowerCase()) as any;
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      createdAt: row.created_at,
    };
  }

  searchUsers(query: string, excludeUserId: string): UserPublic[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM users 
         WHERE id != ? AND (username LIKE ? OR email LIKE ?) 
         LIMIT 10`
      )
      .all(excludeUserId, `%${query}%`, `%${query}%`) as any[];
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      username: row.username,
      createdAt: row.created_at,
    }));
  }

  private hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  private verifyPassword(password: string, stored: string): boolean {
    const [salt, hash] = stored.split(':');
    const verifyHash = crypto.scryptSync(password, salt, 64).toString('hex');
    return hash === verifyHash;
  }

  private generateToken(user: UserPublic): string {
    const payload: AuthTokenPayload = {
      userId: user.id,
      email: user.email,
      username: user.username,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}
