import type { Todo, PaginatedResult, TodoFilters, AuthResponse, User, TodoShare } from '../types/todo';

const API_BASE = '/api';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: getAuthHeaders(),
    ...options,
  });

  if (res.status === 401) {
    // Token expired or invalid - clear auth state
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    window.dispatchEvent(new Event('auth:logout'));
    throw new Error('Session expired. Please log in again.');
  }

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

// Auth API
export const authApi = {
  register(data: { email: string; username: string; password: string }): Promise<AuthResponse> {
    return request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  login(data: { email: string; password: string }): Promise<AuthResponse> {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  me(): Promise<User> {
    return request('/auth/me');
  },
};

// Todo API
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

  // Sharing
  getShares(todoId: string): Promise<TodoShare[]> {
    return request(`/todos/${todoId}/shares`);
  },

  shareTodo(todoId: string, data: { sharedWithEmail: string; role: string }): Promise<TodoShare> {
    return request(`/todos/${todoId}/shares`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateShare(todoId: string, shareId: string, data: { role: string }): Promise<TodoShare> {
    return request(`/todos/${todoId}/shares/${shareId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  removeShare(todoId: string, shareId: string): Promise<void> {
    return request(`/todos/${todoId}/shares/${shareId}`, { method: 'DELETE' });
  },
};
