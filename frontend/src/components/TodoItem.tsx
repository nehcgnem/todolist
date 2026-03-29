import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import { TodoStatus } from '../types/todo';
import type { Todo } from '../types/todo';
import { todoApi } from '../api/todoApi';
import { useAuth } from '../hooks/useAuth';

interface TodoItemProps {
  todo: Todo;
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

const PRIORITY_COLORS: Record<string, string> = {
  high: '#e74c3c',
  medium: '#f39c12',
  low: '#27ae60',
};

export function TodoItem({ todo, onEdit, onRefresh, onShare, isDragOverlay }: TodoItemProps) {
  const { user } = useAuth();
  const isOwner = todo.userId === user?.id;
  const canEdit = isOwner || todo.shareRole === 'editor';

  // Sortable (for drag)
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: todo.id,
    data: { type: 'todo', todo },
  });

  // Droppable (for dependency drop targets)
  const { isOver, setNodeRef: setDroppableRef } = useDroppable({
    id: `drop-${todo.id}`,
    data: { type: 'todo-drop', todoId: todo.id },
  });

  const style = isDragOverlay
    ? { opacity: 0.9 }
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
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

  // Merge refs
  const setRefs = (el: HTMLDivElement | null) => {
    setSortableRef(el);
    setDroppableRef(el);
  };

  return (
    <div
      ref={setRefs}
      style={style}
      className={`todo-item ${todo.status} ${isOverdue ? 'overdue' : ''} ${todo.isBlocked ? 'blocked' : ''} ${isOver ? 'drop-target' : ''} ${isDragOverlay ? 'drag-overlay' : ''}`}
    >
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
          {todo.isBlocked && <span className="blocked-badge">BLOCKED</span>}
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

        <div className="todo-item-meta">
          <span>Due: {formatDate(todo.dueDate)}</span>
          {todo.dependsOn.length > 0 && (
            <span>Dependencies: {todo.dependsOn.length}</span>
          )}
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
