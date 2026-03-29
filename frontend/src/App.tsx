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
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
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

      const draggedTodoId = active.id as string;
      const droppedOnData = over.data.current;

      // Check if dropped on a different todo's drop zone
      if (droppedOnData?.type === 'todo-drop') {
        const targetTodoId = droppedOnData.todoId as string;

        if (draggedTodoId === targetTodoId) return;

        const draggedTodo = todos.find((t) => t.id === draggedTodoId);
        const targetTodo = todos.find((t) => t.id === targetTodoId);

        if (!draggedTodo || !targetTodo) return;

        // Add dependency: dragged todo depends on target todo (drag A onto B = A depends on B)
        // Check if already depends
        if (draggedTodo.dependsOn.includes(targetTodoId)) {
          setDependencyFeedback(`"${draggedTodo.name}" already depends on "${targetTodo.name}"`);
          setTimeout(() => setDependencyFeedback(null), 3000);
          return;
        }

        try {
          const newDeps = [...draggedTodo.dependsOn, targetTodoId];
          await todoApi.update(draggedTodoId, {
            dependsOn: newDeps,
            version: draggedTodo.version,
          });
          setDependencyFeedback(
            `Dependency added: "${draggedTodo.name}" now depends on "${targetTodo.name}"`
          );
          setTimeout(() => setDependencyFeedback(null), 3000);
          refresh();
        } catch (err: any) {
          setDependencyFeedback(`Failed: ${err.message}`);
          setTimeout(() => setDependencyFeedback(null), 4000);
        }
      }
    },
    [todos, refresh]
  );

  return (
    <div className="app">
      <header className="app-header">
        <h1>TODO List</h1>
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
        Drag a task onto another to create a dependency (dragged task will depend on the target).
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={todos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
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
                onEdit={handleEdit}
                onRefresh={refresh}
                onShare={handleShare}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeDrag ? (
            <TodoItem
              todo={activeDrag}
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
