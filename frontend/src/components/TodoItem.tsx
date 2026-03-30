import { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { TodoStatus } from '../types/todo';
import type { Todo } from '../types/todo';
import { todoApi } from '../api/todoApi';
import { useAuth } from '../hooks/useAuth';

interface TodoItemProps {
  todo: Todo;
  allTodos: Todo[];
  onEdit: (todo: Todo) => void;
  onRefresh: () => void;
  onShare: (todo: Todo) => void;
  isDragOverlay?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
  archived: 'Archived',
};

const STATUS_ICONS: Record<string, string> = {
  not_started: '\u25cb',   // empty circle
  in_progress: '\u25d4',   // half circle
  completed: '\u2714',     // checkmark
  archived: '\u2716',      // X
};

const PRIORITY_COLORS: Record<string, string> = {
  high: '#e74c3c',
  medium: '#f39c12',
  low: '#27ae60',
};

export function TodoItem({ todo, allTodos, onEdit, onRefresh, onShare, isDragOverlay }: TodoItemProps) {
  const { user } = useAuth();
  const isOwner = todo.userId === user?.id;
  const canEdit = isOwner || todo.shareRole === 'editor';
  const [removingDep, setRemovingDep] = useState<string | null>(null);

  // Draggable (drag source)
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableRef,
    transform,
    isDragging,
  } = useDraggable({
    id: todo.id,
    data: { type: 'todo', todo },
  });

  // Droppable (drop target for dependency linking)
  const { isOver, setNodeRef: setDroppableRef } = useDroppable({
    id: `drop-${todo.id}`,
    data: { type: 'todo', todo },
  });

  const style = isDragOverlay
    ? { opacity: 0.9 }
    : {
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        opacity: isDragging ? 0.3 : 1,
      };

  // Merge draggable + droppable refs onto the same element
  const setRefs = (el: HTMLDivElement | null) => {
    setDraggableRef(el);
    setDroppableRef(el);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${todo.name}"? It can be restored later.`)) return;
    try {
      await todoApi.delete(todo.id);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleQuickStatus = async (newStatus: TodoStatus) => {
    try {
      await todoApi.update(todo.id, { status: newStatus, version: todo.version });
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRemoveDependency = async (depId: string) => {
    setRemovingDep(depId);
    try {
      const newDeps = todo.dependsOn.filter((id) => id !== depId);
      await todoApi.update(todo.id, { dependsOn: newDeps, version: todo.version });
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRemovingDep(null);
    }
  };

  const isOverdue =
    todo.dueDate &&
    new Date(todo.dueDate) < new Date() &&
    todo.status !== TodoStatus.COMPLETED &&
    todo.status !== TodoStatus.ARCHIVED;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '\u2014';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Resolve dependency IDs to full todo objects
  const resolvedDeps = todo.dependsOn
    .map((depId) => allTodos.find((t) => t.id === depId))
    .filter((t): t is Todo => t !== undefined);

  // Separate blocking (incomplete) and completed dependencies
  const blockingDeps = resolvedDeps.filter(
    (d) => d.status !== TodoStatus.COMPLETED && !d.isDeleted
  );
  const completedDeps = resolvedDeps.filter(
    (d) => d.status === TodoStatus.COMPLETED
  );
  // IDs that we couldn't resolve (e.g. on a different page)
  const unresolvedCount = todo.dependsOn.length - resolvedDeps.length;

  return (
    <div
      ref={setRefs}
      style={style}
      className={`todo-item ${todo.status} ${isOverdue ? 'overdue' : ''} ${todo.isBlocked ? 'blocked' : ''} ${isOver ? 'drop-target' : ''} ${isDragOverlay ? 'drag-overlay' : ''}`}
    >
      {isOver && !isDragOverlay && (
        <div className="drop-zone-label">Drop to add dependency</div>
      )}

      <div className="drag-handle" {...attributes} {...listeners}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="5" cy="3" r="1.5" />
          <circle cx="11" cy="3" r="1.5" />
          <circle cx="5" cy="8" r="1.5" />
          <circle cx="11" cy="8" r="1.5" />
          <circle cx="5" cy="13" r="1.5" />
          <circle cx="11" cy="13" r="1.5" />
        </svg>
      </div>

      <div className="todo-item-main">
        <div className="todo-item-header">
          <span
            className="priority-badge"
            style={{ backgroundColor: PRIORITY_COLORS[todo.priority] }}
          >
            {todo.priority.toUpperCase()}
          </span>
          <span className={`status-badge status-${todo.status}`}>
            {STATUS_LABELS[todo.status]}
          </span>
          {todo.isBlocked && (
            <span className="blocked-badge" title={`Blocked by: ${blockingDeps.map(d => d.name).join(', ')}`}>
              BLOCKED ({blockingDeps.length})
            </span>
          )}
          {todo.recurrencePattern && (
            <span className="recurrence-badge">
              Recurring: {todo.recurrencePattern}
              {todo.recurrencePattern === 'custom' && todo.recurrenceInterval
                ? ` (every ${todo.recurrenceInterval}d)`
                : ''}
            </span>
          )}
          {isOverdue && <span className="overdue-badge">OVERDUE</span>}
          {!isOwner && todo.shareRole && (
            <span className="share-role-indicator">
              Shared ({todo.shareRole})
            </span>
          )}
        </div>

        <h3 className="todo-item-name">{todo.name}</h3>

        {todo.description && (
          <p className="todo-item-description">{todo.description}</p>
        )}

        {/* Inline dependency chips */}
        {todo.dependsOn.length > 0 && (
          <div className="todo-dep-section">
            <span className="todo-dep-label">Depends on:</span>
            <div className="todo-dep-chips">
              {blockingDeps.map((dep) => (
                <span
                  key={dep.id}
                  className="dep-chip dep-chip-blocking"
                  title={`${dep.name} (${STATUS_LABELS[dep.status]}) - blocking`}
                >
                  <span className="dep-chip-icon">{STATUS_ICONS[dep.status]}</span>
                  <span className="dep-chip-name">
                    {dep.name.length > 30 ? dep.name.slice(0, 30) + '...' : dep.name}
                  </span>
                  {canEdit && (
                    <button
                      className="dep-chip-remove"
                      onClick={() => handleRemoveDependency(dep.id)}
                      disabled={removingDep === dep.id}
                      title="Remove dependency"
                      aria-label={`Remove dependency on ${dep.name}`}
                    >
                      {removingDep === dep.id ? '...' : '\u00d7'}
                    </button>
                  )}
                </span>
              ))}
              {completedDeps.map((dep) => (
                <span
                  key={dep.id}
                  className="dep-chip dep-chip-completed"
                  title={`${dep.name} (Completed)`}
                >
                  <span className="dep-chip-icon">{STATUS_ICONS[dep.status]}</span>
                  <span className="dep-chip-name">
                    {dep.name.length > 30 ? dep.name.slice(0, 30) + '...' : dep.name}
                  </span>
                  {canEdit && (
                    <button
                      className="dep-chip-remove"
                      onClick={() => handleRemoveDependency(dep.id)}
                      disabled={removingDep === dep.id}
                      title="Remove dependency"
                      aria-label={`Remove dependency on ${dep.name}`}
                    >
                      {removingDep === dep.id ? '...' : '\u00d7'}
                    </button>
                  )}
                </span>
              ))}
              {unresolvedCount > 0 && (
                <span className="dep-chip dep-chip-unresolved" title="Dependencies not on this page">
                  +{unresolvedCount} more
                </span>
              )}
            </div>
          </div>
        )}

        <div className="todo-item-meta">
          <span>Due: {formatDate(todo.dueDate)}</span>
          {todo.shares && todo.shares.length > 0 && (
            <span>Shared with {todo.shares.length} user{todo.shares.length > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      <div className="todo-item-actions">
        {canEdit && todo.status === TodoStatus.NOT_STARTED && !todo.isBlocked && (
          <button
            className="btn btn-small btn-start"
            onClick={() => handleQuickStatus(TodoStatus.IN_PROGRESS)}
          >
            Start
          </button>
        )}
        {canEdit && todo.status === TodoStatus.IN_PROGRESS && (
          <button
            className="btn btn-small btn-complete"
            onClick={() => handleQuickStatus(TodoStatus.COMPLETED)}
          >
            Complete
          </button>
        )}
        {canEdit && (
          <button className="btn btn-small btn-edit" onClick={() => onEdit(todo)}>
            Edit
          </button>
        )}
        {isOwner && (
          <button className="btn btn-small btn-share" onClick={() => onShare(todo)}>
            Share
          </button>
        )}
        {canEdit && (
          <button className="btn btn-small btn-delete" onClick={handleDelete}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
