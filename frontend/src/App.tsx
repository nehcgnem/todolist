import { useState } from 'react';
import { useTodos } from './hooks/useTodos';
import { TodoForm } from './components/TodoForm';
import { TodoItem } from './components/TodoItem';
import { FilterBar } from './components/FilterBar';
import { Pagination } from './components/Pagination';
import type { Todo } from './types/todo';
import './App.css';

function App() {
  const {
    todos,
    total,
    page,
    totalPages,
    loading,
    error,
    filters,
    updateFilters,
    refresh,
  } = useTodos();

  const [showForm, setShowForm] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);

  const handleCreate = () => {
    setEditingTodo(null);
    setShowForm(true);
  };

  const handleEdit = (todo: Todo) => {
    setEditingTodo(todo);
    setShowForm(true);
  };

  const handleSaved = () => {
    setShowForm(false);
    setEditingTodo(null);
    refresh();
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingTodo(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>TODO List</h1>
        <button className="btn btn-primary" onClick={handleCreate}>
          + New TODO
        </button>
      </header>

      <FilterBar filters={filters} onFilterChange={updateFilters} />

      {error && <div className="error-banner">{error}</div>}

      <div className="todo-list">
        {loading && todos.length === 0 && <div className="loading">Loading...</div>}

        {!loading && todos.length === 0 && (
          <div className="empty-state">
            <p>No TODOs found. Create one to get started!</p>
          </div>
        )}

        {todos.map((todo) => (
          <TodoItem key={todo.id} todo={todo} onEdit={handleEdit} onRefresh={refresh} />
        ))}
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        onPageChange={(p) => updateFilters({ page: p })}
      />

      {showForm && (
        <TodoForm
          todo={editingTodo}
          allTodos={todos}
          onSaved={handleSaved}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}

export default App;
