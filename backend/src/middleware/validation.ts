import { z } from 'zod';
import { TodoStatus, TodoPriority, RecurrencePattern, ShareRole } from '../types/todo';

// Auth schemas
export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128, 'Password too long'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Todo schemas
export const createTodoSchema = z.object({
  name: z.string().min(1, 'Name is required').max(500, 'Name too long'),
  description: z.string().max(5000, 'Description too long').optional().default(''),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
  status: z.nativeEnum(TodoStatus).optional().default(TodoStatus.NOT_STARTED),
  priority: z.nativeEnum(TodoPriority).optional().default(TodoPriority.MEDIUM),
  recurrencePattern: z.nativeEnum(RecurrencePattern).nullable().optional(),
  recurrenceInterval: z.number().int().positive().nullable().optional(),
  dependsOn: z.array(z.string().uuid()).optional().default([]),
});

export const updateTodoSchema = z.object({
  name: z.string().min(1, 'Name is required').max(500, 'Name too long').optional(),
  description: z.string().max(5000, 'Description too long').optional(),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
  status: z.nativeEnum(TodoStatus).optional(),
  priority: z.nativeEnum(TodoPriority).optional(),
  recurrencePattern: z.nativeEnum(RecurrencePattern).nullable().optional(),
  recurrenceInterval: z.number().int().positive().nullable().optional(),
  dependsOn: z.array(z.string().uuid()).optional(),
  version: z.number().int().positive('Version is required for optimistic locking'),
});

export const listTodosQuerySchema = z.object({
  status: z.union([z.nativeEnum(TodoStatus), z.array(z.nativeEnum(TodoStatus))]).optional(),
  priority: z.union([z.nativeEnum(TodoPriority), z.array(z.nativeEnum(TodoPriority))]).optional(),
  dueDateFrom: z.string().optional(),
  dueDateTo: z.string().optional(),
  dependencyStatus: z.enum(['blocked', 'unblocked']).optional(),
  includeDeleted: z.coerce.boolean().optional(),
  includeShared: z.coerce.boolean().optional().default(true),
  search: z.string().optional(),
  sortField: z.enum(['dueDate', 'priority', 'status', 'name', 'createdAt']).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});

// Share schemas
export const shareTodoSchema = z.object({
  sharedWithEmail: z.string().email('Invalid email address'),
  role: z.nativeEnum(ShareRole).default(ShareRole.VIEWER),
});

export const updateShareSchema = z.object({
  role: z.nativeEnum(ShareRole),
});
