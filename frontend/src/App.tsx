import { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useAuth } from './hooks/useAuth';
import { useTodos } from './hooks/useTodos';
import { AuthPage } from './components/AuthPage';
import { TodoForm } from './components/TodoForm';
import { TodoItem } from './components/TodoItem';
import { FilterBar } from './components/FilterBar';
import { Pagination } from './components/Pagination';
import { ShareDialog } from './components/ShareDialog';
import { DependencyOverlay } from './components/DependencyOverlay';
import { todoApi } from './api/todoApi';
import type { Todo } from './types/todo';
import './App.css';

function AppContent() {
  const { user, logout } = useAuth();
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
  const [sharingTodo, setSharingTodo] = useState<Todo | null>(null);
  const [activeDrag, setActiveDrag] = useState<Todo | null>(null);
  const [dependencyFeedback, setDependencyFeedback] = useState<string | null>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const handleCreate = () => {
    setEditingTodo(null);
    setShowForm(true);
  };

  const handleEdit = (todo: Todo) => {
    setEditingTodo(todo);
    setShowForm(true);
  };

  const handleShare = (todo: Todo) => {
    setSharingTodo(todo);
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

  // Drag and drop handlers for dependency linking
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const todo = event.active.data.current?.todo as Todo | undefined;
    if (todo) {
      setActiveDrag(todo);
    }
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDrag(null);
      setDependencyFeedback(null);

      const { active, over } = event;
      if (!over) return;

      const droppedOnData = over.data.current;
      if (droppedOnData?.type !== 'todo') return;

      const draggedTodoId = active.id as string;
      const targetTodo = droppedOnData.todo as Todo;
      const targetTodoId = targetTodo.id;

      // Ignore drop on self
      if (draggedTodoId === targetTodoId) return;

      const draggedTodo = todos.find((t) => t.id === draggedTodoId);
      if (!draggedTodo) return;

      // Dependency direction: target depends on dragged task
      // (drop A onto B = B now depends on A)
      if (targetTodo.dependsOn.includes(draggedTodoId)) {
        setDependencyFeedback(`"${targetTodo.name}" already depends on "${draggedTodo.name}"`);
        setTimeout(() => setDependencyFeedback(null), 3000);
        return;
      }

      try {
        const newDeps = [...targetTodo.dependsOn, draggedTodoId];
        await todoApi.update(targetTodoId, {
          dependsOn: newDeps,
          version: targetTodo.version,
        });
        setDependencyFeedback(
          `Dependency added: "${targetTodo.name}" now depends on "${draggedTodo.name}"`
        );
        setTimeout(() => setDependencyFeedback(null), 3000);
        refresh();
      } catch (err: any) {
        setDependencyFeedback(`Failed: ${err.message}`);
        setTimeout(() => setDependencyFeedback(null), 4000);
      }
    },
    [todos, refresh]
  );

  return (
    <div className="app">
      <header className="app-header">
        <h1>Task Dashboard</h1>
        <div className="header-right">
          <span className="user-info">
            Signed in as <strong>{user?.username}</strong>
          </span>
          <button className="btn btn-primary" onClick={handleCreate}>
            + New TODO
          </button>
          <button className="btn btn-secondary" onClick={logout}>
            Sign Out
          </button>
        </div>
      </header>

      <FilterBar filters={filters} onFilterChange={updateFilters} />

      {error && <div className="error-banner">{error}</div>}
      {dependencyFeedback && (
        <div className={`dependency-feedback ${dependencyFeedback.startsWith('Failed') ? 'error' : 'success'}`}>
          {dependencyFeedback}
        </div>
      )}

      <div className="dnd-instructions">
        <span className="dnd-instructions-icon">{'\u{1f517}'}</span>
        Drag a task and drop it onto another to add it as a dependency. The drop target will depend on the dragged task.
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="todo-list">
          {loading && todos.length === 0 && <div className="loading">Loading...</div>}

          {!loading && todos.length === 0 && (
            <div className="empty-state">
              <p>No TODOs found. Create one to get started!</p>
            </div>
          )}

          {todos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              allTodos={todos}
              onEdit={handleEdit}
              onRefresh={refresh}
              onShare={handleShare}
            />
          ))}
        </div>

        <DragOverlay>
          {activeDrag ? (
            <TodoItem
              todo={activeDrag}
              allTodos={todos}
              onEdit={() => {}}
              onRefresh={() => {}}
              onShare={() => {}}
              isDragOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <DependencyOverlay todos={todos} />

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

      {sharingTodo && (
        <ShareDialog
          todo={sharingTodo}
          onClose={() => setSharingTodo(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return <AppContent />;
}

export default App;
