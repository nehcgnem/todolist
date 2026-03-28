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

export interface Todo {
  id: string;
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
  search?: string;
  sortField?: string;
  sortDirection?: string;
  page?: number;
  limit?: number;
}
