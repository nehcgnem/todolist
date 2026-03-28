export enum TodoStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
}

export enum TodoPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum RecurrencePattern {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  CUSTOM = 'custom',
}

export interface Todo {
  id: string;
  name: string;
  description: string;
  dueDate: string | null;
  status: TodoStatus;
  priority: TodoPriority;
  recurrencePattern: RecurrencePattern | null;
  recurrenceInterval: number | null; // for custom: every N days
  parentRecurringId: string | null; // links to the original recurring task
  version: number; // optimistic locking
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TodoDependency {
  todoId: string;
  dependsOnId: string;
}

export interface CreateTodoInput {
  name: string;
  description?: string;
  dueDate?: string | null;
  status?: TodoStatus;
  priority?: TodoPriority;
  recurrencePattern?: RecurrencePattern | null;
  recurrenceInterval?: number | null;
  parentRecurringId?: string | null;
  dependsOn?: string[];
}

export interface UpdateTodoInput {
  name?: string;
  description?: string;
  dueDate?: string | null;
  status?: TodoStatus;
  priority?: TodoPriority;
  recurrencePattern?: RecurrencePattern | null;
  recurrenceInterval?: number | null;
  dependsOn?: string[];
  version: number; // required for optimistic locking
}

export interface TodoFilter {
  status?: TodoStatus | TodoStatus[];
  priority?: TodoPriority | TodoPriority[];
  dueDateFrom?: string;
  dueDateTo?: string;
  dependencyStatus?: 'blocked' | 'unblocked';
  includeDeleted?: boolean;
  search?: string;
}

export interface TodoSort {
  field: 'dueDate' | 'priority' | 'status' | 'name' | 'createdAt';
  direction: 'asc' | 'desc';
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TodoWithDependencies extends Todo {
  dependsOn: string[];
  isBlocked: boolean;
}
