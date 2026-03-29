import { useState, useEffect, useCallback } from 'react';
import { todoApi } from '../api/todoApi';
import type { Todo, PaginatedResult, TodoFilters } from '../types/todo';
import { useSocket } from './useSocket';

export function useTodos(initialFilters: TodoFilters = {}) {
  const [result, setResult] = useState<PaginatedResult<Todo>>({
    data: [],
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  });
  const [filters, setFilters] = useState<TodoFilters>({ ...initialFilters, limit: 20 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { on } = useSocket();

  const fetchTodos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await todoApi.list(filters);
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch todos');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  // Listen for real-time events and refresh list
  useEffect(() => {
    const events = [
      'todo:created',
      'todo:updated',
      'todo:deleted',
      'todo:restored',
      'todo:shared',
      'todo:unshared',
      'dependency:changed',
    ];

    const cleanups = events.map((event) =>
      on(event, () => {
        // Refresh list on any change
        fetchTodos();
      })
    );

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [on, fetchTodos]);

  const updateFilters = useCallback((newFilters: Partial<TodoFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters, page: newFilters.page ?? 1 }));
  }, []);

  return {
    todos: result.data,
    total: result.total,
    page: result.page,
    totalPages: result.totalPages,
    loading,
    error,
    filters,
    updateFilters,
    refresh: fetchTodos,
  };
}
