import { TodoStatus } from '../types/todo';
import type { Todo } from '../types/todo';
import { todoApi } from '../api/todoApi';

interface TodoItemProps {
  todo: Todo;
  onEdit: (todo: Todo) => void;
  onRefresh: () => void;
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

export function TodoItem({ todo, onEdit, onRefresh }: TodoItemProps) {
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
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={`todo-item ${todo.status} ${isOverdue ? 'overdue' : ''} ${todo.isBlocked ? 'blocked' : ''}`}>
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
        </div>
      </div>

      <div className="todo-item-actions">
        {todo.status === TodoStatus.NOT_STARTED && !todo.isBlocked && (
          <button
            className="btn btn-small btn-start"
            onClick={() => handleQuickStatus(TodoStatus.IN_PROGRESS)}
          >
            Start
          </button>
        )}
        {todo.status === TodoStatus.IN_PROGRESS && (
          <button
            className="btn btn-small btn-complete"
            onClick={() => handleQuickStatus(TodoStatus.COMPLETED)}
          >
            Complete
          </button>
        )}
        <button className="btn btn-small btn-edit" onClick={() => onEdit(todo)}>
          Edit
        </button>
        <button className="btn btn-small btn-delete" onClick={handleDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
