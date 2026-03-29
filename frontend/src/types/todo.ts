export const TodoStatus = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
} as const;
export type TodoStatus = (typeof TodoStatus)[keyof typeof TodoStatus];

export const TodoPriority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const;
export type TodoPriority = (typeof TodoPriority)[keyof typeof TodoPriority];

export const RecurrencePattern = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  CUSTOM: 'custom',
} as const;
export type RecurrencePattern = (typeof RecurrencePattern)[keyof typeof RecurrencePattern];

export const ShareRole = {
  VIEWER: 'viewer',
  EDITOR: 'editor',
} as const;
export type ShareRole = (typeof ShareRole)[keyof typeof ShareRole];

export interface User {
  id: string;
  email: string;
  username: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface TodoShare {
  id: string;
  todoId: string;
  ownerId: string;
  sharedWithId: string;
  sharedWithUsername: string;
  sharedWithEmail: string;
  role: ShareRole;
  createdAt: string;
}

export interface Todo {
  id: string;
  userId: string;
  name: string;
  description: string;
  dueDate: string | null;
  status: TodoStatus;
  priority: TodoPriority;
  recurrencePattern: RecurrencePattern | null;
  recurrenceInterval: number | null;
  parentRecurringId: string | null;
  version: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  dependsOn: string[];
  isBlocked: boolean;
  shares?: TodoShare[];
  shareRole?: ShareRole | 'owner';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TodoFilters {
  status?: string;
  priority?: string;
  dependencyStatus?: string;
  includeShared?: boolean;
  search?: string;
  sortField?: string;
  sortDirection?: string;
  page?: number;
  limit?: number;
}
