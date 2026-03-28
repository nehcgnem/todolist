import type { Todo, PaginatedResult, TodoFilters } from '../types/todo';

const API_BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body.message || body.error || `Request failed with status ${res.status}`;
    const error: any = new Error(message);
    error.status = res.status;
    error.body = body;
    throw error;
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const todoApi = {
  list(filters: TodoFilters = {}): Promise<PaginatedResult<Todo>> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.set(key, String(value));
      }
    });
    return request(`/todos?${params.toString()}`);
  },

  get(id: string): Promise<Todo> {
    return request(`/todos/${id}`);
  },

  create(data: Partial<Todo> & { name: string }): Promise<Todo> {
    return request('/todos', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update(id: string, data: Record<string, any>): Promise<Todo> {
    return request(`/todos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete(id: string): Promise<void> {
    return request(`/todos/${id}`, { method: 'DELETE' });
  },

  restore(id: string): Promise<Todo> {
    return request(`/todos/${id}/restore`, { method: 'POST' });
  },
};
